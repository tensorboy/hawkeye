//! Intent pipeline commands — recognize user intents from current context

use std::sync::Arc;
use tauri::{command, State};

use crate::observe::intent::{IntentRecognizer, RecognitionInput, UserIntent};
use crate::state::AppState;

/// Manually trigger intent recognition from current observation
#[command]
pub async fn recognize_intent(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<UserIntent>, String> {
    // Build input from last observation
    let input = {
        let obs = state.last_observation.read().await;
        match obs.as_ref() {
            Some(o) => RecognitionInput {
                app_name: o.active_window.as_ref().map(|w| w.app_name.clone()),
                window_title: o.active_window.as_ref().map(|w| w.title.clone()),
                ocr_text: o.ocr_text.clone(),
                clipboard: None,
            },
            None => return Err("No observation available. Start observe first.".to_string()),
        }
    };

    let mut recognizer = state.intent_recognizer.write().await;
    let intents = recognizer.recognize(&input);
    Ok(intents)
}

/// Get AI-enhanced intent description from current context
#[command]
pub async fn recognize_intent_ai(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<UserIntent>, String> {
    // Build input from last observation
    let input = {
        let obs = state.last_observation.read().await;
        match obs.as_ref() {
            Some(o) => RecognitionInput {
                app_name: o.active_window.as_ref().map(|w| w.app_name.clone()),
                window_title: o.active_window.as_ref().map(|w| w.title.clone()),
                ocr_text: o.ocr_text.clone(),
                clipboard: None,
            },
            None => return Err("No observation available. Start observe first.".to_string()),
        }
    };

    // Rule-based first
    let rule_intents = {
        let mut recognizer = state.intent_recognizer.write().await;
        recognizer.recognize(&input)
    };

    // AI enhancement
    let ai = state.ai_client.read().await;
    let client = match ai.as_ref() {
        Some(c) => c,
        None => return Ok(rule_intents), // Fallback to rule-based only
    };

    let prompt = IntentRecognizer::build_ai_prompt(&input, &rule_intents);
    let messages = vec![crate::ai::ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    match client.chat(messages).await {
        Ok(response) => {
            let merged = IntentRecognizer::merge_ai_response(&rule_intents, &response.text);
            Ok(merged)
        }
        Err(e) => {
            log::warn!("[Intent] AI enhancement failed: {}", e);
            Ok(rule_intents)
        }
    }
}

/// Get recently recognized intents
#[command]
pub async fn get_recent_intents(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<UserIntent>, String> {
    let recognizer = state.intent_recognizer.read().await;
    Ok(recognizer.recent_intents().to_vec())
}
