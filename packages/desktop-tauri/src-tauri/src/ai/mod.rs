//! AI module — multi-provider chat (Gemini, OpenAI-compatible, local llama.cpp)

pub mod gemini;
pub mod local;
pub mod openai;
pub mod provider;
pub mod types;

pub use gemini::GeminiClient;
pub use local::LocalProvider;
pub use openai::OpenAiClient;
pub use provider::AiProvider;
pub use types::{ChatMessage, ChatResponse};
