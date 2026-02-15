//! Life Tree builder and manager

use std::collections::HashMap;
use std::path::PathBuf;

use crate::ai::ChatMessage;
use super::types::*;

/// Life Tree — manages the hierarchical activity structure
pub struct LifeTree {
    nodes: HashMap<String, LifeTreeNode>,
    root_id: String,
    data_path: PathBuf,
    phase1_completions: u32,
}

impl LifeTree {
    /// Create a new life tree with default stages
    pub fn new() -> Self {
        let data_path = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("com.hawkeye.desktop")
            .join("life_tree.json");

        let mut tree = Self {
            nodes: HashMap::new(),
            root_id: "root".to_string(),
            data_path,
            phase1_completions: 0,
        };

        // Try loading from disk
        if tree.load_from_disk().is_ok() {
            return tree;
        }

        // Build empty tree
        tree.build_empty();
        tree
    }

    /// Build empty tree with root and all stages
    fn build_empty(&mut self) {
        let now = Self::now();

        let root = LifeTreeNode {
            id: "root".to_string(),
            node_type: NodeType::Root,
            label: "My Life".to_string(),
            description: Some("Root of the life tree".to_string()),
            stage: None,
            status: NodeStatus::Active,
            confidence: 1.0,
            children: Vec::new(),
            parent: None,
            created_at: now,
            updated_at: now,
            experiment_phase: None,
            observation_count: 0,
            related_apps: Vec::new(),
        };

        self.nodes.insert("root".to_string(), root);

        for stage in LifeStage::all() {
            let stage_id = format!("stage_{:?}", stage).to_lowercase();
            let stage_node = LifeTreeNode {
                id: stage_id.clone(),
                node_type: NodeType::Stage,
                label: stage.label().to_string(),
                description: None,
                stage: Some(stage),
                status: NodeStatus::Active,
                confidence: 1.0,
                children: Vec::new(),
                parent: Some("root".to_string()),
                created_at: now,
                updated_at: now,
                experiment_phase: None,
                observation_count: 0,
                related_apps: Vec::new(),
            };
            self.nodes.insert(stage_id.clone(), stage_node);
            if let Some(root) = self.nodes.get_mut("root") {
                root.children.push(stage_id);
            }
        }
    }

    /// Process an activity context and update the tree
    pub fn process_activity(&mut self, ctx: &ActivityContext) {
        let stage = self.classify_stage(ctx);
        let stage_id = format!("stage_{:?}", stage).to_lowercase();

        // Update stage observation count
        if let Some(stage_node) = self.nodes.get_mut(&stage_id) {
            stage_node.observation_count += 1;
            stage_node.updated_at = Self::now();
            if let Some(app) = &ctx.app_name {
                if !stage_node.related_apps.contains(app) {
                    stage_node.related_apps.push(app.clone());
                    if stage_node.related_apps.len() > 10 {
                        stage_node.related_apps.remove(0);
                    }
                }
            }
        }

        // Find or create a task node under this stage
        let task_label = self.infer_task_label(ctx);
        let task_id = format!("task_{}_{}", stage_id, Self::slugify(&task_label));

        if !self.nodes.contains_key(&task_id) {
            let task = LifeTreeNode {
                id: task_id.clone(),
                node_type: NodeType::Task,
                label: task_label,
                description: ctx.window_title.clone(),
                stage: Some(stage),
                status: NodeStatus::Active,
                confidence: 0.6,
                children: Vec::new(),
                parent: Some(stage_id.clone()),
                created_at: Self::now(),
                updated_at: Self::now(),
                experiment_phase: None,
                observation_count: 1,
                related_apps: ctx.app_name.iter().cloned().collect(),
            };
            self.nodes.insert(task_id.clone(), task);
            if let Some(stage_node) = self.nodes.get_mut(&stage_id) {
                stage_node.children.push(task_id);
            }
        } else if let Some(task) = self.nodes.get_mut(&task_id) {
            task.observation_count += 1;
            task.updated_at = Self::now();
            task.confidence = (task.confidence + 0.05).min(1.0);
        }

        // Auto-save periodically (every 10 activities)
        let total: u32 = self.nodes.values().map(|n| n.observation_count).sum();
        if total % 10 == 0 {
            let _ = self.save_to_disk();
        }
    }

    /// Classify activity into a life stage using heuristics
    fn classify_stage(&self, ctx: &ActivityContext) -> LifeStage {
        let app = ctx.app_name.as_deref().unwrap_or("").to_lowercase();
        let title = ctx.window_title.as_deref().unwrap_or("").to_lowercase();
        let text = ctx.ocr_snippet.as_deref().unwrap_or("").to_lowercase();
        let combined = format!("{} {} {}", app, title, text);

        // Career & Work
        let work_apps = ["code", "vscode", "cursor", "idea", "webstorm", "pycharm",
            "sublime", "vim", "nvim", "zed", "terminal", "iterm", "slack", "teams",
            "zoom", "figma", "notion", "jira", "confluence", "github", "gitlab"];
        if work_apps.iter().any(|a| app.contains(a)) {
            return LifeStage::Career;
        }

        // Learning
        let learn_keywords = ["tutorial", "course", "learn", "study", "documentation",
            "docs", "wikipedia", "stackoverflow", "udemy", "coursera", "khan academy",
            "lecture", "textbook", "research"];
        if learn_keywords.iter().any(|k| combined.contains(k)) {
            return LifeStage::Learning;
        }

        // Health
        let health_keywords = ["fitness", "workout", "health", "medical", "exercise",
            "calories", "nutrition", "meditation", "sleep", "strava", "myfitnesspal"];
        if health_keywords.iter().any(|k| combined.contains(k)) {
            return LifeStage::Health;
        }

        // Relationships
        let social_apps = ["messages", "whatsapp", "telegram", "discord", "wechat",
            "facetime", "messenger", "signal"];
        if social_apps.iter().any(|a| app.contains(a)) {
            return LifeStage::Relationships;
        }

        // Finance
        let finance_keywords = ["bank", "finance", "investment", "trading", "budget",
            "tax", "payroll", "invoice", "payment", "crypto", "stock"];
        if finance_keywords.iter().any(|k| combined.contains(k)) {
            return LifeStage::Finance;
        }

        // Creativity
        let creative_apps = ["photoshop", "illustrator", "sketch", "blender",
            "garageband", "logic pro", "final cut", "premiere", "after effects",
            "procreate", "affinity", "inkscape", "gimp"];
        if creative_apps.iter().any(|a| app.contains(a)) {
            return LifeStage::Creativity;
        }

        // Safety
        let safety_keywords = ["security", "password", "vpn", "firewall", "backup",
            "encryption", "antivirus", "privacy"];
        if safety_keywords.iter().any(|k| combined.contains(k)) {
            return LifeStage::Safety;
        }

        // Default to career (most common)
        LifeStage::Career
    }

    /// Infer a short task label from the activity context
    fn infer_task_label(&self, ctx: &ActivityContext) -> String {
        if let Some(title) = &ctx.window_title {
            // Extract meaningful part of window title
            let parts: Vec<&str> = title.splitn(3, " — ").collect();
            if parts.len() >= 2 {
                return parts[0].trim().to_string();
            }
            let parts: Vec<&str> = title.splitn(3, " - ").collect();
            if parts.len() >= 2 {
                return parts[0].trim().to_string();
            }
            // Truncate long titles
            if title.len() > 50 {
                return format!("{}...", &title[..47]);
            }
            return title.clone();
        }

        ctx.app_name.clone().unwrap_or_else(|| "Unknown Activity".to_string())
    }

    /// Get a snapshot of the tree
    pub fn snapshot(&self) -> LifeTreeSnapshot {
        let nodes: Vec<LifeTreeNode> = self.nodes.values().cloned().collect();

        let active_goals = nodes.iter().filter(|n| n.node_type == NodeType::Goal && n.status == NodeStatus::Active).count();
        let active_tasks = nodes.iter().filter(|n| n.node_type == NodeType::Task && n.status == NodeStatus::Active).count();
        let experiments_completed = nodes.iter().filter(|n| n.node_type == NodeType::Experiment && n.status == NodeStatus::Completed).count();

        // Find most active stage
        let most_active_stage = nodes.iter()
            .filter(|n| n.node_type == NodeType::Stage)
            .max_by_key(|n| n.observation_count)
            .and_then(|n| n.stage.clone());

        LifeTreeSnapshot {
            root_id: self.root_id.clone(),
            nodes,
            stats: TreeStats {
                total_nodes: self.nodes.len(),
                active_goals,
                active_tasks,
                experiments_completed,
                most_active_stage,
            },
            generated_at: Self::now(),
        }
    }

    /// Propose an experiment for a node (returns AI prompt)
    pub fn build_experiment_prompt(&self, node_id: &str) -> Result<Vec<ChatMessage>, String> {
        let node = self.nodes.get(node_id)
            .ok_or_else(|| format!("Node not found: {}", node_id))?;

        let stage_label = node.stage.as_ref()
            .map(|s| s.label().to_string())
            .unwrap_or_else(|| "General".to_string());

        let prompt = format!(
            "You are Hawkeye, an AI life assistant. The user's activity tree shows they spend time on: \
             \"{}\" in the \"{}\" life stage. They have {} observations for this activity.\n\n\
             Propose ONE small, actionable micro-experiment they could try to improve or explore this area. \
             The experiment should be:\n\
             - Completable in 1-3 days\n\
             - Specific and measurable\n\
             - Low-risk\n\n\
             Respond with ONLY a JSON object: {{\"title\": \"...\", \"description\": \"...\", \"duration_days\": N}}",
            node.label,
            stage_label,
            node.observation_count,
        );

        Ok(vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }])
    }

    /// Create an experiment node under a given parent
    pub fn create_experiment(
        &mut self,
        parent_id: &str,
        title: String,
        description: String,
        phase: ExperimentPhase,
    ) -> Result<String, String> {
        if !self.nodes.contains_key(parent_id) {
            return Err(format!("Parent node not found: {}", parent_id));
        }

        let now = Self::now();
        let exp_id = format!("exp_{}_{}", parent_id, now);

        let stage = self.nodes.get(parent_id).and_then(|n| n.stage.clone());

        let experiment = LifeTreeNode {
            id: exp_id.clone(),
            node_type: NodeType::Experiment,
            label: title,
            description: Some(description),
            stage,
            status: NodeStatus::Active,
            confidence: 0.5,
            children: Vec::new(),
            parent: Some(parent_id.to_string()),
            created_at: now,
            updated_at: now,
            experiment_phase: Some(phase),
            observation_count: 0,
            related_apps: Vec::new(),
        };

        self.nodes.insert(exp_id.clone(), experiment);
        if let Some(parent) = self.nodes.get_mut(parent_id) {
            parent.children.push(exp_id.clone());
        }

        let _ = self.save_to_disk();
        Ok(exp_id)
    }

    /// Conclude an experiment
    pub fn conclude_experiment(&mut self, exp_id: &str, succeeded: bool) -> Result<(), String> {
        let node = self.nodes.get_mut(exp_id)
            .ok_or_else(|| format!("Experiment not found: {}", exp_id))?;

        if node.node_type != NodeType::Experiment {
            return Err("Node is not an experiment".to_string());
        }

        node.status = if succeeded { NodeStatus::Completed } else { NodeStatus::Failed };
        node.updated_at = Self::now();

        if succeeded {
            if let Some(ExperimentPhase::TaskLevel) = &node.experiment_phase {
                self.phase1_completions += 1;
            }
        }

        let _ = self.save_to_disk();
        Ok(())
    }

    /// Get the max unlocked experiment phase
    pub fn unlocked_phase(&self) -> ExperimentPhase {
        if self.phase1_completions >= 10 {
            ExperimentPhase::AutomationLevel
        } else if self.phase1_completions >= 3 {
            ExperimentPhase::GoalLevel
        } else {
            ExperimentPhase::TaskLevel
        }
    }

    /// Get all experiment nodes
    pub fn experiments(&self) -> Vec<&LifeTreeNode> {
        self.nodes.values()
            .filter(|n| n.node_type == NodeType::Experiment)
            .collect()
    }

    /// Save tree to disk
    pub fn save_to_disk(&self) -> Result<(), String> {
        if let Some(parent) = self.data_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        let snapshot = self.snapshot();
        let json = serde_json::to_string_pretty(&snapshot)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        std::fs::write(&self.data_path, json)
            .map_err(|e| format!("Failed to write: {}", e))?;
        Ok(())
    }

    /// Load tree from disk
    fn load_from_disk(&mut self) -> Result<(), String> {
        if !self.data_path.exists() {
            return Err("No saved tree".to_string());
        }

        let data = std::fs::read_to_string(&self.data_path)
            .map_err(|e| format!("Failed to read: {}", e))?;
        let snapshot: LifeTreeSnapshot = serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse: {}", e))?;

        self.root_id = snapshot.root_id;
        self.nodes.clear();
        for node in snapshot.nodes {
            self.nodes.insert(node.id.clone(), node);
        }

        // Count phase1 completions
        self.phase1_completions = self.nodes.values()
            .filter(|n| {
                n.node_type == NodeType::Experiment
                    && n.status == NodeStatus::Completed
                    && n.experiment_phase == Some(ExperimentPhase::TaskLevel)
            })
            .count() as u32;

        Ok(())
    }

    /// Rebuild tree from scratch (clear and re-init)
    pub fn rebuild(&mut self) {
        self.nodes.clear();
        self.phase1_completions = 0;
        self.build_empty();
        let _ = self.save_to_disk();
    }

    fn now() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    fn slugify(s: &str) -> String {
        s.chars()
            .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
            .collect::<String>()
            .chars()
            .take(30)
            .collect()
    }
}

impl Default for LifeTree {
    fn default() -> Self {
        Self::new()
    }
}
