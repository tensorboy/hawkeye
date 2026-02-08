/**
 * Browser-local speech-to-text using Moonshine models via Transformers.js
 * Runs entirely in the browser with WebGPU/WASM - no audio sent to servers
 * @module moonshine-stt
 */

import { pipeline, env } from '@huggingface/transformers';

export interface MoonshineConfig {
  /** Model to use */
  model: 'moonshine-tiny' | 'moonshine-base';
  /** Language */
  language: string;
  /** Use WebGPU if available, fallback to WASM */
  preferWebGPU: boolean;
  /** Maximum audio duration in seconds */
  maxDurationSec: number;
  /** Callback for loading progress (0-1) */
  onProgress?: (progress: number) => void;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  durationMs: number;
  isPartial: boolean;
}

export type STTStatus = 'unloaded' | 'loading' | 'ready' | 'processing' | 'error';

export const DEFAULT_MOONSHINE_CONFIG: MoonshineConfig = {
  model: 'moonshine-tiny',
  language: 'en',
  preferWebGPU: true,
  maxDurationSec: 30,
};

export class MoonshineSTT {
  private config: MoonshineConfig;
  private pipe: any = null;
  private status: STTStatus = 'unloaded';
  private error: string | null = null;
  private audioBuffer: Float32Array[] = [];
  private totalSamples = 0;

  constructor(config?: Partial<MoonshineConfig>) {
    this.config = { ...DEFAULT_MOONSHINE_CONFIG, ...config };
  }

  /** Initialize the pipeline (lazy - call before first transcription) */
  async initialize(): Promise<void> {
    if (this.status === 'ready' || this.status === 'loading') return;

    this.status = 'loading';
    this.error = null;

    try {
      // Check WebGPU availability
      const useWebGPU = this.config.preferWebGPU && 'gpu' in navigator;

      const modelId = this.config.model === 'moonshine-tiny'
        ? 'UsefulSensors/moonshine-tiny'
        : 'UsefulSensors/moonshine-base';

      // Configure device
      const device = useWebGPU ? 'webgpu' : 'wasm';

      // Disable local model caching for service worker context
      env.allowLocalModels = false;

      this.pipe = await pipeline('automatic-speech-recognition', modelId, {
        device,
        progress_callback: (progress: any) => {
          if (progress.status === 'progress' && this.config.onProgress) {
            this.config.onProgress(progress.progress / 100);
          }
        },
      });

      this.status = 'ready';
      this.config.onProgress?.(1);
    } catch (err) {
      this.status = 'error';
      this.error = (err as Error).message;
      throw err;
    }
  }

  /** Feed audio chunk (16kHz mono Float32Array) */
  feedAudio(samples: Float32Array): void {
    const maxSamples = this.config.maxDurationSec * 16000;
    if (this.totalSamples + samples.length > maxSamples) {
      // Truncate to max duration
      const remaining = maxSamples - this.totalSamples;
      if (remaining > 0) {
        this.audioBuffer.push(samples.slice(0, remaining));
        this.totalSamples += remaining;
      }
      return;
    }
    this.audioBuffer.push(samples);
    this.totalSamples += samples.length;
  }

  /** Transcribe accumulated audio and reset buffer */
  async transcribe(): Promise<TranscriptionResult> {
    if (this.status !== 'ready') {
      await this.initialize();
    }

    if (this.audioBuffer.length === 0) {
      return { text: '', durationMs: 0, isPartial: false };
    }

    this.status = 'processing';
    const startTime = performance.now();

    try {
      // Merge audio chunks
      const mergedAudio = this.mergeAudioChunks();

      // Run inference
      const result = await this.pipe(mergedAudio, {
        language: this.config.language,
        return_timestamps: false,
      });

      const durationMs = performance.now() - startTime;
      this.status = 'ready';

      // Clear buffer after successful transcription
      this.resetBuffer();

      return {
        text: result.text?.trim() || '',
        language: this.config.language,
        durationMs,
        isPartial: false,
      };
    } catch (err) {
      this.status = 'ready'; // Recover to ready state
      throw err;
    }
  }

  /** Reset audio buffer without transcribing */
  resetBuffer(): void {
    this.audioBuffer = [];
    this.totalSamples = 0;
  }

  /** Get current status */
  getStatus(): { status: STTStatus; error: string | null; bufferedSeconds: number } {
    return {
      status: this.status,
      error: this.error,
      bufferedSeconds: this.totalSamples / 16000,
    };
  }

  /** Update configuration */
  updateConfig(config: Partial<MoonshineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Destroy and free resources */
  async destroy(): Promise<void> {
    this.pipe = null;
    this.audioBuffer = [];
    this.totalSamples = 0;
    this.status = 'unloaded';
  }

  /** Merge audio chunks into single Float32Array */
  private mergeAudioChunks(): Float32Array {
    if (this.audioBuffer.length === 1) return this.audioBuffer[0];

    const merged = new Float32Array(this.totalSamples);
    let offset = 0;
    for (const chunk of this.audioBuffer) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }
}
