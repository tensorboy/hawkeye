import { BrowserWindow, app } from 'electron';
import { EventEmitter } from 'events';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// large-v3-turbo-q5_0 model is ~547MB, best quality with optimized speed
// Available models: tiny, base, small, medium, large-v3, large-v3-turbo
export const WHISPER_MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin';
export const WHISPER_MODEL_FILENAME = 'ggml-large-v3-turbo-q5_0.bin';

export interface WhisperStatus {
  initialized: boolean;
  modelPath: string | null;
  language: string;
  isTranscribing: boolean;
  isDownloading: boolean;
  downloadProgress: number;
}

export interface WhisperDownloadProgress {
  status: 'downloading' | 'completed' | 'error';
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}

export class WhisperService extends EventEmitter {
  private whisper: any = null;
  private isTranscribing = false;
  private isDownloading = false;
  private downloadProgress = 0;
  private downloadAbortController: AbortController | null = null;
  private config: { modelPath?: string; language?: string } = {};

  constructor(
    private mainWindowGetter: () => BrowserWindow | null,
    private debugLog: (msg: string) => void
  ) {
    super();
  }

  /**
   * Get the default model directory
   */
  getModelDirectory(): string {
    return path.join(app.getPath('userData'), 'models');
  }

  /**
   * Get the default model file path
   */
  getDefaultModelPath(): string {
    return path.join(this.getModelDirectory(), WHISPER_MODEL_FILENAME);
  }

  /**
   * Check if the default whisper model exists
   */
  modelExists(): boolean {
    return fs.existsSync(this.getDefaultModelPath());
  }

  /**
   * Download the whisper model from HuggingFace.
   * Follows redirects and reports progress to renderer.
   */
  async downloadModel(): Promise<string> {
    if (this.isDownloading) {
      throw new Error('Download already in progress');
    }

    const modelDir = this.getModelDirectory();
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    const destPath = this.getDefaultModelPath();
    const tempPath = destPath + '.download';

    this.isDownloading = true;
    this.downloadProgress = 0;
    this.downloadAbortController = new AbortController();

    this.sendDownloadProgress({
      status: 'downloading',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
    });

    try {
      await this.httpDownload(WHISPER_MODEL_URL, tempPath);

      // Rename temp file to final path
      fs.renameSync(tempPath, destPath);

      this.debugLog(`[Whisper] Model downloaded to: ${destPath}`);
      this.sendDownloadProgress({
        status: 'completed',
        progress: 100,
        downloadedBytes: 0,
        totalBytes: 0,
      });

      this.isDownloading = false;
      this.downloadAbortController = null;
      return destPath;
    } catch (error) {
      this.isDownloading = false;
      this.downloadAbortController = null;

      // Clean up temp file
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }

      const msg = error instanceof Error ? error.message : String(error);
      this.debugLog(`[Whisper] Download error: ${msg}`);
      this.sendDownloadProgress({
        status: 'error',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        error: msg,
      });
      throw error;
    }
  }

  cancelDownload(): void {
    if (this.downloadAbortController) {
      this.downloadAbortController.abort();
    }
  }

  /**
   * Reset the whisper model - delete existing model and prepare for re-download
   */
  async resetModel(): Promise<void> {
    // Shutdown if initialized
    await this.shutdown();

    const modelDir = this.getModelDirectory();
    if (fs.existsSync(modelDir)) {
      // Delete all model files in the directory
      const files = fs.readdirSync(modelDir);
      for (const file of files) {
        if (file.endsWith('.bin') || file.endsWith('.download')) {
          const filePath = path.join(modelDir, file);
          try {
            fs.unlinkSync(filePath);
            this.debugLog(`[Whisper] Deleted: ${file}`);
          } catch (error) {
            this.debugLog(`[Whisper] Failed to delete ${file}: ${error}`);
          }
        }
      }
    }

    this.debugLog('[Whisper] Model reset complete');
  }

  private httpDownload(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const doRequest = (requestUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'));
          return;
        }

        const proto = requestUrl.startsWith('https') ? https : http;
        const req = proto.get(requestUrl, (res) => {
          // Handle redirects
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            this.debugLog(`[Whisper] Redirect to: ${res.headers.location}`);
            doRequest(res.headers.location, redirectCount + 1);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let downloadedBytes = 0;

          const fileStream = fs.createWriteStream(destPath);

          res.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            const progress = totalBytes > 0
              ? Math.round((downloadedBytes / totalBytes) * 100)
              : 0;
            this.downloadProgress = progress;

            this.sendDownloadProgress({
              status: 'downloading',
              progress,
              downloadedBytes,
              totalBytes,
            });
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });

          fileStream.on('error', (err) => {
            fs.unlinkSync(destPath);
            reject(err);
          });
        });

        req.on('error', reject);

        // Support abort
        if (this.downloadAbortController) {
          this.downloadAbortController.signal.addEventListener('abort', () => {
            req.destroy();
            reject(new Error('Download cancelled'));
          });
        }
      };

      doRequest(url);
    });
  }

  private sendDownloadProgress(progress: WhisperDownloadProgress): void {
    this.safeSend('whisper-download-progress', progress);
  }

  async initialize(config: { modelPath?: string; language?: string }): Promise<void> {
    this.config = config;
    if (!config.modelPath) {
      this.debugLog('[Whisper] No model path configured, skipping init');
      return;
    }

    try {
      const { Whisper } = await import('smart-whisper');
      this.whisper = new Whisper(config.modelPath, { gpu: true });
      this.debugLog(`[Whisper] Initialized with model: ${config.modelPath}`);
    } catch (error) {
      this.debugLog(`[Whisper] Init error: ${error}`);
    }
  }

  /**
   * Convert Int16 PCM Buffer (from renderer) to Float32Array (for smart-whisper)
   */
  private bufferToFloat32(buffer: Buffer): Float32Array {
    const int16 = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
  }

  /**
   * Calculate RMS energy of audio to detect silence
   * Returns a value between 0 and 1
   */
  private calculateEnergy(pcmFloat32: Float32Array): number {
    if (pcmFloat32.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < pcmFloat32.length; i++) {
      sum += pcmFloat32[i] * pcmFloat32[i];
    }
    return Math.sqrt(sum / pcmFloat32.length);
  }

  /**
   * Filter out common Whisper hallucination patterns
   */
  private isHallucination(text: string): boolean {
    const trimmed = text.trim().toLowerCase();

    // Common hallucination patterns when Whisper hears silence/noise
    const hallucinationPatterns = [
      /^[\s\.,。，、！!？\?]+$/,                    // Only punctuation
      /^(thanks?|thank you)\.?$/i,                // "Thanks" on silence
      /^(bye|goodbye|see you)\.?$/i,              // "Bye" on silence
      /^(okay|ok)\.?$/i,                          // "OK" on silence
      /^(um+|uh+|ah+|eh+|oh+)\.?$/i,             // Filler sounds
      /^(hmm+|hm+)\.?$/i,                         // Thinking sounds
      /^\.{2,}$/,                                  // Just dots
      /^[\u4e00-\u9fa5]{1,2}$/,                   // 1-2 Chinese characters only
      /^(the|a|an|is|are|was|were)\.?$/i,        // Single articles
      /^(you|i|we|he|she|it|they)\.?$/i,         // Single pronouns
      /^\[.*\]$/,                                  // [Music], [Applause], etc.
      /^♪+$/,                                      // Music notes
      /^(\s*\.\s*)+$/,                            // Repeated dots with spaces
    ];

    for (const pattern of hallucinationPatterns) {
      if (pattern.test(trimmed)) {
        return true;
      }
    }

    // Very short text (< 3 chars after trimming) is often noise
    if (trimmed.length < 3) {
      return true;
    }

    return false;
  }

  async transcribe(audioBuffer: Buffer): Promise<string> {
    if (!this.whisper) throw new Error('Whisper not initialized');

    this.isTranscribing = true;
    try {
      // smart-whisper expects Float32Array (mono 16kHz, range -1..1)
      const pcmFloat32 = this.bufferToFloat32(audioBuffer);

      // VAD: Check if audio has enough energy (not silence)
      const energy = this.calculateEnergy(pcmFloat32);
      const SILENCE_THRESHOLD = 0.01; // Adjust based on testing

      if (energy < SILENCE_THRESHOLD) {
        this.debugLog(`[Whisper] Skipping silent audio (energy: ${energy.toFixed(4)})`);
        this.isTranscribing = false;
        return '';
      }

      this.debugLog(`[Whisper] Audio energy: ${energy.toFixed(4)}, proceeding with transcription`);

      const task = await this.whisper.transcribe(pcmFloat32, {
        language: this.config.language || 'auto',
      });

      task.on('transcribed', (result: any) => {
        const text = result.text || result;

        // Filter out hallucinations
        if (this.isHallucination(text)) {
          this.debugLog(`[Whisper] Filtered hallucination: "${text}"`);
          return;
        }

        this.safeSend('whisper-segment', {
          text,
          timestamp: Date.now(),
        });
        this.emit('segment', result);
      });

      const result = await task.result;
      this.isTranscribing = false;

      // result is an array of segments
      if (Array.isArray(result)) {
        const validSegments = result
          .map((r: any) => r.text || '')
          .filter((text: string) => !this.isHallucination(text));
        return validSegments.join(' ').trim();
      }

      const text = typeof result === 'string' ? result : result?.text || '';
      return this.isHallucination(text) ? '' : text;
    } catch (error) {
      this.isTranscribing = false;
      throw error;
    }
  }

  getStatus(): WhisperStatus {
    return {
      initialized: !!this.whisper,
      modelPath: this.config.modelPath || null,
      language: this.config.language || 'auto',
      isTranscribing: this.isTranscribing,
      isDownloading: this.isDownloading,
      downloadProgress: this.downloadProgress,
    };
  }

  async shutdown(): Promise<void> {
    if (this.whisper) {
      try {
        await this.whisper.free();
      } catch {
        // ignore cleanup errors
      }
      this.whisper = null;
    }
  }

  private safeSend(channel: string, data: any) {
    const win = this.mainWindowGetter();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}
