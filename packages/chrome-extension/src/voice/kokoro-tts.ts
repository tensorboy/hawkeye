/**
 * Kokoro TTS — Browser-local text-to-speech
 *
 * Uses Kokoro TTS model via Transformers.js for high-quality
 * browser-local speech synthesis. Supports multiple voices
 * and speed control.
 */

import { pipeline, env } from '@huggingface/transformers';

export interface KokoroConfig {
  /** Voice preset */
  voice: string;
  /** Speech speed (0.5 to 2.0) */
  speed: number;
  /** Use WebGPU if available */
  preferWebGPU: boolean;
  /** Sample rate for output audio */
  sampleRate: number;
  /** Loading progress callback */
  onProgress?: (progress: number) => void;
}

export interface TTSResult {
  /** Generated audio as Float32Array */
  audio: Float32Array;
  /** Sample rate */
  sampleRate: number;
  /** Duration in seconds */
  durationSec: number;
  /** Processing time in ms */
  processingMs: number;
}

export type TTSStatus = 'unloaded' | 'loading' | 'ready' | 'synthesizing' | 'error';

export const KOKORO_VOICES = [
  'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica',
  'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_liam', 'am_onyx',
] as const;

export const DEFAULT_KOKORO_CONFIG: KokoroConfig = {
  voice: 'af_heart',
  speed: 1.0,
  preferWebGPU: true,
  sampleRate: 24000,
};

export class KokoroTTS {
  private config: KokoroConfig;
  private pipe: any = null;
  private status: TTSStatus = 'unloaded';
  private error: string | null = null;
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private queue: Array<{ text: string; resolve: (result: TTSResult) => void; reject: (err: Error) => void }> = [];
  private isProcessingQueue = false;

  constructor(config?: Partial<KokoroConfig>) {
    this.config = { ...DEFAULT_KOKORO_CONFIG, ...config };
  }

  /** Initialize the TTS pipeline */
  async initialize(): Promise<void> {
    if (this.status === 'ready' || this.status === 'loading') return;

    this.status = 'loading';
    this.error = null;

    try {
      const useWebGPU = this.config.preferWebGPU && 'gpu' in navigator;
      const device = useWebGPU ? 'webgpu' : 'wasm';

      env.allowLocalModels = false;

      this.pipe = await pipeline('text-to-speech', 'onnx-community/Kokoro-82M-v1.0-ONNX', {
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

  /** Synthesize text to audio */
  async synthesize(text: string): Promise<TTSResult> {
    if (this.status !== 'ready') {
      await this.initialize();
    }

    if (!text.trim()) {
      return { audio: new Float32Array(0), sampleRate: this.config.sampleRate, durationSec: 0, processingMs: 0 };
    }

    this.status = 'synthesizing';
    const startTime = performance.now();

    try {
      const result = await this.pipe(text, {
        voice: this.config.voice,
        speed: this.config.speed,
      });

      const processingMs = performance.now() - startTime;
      this.status = 'ready';

      const audio = result.audio as Float32Array;
      const sampleRate = result.sampling_rate || this.config.sampleRate;

      return {
        audio,
        sampleRate,
        durationSec: audio.length / sampleRate,
        processingMs,
      };
    } catch (err) {
      this.status = 'ready';
      throw err;
    }
  }

  /** Synthesize and play through AudioContext */
  async speak(text: string): Promise<void> {
    const result = await this.synthesize(text);
    if (result.audio.length === 0) return;
    await this.playAudio(result.audio, result.sampleRate);
  }

  /** Queue text for sequential synthesis and playback */
  async enqueue(text: string): Promise<TTSResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ text, resolve, reject });
      this.processQueue();
    });
  }

  /** Stop current playback and clear queue */
  stop(): void {
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* ignore */ }
      this.currentSource = null;
    }
    // Reject all queued items
    for (const item of this.queue) {
      item.reject(new Error('Playback stopped'));
    }
    this.queue = [];
    this.isProcessingQueue = false;
  }

  /** Get current status */
  getStatus(): { status: TTSStatus; error: string | null; queueLength: number; voice: string } {
    return {
      status: this.status,
      error: this.error,
      queueLength: this.queue.length,
      voice: this.config.voice,
    };
  }

  /** Update configuration */
  updateConfig(config: Partial<KokoroConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Destroy and free resources */
  async destroy(): Promise<void> {
    this.stop();
    this.pipe = null;
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    this.status = 'unloaded';
  }

  /** Play audio through Web Audio API */
  private async playAudio(audio: Float32Array, sampleRate: number): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate });
    }

    // Resume if suspended (autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const buffer = this.audioContext.createBuffer(1, audio.length, sampleRate);
    buffer.copyToChannel(audio as Float32Array<ArrayBuffer>, 0);

    return new Promise<void>((resolve, reject) => {
      const source = this.audioContext!.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext!.destination);
      this.currentSource = source;

      source.onended = () => {
        this.currentSource = null;
        resolve();
      };

      try {
        source.start();
      } catch (err) {
        this.currentSource = null;
        reject(err);
      }
    });
  }

  /** Process queue sequentially */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.queue.length > 0) {
      const item = this.queue[0];
      try {
        const result = await this.synthesize(item.text);
        if (result.audio.length > 0) {
          await this.playAudio(result.audio, result.sampleRate);
        }
        this.queue.shift();
        item.resolve(result);
      } catch (err) {
        this.queue.shift();
        item.reject(err as Error);
      }
    }

    this.isProcessingQueue = false;
  }
}
