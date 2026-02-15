//! Activity summarizer commands — generate AI summaries of recent activity

use std::sync::Arc;
use tauri::{command, State};

use crate::ai::ChatMessage;
use crate::observe::activity_log::ActivitySummary;
use crate::state::AppState;

/// Generate an AI summary of pending (unsummarized) activity entries
#[command]
pub async fn generate_summary(
    state: State<'_, Arc<AppState>>,
) -> Result<ActivitySummary, String> {
    // Get pending entries
    let (formatted_text, entry_count, period_start, period_end, top_apps) = {
        let log = state.activity_log.read().await;
        let pending = log.pending_entries();

        if pending.is_empty() {
            return Err("No pending activity entries to summarize".to_string());
        }

        let entry_count = pending.len();
        let period_start = pending.first().map(|e| e.timestamp).unwrap_or(0);
        let period_end = pending.last().map(|e| e.timestamp).unwrap_or(0);

        // Count app occurrences for top_apps
        let mut app_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
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

    // Check AI is ready
    let ai = state.ai_client.read().await;
    let client = ai
        .as_ref()
        .ok_or_else(|| "AI not initialized. Configure API key in settings.".to_string())?;

    // Build prompt
    let prompt = format!(
        "You are Hawkeye, a desktop activity monitor. Summarize the following user activity log in 2-3 concise sentences. \
         Focus on what the user was doing, which apps they used, and any notable patterns. \
         Be specific about the content they were working on based on window titles and OCR text.\n\n\
         Activity Log ({} entries):\n{}\n\n\
         Respond with ONLY the summary text, no headers or formatting.",
        entry_count, formatted_text
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    let response = client.chat(messages).await.map_err(|e| e.to_string())?;

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

    // Store the summary
    {
        let mut log = state.activity_log.write().await;
        log.add_summary(summary.clone());
    }

    Ok(summary)
}

/// Get recent activity summaries
#[command]
pub async fn get_recent_summaries(
    count: Option<usize>,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ActivitySummary>, String> {
    let log = state.activity_log.read().await;
    let summaries = log.recent_summaries(count.unwrap_or(10));
    Ok(summaries.to_vec())
}

/// Get current activity log stats
#[command]
pub async fn get_activity_stats(
    state: State<'_, Arc<AppState>>,
) -> Result<ActivityStats, String> {
    let log = state.activity_log.read().await;
    let pending = log.pending_entries();
    Ok(ActivityStats {
        total_entries: log.len(),
        pending_entries: pending.len(),
        oldest_pending: pending.first().map(|e| e.timestamp),
        newest_pending: pending.last().map(|e| e.timestamp),
    })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityStats {
    pub total_entries: usize,
    pub pending_entries: usize,
    pub oldest_pending: Option<u64>,
    pub newest_pending: Option<u64>,
}
