/**
 * 行为追踪器
 * 整合事件收集、特征提取、模式识别和习惯学习的主入口
 */

import { EventEmitter } from 'events';
import {
  BehaviorEvent,
  BehaviorEventType,
  BehaviorTrackerConfig,
  DEFAULT_BEHAVIOR_CONFIG,
  TemporalPattern,
} from './types';
import { BehaviorEventCollector } from './event-collector';
import { FeatureExtractor, ExtractedFeatures } from './feature-extractor';
import { PatternRecognizer, RecognizedPattern } from './pattern-recognizer';
import { HabitLearner, HabitSuggestion, UserHabitProfile } from './habit-learner';

export interface BehaviorTrackerOptions {
  config?: Partial<BehaviorTrackerConfig>;
  onSuggestion?: (suggestion: HabitSuggestion) => void;
  onPatternDetected?: (pattern: RecognizedPattern) => void;
  persistEvents?: (events: BehaviorEvent[]) => Promise<void>;
  loadEvents?: () => Promise<BehaviorEvent[]>;
}

export class BehaviorTracker extends EventEmitter {
  private config: BehaviorTrackerConfig;
  private collector: BehaviorEventCollector;
  private extractor: FeatureExtractor;
  private recognizer: PatternRecognizer;
  private learner: HabitLearner;

  private events: BehaviorEvent[] = [];
  private features: ExtractedFeatures | null = null;
  private patterns: RecognizedPattern[] = [];
  private suggestions: HabitSuggestion[] = [];

  private analysisTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  private persistEvents?: (events: BehaviorEvent[]) => Promise<void>;
  private loadEvents?: () => Promise<BehaviorEvent[]>;

  constructor(options: BehaviorTrackerOptions = {}) {
    super();
    this.config = { ...DEFAULT_BEHAVIOR_CONFIG, ...options.config };

    // 初始化组件
    this.collector = new BehaviorEventCollector({
      config: this.config,
      onBatch: async (events) => {
        this.events.push(...events);
        if (this.persistEvents) {
          await this.persistEvents(events);
        }
      },
    });

    this.extractor = new FeatureExtractor();
    this.recognizer = new PatternRecognizer(this.config.habitLearning.patternDetection);
    this.learner = new HabitLearner(this.config.habitLearning);

    // 绑定回调
    if (options.onSuggestion) {
      this.on('suggestion', options.onSuggestion);
    }
    if (options.onPatternDetected) {
      this.on('pattern', options.onPatternDetected);
    }

    this.persistEvents = options.persistEvents;
    this.loadEvents = options.loadEvents;

    // 监听内部事件
    this.setupInternalListeners();
  }

  /**
   * 启动行为追踪
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // 加载历史事件
    if (this.loadEvents) {
      try {
        this.events = await this.loadEvents();
      } catch (error) {
        this.emit('error', error);
      }
    }

    // 启动事件收集器
    this.collector.start();

    // 启动定期分析
    this.analysisTimer = setInterval(() => {
      this.runAnalysis();
    }, 60000); // 每分钟分析一次

    // 立即运行一次分析
    this.runAnalysis();

    this.emit('started');
  }

  /**
   * 停止行为追踪
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    this.collector.stop();

    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }

    this.emit('stopped');
  }

  /**
   * 记录行为事件
   */
  recordEvent(
    eventType: BehaviorEventType,
    data: Partial<BehaviorEvent['data']>,
    environment?: Partial<BehaviorEvent['environment']>
  ): BehaviorEvent {
    const event = this.collector.recordEvent(eventType, data, environment);
    this.learner.processEvent(event);
    return event;
  }

  // ============ 便捷记录方法 ============

  recordAppSwitch(fromApp: string, toApp: string, windowTitle: string): BehaviorEvent {
    return this.collector.recordAppSwitch(fromApp, toApp, windowTitle);
  }

  recordWindowFocus(appName: string, windowTitle: string): BehaviorEvent {
    return this.collector.recordWindowFocus(appName, windowTitle);
  }

  recordFileOperation(
    operation: 'open' | 'save' | 'create' | 'delete' | 'move',
    filePath: string,
    context?: Record<string, unknown>
  ): BehaviorEvent {
    return this.collector.recordFileOperation(operation, filePath, context);
  }

  recordClipboardOperation(
    operation: 'copy' | 'paste',
    contentType: string,
    contentLength: number
  ): BehaviorEvent {
    return this.collector.recordClipboardOperation(operation, contentType, contentLength);
  }

  recordSuggestionInteraction(
    interaction: 'view' | 'accept' | 'reject' | 'modify',
    suggestionId: string,
    suggestionType: string,
    feedback?: { reason?: string; modifiedAction?: string }
  ): BehaviorEvent {
    return this.collector.recordSuggestionInteraction(
      interaction,
      suggestionId,
      suggestionType,
      feedback
    );
  }

  recordExecution(
    phase: 'start' | 'complete',
    executionId: string,
    result?: 'success' | 'failure' | 'cancelled',
    duration?: number
  ): BehaviorEvent {
    return this.collector.recordExecution(phase, executionId, result, duration);
  }

  recordBrowserAction(
    action: 'navigate' | 'search' | 'bookmark',
    url: string,
    title?: string
  ): BehaviorEvent {
    return this.collector.recordBrowserAction(action, url, title);
  }

  recordKeyboardShortcut(shortcut: string, appName: string): BehaviorEvent {
    return this.collector.recordKeyboardShortcut(shortcut, appName);
  }

  recordCommandExecution(
    command: string,
    result: 'success' | 'failure',
    duration: number
  ): BehaviorEvent {
    return this.collector.recordCommandExecution(command, result, duration);
  }

  // ============ 分析方法 ============

  /**
   * 运行完整分析
   */
  runAnalysis(): void {
    if (this.events.length === 0) return;

    try {
      // 提取特征
      this.features = this.extractor.extractFeatures(this.events);

      // 识别模式
      const newPatterns = this.recognizer.recognizePatterns(this.features, this.events);

      // 检查新模式
      for (const pattern of newPatterns) {
        if (!this.patterns.some((p) => p.id === pattern.id)) {
          this.patterns.push(pattern);
          this.emit('pattern', pattern);
        }
      }

      // 学习习惯并生成建议
      const newSuggestions = this.learner.learnFromPatterns(this.features, this.patterns);

      for (const suggestion of newSuggestions) {
        if (!this.suggestions.some((s) => s.id === suggestion.id)) {
          this.suggestions.push(suggestion);
          this.learner.recordSuggestionShown(suggestion.id);
          this.emit('suggestion', suggestion);
        }
      }

      this.emit('analysisComplete', {
        features: this.features,
        patterns: this.patterns,
        suggestions: this.suggestions,
      });
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * 获取当前特征
   */
  getFeatures(): ExtractedFeatures | null {
    return this.features;
  }

  /**
   * 获取识别的模式
   */
  getPatterns(): RecognizedPattern[] {
    return [...this.patterns];
  }

  /**
   * 获取时序模式（转换为 TemporalPattern 格式）
   */
  getTemporalPatterns(): TemporalPattern[] {
    return this.patterns
      .filter((p) => p.type === 'temporal')
      .map((p) => this.recognizer.toTemporalPattern(p as any));
  }

  /**
   * 获取建议
   */
  getSuggestions(): HabitSuggestion[] {
    return [...this.suggestions];
  }

  /**
   * 获取用户习惯档案
   */
  getUserProfile(): UserHabitProfile {
    return this.learner.getProfile();
  }

  /**
   * 记录用户反馈
   */
  recordFeedback(suggestionId: string, accepted: boolean): void {
    this.learner.recordFeedback(suggestionId, accepted);

    // 移除已处理的建议
    this.suggestions = this.suggestions.filter((s) => s.id !== suggestionId);
  }

  /**
   * 获取应用使用统计
   */
  getAppUsageStats(): Map<string, { totalTime: number; sessionCount: number }> {
    const stats = new Map<string, { totalTime: number; sessionCount: number }>();
    const profile = this.learner.getProfile();

    for (const [appName, habit] of profile.appUsageHabits.entries()) {
      stats.set(appName, {
        totalTime: habit.usage.totalDuration,
        sessionCount: habit.usage.sessionCount,
      });
    }

    return stats;
  }

  /**
   * 获取时间分布
   */
  getTimeDistribution(): { hourly: number[]; daily: number[] } {
    if (!this.features) {
      return {
        hourly: new Array(24).fill(0),
        daily: new Array(7).fill(0),
      };
    }

    return {
      hourly: [...this.features.frequencyFeatures.eventsPerHour],
      daily: [...this.features.frequencyFeatures.eventsPerDay],
    };
  }

  /**
   * 清除历史数据
   */
  clearHistory(olderThanDays?: number): number {
    const cutoff = olderThanDays
      ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000
      : 0;

    const originalLength = this.events.length;
    this.events = this.events.filter((e) => e.timestamp > cutoff);

    // 重新分析
    this.runAnalysis();

    return originalLength - this.events.length;
  }

  /**
   * 导出数据
   */
  exportData(): string {
    return JSON.stringify({
      events: this.events,
      patterns: this.patterns,
      profile: this.learner.exportHabits(),
      exportedAt: Date.now(),
    });
  }

  /**
   * 导入数据
   */
  importData(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.events = parsed.events || [];
      this.patterns = parsed.patterns || [];
      if (parsed.profile) {
        this.learner.importHabits(parsed.profile);
      }
      this.runAnalysis();
      this.emit('dataImported');
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<BehaviorTrackerConfig>): void {
    this.config = { ...this.config, ...config };
    this.collector.updateConfig(config);
    this.emit('configUpdated', this.config);
  }

  /**
   * 获取当前配置
   */
  getConfig(): BehaviorTrackerConfig {
    return { ...this.config };
  }

  // ============ 内部方法 ============

  private setupInternalListeners(): void {
    this.collector.on('event', (event: BehaviorEvent) => {
      this.learner.processEvent(event);
      this.emit('event', event);
    });

    this.collector.on('error', (error) => {
      this.emit('error', error);
    });

    this.learner.on('profileUpdated', (profile) => {
      this.emit('profileUpdated', profile);
    });

    this.learner.on('error', (error) => {
      this.emit('error', error);
    });
  }
}

// 导出便捷创建函数
export function createBehaviorTracker(
  options?: BehaviorTrackerOptions
): BehaviorTracker {
  return new BehaviorTracker(options);
}
