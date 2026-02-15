//! Configuration commands

use std::sync::Arc;
use tauri::{command, State};

use crate::config::AppConfig;
use crate::state::AppState;

/// Load application configuration
#[command]
pub async fn load_config(state: State<'_, Arc<AppState>>) -> Result<AppConfig, String> {
    let config = state.config.read().await;
    Ok(config.clone())
}

/// Save application configuration
#[command]
pub async fn save_config(
    config: AppConfig,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    // Hold write lock during both operations to prevent concurrent save races
    let mut current = state.config.write().await;

    // Persist to disk first (if this fails, memory stays unchanged)
    crate::config::save_config(&config).map_err(|e| e.to_string())?;

    // Update in-memory state
    *current = config;

    Ok(())
}
