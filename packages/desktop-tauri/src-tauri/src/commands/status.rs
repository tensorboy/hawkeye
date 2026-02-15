//! Status command

use serde::Serialize;
use std::sync::Arc;
use tauri::{command, State};

use crate::state::AppState;

/// Application status
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HawkeyeStatus {
    pub initialized: bool,
    pub ai_ready: bool,
    pub ai_provider: Option<String>,
    pub observe_running: bool,
}

/// Get application status
#[command]
pub async fn get_status(state: State<'_, Arc<AppState>>) -> Result<HawkeyeStatus, String> {
    let ai = state.ai_client.read().await;
    let ai_ready = ai.is_some();
    let active_provider = ai.as_ref().map(|c| c.provider_name().to_string());
    drop(ai);

    let config = state.config.read().await;
    let provider = active_provider.unwrap_or_else(|| config.ai_provider.clone());
    drop(config);

    let observe_running = state.observe_loop.read().await.is_some();

    Ok(HawkeyeStatus {
        initialized: true,
        ai_ready,
        ai_provider: Some(provider),
        observe_running,
    })
}
