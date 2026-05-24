//! Life Tree commands — view, update, and manage the life tree

/// AI experiment proposal response
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentProposal {
    pub title: String,
    pub description: String,
    pub duration_days: u32,
}
