import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import type { SherpaOnnxService } from './sherpa-onnx-service';

export interface TTSPlaybackConfig {
  /** Default speaker ID for TTS model (default: 0) */
  defaultSpeakerId: number;
  /** Speech rate (default: 1.0) */
  defaultSpeed: number;
  /** Max queue size before oldest items are dropped (default: 10) */
  maxQueueSize: number;
  /** Whether to interrupt current speech when new text arrives (default: false) */
  interruptOnNew: boolean;
}

export const DEFAULT_TTS_PLAYBACK_CONFIG: TTSPlaybackConfig = {
  defaultSpeakerId: 0,
  defaultSpeed: 1.0,
  maxQueueSize: 10,
  interruptOnNew: false,
};

export interface TTSQueueItem {
  id: string;
  text: string;
  speakerId?: number;
  speed?: number;
  priority: 'normal' | 'high' | 'system';
  timestamp: number;
}

export interface TTSPlaybackStatus {
  isPlaying: boolean;
  isSynthesizing: boolean;
  queueLength: number;
  currentItemId: string | null;
  config: TTSPlaybackConfig;
}

/**
 * TTSPlaybackService manages TTS audio output playback, queuing, and interruption.
 *
 * Features:
 * - Queue-based playback with priority system
 * - Interrupt mode for urgent messages
 * - Audio synthesis in main process, playback via renderer AudioContext
 * - Pause/resume/skip controls
 *
 * Events:
 * - 'playing': Emitted when item starts playing
 * - 'playback-complete': Emitted when item finishes
 * - 'error': Emitted on synthesis/playback errors
 * - 'queue-changed': Emitted when queue is modified
 */
export class TTSPlaybackService extends EventEmitter {
  private sherpaService: SherpaOnnxService | null = null;
  private config: TTSPlaybackConfig;
  private queue: TTSQueueItem[] = [];
  private isPlaying = false;
  private isSynthesizing = false;
  private currentItemId: string | null = null;
  private abortController: AbortController | null = null;
  private isPaused = false;
  private idCounter = 0;

  constructor(
    private mainWindowGetter: () => BrowserWindow | null,
    private debugLog: (msg: string) => void
  ) {
    super();
    this.config = { ...DEFAULT_TTS_PLAYBACK_CONFIG };
    this.debugLog('[TTSPlayback] Service initialized');
  }

  /**
   * Set the SherpaOnnx service instance for synthesis.
   */
  setSherpaService(service: SherpaOnnxService): void {
    this.sherpaService = service;
    this.debugLog('[TTSPlayback] SherpaOnnx service configured');
  }

  /**
   * Update playback configuration.
   */
  configure(config: Partial<TTSPlaybackConfig>): void {
    this.config = { ...this.config, ...config };
    this.debugLog(`[TTSPlayback] Config updated: ${JSON.stringify(this.config)}`);
    this.safeSend('tts-playback-status', this.getStatus());
  }

  /**
   * Add text to speech queue.
   * If interruptOnNew is true, stops current playback and speaks this immediately.
   * High/system priority items go to front of queue.
   */
  async speak(
    text: string,
    options?: {
      speakerId?: number;
      speed?: number;
      priority?: 'normal' | 'high' | 'system';
    }
  ): Promise<void> {
    if (!text.trim()) {
      this.debugLog('[TTSPlayback] Ignoring empty text');
      return;
    }

    if (!this.sherpaService) {
      this.debugLog('[TTSPlayback] SherpaOnnx service not initialized');
      throw new Error('SherpaOnnx service not initialized');
    }

    const priority = options?.priority ?? 'normal';
    const item: TTSQueueItem = {
      id: this.generateId(),
      text: text.trim(),
      speakerId: options?.speakerId,
      speed: options?.speed,
      priority,
      timestamp: Date.now(),
    };

    this.debugLog(`[TTSPlayback] Adding to queue: "${text.substring(0, 50)}..." (priority: ${priority})`);

    // Handle interrupt mode
    if (this.config.interruptOnNew) {
      this.debugLog('[TTSPlayback] Interrupt mode - stopping current playback');
      this.stop();
      this.queue = [item];
    } else {
      // Add to queue based on priority
      if (priority === 'system') {
        // System priority goes first
        this.queue.unshift(item);
      } else if (priority === 'high') {
        // High priority goes after system but before normal
        const firstNormalIndex = this.queue.findIndex(q => q.priority === 'normal');
        if (firstNormalIndex === -1) {
          this.queue.push(item);
        } else {
          this.queue.splice(firstNormalIndex, 0, item);
        }
      } else {
        // Normal priority goes to end
        this.queue.push(item);
      }

      // Enforce max queue size - remove oldest normal priority items
      while (this.queue.length > this.config.maxQueueSize) {
        const normalIndex = this.queue.findIndex(q => q.priority === 'normal');
        if (normalIndex !== -1) {
          const removed = this.queue.splice(normalIndex, 1)[0];
          this.debugLog(`[TTSPlayback] Queue full, dropped item: ${removed.id}`);
        } else {
          // If no normal items, remove oldest
          this.queue.shift();
        }
      }
    }

    this.emit('queue-changed', this.queue);
    this.safeSend('tts-playback-status', this.getStatus());

    // Start processing if not already playing
    if (!this.isPlaying && !this.isPaused) {
      await this.processQueue();
    }
  }

  /**
   * Stop current playback and clear queue.
   */
  stop(): void {
    this.debugLog('[TTSPlayback] Stopping playback');

    // Abort current synthesis if in progress
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Stop audio playback in renderer
    this.safeSend('tts-stop-audio', null);

    // Clear state
    this.isPlaying = false;
    this.isSynthesizing = false;
    this.isPaused = false;
    this.currentItemId = null;
    this.queue = [];

    this.emit('queue-changed', this.queue);
    this.safeSend('tts-playback-status', this.getStatus());
  }

  /**
   * Skip current item and play next in queue.
   */
  skip(): void {
    if (!this.isPlaying && !this.isSynthesizing) {
      this.debugLog('[TTSPlayback] Skip called but nothing playing');
      return;
    }

    this.debugLog('[TTSPlayback] Skipping current item');

    // Abort current synthesis
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Stop audio playback
    this.safeSend('tts-stop-audio', null);

    const skippedId = this.currentItemId;
    this.isPlaying = false;
    this.isSynthesizing = false;
    this.currentItemId = null;

    if (skippedId) {
      this.emit('playback-complete', skippedId);
    }

    this.safeSend('tts-playback-status', this.getStatus());

    // Process next item
    this.processQueue();
  }

  /**
   * Pause current playback.
   */
  pause(): void {
    if (!this.isPlaying || this.isPaused) {
      this.debugLog('[TTSPlayback] Cannot pause - not playing or already paused');
      return;
    }

    this.debugLog('[TTSPlayback] Pausing playback');
    this.isPaused = true;
    this.safeSend('tts-pause-audio', null);
    this.safeSend('tts-playback-status', this.getStatus());
  }

  /**
   * Resume paused playback.
   */
  resume(): void {
    if (!this.isPaused) {
      this.debugLog('[TTSPlayback] Cannot resume - not paused');
      return;
    }

    this.debugLog('[TTSPlayback] Resuming playback');
    this.isPaused = false;
    this.safeSend('tts-resume-audio', null);
    this.safeSend('tts-playback-status', this.getStatus());

    // If queue has items but nothing playing, start processing
    if (!this.isPlaying && this.queue.length > 0) {
      this.processQueue();
    }
  }

  /**
   * Process the queue - synthesize and play next item.
   * The main processing loop.
   */
  private async processQueue(): Promise<void> {
    if (this.isPlaying || this.isPaused || this.queue.length === 0 || !this.sherpaService) {
      return;
    }

    const item = this.queue.shift()!;
    this.currentItemId = item.id;
    this.isSynthesizing = true;
    this.isPlaying = true;

    this.debugLog(`[TTSPlayback] Processing item ${item.id}: "${item.text.substring(0, 50)}..."`);

    this.emit('queue-changed', this.queue);
    this.safeSend('tts-playback-status', this.getStatus());

    try {
      // Create abort controller for this synthesis
      this.abortController = new AbortController();

      // Synthesize via SherpaOnnxService
      const speakerId = item.speakerId ?? this.config.defaultSpeakerId;
      const speed = item.speed ?? this.config.defaultSpeed;

      this.debugLog(`[TTSPlayback] Synthesizing with speakerId=${speakerId}, speed=${speed}`);

      const result = await this.sherpaService.synthesize(item.text, {
        speakerId,
        speed,
      });

      // Check if we were aborted during synthesis
      if (this.abortController.signal.aborted) {
        this.debugLog('[TTSPlayback] Synthesis aborted');
        return;
      }

      this.isSynthesizing = false;
      this.debugLog(`[TTSPlayback] Synthesis complete: ${result.samples.length} samples @ ${result.sampleRate}Hz`);

      // Send audio to renderer for playback via AudioContext
      // The renderer will play the audio and send back 'tts-playback-done' when finished
      this.safeSend('tts-play-audio', {
        itemId: item.id,
        samples: Array.from(result.samples), // Float32Array -> number[]
        sampleRate: result.sampleRate,
      });

      // Emit events
      this.emit('playing', item);
      this.safeSend('tts-playback-status', this.getStatus());

    } catch (error) {
      this.debugLog(`[TTSPlayback] Synthesis error: ${error}`);
      this.isPlaying = false;
      this.isSynthesizing = false;
      this.currentItemId = null;
      this.abortController = null;
      this.emit('error', error);
      this.safeSend('tts-playback-status', this.getStatus());

      // Try next item
      await this.processQueue();
    }
  }

  /**
   * Called when renderer reports playback completed.
   */
  onPlaybackComplete(itemId: string): void {
    this.debugLog(`[TTSPlayback] Playback complete for item ${itemId}`);

    if (this.currentItemId === itemId) {
      this.isPlaying = false;
      this.currentItemId = null;
      this.abortController = null;
      this.emit('playback-complete', itemId);
      this.safeSend('tts-playback-status', this.getStatus());

      // Process next item
      this.processQueue();
    }
  }

  /**
   * Get current playback status.
   */
  getStatus(): TTSPlaybackStatus {
    return {
      isPlaying: this.isPlaying,
      isSynthesizing: this.isSynthesizing,
      queueLength: this.queue.length,
      currentItemId: this.currentItemId,
      config: { ...this.config },
    };
  }

  /**
   * Get current queue items.
   */
  getQueue(): TTSQueueItem[] {
    return [...this.queue];
  }

  /**
   * Clear the queue without stopping current playback.
   */
  clearQueue(): void {
    this.debugLog('[TTSPlayback] Clearing queue');
    this.queue = [];
    this.emit('queue-changed', this.queue);
    this.safeSend('tts-playback-status', this.getStatus());
  }

  /**
   * Generate unique ID for queue items.
   */
  private generateId(): string {
    return `tts-${Date.now()}-${this.idCounter++}`;
  }

  /**
   * Safely send IPC message to renderer.
   */
  private safeSend(channel: string, data: unknown): void {
    try {
      const mainWindow = this.mainWindowGetter();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
      }
    } catch (error) {
      this.debugLog(`[TTSPlayback] Failed to send ${channel}: ${error}`);
    }
  }

  /**
   * Cleanup resources.
   */
  destroy(): void {
    this.debugLog('[TTSPlayback] Destroying service');
    this.stop();
    this.removeAllListeners();
    this.sherpaService = null;
  }
}
