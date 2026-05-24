//! Perception commands — screen capture, OCR, clipboard, window

use serde::Serialize;

/// Active window info response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfoResponse {
    pub app_name: String,
    pub title: String,
    pub bundle_id: Option<String>,
}
