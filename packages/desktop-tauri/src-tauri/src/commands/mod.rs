//! Command modules — after the Phase 2-5 unification, most IPC handlers
//! moved into the hawkeyed HTTP daemon (see `crate::daemon::routes`).
//! The few command files that remain fall into two categories:
//!
//! * **Tauri-only commands** (status, updater_cmd, gaze_cmd) — they need
//!   a Tauri `AppHandle` to call into the updater plugin or to emit
//!   training events, so they can't move to the daemon.
//!
//! * **Type definitions** (debug_cmd, gesture_cmd, life_tree_cmd,
//!   summarizer_cmd, perception_cmd) — kept because `state.rs` and the
//!   daemon routes still reference their structs. The actual
//!   `#[command]` functions are gone from these files.

pub mod debug_cmd;
pub mod gesture_cmd;
pub mod life_tree_cmd;
pub mod perception_cmd;
pub mod status;
pub mod summarizer_cmd;
pub mod updater_cmd;
