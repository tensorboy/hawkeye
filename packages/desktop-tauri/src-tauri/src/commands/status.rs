//! Status commands — the only Tauri IPC commands React still uses (plus
//! the updater plugin). After the unification everything else goes
//! through the hawkeyed HTTP daemon.

use std::sync::Arc;
use tauri::{command, State};

use crate::state::TauriShellState;

/// Get cached daemon info populated at app startup by `daemon::ensure_daemon`.
/// The React app uses this to render the daemon banner in the Models tab.
#[command]
pub async fn get_daemon_info(
    shell: State<'_, Arc<TauriShellState>>,
) -> Result<Option<crate::daemon::DaemonInfo>, String> {
    Ok(shell.daemon_info.read().await.clone())
}

/// Return the persisted hawkeyed API token. Called by the React app at
/// startup so subsequent fetch requests can carry `Authorization: Bearer`.
/// This is one of the only two IPC calls React makes after the
/// unification — every other capability goes through HTTP.
#[command]
pub async fn get_daemon_token() -> Result<String, String> {
    crate::daemon::auth::load_or_create_token().map_err(|e| e.to_string())
}
