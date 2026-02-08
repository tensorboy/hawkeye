/**
 * Voice Pipeline — Orchestrates VAD → STT → Desktop Sync → TTS
 *
 * Provides a unified voice interaction pipeline for the Chrome extension.
 * Audio flows: Microphone → VAD → STT → send to desktop → receive response → TTS
 *
 * Supports two modes:
 * 1. Local: All processing in browser (Moonshine STT + Kokoro TTS)
 * 2. Desktop proxy: Forward audio to desktop for sherpa-onnx processing
 */

import { BrowserVADProcessor, type VADConfig, type VADEvent } from './vad-processor';
import { MoonshineSTT, type MoonshineConfig, type TranscriptionResult } from './moonshine-stt';
import { KokoroTTS, type KokoroConfig, type TTSResult } from './kokoro-tts';

export interface VoicePipelineConfig {
  /** Processing mode */
  mode: 'local' | 'desktop-proxy';
  /** VAD configuration */
  vad?: Partial<VADConfig>;
  /** STT configuration (local mode) */
  stt?: Partial<MoonshineConfig>;
  /** TTS configuration (local mode) */
  tts?: Partial<KokoroConfig>;
  /** Whether to auto-play TTS responses */
  autoPlayResponse: boolean;
  /** Desktop WebSocket URL for proxy mode */
  desktopWsUrl?: string;
  /** Callback for transcription results */
  onTranscript?: (result: TranscriptionResult) => void;
  /** Callback for TTS playback start */
  onTTSStart?: (text: string) => void;
  /** Callback for TTS playback end */
  onTTSEnd?: () => void;
  /** Callback for status changes */
  onStatusChange?: (status: PipelineStatus) => void;
  /** Callback for errors */
  onError?: (error: string) => void;
}

export type PipelineStatus =
  | 'idle'
  | 'initializing'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

export interface PipelineState {
  status: PipelineStatus;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  modelsLoaded: boolean;
  error: string | null;
  lastTranscript: string | null;
}

export const DEFAULT_PIPELINE_CONFIG: VoicePipelineConfig = {
  mode: 'local',
  autoPlayResponse: true,
};

export class VoicePipeline {
  private config: VoicePipelineConfig;
  private vad: BrowserVADProcessor;
  private stt: MoonshineSTT;
  private tts: KokoroTTS;
  private status: PipelineStatus = 'idle';
  private error: string | null = null;
  private modelsLoaded = false;
  private lastTranscript: string | null = null;
  private isDestroyed = false;

  constructor(config?: Partial<VoicePipelineConfig>) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this.vad = new BrowserVADProcessor(this.config.vad);
    this.stt = new MoonshineSTT(this.config.stt);
    this.tts = new KokoroTTS(this.config.tts);

    // Wire VAD events to STT
    this.vad.onEvent((event) => this.handleVADEvent(event));
  }

  /** Initialize all models (can be slow — show progress) */
  async initialize(): Promise<void> {
    if (this.modelsLoaded || this.isDestroyed) return;

    this.setStatus('initializing');

    try {
      if (this.config.mode === 'local') {
        // Load STT and TTS models in parallel
        await Promise.all([
          this.stt.initialize(),
          this.tts.initialize(),
        ]);
      }
      // VAD doesn't need pre-initialization (starts with microphone)

      this.modelsLoaded = true;
      this.setStatus('idle');
    } catch (err) {
      this.error = (err as Error).message;
      this.setStatus('error');
      this.config.onError?.(`Model initialization failed: ${this.error}`);
      throw err;
    }
  }

  /** Start listening for voice input */
  async startListening(): Promise<void> {
    if (this.isDestroyed) return;

    // Initialize models if needed
    if (!this.modelsLoaded && this.config.mode === 'local') {
      await this.initialize();
    }

    try {
      await this.vad.start();
      this.setStatus('listening');
    } catch (err) {
      this.error = (err as Error).message;
      this.setStatus('error');
      this.config.onError?.(`Microphone access failed: ${this.error}`);
      throw err;
    }
  }

  /** Stop listening */
  stopListening(): void {
    this.vad.stop();
    this.stt.resetBuffer();
    if (this.status === 'listening' || this.status === 'processing') {
      this.setStatus('idle');
    }
  }

  /** Speak text through TTS */
  async speak(text: string): Promise<void> {
    if (this.isDestroyed || !text.trim()) return;

    try {
      this.setStatus('speaking');
      this.config.onTTSStart?.(text);

      if (this.config.mode === 'local') {
        await this.tts.speak(text);
      } else {
        // Desktop proxy: send to desktop for TTS
        await this.sendToDesktop({ type: 'tts-speak', text });
      }

      this.config.onTTSEnd?.();

      // Return to listening if we were listening before
      if (this.vad.getStatus().status === 'listening') {
        this.setStatus('listening');
      } else {
        this.setStatus('idle');
      }
    } catch (err) {
      this.config.onError?.(`TTS failed: ${(err as Error).message}`);
      this.setStatus(this.vad.getStatus().status === 'listening' ? 'listening' : 'idle');
    }
  }

  /** Stop TTS playback */
  stopSpeaking(): void {
    this.tts.stop();
    if (this.status === 'speaking') {
      this.setStatus(this.vad.getStatus().status === 'listening' ? 'listening' : 'idle');
    }
  }

  /** Get current pipeline state */
  getState(): PipelineState {
    return {
      status: this.status,
      isListening: this.status === 'listening',
      isSpeaking: this.status === 'speaking',
      isProcessing: this.status === 'processing',
      modelsLoaded: this.modelsLoaded,
      error: this.error,
      lastTranscript: this.lastTranscript,
    };
  }

  /** Update configuration */
  updateConfig(config: Partial<VoicePipelineConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.vad) this.vad.updateConfig(config.vad);
    if (config.stt) this.stt.updateConfig(config.stt);
    if (config.tts) this.tts.updateConfig(config.tts);
  }

  /** Destroy pipeline and free all resources */
  async destroy(): Promise<void> {
    this.isDestroyed = true;
    this.vad.stop();
    await this.stt.destroy();
    await this.tts.destroy();
    this.setStatus('idle');
  }

  // === Internal ===

  /** Handle VAD events */
  private async handleVADEvent(event: VADEvent): Promise<void> {
    switch (event.type) {
      case 'speech_start':
        // User started speaking — stop any TTS playback to avoid echo
        this.tts.stop();
        break;

      case 'audio_chunk':
        // Feed audio to STT
        if (event.audio) {
          if (this.config.mode === 'local') {
            this.stt.feedAudio(event.audio);
          } else {
            // Desktop proxy: forward raw audio
            this.sendToDesktop({
              type: 'audio-chunk',
              audio: Array.from(event.audio), // Serialize for message passing
            });
          }
        }
        break;

      case 'speech_end':
        // Speech ended — transcribe
        this.setStatus('processing');
        try {
          if (this.config.mode === 'local') {
            const result = await this.stt.transcribe();
            this.handleTranscription(result);
          } else {
            // Desktop proxy: request transcription
            this.sendToDesktop({ type: 'transcribe-request' });
          }
        } catch (err) {
          this.config.onError?.(`Transcription failed: ${(err as Error).message}`);
          this.setStatus('listening');
        }
        break;
    }
  }

  /** Handle transcription result */
  private handleTranscription(result: TranscriptionResult): void {
    if (result.text.trim()) {
      this.lastTranscript = result.text;
      this.config.onTranscript?.(result);
    }
    this.setStatus('listening');
  }

  /** Handle response from desktop (for TTS playback) */
  async handleDesktopResponse(response: { text?: string; action?: string }): Promise<void> {
    if (response.text && this.config.autoPlayResponse) {
      await this.speak(response.text);
    }
  }

  /** Send message to desktop via chrome.runtime.sendMessage */
  private async sendToDesktop(data: Record<string, unknown>): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'voice-pipeline-forward',
        ...data,
      });
    } catch (err) {
      console.warn('Failed to send to desktop:', err);
    }
  }

  /** Update and notify status change */
  private setStatus(status: PipelineStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.config.onStatusChange?.(status);
    }
  }
}
