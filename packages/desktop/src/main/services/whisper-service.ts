import { BrowserWindow, app } from 'electron';
import { EventEmitter } from 'events';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

export const WHISPER_MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
export const WHISPER_MODEL_FILENAME = 'ggml-base.bin';

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

  async transcribe(audioBuffer: Buffer): Promise<string> {
    if (!this.whisper) throw new Error('Whisper not initialized');

    this.isTranscribing = true;
    try {
      // smart-whisper expects Float32Array (mono 16kHz, range -1..1)
      const pcmFloat32 = this.bufferToFloat32(audioBuffer);

      const task = await this.whisper.transcribe(pcmFloat32, {
        language: this.config.language || 'auto',
      });

      task.on('transcribed', (result: any) => {
        this.safeSend('whisper-segment', {
          text: result.text || result,
          timestamp: Date.now(),
        });
        this.emit('segment', result);
      });

      const result = await task.result;
      this.isTranscribing = false;
      // result is an array of segments
      if (Array.isArray(result)) {
        return result.map((r: any) => r.text || '').join(' ').trim();
      }
      return typeof result === 'string' ? result : result?.text || '';
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
