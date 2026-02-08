/**
 * Voice Module — Browser-local voice interaction pipeline
 *
 * Components:
 * - MoonshineSTT: Speech-to-text via Transformers.js (WebGPU/WASM)
 * - KokoroTTS: Text-to-speech via Kokoro model
 * - BrowserVADProcessor: Voice Activity Detection with echo cancellation
 * - VoicePipeline: Orchestrator wiring VAD → STT → Desktop → TTS
 */

// STT
export {
  MoonshineSTT,
  type MoonshineConfig,
  type TranscriptionResult,
  type STTStatus,
  DEFAULT_MOONSHINE_CONFIG,
} from './moonshine-stt';

// TTS
export {
  KokoroTTS,
  type KokoroConfig,
  type TTSResult,
  type TTSStatus,
  KOKORO_VOICES,
  DEFAULT_KOKORO_CONFIG,
} from './kokoro-tts';

// VAD
export {
  BrowserVADProcessor,
  type VADConfig,
  type VADEvent,
  type VADStatus,
  DEFAULT_VAD_CONFIG,
} from './vad-processor';

// Pipeline
export {
  VoicePipeline,
  type VoicePipelineConfig,
  type PipelineStatus,
  type PipelineState,
  DEFAULT_PIPELINE_CONFIG,
} from './voice-pipeline';
