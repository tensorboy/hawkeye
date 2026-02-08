import { BrowserWindow, app } from 'electron';
import { EventEmitter } from 'events';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

import {
  SherpaModelSpec,
  SherpaModelType,
  SherpaASRConfig,
  SherpaTTSConfig,
  SherpaVADConfig,
  SherpaKWSConfig,
  SherpaSpeakerIDConfig,
  SherpaDownloadProgress,
  getDefaultModel,
  getModelById,
  DEFAULT_VAD_CONFIG,
  DEFAULT_ASR_CONFIG,
  DEFAULT_TTS_CONFIG,
} from './sherpa-models';

const execAsync = promisify(exec);

// ============================================================================
// Type Definitions
// ============================================================================

export interface SherpaOnnxStatus {
  initialized: boolean;
  vadReady: boolean;
  asrReady: boolean;
  kwsReady: boolean;
  ttsReady: boolean;
  speakerIdReady: boolean;
  isStreaming: boolean;
  isSpeaking: boolean;
  downloadingModels: string[];
}

export interface SherpaTranscriptEvent {
  text: string;
  isFinal: boolean;
  timestamp: number;
  speakerId?: string;
  language?: string;
}

export interface SpeechSegment {
  samples: Float32Array;
  start: number;
  duration: number;
}

export interface SherpaInitOptions {
  enableVAD?: boolean;
  enableASR?: boolean;
  enableKWS?: boolean;
  enableTTS?: boolean;
  enableSpeakerID?: boolean;
  keywords?: string[];
}

// ============================================================================
// SherpaOnnxService
// ============================================================================

/**
 * SherpaOnnxService - Complete offline voice processing
 *
 * Features:
 * - Streaming ASR (Automatic Speech Recognition)
 * - Silero VAD (Voice Activity Detection)
 * - Keyword Spotting (wake word detection)
 * - TTS (Text-to-Speech via Kokoro/Piper)
 * - Speaker ID (speaker identification)
 * - Language ID (language detection)
 *
 * All processing is done offline using sherpa-onnx-node ONNX models.
 */
export class SherpaOnnxService extends EventEmitter {
  private sherpa: any = null;
  private vadInstance: any = null;
  private asrInstance: any = null;
  private asrStream: any = null;
  private kwsInstance: any = null;
  private kwsStream: any = null;
  private ttsInstance: any = null;
  private speakerIdExtractor: any = null;
  private speakerManager: any = null;

  private isStreaming = false;
  private isSpeaking = false;
  private speechStarted = false;
  private downloadingModels = new Set<string>();
  private downloadAbortControllers = new Map<string, AbortController>();

  // Audio buffering for streaming ASR
  private audioBuffer: Float32Array[] = [];
  private readonly CHUNK_SIZE = 320; // 20ms at 16kHz
  private streamingInterval: NodeJS.Timeout | null = null;

  // Speaker database
  private speakerEmbeddings = new Map<string, Float32Array>();

  constructor(
    private mainWindowGetter: () => BrowserWindow | null,
    private debugLog: (msg: string) => void
  ) {
    super();
  }

  // ============================================================================
  // Model Management
  // ============================================================================

  /**
   * Get the Sherpa model directory
   */
  getModelDirectory(): string {
    return path.join(app.getPath('userData'), 'models', 'sherpa');
  }

  /**
   * Get the directory for a specific model
   */
  private getModelDir(modelId: string): string {
    return path.join(this.getModelDirectory(), modelId);
  }

  /**
   * Check if a model is downloaded
   */
  isModelDownloaded(modelId: string): boolean {
    const model = getModelById(modelId);
    if (!model) return false;

    const modelDir = this.getModelDir(modelId);
    if (!fs.existsSync(modelDir)) return false;

    // Check if all required files exist
    for (const file of model.files) {
      const filePath = path.join(modelDir, file.path);
      if (!fs.existsSync(filePath)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the absolute path for a model file by role
   */
  getModelPath(model: SherpaModelSpec, fileRole: string): string {
    const file = model.files.find(f => f.role === fileRole);
    if (!file) {
      throw new Error(`Model ${model.id} does not have file with role ${fileRole}`);
    }
    return path.join(this.getModelDir(model.id), file.path);
  }

  /**
   * Download a model
   */
  async downloadModel(modelId: string): Promise<void> {
    if (this.downloadingModels.has(modelId)) {
      throw new Error(`Model ${modelId} is already being downloaded`);
    }

    const model = getModelById(modelId);
    if (!model) {
      throw new Error(`Unknown model ID: ${modelId}`);
    }

    if (this.isModelDownloaded(modelId)) {
      this.debugLog(`[Sherpa] Model ${modelId} already downloaded`);
      return;
    }

    const modelDir = this.getModelDir(modelId);
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    this.downloadingModels.add(modelId);
    const abortController = new AbortController();
    this.downloadAbortControllers.set(modelId, abortController);

    this.sendDownloadProgress({
      modelId,
      status: 'downloading',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: model.size,
    });

    try {
      // Handle different download types
      if (model.url.endsWith('.tar.bz2') || model.url.endsWith('.tar.gz')) {
        await this.downloadAndExtractArchive(model, modelDir);
      } else {
        await this.downloadSingleFile(model, modelDir);
      }

      this.debugLog(`[Sherpa] Model ${modelId} downloaded successfully`);
      this.sendDownloadProgress({
        modelId,
        status: 'completed',
        progress: 100,
        downloadedBytes: model.size,
        totalBytes: model.size,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.debugLog(`[Sherpa] Download error for ${modelId}: ${msg}`);
      this.sendDownloadProgress({
        modelId,
        status: 'error',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: model.size,
        error: msg,
      });
      throw error;
    } finally {
      this.downloadingModels.delete(modelId);
      this.downloadAbortControllers.delete(modelId);
    }
  }

  /**
   * Cancel model download
   */
  cancelDownload(modelId: string): void {
    const controller = this.downloadAbortControllers.get(modelId);
    if (controller) {
      controller.abort();
    }
  }

  /**
   * Download and extract an archive
   */
  private async downloadAndExtractArchive(model: SherpaModelSpec, destDir: string): Promise<void> {
    const tempArchive = path.join(destDir, 'download.tar.bz2');

    try {
      await this.httpDownload(model.id, model.url, tempArchive, model.size);

      this.sendDownloadProgress({
        modelId: model.id,
        status: 'extracting',
        progress: 90,
        downloadedBytes: model.size,
        totalBytes: model.size,
      });

      // Extract archive
      const tarFlags = model.url.endsWith('.tar.bz2') ? 'xjf' : 'xzf';
      await execAsync(`tar ${tarFlags} "${tempArchive}" -C "${destDir}" --strip-components=1`);

      // Clean up archive
      fs.unlinkSync(tempArchive);
    } catch (error) {
      // Clean up on error
      try {
        fs.unlinkSync(tempArchive);
      } catch {
        // ignore
      }
      throw error;
    }
  }

  /**
   * Download a single file
   */
  private async downloadSingleFile(model: SherpaModelSpec, destDir: string): Promise<void> {
    const file = model.files[0];
    const destPath = path.join(destDir, file.path);
    await this.httpDownload(model.id, model.url, destPath, model.size);
  }

  /**
   * HTTP download with progress tracking and redirect support
   */
  private httpDownload(modelId: string, url: string, destPath: string, totalBytes: number): Promise<void> {
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
            this.debugLog(`[Sherpa] Redirect to: ${res.headers.location}`);
            doRequest(res.headers.location, redirectCount + 1);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          const contentLength = parseInt(res.headers['content-length'] || String(totalBytes), 10);
          let downloadedBytes = 0;

          const fileStream = fs.createWriteStream(destPath);

          res.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            const progress = contentLength > 0
              ? Math.round((downloadedBytes / contentLength) * 100)
              : 0;

            this.sendDownloadProgress({
              modelId,
              status: 'downloading',
              progress,
              downloadedBytes,
              totalBytes: contentLength,
            });
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });

          fileStream.on('error', (err) => {
            try {
              fs.unlinkSync(destPath);
            } catch {
              // ignore
            }
            reject(err);
          });
        });

        req.on('error', reject);

        // Support abort
        const controller = this.downloadAbortControllers.get(modelId);
        if (controller) {
          controller.signal.addEventListener('abort', () => {
            req.destroy();
            reject(new Error('Download cancelled'));
          });
        }
      };

      doRequest(url);
    });
  }

  /**
   * Send download progress to renderer
   */
  private sendDownloadProgress(progress: SherpaDownloadProgress): void {
    this.safeSend('sherpa-download-progress', progress);
  }

  // ============================================================================
  // VAD (Voice Activity Detection)
  // ============================================================================

  /**
   * Initialize VAD (Silero VAD)
   */
  async initVAD(): Promise<void> {
    if (this.vadInstance) {
      this.debugLog('[Sherpa] VAD already initialized');
      return;
    }

    const vadModel = getDefaultModel('vad');
    if (!vadModel) {
      throw new Error('No default VAD model found');
    }

    // Ensure model is downloaded
    if (!this.isModelDownloaded(vadModel.id)) {
      this.debugLog(`[Sherpa] Downloading VAD model ${vadModel.id}...`);
      await this.downloadModel(vadModel.id);
    }

    // Dynamically import sherpa-onnx-node
    if (!this.sherpa) {
      try {
        this.sherpa = await import('sherpa-onnx-node');
        this.debugLog('[Sherpa] sherpa-onnx-node loaded successfully');
      } catch (error) {
        this.debugLog(`[Sherpa] Failed to load sherpa-onnx-node: ${error}`);
        throw new Error('sherpa-onnx-node not available. Please install it.');
      }
    }

    const modelPath = this.getModelPath(vadModel, 'model');

    const vadConfig = {
      sileroVad: {
        model: modelPath,
        threshold: DEFAULT_VAD_CONFIG.threshold || 0.5,
        minSpeechDuration: DEFAULT_VAD_CONFIG.minSpeechDuration || 0.25,
        minSilenceDuration: DEFAULT_VAD_CONFIG.minSilenceDuration || 0.5,
        windowSize: DEFAULT_VAD_CONFIG.windowSize || 512,
      },
      sampleRate: 16000,
      numThreads: 1,
      provider: 'cpu',
    };

    this.vadInstance = new this.sherpa.Vad(vadConfig);
    this.debugLog('[Sherpa] VAD initialized');
    this.emit('vad-ready');
    this.safeSend('sherpa-vad-ready', { ready: true });
  }

  /**
   * Process audio through VAD to detect speech segments
   */
  processVADAudio(samples: Float32Array): SpeechSegment[] {
    if (!this.vadInstance) {
      this.debugLog('[Sherpa] VAD not initialized');
      return [];
    }

    const segments: SpeechSegment[] = [];

    // Feed samples to VAD
    this.vadInstance.acceptWaveform(samples);

    // Check if speech is detected
    const isSpeech = this.vadInstance.isSpeechDetected();

    if (isSpeech && !this.speechStarted) {
      // Speech started
      this.speechStarted = true;
      this.debugLog('[Sherpa] Speech started');
      this.emit('speech-start', { timestamp: Date.now() });
      this.safeSend('sherpa-speech-start', { timestamp: Date.now() });
    } else if (!isSpeech && this.speechStarted) {
      // Speech ended
      this.speechStarted = false;
      this.debugLog('[Sherpa] Speech ended');
      this.emit('speech-end', { timestamp: Date.now() });
      this.safeSend('sherpa-speech-end', { timestamp: Date.now() });
    }

    // Extract speech segments from VAD queue
    while (!this.vadInstance.isEmpty()) {
      const segment = this.vadInstance.front();
      segments.push({
        samples: segment.samples,
        start: segment.start,
        duration: segment.samples.length / 16000, // 16kHz
      });
      this.vadInstance.pop();
    }

    return segments;
  }

  // ============================================================================
  // Streaming ASR (Automatic Speech Recognition)
  // ============================================================================

  /**
   * Initialize streaming ASR
   */
  async initASR(): Promise<void> {
    if (this.asrInstance) {
      this.debugLog('[Sherpa] ASR already initialized');
      return;
    }

    const asrModel = getDefaultModel('asr-streaming');
    if (!asrModel) {
      throw new Error('No default ASR model found');
    }

    // Ensure model is downloaded
    if (!this.isModelDownloaded(asrModel.id)) {
      this.debugLog(`[Sherpa] Downloading ASR model ${asrModel.id}...`);
      await this.downloadModel(asrModel.id);
    }

    // Ensure sherpa is loaded
    if (!this.sherpa) {
      try {
        this.sherpa = await import('sherpa-onnx-node');
        this.debugLog('[Sherpa] sherpa-onnx-node loaded successfully');
      } catch (error) {
        this.debugLog(`[Sherpa] Failed to load sherpa-onnx-node: ${error}`);
        throw new Error('sherpa-onnx-node not available');
      }
    }

    const asrConfig: any = {
      transducer: {
        encoder: this.getModelPath(asrModel, 'encoder'),
        decoder: this.getModelPath(asrModel, 'decoder'),
        joiner: this.getModelPath(asrModel, 'joiner'),
      },
      tokens: this.getModelPath(asrModel, 'tokens'),
      numThreads: DEFAULT_ASR_CONFIG.numThreads || 2,
      provider: DEFAULT_ASR_CONFIG.provider || 'cpu',
      enableEndpoint: DEFAULT_ASR_CONFIG.enableEndpoint !== false,
      rule1MinTrailingSilence: 2.4,
      rule2MinTrailingSilence: 1.2,
      rule3MinUtteranceLength: 20,
    };

    this.asrInstance = new this.sherpa.OnlineRecognizer(asrConfig);
    this.debugLog('[Sherpa] ASR initialized');
    this.emit('asr-ready');
    this.safeSend('sherpa-asr-ready', { ready: true });
  }

  /**
   * Start streaming recognition
   */
  startStreaming(): void {
    if (!this.asrInstance) {
      throw new Error('ASR not initialized');
    }

    if (this.isStreaming) {
      this.debugLog('[Sherpa] Already streaming');
      return;
    }

    this.asrStream = this.asrInstance.createStream();
    this.isStreaming = true;
    this.audioBuffer = [];

    // Start polling for results
    this.streamingInterval = setInterval(() => {
      this.pollASRResults();
    }, 100); // Poll every 100ms

    this.debugLog('[Sherpa] Streaming started');
    this.emit('streaming-started');
  }

  /**
   * Feed audio to streaming ASR
   */
  feedAudio(samples: Float32Array): void {
    if (!this.isStreaming || !this.asrStream) {
      return;
    }

    this.audioBuffer.push(samples);

    // Process in chunks of 320 samples (20ms at 16kHz)
    while (this.audioBuffer.length > 0) {
      const totalSamples = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);

      if (totalSamples >= this.CHUNK_SIZE) {
        // Concatenate buffers
        const combined = new Float32Array(totalSamples);
        let offset = 0;
        for (const buf of this.audioBuffer) {
          combined.set(buf, offset);
          offset += buf.length;
        }

        // Extract one chunk
        const chunk = combined.slice(0, this.CHUNK_SIZE);
        const remainder = combined.slice(this.CHUNK_SIZE);

        // Feed chunk to ASR
        this.asrInstance.acceptWaveform(this.asrStream, 16000, chunk);

        // Update buffer with remainder
        this.audioBuffer = remainder.length > 0 ? [remainder] : [];
      } else {
        break;
      }
    }
  }

  /**
   * Poll ASR for results
   */
  private pollASRResults(): void {
    if (!this.isStreaming || !this.asrStream || !this.asrInstance) {
      return;
    }

    // Check if decoder is ready
    if (this.asrInstance.isReady(this.asrStream)) {
      this.asrInstance.decode(this.asrStream);
    }

    // Get result
    const result = this.asrInstance.getResult(this.asrStream);

    if (result && result.text && result.text.trim().length > 0) {
      const transcriptEvent: SherpaTranscriptEvent = {
        text: result.text.trim(),
        isFinal: false,
        timestamp: Date.now(),
      };

      this.emit('transcript', transcriptEvent);
      this.safeSend('sherpa-transcript', transcriptEvent);
    }
  }

  /**
   * Stop streaming and get final result
   */
  stopStreaming(): string {
    if (!this.isStreaming || !this.asrStream || !this.asrInstance) {
      return '';
    }

    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }

    // Process any remaining audio
    if (this.audioBuffer.length > 0) {
      const totalSamples = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
      const combined = new Float32Array(totalSamples);
      let offset = 0;
      for (const buf of this.audioBuffer) {
        combined.set(buf, offset);
        offset += buf.length;
      }
      this.asrInstance.acceptWaveform(this.asrStream, 16000, combined);
    }

    // Get final result
    while (this.asrInstance.isReady(this.asrStream)) {
      this.asrInstance.decode(this.asrStream);
    }

    const result = this.asrInstance.getResult(this.asrStream);
    const finalText = result?.text?.trim() || '';

    if (finalText.length > 0) {
      const transcriptEvent: SherpaTranscriptEvent = {
        text: finalText,
        isFinal: true,
        timestamp: Date.now(),
      };

      this.emit('transcript', transcriptEvent);
      this.safeSend('sherpa-transcript', transcriptEvent);
    }

    this.isStreaming = false;
    this.asrStream = null;
    this.audioBuffer = [];

    this.debugLog(`[Sherpa] Streaming stopped. Final text: "${finalText}"`);
    this.emit('streaming-stopped', { text: finalText });

    return finalText;
  }

  // ============================================================================
  // Keyword Spotting (KWS)
  // ============================================================================

  /**
   * Initialize keyword spotting with custom keywords
   */
  async initKWS(keywords: string[]): Promise<void> {
    if (this.kwsInstance) {
      this.debugLog('[Sherpa] KWS already initialized');
      return;
    }

    const kwsModel = getDefaultModel('kws');
    if (!kwsModel) {
      throw new Error('No default KWS model found');
    }

    // Ensure model is downloaded
    if (!this.isModelDownloaded(kwsModel.id)) {
      this.debugLog(`[Sherpa] Downloading KWS model ${kwsModel.id}...`);
      await this.downloadModel(kwsModel.id);
    }

    // Ensure sherpa is loaded
    if (!this.sherpa) {
      try {
        this.sherpa = await import('sherpa-onnx-node');
      } catch (error) {
        this.debugLog(`[Sherpa] Failed to load sherpa-onnx-node: ${error}`);
        throw new Error('sherpa-onnx-node not available');
      }
    }

    // Create keywords file
    const keywordsFile = path.join(this.getModelDir(kwsModel.id), 'keywords.txt');
    fs.writeFileSync(keywordsFile, keywords.join('\n'), 'utf-8');

    const kwsConfig: any = {
      transducer: {
        encoder: this.getModelPath(kwsModel, 'encoder'),
        decoder: this.getModelPath(kwsModel, 'decoder'),
        joiner: this.getModelPath(kwsModel, 'joiner'),
      },
      tokens: this.getModelPath(kwsModel, 'tokens'),
      keywordsFile,
      numThreads: 1,
      provider: 'cpu',
      maxActivePaths: 4,
    };

    this.kwsInstance = new this.sherpa.KeywordSpotter(kwsConfig);
    this.kwsStream = this.kwsInstance.createStream();

    this.debugLog(`[Sherpa] KWS initialized with keywords: ${keywords.join(', ')}`);
    this.emit('kws-ready', { keywords });
    this.safeSend('sherpa-kws-ready', { keywords });
  }

  /**
   * Feed audio to keyword spotter
   */
  feedKWSAudio(samples: Float32Array): string | null {
    if (!this.kwsInstance || !this.kwsStream) {
      return null;
    }

    this.kwsInstance.acceptWaveform(this.kwsStream, 16000, samples);

    if (this.kwsInstance.isReady(this.kwsStream)) {
      this.kwsInstance.decode(this.kwsStream);
    }

    const result = this.kwsInstance.getResult(this.kwsStream);

    if (result && result.keyword && result.keyword.trim().length > 0) {
      const keyword = result.keyword.trim();
      this.debugLog(`[Sherpa] Keyword detected: ${keyword}`);
      this.emit('keyword-detected', { keyword, timestamp: Date.now() });
      this.safeSend('sherpa-keyword-detected', { keyword, timestamp: Date.now() });
      return keyword;
    }

    return null;
  }

  // ============================================================================
  // TTS (Text-to-Speech)
  // ============================================================================

  /**
   * Initialize TTS
   */
  async initTTS(): Promise<void> {
    if (this.ttsInstance) {
      this.debugLog('[Sherpa] TTS already initialized');
      return;
    }

    const ttsModel = getDefaultModel('tts');
    if (!ttsModel) {
      throw new Error('No default TTS model found');
    }

    // Ensure model is downloaded
    if (!this.isModelDownloaded(ttsModel.id)) {
      this.debugLog(`[Sherpa] Downloading TTS model ${ttsModel.id}...`);
      await this.downloadModel(ttsModel.id);
    }

    // Ensure sherpa is loaded
    if (!this.sherpa) {
      try {
        this.sherpa = await import('sherpa-onnx-node');
      } catch (error) {
        this.debugLog(`[Sherpa] Failed to load sherpa-onnx-node: ${error}`);
        throw new Error('sherpa-onnx-node not available');
      }
    }

    const ttsConfig: any = {
      model: {
        vits: {
          model: this.getModelPath(ttsModel, 'model'),
          tokens: this.getModelPath(ttsModel, 'tokens'),
          dataDir: this.getModelPath(ttsModel, 'data-dir'),
        },
      },
      numThreads: DEFAULT_TTS_CONFIG.numThreads || 1,
      maxNumSentences: DEFAULT_TTS_CONFIG.maxNumSentences || 1,
      provider: 'cpu',
    };

    this.ttsInstance = new this.sherpa.OfflineTts(ttsConfig);
    this.debugLog('[Sherpa] TTS initialized');
    this.emit('tts-ready');
    this.safeSend('sherpa-tts-ready', { ready: true });
  }

  /**
   * Synthesize speech from text
   */
  async synthesize(
    text: string,
    options?: { speakerId?: number; speed?: number }
  ): Promise<{ samples: Float32Array; sampleRate: number }> {
    if (!this.ttsInstance) {
      throw new Error('TTS not initialized');
    }

    this.isSpeaking = true;

    try {
      const result = this.ttsInstance.generate({
        text,
        sid: options?.speakerId || 0,
        speed: options?.speed || 1.0,
      });

      this.debugLog(`[Sherpa] Synthesized ${result.samples.length} samples for text: "${text}"`);

      this.emit('tts-complete', {
        text,
        samples: result.samples,
        sampleRate: result.sampleRate,
        timestamp: Date.now(),
      });

      this.safeSend('sherpa-tts-complete', {
        text,
        sampleCount: result.samples.length,
        sampleRate: result.sampleRate,
        timestamp: Date.now(),
      });

      this.isSpeaking = false;

      return {
        samples: result.samples,
        sampleRate: result.sampleRate,
      };
    } catch (error) {
      this.isSpeaking = false;
      throw error;
    }
  }

  // ============================================================================
  // Speaker ID
  // ============================================================================

  /**
   * Initialize speaker identification
   */
  async initSpeakerID(): Promise<void> {
    if (this.speakerIdExtractor) {
      this.debugLog('[Sherpa] Speaker ID already initialized');
      return;
    }

    const speakerIdModel = getDefaultModel('speaker-id');
    if (!speakerIdModel) {
      throw new Error('No default Speaker ID model found');
    }

    // Ensure model is downloaded
    if (!this.isModelDownloaded(speakerIdModel.id)) {
      this.debugLog(`[Sherpa] Downloading Speaker ID model ${speakerIdModel.id}...`);
      await this.downloadModel(speakerIdModel.id);
    }

    // Ensure sherpa is loaded
    if (!this.sherpa) {
      try {
        this.sherpa = await import('sherpa-onnx-node');
      } catch (error) {
        this.debugLog(`[Sherpa] Failed to load sherpa-onnx-node: ${error}`);
        throw new Error('sherpa-onnx-node not available');
      }
    }

    const speakerIdConfig: any = {
      model: this.getModelPath(speakerIdModel, 'model'),
      numThreads: 1,
      provider: 'cpu',
    };

    this.speakerIdExtractor = new this.sherpa.SpeakerEmbeddingExtractor(speakerIdConfig);
    this.speakerManager = new this.sherpa.SpeakerEmbeddingManager(256); // 256-dim embeddings

    this.debugLog('[Sherpa] Speaker ID initialized');
    this.emit('speaker-id-ready');
    this.safeSend('sherpa-speaker-id-ready', { ready: true });
  }

  /**
   * Extract speaker embedding from audio
   */
  extractEmbedding(samples: Float32Array): Float32Array {
    if (!this.speakerIdExtractor) {
      throw new Error('Speaker ID not initialized');
    }

    const stream = this.speakerIdExtractor.createStream();
    this.speakerIdExtractor.acceptWaveform(stream, 16000, samples);
    const embedding = this.speakerIdExtractor.compute(stream);

    this.debugLog(`[Sherpa] Extracted ${embedding.length}-dim speaker embedding`);

    return embedding;
  }

  /**
   * Identify speaker from embedding
   */
  identifySpeaker(embedding: Float32Array, threshold: number = 0.6): string | null {
    if (!this.speakerManager) {
      throw new Error('Speaker ID not initialized');
    }

    let bestMatch: string | null = null;
    let bestScore = -Infinity;

    for (const [name, storedEmbedding] of this.speakerEmbeddings.entries()) {
      const score = this.speakerManager.verify(storedEmbedding, embedding);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = name;
      }
    }

    if (bestMatch && bestScore >= threshold) {
      this.debugLog(`[Sherpa] Identified speaker: ${bestMatch} (score: ${bestScore.toFixed(2)})`);
      return bestMatch;
    }

    this.debugLog(`[Sherpa] No speaker match (best score: ${bestScore.toFixed(2)})`);
    return null;
  }

  /**
   * Register a new speaker
   */
  registerSpeaker(name: string, embedding: Float32Array): void {
    if (!this.speakerManager) {
      throw new Error('Speaker ID not initialized');
    }

    this.speakerEmbeddings.set(name, embedding);
    this.speakerManager.add(name, embedding);

    this.debugLog(`[Sherpa] Registered speaker: ${name}`);
    this.emit('speaker-registered', { name, timestamp: Date.now() });
    this.safeSend('sherpa-speaker-registered', { name, timestamp: Date.now() });
  }

  // ============================================================================
  // Initialization & Lifecycle
  // ============================================================================

  /**
   * Initialize Sherpa components based on options
   */
  async initialize(options: SherpaInitOptions = {}): Promise<void> {
    this.debugLog('[Sherpa] Initializing...');

    const {
      enableVAD = true,
      enableASR = true,
      enableKWS = false,
      enableTTS = false,
      enableSpeakerID = false,
      keywords = ['hey hawkeye', 'ok hawkeye'],
    } = options;

    try {
      // Progressive initialization: VAD first (lightweight), then others
      if (enableVAD) {
        await this.initVAD();
      }

      if (enableASR) {
        await this.initASR();
      }

      if (enableKWS) {
        await this.initKWS(keywords);
      }

      if (enableTTS) {
        await this.initTTS();
      }

      if (enableSpeakerID) {
        await this.initSpeakerID();
      }

      this.debugLog('[Sherpa] Initialization complete');
      this.emit('initialized');
      this.safeSend('sherpa-initialized', this.getStatus());
    } catch (error) {
      this.debugLog(`[Sherpa] Initialization error: ${error}`);
      throw error;
    }
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    this.debugLog('[Sherpa] Shutting down...');

    // Stop streaming if active
    if (this.isStreaming) {
      this.stopStreaming();
    }

    // Clear streaming interval even if isStreaming was already false
    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }

    // Cancel any ongoing downloads
    for (const modelId of this.downloadingModels) {
      this.cancelDownload(modelId);
    }

    // Clear instances
    this.vadInstance = null;
    this.asrInstance = null;
    this.asrStream = null;
    this.kwsInstance = null;
    this.kwsStream = null;
    this.ttsInstance = null;
    this.speakerIdExtractor = null;
    this.speakerManager = null;
    this.sherpa = null;

    this.isStreaming = false;
    this.isSpeaking = false;
    this.speechStarted = false;

    this.debugLog('[Sherpa] Shutdown complete');
  }

  /**
   * Get current status
   */
  getStatus(): SherpaOnnxStatus {
    return {
      initialized: !!this.sherpa,
      vadReady: !!this.vadInstance,
      asrReady: !!this.asrInstance,
      kwsReady: !!this.kwsInstance,
      ttsReady: !!this.ttsInstance,
      speakerIdReady: !!this.speakerIdExtractor,
      isStreaming: this.isStreaming,
      isSpeaking: this.isSpeaking,
      downloadingModels: Array.from(this.downloadingModels),
    };
  }

  // ============================================================================
  // IPC Communication
  // ============================================================================

  private safeSend(channel: string, data: unknown): void {
    const win = this.mainWindowGetter();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}
