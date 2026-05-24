//! Hawkeye Desktop - Tauri Backend
//!
//! This is the Rust backend for Hawkeye Desktop, providing:
//! - AI chat (Gemini, OpenAI-compatible, local llama.cpp with Metal)
//! - Local LLM inference via llama-cpp-2 (GGUF models, Apple Metal GPU)
//! - Training data collection for LoRA fine-tuning
//! - Screen capture + OCR (macOS Vision API)
//! - Smart observe loop with adaptive refresh
//! - Menu bar tray panel
//! - Configuration persistence

pub mod agent;
pub mod ai;
pub mod commands;
pub mod config;
pub mod daemon;
pub mod event_sink;
pub mod events;
pub mod gaze;
pub mod life_tree;
pub mod models;
pub mod observe;
pub mod perception;
pub mod state;
pub mod training;
pub mod voice;

use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconEvent;

use crate::events;

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    // Three modes via three Alt-prefixed hotkeys. Captured here so we can
    // reuse the same handler closure for shortcut registration below.
    let explain_dictionary = Shortcut::new(Some(Modifiers::ALT), Code::KeyE);
    let explain_troubleshoot = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyE);
    let explain_scene = Shortcut::new(Some(Modifiers::ALT | Modifiers::SUPER), Code::KeyE);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            // Look-to-Explain: ⌥E / ⌥⇧E / ⌥⌘E → emit `explain:requested` to main window.
            // React's useExplain hook reads gazedEntity from the store and POSTs /v1/explain.
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([explain_dictionary, explain_troubleshoot, explain_scene])
                .expect("failed to register Look-to-Explain shortcuts")
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed { return; }
                    let mode = if shortcut == &explain_dictionary {
                        "dictionary"
                    } else if shortcut == &explain_troubleshoot {
                        "troubleshoot"
                    } else if shortcut == &explain_scene {
                        "scene"
                    } else {
                        return;
                    };
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit(events::EXPLAIN_REQUESTED, serde_json::json!({ "mode": mode }));
                    }
                })
                .build(),
        )
        .setup(|app| {
            // After the unification (HAWKEYED.md Phase 2-5 + Phase 6 sink
            // refactor) Tauri is a true thin shell — zero AppState. The
            // only Tauri-side state is a tiny TauriShellState that tracks
            // the daemon child + cached daemon info for the boot-time
            // token handoff. Every backend capability lives in hawkeyed.
            let cfg = config::load_config().unwrap_or_default();
            let shell = std::sync::Arc::new(state::TauriShellState::default());
            app.manage(shell.clone());

            // Probe / spawn the hawkeyed companion daemon. Every backend
            // capability the GUI uses flows through this.
            {
                let shell = shell.clone();
                let port = cfg.sync_port;
                tauri::async_runtime::spawn(async move {
                    let (info, child) = daemon::ensure_daemon(port).await;
                    log::info!(
                        "[hawkeyed] {} at {} (spawned={})",
                        if info.running { "running" } else { "unavailable" },
                        info.url,
                        info.spawned_by_gui
                    );
                    *shell.daemon_info.write().await = Some(info);
                    *shell.daemon_child.write().await = child;
                });
            }

            // Set up main window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(true);
            }

            // --- Tray menu ---
            // After unification, observe loop is started from the React UI
            // (which goes to the daemon over HTTP), so the tray-menu entry
            // for that is gone. The tray keeps the four window-mgmt items.
            let show_item = MenuItemBuilder::with_id("show", "Show Hawkeye").build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit Hawkeye").build(app)?;

            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&settings_item)
                .separator()
                .item(&quit_item)
                .build()?;

            if let Some(tray) = app.tray_by_id("main") {
                tray.set_menu(Some(tray_menu))?;
                tray.set_show_menu_on_left_click(false)?;

                // Left-click tray icon → toggle main window
                let app_handle = app.handle().clone();
                tray.on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click { button, .. } = event {
                        if button == tauri::tray::MouseButton::Left {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    }
                });
            }

            // Handle tray menu item clicks
            let app_handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "settings" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("open-settings", ());
                        }
                    }
                    "quit" => {
                        app_handle.exit(0);
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // After the unification only a handful of commands remain on
            // Tauri IPC — everything else goes through the hawkeyed HTTP
            // daemon. See HAWKEYED.md for why each of these stays.
            commands::status::get_daemon_info,   // GUI-only daemon spawn state
            commands::status::get_daemon_token,  // boot-time token handoff
            commands::updater_cmd::check_for_update,   // Tauri updater plugin
            commands::updater_cmd::install_update,     // Tauri updater plugin
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
