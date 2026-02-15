//! Voice module — speech recognition and TTS via macOS native APIs

pub mod speech;

pub use speech::{SpeechResult, SpeechStatus};
