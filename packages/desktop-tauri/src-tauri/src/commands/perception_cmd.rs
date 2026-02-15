//! Perception commands — screen capture, OCR, clipboard, window

use serde::Serialize;
use tauri::command;

use crate::perception;

/// Screen capture result
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
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
    match perception::screen::capture_screenshot().await {
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
#[serde(rename_all = "camelCase")]
pub struct OcrResultResponse {
    pub success: bool,
    pub text: Option<String>,
    pub duration_ms: u64,
    pub backend: String,
    pub error: Option<String>,
}

/// Run OCR on a base64-encoded image
#[command]
pub async fn run_ocr(image_base64: String) -> Result<OcrResultResponse, String> {
    match perception::ocr::run_ocr(&image_base64).await {
        Ok(result) => Ok(OcrResultResponse {
            success: true,
            text: Some(result.text),
            duration_ms: result.duration_ms,
            backend: result.backend,
            error: None,
        }),
        Err(e) => Ok(OcrResultResponse {
            success: false,
            text: None,
            duration_ms: 0,
            backend: "none".to_string(),
            error: Some(e.to_string()),
        }),
    }
}

/// Get clipboard content
#[command]
pub async fn get_clipboard() -> Result<Option<String>, String> {
    // Clipboard access via Tauri plugin — needs app handle
    // Will be properly wired in a future step
    Ok(None)
}

/// Active window info response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfoResponse {
    pub app_name: String,
    pub title: String,
    pub bundle_id: Option<String>,
}

/// Get the currently active window
#[command]
pub async fn get_active_window() -> Result<Option<WindowInfoResponse>, String> {
    match perception::window::get_active_window().await {
        Ok(Some(info)) => Ok(Some(WindowInfoResponse {
            app_name: info.app_name,
            title: info.title,
            bundle_id: info.bundle_id,
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
