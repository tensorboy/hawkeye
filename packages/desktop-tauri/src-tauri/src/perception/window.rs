//! Active window detection

use anyhow::{anyhow, Result};
use serde::Serialize;

/// Active window info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    pub app_name: String,
    pub title: String,
    pub bundle_id: Option<String>,
}

/// Get the currently active window (macOS)
#[cfg(target_os = "macos")]
pub async fn get_active_window() -> Result<Option<WindowInfo>> {
    use std::process::Command;

    let output = Command::new("osascript")
        .args([
            "-e",
            r#"
            tell application "System Events"
                set frontApp to first application process whose frontmost is true
                set appName to name of frontApp
                set windowTitle to ""
                try
                    set windowTitle to name of front window of frontApp
                end try
                return appName & "|||" & windowTitle
            end tell
            "#,
        ])
        .output()
        .map_err(|e| anyhow!("Failed to run osascript: {}", e))?;

    if output.status.success() {
        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let parts: Vec<&str> = result.split("|||").collect();

        if parts.len() >= 2 {
            return Ok(Some(WindowInfo {
                app_name: parts[0].to_string(),
                title: parts[1].to_string(),
                bundle_id: None,
            }));
        }
    }

    Ok(None)
}

#[cfg(not(target_os = "macos"))]
pub async fn get_active_window() -> Result<Option<WindowInfo>> {
    Ok(None)
}
