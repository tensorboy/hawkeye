//! Utility commands

use tauri::command;

/// Open a URL in the default browser
#[command]
pub async fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}
