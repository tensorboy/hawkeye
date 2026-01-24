//! Tauri commands - IPC handlers
//!
//! These commands are called from the frontend via Tauri's invoke system.

use serde::{Deserialize, Serialize};
use tauri::command;

use crate::config::AppConfig;
use crate::perception;

/// Application status
#[derive(Debug, Clone, Serialize)]
pub struct HawkeyeStatus {
    pub initialized: bool,
    pub ai_ready: bool,
    pub ai_provider: Option<String>,
    pub sync_running: bool,
    pub sync_port: Option<u16>,
    pub connected_clients: u32,
}

/// Get application status
#[command]
pub async fn get_status() -> Result<HawkeyeStatus, String> {
    Ok(HawkeyeStatus {
        initialized: true,
        ai_ready: true,
        ai_provider: Some("gemini".to_string()),
        sync_running: false,
        sync_port: None,
        connected_clients: 0,
    })
}

/// Load application configuration
#[command]
pub async fn load_config() -> Result<AppConfig, String> {
    crate::config::load_config().map_err(|e| e.to_string())
}

/// Save application configuration
#[command]
pub async fn save_config(config: AppConfig) -> Result<(), String> {
    crate::config::save_config(&config).map_err(|e| e.to_string())
}

/// Screen capture result
#[derive(Debug, Clone, Serialize)]
pub struct ScreenshotResult {
    pub success: bool,
    pub data_url: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub error: Option<String>,
}

/// Capture the current screen
#[command]
pub async fn capture_screen() -> Result<ScreenshotResult, String> {
    match perception::capture_screenshot().await {
        Ok((data, width, height)) => Ok(ScreenshotResult {
            success: true,
            data_url: Some(format!("data:image/png;base64,{}", data)),
            width: Some(width),
            height: Some(height),
            error: None,
        }),
        Err(e) => Ok(ScreenshotResult {
            success: false,
            data_url: None,
            width: None,
            height: None,
            error: Some(e.to_string()),
        }),
    }
}

/// OCR result
#[derive(Debug, Clone, Serialize)]
pub struct OcrResult {
    pub success: bool,
    pub text: Option<String>,
    pub duration_ms: u64,
    pub backend: String,
    pub error: Option<String>,
}

/// Run OCR on a base64-encoded image
#[command]
pub async fn run_ocr(image_base64: String) -> Result<OcrResult, String> {
    let start = std::time::Instant::now();

    match perception::run_ocr(&image_base64).await {
        Ok(text) => Ok(OcrResult {
            success: true,
            text: Some(text),
            duration_ms: start.elapsed().as_millis() as u64,
            backend: "vision".to_string(),
            error: None,
        }),
        Err(e) => Ok(OcrResult {
            success: false,
            text: None,
            duration_ms: start.elapsed().as_millis() as u64,
            backend: "vision".to_string(),
            error: Some(e.to_string()),
        }),
    }
}

/// Get clipboard content
#[command]
pub async fn get_clipboard() -> Result<Option<String>, String> {
    perception::get_clipboard_content().await.map_err(|e| e.to_string())
}

/// Active window info
#[derive(Debug, Clone, Serialize)]
pub struct WindowInfo {
    pub app_name: String,
    pub title: String,
    pub bundle_id: Option<String>,
}

/// Get the currently active window
#[command]
pub async fn get_active_window() -> Result<Option<WindowInfo>, String> {
    perception::get_active_window().await.map_err(|e| e.to_string())
}

/// Chat message
#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Chat with AI
#[command]
pub async fn chat(messages: Vec<ChatMessage>) -> Result<String, String> {
    // TODO: Implement AI chat via HTTP client
    // For now, return a placeholder
    Ok("Hello! This is a placeholder response from Hawkeye Tauri.".to_string())
}

/// Observe current context (screenshot + OCR + window info)
#[command]
pub async fn observe() -> Result<(), String> {
    // TODO: Implement full observation pipeline
    Ok(())
}

/// Open a URL in the default browser
#[command]
pub async fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}
