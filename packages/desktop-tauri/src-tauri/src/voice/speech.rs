//! Speech recognition via macOS SFSpeechRecognizer (Swift CLI helper)

use serde::{Deserialize, Serialize};
use std::process::Command;

/// Result from speech recognition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechResult {
    pub text: String,
    pub is_final: bool,
    pub confidence: f32,
    pub language: String,
    pub duration_ms: i64,
}

/// Speech recognition availability status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechStatus {
    pub available: bool,
    pub authorized: bool,
    pub locale: String,
}

/// Get the path to the compiled Swift speech helper
fn speech_binary_path() -> Option<String> {
    option_env!("HAWKEYE_SPEECH_PATH").map(|s| s.to_string())
}

/// Check if speech recognition is available
pub async fn check_status() -> Result<SpeechStatus, anyhow::Error> {
    let binary = speech_binary_path()
        .ok_or_else(|| anyhow::anyhow!("Speech binary not compiled (macOS only)"))?;

    let output = tokio::task::spawn_blocking(move || {
        Command::new(&binary).arg("status").output()
    })
    .await??;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("Speech status check failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let status: SpeechStatus = serde_json::from_str(&stdout)?;
    Ok(status)
}

/// Transcribe from microphone for specified duration
pub async fn listen(duration_secs: u32) -> Result<SpeechResult, anyhow::Error> {
    let binary = speech_binary_path()
        .ok_or_else(|| anyhow::anyhow!("Speech binary not compiled (macOS only)"))?;

    let duration = duration_secs.to_string();
    let output = tokio::task::spawn_blocking(move || {
        Command::new(&binary)
            .args(["listen", &duration])
            .output()
    })
    .await??;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("Speech listen failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: SpeechResult = serde_json::from_str(&stdout)?;
    Ok(result)
}

/// Transcribe an audio file
pub async fn transcribe_file(audio_path: &str) -> Result<SpeechResult, anyhow::Error> {
    let binary = speech_binary_path()
        .ok_or_else(|| anyhow::anyhow!("Speech binary not compiled (macOS only)"))?;

    let path = audio_path.to_string();
    let output = tokio::task::spawn_blocking(move || {
        Command::new(&binary)
            .args(["file", &path])
            .output()
    })
    .await??;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("Speech transcription failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: SpeechResult = serde_json::from_str(&stdout)?;
    Ok(result)
}
