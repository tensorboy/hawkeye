//! Recommended model registry — curated list of downloadable models

use serde::{Deserialize, Serialize};

/// Type of AI model
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModelType {
    TextLlm,
    VisionLlm,
    Whisper,
    Tts,
    Vad,
    Embedding,
}

/// Model information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub model_type: ModelType,
    pub description: String,
    pub size_bytes: u64,
    pub download_url: String,
    pub filename: String,
}

impl ModelInfo {
    /// Human-readable size string
    pub fn size_display(&self) -> String {
        let mb = self.size_bytes as f64 / (1024.0 * 1024.0);
        if mb > 1024.0 {
            format!("{:.1} GB", mb / 1024.0)
        } else {
            format!("{:.0} MB", mb)
        }
    }
}

/// Get all recommended models
pub fn recommended_models() -> Vec<ModelInfo> {
    vec![
        // Text LLMs (GGUF)
        ModelInfo {
            id: "qwen2.5-3b-q4".to_string(),
            name: "Qwen 2.5 3B (Q4_K_M)".to_string(),
            model_type: ModelType::TextLlm,
            description: "Fast and capable multilingual model, good for general tasks".to_string(),
            size_bytes: 2_000_000_000,
            download_url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf".to_string(),
            filename: "qwen2.5-3b-instruct-q4_k_m.gguf".to_string(),
        },
        ModelInfo {
            id: "llama3.2-3b-q4".to_string(),
            name: "Llama 3.2 3B (Q4_K_M)".to_string(),
            model_type: ModelType::TextLlm,
            description: "Meta's efficient model, strong English performance".to_string(),
            size_bytes: 2_019_000_000,
            download_url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf".to_string(),
            filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf".to_string(),
        },
        ModelInfo {
            id: "phi3-mini-q4".to_string(),
            name: "Phi-3 Mini 3.8B (Q4_K_M)".to_string(),
            model_type: ModelType::TextLlm,
            description: "Microsoft's compact model, great reasoning ability".to_string(),
            size_bytes: 2_394_000_000,
            download_url: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf".to_string(),
            filename: "Phi-3.5-mini-instruct-Q4_K_M.gguf".to_string(),
        },
        // Whisper ASR
        ModelInfo {
            id: "whisper-large-v3-turbo-q5".to_string(),
            name: "Whisper Large V3 Turbo (Q5)".to_string(),
            model_type: ModelType::Whisper,
            description: "High-quality speech recognition, multilingual".to_string(),
            size_bytes: 547_000_000,
            download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin".to_string(),
            filename: "ggml-large-v3-turbo-q5_0.bin".to_string(),
        },
        ModelInfo {
            id: "whisper-base".to_string(),
            name: "Whisper Base".to_string(),
            model_type: ModelType::Whisper,
            description: "Lightweight speech recognition, fast inference".to_string(),
            size_bytes: 148_000_000,
            download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin".to_string(),
            filename: "ggml-base.bin".to_string(),
        },
        // VAD
        ModelInfo {
            id: "silero-vad-v5".to_string(),
            name: "Silero VAD v5".to_string(),
            model_type: ModelType::Vad,
            description: "Voice activity detection, 2MB lightweight model".to_string(),
            size_bytes: 2_000_000,
            download_url: "https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx".to_string(),
            filename: "silero_vad.onnx".to_string(),
        },
    ]
}

/// Get model by ID
pub fn get_model_by_id(id: &str) -> Option<ModelInfo> {
    recommended_models().into_iter().find(|m| m.id == id)
}

/// Get models by type
pub fn get_models_by_type(model_type: &ModelType) -> Vec<ModelInfo> {
    recommended_models()
        .into_iter()
        .filter(|m| &m.model_type == model_type)
        .collect()
}
