/**
 * Builtin Handlers
 *
 * Pre-defined job handlers for common tasks.
 * These handlers can be registered with CronService.
 */

import { loguru } from '../debug';
import type { CronService } from './cron-service';
import type { CronJob, LifeTreeGoal, NotificationAction } from './types';

const logger = loguru.scope('BuiltinHandlers');

/**
 * Builtin handler names
 */
export const BuiltinHandlerNames = {
  LIFE_TREE_CHECK: 'life_tree_check',
  BEHAVIOR_ANALYSIS: 'behavior_analysis',
  AGENT_PROMPT: 'agent_prompt',
  NOTIFICATION: 'notification',
  DAILY_SUMMARY: 'daily_summary',
  MEMORY_CLEANUP: 'memory_cleanup',
} as const;

/**
 * Engine interface for handler dependencies
 */
export interface HandlerEngineInterface {
  // Life Tree
  getLifeTreeGoals?: () => Promise<LifeTreeGoal[]>;

  // Notifications
  showNotification?: (notification: { title: string; body: string; actions?: NotificationAction[] }) => void;

  // Agent
  chat?: (prompt: string) => Promise<string>;

  // Behavior Analysis
  getBehaviorAnalyzer?: () => BehaviorAnalyzerInterface | undefined;

  // Daily Notes
  getDailyNotes?: () => DailyNotesInterface | undefined;

  // Memory
  getMemoryManager?: () => MemoryManagerInterface | undefined;

  // Storage
  storage?: {
    set: (key: string, value: unknown) => Promise<void>;
    get: (key: string) => Promise<unknown>;
  };
}

/**
 * Behavior analyzer interface
 */
export interface BehaviorAnalyzerInterface {
  generateDailySummary(): Promise<BehaviorSummary>;
}

/**
 * Behavior summary
 */
export interface BehaviorSummary {
  date: string;
  activeTime: number;
  topApps: string[];
  topCategories: string[];
  productivityScore: number;
  insights: string[];
}

/**
 * Daily notes interface
 */
export interface DailyNotesInterface {
  generateDailySummary(date?: string): Promise<string>;
  appendToday(content: string, section?: string): Promise<void>;
}

/**
 * Memory manager interface
 */
export interface MemoryManagerInterface {
  cleanup(): Promise<number>;
}

/**
 * Register builtin handlers with CronService
 */
export function registerBuiltinHandlers(
  cronService: CronService,
  engine: HandlerEngineInterface
): void {
  logger.info('Registering builtin handlers');

  // ============================================================================
  // Life Tree Check Handler
  // ============================================================================

  cronService.registerHandler(BuiltinHandlerNames.LIFE_TREE_CHECK, async (job: CronJob) => {
    if (!engine.getLifeTreeGoals) {
      logger.warn('Life Tree goals getter not available');
      return { skipped: true, reason: 'getLifeTreeGoals not configured' };
    }

    const goals = await engine.getLifeTreeGoals();
    const now = Date.now();

    // Find goals needing attention
    const overdueGoals = goals.filter(
      g => g.status !== 'completed' && g.status !== 'cancelled' && g.dueDate && g.dueDate < now
    );

    const soonGoals = goals.filter(
      g =>
        g.status !== 'completed' &&
        g.status !== 'cancelled' &&
        g.dueDate &&
        g.dueDate > now &&
        g.dueDate - now < 24 * 60 * 60 * 1000
    );

    const staleGoals = goals.filter(
      g =>
        g.status !== 'completed' &&
        g.status !== 'cancelled' &&
        g.lastActivity &&
        now - g.lastActivity > 7 * 24 * 60 * 60 * 1000
    );

    const totalAlerts = overdueGoals.length + soonGoals.length + staleGoals.length;

    if (totalAlerts > 0 && engine.showNotification) {
      const parts: string[] = [];
      if (overdueGoals.length > 0) {
        parts.push(`${overdueGoals.length} overdue`);
      }
      if (soonGoals.length > 0) {
        parts.push(`${soonGoals.length} due soon`);
      }
      if (staleGoals.length > 0) {
        parts.push(`${staleGoals.length} stale`);
      }

      engine.showNotification({
        title: '📋 Life Tree Reminder',
        body: `Goals: ${parts.join(', ')}`,
        actions: [{ label: 'View', action: 'open:life-tree' }],
      });
    }

    logger.info(`Life Tree check: ${totalAlerts} goals need attention`);

    return {
      checkedGoals: goals.length,
      overdue: overdueGoals.length,
      dueSoon: soonGoals.length,
      stale: staleGoals.length,
    };
  });

  // ============================================================================
  // Behavior Analysis Handler
  // ============================================================================

  cronService.registerHandler(BuiltinHandlerNames.BEHAVIOR_ANALYSIS, async (job: CronJob) => {
    const analyzer = engine.getBehaviorAnalyzer?.();

    if (!analyzer) {
      logger.warn('Behavior analyzer not available');
      return { skipped: true, reason: 'getBehaviorAnalyzer not configured' };
    }

    const summary = await analyzer.generateDailySummary();

    // Store summary
    if (engine.storage) {
      const key = `behavior_summary:${summary.date}`;
      await engine.storage.set(key, summary);
    }

    // Append to daily notes
    const dailyNotes = engine.getDailyNotes?.();
    if (dailyNotes) {
      const summaryText = [
        `**Active Time**: ${Math.round(summary.activeTime / 60)} minutes`,
        `**Top Apps**: ${summary.topApps.slice(0, 3).join(', ')}`,
        `**Productivity Score**: ${summary.productivityScore}/100`,
        '',
        '**Insights**:',
        ...summary.insights.map(i => `- ${i}`),
      ].join('\n');

      await dailyNotes.appendToday(summaryText, 'activities');
    }

    logger.info(`Behavior analysis completed for ${summary.date}`);

    return summary;
  });

  // ============================================================================
  // Agent Prompt Handler
  // ============================================================================

  cronService.registerHandler(BuiltinHandlerNames.AGENT_PROMPT, async (job: CronJob) => {
    const { prompt } = job.payload;

    if (!prompt) {
      logger.warn('No prompt in job payload');
      return { skipped: true, reason: 'no prompt' };
    }

    if (!engine.chat) {
      logger.warn('Chat function not available');
      return { skipped: true, reason: 'chat not configured' };
    }

    const response = await engine.chat(prompt);

    logger.info(`Agent prompt executed, response length: ${response.length}`);

    return { prompt, response };
  });

  // ============================================================================
  // Notification Handler
  // ============================================================================

  cronService.registerHandler(BuiltinHandlerNames.NOTIFICATION, async (job: CronJob) => {
    const { notification } = job.payload;

    if (!notification) {
      logger.warn('No notification in job payload');
      return { skipped: true, reason: 'no notification' };
    }

    if (!engine.showNotification) {
      logger.warn('showNotification not available');
      return { skipped: true, reason: 'showNotification not configured' };
    }

    engine.showNotification({
      title: notification.title,
      body: notification.body,
      actions: notification.actions,
    });

    logger.info(`Notification sent: ${notification.title}`);

    return { sent: true, title: notification.title };
  });

  // ============================================================================
  // Daily Summary Handler
  // ============================================================================

  cronService.registerHandler(BuiltinHandlerNames.DAILY_SUMMARY, async (job: CronJob) => {
    const dailyNotes = engine.getDailyNotes?.();

    if (!dailyNotes) {
      logger.warn('Daily notes not available');
      return { skipped: true, reason: 'getDailyNotes not configured' };
    }

    const summary = await dailyNotes.generateDailySummary();

    logger.info('Daily summary generated');

    return { summary };
  });

  // ============================================================================
  // Memory Cleanup Handler
  // ============================================================================

  cronService.registerHandler(BuiltinHandlerNames.MEMORY_CLEANUP, async (job: CronJob) => {
    const memoryManager = engine.getMemoryManager?.();

    if (!memoryManager) {
      logger.warn('Memory manager not available');
      return { skipped: true, reason: 'getMemoryManager not configured' };
    }

    const removedCount = await memoryManager.cleanup();

    logger.info(`Memory cleanup completed, removed ${removedCount} items`);

    return { removedCount };
  });

  logger.info('Builtin handlers registered');
}

/**
 * Create preset jobs for common tasks
 */
export function createPresetJobs(cronService: CronService): void {
  const now = Date.now();

  // Daily Life Tree check at 9 AM
  cronService.addJob({
    name: 'Daily Life Tree Check',
    description: 'Check Life Tree goals for overdue items',
    enabled: true,
    schedule: {
      kind: 'cron',
      cronExpr: '0 9 * * *',  // 9 AM daily
    },
    payload: {
      kind: 'life_tree_check',
    },
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 60000,
    deleteAfterRun: false,
    tags: ['preset', 'life-tree'],
  });

  // Daily behavior analysis at 10 PM
  cronService.addJob({
    name: 'Daily Behavior Analysis',
    description: 'Generate daily behavior summary',
    enabled: true,
    schedule: {
      kind: 'cron',
      cronExpr: '0 22 * * *',  // 10 PM daily
    },
    payload: {
      kind: 'behavior_analysis',
    },
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 120000,
    deleteAfterRun: false,
    tags: ['preset', 'behavior'],
  });

  // Weekly memory cleanup on Sunday at midnight
  cronService.addJob({
    name: 'Weekly Memory Cleanup',
    description: 'Clean up old memories',
    enabled: true,
    schedule: {
      kind: 'cron',
      cronExpr: '0 0 * * 0',  // Sunday at midnight
    },
    payload: {
      kind: 'memory_cleanup',
    },
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 300000,
    deleteAfterRun: false,
    tags: ['preset', 'memory'],
  });

  logger.info('Preset jobs created');
}
