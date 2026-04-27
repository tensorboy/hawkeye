//! Shared application state managed by Tauri

use std::sync::Arc;
use tokio::sync::RwLock;

use crate::agent::DaemonSupervisor;
use crate::ai::AiProvider;
use crate::commands::debug_cmd::DebugTimeline;
use crate::commands::gesture_cmd::GestureConfig;
use crate::config::AppConfig;
use crate::gaze::data_buffer::GazeDataBuffer;
use crate::gaze::inference::GazeModel;
use crate::life_tree::LifeTree;
use crate::models::ModelManager;
use crate::observe::{ActivityLog, AdaptiveRefresh, IntentRecognizer, ObserveLoop};
use crate::training::TrainingCollector;

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
    /// Active AI provider. `Arc` so commands and the agent runner can share
    /// it without holding the lock for the duration of an HTTP request.
    pub ai_client: RwLock<Option<Arc<dyn AiProvider>>>,
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
    pub gaze_buffer: RwLock<GazeDataBuffer>,
    pub gaze_model: RwLock<Option<GazeModel>>,
    pub gaze_training_active: RwLock<bool>,
    pub training_collector: RwLock<TrainingCollector>,
    /// cua-driver supervisor — manages the daemon lifecycle and exposes the
    /// `CuaDriverClient`. `None` until initialized in `setup`.
    pub agent_supervisor: RwLock<Option<DaemonSupervisor>>,
    /// Provider-neutral event sink. Populated in Tauri setup with a
    /// `TauriSink`; left as `None` for headless tests / CLI sub-commands
    /// that build sinks ad-hoc.
    pub event_sink: RwLock<Option<crate::event_sink::SharedSink>>,
}

impl AppState {
    fn load_gaze_buffer() -> GazeDataBuffer {
        GazeDataBuffer::default_path()
            .and_then(|p| GazeDataBuffer::load(&p).ok())
            .unwrap_or_default()
    }

    fn load_gaze_model() -> Option<GazeModel> {
        GazeModel::default_path().and_then(|p| GazeModel::load(&p).ok())
    }

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
            gaze_buffer: RwLock::new(Self::load_gaze_buffer()),
            gaze_model: RwLock::new(Self::load_gaze_model()),
            gaze_training_active: RwLock::new(false),
            training_collector: RwLock::new(TrainingCollector::default()),
            agent_supervisor: RwLock::new(None),
            event_sink: RwLock::new(None),
        })
    }
}
