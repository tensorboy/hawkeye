//! Tool-use orchestration loop.
//!
//! Drives a single user turn through the model + cua-driver until the model
//! emits final text (or we hit the safety cap). Emits events through an
//! [`EventSink`] on each tool call so the host (Tauri UI, CLI stdout, …)
//! can render progress in real time.

use anyhow::{anyhow, bail, Result};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

use super::cua_driver::CuaDriverClient;
use super::tools::{gemini_function_declarations, is_allowed};
use crate::ai::types::{
    FunctionCall, FunctionResult, ToolMessage, ToolTurn, UsageInfo,
};
use crate::ai::AiProvider;
use crate::event_sink::EventSink;
use crate::events;

/// Maximum number of tool-call rounds in a single user turn.
pub const MAX_TOOL_ROUNDS: usize = 8;

/// Final outcome of a tool-using turn.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnResult {
    pub text: String,
    pub rounds: usize,
    pub tool_calls: Vec<ToolCallRecord>,
    pub usage: Option<UsageInfo>,
}

/// One entry in the per-turn audit log emitted to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRecord {
    pub round: usize,
    pub name: String,
    pub args: Value,
    pub ok: bool,
    pub summary: String,
}

/// Execute a single user turn end-to-end.
///
/// `history` is the prior conversation (text-only roles); we append the new
/// user input ourselves. `cua_driver` may be `None`, in which case the model
/// will be given an empty tool list and forced to answer textually.
pub async fn run_user_turn(
    sink: Arc<dyn EventSink>,
    provider: Arc<dyn AiProvider>,
    cua_driver: Option<CuaDriverClient>,
    history: Vec<ToolMessage>,
    user_input: String,
) -> Result<AgentTurnResult> {
    if !provider.supports_tools() {
        bail!("Provider '{}' does not support tool calling", provider.provider_name());
    }

    let tools = if cua_driver.is_some() {
        gemini_function_declarations()
    } else {
        Vec::new()
    };

    let mut messages = history;
    messages.push(ToolMessage::User(user_input));

    let mut tool_calls: Vec<ToolCallRecord> = Vec::new();
    let mut last_usage: Option<UsageInfo> = None;

    for round in 1..=MAX_TOOL_ROUNDS {
        let turn = provider.chat_with_tools(messages.clone(), &tools).await?;

        match turn {
            ToolTurn::Text { text, usage } => {
                if let Some(u) = usage.clone() {
                    last_usage = Some(u);
                }
                return Ok(AgentTurnResult {
                    text,
                    rounds: round,
                    tool_calls,
                    usage: last_usage,
                });
            }
            ToolTurn::ToolCalls { calls, usage } => {
                if let Some(u) = usage.clone() {
                    last_usage = Some(u);
                }

                if calls.is_empty() {
                    bail!("model returned empty tool-call list");
                }

                let driver = cua_driver
                    .as_ref()
                    .ok_or_else(|| anyhow!("model requested a tool but no cua-driver client is available"))?;

                // Record the model's tool calls in history (Gemini requires
                // function_call → function_response symmetry).
                messages.push(ToolMessage::AssistantToolCalls(calls.clone()));

                for call in calls {
                    let record =
                        execute_tool(sink.as_ref(), driver, &call, round, &mut messages).await;
                    tool_calls.push(record);
                }
            }
        }
    }

    bail!(
        "agent exceeded {} tool-call rounds without final answer",
        MAX_TOOL_ROUNDS
    )
}

/// Execute one tool call, append its result to `messages`, and return an
/// audit record. Errors are not propagated — they are reported back to the
/// model as `{ok: false, error: …}` so it can recover.
async fn execute_tool(
    sink: &dyn EventSink,
    driver: &CuaDriverClient,
    call: &FunctionCall,
    round: usize,
    messages: &mut Vec<ToolMessage>,
) -> ToolCallRecord {
    log::info!("[agent] round {} tool call: {} {}", round, call.name, call.args);

    // Notify host that a tool call started.
    sink.emit(
        events::AGENT_TOOL_CALL_START,
        json!({
            "round": round,
            "name": call.name,
            "args": call.args,
        }),
    );

    if !is_allowed(&call.name) {
        let err = format!("tool '{}' is not in the allow-list", call.name);
        let response = json!({ "ok": false, "error": err });
        messages.push(ToolMessage::ToolResult(FunctionResult {
            name: call.name.clone(),
            response: response.clone(),
        }));
        sink.emit(
            events::AGENT_TOOL_CALL_END,
            json!({ "round": round, "name": call.name, "ok": false, "summary": err }),
        );
        return ToolCallRecord {
            round,
            name: call.name.clone(),
            args: call.args.clone(),
            ok: false,
            summary: err,
        };
    }

    let args_map = match call.args.as_object() {
        Some(m) => m
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect::<HashMap<String, Value>>(),
        None => HashMap::new(),
    };

    match driver.call(&call.name, args_map).await {
        Ok(result) => {
            // Build response payload for the model.
            let mut payload = json!({
                "ok": true,
                "summary": result.text(),
            });

            // For screenshots, also feed the image back so the model can
            // actually see the screen. Gemini doesn't support inline images
            // inside function_response, so we attach the image as a
            // follow-up user image part in the next turn.
            let mut attached_image: Option<(String, String)> = None;
            if let Some((data, mime)) = result.first_image() {
                attached_image = Some((mime.to_string(), data.to_string()));
                if let Some(obj) = payload.as_object_mut() {
                    obj.insert("image".into(), json!({
                        "mimeType": mime,
                        "note": "image attached as follow-up user image part",
                    }));
                }
            }

            let summary = result.text();
            messages.push(ToolMessage::ToolResult(FunctionResult {
                name: call.name.clone(),
                response: payload,
            }));
            if let Some((mime, data)) = attached_image {
                messages.push(ToolMessage::UserImage { mime_type: mime, data });
            }

            sink.emit(
                events::AGENT_TOOL_CALL_END,
                json!({ "round": round, "name": call.name, "ok": true, "summary": summary }),
            );
            ToolCallRecord {
                round,
                name: call.name.clone(),
                args: call.args.clone(),
                ok: true,
                summary,
            }
        }
        Err(e) => {
            let err = e.to_string();
            log::warn!("[agent] tool '{}' failed: {}", call.name, err);
            messages.push(ToolMessage::ToolResult(FunctionResult {
                name: call.name.clone(),
                response: json!({ "ok": false, "error": err }),
            }));
            sink.emit(
                events::AGENT_TOOL_CALL_END,
                json!({ "round": round, "name": call.name, "ok": false, "summary": err }),
            );
            ToolCallRecord {
                round,
                name: call.name.clone(),
                args: call.args.clone(),
                ok: false,
                summary: err,
            }
        }
    }
}
