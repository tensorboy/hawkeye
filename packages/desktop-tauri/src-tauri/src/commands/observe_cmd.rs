//! Observe commands — start/stop screen monitoring

use std::sync::Arc;
use serde::Serialize;
use tauri::{command, AppHandle, State};

use crate::event_sink::{SharedSink, TauriSink};
use crate::observe::ObserveLoop;
use crate::state::{AppState, ObservationResult};

/// Observe status response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObserveStatus {
    pub running: bool,
    pub last_observation: Option<ObservationResult>,
}

/// Start the observe loop
#[command]
pub async fn start_observe(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    let mut loop_handle = state.observe_loop.write().await;

    if loop_handle.is_some() {
        return Ok(false); // Already running
    }

    // Prefer the pre-installed sink; fall back to a fresh TauriSink so
    // command callers don't have to wait for setup-time initialization.
    let sink: SharedSink = state
        .event_sink
        .read()
        .await
        .clone()
        .unwrap_or_else(|| -> SharedSink { Arc::new(TauriSink::new(app)) });

    let observe = ObserveLoop::start(
        sink,
        Arc::clone(&state),
        3000,  // 3s interval
        0.05,  // 5% change threshold
    );

    *loop_handle = Some(observe);
    log::info!("[Observe] Started");
    Ok(true)
}

/// Stop the observe loop
#[command]
pub async fn stop_observe(
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    let mut loop_handle = state.observe_loop.write().await;

    if let Some(observe) = loop_handle.take() {
        observe.stop();
        log::info!("[Observe] Stopped");
        Ok(true)
    } else {
        Ok(false) // Not running
    }
}

/// Get observe status
#[command]
pub async fn get_observe_status(
    state: State<'_, Arc<AppState>>,
) -> Result<ObserveStatus, String> {
    let running = state.observe_loop.read().await.is_some();
    let last_observation = state.last_observation.read().await.clone();

    Ok(ObserveStatus {
        running,
        last_observation,
    })
}
