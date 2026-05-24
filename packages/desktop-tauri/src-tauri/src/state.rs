//! Shared application state managed by Tauri

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{oneshot, RwLock};

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
use crate::perception::ocr::{BoundingBoxPx, OcrRegion};
use crate::training::TrainingCollector;

/// Observation result emitted by the observe loop
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationResult {
    pub screenshot_base64: Option<String>,
    pub ocr_text: Option<String>,
    /// All recognized text regions with normalized Vision bboxes. Frontend
    /// converts to screen pixels via `screenshot_width`/`screenshot_height`.
    pub ocr_regions: Option<Vec<OcrRegion>>,
    pub screenshot_width: Option<u32>,
    pub screenshot_height: Option<u32>,
    pub active_window: Option<crate::commands::perception_cmd::WindowInfoResponse>,
    pub change_ratio: f64,
    pub timestamp: u64,
}

/// The screen region the user is currently looking at, computed by the
/// frontend after dwell detection and pushed back via `set_gazed_entity`.
///
/// This is the "this/that" target for voice commands and the anchor for
/// gaze-driven UI.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GazedEntity {
    /// Recognized text inside the gazed region.
    pub text: String,
    /// Optional knowledge graph type (person/project/technology/...) if the
    /// extractor matched this text to an entity. `None` for plain text.
    pub entity_type: Option<String>,
    /// Bounding box in **screen pixel coordinates**, top-left origin.
    pub bbox_px: BoundingBoxPx,
    pub confidence: f32,
    /// How long the user has been looking at this region (ms).
    pub dwell_ms: u64,
    /// App that owns the region (e.g. "Google Chrome").
    pub app_name: Option<String>,
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
    /// The entity (text region + KG type if matched) the user is currently
    /// looking at. Updated by the frontend's `useGazedEntity` hook once
    /// dwell-on-region exceeds the threshold. Voice / agent commands read
    /// this to resolve deictic references like "this" / "that".
    pub current_gazed_entity: RwLock<Option<GazedEntity>>,
    /// In-flight confirmation requests from the agent runner. Keyed by a
    /// short id; the runner awaits the oneshot, the frontend resolves it
    /// via the `agent_confirm` command (true = accept, false = reject).
    pub pending_confirms: RwLock<HashMap<String, oneshot::Sender<bool>>>,
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
            current_gazed_entity: RwLock::new(None),
            pending_confirms: RwLock::new(HashMap::new()),
            training_collector: RwLock::new(TrainingCollector::default()),
            agent_supervisor: RwLock::new(None),
            event_sink: RwLock::new(None),
        })
    }
}

/// GUI-only state that doesn't belong on the daemon's `AppState`. Just the
/// daemon-spawn book-keeping — child handle (so the OS doesn't reap the
/// daemon while the GUI is up) and cached info for the React app's
/// "hawkeyed" banner. Created in the Tauri setup hook and managed via
/// `app.manage`.
#[derive(Default)]
pub struct TauriShellState {
    pub daemon_info: RwLock<Option<crate::daemon::DaemonInfo>>,
    pub daemon_child: RwLock<Option<tokio::process::Child>>,
}
