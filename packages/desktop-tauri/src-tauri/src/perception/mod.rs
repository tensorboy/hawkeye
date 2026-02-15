//! Perception module — screen capture, OCR, window tracking

pub mod ocr;
pub mod screen;
pub mod window;

use anyhow::Result;
use screenshots::Screen;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

static INITIALIZED: AtomicBool = AtomicBool::new(false);

/// Initialize the perception engine
pub async fn init(_app: &AppHandle) -> Result<()> {
    if INITIALIZED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    log::info!("[Perception] Initializing...");

    let screens = Screen::all().map_err(|e| anyhow::anyhow!("Failed to get screens: {}", e))?;
    log::info!("[Perception] Found {} screen(s)", screens.len());

    log::info!("[Perception] Initialized successfully!");
    Ok(())
}
