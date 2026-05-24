//! Training data collector — records chat sessions as JSONL for MLX LoRA fine-tuning
//!
//! Data flow (inspired by OpenClaw-RL's next_state feedback pattern):
//! 1. User sends message → assistant responds → one "turn" recorded
//! 2. User can rate each turn (thumbs up/down) → becomes reward signal
//! 3. Context (active window, screen OCR) captured alongside each turn
//! 4. Exported as ChatML JSONL, compatible with MLX LoRA training

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;

use crate::ai::ChatMessage;

/// A single training sample (one conversation turn)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingSample {
    pub session_id: String,
    pub turn_id: u32,
    pub timestamp: u64,
    pub messages: Vec<ChatMessage>,
    pub context: Option<TurnContext>,
    pub feedback: Option<TurnFeedback>,
}

/// Contextual information captured with a turn
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnContext {
    pub active_window: Option<String>,
    pub screen_ocr_snippet: Option<String>,
}

/// User feedback on a turn (reward signal for RL/DPO)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnFeedback {
    /// 1 = good, -1 = bad, 0 = neutral
    pub rating: i8,
    pub comment: Option<String>,
}

/// Training data statistics
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingStats {
    pub total_samples: usize,
    pub positive_samples: usize,
    pub negative_samples: usize,
    pub neutral_samples: usize,
    pub sessions: usize,
    pub data_dir: String,
}

/// Training data collector
pub struct TrainingCollector {
    data_dir: PathBuf,
}

impl TrainingCollector {
    pub fn new() -> Self {
        let data_dir = Self::default_data_dir();
        Self { data_dir }
    }

    fn default_data_dir() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("com.hawkeye.desktop")
            .join("training_data")
    }

    fn ensure_dir(&self) -> Result<(), String> {
        fs::create_dir_all(&self.data_dir)
            .map_err(|e| format!("Failed to create training data directory: {}", e))
    }

    fn samples_path(&self) -> PathBuf {
        self.data_dir.join("samples.jsonl")
    }

    /// Save a training sample (appends to JSONL file)
    pub fn save_sample(&self, sample: &TrainingSample) -> Result<(), String> {
        self.ensure_dir()?;

        let json = serde_json::to_string(sample)
            .map_err(|e| format!("Failed to serialize sample: {}", e))?;

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.samples_path())
            .map_err(|e| format!("Failed to open samples file: {}", e))?;

        writeln!(file, "{}", json)
            .map_err(|e| format!("Failed to write sample: {}", e))?;

        Ok(())
    }

    /// Update feedback for a specific turn in a session
    pub fn update_feedback(
        &self,
        session_id: &str,
        turn_id: u32,
        feedback: TurnFeedback,
    ) -> Result<(), String> {
        let path = self.samples_path();
        if !path.exists() {
            return Err("No training data file found".to_string());
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read samples: {}", e))?;

        let mut updated_lines = Vec::new();
        let mut found = false;

        for line in content.lines() {
            if line.is_empty() {
                continue;
            }
            let mut sample: TrainingSample = serde_json::from_str(line)
                .map_err(|e| format!("Failed to parse sample: {}", e))?;

            if sample.session_id == session_id && sample.turn_id == turn_id {
                sample.feedback = Some(feedback.clone());
                found = true;
            }

            let json = serde_json::to_string(&sample)
                .map_err(|e| format!("Failed to serialize: {}", e))?;
            updated_lines.push(json);
        }

        if !found {
            return Err(format!(
                "Sample not found: session={}, turn={}",
                session_id, turn_id
            ));
        }

        fs::write(&path, updated_lines.join("\n") + "\n")
            .map_err(|e| format!("Failed to write updated samples: {}", e))?;

        Ok(())
    }

    /// Get training data statistics
    pub fn stats(&self) -> Result<TrainingStats, String> {
        let path = self.samples_path();
        if !path.exists() {
            return Ok(TrainingStats {
                total_samples: 0,
                positive_samples: 0,
                negative_samples: 0,
                neutral_samples: 0,
                sessions: 0,
                data_dir: self.data_dir.to_string_lossy().to_string(),
            });
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read samples: {}", e))?;

        let mut total = 0;
        let mut positive = 0;
        let mut negative = 0;
        let mut neutral = 0;
        let mut sessions = std::collections::HashSet::new();

        for line in content.lines() {
            if line.is_empty() {
                continue;
            }
            if let Ok(sample) = serde_json::from_str::<TrainingSample>(line) {
                total += 1;
                sessions.insert(sample.session_id.clone());
                match &sample.feedback {
                    Some(f) if f.rating > 0 => positive += 1,
                    Some(f) if f.rating < 0 => negative += 1,
                    _ => neutral += 1,
                }
            }
        }

        Ok(TrainingStats {
            total_samples: total,
            positive_samples: positive,
            negative_samples: negative,
            neutral_samples: neutral,
            sessions: sessions.len(),
            data_dir: self.data_dir.to_string_lossy().to_string(),
        })
    }

    /// Export training data as ChatML JSONL (format MLX LoRA expects)
    /// Only exports samples with positive feedback (rating > 0)
    pub fn export_chatml(&self, output_path: &PathBuf) -> Result<usize, String> {
        let path = self.samples_path();
        if !path.exists() {
            return Ok(0);
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read samples: {}", e))?;

        let mut file = fs::File::create(output_path)
            .map_err(|e| format!("Failed to create export file: {}", e))?;

        let mut count = 0;

        for line in content.lines() {
            if line.is_empty() {
                continue;
            }
            let sample: TrainingSample = serde_json::from_str(line)
                .map_err(|e| format!("Failed to parse sample: {}", e))?;

            // Only export positively-rated samples
            let should_export = match &sample.feedback {
                Some(f) => f.rating > 0,
                None => false,
            };

            if !should_export {
                continue;
            }

            // Build ChatML formatted conversation
            let chatml_entry = serde_json::json!({
                "messages": sample.messages.iter().map(|m| {
                    serde_json::json!({
                        "role": m.role,
                        "content": m.content
                    })
                }).collect::<Vec<_>>()
            });

            let json = serde_json::to_string(&chatml_entry)
                .map_err(|e| format!("Failed to serialize ChatML: {}", e))?;

            writeln!(file, "{}", json)
                .map_err(|e| format!("Failed to write export: {}", e))?;

            count += 1;
        }

        Ok(count)
    }
}

impl Default for TrainingCollector {
    fn default() -> Self {
        Self::new()
    }
}
