//! Auto-updater commands — check for updates, download, and install

use std::sync::Arc;
use tauri::{command, AppHandle, Emitter, State};
use tauri_plugin_updater::UpdaterExt;

use crate::events;
use crate::state::AppState;

/// Update check result
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub available: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub release_notes: Option<String>,
    pub download_url: Option<String>,
}

/// Check for updates
#[command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current_version = app
        .config()
        .version
        .clone()
        .unwrap_or_else(|| "0.1.0".to_string());

    let updater = app.updater().map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(update)) => {
            let latest = update.version.clone();
            let notes = update.body.clone();

            log::info!(
                "[Updater] Update available: {} -> {}",
                current_version,
                latest
            );

            let _ = app.emit(events::UPDATE_AVAILABLE, &latest);

            Ok(UpdateCheckResult {
                available: true,
                current_version,
                latest_version: Some(latest),
                release_notes: notes,
                download_url: None,
            })
        }
        Ok(None) => {
            log::info!("[Updater] No update available (current: {})", current_version);
            Ok(UpdateCheckResult {
                available: false,
                current_version,
                latest_version: None,
                release_notes: None,
                download_url: None,
            })
        }
        Err(e) => {
            log::warn!("[Updater] Check failed: {}", e);
            Err(format!("Update check failed: {}", e))
        }
    }
}

/// Download and install update
#[command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;

    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available".to_string())?;

    log::info!("[Updater] Downloading update v{}...", update.version);
    let _ = app.emit(events::UPDATE_DOWNLOADING, &update.version);

    // Download the update bytes
    let bytes = update
        .download(
            |chunk_length, content_length| {
                let progress = if let Some(total) = content_length {
                    (chunk_length as f64 / total as f64 * 100.0) as u32
                } else {
                    0
                };
                let _ = app.emit(events::UPDATE_PROGRESS, progress);
            },
            || {
                log::info!("[Updater] Download complete, ready to install");
                let _ = app.emit(events::UPDATE_READY, ());
            },
        )
        .await
        .map_err(|e| format!("Update download failed: {}", e))?;

    // Install the update
    update
        .install(bytes)
        .map_err(|e| format!("Update install failed: {}", e))?;

    log::info!("[Updater] Update installed, restart required");
    Ok(())
}

/// Get current app version
#[command]
pub async fn get_app_version(app: AppHandle) -> Result<String, String> {
    Ok(app
        .config()
        .version
        .clone()
        .unwrap_or_else(|| "0.1.0".to_string()))
}
