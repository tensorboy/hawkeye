//! Rust wrapper for the Swift ANE CLI tool (hawkeye-ane)

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

use crate::event_sink::SharedSink;
use crate::events;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingResult {
    pub final_loss: f32,
    pub epochs: u32,
    pub duration_ms: u64,
    pub weights_path: String,
}

/// Locate the hawkeye-ane binary using the same multi-path strategy as swift-ocr
fn find_ane_binary() -> Option<PathBuf> {
    // 1. Compile-time path from build.rs
    if let Some(path) = option_env!("HAWKEYE_ANE_PATH") {
        let p = PathBuf::from(path);
        if p.exists() {
            return Some(p);
        }
    }

    // 2. Next to the current executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("hawkeye-ane");
            if p.exists() {
                return Some(p);
            }
            // 3. macOS .app bundle Resources/
            let p = dir.join("../Resources/hawkeye-ane");
            if p.exists() {
                return Some(p);
            }
        }
    }

    // 4. Dev build paths
    for profile in &["debug", "release"] {
        let pattern = format!("target/{}/build/**/hawkeye-ane", profile);
        if let Ok(entries) = glob::glob(&pattern) {
            for entry in entries.flatten() {
                if entry.exists() {
                    return Some(entry);
                }
            }
        }
    }

    None
}

/// Run training via the Swift ANE CLI tool.
///
/// Takes a [`SharedSink`] (not a Tauri `AppHandle`) so the daemon can drive
/// training the same way the Tauri GUI used to. The Tauri-side caller
/// constructs a `TauriSink` and passes it; the daemon passes its
/// `BroadcastSink` so SSE subscribers receive the training events.
pub async fn run_training(sink: SharedSink, state: Arc<AppState>) -> Result<TrainingResult> {
    // Set training flag
    *state.gaze_training_active.write().await = true;
    sink.emit(events::GAZE_TRAINING_STARTED, serde_json::Value::Null);

    let result = run_training_inner(&state).await;

    // Always clear training flag
    *state.gaze_training_active.write().await = false;

    match &result {
        Ok(r) => {
            // Load trained weights into model state
            let weights_path = PathBuf::from(&r.weights_path);
            match crate::gaze::inference::GazeModel::load(&weights_path) {
                Ok(model) => {
                    *state.gaze_model.write().await = Some(model);
                    sink.emit(events::GAZE_MODEL_READY, serde_json::Value::Null);
                }
                Err(e) => {
                    log::error!("[Gaze] Failed to load trained weights: {}", e);
                }
            }

            state.gaze_buffer.write().await.reset_train_counter();
            sink.emit(
                events::GAZE_TRAINING_COMPLETE,
                serde_json::to_value(r).unwrap_or(serde_json::Value::Null),
            );
        }
        Err(e) => {
            sink.emit(events::GAZE_TRAINING_ERROR, serde_json::Value::String(e.to_string()));
        }
    }

    result
}

async fn run_training_inner(state: &Arc<AppState>) -> Result<TrainingResult> {
    let binary = find_ane_binary().ok_or_else(|| {
        anyhow!("hawkeye-ane binary not found (macOS only, requires Swift compilation)")
    })?;

    // Export samples to temp file
    let buffer = state.gaze_buffer.read().await;
    if buffer.sample_count() < 10 {
        return Err(anyhow!(
            "Not enough samples for training (have {}, need at least 10)",
            buffer.sample_count()
        ));
    }
    let samples_json = buffer.export_json()?;
    drop(buffer);

    let temp_dir = std::env::temp_dir();
    let samples_path = temp_dir.join("hawkeye-gaze-samples.json");
    std::fs::write(&samples_path, &samples_json)?;

    // Determine weights path
    let weights_dir = dirs::data_dir()
        .ok_or_else(|| anyhow!("Could not determine data directory"))?
        .join("hawkeye")
        .join("gaze");
    std::fs::create_dir_all(&weights_dir)?;
    let weights_path = weights_dir.join("gaze_weights.json");

    // Build CLI args
    let mut args = vec![
        "train".to_string(),
        samples_path.to_string_lossy().to_string(),
        weights_path.to_string_lossy().to_string(),
        "--epochs".to_string(),
        "500".to_string(),
        "--lr".to_string(),
        "0.001".to_string(),
    ];

    if weights_path.exists() {
        args.push("--resume".to_string());
    }

    log::info!(
        "[Gaze] Starting ANE training: {} samples, weights at {:?}",
        samples_json.len(),
        weights_path
    );

    // Run Swift CLI
    let output = tokio::process::Command::new(&binary)
        .args(&args)
        .output()
        .await?;

    // Clean up temp file
    let _ = std::fs::remove_file(&samples_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("ANE training failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: TrainingResult = serde_json::from_str(&stdout)
        .map_err(|e| anyhow!("Failed to parse training result: {} (output: {})", e, stdout))?;

    log::info!(
        "[Gaze] Training complete: loss={:.6}, epochs={}, duration={}ms",
        result.final_loss,
        result.epochs,
        result.duration_ms
    );

    Ok(result)
}

/// Check if ANE is available on this system
pub fn is_available() -> bool {
    find_ane_binary().is_some()
}

/// Get the weights file path
pub fn weights_path() -> Option<PathBuf> {
    crate::gaze::inference::GazeModel::default_path()
}
