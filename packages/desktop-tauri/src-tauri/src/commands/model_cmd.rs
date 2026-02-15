//! Model management commands — list, download, delete local AI models

use std::sync::Arc;
use tauri::{command, Emitter, State, AppHandle};

use crate::events;
use crate::models::manager::{DownloadProgress, LocalModel};
use crate::models::registry::{self, ModelInfo, ModelType};
use crate::state::AppState;

/// Get the models directory path
#[command]
pub async fn get_models_dir(
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let mgr = state.model_manager.read().await;
    Ok(mgr.models_dir().to_string_lossy().to_string())
}

/// List all downloaded models
#[command]
pub async fn list_models(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<LocalModel>, String> {
    let mgr = state.model_manager.read().await;
    mgr.list_models()
}

/// Get recommended models from registry
#[command]
pub fn get_recommended_models() -> Vec<ModelInfo> {
    registry::recommended_models()
}

/// Get recommended models filtered by type
#[command]
pub fn get_models_by_type(model_type: ModelType) -> Vec<ModelInfo> {
    registry::get_models_by_type(&model_type)
}

/// Check if a model exists locally
#[command]
pub async fn model_exists(
    model_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    let mgr = state.model_manager.read().await;
    Ok(mgr.model_exists(&model_id))
}

/// Download a model by ID from the registry
#[command]
pub async fn download_model(
    model_id: String,
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<LocalModel, String> {
    let model_info = registry::get_model_by_id(&model_id)
        .ok_or_else(|| format!("Unknown model ID: {}", model_id))?;

    let app_clone = app.clone();
    let mut mgr = state.model_manager.write().await;

    mgr.download_model(&model_info, move |progress: DownloadProgress| {
        let _ = app_clone.emit(events::MODEL_DOWNLOAD_PROGRESS, &progress);
    })
    .await
}

/// Cancel the current download
#[command]
pub async fn cancel_model_download(
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut mgr = state.model_manager.write().await;
    mgr.cancel_download();
    Ok(())
}

/// Delete a downloaded model
#[command]
pub async fn delete_model(
    model_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mgr = state.model_manager.read().await;
    mgr.delete_model(&model_id)
}

/// Get path to a specific model
#[command]
pub async fn get_model_path(
    model_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<String>, String> {
    let mgr = state.model_manager.read().await;
    Ok(mgr.model_path(&model_id).map(|p| p.to_string_lossy().to_string()))
}
