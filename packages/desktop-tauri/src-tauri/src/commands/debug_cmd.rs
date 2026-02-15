//! Debug timeline commands — in-memory event stream for debugging

use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{command, State};

use crate::state::AppState;

/// Debug event types matching the Electron implementation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DebugEventType {
    Screenshot,
    Ocr,
    Clipboard,
    Window,
    File,
    LlmInput,
    LlmOutput,
    Intent,
    Plan,
    ExecutionStart,
    ExecutionStep,
    ExecutionComplete,
    Error,
    SpeechSegment,
    Gesture,
    GazeCalibration,
    Observe,
    System,
}

/// A single debug event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugEvent {
    pub id: String,
    pub timestamp: u64,
    pub event_type: DebugEventType,
    pub label: String,
    pub data: serde_json::Value,
    pub duration_ms: Option<u64>,
    pub parent_id: Option<String>,
}

/// Debug timeline status
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugStatus {
    pub paused: bool,
    pub count: usize,
    pub max_events: usize,
}

/// Maximum serialized size for the data field per event (16KB)
const MAX_DATA_SIZE: usize = 16_384;

/// In-memory debug timeline store
pub struct DebugTimeline {
    events: VecDeque<DebugEvent>,
    max_events: usize,
    paused: bool,
    counter: u64,
}

impl Default for DebugTimeline {
    fn default() -> Self {
        Self {
            events: VecDeque::with_capacity(500),
            max_events: 500,
            paused: false,
            counter: 0,
        }
    }
}

impl DebugTimeline {
    /// Truncate data field if its serialized size exceeds the limit
    fn truncate_data(data: serde_json::Value) -> serde_json::Value {
        let serialized = serde_json::to_string(&data).unwrap_or_default();
        if serialized.len() <= MAX_DATA_SIZE {
            data
        } else {
            serde_json::json!({
                "_truncated": true,
                "_originalSize": serialized.len(),
                "preview": &serialized[..MAX_DATA_SIZE.min(serialized.len())],
            })
        }
    }

    /// Push a new event (ignored if paused)
    pub fn push(&mut self, event_type: DebugEventType, label: String, data: serde_json::Value, duration_ms: Option<u64>, parent_id: Option<String>) -> Option<DebugEvent> {
        if self.paused {
            return None;
        }

        self.counter += 1;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let event = DebugEvent {
            id: format!("dbg-{}", self.counter),
            timestamp: now,
            event_type,
            label,
            data: Self::truncate_data(data),
            duration_ms,
            parent_id,
        };

        if self.events.len() >= self.max_events {
            self.events.pop_front();
        }
        self.events.push_back(event.clone());

        Some(event)
    }

    /// Get all events, optionally filtered by types
    pub fn get_events(&self, types: Option<&[DebugEventType]>, limit: Option<usize>) -> Vec<DebugEvent> {
        let iter = self.events.iter().rev();

        let filtered: Vec<DebugEvent> = if let Some(types) = types {
            iter.filter(|e| types.contains(&e.event_type)).cloned().collect()
        } else {
            iter.cloned().collect()
        };

        if let Some(limit) = limit {
            filtered.into_iter().take(limit).collect()
        } else {
            filtered
        }
    }

    /// Get events since a timestamp
    pub fn get_since(&self, since_ms: u64) -> Vec<DebugEvent> {
        self.events
            .iter()
            .filter(|e| e.timestamp > since_ms)
            .cloned()
            .collect()
    }

    /// Search events by label text
    pub fn search(&self, query: &str) -> Vec<DebugEvent> {
        let q = query.to_lowercase();
        self.events
            .iter()
            .filter(|e| e.label.to_lowercase().contains(&q))
            .cloned()
            .collect()
    }

    pub fn clear(&mut self) {
        self.events.clear();
    }

    pub fn status(&self) -> DebugStatus {
        DebugStatus {
            paused: self.paused,
            count: self.events.len(),
            max_events: self.max_events,
        }
    }
}

// --- Tauri Commands ---

/// Get debug events (newest first)
#[command]
pub async fn get_debug_events(
    state: State<'_, Arc<AppState>>,
    event_types: Option<Vec<DebugEventType>>,
    limit: Option<usize>,
) -> Result<Vec<DebugEvent>, String> {
    let timeline = state.debug_timeline.read().await;
    Ok(timeline.get_events(event_types.as_deref(), limit))
}

/// Get events since a timestamp (for polling)
#[command]
pub async fn get_debug_events_since(
    state: State<'_, Arc<AppState>>,
    since_ms: u64,
) -> Result<Vec<DebugEvent>, String> {
    let timeline = state.debug_timeline.read().await;
    Ok(timeline.get_since(since_ms))
}

/// Search debug events by label
#[command]
pub async fn search_debug_events(
    state: State<'_, Arc<AppState>>,
    query: String,
) -> Result<Vec<DebugEvent>, String> {
    let timeline = state.debug_timeline.read().await;
    Ok(timeline.search(&query))
}

/// Push a debug event (from frontend or other commands)
#[command]
pub async fn push_debug_event(
    state: State<'_, Arc<AppState>>,
    event_type: DebugEventType,
    label: String,
    data: serde_json::Value,
    duration_ms: Option<u64>,
) -> Result<Option<DebugEvent>, String> {
    let mut timeline = state.debug_timeline.write().await;
    Ok(timeline.push(event_type, label, data, duration_ms, None))
}

/// Get debug timeline status
#[command]
pub async fn get_debug_status(
    state: State<'_, Arc<AppState>>,
) -> Result<DebugStatus, String> {
    let timeline = state.debug_timeline.read().await;
    Ok(timeline.status())
}

/// Pause debug event collection
#[command]
pub async fn pause_debug(
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    let mut timeline = state.debug_timeline.write().await;
    timeline.paused = true;
    Ok(true)
}

/// Resume debug event collection
#[command]
pub async fn resume_debug(
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    let mut timeline = state.debug_timeline.write().await;
    timeline.paused = false;
    Ok(true)
}

/// Clear all debug events
#[command]
pub async fn clear_debug_events(
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut timeline = state.debug_timeline.write().await;
    timeline.clear();
    Ok(())
}
