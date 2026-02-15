//! Hawkeye Desktop - Tauri Backend
//!
//! This is the Rust backend for Hawkeye Desktop, providing:
//! - AI chat (Gemini, OpenAI-compatible)
//! - Screen capture + OCR (macOS Vision API)
//! - Smart observe loop with adaptive refresh
//! - Menu bar tray panel
//! - Configuration persistence

mod ai;
mod commands;
mod config;
mod events;
mod life_tree;
mod models;
mod observe;
mod perception;
mod state;
mod voice;

use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconEvent;

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Load config
            let cfg = config::load_config().unwrap_or_default();

            // Create and manage shared state
            let app_state = state::AppState::new(cfg);
            app.manage(app_state);

            // Initialize perception engine
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = perception::init(&handle).await {
                    log::error!("Failed to initialize perception: {}", e);
                }
            });

            // Set up main window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(true);
            }

            // --- Tray menu ---
            let show_item = MenuItemBuilder::with_id("show", "Show Hawkeye").build(app)?;
            let observe_item = MenuItemBuilder::with_id("start_observe", "Start Observe").build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit Hawkeye").build(app)?;

            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&observe_item)
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
                    "start_observe" => {
                        let handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = handle.state::<std::sync::Arc<state::AppState>>();
                            let mut loop_handle = state.observe_loop.write().await;
                            if loop_handle.is_none() {
                                let obs = observe::ObserveLoop::start(
                                    handle.clone(),
                                    std::sync::Arc::clone(&state),
                                    3000,
                                    0.05,
                                );
                                *loop_handle = Some(obs);
                                log::info!("[Tray] Started observe");
                            }
                        });
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
            // Status
            commands::status::get_status,
            // Config
            commands::config_cmd::load_config,
            commands::config_cmd::save_config,
            // Perception
            commands::perception_cmd::capture_screen,
            commands::perception_cmd::run_ocr,
            commands::perception_cmd::get_clipboard,
            commands::perception_cmd::get_active_window,
            // Chat
            commands::chat_cmd::chat,
            commands::chat_cmd::init_ai,
            // Observe
            commands::observe_cmd::start_observe,
            commands::observe_cmd::stop_observe,
            commands::observe_cmd::get_observe_status,
            // Adaptive refresh
            commands::adaptive_cmd::record_activity,
            commands::adaptive_cmd::get_refresh_status,
            // Activity summarizer
            commands::summarizer_cmd::generate_summary,
            commands::summarizer_cmd::get_recent_summaries,
            commands::summarizer_cmd::get_activity_stats,
            // Intent pipeline
            commands::intent_cmd::recognize_intent,
            commands::intent_cmd::recognize_intent_ai,
            commands::intent_cmd::get_recent_intents,
            // Voice
            commands::voice_cmd::speech_status,
            commands::voice_cmd::speech_listen,
            commands::voice_cmd::speech_transcribe_file,
            // Life tree
            commands::life_tree_cmd::get_life_tree,
            commands::life_tree_cmd::rebuild_life_tree,
            commands::life_tree_cmd::propose_experiment,
            commands::life_tree_cmd::start_experiment,
            commands::life_tree_cmd::conclude_experiment,
            commands::life_tree_cmd::get_unlocked_phase,
            commands::life_tree_cmd::get_experiments,
            // Model manager
            commands::model_cmd::get_models_dir,
            commands::model_cmd::list_models,
            commands::model_cmd::get_recommended_models,
            commands::model_cmd::get_models_by_type,
            commands::model_cmd::model_exists,
            commands::model_cmd::download_model,
            commands::model_cmd::cancel_model_download,
            commands::model_cmd::delete_model,
            commands::model_cmd::get_model_path,
            // Gesture control
            commands::gesture_cmd::handle_gesture,
            commands::gesture_cmd::get_gesture_status,
            commands::gesture_cmd::set_gesture_config,
            commands::gesture_cmd::set_gesture_enabled,
            // Auto-updater
            commands::updater_cmd::check_for_update,
            commands::updater_cmd::install_update,
            commands::updater_cmd::get_app_version,
            // Debug timeline
            commands::debug_cmd::get_debug_events,
            commands::debug_cmd::get_debug_events_since,
            commands::debug_cmd::search_debug_events,
            commands::debug_cmd::push_debug_event,
            commands::debug_cmd::get_debug_status,
            commands::debug_cmd::pause_debug,
            commands::debug_cmd::resume_debug,
            commands::debug_cmd::clear_debug_events,
            // Utilities
            commands::util_cmd::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
