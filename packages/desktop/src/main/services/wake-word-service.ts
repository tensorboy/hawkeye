import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import type { SherpaOnnxService } from './sherpa-onnx-service';

export interface WakeWordConfig {
  /** Keywords to detect (default: ["Hey Hawkeye", "你好鹰眼"]) */
  keywords: string[];
  /** Detection sensitivity 0-1 (default: 0.6) */
  sensitivity: number;
  /** Cooldown period in ms after detection before listening again (default: 3000) */
  cooldownMs: number;
  /** Whether to auto-start on service init (default: false) */
  autoStart: boolean;
}

export const DEFAULT_WAKE_WORD_CONFIG: WakeWordConfig = {
  keywords: ['Hey Hawkeye', '你好鹰眼'],
  sensitivity: 0.6,
  cooldownMs: 3000,
  autoStart: false,
};

export interface WakeWordEvent {
  keyword: string;
  timestamp: number;
  confidence: number;
}

export class WakeWordService extends EventEmitter {
  private sherpaService: SherpaOnnxService | null = null;
  private config: WakeWordConfig;
  private isListening = false;
  private isInCooldown = false;
  private cooldownTimer: NodeJS.Timeout | null = null;

  constructor(
    private mainWindowGetter: () => BrowserWindow | null,
    private debugLog: (msg: string) => void
  ) {
    super();
    this.config = { ...DEFAULT_WAKE_WORD_CONFIG };
    this.debugLog('[WakeWordService] Initialized');
  }

  /**
   * Connect to SherpaOnnxService for keyword spotting
   */
  setSherpaService(service: SherpaOnnxService): void {
    this.sherpaService = service;
    this.debugLog('[WakeWordService] Connected to SherpaOnnxService');
  }

  /**
   * Update wake word configuration
   */
  async configure(config: Partial<WakeWordConfig>): Promise<void> {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };
    this.debugLog(
      `[WakeWordService] Configuration updated: ${JSON.stringify(this.config)}`
    );

    // If keywords changed and we're listening, restart KWS
    if (
      this.isListening &&
      this.sherpaService &&
      JSON.stringify(oldConfig.keywords) !== JSON.stringify(this.config.keywords)
    ) {
      this.debugLog('[WakeWordService] Keywords changed, reinitializing KWS');
      await this.sherpaService.initKWS(this.config.keywords);
    }
  }

  /**
   * Start listening for wake words
   */
  async start(): Promise<void> {
    if (this.isListening) {
      this.debugLog('[WakeWordService] Already listening');
      return;
    }

    if (!this.sherpaService) {
      this.debugLog('[WakeWordService] Cannot start: SherpaOnnxService not connected');
      throw new Error('SherpaOnnxService not connected');
    }

    try {
      // Initialize KWS with configured keywords
      this.debugLog(
        `[WakeWordService] Initializing KWS with keywords: ${this.config.keywords.join(', ')}`
      );
      await this.sherpaService.initKWS(this.config.keywords);

      this.isListening = true;
      this.isInCooldown = false;

      this.emit('listening-started');
      this.safeSend('wake-word-status', {
        isListening: true,
        keywords: this.config.keywords,
        sensitivity: this.config.sensitivity,
      });

      this.debugLog('[WakeWordService] Wake word detection started');
    } catch (error) {
      this.debugLog(
        `[WakeWordService] Failed to start: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Stop listening for wake words
   */
  stop(): void {
    if (!this.isListening) {
      this.debugLog('[WakeWordService] Not currently listening');
      return;
    }

    this.isListening = false;
    this.isInCooldown = false;

    // Clear any active cooldown timer
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }

    this.emit('listening-stopped');
    this.safeSend('wake-word-status', {
      isListening: false,
      keywords: this.config.keywords,
      sensitivity: this.config.sensitivity,
    });

    this.debugLog('[WakeWordService] Wake word detection stopped');
  }

  /**
   * Feed audio from AudioProcessorService.
   * Called continuously while listening.
   * Checks for keyword detection and handles cooldown.
   */
  feedAudio(samples: Float32Array): void {
    if (!this.isListening || this.isInCooldown || !this.sherpaService) {
      return;
    }

    try {
      const keyword = this.sherpaService.feedKWSAudio(samples);
      if (keyword) {
        this.onWakeWordDetected(keyword);
      }
    } catch (error) {
      this.debugLog(
        `[WakeWordService] Error feeding audio: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle wake word detection
   */
  private onWakeWordDetected(keyword: string): void {
    const timestamp = Date.now();
    this.debugLog(`[WakeWordService] Wake word detected: "${keyword}" at ${timestamp}`);

    // Enter cooldown period
    this.isInCooldown = true;

    const event: WakeWordEvent = {
      keyword,
      timestamp,
      confidence: this.config.sensitivity, // Actual confidence from KWS would be better
    };

    // Emit event for internal listeners
    this.emit('wake-word-detected', event);

    // Send to renderer process
    this.safeSend('wake-word-detected', {
      keyword,
      timestamp,
      confidence: this.config.sensitivity,
    });

    // Emit activation sound event (can be picked up by TTSPlaybackService or other services)
    this.emit('play-activation-sound', { keyword });

    // Start cooldown timer
    this.cooldownTimer = setTimeout(() => {
      this.isInCooldown = false;
      this.cooldownTimer = null;
      this.debugLog('[WakeWordService] Cooldown period ended, resuming listening');
      this.emit('cooldown-ended');
    }, this.config.cooldownMs);

    this.debugLog(
      `[WakeWordService] Entered cooldown for ${this.config.cooldownMs}ms`
    );
  }

  /**
   * Get current service status
   */
  getStatus(): {
    isListening: boolean;
    isInCooldown: boolean;
    keywords: string[];
    sensitivity: number;
    cooldownMs: number;
  } {
    return {
      isListening: this.isListening,
      isInCooldown: this.isInCooldown,
      keywords: [...this.config.keywords],
      sensitivity: this.config.sensitivity,
      cooldownMs: this.config.cooldownMs,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): WakeWordConfig {
    return { ...this.config };
  }

  /**
   * Manually trigger wake word (for testing)
   */
  triggerWakeWord(keyword?: string): void {
    if (!this.isListening) {
      this.debugLog('[WakeWordService] Cannot trigger: not listening');
      return;
    }

    const testKeyword = keyword || this.config.keywords[0] || 'Hey Hawkeye';
    this.debugLog(`[WakeWordService] Manually triggering wake word: "${testKeyword}"`);
    this.onWakeWordDetected(testKeyword);
  }

  /**
   * Safe send to renderer process
   */
  private safeSend(channel: string, data: unknown): void {
    try {
      const mainWindow = this.mainWindowGetter();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
      }
    } catch (error) {
      this.debugLog(
        `[WakeWordService] Failed to send to renderer: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.debugLog('[WakeWordService] Destroying service');
    this.stop();
    this.removeAllListeners();
    this.sherpaService = null;
  }
}
