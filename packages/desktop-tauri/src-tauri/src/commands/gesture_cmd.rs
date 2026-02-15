//! Gesture control commands — receive gesture events from frontend, dispatch actions

use std::sync::Arc;
use tauri::{command, AppHandle, Emitter, State};

use crate::events;
use crate::state::AppState;

/// Gesture action types
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GestureAction {
    Click,
    Pause,
    CursorMove,
    Cancel,
    Confirm,
    Screenshot,
    QuickMenu,
    ScrollUp,
    ScrollDown,
}

/// Gesture event from frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GestureEvent {
    pub action: GestureAction,
    pub gesture: String,
    pub confidence: f64,
    pub position: Option<Position>,
    pub handedness: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

/// Gesture control config
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GestureConfig {
    pub enabled: bool,
    pub cursor_sensitivity: f64,
    pub click_hold_time: u64,
    pub scroll_speed: u32,
}

impl Default for GestureConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            cursor_sensitivity: 1.5,
            click_hold_time: 300,
            scroll_speed: 100,
        }
    }
}

/// Handle a gesture event from the frontend
#[command]
pub async fn handle_gesture(
    app: AppHandle,
    event: GestureEvent,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    let config = state.gesture_config.read().await;
    if !config.enabled {
        return Ok(false);
    }
    drop(config);

    log::debug!(
        "[Gesture] Action={:?} gesture={} confidence={:.2}",
        event.action,
        event.gesture,
        event.confidence
    );

    // Emit gesture event for other listeners
    let _ = app.emit(events::GESTURE_EVENT, &event);

    // Handle specific actions
    match event.action {
        GestureAction::Screenshot => {
            // Trigger a screenshot capture
            let capture = crate::perception::screen::capture_screenshot().await;
            match capture {
                Ok((base64, _w, _h)) => {
                    let _ = app.emit(events::GESTURE_SCREENSHOT, &base64);
                    log::info!("[Gesture] Screenshot captured");
                }
                Err(e) => {
                    log::warn!("[Gesture] Screenshot failed: {}", e);
                }
            }
        }
        GestureAction::Pause => {
            let _ = app.emit(events::GESTURE_PAUSE, ());
        }
        GestureAction::Confirm => {
            let _ = app.emit(events::GESTURE_CONFIRM, ());
        }
        GestureAction::Cancel => {
            let _ = app.emit(events::GESTURE_CANCEL, ());
        }
        GestureAction::QuickMenu => {
            let _ = app.emit(events::GESTURE_QUICK_MENU, ());
        }
        // Click, cursor_move, scroll — emitted as events for frontend to handle
        _ => {}
    }

    Ok(true)
}

/// Get gesture control status
#[command]
pub async fn get_gesture_status(
    state: State<'_, Arc<AppState>>,
) -> Result<GestureConfig, String> {
    let config = state.gesture_config.read().await;
    Ok(config.clone())
}

/// Update gesture control config
#[command]
pub async fn set_gesture_config(
    new_config: GestureConfig,
    state: State<'_, Arc<AppState>>,
) -> Result<GestureConfig, String> {
    let mut config = state.gesture_config.write().await;
    *config = new_config.clone();
    Ok(new_config)
}

/// Enable/disable gesture control
#[command]
pub async fn set_gesture_enabled(
    enabled: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    let mut config = state.gesture_config.write().await;
    config.enabled = enabled;
    log::info!("[Gesture] {}", if enabled { "Enabled" } else { "Disabled" });
    Ok(enabled)
}
