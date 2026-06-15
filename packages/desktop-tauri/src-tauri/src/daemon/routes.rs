//! HTTP route handlers — thin wrappers over the same backend modules that
//! Tauri commands use. Every handler returns a JSON body or an error
//! response. SSE event stream lives in [`sse_events`].
//!
//! Routes are organized as nested axum `Router`s, one per domain. The
//! parent router (in [`super::server`]) mounts them under `/v1`.

use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::{Json, Path, Query, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    routing::{delete, get, post, put},
    Router,
};
use futures_util::stream::Stream;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::agent::{run_user_turn, AlwaysApprove, ConfirmGate, CuaDriverClient};
use crate::ai::{
    types::{ChatMessage, ToolMessage},
    AiProvider, AnthropicClient, GeminiClient, LocalProvider, OpenAiClient,
};
use crate::commands::debug_cmd::{DebugEvent, DebugEventType};
use crate::commands::gesture_cmd::{GestureConfig, GestureEvent};
use crate::commands::life_tree_cmd::ExperimentProposal;
use crate::commands::summarizer_cmd::ActivityStats;
use crate::daemon::events::EventBus;
use crate::event_sink::SharedSink;
use crate::events as ev;
use crate::gaze::data_buffer::GazeDataBuffer;
use crate::gaze::inference::GazeModel;
use crate::life_tree;
use crate::life_tree::types::{ExperimentPhase, LifeTreeNode};
use crate::models::manager::DownloadProgress;
use crate::models::registry::{self as model_registry, ModelType};
use crate::observe::activity_log::ActivitySummary;
use crate::observe::adaptive_refresh::ActivityEventType;
use crate::observe::intent::{IntentRecognizer, RecognitionInput};
use crate::observe::ObserveLoop;
use crate::perception;
use crate::state::{AppState, GazedEntity};
use crate::training::collector::{TrainingSample, TurnContext, TurnFeedback};
use crate::voice::speech;

/// Shared context handed to every route handler.
#[derive(Clone)]
pub struct AppCtx {
    pub state: Arc<AppState>,
    pub bus: EventBus,
    pub sink: SharedSink,
}

/// Build the full `/v1/*` router. The caller (server.rs) mounts this and
/// layers the bearer-token middleware around it.
pub fn build_router(ctx: AppCtx) -> Router {
    Router::new()
        // Status / config
        .route("/v1/status", get(get_status))
        .route("/v1/config", get(get_config).put(put_config))
        // AI / chat
        .route("/v1/ai/init", post(init_ai))
        .route("/v1/ai/chat", post(chat))
        .route("/v1/ai/chat-with-gaze-context", post(chat_with_gaze_context))
        // Agent
        .route("/v1/agent/status", get(agent_status))
        .route("/v1/agent/start", post(agent_start))
        .route("/v1/agent/chat", post(agent_chat))
        .route("/v1/agent/confirm", post(agent_confirm_route))
        .route("/v1/agent/tool/:name", post(agent_invoke_tool))
        // Perception
        .route("/v1/perception/screenshot", post(perception_screenshot))
        .route("/v1/perception/ocr", post(perception_ocr))
        .route("/v1/perception/analyze", post(perception_analyze))
        .route("/v1/perception/window", get(perception_window))
        // Observe
        .route("/v1/observe/start", post(observe_start))
        .route("/v1/observe/stop", post(observe_stop))
        .route("/v1/observe/status", get(observe_status))
        // Gaze
        .route("/v1/gaze/sample", post(gaze_submit_sample))
        .route("/v1/gaze/predict", post(gaze_predict))
        .route("/v1/gaze/train", post(gaze_train))
        .route("/v1/gaze/training-status", get(gaze_training_status))
        .route(
            "/v1/gaze/entity",
            get(gaze_get_entity).put(gaze_set_entity).delete(gaze_clear_entity),
        )
        // Life tree
        .route("/v1/life-tree", get(life_tree_get))
        .route("/v1/life-tree/rebuild", post(life_tree_rebuild))
        // Speech
        .route("/v1/speech/status", get(speech_status_route))
        .route("/v1/speech/listen", post(speech_listen_route))
        .route("/v1/speech/listen-apple", post(speech_listen_apple))
        .route("/v1/speech/transcribe-file", post(speech_transcribe_file_route))
        // Models
        .route("/v1/models/dir", get(models_get_dir))
        .route("/v1/models", get(models_list))
        .route("/v1/models/recommended", get(models_recommended))
        .route("/v1/models/by-type/:model_type", get(models_by_type))
        .route("/v1/models/download/cancel", post(models_cancel_download))
        .route("/v1/models/:id/exists", get(models_exists))
        .route("/v1/models/:id/download", post(models_download))
        .route("/v1/models/:id/path", get(models_path))
        .route("/v1/models/:id", delete(models_delete))
        // Debug timeline
        .route(
            "/v1/debug/events",
            get(debug_list_events).post(debug_push_event).delete(debug_clear_events),
        )
        .route("/v1/debug/events/since/:since_ms", get(debug_events_since))
        .route("/v1/debug/events/search", get(debug_search_events))
        .route("/v1/debug/status", get(debug_get_status))
        .route("/v1/debug/pause", post(debug_pause))
        .route("/v1/debug/resume", post(debug_resume))
        // Intent
        .route("/v1/intent/recent", get(intent_recent))
        .route("/v1/intent/recognize", post(intent_recognize))
        .route("/v1/intent/recognize-ai", post(intent_recognize_ai))
        // Life-tree experiments
        .route("/v1/life-tree/nodes/:node_id/propose-experiment", post(life_tree_propose_experiment))
        .route("/v1/life-tree/experiments", get(life_tree_get_experiments).post(life_tree_start_experiment))
        .route("/v1/life-tree/experiments/:exp_id/conclude", post(life_tree_conclude_experiment))
        .route("/v1/life-tree/unlocked-phase", get(life_tree_unlocked_phase))
        // Summarizer
        .route("/v1/summary/generate", post(summary_generate))
        .route("/v1/summary/recent", get(summary_recent))
        .route("/v1/summary/activity-stats", get(summary_activity_stats))
        // Training collector
        .route("/v1/training/samples", post(training_save_sample))
        .route("/v1/training/samples/:session_id/rate", post(training_rate_sample))
        .route("/v1/training/stats", get(training_stats))
        .route("/v1/training/export", post(training_export))
        // Gesture
        .route("/v1/gesture/event", post(gesture_event))
        .route("/v1/gesture/status", get(gesture_status))
        .route("/v1/gesture/config", put(gesture_set_config))
        .route("/v1/gesture/enabled", post(gesture_set_enabled))
        // Adaptive refresh
        .route("/v1/adaptive/record-activity", post(adaptive_record_activity))
        .route("/v1/adaptive/refresh-status", get(adaptive_refresh_status))
        // Auto-updater (stubs except version)
        .route("/v1/updater/check", post(updater_check))
        .route("/v1/updater/install", post(updater_install))
        .route("/v1/updater/version", get(updater_version))
        // Misc
        .route("/v1/clipboard", get(clipboard_get))
        .route("/v1/util/open-url", post(util_open_url))
        .route("/v1/gaze/model", delete(gaze_model_clear))
        .route("/v1/gaze/load-weights", post(gaze_load_weights))
        .route("/v1/gaze/training/trigger", post(gaze_training_trigger))
        // Look-to-Explain — gaze (x,y) + mode → cropped OCR → AI → HTML
        .route("/v1/explain", post(explain_gaze_target))
        // SSE events bus
        .route("/v1/events", get(sse_events))
        .with_state(ctx)
}

// ──────────────────────────────────────────────────────────────────────
// Errors
// ──────────────────────────────────────────────────────────────────────

/// Uniform error envelope so callers always get `{"error": "..."}` with
/// the appropriate status code instead of a plain text body.
pub struct ApiError(pub StatusCode, pub String);

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl<E: std::fmt::Display> From<E> for ApiError {
    fn from(e: E) -> Self {
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    }
}

fn bad_request(msg: impl Into<String>) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, msg.into())
}

// ──────────────────────────────────────────────────────────────────────
// Status / config
// ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct StatusResponse {
    initialized: bool,
    ai_ready: bool,
    ai_provider: Option<String>,
    observe_running: bool,
    daemon: bool,
    version: &'static str,
}

async fn get_status(State(ctx): State<AppCtx>) -> Json<StatusResponse> {
    let ai = ctx.state.ai_client.read().await;
    let observe = ctx.state.observe_loop.read().await;
    Json(StatusResponse {
        initialized: true,
        ai_ready: ai.is_some(),
        ai_provider: ai.as_ref().map(|p| p.provider_name().to_string()),
        observe_running: observe.is_some(),
        daemon: true,
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn get_config(State(ctx): State<AppCtx>) -> Json<Value> {
    let cfg = ctx.state.config.read().await.clone();
    Json(serde_json::to_value(&cfg).unwrap_or(Value::Null))
}

async fn put_config(
    State(ctx): State<AppCtx>,
    Json(new_cfg): Json<crate::config::AppConfig>,
) -> Result<Json<Value>, ApiError> {
    crate::config::save_config(&new_cfg)?;
    *ctx.state.config.write().await = new_cfg.clone();
    Ok(Json(serde_json::to_value(&new_cfg).unwrap_or(Value::Null)))
}

// ──────────────────────────────────────────────────────────────────────
// AI / chat
// ──────────────────────────────────────────────────────────────────────

async fn init_ai(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let cfg = ctx.state.config.read().await.clone();
    let client: Arc<dyn AiProvider> = match cfg.ai_provider.as_str() {
        "local" | "llama-cpp" => {
            let id = cfg
                .local_model_id
                .ok_or_else(|| bad_request("no local_model_id configured"))?;
            let mgr = ctx.state.model_manager.read().await;
            let path = mgr
                .model_path(&id)
                .ok_or_else(|| bad_request(format!("model '{}' not downloaded", id)))?;
            Arc::new(LocalProvider::load(path, Some(id))?)
        }
        "openai" => {
            let key = cfg
                .openai_api_key
                .ok_or_else(|| bad_request("openai_api_key missing"))?;
            Arc::new(OpenAiClient::new(key, cfg.openai_model, cfg.openai_base_url))
        }
        "anthropic" => {
            let key = cfg
                .anthropic_api_key
                .ok_or_else(|| bad_request("anthropic_api_key missing"))?;
            Arc::new(AnthropicClient::new(key, cfg.anthropic_model, cfg.anthropic_base_url))
        }
        // Custom = any OpenAI-compatible endpoint; key optional (vLLM/Ollama
        // often run keyless).
        "custom" => {
            let base = cfg
                .custom_base_url
                .ok_or_else(|| bad_request("custom_base_url missing"))?;
            let key = cfg.custom_api_key.unwrap_or_default();
            Arc::new(OpenAiClient::new(key, cfg.custom_model, Some(base)))
        }
        _ => {
            let key = cfg
                .gemini_api_key
                .ok_or_else(|| bad_request("gemini_api_key missing"))?;
            Arc::new(GeminiClient::new(key, cfg.gemini_model, cfg.gemini_base_url))
        }
    };

    client.validate().await?;
    let provider = client.provider_name().to_string();
    let model = client.model_name().to_string();
    *ctx.state.ai_client.write().await = Some(client);
    ctx.bus.sender().send(crate::daemon::events::Frame {
        name: ev::AI_INITIALIZED.to_string(),
        payload: json!(true),
    }).ok();
    Ok(Json(json!({ "ok": true, "provider": provider, "model": model })))
}

#[derive(Deserialize)]
struct ChatReq {
    messages: Vec<ChatMessage>,
}

async fn chat(
    State(ctx): State<AppCtx>,
    Json(req): Json<ChatReq>,
) -> Result<Json<Value>, ApiError> {
    let provider = ctx
        .state
        .ai_client
        .read()
        .await
        .as_ref()
        .cloned()
        .ok_or_else(|| bad_request("AI not initialized"))?;
    let resp = provider.chat(req.messages).await?;
    Ok(Json(serde_json::to_value(resp)?))
}

async fn chat_with_gaze_context(
    State(ctx): State<AppCtx>,
    Json(mut req): Json<ChatReq>,
) -> Result<Json<Value>, ApiError> {
    let provider = ctx
        .state
        .ai_client
        .read()
        .await
        .as_ref()
        .cloned()
        .ok_or_else(|| bad_request("AI not initialized"))?;

    if let Some(entity) = ctx.state.current_gazed_entity.read().await.as_ref().cloned() {
        let referent = match &entity.entity_type {
            Some(t) => format!("「{}」({})", entity.text.trim(), t),
            None => format!("「{}」", entity.text.trim()),
        };
        if let Some(last) = req.messages.iter_mut().rev().find(|m| m.role == "user") {
            for n in ["这个", "那个", "this", "that", "这", "那"] {
                last.content = last.content.replace(n, &referent);
            }
        }
    }

    let resp = provider.chat(req.messages).await?;
    Ok(Json(serde_json::to_value(resp)?))
}

// ──────────────────────────────────────────────────────────────────────
// Agent
// ──────────────────────────────────────────────────────────────────────

async fn agent_status(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let sup = ctx.state.agent_supervisor.read().await;
    match sup.as_ref() {
        Some(s) => Ok(Json(json!({
            "binaryInstalled": s.binary_path().is_some(),
            "binaryPath": s.binary_path().map(|p| p.display().to_string()),
            "daemonRunning": s.client().is_running().await,
            "socketPath": s.client().socket_path().display().to_string(),
        }))),
        None => Err(bad_request("agent supervisor not initialized")),
    }
}

async fn agent_start(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let sup = ctx.state.agent_supervisor.read().await;
    let s = sup
        .as_ref()
        .ok_or_else(|| bad_request("agent supervisor not initialized"))?;
    s.ensure_running().await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct AgentChatReq {
    history: Vec<ChatMessage>,
    user_input: String,
    /// `false` keeps the daemon's default — auto-approve. Set `true` from
    /// a host that wants to wire its own confirm UI to /v1/agent/confirm.
    #[serde(default)]
    require_confirmation: bool,
}

async fn agent_chat(
    State(ctx): State<AppCtx>,
    Json(req): Json<AgentChatReq>,
) -> Result<Json<Value>, ApiError> {
    let provider = ctx
        .state
        .ai_client
        .read()
        .await
        .as_ref()
        .cloned()
        .ok_or_else(|| bad_request("AI not initialized"))?;

    let driver: Option<CuaDriverClient> = {
        let sup = ctx.state.agent_supervisor.read().await;
        match sup.as_ref() {
            Some(s) if s.client().is_running().await => Some(s.client().clone()),
            _ => None,
        }
    };

    let mut tool_history: Vec<ToolMessage> = Vec::with_capacity(req.history.len());
    for m in req.history {
        match m.role.as_str() {
            "user" => tool_history.push(ToolMessage::User(m.content)),
            "assistant" => tool_history.push(ToolMessage::Assistant(m.content)),
            _ => {}
        }
    }

    let gate: Arc<dyn ConfirmGate> = if req.require_confirmation {
        Arc::new(EventBusConfirmGate {
            bus: ctx.bus.clone(),
            state: Arc::clone(&ctx.state),
        })
    } else {
        Arc::new(AlwaysApprove)
    };

    let result =
        run_user_turn(ctx.sink.clone(), provider, driver, gate, tool_history, req.user_input)
            .await?;
    Ok(Json(serde_json::to_value(result)?))
}

#[derive(Deserialize)]
struct AgentConfirmReq {
    confirm_id: String,
    accept: bool,
}

async fn agent_confirm_route(
    State(ctx): State<AppCtx>,
    Json(req): Json<AgentConfirmReq>,
) -> Result<Json<Value>, ApiError> {
    let tx = ctx
        .state
        .pending_confirms
        .write()
        .await
        .remove(&req.confirm_id);
    match tx {
        Some(sender) => {
            let _ = sender.send(req.accept);
            Ok(Json(json!({ "ok": true })))
        }
        None => Err(bad_request(format!(
            "no pending confirmation for id '{}'",
            req.confirm_id
        ))),
    }
}

/// EventBus-driven gate for the daemon — emits a Frame on the SSE bus and
/// waits up to 30s for the host to POST /v1/agent/confirm.
struct EventBusConfirmGate {
    bus: EventBus,
    state: Arc<AppState>,
}

#[axum::async_trait]
impl ConfirmGate for EventBusConfirmGate {
    async fn confirm(&self, call: &crate::ai::types::FunctionCall, round: usize) -> bool {
        use tokio::sync::oneshot;
        let confirm_id = format!(
            "{}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0),
            call.name
        );
        let (tx, rx) = oneshot::channel::<bool>();
        self.state
            .pending_confirms
            .write()
            .await
            .insert(confirm_id.clone(), tx);

        let _ = self.bus.sender().send(crate::daemon::events::Frame {
            name: ev::AGENT_CONFIRM_NEEDED.to_string(),
            payload: json!({
                "confirmId": confirm_id,
                "round": round,
                "name": call.name,
                "args": call.args,
            }),
        });

        let res = tokio::time::timeout(Duration::from_secs(30), rx).await;
        self.state.pending_confirms.write().await.remove(&confirm_id);
        matches!(res, Ok(Ok(true)))
    }
}

#[derive(Deserialize)]
struct InvokeToolReq {
    args: Value,
}

async fn agent_invoke_tool(
    State(ctx): State<AppCtx>,
    Path(name): Path<String>,
    Json(req): Json<InvokeToolReq>,
) -> Result<Json<Value>, ApiError> {
    if !crate::agent::tools::is_allowed(&name) {
        return Err(bad_request(format!("tool '{}' not in allow-list", name)));
    }
    let sup = ctx.state.agent_supervisor.read().await;
    let s = sup
        .as_ref()
        .ok_or_else(|| bad_request("agent supervisor not initialized"))?;
    let args_map = req
        .args
        .as_object()
        .map(|m| m.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default();
    let result = s.client().call(&name, args_map).await?;
    Ok(Json(json!({
        "ok": !result.is_error,
        "summary": result.text(),
        "hasImage": result.first_image().is_some(),
    })))
}

// ──────────────────────────────────────────────────────────────────────
// Perception
// ──────────────────────────────────────────────────────────────────────

async fn perception_screenshot() -> Result<Json<Value>, ApiError> {
    let (data, w, h) = perception::screen::capture_screenshot().await?;
    Ok(Json(json!({
        "ok": true,
        "dataUrl": format!("data:image/png;base64,{}", data),
        "width": w,
        "height": h,
    })))
}

#[derive(Deserialize)]
struct OcrReq {
    image_base64: String,
}

async fn perception_ocr(Json(req): Json<OcrReq>) -> Result<Json<Value>, ApiError> {
    let result = perception::ocr::run_ocr(&req.image_base64).await?;
    Ok(Json(json!({
        "ok": true,
        "text": result.text,
        "regions": result.regions,
        "durationMs": result.duration_ms,
        "backend": result.backend,
    })))
}

#[derive(Deserialize)]
struct AnalyzeReq {
    image_base64: String,
    prompt: Option<String>,
}

async fn perception_analyze(
    State(ctx): State<AppCtx>,
    Json(req): Json<AnalyzeReq>,
) -> Result<Json<Value>, ApiError> {
    let provider_choice = ctx
        .state
        .config
        .read()
        .await
        .vision_provider
        .clone()
        .unwrap_or_else(|| "apple".to_string());

    match provider_choice.as_str() {
        "apple" => {
            let r = perception::ocr::run_ocr(&req.image_base64).await?;
            Ok(Json(json!({
                "ok": true,
                "provider": "apple",
                "text": r.text,
                "regions": r.regions,
                "durationMs": r.duration_ms,
            })))
        }
        "gemini" | "openai" => {
            let client = ctx
                .state
                .ai_client
                .read()
                .await
                .as_ref()
                .cloned()
                .ok_or_else(|| bad_request("AI not initialized"))?;
            let prompt = req.prompt.unwrap_or_else(|| {
                "Describe what's on screen. Extract visible text verbatim.".to_string()
            });
            let resp = client
                .chat_with_vision(vec![ChatMessage { role: "user".into(), content: prompt }], &req.image_base64)
                .await?;
            Ok(Json(json!({
                "ok": true,
                "provider": provider_choice,
                "text": resp.text,
                "durationMs": resp.duration_ms,
            })))
        }
        other => Err(bad_request(format!("unknown vision provider '{}'", other))),
    }
}

async fn perception_window() -> Result<Json<Value>, ApiError> {
    let info = perception::window::get_active_window().await?;
    Ok(Json(serde_json::to_value(info)?))
}

// ──────────────────────────────────────────────────────────────────────
// Observe
// ──────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Default)]
struct ObserveStartReq {
    #[serde(default = "default_interval")]
    interval_ms: u64,
    #[serde(default = "default_threshold")]
    change_threshold: f64,
}
fn default_interval() -> u64 { 3000 }
fn default_threshold() -> f64 { 0.05 }

async fn observe_start(
    State(ctx): State<AppCtx>,
    Json(req): Json<ObserveStartReq>,
) -> Result<Json<Value>, ApiError> {
    let mut handle = ctx.state.observe_loop.write().await;
    if handle.is_some() {
        return Ok(Json(json!({ "ok": true, "alreadyRunning": true })));
    }
    let loop_ =
        ObserveLoop::start(ctx.sink.clone(), Arc::clone(&ctx.state), req.interval_ms, req.change_threshold);
    *handle = Some(loop_);
    Ok(Json(json!({ "ok": true })))
}

async fn observe_stop(State(ctx): State<AppCtx>) -> Json<Value> {
    let mut handle = ctx.state.observe_loop.write().await;
    if let Some(l) = handle.take() {
        l.stop();
    }
    Json(json!({ "ok": true }))
}

async fn observe_status(State(ctx): State<AppCtx>) -> Json<Value> {
    let running = ctx.state.observe_loop.read().await.is_some();
    let last = ctx.state.last_observation.read().await.clone();
    Json(json!({
        "running": running,
        "lastObservation": last,
    }))
}

// ──────────────────────────────────────────────────────────────────────
// Gaze
// ──────────────────────────────────────────────────────────────────────

async fn gaze_submit_sample(
    State(ctx): State<AppCtx>,
    Json(sample): Json<crate::gaze::data_buffer::GazeSample>,
) -> Json<Value> {
    let count = ctx.state.gaze_buffer.write().await.add_sample(sample);
    Json(json!({ "count": count }))
}

#[derive(Deserialize)]
struct PredictReq {
    features: Vec<f32>,
}

async fn gaze_predict(
    State(ctx): State<AppCtx>,
    Json(req): Json<PredictReq>,
) -> Result<Json<Value>, ApiError> {
    if req.features.len() != 40 {
        return Err(bad_request(format!(
            "expected 40 features, got {}",
            req.features.len()
        )));
    }
    let model = ctx.state.gaze_model.read().await;
    let m = model.as_ref().ok_or_else(|| bad_request("no gaze model loaded"))?;
    Ok(Json(serde_json::to_value(m.predict_timed(&req.features))?))
}

async fn gaze_train(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let count = ctx.state.gaze_buffer.read().await.sample_count();
    if count < 10 {
        return Err(bad_request(format!("need 10 samples, have {}", count)));
    }
    let is_running = *ctx.state.gaze_training_active.read().await;
    if is_running {
        return Err(bad_request("training already running"));
    }

    // Spawn in background — return immediately. Progress events flow into
    // the broadcast bus via ctx.sink and reach SSE subscribers on
    // /v1/events?filter=gaze:.
    let sink = ctx.sink.clone();
    let state = Arc::clone(&ctx.state);
    tokio::spawn(async move {
        if let Err(e) = crate::gaze::ane_runner::run_training(sink, state).await {
            log::error!("[Gaze] daemon-triggered training failed: {}", e);
        }
    });
    Ok(Json(json!({ "ok": true, "started": true })))
}

async fn gaze_training_status(State(ctx): State<AppCtx>) -> Json<Value> {
    let buf = ctx.state.gaze_buffer.read().await;
    let model = ctx.state.gaze_model.read().await;
    let training = *ctx.state.gaze_training_active.read().await;
    Json(json!({
        "sampleCount": buf.sample_count(),
        "newSampleCount": buf.new_sample_count(),
        "isTraining": training,
        "trainLoss": model.as_ref().map(|m| m.train_loss),
        "modelReady": model.is_some(),
        "aneAvailable": crate::gaze::ane_runner::is_available(),
    }))
}

async fn gaze_get_entity(State(ctx): State<AppCtx>) -> Json<Value> {
    Json(serde_json::to_value(
        ctx.state.current_gazed_entity.read().await.clone(),
    ).unwrap_or(Value::Null))
}

async fn gaze_set_entity(
    State(ctx): State<AppCtx>,
    Json(entity): Json<GazedEntity>,
) -> Json<Value> {
    let _ = ctx.bus.sender().send(crate::daemon::events::Frame {
        name: ev::GAZE_ENTITY_CHANGED.to_string(),
        payload: serde_json::to_value(&entity).unwrap_or(Value::Null),
    });
    *ctx.state.current_gazed_entity.write().await = Some(entity);
    Json(json!({ "ok": true }))
}

async fn gaze_clear_entity(State(ctx): State<AppCtx>) -> Json<Value> {
    *ctx.state.current_gazed_entity.write().await = None;
    let _ = ctx.bus.sender().send(crate::daemon::events::Frame {
        name: ev::GAZE_ENTITY_CLEARED.to_string(),
        payload: Value::Null,
    });
    Json(json!({ "ok": true }))
}

// ──────────────────────────────────────────────────────────────────────
// Life tree
// ──────────────────────────────────────────────────────────────────────

async fn life_tree_get(State(ctx): State<AppCtx>) -> Json<Value> {
    let tree = ctx.state.life_tree.read().await;
    Json(serde_json::to_value(tree.snapshot()).unwrap_or(Value::Null))
}

async fn life_tree_rebuild(State(ctx): State<AppCtx>) -> Json<Value> {
    let mut tree = ctx.state.life_tree.write().await;
    *tree = life_tree::LifeTree::default();
    Json(serde_json::to_value(tree.snapshot()).unwrap_or(Value::Null))
}

// ──────────────────────────────────────────────────────────────────────
// Speech
// ──────────────────────────────────────────────────────────────────────

async fn speech_status_route() -> Result<Json<Value>, ApiError> {
    Ok(Json(serde_json::to_value(speech::check_status().await?)?))
}

#[derive(Deserialize, Default)]
struct ListenReq {
    #[serde(default)]
    duration_secs: Option<u32>,
}

async fn speech_listen_route(
    State(ctx): State<AppCtx>,
    Json(req): Json<ListenReq>,
) -> Result<Json<Value>, ApiError> {
    let provider = ctx
        .state
        .config
        .read()
        .await
        .speech_provider
        .clone()
        .unwrap_or_else(|| "apple".to_string());
    let duration = req.duration_secs.unwrap_or(5);
    if provider != "apple" {
        return Err(ApiError(
            StatusCode::NOT_IMPLEMENTED,
            format!("speech provider '{}' not yet wired", provider),
        ));
    }
    let result = speech::listen(duration).await?;
    Ok(Json(serde_json::to_value(result)?))
}

// ──────────────────────────────────────────────────────────────────────
// SSE
// ──────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Default)]
struct SseQuery {
    /// Optional comma-separated list of event-name prefixes to subscribe to
    /// (e.g. "gaze:,agent:"). Empty means all events.
    #[serde(default)]
    filter: Option<String>,
    /// Bearer token fallback for browsers — `EventSource` can't send custom
    /// headers, so the GUI passes `?token=<persisted>` instead. The auth
    /// middleware runs against the Authorization header, so this query
    /// param is converted to that header in a pre-handler middleware
    /// (see `server.rs::eventsource_token_promote`).
    #[serde(default)]
    token: Option<String>,
}

async fn sse_events(
    State(ctx): State<AppCtx>,
    Query(q): Query<SseQuery>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    use tokio_stream::wrappers::BroadcastStream;
    use tokio_stream::StreamExt;

    let prefixes: Vec<String> = q
        .filter
        .map(|s| s.split(',').map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect())
        .unwrap_or_default();

    let rx = ctx.bus.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(move |msg| {
        let frame = msg.ok()?;
        if !prefixes.is_empty() && !prefixes.iter().any(|p| frame.name.starts_with(p)) {
            return None;
        }
        let data = serde_json::to_string(&frame.payload).ok()?;
        Some(Ok(Event::default().event(frame.name).data(data)))
    });

    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

// ══════════════════════════════════════════════════════════════════════
// Phase-1 additions: every remaining IPC command exposed over HTTP.
// ══════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────
// Model manager
// ──────────────────────────────────────────────────────────────────────

async fn models_get_dir(State(ctx): State<AppCtx>) -> Json<Value> {
    let mgr = ctx.state.model_manager.read().await;
    Json(json!({ "dir": mgr.models_dir().to_string_lossy() }))
}

async fn models_list(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let mgr = ctx.state.model_manager.read().await;
    let models = mgr.list_models().map_err(bad_request)?;
    Ok(Json(serde_json::to_value(models)?))
}

async fn models_recommended() -> Json<Value> {
    Json(serde_json::to_value(model_registry::recommended_models()).unwrap_or(Value::Null))
}

async fn models_by_type(Path(model_type): Path<String>) -> Result<Json<Value>, ApiError> {
    let mt: ModelType = serde_json::from_value(Value::String(model_type.clone()))
        .map_err(|_| bad_request(format!("unknown model_type '{}'", model_type)))?;
    Ok(Json(
        serde_json::to_value(model_registry::get_models_by_type(&mt))?,
    ))
}

async fn models_exists(State(ctx): State<AppCtx>, Path(id): Path<String>) -> Json<Value> {
    let mgr = ctx.state.model_manager.read().await;
    Json(json!({ "exists": mgr.model_exists(&id) }))
}

async fn models_download(
    State(ctx): State<AppCtx>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let info = model_registry::get_model_by_id(&id)
        .ok_or_else(|| bad_request(format!("Unknown model ID: {}", id)))?;
    let sink = ctx.sink.clone();
    let mut mgr = ctx.state.model_manager.write().await;
    let result = mgr
        .download_model(&info, move |progress: DownloadProgress| {
            let payload = serde_json::to_value(&progress).unwrap_or(Value::Null);
            sink.emit(ev::MODEL_DOWNLOAD_PROGRESS, payload);
        })
        .await
        .map_err(bad_request)?;
    Ok(Json(serde_json::to_value(result)?))
}

async fn models_cancel_download(State(ctx): State<AppCtx>) -> Json<Value> {
    let mut mgr = ctx.state.model_manager.write().await;
    mgr.cancel_download();
    Json(json!({ "ok": true }))
}

async fn models_delete(
    State(ctx): State<AppCtx>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let mgr = ctx.state.model_manager.read().await;
    mgr.delete_model(&id).map_err(bad_request)?;
    Ok(Json(json!({ "ok": true })))
}

async fn models_path(State(ctx): State<AppCtx>, Path(id): Path<String>) -> Json<Value> {
    let mgr = ctx.state.model_manager.read().await;
    let path = mgr.model_path(&id).map(|p| p.to_string_lossy().to_string());
    Json(json!({ "path": path }))
}

// ──────────────────────────────────────────────────────────────────────
// Debug timeline
// ──────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Default)]
struct DebugListQuery {
    #[serde(default)]
    types: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

fn parse_debug_types(raw: &str) -> Result<Vec<DebugEventType>, ApiError> {
    raw.split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| {
            serde_json::from_value::<DebugEventType>(Value::String(s.to_string()))
                .map_err(|e| bad_request(format!("unknown debug event type '{}': {}", s, e)))
        })
        .collect()
}

async fn debug_list_events(
    State(ctx): State<AppCtx>,
    Query(q): Query<DebugListQuery>,
) -> Result<Json<Value>, ApiError> {
    let types = match q.types.as_deref() {
        Some(raw) => Some(parse_debug_types(raw)?),
        None => None,
    };
    let timeline = ctx.state.debug_timeline.read().await;
    let events = timeline.get_events(types.as_deref(), q.limit);
    Ok(Json(serde_json::to_value(events)?))
}

async fn debug_events_since(
    State(ctx): State<AppCtx>,
    Path(since_ms): Path<u64>,
) -> Result<Json<Value>, ApiError> {
    let timeline = ctx.state.debug_timeline.read().await;
    Ok(Json(serde_json::to_value(timeline.get_since(since_ms))?))
}

#[derive(Deserialize)]
struct DebugSearchQuery {
    #[serde(default)]
    q: Option<String>,
}

async fn debug_search_events(
    State(ctx): State<AppCtx>,
    Query(query): Query<DebugSearchQuery>,
) -> Result<Json<Value>, ApiError> {
    let needle = query.q.unwrap_or_default();
    if needle.is_empty() {
        return Err(bad_request("missing required query parameter 'q'"));
    }
    let timeline = ctx.state.debug_timeline.read().await;
    Ok(Json(serde_json::to_value(timeline.search(&needle))?))
}

#[derive(Deserialize)]
struct DebugPushReq {
    event_type: DebugEventType,
    label: String,
    data: Value,
    #[serde(default)]
    duration_ms: Option<u64>,
}

async fn debug_push_event(
    State(ctx): State<AppCtx>,
    Json(req): Json<DebugPushReq>,
) -> Result<Json<Value>, ApiError> {
    let mut timeline = ctx.state.debug_timeline.write().await;
    let pushed: Option<DebugEvent> =
        timeline.push(req.event_type, req.label, req.data, req.duration_ms, None);
    Ok(Json(json!({ "ok": pushed.is_some(), "event": pushed })))
}

async fn debug_get_status(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let timeline = ctx.state.debug_timeline.read().await;
    Ok(Json(serde_json::to_value(timeline.status())?))
}

async fn debug_pause(State(ctx): State<AppCtx>) -> Json<Value> {
    let mut timeline = ctx.state.debug_timeline.write().await;
    timeline.set_paused(true);
    Json(json!({ "ok": true, "paused": true }))
}

async fn debug_resume(State(ctx): State<AppCtx>) -> Json<Value> {
    let mut timeline = ctx.state.debug_timeline.write().await;
    timeline.set_paused(false);
    Json(json!({ "ok": true, "paused": false }))
}

async fn debug_clear_events(State(ctx): State<AppCtx>) -> Json<Value> {
    let mut timeline = ctx.state.debug_timeline.write().await;
    timeline.clear();
    Json(json!({ "ok": true }))
}

// ──────────────────────────────────────────────────────────────────────
// Intent pipeline
// ──────────────────────────────────────────────────────────────────────

async fn build_intent_input(state: &Arc<AppState>) -> Result<RecognitionInput, ApiError> {
    let obs = state.last_observation.read().await;
    let o = obs
        .as_ref()
        .ok_or_else(|| bad_request("No observation available. Start observe first."))?;
    Ok(RecognitionInput {
        app_name: o.active_window.as_ref().map(|w| w.app_name.clone()),
        window_title: o.active_window.as_ref().map(|w| w.title.clone()),
        ocr_text: o.ocr_text.clone(),
        clipboard: None,
    })
}

async fn intent_recent(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let recognizer = ctx.state.intent_recognizer.read().await;
    Ok(Json(serde_json::to_value(recognizer.recent_intents())?))
}

async fn intent_recognize(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let input = build_intent_input(&ctx.state).await?;
    let mut recognizer = ctx.state.intent_recognizer.write().await;
    let intents = recognizer.recognize(&input);
    Ok(Json(serde_json::to_value(intents)?))
}

async fn intent_recognize_ai(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let input = build_intent_input(&ctx.state).await?;

    let rule_intents = {
        let mut recognizer = ctx.state.intent_recognizer.write().await;
        recognizer.recognize(&input)
    };

    let ai = ctx.state.ai_client.read().await;
    let client = match ai.as_ref() {
        Some(c) => c.clone(),
        None => return Ok(Json(serde_json::to_value(rule_intents)?)),
    };
    drop(ai);

    let prompt = IntentRecognizer::build_ai_prompt(&input, &rule_intents);
    let messages = vec![ChatMessage { role: "user".to_string(), content: prompt }];

    match client.chat(messages).await {
        Ok(response) => {
            let merged = IntentRecognizer::merge_ai_response(&rule_intents, &response.text);
            Ok(Json(serde_json::to_value(merged)?))
        }
        Err(e) => {
            log::warn!("[Intent] AI enhancement failed: {}", e);
            Ok(Json(serde_json::to_value(rule_intents)?))
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// Life tree — experiments
// ──────────────────────────────────────────────────────────────────────

async fn life_tree_propose_experiment(
    State(ctx): State<AppCtx>,
    Path(node_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let messages = {
        let tree = ctx.state.life_tree.read().await;
        tree.build_experiment_prompt(&node_id).map_err(bad_request)?
    };

    let client = ctx
        .state
        .ai_client
        .read()
        .await
        .as_ref()
        .cloned()
        .ok_or_else(|| bad_request("AI not initialized"))?;

    let response = client.chat(messages).await?;
    let text = response.text.trim();
    let json_str = if text.contains("```") {
        text.lines()
            .skip_while(|l| !l.starts_with('{'))
            .take_while(|l| !l.starts_with("```"))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        text.to_string()
    };

    let proposal: ExperimentProposal = serde_json::from_str(&json_str).map_err(|e| {
        bad_request(format!("Failed to parse AI response: {}. Raw: {}", e, text))
    })?;
    Ok(Json(serde_json::to_value(proposal)?))
}

#[derive(Deserialize)]
struct StartExperimentReq {
    node_id: String,
    title: String,
    description: String,
    phase: ExperimentPhase,
}

async fn life_tree_start_experiment(
    State(ctx): State<AppCtx>,
    Json(req): Json<StartExperimentReq>,
) -> Result<Json<Value>, ApiError> {
    let mut tree = ctx.state.life_tree.write().await;
    let id = tree
        .create_experiment(&req.node_id, req.title, req.description, req.phase)
        .map_err(bad_request)?;
    Ok(Json(json!({ "ok": true, "experimentId": id })))
}

#[derive(Deserialize)]
struct ConcludeExperimentReq {
    succeeded: bool,
}

async fn life_tree_conclude_experiment(
    State(ctx): State<AppCtx>,
    Path(exp_id): Path<String>,
    Json(req): Json<ConcludeExperimentReq>,
) -> Result<Json<Value>, ApiError> {
    let mut tree = ctx.state.life_tree.write().await;
    tree.conclude_experiment(&exp_id, req.succeeded)
        .map_err(bad_request)?;
    Ok(Json(json!({ "ok": true })))
}

async fn life_tree_unlocked_phase(State(ctx): State<AppCtx>) -> Json<Value> {
    let tree = ctx.state.life_tree.read().await;
    Json(json!({ "phase": tree.unlocked_phase() }))
}

async fn life_tree_get_experiments(State(ctx): State<AppCtx>) -> Json<Value> {
    let tree = ctx.state.life_tree.read().await;
    let experiments: Vec<LifeTreeNode> = tree.experiments().into_iter().cloned().collect();
    Json(serde_json::to_value(experiments).unwrap_or(Value::Null))
}

// ──────────────────────────────────────────────────────────────────────
// Summarizer
// ──────────────────────────────────────────────────────────────────────

async fn summary_generate(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let (formatted_text, entry_count, period_start, period_end, top_apps) = {
        let log = ctx.state.activity_log.read().await;
        let pending = log.pending_entries();

        if pending.is_empty() {
            return Err(bad_request("No pending activity entries to summarize"));
        }

        let entry_count = pending.len();
        let period_start = pending.first().map(|e| e.timestamp).unwrap_or(0);
        let period_end = pending.last().map(|e| e.timestamp).unwrap_or(0);

        let mut app_counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for entry in &pending {
            if let Some(app) = &entry.app_name {
                *app_counts.entry(app.clone()).or_insert(0) += 1;
            }
        }
        let mut apps: Vec<(String, usize)> = app_counts.into_iter().collect();
        apps.sort_by(|a, b| b.1.cmp(&a.1));
        let top_apps: Vec<String> = apps.into_iter().take(5).map(|(name, _)| name).collect();

        let formatted = log.format_for_ai(&pending);
        (formatted, entry_count, period_start, period_end, top_apps)
    };

    let client = ctx
        .state
        .ai_client
        .read()
        .await
        .as_ref()
        .cloned()
        .ok_or_else(|| bad_request("AI not initialized. Configure API key in settings."))?;

    let prompt = format!(
        "You are Shadow, a desktop activity monitor. Summarize the following user activity log in 2-3 concise sentences. \
         Focus on what the user was doing, which apps they used, and any notable patterns. \
         Be specific about the content they were working on based on window titles and OCR text.\n\n\
         Activity Log ({} entries):\n{}\n\n\
         Respond with ONLY the summary text, no headers or formatting.",
        entry_count, formatted_text
    );

    let messages = vec![ChatMessage { role: "user".to_string(), content: prompt }];
    let response = client.chat(messages).await?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let summary = ActivitySummary {
        summary: response.text,
        period_start,
        period_end,
        entry_count,
        top_apps,
        generated_at: now,
    };

    {
        let mut log = ctx.state.activity_log.write().await;
        log.add_summary(summary.clone());
    }

    Ok(Json(serde_json::to_value(summary)?))
}

#[derive(Deserialize, Default)]
struct RecentSummariesQuery {
    #[serde(default)]
    count: Option<usize>,
}

async fn summary_recent(
    State(ctx): State<AppCtx>,
    Query(q): Query<RecentSummariesQuery>,
) -> Json<Value> {
    let log = ctx.state.activity_log.read().await;
    let summaries = log.recent_summaries(q.count.unwrap_or(10)).to_vec();
    Json(serde_json::to_value(summaries).unwrap_or(Value::Null))
}

async fn summary_activity_stats(State(ctx): State<AppCtx>) -> Json<Value> {
    let log = ctx.state.activity_log.read().await;
    let pending = log.pending_entries();
    let stats = ActivityStats {
        total_entries: log.len(),
        pending_entries: pending.len(),
        oldest_pending: pending.first().map(|e| e.timestamp),
        newest_pending: pending.last().map(|e| e.timestamp),
    };
    Json(serde_json::to_value(stats).unwrap_or(Value::Null))
}

// ──────────────────────────────────────────────────────────────────────
// Training collector
// ──────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct SaveTrainingSampleReq {
    session_id: String,
    turn_id: u32,
    messages: Vec<ChatMessage>,
    #[serde(default)]
    context: Option<TurnContext>,
}

async fn training_save_sample(
    State(ctx): State<AppCtx>,
    Json(req): Json<SaveTrainingSampleReq>,
) -> Result<Json<Value>, ApiError> {
    let cfg = ctx.state.config.read().await;
    if !cfg.collect_training_data.unwrap_or(false) {
        return Ok(Json(json!({ "ok": true, "skipped": true })));
    }
    drop(cfg);

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let sample = TrainingSample {
        session_id: req.session_id.clone(),
        turn_id: req.turn_id,
        timestamp,
        messages: req.messages,
        context: req.context,
        feedback: None,
    };

    let collector = ctx.state.training_collector.read().await;
    collector.save_sample(&sample).map_err(bad_request)?;

    let _ = ctx.bus.sender().send(crate::daemon::events::Frame {
        name: ev::TRAINING_SAMPLE_SAVED.to_string(),
        payload: json!(req.session_id),
    });
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct RateTrainingSampleReq {
    turn_id: u32,
    rating: i8,
    #[serde(default)]
    comment: Option<String>,
}

async fn training_rate_sample(
    State(ctx): State<AppCtx>,
    Path(session_id): Path<String>,
    Json(req): Json<RateTrainingSampleReq>,
) -> Result<Json<Value>, ApiError> {
    let feedback = TurnFeedback { rating: req.rating, comment: req.comment };
    let collector = ctx.state.training_collector.read().await;
    collector
        .update_feedback(&session_id, req.turn_id, feedback)
        .map_err(bad_request)?;
    Ok(Json(json!({ "ok": true })))
}

async fn training_stats(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let collector = ctx.state.training_collector.read().await;
    let stats = collector.stats().map_err(bad_request)?;
    Ok(Json(serde_json::to_value(stats)?))
}

#[derive(Deserialize, Default)]
struct ExportTrainingReq {
    #[serde(default)]
    output_path: Option<String>,
}

async fn training_export(
    State(ctx): State<AppCtx>,
    Json(req): Json<ExportTrainingReq>,
) -> Result<Json<Value>, ApiError> {
    let collector = ctx.state.training_collector.read().await;

    let path = req
        .output_path
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            dirs::data_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("com.hawkeye.desktop")
                .join("training_data")
                .join("export_chatml.jsonl")
        });

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| bad_request(format!("Failed to create export directory: {}", e)))?;
    }

    let count = collector.export_chatml(&path).map_err(bad_request)?;

    let _ = ctx.bus.sender().send(crate::daemon::events::Frame {
        name: ev::TRAINING_EXPORT_COMPLETE.to_string(),
        payload: json!({ "path": path.to_string_lossy(), "count": count }),
    });

    Ok(Json(json!({
        "ok": true,
        "path": path.to_string_lossy(),
        "count": count,
    })))
}

// ──────────────────────────────────────────────────────────────────────
// Gesture
// ──────────────────────────────────────────────────────────────────────

async fn gesture_event(
    State(ctx): State<AppCtx>,
    Json(event): Json<GestureEvent>,
) -> Result<Json<Value>, ApiError> {
    let cfg = ctx.state.gesture_config.read().await;
    if !cfg.enabled {
        return Ok(Json(json!({ "ok": false, "handled": false, "reason": "disabled" })));
    }
    drop(cfg);

    log::debug!(
        "[Gesture] Action={:?} gesture={} confidence={:.2}",
        event.action,
        event.gesture,
        event.confidence
    );

    let _ = ctx.bus.sender().send(crate::daemon::events::Frame {
        name: ev::GESTURE_EVENT.to_string(),
        payload: serde_json::to_value(&event).unwrap_or(Value::Null),
    });

    use crate::commands::gesture_cmd::GestureAction;
    match event.action {
        GestureAction::Screenshot => match perception::screen::capture_screenshot().await {
            Ok((base64, _w, _h)) => {
                let _ = ctx.bus.sender().send(crate::daemon::events::Frame {
                    name: ev::GESTURE_SCREENSHOT.to_string(),
                    payload: json!(base64),
                });
                log::info!("[Gesture] Screenshot captured");
            }
            Err(e) => log::warn!("[Gesture] Screenshot failed: {}", e),
        },
        GestureAction::Pause => {
            let _ = ctx.bus.sender().send(crate::daemon::events::Frame {
                name: ev::GESTURE_PAUSE.to_string(),
                payload: Value::Null,
            });
        }
        GestureAction::Confirm => {
            let _ = ctx.bus.sender().send(crate::daemon::events::Frame {
                name: ev::GESTURE_CONFIRM.to_string(),
                payload: Value::Null,
            });
        }
        GestureAction::Cancel => {
            let _ = ctx.bus.sender().send(crate::daemon::events::Frame {
                name: ev::GESTURE_CANCEL.to_string(),
                payload: Value::Null,
            });
        }
        GestureAction::QuickMenu => {
            let _ = ctx.bus.sender().send(crate::daemon::events::Frame {
                name: ev::GESTURE_QUICK_MENU.to_string(),
                payload: Value::Null,
            });
        }
        _ => {}
    }

    Ok(Json(json!({ "ok": true, "handled": true })))
}

async fn gesture_status(State(ctx): State<AppCtx>) -> Json<Value> {
    let cfg = ctx.state.gesture_config.read().await.clone();
    Json(serde_json::to_value(cfg).unwrap_or(Value::Null))
}

async fn gesture_set_config(
    State(ctx): State<AppCtx>,
    Json(new_config): Json<GestureConfig>,
) -> Result<Json<Value>, ApiError> {
    let mut cfg = ctx.state.gesture_config.write().await;
    *cfg = new_config.clone();
    Ok(Json(serde_json::to_value(new_config)?))
}

#[derive(Deserialize)]
struct SetGestureEnabledReq {
    enabled: bool,
}

async fn gesture_set_enabled(
    State(ctx): State<AppCtx>,
    Json(req): Json<SetGestureEnabledReq>,
) -> Json<Value> {
    let mut cfg = ctx.state.gesture_config.write().await;
    cfg.enabled = req.enabled;
    log::info!("[Gesture] {}", if req.enabled { "Enabled" } else { "Disabled" });
    Json(json!({ "ok": true, "enabled": req.enabled }))
}

// ──────────────────────────────────────────────────────────────────────
// Adaptive refresh
// ──────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct RecordActivityReq {
    event_type: ActivityEventType,
}

async fn adaptive_record_activity(
    State(ctx): State<AppCtx>,
    Json(req): Json<RecordActivityReq>,
) -> Json<Value> {
    let mut ar = ctx.state.adaptive_refresh.write().await;
    ar.record_activity(req.event_type);
    Json(json!({ "ok": true }))
}

async fn adaptive_refresh_status(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let mut ar = ctx.state.adaptive_refresh.write().await;
    Ok(Json(serde_json::to_value(ar.status())?))
}

// ──────────────────────────────────────────────────────────────────────
// Auto-updater (stubs — Tauri updater plugin needs AppHandle)
// ──────────────────────────────────────────────────────────────────────

async fn updater_check() -> Result<Json<Value>, ApiError> {
    Err(ApiError(
        StatusCode::NOT_IMPLEMENTED,
        "updater requires Tauri AppHandle; install updates via GUI".to_string(),
    ))
}

async fn updater_install() -> Result<Json<Value>, ApiError> {
    Err(ApiError(
        StatusCode::NOT_IMPLEMENTED,
        "updater requires Tauri AppHandle; install updates via GUI".to_string(),
    ))
}

async fn updater_version() -> Json<Value> {
    Json(json!({ "version": env!("CARGO_PKG_VERSION") }))
}

// ──────────────────────────────────────────────────────────────────────
// Miscellaneous wrappers
// ──────────────────────────────────────────────────────────────────────

async fn clipboard_get() -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({ "ok": true, "content": Value::Null })))
}

#[derive(Deserialize)]
struct OpenUrlReq {
    url: String,
}

async fn util_open_url(Json(req): Json<OpenUrlReq>) -> Result<Json<Value>, ApiError> {
    if req.url.trim().is_empty() {
        return Err(bad_request("url is required"));
    }
    open::that(&req.url).map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(json!({ "ok": true })))
}

async fn gaze_model_clear(State(ctx): State<AppCtx>) -> Json<Value> {
    *ctx.state.gaze_model.write().await = None;
    *ctx.state.gaze_buffer.write().await = Default::default();

    if let Some(path) = GazeModel::default_path() {
        let _ = std::fs::remove_file(&path);
    }
    if let Some(path) = GazeDataBuffer::default_path() {
        let _ = std::fs::remove_file(&path);
    }

    log::info!("[Gaze] Model and samples cleared");
    Json(json!({ "ok": true }))
}

async fn gaze_load_weights(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    let path = match GazeModel::default_path() {
        Some(p) => p,
        None => return Ok(Json(json!({ "ok": true, "loaded": false }))),
    };
    if !path.exists() {
        return Ok(Json(json!({ "ok": true, "loaded": false })));
    }
    let model = GazeModel::load(&path).map_err(|e| {
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to load weights: {}", e))
    })?;
    log::info!("[Gaze] Loaded weights from {:?}", path);
    *ctx.state.gaze_model.write().await = Some(model);
    Ok(Json(json!({ "ok": true, "loaded": true })))
}

async fn gaze_training_trigger(State(ctx): State<AppCtx>) -> Result<Json<Value>, ApiError> {
    // Alias for /v1/gaze/train — same behavior, just a more verb-like
    // path that React's useTauri.ts uses for the migrated invoke.
    gaze_train(State(ctx)).await
}

#[derive(Deserialize, Default)]
struct SpeechListenAppleReq {
    #[serde(default)]
    duration_secs: Option<u32>,
}

async fn speech_listen_apple(
    Json(req): Json<SpeechListenAppleReq>,
) -> Result<Json<Value>, ApiError> {
    let duration = req.duration_secs.unwrap_or(5);
    let result = speech::listen(duration).await?;
    Ok(Json(serde_json::to_value(result)?))
}

#[derive(Deserialize)]
struct SpeechTranscribeFileReq {
    audio_path: String,
}

async fn speech_transcribe_file_route(
    Json(req): Json<SpeechTranscribeFileReq>,
) -> Result<Json<Value>, ApiError> {
    if req.audio_path.trim().is_empty() {
        return Err(bad_request("audio_path is required"));
    }
    let result = speech::transcribe_file(&req.audio_path).await?;
    Ok(Json(serde_json::to_value(result)?))
}

// ──────────────────────────────────────────────────────────────────────
// Look-to-Explain
// ──────────────────────────────────────────────────────────────────────

/// Three prompt modes the user can pick via different hotkeys. Each one
/// frames the OCR'd region differently for the AI. Returned HTML is
/// rendered as-is in the explain-overlay card (so the prompts must ask
/// for clean, safe HTML with no external JS).
const EXPLAIN_PROMPT_DICTIONARY: &str = "你是个简洁的词典。下面是用户在屏幕上注视区域的 OCR 文字。\
请用 1-2 句话解释其中最显眼的术语或概念是什么。直接回答, 不要客套, 不要重复原文。\
返回纯 HTML 片段 (允许 <p> <code> <strong> <em>), 不要外层 <html>/<body> 标签。";

const EXPLAIN_PROMPT_TROUBLESHOOT: &str = "你是个故障排查助手。下面是用户屏幕上注视区域的 OCR 文字, \
可能包含错误消息、警告、调用栈或异常信息。请分析:\n\
1. 这是什么错误 (1 句话)\n2. 为什么会出现 (1-2 句)\n3. 最可能的修复方法 (列出 2-3 个具体步骤)\n\
返回纯 HTML 片段, 用 <h4> <p> <ol> <li> <code> 等基础标签。不要外层 <html>/<body>。";

const EXPLAIN_PROMPT_SCENE: &str = "你是个 UI 解说员。下面是用户屏幕上注视区域的 OCR 文字 \
(用户刚进入一个不熟悉的界面)。请用 2-3 句话告诉用户:\n\
- 这看起来是什么应用/界面的哪一块\n- 当前主要可以做什么操作\n\
返回纯 HTML 片段, 用 <p> <strong> 等基础标签。简短直接, 别长篇大论。";

fn prompt_for_mode(mode: &str) -> &'static str {
    match mode {
        "troubleshoot" => EXPLAIN_PROMPT_TROUBLESHOOT,
        "scene" => EXPLAIN_PROMPT_SCENE,
        _ => EXPLAIN_PROMPT_DICTIONARY, // default
    }
}

#[derive(Deserialize)]
struct ExplainReq {
    /// Screen x-coordinate of gaze in pixels (top-left origin)
    x: i32,
    /// Screen y-coordinate of gaze in pixels (top-left origin)
    y: i32,
    /// "dictionary" | "troubleshoot" | "scene"
    mode: String,
    /// Half-size of the square crop in pixels. Optional, defaults to 200 (→ 400×400 crop).
    #[serde(default)]
    half_size: Option<u32>,
}

async fn explain_gaze_target(
    State(ctx): State<AppCtx>,
    Json(req): Json<ExplainReq>,
) -> Result<Json<Value>, ApiError> {
    let started = std::time::Instant::now();
    let half = req.half_size.unwrap_or(200);

    // 1. Capture the cropped region around the gaze point
    let (cropped_b64, crop_w, crop_h) = perception::screen::capture_region(req.x, req.y, half)
        .await
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("capture_region failed: {}", e)))?;

    // 2. OCR the cropped image
    let ocr = perception::ocr::run_ocr(&cropped_b64)
        .await
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("OCR failed: {}", e)))?;

    let text = ocr.text.trim().to_string();
    if text.is_empty() {
        // Nothing OCR'd — return a friendly "no text found" card without burning an AI call.
        return Ok(Json(json!({
            "ok": true,
            "html": "<p><em>注视区域没有识别到文字。试着看一个有文字的地方再按。</em></p>",
            "mode": req.mode,
            "anchor": { "x": req.x, "y": req.y },
            "cropSize": { "w": crop_w, "h": crop_h },
            "ocrText": "",
            "durationMs": started.elapsed().as_millis() as u64,
        })));
    }

    // 3. Build the chat prompt for the requested mode
    let provider = ctx
        .state
        .ai_client
        .read()
        .await
        .as_ref()
        .cloned()
        .ok_or_else(|| bad_request("AI not initialized — open Shadow chat first to configure a provider"))?;

    let system_prompt = prompt_for_mode(&req.mode);
    let user_prompt = format!("OCR 抓到的内容如下:\n\n{}", text);
    let messages = vec![
        ChatMessage { role: "system".into(), content: system_prompt.into() },
        ChatMessage { role: "user".into(), content: user_prompt },
    ];

    // 4. Call the AI provider
    let resp = provider
        .chat(messages)
        .await
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("AI chat failed: {}", e)))?;

    Ok(Json(json!({
        "ok": true,
        "html": resp.text,
        "mode": req.mode,
        "anchor": { "x": req.x, "y": req.y },
        "cropSize": { "w": crop_w, "h": crop_h },
        "ocrText": text,
        "durationMs": started.elapsed().as_millis() as u64,
    })))
}
