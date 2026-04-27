//! Types for AI chat and Gemini API wire format

use serde::{Deserialize, Serialize};
use serde_json::Value;

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

// --- Tool / function-calling types ---

/// A tool the model may call. Shape mirrors Gemini's `FunctionDeclaration`
/// but is provider-neutral (OpenAI's "function" parameters has the same
/// JSON-Schema-flavored body).
#[derive(Debug, Clone, Serialize)]
pub struct FunctionDeclaration {
    pub name: String,
    pub description: String,
    /// JSON Schema for the arguments (OpenAPI 3.0 subset).
    pub parameters: Value,
}

/// A model-emitted call to a registered tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    /// Arguments object — caller is responsible for shape validation.
    #[serde(default)]
    pub args: Value,
}

/// Result of executing a tool call, returned to the model on the next turn.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionResult {
    pub name: String,
    /// Free-form result body — usually `{ "ok": true, "summary": "...", ... }`.
    pub response: Value,
}

/// Result of a single tool-use turn from `chat_with_tools`. Either the model
/// responded with text (terminal) or asked to call one or more tools.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ToolTurn {
    /// Final assistant text. Conversation can stop.
    Text { text: String, usage: Option<UsageInfo> },
    /// Model requested tool invocations. Caller must execute and feed
    /// results back via the next call.
    ToolCalls { calls: Vec<FunctionCall>, usage: Option<UsageInfo> },
}

/// Provider-neutral history entry for tool-use conversations.
#[derive(Debug, Clone)]
pub enum ToolMessage {
    User(String),
    Assistant(String),
    /// PNG image (base64 data URL body, not the prefix). Attached to the
    /// preceding user turn or, if first, as a fresh user turn.
    UserImage { mime_type: String, data: String },
    /// Model previously emitted these tool calls (for replay across turns).
    AssistantToolCalls(Vec<FunctionCall>),
    /// Tool execution result fed back to the model.
    ToolResult(FunctionResult),
}

// --- Gemini API wire types ---

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeminiRequest {
    pub contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_config: Option<GeminiGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<GeminiTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_config: Option<GeminiToolConfig>,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct GeminiContent {
    pub role: String,
    pub parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inline_data: Option<GeminiInlineData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_call: Option<GeminiFunctionCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_response: Option<GeminiFunctionResponse>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeminiInlineData {
    pub mime_type: String,
    pub data: String,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct GeminiFunctionCall {
    pub name: String,
    pub args: Value,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct GeminiFunctionResponse {
    pub name: String,
    pub response: Value,
}

#[derive(Debug, Serialize)]
pub(crate) struct GeminiTool {
    #[serde(rename = "functionDeclarations")]
    pub function_declarations: Vec<FunctionDeclaration>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeminiToolConfig {
    pub function_calling_config: GeminiFunctionCallingConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeminiFunctionCallingConfig {
    /// "AUTO" | "ANY" | "NONE"
    pub mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_function_names: Option<Vec<String>>,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeminiResponsePart {
    pub text: Option<String>,
    pub function_call: Option<GeminiResponseFunctionCall>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GeminiResponseFunctionCall {
    pub name: String,
    #[serde(default)]
    pub args: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeminiUsageMetadata {
    pub prompt_token_count: Option<u32>,
    pub candidates_token_count: Option<u32>,
    pub total_token_count: Option<u32>,
}
