//! Perception module - Screen capture, OCR, clipboard, window tracking
//!
//! Uses native macOS APIs for optimal performance:
//! - Screen capture via `screenshots` crate
//! - OCR via macOS Vision API (Swift bridge)
//! - Clipboard via Tauri plugin
//! - Window tracking via Accessibility API

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use screenshots::Screen;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

use crate::commands::WindowInfo;

static INITIALIZED: AtomicBool = AtomicBool::new(false);

/// Initialize the perception engine
pub async fn init(_app: &AppHandle) -> Result<()> {
    if INITIALIZED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    println!("[Perception] Initializing...");

    // Test screen capture
    let screens = Screen::all().map_err(|e| anyhow!("Failed to get screens: {}", e))?;
    println!("[Perception] Found {} screen(s)", screens.len());

    println!("[Perception] Initialized successfully!");
    Ok(())
}

/// Capture the primary screen
pub async fn capture_screenshot() -> Result<(String, u32, u32)> {
    let screens = Screen::all().map_err(|e| anyhow!("Failed to get screens: {}", e))?;

    let screen = screens
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("No screen available"))?;

    let image = screen
        .capture()
        .map_err(|e| anyhow!("Failed to capture screen: {}", e))?;

    let width = image.width();
    let height = image.height();

    // Convert to PNG and base64
    let mut png_data = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
    encoder
        .encode(
            image.as_raw(),
            width,
            height,
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| anyhow!("Failed to encode PNG: {}", e))?;

    let base64_data = STANDARD.encode(&png_data);

    Ok((base64_data, width, height))
}

/// Run OCR on a base64-encoded image
///
/// Uses macOS Vision API for accurate text recognition
pub async fn run_ocr(image_base64: &str) -> Result<String> {
    // Decode base64
    let image_data = STANDARD
        .decode(image_base64)
        .map_err(|e| anyhow!("Failed to decode base64: {}", e))?;

    // TODO: Call macOS Vision API via Swift bridge
    // For now, use a placeholder
    // In production, this would use objc2 or swift-bridge to call VNRecognizeTextRequest

    #[cfg(target_os = "macos")]
    {
        // Placeholder for Vision API integration
        // This would typically:
        // 1. Create a VNImageRequestHandler with the image data
        // 2. Create a VNRecognizeTextRequest
        // 3. Perform the request and collect results
        // 4. Return the recognized text

        Ok("OCR text placeholder - Vision API integration pending".to_string())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err(anyhow!("OCR not supported on this platform"))
    }
}

/// Get clipboard content
pub async fn get_clipboard_content() -> Result<Option<String>> {
    // This will be handled by tauri_plugin_clipboard_manager
    // Returning None for now as we need the app handle
    Ok(None)
}

/// Get the currently active window
#[cfg(target_os = "macos")]
pub async fn get_active_window() -> Result<Option<WindowInfo>> {
    use std::process::Command;

    // Use osascript to get the frontmost application
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
