//! Voice pipeline commands — speech recognition via macOS native APIs

use tauri::command;

use crate::voice::speech;

/// Check speech recognition availability
#[command]
pub async fn speech_status() -> Result<speech::SpeechStatus, String> {
    speech::check_status().await.map_err(|e| e.to_string())
}

/// Listen from microphone for specified duration and transcribe
#[command]
pub async fn speech_listen(
    duration_secs: Option<u32>,
) -> Result<speech::SpeechResult, String> {
    let duration = duration_secs.unwrap_or(5);
    speech::listen(duration).await.map_err(|e| e.to_string())
}

/// Transcribe an audio file
#[command]
pub async fn speech_transcribe_file(
    audio_path: String,
) -> Result<speech::SpeechResult, String> {
    speech::transcribe_file(&audio_path)
        .await
        .map_err(|e| e.to_string())
}
