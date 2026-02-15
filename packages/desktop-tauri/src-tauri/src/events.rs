//! Tauri event name constants for backend→frontend communication

/// Observe loop events
pub const OBSERVE_UPDATE: &str = "observe:update";
pub const OBSERVE_CHANGE: &str = "observe:change-detected";
pub const OBSERVE_STOPPED: &str = "observe:stopped";

/// AI events
pub const AI_INITIALIZED: &str = "ai:initialized";
pub const AI_ERROR: &str = "ai:error";

/// Intent events
pub const INTENT_RECOGNIZED: &str = "intent:recognized";

/// Activity summary events
pub const SUMMARY_GENERATED: &str = "activity:summary-generated";

/// Model download events
pub const MODEL_DOWNLOAD_PROGRESS: &str = "model:download-progress";

/// Gesture events
pub const GESTURE_EVENT: &str = "gesture:event";
pub const GESTURE_SCREENSHOT: &str = "gesture:screenshot";
pub const GESTURE_PAUSE: &str = "gesture:pause";
pub const GESTURE_CONFIRM: &str = "gesture:confirm";
pub const GESTURE_CANCEL: &str = "gesture:cancel";
pub const GESTURE_QUICK_MENU: &str = "gesture:quick-menu";

/// Auto-updater events
pub const UPDATE_AVAILABLE: &str = "update:available";
pub const UPDATE_DOWNLOADING: &str = "update:downloading";
pub const UPDATE_PROGRESS: &str = "update:progress";
pub const UPDATE_READY: &str = "update:ready";

/// Debug timeline events
pub const DEBUG_EVENT: &str = "debug:event";
pub const DEBUG_CLEARED: &str = "debug:cleared";

/// Status events
pub const STATUS_CHANGED: &str = "status:changed";
