//! Hawkeye Desktop - Tauri Backend
//!
//! This is the Rust backend for Hawkeye Desktop, providing:
//! - Screen capture
//! - OCR (via macOS Vision API)
//! - Clipboard monitoring
//! - Window tracking
//! - AI provider integration

mod commands;
mod perception;
mod config;

use tauri::Manager;

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Initialize perception engine
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = perception::init(&handle).await {
                    eprintln!("Failed to initialize perception: {}", e);
                }
            });

            // Set up window
            if let Some(window) = app.get_webview_window("main") {
                // Make window float on top (always on top)
                let _ = window.set_always_on_top(true);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::load_config,
            commands::save_config,
            commands::capture_screen,
            commands::run_ocr,
            commands::get_clipboard,
            commands::get_active_window,
            commands::chat,
            commands::observe,
            commands::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
