//! Observe loop — background tokio task for screen monitoring

use std::sync::Arc;
use tokio::sync::watch;

use tauri::{AppHandle, Emitter};

use crate::events;
use crate::observe::change_detector;
use crate::perception;
use crate::state::{AppState, ObservationResult};

/// Handle to a running observe loop
pub struct ObserveLoop {
    stop_tx: watch::Sender<bool>,
}

impl ObserveLoop {
    /// Start the observe loop as a background task
    pub fn start(
        app: AppHandle,
        state: Arc<AppState>,
        interval_ms: u64,
        threshold: f64,
    ) -> Self {
        let (stop_tx, stop_rx) = watch::channel(false);

        tokio::spawn(async move {
            run_loop(app, state, stop_rx, interval_ms, threshold).await;
        });

        Self { stop_tx }
    }

    /// Stop the observe loop
    pub fn stop(&self) {
        let _ = self.stop_tx.send(true);
    }
}

async fn run_loop(
    app: AppHandle,
    state: Arc<AppState>,
    mut stop_rx: watch::Receiver<bool>,
    _initial_interval_ms: u64,
    threshold: f64,
) {
    log::info!("[Observe] Loop started (adaptive, threshold={})", threshold);

    let mut last_hash: Option<u64> = None;

    loop {
        // Get adaptive interval
        let sleep_ms = {
            let mut ar = state.adaptive_refresh.write().await;
            ar.current_interval_ms()
        };

        tokio::select! {
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(sleep_ms)) => {},
            _ = stop_rx.changed() => {
                if *stop_rx.borrow() {
                    log::info!("[Observe] Loop stopped by signal");
                    let _ = app.emit(events::OBSERVE_STOPPED, ());
                    return;
                }
            }
        }

        // Capture screenshot
        let capture = match perception::screen::capture_screenshot().await {
            Ok(result) => result,
            Err(e) => {
                log::warn!("[Observe] Capture failed: {}", e);
                continue;
            }
        };

        let (base64_data, width, height) = capture;

        // Decode base64 to raw RGBA for hashing
        use base64::{engine::general_purpose::STANDARD, Engine};
        let png_bytes = match STANDARD.decode(&base64_data) {
            Ok(b) => b,
            Err(_) => continue,
        };

        // Load PNG to get raw RGBA pixels
        let rgba_data = match image::load_from_memory(&png_bytes) {
            Ok(img) => img.to_rgba8(),
            Err(_) => continue,
        };

        let current_hash = change_detector::compute_phash(rgba_data.as_raw(), width, height);

        let change_ratio = match last_hash {
            Some(prev) => change_detector::change_ratio(prev, current_hash),
            None => 1.0, // First capture always counts as change
        };

        last_hash = Some(current_hash);

        // Only process if change exceeds threshold
        if change_ratio < threshold {
            continue;
        }

        log::info!("[Observe] Change detected (ratio={:.2})", change_ratio);
        let _ = app.emit(events::OBSERVE_CHANGE, change_ratio);

        // Record activity for adaptive refresh
        {
            let mut ar = state.adaptive_refresh.write().await;
            ar.record_activity(super::adaptive_refresh::ActivityEventType::ScreenChange);
        }

        // Get active window
        let window_info = perception::window::get_active_window().await.ok().flatten();

        // Run OCR
        let ocr_text = match perception::ocr::run_ocr(&base64_data).await {
            Ok(result) => Some(result.text),
            Err(e) => {
                log::warn!("[Observe] OCR failed: {}", e);
                None
            }
        };

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let window_response = window_info.map(|w| {
            crate::commands::perception_cmd::WindowInfoResponse {
                app_name: w.app_name,
                title: w.title,
                bundle_id: w.bundle_id,
            }
        });

        let observation = ObservationResult {
            screenshot_base64: Some(base64_data),
            ocr_text,
            active_window: window_response,
            change_ratio,
            timestamp,
        };

        // Log activity entry for summarization
        {
            let mut log = state.activity_log.write().await;
            log.push(super::activity_log::ActivityEntry {
                timestamp,
                app_name: observation.active_window.as_ref().map(|w| w.app_name.clone()),
                window_title: observation.active_window.as_ref().map(|w| w.title.clone()),
                ocr_snippet: observation.ocr_text.as_ref().map(|t| t.chars().take(200).collect()),
                change_ratio,
            });
        }

        // Run intent recognition
        {
            let input = super::intent::RecognitionInput {
                app_name: observation.active_window.as_ref().map(|w| w.app_name.clone()),
                window_title: observation.active_window.as_ref().map(|w| w.title.clone()),
                ocr_text: observation.ocr_text.clone(),
                clipboard: None,
            };
            let mut recognizer = state.intent_recognizer.write().await;
            let intents = recognizer.recognize(&input);
            if !intents.is_empty() {
                log::debug!("[Observe] Intents: {:?}", intents.iter().map(|i| &i.description).collect::<Vec<_>>());
                let _ = app.emit(events::INTENT_RECOGNIZED, &intents);
            }
        }

        // Update life tree
        {
            let activity_ctx = crate::life_tree::ActivityContext {
                app_name: observation.active_window.as_ref().map(|w| w.app_name.clone()),
                window_title: observation.active_window.as_ref().map(|w| w.title.clone()),
                ocr_snippet: observation.ocr_text.as_ref().map(|t| t.chars().take(200).collect()),
                timestamp,
            };
            let mut tree = state.life_tree.write().await;
            tree.process_activity(&activity_ctx);
        }

        // Store last observation
        {
            let mut last = state.last_observation.write().await;
            *last = Some(observation.clone());
        }

        // Emit to frontend
        let _ = app.emit(events::OBSERVE_UPDATE, &observation);
    }
}
