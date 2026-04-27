//! `hawkeye-cli` — headless command-line entry point for the same Rust
//! subsystems used by the Tauri desktop app.
//!
//! This binary intentionally avoids any Tauri / webview dependency: it
//! drives the observe loop, agent runner, and AI providers through the
//! provider-neutral [`EventSink`] abstraction.

use std::sync::Arc;

use clap::{Parser, Subcommand};

use hawkeye_lib::{
    agent::{run_user_turn, CuaDriverClient, DaemonSupervisor},
    ai::{AiProvider, ChatMessage, GeminiClient, OpenAiClient},
    config,
    event_sink::{EventSink, SharedSink, StdoutSink},
    observe::ObserveLoop,
    state::AppState,
};

#[derive(Parser)]
#[command(name = "hawkeye-cli", version, about = "Hawkeye headless CLI")]
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
            let result = run_user_turn(sink, provider, Some(driver), Vec::new(), text).await?;

            // Tool-call audit on stderr (so callers can pipe stdout = answer)
            eprintln!("{}", serde_json::to_string_pretty(&result.tool_calls)?);
            println!("{}", result.text);
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
