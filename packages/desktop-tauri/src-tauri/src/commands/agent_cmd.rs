//! Agent commands — cua-driver lifecycle + tool-using chat.

use std::sync::Arc;
use tauri::{command, AppHandle, Emitter, State};

use crate::agent::{run_user_turn, AgentTurnResult, CuaDriverClient};
use crate::ai::types::{FunctionResult, ToolMessage};
use crate::ai::ChatMessage;
use crate::event_sink::{SharedSink, TauriSink};
use crate::events;
use crate::state::AppState;

/// Status of the cua-driver integration, surfaced to the frontend.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub binary_installed: bool,
    pub binary_path: Option<String>,
    pub daemon_running: bool,
    pub socket_path: String,
}

/// Returns the current cua-driver status.
#[command]
pub async fn get_agent_status(state: State<'_, Arc<AppState>>) -> Result<AgentStatus, String> {
    let supervisor = state.agent_supervisor.read().await;
    let supervisor = supervisor
        .as_ref()
        .ok_or_else(|| "agent supervisor not initialized".to_string())?;

    let daemon_running = supervisor.client().is_running().await;
    Ok(AgentStatus {
        binary_installed: supervisor.binary_path().is_some(),
        binary_path: supervisor.binary_path().map(|p| p.display().to_string()),
        daemon_running,
        socket_path: supervisor.client().socket_path().display().to_string(),
    })
}

/// Ensure the cua-driver daemon is running. Spawns it if needed.
#[command]
pub async fn start_agent(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<bool, String> {
    let supervisor = state.agent_supervisor.read().await;
    let supervisor = supervisor
        .as_ref()
        .ok_or_else(|| "agent supervisor not initialized".to_string())?;

    match supervisor.ensure_running().await {
        Ok(()) => {
            let _ = app.emit(events::AGENT_DAEMON_READY, true);
            Ok(true)
        }
        Err(e) => {
            let msg = e.to_string();
            log::error!("[agent] start_agent failed: {}", msg);
            let _ = app.emit(events::AGENT_DAEMON_ERROR, msg.clone());
            Err(msg)
        }
    }
}

/// Tool-using chat. Pass the conversation so far (plain `ChatMessage`s) plus
/// the new user input. Returns final text + audit trail of tool calls.
#[command]
pub async fn chat_with_agent(
    history: Vec<ChatMessage>,
    user_input: String,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<AgentTurnResult, String> {
    // Resolve provider.
    let provider = {
        let ai = state.ai_client.read().await;
        ai.as_ref()
            .cloned()
            .ok_or_else(|| "AI not initialized. Call init_ai first.".to_string())?
    };

    // Resolve cua-driver client (may be unavailable; that's a soft error).
    let driver_client: Option<CuaDriverClient> = {
        let sup = state.agent_supervisor.read().await;
        match sup.as_ref() {
            Some(s) if s.client().is_running().await => Some(s.client().clone()),
            _ => None,
        }
    };

    // Translate plain history into ToolMessages.
    let mut tool_history: Vec<ToolMessage> = Vec::with_capacity(history.len());
    for msg in history {
        match msg.role.as_str() {
            "user" => tool_history.push(ToolMessage::User(msg.content)),
            "assistant" => tool_history.push(ToolMessage::Assistant(msg.content)),
            _ => {} // drop system here — handled inside provider for plain chat
        }
    }

    let sink: SharedSink = state
        .event_sink
        .read()
        .await
        .clone()
        .unwrap_or_else(|| -> SharedSink { Arc::new(TauriSink::new(app)) });

    run_user_turn(sink, provider, driver_client, tool_history, user_input)
        .await
        .map_err(|e| e.to_string())
}

// --- Direct passthrough for debugging -------------------------------------

/// Manually invoke a single cua-driver tool. Useful for UI buttons,
/// debugging, and unit-testing the bridge without going through the LLM.
#[command]
pub async fn invoke_cua_tool(
    name: String,
    args: serde_json::Value,
    state: State<'_, Arc<AppState>>,
) -> Result<FunctionResult, String> {
    let sup = state.agent_supervisor.read().await;
    let sup = sup
        .as_ref()
        .ok_or_else(|| "agent supervisor not initialized".to_string())?;

    if !crate::agent::tools::is_allowed(&name) {
        return Err(format!("tool '{}' not in allow-list", name));
    }

    let args_map = args
        .as_object()
        .map(|m| m.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default();

    let result = sup
        .client()
        .call(&name, args_map)
        .await
        .map_err(|e| e.to_string())?;

    Ok(FunctionResult {
        name: name.clone(),
        response: serde_json::json!({
            "ok": !result.is_error,
            "summary": result.text(),
            "hasImage": result.first_image().is_some(),
        }),
    })
}

