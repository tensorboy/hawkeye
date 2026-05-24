//! HTTP daemon entrypoint. Binds the axum router on localhost and runs it
//! until Ctrl-C.

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::{Context, Result};
use axum::{
    body::Body,
    extract::{Extension, Request},
    http::{header, HeaderValue},
    middleware as ax_mw,
    middleware::Next,
    response::{Json as AJson, Response},
    routing::get,
    Router,
};
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::config;
use crate::daemon::auth::{bearer_auth, load_or_create_token, ApiToken};
use crate::daemon::events::{BroadcastSink, EventBus};
use crate::daemon::openapi::{docs_html, openapi_json};
use crate::daemon::routes::{build_router, AppCtx};
use crate::event_sink::SharedSink;
use crate::state::AppState;

/// Top-level daemon entrypoint. `port` defaults to `config.sync_port`.
pub async fn run_daemon(port: Option<u16>) -> Result<()> {
    let cfg = config::load_config().unwrap_or_default();
    let port = port.unwrap_or(cfg.sync_port);

    let state = AppState::new(cfg);
    let bus = EventBus::new(1024);
    let sink: SharedSink = BroadcastSink::new(&bus);

    // Install the broadcast sink so the observe loop / agent / training
    // runners send events into the same bus that SSE subscribers read.
    *state.event_sink.write().await = Some(Arc::clone(&sink));

    // Initialize peripheral subsystems that the Tauri bootstrap also runs.
    if let Err(e) = crate::perception::init().await {
        log::warn!("[hawkeyed] perception init: {}", e);
    }
    // Init agent supervisor (does NOT spawn the daemon — user opts in via
    // POST /v1/agent/start).
    match crate::agent::CuaDriverClient::default_path() {
        Ok(client) => {
            let supervisor = crate::agent::DaemonSupervisor::new(client);
            *state.agent_supervisor.write().await = Some(supervisor);
        }
        Err(e) => log::warn!("[hawkeyed] cua-driver init: {}", e),
    }

    let token = load_or_create_token()?;
    let ctx = AppCtx {
        state: Arc::clone(&state),
        bus,
        sink,
    };

    // Public routes (no auth): liveness check + an unauthenticated info
    // probe so a GUI can detect whether a daemon is already running and
    // what version it speaks before sending the token. Plus the OpenAPI
    // spec + Swagger UI, which need to load before the user can paste
    // their token into the "Authorize" button.
    let public: Router = Router::new()
        .route(
            "/v1/health",
            get(|| async { AJson(json!({ "ok": true, "service": "hawkeyed" })) }),
        )
        .route(
            "/v1/info",
            get(|| async {
                AJson(json!({
                    "service": "hawkeyed",
                    "version": env!("CARGO_PKG_VERSION"),
                    "needsAuth": true,
                    "docs": "/v1/docs",
                    "openapi": "/v1/openapi.json",
                }))
            }),
        )
        .route("/v1/openapi.json", get(openapi_json))
        .route("/v1/docs", get(docs_html));

    // Protected routes — bearer-token required on every request.
    // The token-promotion middleware runs FIRST so SSE clients that pass
    // `?token=` (browsers can't send Authorization headers on EventSource)
    // are converted into the same header the bearer auth expects.
    let protected = build_router(ctx)
        .layer(ax_mw::from_fn(bearer_auth))
        .layer(ax_mw::from_fn(promote_token_query_param))
        .layer(Extension(ApiToken(token.clone())));

    // Permissive CORS so local browser-based scripts can hit the daemon.
    // Token requirement on protected routes is the real gate.
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .merge(public)
        .merge(protected)
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .with_context(|| format!("bind {}", addr))?;

    // Big, copy-pasteable banner so the user can wire scripts immediately.
    println!("┌─ hawkeyed ─────────────────────────────────────────────┐");
    println!("│ listening   http://{}", addr);
    println!("│ token       {}", token);
    println!("│ docs        http://{}/v1/docs (Swagger UI)", addr);
    println!("│ try         curl -H \"Authorization: Bearer $TOKEN\" \\");
    println!("│             http://{}/v1/status", addr);
    println!("│ events      curl -NH \"Authorization: Bearer $TOKEN\" \\");
    println!("│             http://{}/v1/events", addr);
    println!("│ stop        Ctrl-C");
    println!("└────────────────────────────────────────────────────────┘");

    axum::serve(listener, app).await.context("axum serve")?;
    Ok(())
}

/// Promote a `?token=<bearer>` query parameter into an Authorization header
/// so subsequent middleware (bearer_auth) treats it like a normal request.
/// Browser `EventSource` can't send custom headers, hence this fallback.
/// Existing Authorization headers always win.
async fn promote_token_query_param(mut req: Request<Body>, next: Next) -> Response {
    let has_auth = req.headers().contains_key(header::AUTHORIZATION);
    if !has_auth {
        let token = req.uri().query().and_then(|q| {
            url::form_urlencoded::parse(q.as_bytes())
                .find(|(k, _)| k == "token")
                .map(|(_, v)| v.into_owned())
        });
        if let Some(t) = token {
            if let Ok(v) = HeaderValue::from_str(&format!("Bearer {}", t)) {
                req.headers_mut().insert(header::AUTHORIZATION, v);
            }
        }
    }
    next.run(req).await
}
