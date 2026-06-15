//! AI module — multi-provider chat (Gemini, OpenAI-compatible, Anthropic, local llama.cpp)

pub mod anthropic;
pub mod gemini;
pub mod local;
pub mod openai;
pub mod provider;
pub mod types;

pub use anthropic::AnthropicClient;
pub use gemini::GeminiClient;
pub use local::LocalProvider;
pub use openai::OpenAiClient;
pub use provider::AiProvider;
pub use types::{ChatMessage, ChatResponse};
