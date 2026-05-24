//! Activity summarizer commands — generate AI summaries of recent activity

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityStats {
    pub total_entries: usize,
    pub pending_entries: usize,
    pub oldest_pending: Option<u64>,
    pub newest_pending: Option<u64>,
}
