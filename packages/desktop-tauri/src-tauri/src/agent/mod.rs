//! Agent module — bridges the AI provider to cua-driver for desktop control.
//!
//! Layers:
//! - [`protocol`]:    Wire types (`DaemonRequest`, `DaemonResponse`, …) for
//!                    the cua-driver Unix-socket protocol.
//! - [`cua_driver`]:  Async client + daemon supervisor.
//! - [`tools`]:       Curated catalog mapped to `FunctionDeclaration`s
//!                    surfaced to the LLM.
//! - [`runner`]:      Tool-use loop orchestrating `chat_with_tools` ↔
//!                    cua-driver tool execution.

pub mod cua_driver;
pub mod protocol;
pub mod runner;
pub mod tools;

pub use cua_driver::{CuaDriverClient, DaemonSupervisor};
pub use runner::{run_user_turn, AgentTurnResult, ToolCallRecord, MAX_TOOL_ROUNDS};
