//! Chat commands — AI chat via pluggable providers (Gemini, OpenAI, etc.)

use std::sync::Arc;
use tauri::{command, AppHandle, Emitter, State};

use crate::ai::{ChatMessage, ChatResponse, GeminiClient, LocalProvider, OpenAiClient};
use crate::events;
use crate::state::AppState;

/// Initialize the AI client from current config
#[command]
pub async fn init_ai(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<bool, String> {
    let config = state.config.read().await;

    let provider_type = config.ai_provider.as_str();

    let client: Arc<dyn crate::ai::AiProvider> = match provider_type {
        "local" | "llama-cpp" => {
            let model_id = match &config.local_model_id {
                Some(id) if !id.is_empty() => id.clone(),
                _ => {
                    log::warn!("[AI] No local model ID configured");
                    return Ok(false);
                }
            };
            drop(config); // release read lock before acquiring model_manager lock

            let mgr = state.model_manager.read().await;
            let model_path = mgr.model_path(&model_id).ok_or_else(|| {
                format!("Local model '{}' not downloaded. Download it first.", model_id)
            })?;

            let provider = LocalProvider::load(model_path, Some(model_id))
                .map_err(|e| format!("Failed to load local model: {}", e))?;

            Arc::new(provider)
        }
        "openai" => {
            let api_key = match &config.openai_api_key {
                Some(key) if !key.is_empty() => key.clone(),
                _ => {
                    log::warn!("[AI] No OpenAI API key configured");
                    return Ok(false);
                }
            };
            Arc::new(OpenAiClient::new(
                api_key,
                config.openai_model.clone(),
                config.openai_base_url.clone(),
            ))
        }
        _ => {
            // Default: Gemini
            let api_key = match &config.gemini_api_key {
                Some(key) if !key.is_empty() => key.clone(),
                _ => {
                    log::warn!("[AI] No Gemini API key configured");
                    return Ok(false);
                }
            };
            Arc::new(GeminiClient::new(
                api_key,
                config.gemini_model.clone(),
                config.gemini_base_url.clone(),
            ))
        }
    };

    // Validate the API key
    match client.validate().await {
        Ok(()) => {
            log::info!(
                "[AI] {} client validated (model={})",
                client.provider_name(),
                client.model_name()
            );
            let mut ai = state.ai_client.write().await;
            *ai = Some(client);
            let _ = app.emit(events::AI_INITIALIZED, true);
            Ok(true)
        }
        Err(e) => {
            log::error!("[AI] Validation failed: {}", e);
            let _ = app.emit(events::AI_ERROR, e.to_string());
            Ok(false)
        }
    }
}

/// Chat with AI (no tools).
#[command]
pub async fn chat(
    messages: Vec<ChatMessage>,
    state: State<'_, Arc<AppState>>,
) -> Result<ChatResponse, String> {
    let provider = {
        let ai = state.ai_client.read().await;
        ai.as_ref()
            .cloned()
            .ok_or_else(|| "AI not initialized. Call init_ai first.".to_string())?
    };

    provider
        .chat(messages)
        .await
        .map_err(|e| e.to_string())
}
