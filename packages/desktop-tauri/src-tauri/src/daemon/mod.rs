//! `hawkeyed` — HTTP daemon mode for Shadow.
//!
//! Exposes the same [`crate::state::AppState`] that the Tauri app uses, via
//! a localhost-only REST API + Server-Sent Events streams. The lightweight
//! `hawkeye-cli daemon` subcommand starts it; the Tauri GUI can attach to
//! a running instance instead of spawning its own copy.
//!
//! ## Surface
//!
//!   • `GET  /v1/health`                — liveness check (no auth)
//!   • `GET  /v1/status`                — daemon + AI + observe status
//!   • Per-domain routes for ai / agent / perception / observe / gaze /
//!     life-tree / speech (see [`routes`])
//!   • `GET  /v1/events`                — SSE stream of every backend event
//!
//! ## Auth
//!
//! All routes except `/v1/health` require `Authorization: Bearer <token>`.
//! The token is generated on first run and persisted at
//! `~/.config/hawkeye/api-token`. It's printed once to stdout when the
//! daemon starts.
//!
//! ## Why a daemon and not just CLI?
//!
//! The CLI is per-invocation cold start — that wrecks state-bearing
//! features like the gaze model, life-tree, observe loop. The daemon
//! keeps a single hot AppState so a stream of HTTP calls + the GUI all
//! see consistent data.

pub mod attach;
pub mod auth;
pub mod events;
pub mod openapi;
pub mod routes;
pub mod server;

pub use attach::{ensure_daemon, DaemonInfo};
pub use server::run_daemon;
