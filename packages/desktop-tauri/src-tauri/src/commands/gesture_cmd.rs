//! Gesture control commands — receive gesture events from frontend, dispatch actions

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
