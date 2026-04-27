//! Perception module — screen capture, OCR, window tracking

pub mod ocr;
pub mod screen;
pub mod window;

use anyhow::Result;
use screenshots::Screen;
use std::sync::atomic::{AtomicBool, Ordering};

static INITIALIZED: AtomicBool = AtomicBool::new(false);

/// Initialize the perception engine. UI-agnostic — usable from Tauri,
/// CLI, or tests.
pub async fn init() -> Result<()> {
    if INITIALIZED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    log::info!("[Perception] Initializing...");

    let screens = Screen::all().map_err(|e| anyhow::anyhow!("Failed to get screens: {}", e))?;
    log::info!("[Perception] Found {} screen(s)", screens.len());

    log::info!("[Perception] Initialized successfully!");
    Ok(())
}
