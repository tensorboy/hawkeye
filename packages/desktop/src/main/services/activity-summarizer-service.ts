/**
 * Activity Summarizer Desktop Service
 *
 * Wraps ActivitySummarizer for the Electron main process.
 * Manages 10-minute activity summaries and Life Tree updates.
 */

import { EventEmitter } from 'events';
import {
  ActivitySummarizer,
  ActivitySummarizerConfig,
  ActivitySummary,
  type HawkeyeDatabase,
  type ActivitySummaryRecord,
} from '@hawkeye/core';

export interface ActivitySummarizerServiceConfig {
  /** Summary interval in ms (default 10 minutes) */
  intervalMs?: number;
  /** Minimum events to generate summary */
  minEventCount?: number;
  /** Enable automatic summarization */
  enabled?: boolean;
}

export class ActivitySummarizerService extends EventEmitter {
  private summarizer: ActivitySummarizer | null = null;
  private db: HawkeyeDatabase | null = null;
  private debugLog: (msg: string) => void;

  constructor(debugLog: (msg: string) => void = console.log) {
    super();
    this.debugLog = debugLog;
  }

  /**
   * Initialize with database.
   */
  initialize(
    db: HawkeyeDatabase,
    config?: ActivitySummarizerServiceConfig,
  ): void {
    this.db = db;

    const summarizerConfig: Partial<ActivitySummarizerConfig> = {};
    if (config?.intervalMs) summarizerConfig.intervalMs = config.intervalMs;
    if (config?.minEventCount) summarizerConfig.minEventCount = config.minEventCount;
    if (config?.enabled !== undefined) summarizerConfig.enabled = config.enabled;

    this.summarizer = new ActivitySummarizer(db, summarizerConfig);

    // Forward events
    this.summarizer.on('started', () => {
      this.debugLog('[ActivitySummarizer] Started');
      this.emit('started');
    });

    this.summarizer.on('stopped', () => {
      this.debugLog('[ActivitySummarizer] Stopped');
      this.emit('stopped');
    });

    this.summarizer.on('summaryGenerated', (summary: ActivitySummary) => {
      this.debugLog(`[ActivitySummarizer] Generated summary: ${summary.summaryText}`);
      this.emit('summary-generated', summary);
    });

    this.summarizer.on('skipped', (info: { reason: string; count: number }) => {
      this.debugLog(`[ActivitySummarizer] Skipped: ${info.reason} (${info.count} events)`);
      this.emit('skipped', info);
    });

    this.debugLog('[ActivitySummarizer] Service initialized');
  }

  /**
   * Start the summarizer.
   */
  start(): void {
    if (!this.summarizer) {
      this.debugLog('[ActivitySummarizer] Not initialized');
      return;
    }
    this.summarizer.start();
  }

  /**
   * Stop the summarizer.
   */
  stop(): void {
    if (!this.summarizer) return;
    this.summarizer.stop();
  }

  /**
   * Manually generate a summary now.
   */
  async generateNow(): Promise<ActivitySummary | null> {
    if (!this.summarizer) {
      this.debugLog('[ActivitySummarizer] Not initialized');
      return null;
    }
    return this.summarizer.generateSummary();
  }

  /**
   * Get recent summaries.
   */
  getRecentSummaries(limit: number = 50): ActivitySummaryRecord[] {
    if (!this.summarizer) return [];
    return this.summarizer.getRecentSummaries(limit);
  }

  /**
   * Get summaries in a time range.
   */
  getSummariesInRange(startTime: number, endTime: number): ActivitySummaryRecord[] {
    if (!this.summarizer) return [];
    return this.summarizer.getSummariesInRange(startTime, endTime);
  }

  /**
   * Get pending Life Tree updates.
   */
  getPendingLifeTreeUpdates(): ActivitySummaryRecord[] {
    if (!this.summarizer) return [];
    return this.summarizer.getPendingLifeTreeUpdates();
  }

  /**
   * Mark a summary as having updated the Life Tree.
   */
  markLifeTreeUpdated(summaryId: string): void {
    if (!this.summarizer) return;
    this.summarizer.markLifeTreeUpdated(summaryId);
  }

  /**
   * Check if the summarizer is running.
   */
  isRunning(): boolean {
    if (!this.summarizer) return false;
    return this.summarizer.isActive();
  }

  /**
   * Get the current config.
   */
  getConfig(): ActivitySummarizerConfig | null {
    if (!this.summarizer) return null;
    return this.summarizer.getConfig();
  }

  /**
   * Update the config.
   */
  updateConfig(config: Partial<ActivitySummarizerConfig>): void {
    if (!this.summarizer) return;
    this.summarizer.updateConfig(config);
  }

  /**
   * Cleanup.
   */
  destroy(): void {
    if (this.summarizer) {
      this.summarizer.stop();
      this.summarizer = null;
    }
    this.db = null;
  }
}
