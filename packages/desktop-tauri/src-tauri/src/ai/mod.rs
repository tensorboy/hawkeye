//! AI module — multi-provider chat (Gemini, OpenAI-compatible)

pub mod gemini;
pub mod openai;
pub mod provider;
pub mod types;

pub use gemini::GeminiClient;
pub use openai::OpenAiClient;
pub use provider::AiProvider;
pub use types::{ChatMessage, ChatResponse};
