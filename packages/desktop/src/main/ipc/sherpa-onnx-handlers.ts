import { ipcMain } from 'electron';
import type { SherpaOnnxService, SherpaInitOptions } from '../services/sherpa-onnx-service';
import type { WakeWordService, WakeWordConfig } from '../services/wake-word-service';
import type { TTSPlaybackService, TTSPlaybackConfig } from '../services/tts-playback-service';
import { ALL_MODELS } from '../services/sherpa-models';

/**
 * Register IPC handlers for Sherpa-ONNX voice services
 *
 * Handles:
 * - SherpaOnnx core: initialization, model management, streaming ASR
 * - WakeWord: wake word detection with KWS
 * - TTSPlayback: text-to-speech with queuing and playback control
 */
export function registerSherpaOnnxHandlers(
  sherpaService: SherpaOnnxService,
  wakeWordService: WakeWordService,
  ttsService: TTSPlaybackService,
  debugLog?: (msg: string) => void
): void {
  const log = debugLog ?? (() => {});

  // ==========================================================================
  // Sherpa-ONNX Core Handlers
  // ==========================================================================

  /**
   * Get current status of all Sherpa components
   */
  ipcMain.handle('sherpa:get-status', async () => {
    try {
      return sherpaService.getStatus();
    } catch (error) {
      log(`[SherpaHandlers] Error getting status: ${error}`);
      throw error;
    }
  });

  /**
   * Initialize Sherpa services with options
   */
  ipcMain.handle('sherpa:initialize', async (_event, options?: SherpaInitOptions) => {
    try {
      log(`[SherpaHandlers] Initializing with options: ${JSON.stringify(options)}`);
      await sherpaService.initialize(options);
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Initialization error: ${error}`);
      throw error;
    }
  });

  /**
   * Shutdown Sherpa services
   */
  ipcMain.handle('sherpa:shutdown', async () => {
    try {
      log('[SherpaHandlers] Shutting down Sherpa services');
      await sherpaService.shutdown();
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Shutdown error: ${error}`);
      throw error;
    }
  });

  /**
   * Download a specific model by ID
   */
  ipcMain.handle('sherpa:download-model', async (_event, modelId: string) => {
    try {
      if (typeof modelId !== 'string' || !modelId.trim()) {
        throw new Error('Invalid modelId: must be a non-empty string');
      }
      log(`[SherpaHandlers] Downloading model: ${modelId}`);
      await sherpaService.downloadModel(modelId);
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Download error for ${modelId}: ${error}`);
      throw error;
    }
  });

  /**
   * Check if a model is downloaded
   */
  ipcMain.handle('sherpa:is-model-downloaded', async (_event, modelId: string) => {
    try {
      if (typeof modelId !== 'string' || !modelId.trim()) {
        throw new Error('Invalid modelId: must be a non-empty string');
      }
      return sherpaService.isModelDownloaded(modelId);
    } catch (error) {
      log(`[SherpaHandlers] Error checking model ${modelId}: ${error}`);
      throw error;
    }
  });

  /**
   * Get list of all available models
   */
  ipcMain.handle('sherpa:get-available-models', async () => {
    try {
      return ALL_MODELS;
    } catch (error) {
      log(`[SherpaHandlers] Error getting models: ${error}`);
      throw error;
    }
  });

  // ==========================================================================
  // Streaming ASR Handlers
  // ==========================================================================

  /**
   * Start streaming ASR
   */
  ipcMain.handle('sherpa:start-streaming', async () => {
    try {
      log('[SherpaHandlers] Starting streaming ASR');
      sherpaService.startStreaming();
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Error starting streaming: ${error}`);
      throw error;
    }
  });

  /**
   * Stop streaming ASR and get final result
   */
  ipcMain.handle('sherpa:stop-streaming', async () => {
    try {
      log('[SherpaHandlers] Stopping streaming ASR');
      const finalText = sherpaService.stopStreaming();
      return { success: true, text: finalText };
    } catch (error) {
      log(`[SherpaHandlers] Error stopping streaming: ${error}`);
      throw error;
    }
  });

  /**
   * Feed audio data to streaming ASR
   */
  ipcMain.handle('sherpa:feed-audio', async (_event, buffer: ArrayBuffer) => {
    try {
      // Convert ArrayBuffer to Float32Array
      const samples = new Float32Array(buffer);
      sherpaService.feedAudio(samples);
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Error feeding audio: ${error}`);
      throw error;
    }
  });

  // ==========================================================================
  // Wake Word Handlers
  // ==========================================================================

  /**
   * Start wake word detection
   */
  ipcMain.handle('sherpa:wake-word-start', async () => {
    try {
      log('[SherpaHandlers] Starting wake word detection');
      await wakeWordService.start();
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Error starting wake word: ${error}`);
      throw error;
    }
  });

  /**
   * Stop wake word detection
   */
  ipcMain.handle('sherpa:wake-word-stop', async () => {
    try {
      log('[SherpaHandlers] Stopping wake word detection');
      wakeWordService.stop();
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Error stopping wake word: ${error}`);
      throw error;
    }
  });

  /**
   * Configure wake word service
   */
  ipcMain.handle('sherpa:wake-word-configure', async (_event, config: Partial<WakeWordConfig>) => {
    try {
      log(`[SherpaHandlers] Configuring wake word: ${JSON.stringify(config)}`);
      wakeWordService.configure(config);
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Error configuring wake word: ${error}`);
      throw error;
    }
  });

  /**
   * Get wake word service status
   */
  ipcMain.handle('sherpa:wake-word-status', async () => {
    try {
      return wakeWordService.getStatus();
    } catch (error) {
      log(`[SherpaHandlers] Error getting wake word status: ${error}`);
      throw error;
    }
  });

  // ==========================================================================
  // TTS Handlers
  // ==========================================================================

  /**
   * Speak text with TTS
   */
  ipcMain.handle('sherpa:tts-speak', async (_event, text: string, options?: {
    speakerId?: number;
    speed?: number;
    priority?: 'normal' | 'high' | 'system';
  }) => {
    try {
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('Invalid text: must be a non-empty string');
      }
      log(`[SherpaHandlers] TTS speak: "${text.substring(0, 50)}..."`);
      await ttsService.speak(text, options);
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Error speaking text: ${error}`);
      throw error;
    }
  });

  /**
   * Stop TTS playback and clear queue
   */
  ipcMain.handle('sherpa:tts-stop', async () => {
    try {
      log('[SherpaHandlers] Stopping TTS');
      ttsService.stop();
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Error stopping TTS: ${error}`);
      throw error;
    }
  });

  /**
   * Skip current TTS item
   */
  ipcMain.handle('sherpa:tts-skip', async () => {
    try {
      log('[SherpaHandlers] Skipping current TTS item');
      ttsService.skip();
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Error skipping TTS: ${error}`);
      throw error;
    }
  });

  /**
   * Pause TTS playback
   */
  ipcMain.handle('sherpa:tts-pause', async () => {
    try {
      log('[SherpaHandlers] Pausing TTS');
      ttsService.pause();
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Error pausing TTS: ${error}`);
      throw error;
    }
  });

  /**
   * Resume TTS playback
   */
  ipcMain.handle('sherpa:tts-resume', async () => {
    try {
      log('[SherpaHandlers] Resuming TTS');
      ttsService.resume();
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Error resuming TTS: ${error}`);
      throw error;
    }
  });

  /**
   * Get TTS playback status
   */
  ipcMain.handle('sherpa:tts-status', async () => {
    try {
      return ttsService.getStatus();
    } catch (error) {
      log(`[SherpaHandlers] Error getting TTS status: ${error}`);
      throw error;
    }
  });

  /**
   * Configure TTS playback service
   */
  ipcMain.handle('sherpa:tts-configure', async (_event, config: Partial<TTSPlaybackConfig>) => {
    try {
      log(`[SherpaHandlers] Configuring TTS: ${JSON.stringify(config)}`);
      ttsService.configure(config);
      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Error configuring TTS: ${error}`);
      throw error;
    }
  });

  /**
   * TTS playback completion event from renderer (fire-and-forget)
   * Called when renderer finishes playing audio
   */
  ipcMain.on('sherpa:tts-playback-done', (_event, itemId: string) => {
    try {
      log(`[SherpaHandlers] TTS playback done: ${itemId}`);
      ttsService.onPlaybackComplete(itemId);
    } catch (error) {
      log(`[SherpaHandlers] Error handling playback done: ${error}`);
    }
  });

  // ==========================================================================
  // Speaker ID Handlers
  // ==========================================================================

  /**
   * Register a new speaker
   */
  ipcMain.handle('sherpa:register-speaker', async (_event, name: string, audioBuffer: ArrayBuffer) => {
    try {
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error('Invalid speaker name: must be a non-empty string');
      }
      if (!(audioBuffer instanceof ArrayBuffer) || audioBuffer.byteLength === 0) {
        throw new Error('Invalid audioBuffer: must be a non-empty ArrayBuffer');
      }
      log(`[SherpaHandlers] Registering speaker: ${name}`);

      // Convert ArrayBuffer to Float32Array
      const samples = new Float32Array(audioBuffer);

      // Extract embedding
      const embedding = sherpaService.extractEmbedding(samples);

      // Register speaker
      sherpaService.registerSpeaker(name, embedding);

      return { success: true };
    } catch (error) {
      log(`[SherpaHandlers] Error registering speaker: ${error}`);
      throw error;
    }
  });

  /**
   * Identify speaker from audio
   */
  ipcMain.handle('sherpa:identify-speaker', async (_event, audioBuffer: ArrayBuffer, threshold?: number) => {
    try {
      log('[SherpaHandlers] Identifying speaker');

      // Convert ArrayBuffer to Float32Array
      const samples = new Float32Array(audioBuffer);

      // Extract embedding
      const embedding = sherpaService.extractEmbedding(samples);

      // Identify speaker
      const speakerId = sherpaService.identifySpeaker(embedding, threshold);

      return { success: true, speakerId };
    } catch (error) {
      log(`[SherpaHandlers] Error identifying speaker: ${error}`);
      throw error;
    }
  });

  log('[SherpaHandlers] All Sherpa-ONNX IPC handlers registered');
}
