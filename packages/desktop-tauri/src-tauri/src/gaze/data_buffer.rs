//! Training data buffer for gaze calibration samples

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::Path;

pub const FEATURE_DIM: usize = 40;
pub const MIN_SAMPLES_FOR_TRAINING: usize = 50;
pub const MAX_BUFFER_SIZE: usize = 5000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GazeSample {
    pub features: Vec<f32>,
    pub target_x: f32,
    pub target_y: f32,
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GazeDataBuffer {
    samples: VecDeque<GazeSample>,
    #[serde(default)]
    samples_since_last_train: usize,
}

impl Default for GazeDataBuffer {
    fn default() -> Self {
        Self {
            samples: VecDeque::new(),
            samples_since_last_train: 0,
        }
    }
}

impl GazeDataBuffer {
    pub fn add_sample(&mut self, sample: GazeSample) -> usize {
        if self.samples.len() >= MAX_BUFFER_SIZE {
            let remove_count = MAX_BUFFER_SIZE / 10;
            self.samples.drain(..remove_count);
        }
        self.samples.push_back(sample);
        self.samples_since_last_train += 1;
        self.samples.len()
    }

    pub fn should_auto_train(&self) -> bool {
        self.samples.len() >= MIN_SAMPLES_FOR_TRAINING
            && self.samples_since_last_train >= MIN_SAMPLES_FOR_TRAINING
    }

    pub fn sample_count(&self) -> usize {
        self.samples.len()
    }

    pub fn new_sample_count(&self) -> usize {
        self.samples_since_last_train
    }

    pub fn reset_train_counter(&mut self) {
        self.samples_since_last_train = 0;
    }

    /// Export all samples as JSON for the Swift CLI
    pub fn export_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(&self.samples.iter().collect::<Vec<_>>())
    }

    /// Persist buffer to disk
    pub fn save(&self, path: &Path) -> anyhow::Result<()> {
        let json = serde_json::to_string(self)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, json)?;
        Ok(())
    }

    /// Load buffer from disk
    pub fn load(path: &Path) -> anyhow::Result<Self> {
        let data = std::fs::read_to_string(path)?;
        let buffer: Self = serde_json::from_str(&data)?;
        Ok(buffer)
    }

    /// Get the default persistence path
    pub fn default_path() -> Option<std::path::PathBuf> {
        dirs::data_dir().map(|d| d.join("hawkeye").join("gaze").join("samples.json"))
    }
}
