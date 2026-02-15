//! Model download and lifecycle manager

use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tokio::sync::watch;

use super::registry::{ModelInfo, ModelType};

/// Status of a local model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModel {
    pub id: String,
    pub name: String,
    pub model_type: ModelType,
    pub filename: String,
    pub path: String,
    pub size_bytes: u64,
    pub downloaded_at: u64,
}

/// Download progress event
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub model_id: String,
    pub filename: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub progress: f64,
    pub status: DownloadStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Starting,
    Downloading,
    Completed,
    Failed,
    Cancelled,
}

/// Model manager — handles model directory, downloads, and listing
pub struct ModelManager {
    models_dir: PathBuf,
    cancel_tx: Option<watch::Sender<bool>>,
}

impl ModelManager {
    pub fn new() -> Self {
        let models_dir = Self::default_models_dir();
        Self {
            models_dir,
            cancel_tx: None,
        }
    }

    /// Default model storage directory
    fn default_models_dir() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("com.hawkeye.desktop")
            .join("models")
    }

    /// Ensure models directory exists
    fn ensure_dir(&self) -> Result<(), String> {
        std::fs::create_dir_all(&self.models_dir)
            .map_err(|e| format!("Failed to create models directory: {}", e))
    }

    /// Get models directory path
    pub fn models_dir(&self) -> &PathBuf {
        &self.models_dir
    }

    /// List all downloaded models
    pub fn list_models(&self) -> Result<Vec<LocalModel>, String> {
        self.ensure_dir()?;

        // Read manifest if it exists
        let manifest_path = self.models_dir.join("manifest.json");
        if manifest_path.exists() {
            let data = std::fs::read_to_string(&manifest_path)
                .map_err(|e| format!("Failed to read manifest: {}", e))?;
            let models: Vec<LocalModel> = serde_json::from_str(&data)
                .map_err(|e| format!("Failed to parse manifest: {}", e))?;
            // Filter out models whose files no longer exist
            Ok(models
                .into_iter()
                .filter(|m| PathBuf::from(&m.path).exists())
                .collect())
        } else {
            Ok(vec![])
        }
    }

    /// Check if a model exists locally
    pub fn model_exists(&self, model_id: &str) -> bool {
        self.list_models()
            .unwrap_or_default()
            .iter()
            .any(|m| m.id == model_id)
    }

    /// Delete a model by ID
    pub fn delete_model(&self, model_id: &str) -> Result<(), String> {
        let mut models = self.list_models()?;
        let idx = models
            .iter()
            .position(|m| m.id == model_id)
            .ok_or_else(|| format!("Model not found: {}", model_id))?;

        let model = &models[idx];
        let path = PathBuf::from(&model.path);
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete model file: {}", e))?;
        }

        models.remove(idx);
        self.save_manifest(&models)?;
        Ok(())
    }

    /// Download a model from the registry
    pub async fn download_model<F>(
        &mut self,
        model_info: &ModelInfo,
        on_progress: F,
    ) -> Result<LocalModel, String>
    where
        F: Fn(DownloadProgress) + Send + 'static,
    {
        self.ensure_dir()?;

        let dest_path = self.models_dir.join(&model_info.filename);

        // Create cancellation channel
        let (cancel_tx, cancel_rx) = watch::channel(false);
        self.cancel_tx = Some(cancel_tx);

        let model_id = model_info.id.clone();
        let filename = model_info.filename.clone();

        on_progress(DownloadProgress {
            model_id: model_id.clone(),
            filename: filename.clone(),
            downloaded_bytes: 0,
            total_bytes: model_info.size_bytes,
            progress: 0.0,
            status: DownloadStatus::Starting,
        });

        // Perform download with reqwest
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(&model_info.download_url)
            .send()
            .await
            .map_err(|e| format!("Download request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Download failed with status: {}", response.status()));
        }

        let total_bytes = response.content_length().unwrap_or(model_info.size_bytes);

        let mut file = tokio::fs::File::create(&dest_path)
            .await
            .map_err(|e| format!("Failed to create file: {}", e))?;

        let mut downloaded: u64 = 0;
        let mut stream = response.bytes_stream();
        use futures_util::StreamExt;
        use tokio::io::AsyncWriteExt;

        while let Some(chunk_result) = stream.next().await {
            // Check cancellation
            if *cancel_rx.borrow() {
                drop(file);
                let _ = tokio::fs::remove_file(&dest_path).await;
                on_progress(DownloadProgress {
                    model_id: model_id.clone(),
                    filename: filename.clone(),
                    downloaded_bytes: downloaded,
                    total_bytes,
                    progress: 0.0,
                    status: DownloadStatus::Cancelled,
                });
                self.cancel_tx = None;
                return Err("Download cancelled".to_string());
            }

            let chunk = chunk_result
                .map_err(|e| format!("Download stream error: {}", e))?;

            file.write_all(&chunk)
                .await
                .map_err(|e| format!("Write error: {}", e))?;

            downloaded += chunk.len() as u64;
            let progress = if total_bytes > 0 {
                downloaded as f64 / total_bytes as f64
            } else {
                0.0
            };

            on_progress(DownloadProgress {
                model_id: model_id.clone(),
                filename: filename.clone(),
                downloaded_bytes: downloaded,
                total_bytes,
                progress,
                status: DownloadStatus::Downloading,
            });
        }

        file.flush()
            .await
            .map_err(|e| format!("Flush error: {}", e))?;

        self.cancel_tx = None;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let local_model = LocalModel {
            id: model_info.id.clone(),
            name: model_info.name.clone(),
            model_type: model_info.model_type.clone(),
            filename: model_info.filename.clone(),
            path: dest_path.to_string_lossy().to_string(),
            size_bytes: downloaded,
            downloaded_at: now,
        };

        // Save to manifest
        let mut models = self.list_models().unwrap_or_default();
        models.retain(|m| m.id != model_info.id);
        models.push(local_model.clone());
        self.save_manifest(&models)?;

        on_progress(DownloadProgress {
            model_id: model_id.clone(),
            filename: filename.clone(),
            downloaded_bytes: downloaded,
            total_bytes,
            progress: 1.0,
            status: DownloadStatus::Completed,
        });

        Ok(local_model)
    }

    /// Cancel ongoing download
    pub fn cancel_download(&mut self) {
        if let Some(tx) = &self.cancel_tx {
            let _ = tx.send(true);
        }
    }

    /// Save model manifest to disk
    fn save_manifest(&self, models: &[LocalModel]) -> Result<(), String> {
        let manifest_path = self.models_dir.join("manifest.json");
        let json = serde_json::to_string_pretty(models)
            .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
        std::fs::write(&manifest_path, json)
            .map_err(|e| format!("Failed to write manifest: {}", e))?;
        Ok(())
    }

    /// Get path to a specific model file
    pub fn model_path(&self, model_id: &str) -> Option<PathBuf> {
        self.list_models()
            .unwrap_or_default()
            .iter()
            .find(|m| m.id == model_id)
            .map(|m| PathBuf::from(&m.path))
    }
}

impl Default for ModelManager {
    fn default() -> Self {
        Self::new()
    }
}
