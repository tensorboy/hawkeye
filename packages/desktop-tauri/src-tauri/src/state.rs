//! Shared application state managed by Tauri

use std::sync::Arc;
use tokio::sync::RwLock;

use crate::ai::AiProvider;
use crate::commands::debug_cmd::DebugTimeline;
use crate::commands::gesture_cmd::GestureConfig;
use crate::config::AppConfig;
use crate::life_tree::LifeTree;
use crate::models::ModelManager;
use crate::observe::{ActivityLog, AdaptiveRefresh, IntentRecognizer, ObserveLoop};

/// Observation result emitted by the observe loop
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationResult {
    pub screenshot_base64: Option<String>,
    pub ocr_text: Option<String>,
    pub active_window: Option<crate::commands::perception_cmd::WindowInfoResponse>,
    pub change_ratio: f64,
    pub timestamp: u64,
}

/// Shared application state
pub struct AppState {
    pub ai_client: RwLock<Option<Box<dyn AiProvider>>>,
    pub config: RwLock<AppConfig>,
    pub observe_loop: RwLock<Option<ObserveLoop>>,
    pub last_observation: RwLock<Option<ObservationResult>>,
    pub adaptive_refresh: RwLock<AdaptiveRefresh>,
    pub activity_log: RwLock<ActivityLog>,
    pub intent_recognizer: RwLock<IntentRecognizer>,
    pub model_manager: RwLock<ModelManager>,
    pub life_tree: RwLock<LifeTree>,
    pub gesture_config: RwLock<GestureConfig>,
    pub debug_timeline: RwLock<DebugTimeline>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Arc<Self> {
        Arc::new(Self {
            ai_client: RwLock::new(None),
            config: RwLock::new(config),
            observe_loop: RwLock::new(None),
            last_observation: RwLock::new(None),
            adaptive_refresh: RwLock::new(AdaptiveRefresh::default()),
            activity_log: RwLock::new(ActivityLog::default()),
            intent_recognizer: RwLock::new(IntentRecognizer::default()),
            model_manager: RwLock::new(ModelManager::default()),
            life_tree: RwLock::new(LifeTree::default()),
            gesture_config: RwLock::new(GestureConfig::default()),
            debug_timeline: RwLock::new(DebugTimeline::default()),
        })
    }
}
