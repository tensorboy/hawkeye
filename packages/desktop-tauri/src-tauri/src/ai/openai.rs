//! OpenAI-compatible API client (works with OpenAI, OpenRouter, local LLMs, etc.)

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

use super::provider::AiProvider;
use super::types::*;

const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";

/// OpenAI-compatible HTTP client
#[derive(Debug, Clone)]
pub struct OpenAiClient {
    client: Client,
    api_key: String,
    model: String,
    base_url: String,
}

// --- OpenAI API wire types ---

#[derive(Debug, Serialize)]
struct OpenAiRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Debug, Serialize)]
struct OpenAiMessage {
    role: String,
    content: OpenAiContent,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum OpenAiContent {
    Text(String),
    Parts(Vec<OpenAiContentPart>),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum OpenAiContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: OpenAiImageUrl },
}

#[derive(Debug, Serialize)]
struct OpenAiImageUrl {
    url: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiResponse {
    choices: Option<Vec<OpenAiChoice>>,
    usage: Option<OpenAiUsage>,
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    message: Option<OpenAiResponseMessage>,
}

#[derive(Debug, Deserialize)]
struct OpenAiResponseMessage {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiUsage {
    prompt_tokens: Option<u32>,
    completion_tokens: Option<u32>,
    total_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModelsResponse {
    data: Option<Vec<OpenAiModel>>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModel {
    id: String,
}

impl OpenAiClient {
    /// Create a new OpenAI-compatible client
    pub fn new(api_key: String, model: Option<String>, base_url: Option<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(60))
                .connect_timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
            api_key,
            model: model.unwrap_or_else(|| "gpt-4o".to_string()),
            base_url: base_url
                .map(|u| u.trim_end_matches('/').to_string())
                .unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
        }
    }

    /// Convert ChatMessages to OpenAI format
    fn convert_messages(&self, messages: Vec<ChatMessage>) -> Vec<OpenAiMessage> {
        messages
            .into_iter()
            .map(|msg| OpenAiMessage {
                role: msg.role,
                content: OpenAiContent::Text(msg.content),
            })
            .collect()
    }

    /// Convert ChatMessages to OpenAI format with vision support
    fn convert_messages_with_vision(
        &self,
        messages: Vec<ChatMessage>,
        image_base64: &str,
    ) -> Vec<OpenAiMessage> {
        let mut result: Vec<OpenAiMessage> = Vec::new();

        for (i, msg) in messages.iter().enumerate() {
            if msg.role == "user" && i == messages.len() - 1 {
                // Last user message — add image
                result.push(OpenAiMessage {
                    role: msg.role.clone(),
                    content: OpenAiContent::Parts(vec![
                        OpenAiContentPart::Text {
                            text: msg.content.clone(),
                        },
                        OpenAiContentPart::ImageUrl {
                            image_url: OpenAiImageUrl {
                                url: format!("data:image/png;base64,{}", image_base64),
                            },
                        },
                    ]),
                });
            } else {
                result.push(OpenAiMessage {
                    role: msg.role.clone(),
                    content: OpenAiContent::Text(msg.content.clone()),
                });
            }
        }

        result
    }

    /// Make a chat completion request
    async fn do_chat(&self, openai_messages: Vec<OpenAiMessage>) -> Result<ChatResponse> {
        let start = Instant::now();

        let request = OpenAiRequest {
            model: self.model.clone(),
            messages: openai_messages,
            max_tokens: Some(8192),
            temperature: Some(0.7),
        };

        let url = format!("{}/chat/completions", self.base_url);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| anyhow!("HTTP request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!("OpenAI API error ({}): {}", status, body));
        }

        let openai_response: OpenAiResponse = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse response: {}", e))?;

        let text = openai_response
            .choices
            .as_ref()
            .and_then(|c| c.first())
            .and_then(|c| c.message.as_ref())
            .and_then(|m| m.content.as_ref())
            .cloned()
            .unwrap_or_default();

        let usage = openai_response.usage.map(|u| UsageInfo {
            prompt_tokens: u.prompt_tokens.unwrap_or(0),
            completion_tokens: u.completion_tokens.unwrap_or(0),
            total_tokens: u.total_tokens.unwrap_or(0),
        });

        let model = openai_response
            .model
            .unwrap_or_else(|| self.model.clone());

        Ok(ChatResponse {
            text,
            model,
            duration_ms: start.elapsed().as_millis() as u64,
            usage,
        })
    }
}

#[async_trait]
impl AiProvider for OpenAiClient {
    async fn chat(&self, messages: Vec<ChatMessage>) -> Result<ChatResponse> {
        let openai_messages = self.convert_messages(messages);
        self.do_chat(openai_messages).await
    }

    async fn chat_with_vision(
        &self,
        messages: Vec<ChatMessage>,
        image_base64: &str,
    ) -> Result<ChatResponse> {
        let openai_messages = self.convert_messages_with_vision(messages, image_base64);
        self.do_chat(openai_messages).await
    }

    async fn validate(&self) -> Result<()> {
        let url = format!("{}/models", self.base_url);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
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
        "openai"
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}
