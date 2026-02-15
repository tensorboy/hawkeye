//! Adaptive refresh commands

use std::sync::Arc;
use tauri::{command, State};

use crate::observe::adaptive_refresh::{ActivityEventType, AdaptiveRefreshStatus};
use crate::state::AppState;

/// Record an activity event to influence the adaptive refresh rate
#[command]
pub async fn record_activity(
    event_type: ActivityEventType,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut ar = state.adaptive_refresh.write().await;
    ar.record_activity(event_type);
    Ok(())
}

/// Get the current adaptive refresh status
#[command]
pub async fn get_refresh_status(
    state: State<'_, Arc<AppState>>,
) -> Result<AdaptiveRefreshStatus, String> {
    let mut ar = state.adaptive_refresh.write().await;
    Ok(ar.status())
}
