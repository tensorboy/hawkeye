//! Observe module — background screen monitoring with change detection

pub mod activity_log;
pub mod adaptive_refresh;
pub mod change_detector;
pub mod intent;
pub mod loop_runner;

pub use activity_log::ActivityLog;
pub use adaptive_refresh::AdaptiveRefresh;
pub use intent::IntentRecognizer;
pub use loop_runner::ObserveLoop;
