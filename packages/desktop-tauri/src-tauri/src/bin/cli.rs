//! `hawkeye-cli` — headless command-line entry point for the same Rust
//! subsystems used by the Tauri desktop app.
//!
//! This binary intentionally avoids any Tauri / webview dependency: it
//! drives the observe loop, agent runner, and AI providers through the
//! provider-neutral [`EventSink`] abstraction.

use std::sync::Arc;

use clap::{Parser, Subcommand};

use hawkeye_lib::{
    agent::{run_user_turn, AlwaysApprove, ConfirmGate, CuaDriverClient, DaemonSupervisor},
    ai::{AiProvider, ChatMessage, GeminiClient, OpenAiClient},
    config,
    event_sink::{EventSink, SharedSink, StdoutSink},
    observe::ObserveLoop,
    state::AppState,
};

#[derive(Parser)]
#[command(name = "hawkeye-cli", version, about = "Shadow headless CLI")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Print the effective configuration (after env + file resolution).
    Config,

    /// Run the continuous observe loop, emitting NDJSON events to stdout.
    Observe {
        /// Sleep interval in milliseconds between captures.
        #[arg(long, default_value_t = 3000)]
        interval_ms: u64,
        /// Perceptual-hash change threshold (0.0–1.0). Frames below this
        /// ratio are skipped without OCR.
        #[arg(long, default_value_t = 0.05)]
        change_threshold: f64,
    },

    /// One-turn AI chat (no tools).
    Chat {
        /// User text to send.
        text: String,
    },

    /// Tool-using agent turn (requires the cua-driver daemon).
    Agent {
        /// User prompt.
        text: String,
    },

    /// Verify cua-driver daemon connectivity.
    AgentStatus,

    /// Run the hawkeyed HTTP daemon — exposes every Shadow capability
    /// over a localhost REST + SSE API. The Tauri GUI can attach to this
    /// instead of running its own backend.
    Daemon {
        /// Override the listening port (default: `config.syncPort` =
        /// 23789 unless changed in ~/.config/hawkeye/config.json).
        #[arg(long)]
        port: Option<u16>,
    },

    /// Print the persisted API token (generating one if it doesn't exist).
    /// Useful for shell pipelines: `TOKEN=$(hawkeye-cli print-token)`.
    PrintToken,

    /// Print copy-pasteable curl examples for the most common daemon
    /// endpoints. Pipe through `bash` to actually run them (after starting
    /// `hawkeye-cli daemon` in another terminal).
    Examples {
        /// Host:port to use in the printed examples.
        #[arg(long, default_value = "127.0.0.1:23789")]
        host: String,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();
    let cli = Cli::parse();

    // All sub-commands need config + state (cheap to build).
    let cfg = config::load_config().unwrap_or_default();
    let state = AppState::new(cfg);

    match cli.cmd {
        Cmd::Config => {
            let cfg = state.config.read().await;
            println!("{}", serde_json::to_string_pretty(&*cfg)?);
        }

        Cmd::Observe {
            interval_ms,
            change_threshold,
        } => {
            let sink: SharedSink = Arc::new(StdoutSink);
            let _loop = ObserveLoop::start(sink, state.clone(), interval_ms, change_threshold);
            eprintln!("[hawkeye-cli] observe loop running — Ctrl-C to stop");
            tokio::signal::ctrl_c().await?;
            eprintln!("[hawkeye-cli] shutting down");
        }

        Cmd::Chat { text } => {
            let provider = build_provider(&state).await?;
            let messages = vec![ChatMessage {
                role: "user".into(),
                content: text,
            }];
            let resp = provider.chat(messages).await?;
            println!("{}", resp.text);
        }

        Cmd::Agent { text } => {
            let provider = build_provider(&state).await?;
            let driver = CuaDriverClient::default_path()?;
            let supervisor = DaemonSupervisor::new(driver.clone());
            supervisor.ensure_running().await?;

            let sink: SharedSink = Arc::new(StdoutSink);
            let gate: Arc<dyn ConfirmGate> = Arc::new(AlwaysApprove);
            let result =
                run_user_turn(sink, provider, Some(driver), gate, Vec::new(), text).await?;

            // Tool-call audit on stderr (so callers can pipe stdout = answer)
            eprintln!("{}", serde_json::to_string_pretty(&result.tool_calls)?);
            println!("{}", result.text);
        }

        Cmd::Daemon { port } => {
            hawkeye_lib::daemon::run_daemon(port).await?;
        }

        Cmd::PrintToken => {
            let token = hawkeye_lib::daemon::auth::load_or_create_token()?;
            println!("{}", token);
        }

        Cmd::Examples { host } => {
            print_examples(&host);
        }

        Cmd::AgentStatus => {
            let driver = CuaDriverClient::default_path()?;
            let supervisor = DaemonSupervisor::new(driver.clone());
            let running = driver.is_running().await;
            let status = serde_json::json!({
                "binaryInstalled": supervisor.binary_path().is_some(),
                "binaryPath": supervisor
                    .binary_path()
                    .map(|p| p.display().to_string()),
                "daemonRunning": running,
                "socketPath": driver.socket_path().display().to_string(),
            });
            println!("{}", serde_json::to_string_pretty(&status)?);
        }
    }

    Ok(())
}

/// Build the configured AI provider. Mirrors the resolution rules used in
/// `commands::chat_cmd::init_ai`, minus the local-model path which still
/// requires lifecycle hooks not exposed through this CLI yet.
async fn build_provider(state: &Arc<AppState>) -> anyhow::Result<Arc<dyn AiProvider>> {
    let cfg = state.config.read().await;
    let provider = cfg.ai_provider.clone();

    match provider.as_str() {
        "openai" => {
            let key = cfg
                .openai_api_key
                .clone()
                .ok_or_else(|| anyhow::anyhow!("OPENAI_API_KEY missing"))?;
            Ok(Arc::new(OpenAiClient::new(
                key,
                cfg.openai_model.clone(),
                cfg.openai_base_url.clone(),
            )))
        }

        "anthropic" => {
            let key = cfg
                .anthropic_api_key
                .clone()
                .ok_or_else(|| anyhow::anyhow!("ANTHROPIC_API_KEY missing"))?;
            Ok(Arc::new(hawkeye_lib::ai::AnthropicClient::new(
                key,
                cfg.anthropic_model.clone(),
                cfg.anthropic_base_url.clone(),
            )))
        }

        // Custom = any OpenAI-compatible endpoint; key optional (vLLM/Ollama
        // often run keyless).
        "custom" => {
            let base = cfg
                .custom_base_url
                .clone()
                .ok_or_else(|| anyhow::anyhow!("custom_base_url missing"))?;
            Ok(Arc::new(OpenAiClient::new(
                cfg.custom_api_key.clone().unwrap_or_default(),
                cfg.custom_model.clone(),
                Some(base),
            )))
        }

        "local" | "llama-cpp" => {
            anyhow::bail!("local model not supported in CLI yet")
        }

        // Default + "gemini"
        _ => {
            let key = cfg
                .gemini_api_key
                .clone()
                .ok_or_else(|| anyhow::anyhow!("GEMINI_API_KEY missing"))?;
            Ok(Arc::new(GeminiClient::new(
                key,
                cfg.gemini_model.clone(),
                cfg.gemini_base_url.clone(),
            )))
        }
    }
}

// Unused-import suppression — `EventSink` is brought into scope as it's the
// trait that `SharedSink = Arc<dyn EventSink>` uses for method dispatch in
// downstream code paths called via the loop. Without an explicit reference
// the compiler may warn under `--no-default-features` profiles.
#[allow(dead_code)]
fn _trait_in_scope(_: &dyn EventSink) {}

fn print_examples(host: &str) {
    let token = hawkeye_lib::daemon::auth::load_or_create_token()
        .unwrap_or_else(|_| "$(hawkeye-cli print-token)".to_string());

    println!("# Hawkeyed quickstart — copy-paste into your terminal");
    println!("# Start the daemon first:  hawkeye-cli daemon");
    println!();
    println!("export TOKEN={}", token);
    println!("export HAWK=http://{}", host);
    println!();
    println!("# ─── Health (no auth) ───");
    println!("curl -s $HAWK/v1/health | jq");
    println!();
    println!("# ─── Status ───");
    println!("curl -sH \"Authorization: Bearer $TOKEN\" $HAWK/v1/status | jq");
    println!();
    println!("# ─── Initialize the configured AI provider ───");
    println!("curl -sH \"Authorization: Bearer $TOKEN\" -X POST $HAWK/v1/ai/init | jq");
    println!();
    println!("# ─── One-turn chat ───");
    println!("curl -sH \"Authorization: Bearer $TOKEN\" -H \"Content-Type: application/json\" \\");
    println!("    -d '{{\"messages\":[{{\"role\":\"user\",\"content\":\"hello\"}}]}}' \\");
    println!("    $HAWK/v1/ai/chat | jq -r .text");
    println!();
    println!("# ─── Capture screen → OCR (with bbox) ───");
    println!("SHOT=$(curl -sH \"Authorization: Bearer $TOKEN\" -X POST $HAWK/v1/perception/screenshot)");
    println!("B64=$(echo $SHOT | jq -r .dataUrl | sed 's|^data:image/png;base64,||')");
    println!("curl -sH \"Authorization: Bearer $TOKEN\" -H \"Content-Type: application/json\" \\");
    println!("    -d \"{{\\\"image_base64\\\":\\\"$B64\\\"}}\" \\");
    println!("    $HAWK/v1/perception/ocr | jq '.regions[:3]'");
    println!();
    println!("# ─── Start observe loop (background screen monitoring) ───");
    println!("curl -sH \"Authorization: Bearer $TOKEN\" -H \"Content-Type: application/json\" \\");
    println!("    -d '{{\"interval_ms\":3000,\"change_threshold\":0.05}}' \\");
    println!("    -X POST $HAWK/v1/observe/start | jq");
    println!();
    println!("# ─── Subscribe to live events (SSE — Ctrl-C to stop) ───");
    println!("curl -NH \"Authorization: Bearer $TOKEN\" \"$HAWK/v1/events\"");
    println!();
    println!("# ─── Filtered events (only gaze + agent) ───");
    println!("curl -NH \"Authorization: Bearer $TOKEN\" \"$HAWK/v1/events?filter=gaze:,agent:\"");
    println!();
    println!("# ─── Life tree snapshot ───");
    println!("curl -sH \"Authorization: Bearer $TOKEN\" $HAWK/v1/life-tree | jq '.stats'");
    println!();
    println!("# ─── Agent: chat + tool use (requires cua-driver installed) ───");
    println!("curl -sH \"Authorization: Bearer $TOKEN\" -H \"Content-Type: application/json\" \\");
    println!("    -d '{{\"history\":[],\"user_input\":\"open Calculator\",\"require_confirmation\":false}}' \\");
    println!("    $HAWK/v1/agent/chat | jq");
}
