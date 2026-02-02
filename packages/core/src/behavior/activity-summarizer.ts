/**
 * 活动总结器
 * 每10分钟自动总结用户活动，用于更新生命树
 */

import { EventEmitter } from 'events';
import { HawkeyeDatabase, ActivitySummaryRecord } from '../storage/database';
import { BehaviorEventType } from './types';

/**
 * 活动总结配置
 */
export interface ActivitySummarizerConfig {
  /** 总结间隔 (ms)，默认10分钟 */
  intervalMs: number;
  /** 是否启用自动总结 */
  enabled: boolean;
  /** 最少事件数量才生成总结 */
  minEventCount: number;
}

/**
 * 默认配置
 */
export const DEFAULT_SUMMARIZER_CONFIG: ActivitySummarizerConfig = {
  intervalMs: 10 * 60 * 1000, // 10分钟
  enabled: true,
  minEventCount: 3,
};

/**
 * App 使用分布
 */
export interface AppDistribution {
  [appName: string]: number; // 百分比
}

/**
 * 事件计数
 */
export interface EventCounts {
  [eventType: string]: number;
}

/**
 * 活动总结数据
 */
export interface ActivitySummary {
  id: string;
  startTime: number;
  endTime: number;
  summaryText: string;
  appDistribution: AppDistribution;
  eventCounts: EventCounts;
  dominantStage?: string;
  confidence: number;
  keywords: string[];
}

/**
 * 生命阶段映射（从 app/活动推断）
 */
const STAGE_MAPPINGS: Record<string, string[]> = {
  career: [
    'code', 'visual studio', 'vscode', 'xcode', 'intellij', 'webstorm',
    'slack', 'teams', 'zoom', 'meet', 'terminal', 'iterm', 'git',
    'jira', 'notion', 'figma', 'sketch', 'postman', 'docker',
  ],
  learning: [
    'safari', 'chrome', 'firefox', 'edge', 'book', 'reader', 'kindle',
    'youtube', 'coursera', 'udemy', 'bilibili', 'pdf', 'documentation',
  ],
  health: [
    'health', 'fitness', 'workout', 'meditation', 'calm', 'headspace',
    'strava', 'nike', 'sleep', 'water', 'steps',
  ],
  social: [
    'wechat', 'whatsapp', 'telegram', 'messenger', 'discord', 'twitter',
    'facebook', 'instagram', 'weibo', 'mail', 'email', 'message',
  ],
  entertainment: [
    'music', 'spotify', 'apple music', 'netflix', 'movie', 'game',
    'steam', 'photos', 'camera', 'tiktok', 'douyin',
  ],
  finance: [
    'bank', 'finance', 'stock', 'trading', 'wallet', 'payment',
    'alipay', 'wechat pay', 'paypal',
  ],
};

/**
 * 活动总结器
 */
export class ActivitySummarizer extends EventEmitter {
  private config: ActivitySummarizerConfig;
  private database: HawkeyeDatabase;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastSummaryEndTime: number;

  constructor(
    database: HawkeyeDatabase,
    config: Partial<ActivitySummarizerConfig> = {}
  ) {
    super();
    this.database = database;
    this.config = { ...DEFAULT_SUMMARIZER_CONFIG, ...config };
    this.lastSummaryEndTime = Date.now();
  }

  /**
   * 启动自动总结
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // 获取最后一次总结的结束时间
    const lastSummary = this.database.getLatestActivitySummary();
    if (lastSummary) {
      this.lastSummaryEndTime = lastSummary.endTime;
    } else {
      this.lastSummaryEndTime = Date.now();
    }

    // 启动定时器
    this.intervalTimer = setInterval(() => {
      this.generateSummary();
    }, this.config.intervalMs);

    this.emit('started');
  }

  /**
   * 停止自动总结
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    this.emit('stopped');
  }

  /**
   * 手动触发生成总结
   */
  async generateSummary(): Promise<ActivitySummary | null> {
    const endTime = Date.now();
    const startTime = this.lastSummaryEndTime;

    // 获取时间范围内的行为事件
    const events = this.database.getBehaviorEvents({
      startTime,
      endTime,
      limit: 10000,
    });

    if (events.length < this.config.minEventCount) {
      this.emit('skipped', { reason: 'not enough events', count: events.length });
      return null;
    }

    // 生成总结
    const summary = this.analyzePeriod(events, startTime, endTime);

    // 保存到数据库
    const record: ActivitySummaryRecord = {
      id: summary.id,
      startTime: summary.startTime,
      endTime: summary.endTime,
      summaryText: summary.summaryText,
      appDistribution: JSON.stringify(summary.appDistribution),
      eventCounts: JSON.stringify(summary.eventCounts),
      dominantStage: summary.dominantStage,
      confidence: summary.confidence,
      keywords: JSON.stringify(summary.keywords),
      lifeTreeUpdated: false,
      createdAt: Date.now(),
    };

    this.database.saveActivitySummary(record);

    // 更新最后总结时间
    this.lastSummaryEndTime = endTime;

    // 发送事件
    this.emit('summaryGenerated', summary);

    return summary;
  }

  /**
   * 分析时间段内的活动
   */
  private analyzePeriod(
    events: Array<Record<string, unknown>>,
    startTime: number,
    endTime: number
  ): ActivitySummary {
    // 统计 app 使用分布
    const appCounts: Record<string, number> = {};
    const eventTypeCounts: Record<string, number> = {};
    const allApps: string[] = [];

    for (const event of events) {
      const app = (event.active_app as string) || 'unknown';
      const eventType = event.event_type as string;

      appCounts[app] = (appCounts[app] || 0) + 1;
      eventTypeCounts[eventType] = (eventTypeCounts[eventType] || 0) + 1;
      allApps.push(app.toLowerCase());
    }

    // 计算百分比
    const totalEvents = events.length;
    const appDistribution: AppDistribution = {};
    for (const [app, count] of Object.entries(appCounts)) {
      appDistribution[app] = Math.round((count / totalEvents) * 100);
    }

    // 推断主导阶段
    const dominantStage = this.inferDominantStage(allApps);

    // 提取关键词
    const keywords = this.extractKeywords(events);

    // 生成总结文本
    const summaryText = this.generateSummaryText(
      appDistribution,
      eventTypeCounts,
      dominantStage,
      startTime,
      endTime
    );

    // 计算置信度
    const confidence = Math.min(0.9, 0.3 + (events.length / 100) * 0.6);

    return {
      id: `summary_${startTime}_${endTime}`,
      startTime,
      endTime,
      summaryText,
      appDistribution,
      eventCounts: eventTypeCounts,
      dominantStage,
      confidence,
      keywords,
    };
  }

  /**
   * 推断主导阶段
   */
  private inferDominantStage(apps: string[]): string | undefined {
    const stageScores: Record<string, number> = {};

    for (const app of apps) {
      for (const [stage, keywords] of Object.entries(STAGE_MAPPINGS)) {
        for (const keyword of keywords) {
          if (app.includes(keyword)) {
            stageScores[stage] = (stageScores[stage] || 0) + 1;
          }
        }
      }
    }

    // 找出得分最高的阶段
    let maxScore = 0;
    let dominantStage: string | undefined;

    for (const [stage, score] of Object.entries(stageScores)) {
      if (score > maxScore) {
        maxScore = score;
        dominantStage = stage;
      }
    }

    return dominantStage;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(events: Array<Record<string, unknown>>): string[] {
    const keywords = new Set<string>();

    for (const event of events) {
      // 从窗口标题提取
      const windowTitle = event.window_title as string;
      if (windowTitle) {
        // 简单分词
        const words = windowTitle.split(/[\s\-_\/\\|:]+/).filter(w => w.length > 2);
        words.slice(0, 3).forEach(w => keywords.add(w));
      }

      // 从动作提取
      const action = event.action as string;
      if (action) {
        keywords.add(action);
      }
    }

    return Array.from(keywords).slice(0, 10);
  }

  /**
   * 生成总结文本
   */
  private generateSummaryText(
    appDistribution: AppDistribution,
    eventCounts: EventCounts,
    dominantStage: string | undefined,
    startTime: number,
    endTime: number
  ): string {
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    // 找出使用最多的 app
    const sortedApps = Object.entries(appDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const topApps = sortedApps.map(([app, pct]) => `${app} (${pct}%)`).join(', ');

    // 生成活动总结
    let summary = `过去 ${durationMinutes} 分钟`;

    if (dominantStage) {
      const stageNames: Record<string, string> = {
        career: '工作',
        learning: '学习',
        health: '健康',
        social: '社交',
        entertainment: '娱乐',
        finance: '理财',
      };
      summary += `主要在${stageNames[dominantStage] || dominantStage}`;
    }

    summary += `，使用了 ${topApps}`;

    // 添加事件统计
    const totalEvents = Object.values(eventCounts).reduce((a, b) => a + b, 0);
    summary += `。共记录 ${totalEvents} 个活动事件。`;

    return summary;
  }

  /**
   * 获取配置
   */
  getConfig(): ActivitySummarizerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ActivitySummarizerConfig>): void {
    this.config = { ...this.config, ...config };

    // 如果正在运行，重启以应用新的间隔
    if (this.isRunning && config.intervalMs) {
      this.stop();
      this.start();
    }

    this.emit('configUpdated', this.config);
  }

  /**
   * 获取最近的总结
   */
  getRecentSummaries(limit: number = 50): ActivitySummaryRecord[] {
    return this.database.getActivitySummaries(limit);
  }

  /**
   * 获取时间范围内的总结
   */
  getSummariesInRange(startTime: number, endTime: number): ActivitySummaryRecord[] {
    return this.database.getActivitySummariesInRange(startTime, endTime);
  }

  /**
   * 获取待更新生命树的总结
   */
  getPendingLifeTreeUpdates(): ActivitySummaryRecord[] {
    return this.database.getPendingLifeTreeUpdates();
  }

  /**
   * 标记总结已更新生命树
   */
  markLifeTreeUpdated(summaryId: string): void {
    this.database.markActivitySummaryLifeTreeUpdated(summaryId);
  }

  /**
   * 是否正在运行
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

/**
 * 创建活动总结器
 */
export function createActivitySummarizer(
  database: HawkeyeDatabase,
  config?: Partial<ActivitySummarizerConfig>
): ActivitySummarizer {
  return new ActivitySummarizer(database, config);
}
