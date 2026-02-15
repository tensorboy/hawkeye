//! Types for AI chat and Gemini API wire format

use serde::{Deserialize, Serialize};

// --- Public types (used by commands + frontend) ---

/// Chat message exchanged between frontend and backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Chat response returned to the frontend
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    pub text: String,
    pub model: String,
    pub duration_ms: u64,
    pub usage: Option<UsageInfo>,
}

/// Token usage information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageInfo {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

// --- Gemini API wire types ---

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeminiRequest {
    pub contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Debug, Serialize)]
pub(crate) struct GeminiContent {
    pub role: String,
    pub parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inline_data: Option<GeminiInlineData>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeminiInlineData {
    pub mime_type: String,
    pub data: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
}

// --- Gemini API response types ---

#[derive(Debug, Deserialize)]
pub(crate) struct GeminiResponse {
    pub candidates: Option<Vec<GeminiCandidate>>,
    #[serde(rename = "usageMetadata")]
    pub usage_metadata: Option<GeminiUsageMetadata>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeminiCandidate {
    pub content: Option<GeminiResponseContent>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeminiResponseContent {
    pub parts: Option<Vec<GeminiResponsePart>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeminiResponsePart {
    pub text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeminiUsageMetadata {
    pub prompt_token_count: Option<u32>,
    pub candidates_token_count: Option<u32>,
    pub total_token_count: Option<u32>,
}
