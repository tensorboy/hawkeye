//! Anthropic Messages API client (Claude models)
//!
//! Wire format differs from OpenAI in three ways this client absorbs:
//!   - auth is `x-api-key` + `anthropic-version` headers (not Bearer)
//!   - system prompts are a top-level `system` field, not a message role
//!   - `max_tokens` is required, and content comes back as typed blocks

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

use super::provider::AiProvider;
use super::types::*;

const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
const DEFAULT_MODEL: &str = "claude-sonnet-4-6";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const MAX_TOKENS: u32 = 8192;

/// Anthropic Messages API client
#[derive(Debug, Clone)]
pub struct AnthropicClient {
    client: Client,
    api_key: String,
    model: String,
    base_url: String,
}

// --- Anthropic API wire types ---

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    messages: Vec<AnthropicMessage>,
}

#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: AnthropicContent,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum AnthropicContent {
    Text(String),
    Blocks(Vec<AnthropicBlock>),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum AnthropicBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { source: AnthropicImageSource },
}

#[derive(Debug, Serialize)]
struct AnthropicImageSource {
    #[serde(rename = "type")]
    source_type: String, // "base64"
    media_type: String,  // "image/png"
    data: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Option<Vec<AnthropicResponseBlock>>,
    usage: Option<AnthropicUsage>,
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponseBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
}

impl AnthropicClient {
    pub fn new(api_key: String, model: Option<String>, base_url: Option<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(60))
                .connect_timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
            api_key,
            model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            base_url: base_url
                .map(|u| u.trim_end_matches('/').to_string())
                .unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
        }
    }

    /// Split system messages into the top-level `system` field and convert
    /// the rest. Anthropic rejects `role: system` inside `messages`.
    fn convert_messages(
        &self,
        messages: Vec<ChatMessage>,
        image_base64: Option<&str>,
    ) -> (Option<String>, Vec<AnthropicMessage>) {
        let mut system_parts: Vec<String> = Vec::new();
        let mut converted: Vec<AnthropicMessage> = Vec::new();

        for msg in &messages {
            if msg.role == "system" {
                system_parts.push(msg.content.clone());
            }
        }

        let non_system: Vec<&ChatMessage> =
            messages.iter().filter(|m| m.role != "system").collect();
        let last_idx = non_system.len().saturating_sub(1);

        for (i, msg) in non_system.iter().enumerate() {
            let attach_image = image_base64.is_some() && msg.role == "user" && i == last_idx;
            let content = if attach_image {
                AnthropicContent::Blocks(vec![
                    AnthropicBlock::Image {
                        source: AnthropicImageSource {
                            source_type: "base64".to_string(),
                            media_type: "image/png".to_string(),
                            data: image_base64.unwrap().to_string(),
                        },
                    },
                    AnthropicBlock::Text {
                        text: msg.content.clone(),
                    },
                ])
            } else {
                AnthropicContent::Text(msg.content.clone())
            };
            converted.push(AnthropicMessage {
                role: msg.role.clone(),
                content,
            });
        }

        let system = if system_parts.is_empty() {
            None
        } else {
            Some(system_parts.join("\n\n"))
        };
        (system, converted)
    }

    async fn do_chat(
        &self,
        system: Option<String>,
        messages: Vec<AnthropicMessage>,
    ) -> Result<ChatResponse> {
        let start = Instant::now();

        let request = AnthropicRequest {
            model: self.model.clone(),
            max_tokens: MAX_TOKENS,
            system,
            messages,
        };

        let url = format!("{}/v1/messages", self.base_url);

        let response = self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| anyhow!("HTTP request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!("Anthropic API error ({}): {}", status, body));
        }

        let api_response: AnthropicResponse = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse response: {}", e))?;

        let text = api_response
            .content
            .as_ref()
            .map(|blocks| {
                blocks
                    .iter()
                    .filter(|b| b.block_type == "text")
                    .filter_map(|b| b.text.as_deref())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default();

        let usage = api_response.usage.map(|u| {
            let input = u.input_tokens.unwrap_or(0);
            let output = u.output_tokens.unwrap_or(0);
            UsageInfo {
                prompt_tokens: input,
                completion_tokens: output,
                total_tokens: input + output,
            }
        });

        let model = api_response.model.unwrap_or_else(|| self.model.clone());

        Ok(ChatResponse {
            text,
            model,
            duration_ms: start.elapsed().as_millis() as u64,
            usage,
        })
    }
}

#[async_trait]
impl AiProvider for AnthropicClient {
    async fn chat(&self, messages: Vec<ChatMessage>) -> Result<ChatResponse> {
        let (system, converted) = self.convert_messages(messages, None);
        self.do_chat(system, converted).await
    }

    async fn chat_with_vision(
        &self,
        messages: Vec<ChatMessage>,
        image_base64: &str,
    ) -> Result<ChatResponse> {
        let (system, converted) = self.convert_messages(messages, Some(image_base64));
        self.do_chat(system, converted).await
    }

    async fn validate(&self) -> Result<()> {
        let url = format!("{}/v1/models?limit=1", self.base_url);

        let response = self
            .client
            .get(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .send()
            .await
            .map_err(|e| anyhow!("Validation request failed: {}", e))?;

        if response.status().is_success() {
            Ok(())
        } else {
            let body = response.text().await.unwrap_or_default();
            Err(anyhow!("API key validation failed: {}", body))
        }
    }

    fn provider_name(&self) -> &str {
        "anthropic"
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}
