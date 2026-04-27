//! Gemini API HTTP client

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use reqwest::Client;
use std::time::{Duration, Instant};

use super::provider::AiProvider;
use super::types::*;

const DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta";

/// Gemini HTTP client
#[derive(Debug, Clone)]
pub struct GeminiClient {
    client: Client,
    api_key: String,
    model: String,
    base_url: String,
}

impl GeminiClient {
    /// Create a new Gemini client
    pub fn new(api_key: String, model: Option<String>, base_url: Option<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(60))
                .connect_timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
            api_key,
            model: model.unwrap_or_else(|| "gemini-2.5-flash-preview-05-20".to_string()),
            base_url: base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
        }
    }

    /// Send a chat request (internal)
    async fn do_chat(&self, messages: Vec<ChatMessage>) -> Result<ChatResponse> {
        let start = Instant::now();
        let contents = self.convert_messages(messages);

        let request = GeminiRequest {
            contents,
            generation_config: Some(GeminiGenerationConfig {
                max_output_tokens: Some(8192),
                temperature: Some(0.7),
            }),
            tools: None,
            tool_config: None,
        };

        let gemini_response = self.post_generate_content(&request).await?;

        let text = gemini_response
            .candidates
            .as_ref()
            .and_then(|c| c.first())
            .and_then(|c| c.content.as_ref())
            .and_then(|c| c.parts.as_ref())
            .and_then(|p| p.first())
            .and_then(|p| p.text.as_ref())
            .cloned()
            .unwrap_or_default();

        let usage = gemini_response.usage_metadata.map(|u| UsageInfo {
            prompt_tokens: u.prompt_token_count.unwrap_or(0),
            completion_tokens: u.candidates_token_count.unwrap_or(0),
            total_tokens: u.total_token_count.unwrap_or(0),
        });

        Ok(ChatResponse {
            text,
            model: self.model.clone(),
            duration_ms: start.elapsed().as_millis() as u64,
            usage,
        })
    }

    /// Send a chat request with a vision image (internal)
    async fn do_chat_with_vision(
        &self,
        messages: Vec<ChatMessage>,
        image_base64: &str,
    ) -> Result<ChatResponse> {
        let start = Instant::now();
        let mut contents = self.convert_messages(messages);

        // Add image to the last user message
        if let Some(last) = contents.last_mut() {
            last.parts.push(GeminiPart {
                text: None,
                inline_data: Some(GeminiInlineData {
                    mime_type: "image/png".to_string(),
                    data: image_base64.to_string(),
                }),
                function_call: None,
                function_response: None,
            });
        }

        let request = GeminiRequest {
            contents,
            generation_config: Some(GeminiGenerationConfig {
                max_output_tokens: Some(8192),
                temperature: Some(0.7),
            }),
            tools: None,
            tool_config: None,
        };

        let gemini_response = self.post_generate_content(&request).await?;

        let text = gemini_response
            .candidates
            .as_ref()
            .and_then(|c| c.first())
            .and_then(|c| c.content.as_ref())
            .and_then(|c| c.parts.as_ref())
            .and_then(|p| p.first())
            .and_then(|p| p.text.as_ref())
            .cloned()
            .unwrap_or_default();

        let usage = gemini_response.usage_metadata.map(|u| UsageInfo {
            prompt_tokens: u.prompt_token_count.unwrap_or(0),
            completion_tokens: u.candidates_token_count.unwrap_or(0),
            total_tokens: u.total_token_count.unwrap_or(0),
        });

        Ok(ChatResponse {
            text,
            model: self.model.clone(),
            duration_ms: start.elapsed().as_millis() as u64,
            usage,
        })
    }

    /// Tool-using single-turn chat.
    async fn do_chat_with_tools(
        &self,
        messages: Vec<ToolMessage>,
        tools: &[FunctionDeclaration],
    ) -> Result<ToolTurn> {
        let contents = self.convert_tool_messages(messages);

        let (tools_payload, tool_config) = if tools.is_empty() {
            (None, None)
        } else {
            (
                Some(vec![GeminiTool {
                    function_declarations: tools.to_vec(),
                }]),
                Some(GeminiToolConfig {
                    function_calling_config: GeminiFunctionCallingConfig {
                        mode: "AUTO".to_string(),
                        allowed_function_names: None,
                    },
                }),
            )
        };

        let request = GeminiRequest {
            contents,
            generation_config: Some(GeminiGenerationConfig {
                max_output_tokens: Some(2048),
                temperature: Some(0.4),
            }),
            tools: tools_payload,
            tool_config,
        };

        let response = self.post_generate_content(&request).await?;

        let usage = response.usage_metadata.as_ref().map(|u| UsageInfo {
            prompt_tokens: u.prompt_token_count.unwrap_or(0),
            completion_tokens: u.candidates_token_count.unwrap_or(0),
            total_tokens: u.total_token_count.unwrap_or(0),
        });

        let parts = response
            .candidates
            .as_ref()
            .and_then(|c| c.first())
            .and_then(|c| c.content.as_ref())
            .and_then(|c| c.parts.as_ref())
            .cloned()
            .unwrap_or_default();

        // Collect function calls; Gemini may emit multiple in parallel.
        let mut calls = Vec::new();
        let mut text_buf = String::new();
        for p in &parts {
            if let Some(fc) = &p.function_call {
                calls.push(FunctionCall { name: fc.name.clone(), args: fc.args.clone() });
            }
            if let Some(t) = &p.text {
                if !text_buf.is_empty() {
                    text_buf.push('\n');
                }
                text_buf.push_str(t);
            }
        }

        if !calls.is_empty() {
            Ok(ToolTurn::ToolCalls { calls, usage })
        } else {
            Ok(ToolTurn::Text { text: text_buf, usage })
        }
    }

    /// Validate the API key by making a test request
    async fn do_validate(&self) -> Result<()> {
        let url = format!("{}/models?key={}", self.base_url, self.api_key);

        let response = self
            .client
            .get(&url)
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

    async fn post_generate_content(&self, request: &GeminiRequest) -> Result<GeminiResponse> {
        let url = format!(
            "{}/models/{}:generateContent?key={}",
            self.base_url, self.model, self.api_key
        );

        let response = self
            .client
            .post(&url)
            .json(request)
            .send()
            .await
            .map_err(|e| anyhow!("HTTP request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!("Gemini API error ({}): {}", status, body));
        }

        response
            .json::<GeminiResponse>()
            .await
            .map_err(|e| anyhow!("Failed to parse response: {}", e))
    }

    /// Convert ChatMessages to Gemini format
    fn convert_messages(&self, messages: Vec<ChatMessage>) -> Vec<GeminiContent> {
        let mut contents = Vec::new();
        let mut system_prefix: Option<String> = None;

        for msg in messages {
            match msg.role.as_str() {
                "system" => {
                    // Gemini doesn't support system role — prepend to first user message
                    system_prefix = Some(msg.content);
                }
                "user" => {
                    let text = if let Some(prefix) = system_prefix.take() {
                        format!("{}\n\n{}", prefix, msg.content)
                    } else {
                        msg.content
                    };
                    contents.push(GeminiContent {
                        role: "user".to_string(),
                        parts: vec![GeminiPart {
                            text: Some(text),
                            inline_data: None,
                            function_call: None,
                            function_response: None,
                        }],
                    });
                }
                "assistant" => {
                    contents.push(GeminiContent {
                        role: "model".to_string(),
                        parts: vec![GeminiPart {
                            text: Some(msg.content),
                            inline_data: None,
                            function_call: None,
                            function_response: None,
                        }],
                    });
                }
                _ => {
                    // Unknown role → treat as user
                    contents.push(GeminiContent {
                        role: "user".to_string(),
                        parts: vec![GeminiPart {
                            text: Some(msg.content),
                            inline_data: None,
                            function_call: None,
                            function_response: None,
                        }],
                    });
                }
            }
        }

        contents
    }

    /// Convert tool-aware messages to Gemini contents.
    fn convert_tool_messages(&self, messages: Vec<ToolMessage>) -> Vec<GeminiContent> {
        let mut contents: Vec<GeminiContent> = Vec::new();

        // Helper: get a mutable handle to the last content if its role matches.
        fn append_to_last(contents: &mut Vec<GeminiContent>, role: &str, parts: Vec<GeminiPart>) {
            if let Some(last) = contents.last_mut() {
                if last.role == role {
                    last.parts.extend(parts);
                    return;
                }
            }
            contents.push(GeminiContent { role: role.to_string(), parts });
        }

        for msg in messages {
            match msg {
                ToolMessage::User(text) => {
                    append_to_last(
                        &mut contents,
                        "user",
                        vec![GeminiPart {
                            text: Some(text),
                            inline_data: None,
                            function_call: None,
                            function_response: None,
                        }],
                    );
                }
                ToolMessage::Assistant(text) => {
                    append_to_last(
                        &mut contents,
                        "model",
                        vec![GeminiPart {
                            text: Some(text),
                            inline_data: None,
                            function_call: None,
                            function_response: None,
                        }],
                    );
                }
                ToolMessage::UserImage { mime_type, data } => {
                    append_to_last(
                        &mut contents,
                        "user",
                        vec![GeminiPart {
                            text: None,
                            inline_data: Some(GeminiInlineData { mime_type, data }),
                            function_call: None,
                            function_response: None,
                        }],
                    );
                }
                ToolMessage::AssistantToolCalls(calls) => {
                    let parts: Vec<GeminiPart> = calls
                        .into_iter()
                        .map(|c| GeminiPart {
                            text: None,
                            inline_data: None,
                            function_call: Some(GeminiFunctionCall {
                                name: c.name,
                                args: c.args,
                            }),
                            function_response: None,
                        })
                        .collect();
                    append_to_last(&mut contents, "model", parts);
                }
                ToolMessage::ToolResult(r) => {
                    append_to_last(
                        &mut contents,
                        "user",
                        vec![GeminiPart {
                            text: None,
                            inline_data: None,
                            function_call: None,
                            function_response: Some(GeminiFunctionResponse {
                                name: r.name,
                                response: r.response,
                            }),
                        }],
                    );
                }
            }
        }

        contents
    }
}

#[async_trait]
impl AiProvider for GeminiClient {
    async fn chat(&self, messages: Vec<ChatMessage>) -> Result<ChatResponse> {
        self.do_chat(messages).await
    }

    async fn chat_with_vision(
        &self,
        messages: Vec<ChatMessage>,
        image_base64: &str,
    ) -> Result<ChatResponse> {
        self.do_chat_with_vision(messages, image_base64).await
    }

    async fn chat_with_tools(
        &self,
        messages: Vec<ToolMessage>,
        tools: &[FunctionDeclaration],
    ) -> Result<ToolTurn> {
        self.do_chat_with_tools(messages, tools).await
    }

    fn supports_tools(&self) -> bool {
        true
    }

    async fn validate(&self) -> Result<()> {
        self.do_validate().await
    }

    fn provider_name(&self) -> &str {
        "gemini"
    }

    fn model_name(&self) -> &str {
        &self.model
    }
}
