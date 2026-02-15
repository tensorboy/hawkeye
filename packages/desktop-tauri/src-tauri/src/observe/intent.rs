//! Intent pipeline — rule-based + AI-enhanced user intent recognition

use serde::{Deserialize, Serialize};

/// Intent types that can be recognized
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum IntentType {
    FileOrganize,
    CodeAssist,
    Search,
    Communication,
    Automation,
    DataProcess,
    SystemConfig,
    Unknown,
}

/// A single recognized intent
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserIntent {
    pub id: String,
    pub intent_type: IntentType,
    pub description: String,
    pub confidence: f64,
    pub context: IntentContext,
    pub created_at: u64,
}

/// Context snapshot for an intent
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentContext {
    pub current_app: Option<String>,
    pub current_title: Option<String>,
    pub activity_state: String,
}

/// Input context for intent recognition
pub struct RecognitionInput {
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub ocr_text: Option<String>,
    pub clipboard: Option<String>,
}

/// Rule-based intent recognizer
pub struct IntentRecognizer {
    min_confidence: f64,
    recent_intents: Vec<UserIntent>,
    max_recent: usize,
}

impl Default for IntentRecognizer {
    fn default() -> Self {
        Self {
            min_confidence: 0.5,
            recent_intents: Vec::new(),
            max_recent: 20,
        }
    }
}

impl IntentRecognizer {
    /// Recognize intents from observation context (rule-based)
    pub fn recognize(&mut self, input: &RecognitionInput) -> Vec<UserIntent> {
        let mut intents = Vec::new();
        let context = self.build_context(input);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        if self.is_file_organize(input) {
            intents.push(self.create_intent(
                IntentType::FileOrganize,
                "File organization or download management",
                0.7,
                context.clone(),
                now,
            ));
        }

        if self.is_code_context(input) {
            intents.push(self.create_intent(
                IntentType::CodeAssist,
                "Code development assistance",
                0.75,
                context.clone(),
                now,
            ));
        }

        if self.is_search_context(input) {
            intents.push(self.create_intent(
                IntentType::Search,
                "Information search",
                0.6,
                context.clone(),
                now,
            ));
        }

        if self.is_writing_context(input) {
            intents.push(self.create_intent(
                IntentType::Communication,
                "Writing or communication",
                0.65,
                context.clone(),
                now,
            ));
        }

        if self.is_data_process(input) {
            intents.push(self.create_intent(
                IntentType::DataProcess,
                "Data processing",
                0.6,
                context.clone(),
                now,
            ));
        }

        // Filter by min confidence
        intents.retain(|i| i.confidence >= self.min_confidence);
        intents.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));

        // Store recent
        for intent in &intents {
            self.recent_intents.insert(0, intent.clone());
        }
        self.recent_intents.truncate(self.max_recent);

        intents
    }

    /// Get the most recent recognized intents
    pub fn recent_intents(&self) -> &[UserIntent] {
        &self.recent_intents
    }

    /// Build the AI prompt for enhanced recognition
    pub fn build_ai_prompt(input: &RecognitionInput, rule_intents: &[UserIntent]) -> String {
        let mut parts = Vec::new();

        if let Some(app) = &input.app_name {
            parts.push(format!("App: {}", app));
        }
        if let Some(title) = &input.window_title {
            parts.push(format!("Window: {}", title));
        }
        if let Some(ocr) = &input.ocr_text {
            let preview: String = ocr.chars().take(300).collect();
            parts.push(format!("Screen text: {}", preview));
        }

        let rule_hints: Vec<String> = rule_intents
            .iter()
            .map(|i| format!("{:?}: {} ({:.0}%)", i.intent_type, i.description, i.confidence * 100.0))
            .collect();

        format!(
            "You are Hawkeye, a desktop activity assistant. Based on the following user context, \
             identify what the user is currently doing. Respond with a single short sentence (max 15 words) \
             describing the user's current activity/intent.\n\n\
             Context:\n{}\n\n\
             Rule-based detection: {}\n\n\
             Respond with ONLY the activity description, nothing else.",
            parts.join("\n"),
            if rule_hints.is_empty() { "none".to_string() } else { rule_hints.join(", ") }
        )
    }

    /// Parse AI response and merge with rule-based intents
    pub fn merge_ai_response(
        rule_intents: &[UserIntent],
        ai_description: &str,
    ) -> Vec<UserIntent> {
        let mut result = rule_intents.to_vec();

        // Boost confidence of rule intents that match AI description
        let desc_lower = ai_description.to_lowercase();
        for intent in &mut result {
            let matches = match intent.intent_type {
                IntentType::CodeAssist => desc_lower.contains("code") || desc_lower.contains("develop") || desc_lower.contains("programming"),
                IntentType::Search => desc_lower.contains("search") || desc_lower.contains("browse") || desc_lower.contains("looking"),
                IntentType::Communication => desc_lower.contains("writ") || desc_lower.contains("email") || desc_lower.contains("messag"),
                IntentType::FileOrganize => desc_lower.contains("file") || desc_lower.contains("organiz") || desc_lower.contains("download"),
                IntentType::DataProcess => desc_lower.contains("data") || desc_lower.contains("spreadsheet") || desc_lower.contains("analyz"),
                _ => false,
            };
            if matches {
                intent.confidence = (intent.confidence + 0.1).min(0.99);
                intent.description = ai_description.to_string();
            }
        }

        result.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
        result
    }

    // --- Rule checks ---

    fn is_file_organize(&self, input: &RecognitionInput) -> bool {
        let app = input.app_name.as_deref().unwrap_or("").to_lowercase();
        let title = input.window_title.as_deref().unwrap_or("").to_lowercase();

        app.contains("finder") || app.contains("explorer") || app.contains("nautilus")
            || title.contains("download") || title.contains("下载")
    }

    fn is_code_context(&self, input: &RecognitionInput) -> bool {
        let app = input.app_name.as_deref().unwrap_or("").to_lowercase();
        let title = input.window_title.as_deref().unwrap_or("").to_lowercase();

        let code_apps = ["vscode", "code", "idea", "webstorm", "pycharm", "sublime", "vim", "nvim", "cursor", "zed"];
        if code_apps.iter().any(|a| app.contains(a)) {
            return true;
        }

        let code_exts = [".ts", ".js", ".py", ".java", ".go", ".rs", ".cpp", ".swift", ".kt"];
        code_exts.iter().any(|ext| title.contains(ext))
    }

    fn is_search_context(&self, input: &RecognitionInput) -> bool {
        let app = input.app_name.as_deref().unwrap_or("").to_lowercase();
        let title = input.window_title.as_deref().unwrap_or("").to_lowercase();

        let browsers = ["chrome", "safari", "firefox", "edge", "arc", "brave"];
        if browsers.iter().any(|b| app.contains(b)) {
            let search_engines = ["google", "bing", "baidu", "duckduckgo", "搜索", "search"];
            return search_engines.iter().any(|s| title.contains(s));
        }
        false
    }

    fn is_writing_context(&self, input: &RecognitionInput) -> bool {
        let app = input.app_name.as_deref().unwrap_or("").to_lowercase();
        let title = input.window_title.as_deref().unwrap_or("").to_lowercase();

        let writing_apps = ["word", "pages", "docs", "notion", "obsidian", "typora", "bear"];
        let mail_apps = ["mail", "outlook", "gmail", "thunderbird"];

        writing_apps.iter().any(|a| app.contains(a) || title.contains(a))
            || mail_apps.iter().any(|a| app.contains(a) || title.contains(a))
    }

    fn is_data_process(&self, input: &RecognitionInput) -> bool {
        let app = input.app_name.as_deref().unwrap_or("").to_lowercase();
        let title = input.window_title.as_deref().unwrap_or("").to_lowercase();

        let data_apps = ["excel", "numbers", "sheets", "tableau", "jupyter", "rstudio"];
        if data_apps.iter().any(|a| app.contains(a) || title.contains(a)) {
            return true;
        }

        let data_exts = [".csv", ".xlsx", ".xls", ".json", ".xml", ".sql"];
        data_exts.iter().any(|ext| title.contains(ext))
    }

    // --- Helpers ---

    fn build_context(&self, input: &RecognitionInput) -> IntentContext {
        let activity_state = if self.is_code_context(input) {
            "coding"
        } else if self.is_search_context(input) {
            "browsing"
        } else if self.is_writing_context(input) {
            "writing"
        } else if self.is_file_organize(input) {
            "organizing"
        } else if self.is_data_process(input) {
            "data_processing"
        } else {
            "idle"
        };

        IntentContext {
            current_app: input.app_name.clone(),
            current_title: input.window_title.clone(),
            activity_state: activity_state.to_string(),
        }
    }

    fn create_intent(
        &self,
        intent_type: IntentType,
        description: &str,
        confidence: f64,
        context: IntentContext,
        timestamp: u64,
    ) -> UserIntent {
        UserIntent {
            id: format!("intent_{}_{}", timestamp, rand_suffix()),
            intent_type,
            description: description.to_string(),
            confidence,
            context,
            created_at: timestamp,
        }
    }
}

fn rand_suffix() -> String {
    use std::time::SystemTime;
    let nanos = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    format!("{:x}", nanos)
}
