//! AI provider trait — abstraction over Gemini, OpenAI, etc.

use anyhow::{anyhow, Result};
use async_trait::async_trait;

use super::types::{ChatMessage, ChatResponse, FunctionDeclaration, ToolMessage, ToolTurn};

/// Trait for AI chat providers
#[async_trait]
pub trait AiProvider: Send + Sync + std::fmt::Debug {
    /// Send a chat request
    async fn chat(&self, messages: Vec<ChatMessage>) -> Result<ChatResponse>;

    /// Send a chat request with a vision image (base64 PNG)
    async fn chat_with_vision(
        &self,
        messages: Vec<ChatMessage>,
        image_base64: &str,
    ) -> Result<ChatResponse>;

    /// Tool-using chat. Returns the next single turn from the model. The
    /// caller is responsible for executing any returned tool calls and
    /// feeding results back via the next invocation.
    ///
    /// Default implementation returns an unsupported error so existing
    /// providers (local llama.cpp, OpenAI legacy) compile without change.
    async fn chat_with_tools(
        &self,
        _messages: Vec<ToolMessage>,
        _tools: &[FunctionDeclaration],
    ) -> Result<ToolTurn> {
        Err(anyhow!(
            "Provider '{}' does not yet support tool calling",
            self.provider_name()
        ))
    }

    /// Whether this provider supports tool calling.
    fn supports_tools(&self) -> bool {
        false
    }

    /// Validate the API key / connectivity
    async fn validate(&self) -> Result<()>;

    /// Get the provider name (e.g., "gemini", "openai")
    fn provider_name(&self) -> &str;

    /// Get the current model name
    fn model_name(&self) -> &str;
}
