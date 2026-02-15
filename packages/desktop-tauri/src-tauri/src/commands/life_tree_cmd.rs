//! Life Tree commands — view, update, and manage the life tree

use std::sync::Arc;
use tauri::{command, State};

use crate::life_tree::types::*;
use crate::state::AppState;

/// Get the current life tree snapshot
#[command]
pub async fn get_life_tree(
    state: State<'_, Arc<AppState>>,
) -> Result<LifeTreeSnapshot, String> {
    let tree = state.life_tree.read().await;
    Ok(tree.snapshot())
}

/// Rebuild the life tree from scratch
#[command]
pub async fn rebuild_life_tree(
    state: State<'_, Arc<AppState>>,
) -> Result<LifeTreeSnapshot, String> {
    let mut tree = state.life_tree.write().await;
    tree.rebuild();
    Ok(tree.snapshot())
}

/// Propose an experiment for a node (AI-powered)
#[command]
pub async fn propose_experiment(
    node_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<ExperimentProposal, String> {
    let messages = {
        let tree = state.life_tree.read().await;
        tree.build_experiment_prompt(&node_id)?
    };

    let ai = state.ai_client.read().await;
    let client = ai
        .as_ref()
        .ok_or_else(|| "AI not initialized".to_string())?;

    let response = client.chat(messages).await.map_err(|e| e.to_string())?;

    // Parse AI response as JSON
    let text = response.text.trim();
    // Try to extract JSON from potential markdown code blocks
    let json_str = if text.contains("```") {
        text.lines()
            .skip_while(|l| !l.starts_with('{'))
            .take_while(|l| !l.starts_with("```"))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        text.to_string()
    };

    serde_json::from_str(&json_str).map_err(|e| {
        format!("Failed to parse AI response: {}. Raw: {}", e, text)
    })
}

/// Start an experiment
#[command]
pub async fn start_experiment(
    node_id: String,
    title: String,
    description: String,
    phase: ExperimentPhase,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let mut tree = state.life_tree.write().await;
    tree.create_experiment(&node_id, title, description, phase)
}

/// Conclude an experiment
#[command]
pub async fn conclude_experiment(
    experiment_id: String,
    succeeded: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut tree = state.life_tree.write().await;
    tree.conclude_experiment(&experiment_id, succeeded)
}

/// Get the max unlocked experiment phase
#[command]
pub async fn get_unlocked_phase(
    state: State<'_, Arc<AppState>>,
) -> Result<ExperimentPhase, String> {
    let tree = state.life_tree.read().await;
    Ok(tree.unlocked_phase())
}

/// Get all experiments
#[command]
pub async fn get_experiments(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<LifeTreeNode>, String> {
    let tree = state.life_tree.read().await;
    Ok(tree.experiments().into_iter().cloned().collect())
}

/// AI experiment proposal response
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentProposal {
    pub title: String,
    pub description: String,
    pub duration_days: u32,
}
