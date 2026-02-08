/**
 * HeartbeatService
 *
 * Periodically wakes the agent to check for pending tasks.
 * Inspired by nanobot's heartbeat system.
 *
 * Features:
 * - Check HEARTBEAT.md file for tasks
 * - Check Life Tree goals for overdue/stale items
 * - Idle-only execution mode
 * - Integration with notification system
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { loguru } from '../debug';
import type { HeartbeatConfig, HeartbeatResult, HeartbeatServiceEvents, LifeTreeGoal } from './types';
import { DEFAULT_HEARTBEAT_CONFIG } from './types';

const logger = loguru.scope('HeartbeatService');

/**
 * Token indicating no action needed
 */
const HEARTBEAT_OK_TOKEN = 'HEARTBEAT_OK';

/**
 * HeartbeatService - Periodic task checker
 */
export class HeartbeatService extends EventEmitter {
  private config: HeartbeatConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastActivity = Date.now();
  private lastHeartbeat = 0;

  // Callbacks for external integrations
  private onHeartbeatCallback?: (tasks: string[]) => Promise<string | void>;
  private getLifeTreeGoalsCallback?: () => Promise<LifeTreeGoal[]>;
  private showNotificationCallback?: (notification: { title: string; body: string }) => void;

  constructor(config: Partial<HeartbeatConfig> = {}) {
    super();
    this.config = { ...DEFAULT_HEARTBEAT_CONFIG, ...config };
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Start the heartbeat service
   */
  start(): void {
    if (this.running) {
      logger.warn('HeartbeatService is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('HeartbeatService is disabled');
      return;
    }

    logger.info(`Starting HeartbeatService (interval: ${this.config.intervalMs}ms)`);

    this.running = true;
    this.timer = setInterval(() => this.tick(), this.config.intervalMs);

    this.emit('service:started');
    logger.info('HeartbeatService started');
  }

  /**
   * Stop the heartbeat service
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    logger.info('Stopping HeartbeatService...');

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;

    this.emit('service:stopped');
    logger.info('HeartbeatService stopped');
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Manually trigger a heartbeat
   */
  async triggerNow(): Promise<HeartbeatResult> {
    return this.performHeartbeat();
  }

  /**
   * Record user activity (resets idle timer)
   */
  recordActivity(): void {
    this.lastActivity = Date.now();
  }

  /**
   * Check if user is currently idle
   */
  isIdle(): boolean {
    return Date.now() - this.lastActivity > this.config.idleThresholdMs;
  }

  /**
   * Get service status
   */
  getStatus(): {
    running: boolean;
    lastHeartbeat: number;
    nextHeartbeat: number;
    isIdle: boolean;
    lastActivity: number;
  } {
    return {
      running: this.running,
      lastHeartbeat: this.lastHeartbeat,
      nextHeartbeat: this.lastHeartbeat + this.config.intervalMs,
      isIdle: this.isIdle(),
      lastActivity: this.lastActivity,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<HeartbeatConfig>): void {
    const wasRunning = this.running;

    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...updates };

    if (wasRunning && this.config.enabled) {
      this.start();
    }
  }

  // ============================================================================
  // Callback Setters
  // ============================================================================

  /**
   * Set callback for handling heartbeat tasks
   */
  setOnHeartbeat(callback: (tasks: string[]) => Promise<string | void>): void {
    this.onHeartbeatCallback = callback;
  }

  /**
   * Set callback for getting Life Tree goals
   */
  setGetLifeTreeGoals(callback: () => Promise<LifeTreeGoal[]>): void {
    this.getLifeTreeGoalsCallback = callback;
  }

  /**
   * Set callback for showing notifications
   */
  setShowNotification(callback: (notification: { title: string; body: string }) => void): void {
    this.showNotificationCallback = callback;
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Timer tick
   */
  private async tick(): Promise<void> {
    // Check if idle-only mode and user is active
    if (this.config.idleOnly && !this.isIdle()) {
      logger.debug('Skipping heartbeat: user is active');
      return;
    }

    try {
      await this.performHeartbeat();
    } catch (error) {
      logger.error('Heartbeat error:', error);
      this.emit('heartbeat:error', error as Error);
    }
  }

  /**
   * Perform a heartbeat check
   */
  private async performHeartbeat(): Promise<HeartbeatResult> {
    const timestamp = Date.now();
    this.lastHeartbeat = timestamp;

    logger.debug('Performing heartbeat...');
    this.emit('heartbeat:started');

    // Collect tasks from all sources
    const tasks: string[] = [];

    // Check HEARTBEAT.md file
    if (this.config.checkHeartbeatFile) {
      const fileTasks = await this.checkHeartbeatFile();
      tasks.push(...fileTasks);
    }

    // Check Life Tree goals
    if (this.config.checkLifeTree) {
      const goalTasks = await this.checkLifeTree();
      tasks.push(...goalTasks);
    }

    // If no tasks, skip
    if (tasks.length === 0) {
      const result: HeartbeatResult = {
        timestamp,
        hadTasks: false,
        tasksFound: 0,
        tasks: [],
        skipped: true,
        skipReason: 'No tasks found',
      };

      logger.debug('Heartbeat: no tasks found');
      this.emit('heartbeat:completed', result);
      return result;
    }

    // Process tasks
    let response: string | undefined;

    if (this.onHeartbeatCallback) {
      try {
        const callbackResult = await this.onHeartbeatCallback(tasks);
        response = callbackResult ?? undefined;
      } catch (error) {
        logger.error('Heartbeat callback error:', error);
      }
    }

    // Check if response indicates "nothing to do"
    const noActionNeeded = response && response.toUpperCase().includes(HEARTBEAT_OK_TOKEN);

    // Show notification if tasks need attention
    if (!noActionNeeded && this.showNotificationCallback) {
      this.showNotificationCallback({
        title: '📋 Hawkeye Heartbeat',
        body: `You have ${tasks.length} task(s) that need attention`,
      });
    }

    const result: HeartbeatResult = {
      timestamp,
      hadTasks: true,
      tasksFound: tasks.length,
      tasks,
      response,
    };

    logger.info(`Heartbeat completed: ${tasks.length} tasks found`);
    this.emit('heartbeat:completed', result);

    return result;
  }

  /**
   * Check HEARTBEAT.md file for tasks
   */
  private async checkHeartbeatFile(): Promise<string[]> {
    const filePath = this.config.heartbeatFilePath;

    if (!filePath) {
      return [];
    }

    try {
      if (!fs.existsSync(filePath)) {
        return [];
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      if (this.isHeartbeatEmpty(content)) {
        return [];
      }

      // Extract pending tasks (unchecked checkboxes)
      return this.extractPendingTasks(content);
    } catch (error) {
      logger.warn('Error reading HEARTBEAT.md:', error);
      return [];
    }
  }

  /**
   * Check if HEARTBEAT.md has no actionable content
   */
  private isHeartbeatEmpty(content: string): boolean {
    if (!content || content.trim().length === 0) {
      return true;
    }

    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines, headers, and HTML comments
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('<!--')) {
        continue;
      }

      // Skip completed checkboxes
      if (trimmed.startsWith('- [x]') || trimmed.startsWith('* [x]')) {
        continue;
      }

      // Found actionable content
      return false;
    }

    return true;
  }

  /**
   * Extract pending tasks from markdown content
   */
  private extractPendingTasks(content: string): string[] {
    const tasks: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Match unchecked checkboxes
      const match = trimmed.match(/^[-*]\s+\[\s\]\s+(.+)$/);
      if (match) {
        tasks.push(match[1].trim());
      }
    }

    return tasks;
  }

  /**
   * Check Life Tree goals for overdue/stale items
   */
  private async checkLifeTree(): Promise<string[]> {
    if (!this.getLifeTreeGoalsCallback) {
      return [];
    }

    try {
      const goals = await this.getLifeTreeGoalsCallback();
      const tasks: string[] = [];
      const now = Date.now();

      for (const goal of goals) {
        // Skip completed or cancelled goals
        if (goal.status === 'completed' || goal.status === 'cancelled') {
          continue;
        }

        // Check for overdue goals
        if (goal.dueDate && goal.dueDate < now) {
          tasks.push(`Goal "${goal.name}" is overdue`);
          continue;
        }

        // Check for goals due within 24 hours
        if (goal.dueDate && goal.dueDate - now < 24 * 60 * 60 * 1000) {
          tasks.push(`Goal "${goal.name}" is due soon`);
          continue;
        }

        // Check for stale goals (no activity for 7 days)
        if (goal.lastActivity && now - goal.lastActivity > 7 * 24 * 60 * 60 * 1000) {
          tasks.push(`Goal "${goal.name}" has no activity for 7+ days`);
        }
      }

      return tasks;
    } catch (error) {
      logger.warn('Error checking Life Tree goals:', error);
      return [];
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a HeartbeatService instance
 */
export function createHeartbeatService(config?: Partial<HeartbeatConfig>): HeartbeatService {
  return new HeartbeatService(config);
}
