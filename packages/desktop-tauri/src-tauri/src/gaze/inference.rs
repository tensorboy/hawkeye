//! CPU inference for real-time gaze prediction (<0.1ms per frame)

use serde::{Deserialize, Serialize};
use std::path::Path;

/// 3-layer MLP: 40 → 128 (ReLU) → 64 (ReLU) → 2
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GazeModel {
    /// Layer 1 weights [128][40]
    pub w1: Vec<Vec<f32>>,
    /// Layer 1 bias [128]
    pub b1: Vec<f32>,
    /// Layer 2 weights [64][128]
    pub w2: Vec<Vec<f32>>,
    /// Layer 2 bias [64]
    pub b2: Vec<f32>,
    /// Layer 3 weights [2][64]
    pub w3: Vec<Vec<f32>>,
    /// Layer 3 bias [2]
    pub b3: Vec<f32>,
    /// Timestamp when model was trained
    pub trained_at: u64,
    /// Final training loss
    pub train_loss: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GazePrediction {
    pub x: f32,
    pub y: f32,
    pub confidence: f32,
    pub latency_us: u64,
}

impl GazeModel {
    /// Forward pass through the 3-layer MLP
    pub fn predict(&self, features: &[f32]) -> (f32, f32) {
        debug_assert_eq!(features.len(), 40, "Expected 40 eye features");

        // Layer 1: z1 = ReLU(W1 * x + b1)
        let mut z1 = vec![0.0f32; 128];
        for i in 0..128 {
            let mut sum = self.b1[i];
            for j in 0..40 {
                sum += self.w1[i][j] * features[j];
            }
            z1[i] = sum.max(0.0);
        }

        // Layer 2: z2 = ReLU(W2 * z1 + b2)
        let mut z2 = vec![0.0f32; 64];
        for i in 0..64 {
            let mut sum = self.b2[i];
            for j in 0..128 {
                sum += self.w2[i][j] * z1[j];
            }
            z2[i] = sum.max(0.0);
        }

        // Layer 3: out = W3 * z2 + b3 (no activation)
        let mut out = [0.0f32; 2];
        for i in 0..2 {
            let mut sum = self.b3[i];
            for j in 0..64 {
                sum += self.w3[i][j] * z2[j];
            }
            out[i] = sum;
        }

        // Clamp to [0, 1]
        (out[0].clamp(0.0, 1.0), out[1].clamp(0.0, 1.0))
    }

    /// Predict with timing
    pub fn predict_timed(&self, features: &[f32]) -> GazePrediction {
        let start = std::time::Instant::now();
        let (x, y) = self.predict(features);
        let latency_us = start.elapsed().as_micros() as u64;

        GazePrediction {
            x,
            y,
            confidence: if self.train_loss < 0.01 {
                0.95
            } else if self.train_loss < 0.05 {
                0.8
            } else {
                0.6
            },
            latency_us,
        }
    }

    /// Load weights from JSON file
    pub fn load(path: &Path) -> anyhow::Result<Self> {
        let data = std::fs::read_to_string(path)?;
        let model: Self = serde_json::from_str(&data)?;
        Ok(model)
    }

    /// Default weights file path
    pub fn default_path() -> Option<std::path::PathBuf> {
        dirs::data_dir().map(|d| d.join("hawkeye").join("gaze").join("gaze_weights.json"))
    }
}
