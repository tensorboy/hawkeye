//! Broadcast event sink — pipes every emit() into a tokio broadcast
//! channel so SSE subscribers (and future WebSocket subscribers) can
//! receive a fan-out copy of every backend event.

use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;
use tokio::sync::broadcast;

use crate::event_sink::EventSink;

/// One frame on the bus. `name` mirrors the Tauri event constants from
/// [`crate::events`] (e.g. `"observe:update"`); `payload` is whatever
/// serializable value the producer emitted.
#[derive(Debug, Clone, Serialize)]
pub struct Frame {
    pub name: String,
    pub payload: Value,
}

/// Shared broadcast bus. The daemon stores one of these in app context;
/// every route handler that wants to push an event clones the `Sender`.
#[derive(Clone)]
pub struct EventBus {
    tx: broadcast::Sender<Frame>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self { tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Frame> {
        self.tx.subscribe()
    }

    pub fn sender(&self) -> broadcast::Sender<Frame> {
        self.tx.clone()
    }
}

/// EventSink adapter that forwards every emit into the broadcast bus.
///
/// This is what lets the observe loop / agent runner / gaze training
/// (which all take an `Arc<dyn EventSink>`) feed daemon SSE subscribers
/// without those modules knowing anything about HTTP.
pub struct BroadcastSink {
    tx: broadcast::Sender<Frame>,
}

impl BroadcastSink {
    pub fn new(bus: &EventBus) -> Arc<dyn EventSink> {
        Arc::new(Self { tx: bus.sender() })
    }
}

impl EventSink for BroadcastSink {
    fn emit(&self, name: &str, payload: Value) {
        // `send` only errors when there are no live receivers; that's fine
        // — we don't want to back-pressure producers on the absence of UIs.
        let _ = self.tx.send(Frame {
            name: name.to_string(),
            payload,
        });
    }
}
