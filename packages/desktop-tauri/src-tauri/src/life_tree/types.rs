//! Life Tree data types

use serde::{Deserialize, Serialize};

/// Life stage categories
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum LifeStage {
    Career,
    Learning,
    Health,
    Relationships,
    Creativity,
    Finance,
    Safety,
}

impl LifeStage {
    pub fn all() -> Vec<LifeStage> {
        vec![
            Self::Career,
            Self::Learning,
            Self::Health,
            Self::Relationships,
            Self::Creativity,
            Self::Finance,
            Self::Safety,
        ]
    }

    pub fn label(&self) -> &str {
        match self {
            Self::Career => "Career & Work",
            Self::Learning => "Learning & Growth",
            Self::Health => "Health & Wellness",
            Self::Relationships => "Relationships",
            Self::Creativity => "Creativity & Hobbies",
            Self::Finance => "Finance",
            Self::Safety => "Safety & Security",
        }
    }
}

/// Node type in the tree
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    Root,
    Stage,
    Goal,
    Task,
    Experiment,
}

/// Node status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NodeStatus {
    Active,
    Completed,
    Paused,
    Failed,
}

/// Experiment phase (progressive complexity)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExperimentPhase {
    /// Phase 1: Simple task-level experiments
    TaskLevel,
    /// Phase 2: Goal-level experiments (unlocked after 3+ Phase 1 completions)
    GoalLevel,
    /// Phase 3: Automation experiments
    AutomationLevel,
}

/// A node in the life tree
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifeTreeNode {
    pub id: String,
    pub node_type: NodeType,
    pub label: String,
    pub description: Option<String>,
    pub stage: Option<LifeStage>,
    pub status: NodeStatus,
    pub confidence: f64,
    pub children: Vec<String>,
    pub parent: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    /// For experiment nodes
    pub experiment_phase: Option<ExperimentPhase>,
    /// Observation count contributing to this node
    pub observation_count: u32,
    /// Most recent related apps
    pub related_apps: Vec<String>,
}

/// Full tree snapshot
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LifeTreeSnapshot {
    pub root_id: String,
    pub nodes: Vec<LifeTreeNode>,
    pub stats: TreeStats,
    pub generated_at: u64,
}

/// Tree statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeStats {
    pub total_nodes: usize,
    pub active_goals: usize,
    pub active_tasks: usize,
    pub experiments_completed: usize,
    pub most_active_stage: Option<LifeStage>,
}

/// Activity context fed into the tree for classification
#[derive(Debug, Clone)]
pub struct ActivityContext {
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub ocr_snippet: Option<String>,
    pub timestamp: u64,
}
