//! AI provider trait — abstraction over Gemini, OpenAI, etc.

use anyhow::Result;
use async_trait::async_trait;

use super::types::{ChatMessage, ChatResponse};

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

    /// Validate the API key / connectivity
    async fn validate(&self) -> Result<()>;

    /// Get the provider name (e.g., "gemini", "openai")
    fn provider_name(&self) -> &str;

    /// Get the current model name
    fn model_name(&self) -> &str;
}
