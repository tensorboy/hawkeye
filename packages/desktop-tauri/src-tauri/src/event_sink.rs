//! Provider-neutral event emission so non-UI runners (CLI/server) can host
//! observe + agent loops without pulling in Tauri.
//!
//! The Tauri desktop app uses [`TauriSink`] to forward events to the
//! webview frontend; the headless CLI uses [`StdoutSink`] to print NDJSON
//! events to stdout; one-shot commands that don't care about events use
//! [`NoopSink`].

use serde_json::Value;
use std::sync::Arc;

/// Provider-neutral sink for backend → frontend (or backend → stdout) events.
pub trait EventSink: Send + Sync {
    fn emit(&self, event: &str, payload: Value);
}

/// Tauri implementation — forwards to `AppHandle::emit`.
pub struct TauriSink {
    handle: tauri::AppHandle,
}

impl TauriSink {
    pub fn new(handle: tauri::AppHandle) -> Self {
        Self { handle }
    }
}

impl EventSink for TauriSink {
    fn emit(&self, event: &str, payload: Value) {
        let _ = tauri::Emitter::emit(&self.handle, event, payload);
    }
}

/// CLI implementation — emits NDJSON to stdout (one JSON object per line).
pub struct StdoutSink;

impl EventSink for StdoutSink {
    fn emit(&self, event: &str, payload: Value) {
        println!(
            "{}",
            serde_json::json!({ "event": event, "data": payload })
        );
    }
}

/// No-op sink for one-shot commands that don't care about events.
pub struct NoopSink;

impl EventSink for NoopSink {
    fn emit(&self, _: &str, _: Value) {}
}

/// Convenience alias for the shared trait object.
pub type SharedSink = Arc<dyn EventSink>;
