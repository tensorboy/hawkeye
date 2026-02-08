/**
 * VAD Processor — Browser-based Voice Activity Detection
 *
 * Uses Web Audio API (AudioContext + AnalyserNode) for real-time
 * voice activity detection with echo cancellation. Emits speech
 * segments as Float32Array chunks at 16kHz mono.
 */

export interface VADConfig {
  /** RMS energy threshold for speech detection (0.0 to 1.0) */
  energyThreshold: number;
  /** Minimum speech duration in ms to trigger */
  minSpeechMs: number;
  /** Silence duration in ms before ending speech segment */
  silenceMs: number;
  /** Sample rate for output audio (default 16000) */
  sampleRate: number;
  /** Enable echo cancellation */
  echoCancellation: boolean;
  /** Enable noise suppression */
  noiseSuppression: boolean;
  /** Enable automatic gain control */
  autoGainControl: boolean;
  /** Audio chunk size in samples */
  chunkSize: number;
}

export interface VADEvent {
  type: 'speech_start' | 'speech_end' | 'audio_chunk' | 'vad_status';
  /** Audio data for 'audio_chunk' events */
  audio?: Float32Array;
  /** Speech duration for 'speech_end' events */
  durationMs?: number;
  /** Whether speech is currently detected */
  isSpeaking?: boolean;
  /** Current RMS energy level */
  energy?: number;
}

export type VADStatus = 'inactive' | 'starting' | 'listening' | 'error';

export const DEFAULT_VAD_CONFIG: VADConfig = {
  energyThreshold: 0.015,
  minSpeechMs: 200,
  silenceMs: 800,
  sampleRate: 16000,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  chunkSize: 4096,
};

type VADCallback = (event: VADEvent) => void;

export class BrowserVADProcessor {
  private config: VADConfig;
  private status: VADStatus = 'inactive';
  private error: string | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private callback: VADCallback | null = null;

  // VAD state
  private isSpeaking = false;
  private speechStartTime = 0;
  private lastSpeechTime = 0;
  private audioChunks: Float32Array[] = [];

  constructor(config?: Partial<VADConfig>) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
  }

  /** Set the callback for VAD events */
  onEvent(callback: VADCallback): void {
    this.callback = callback;
  }

  /** Start capturing audio and running VAD */
  async start(): Promise<void> {
    if (this.status === 'listening' || this.status === 'starting') return;

    this.status = 'starting';
    this.error = null;

    try {
      // Request microphone access with echo cancellation
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
          sampleRate: this.config.sampleRate,
          channelCount: 1,
        },
      });

      // Create AudioContext at desired sample rate
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });

      // Create source from microphone stream
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create analyser for energy calculation
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.3;

      // Create processor for raw audio access
      // Note: ScriptProcessorNode is deprecated but AudioWorklet
      // requires a separate file which complicates extension bundling
      this.processorNode = this.audioContext.createScriptProcessor(
        this.config.chunkSize,
        1, // input channels
        1  // output channels
      );

      // Wire up: source → analyser → processor → destination
      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      // Process audio chunks
      this.processorNode.onaudioprocess = (event) => {
        this.processAudioChunk(event);
      };

      this.status = 'listening';
      this.emit({ type: 'vad_status', isSpeaking: false });
    } catch (err) {
      this.status = 'error';
      this.error = (err as Error).message;
      this.cleanup();
      throw err;
    }
  }

  /** Stop VAD and release microphone */
  stop(): void {
    // If currently speaking, emit speech_end
    if (this.isSpeaking) {
      this.endSpeech();
    }

    this.cleanup();
    this.status = 'inactive';
  }

  /** Get current status */
  getStatus(): { status: VADStatus; error: string | null; isSpeaking: boolean } {
    return {
      status: this.status,
      error: this.error,
      isSpeaking: this.isSpeaking,
    };
  }

  /** Update configuration (applies on next start) */
  updateConfig(config: Partial<VADConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Calculate RMS energy of audio samples */
  private calculateRMS(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  /** Process an audio chunk from ScriptProcessorNode */
  private processAudioChunk(event: AudioProcessingEvent): void {
    const inputData = event.inputBuffer.getChannelData(0);
    const samples = new Float32Array(inputData); // Copy to avoid reuse

    const energy = this.calculateRMS(samples);
    const now = Date.now();
    const isSpeechDetected = energy > this.config.energyThreshold;

    if (isSpeechDetected) {
      this.lastSpeechTime = now;

      if (!this.isSpeaking) {
        // Potential speech start — check minimum duration
        if (this.speechStartTime === 0) {
          this.speechStartTime = now;
        }

        if (now - this.speechStartTime >= this.config.minSpeechMs) {
          // Confirmed speech start
          this.isSpeaking = true;
          this.emit({ type: 'speech_start', isSpeaking: true, energy });

          // Include buffered pre-speech audio
          for (const chunk of this.audioChunks) {
            this.emit({ type: 'audio_chunk', audio: chunk, energy });
          }
          this.audioChunks = [];
        } else {
          // Buffer audio while waiting for minimum duration
          this.audioChunks.push(samples);
          // Keep buffer limited
          if (this.audioChunks.length > 10) {
            this.audioChunks.shift();
          }
        }
      } else {
        // Ongoing speech — emit audio chunk
        this.emit({ type: 'audio_chunk', audio: samples, energy });
      }
    } else {
      // Silence detected
      if (this.isSpeaking) {
        // Still emit audio during silence window (may be a pause)
        this.emit({ type: 'audio_chunk', audio: samples, energy });

        if (now - this.lastSpeechTime >= this.config.silenceMs) {
          // Speech ended
          this.endSpeech();
        }
      } else {
        // Reset speech start if we didn't reach minimum duration
        this.speechStartTime = 0;
        // Keep a small buffer of pre-speech audio
        this.audioChunks.push(samples);
        if (this.audioChunks.length > 5) {
          this.audioChunks.shift();
        }
      }
    }
  }

  /** End current speech segment */
  private endSpeech(): void {
    const duration = Date.now() - this.speechStartTime;
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.audioChunks = [];
    this.emit({ type: 'speech_end', isSpeaking: false, durationMs: duration });
  }

  /** Emit a VAD event */
  private emit(event: VADEvent): void {
    if (this.callback) {
      try {
        this.callback(event);
      } catch {
        // Don't let callback errors break VAD
      }
    }
  }

  /** Clean up audio resources */
  private cleanup(): void {
    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.lastSpeechTime = 0;
    this.audioChunks = [];
  }
}
