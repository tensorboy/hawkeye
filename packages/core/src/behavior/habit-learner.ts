/**
 * 习惯学习器
 * 从模式中学习用户习惯，生成个性化建议
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  BehaviorEvent,
  AppUsageHabit,
  FileOrganizationHabit,
  HabitLearningConfig,
  DEFAULT_BEHAVIOR_CONFIG,
} from './types';
import { ExtractedFeatures } from './feature-extractor';
import { RecognizedPattern, TemporalPatternResult } from './pattern-recognizer';

// ============ 习惯类型定义 ============

export interface WorkflowHabit {
  id: string;
  name: string;
  description: string;

  /** 触发条件 */
  trigger: {
    type: 'time' | 'app' | 'event' | 'manual';
    condition: Record<string, unknown>;
  };

  /** 动作序列 */
  actions: Array<{
    type: string;
    params: Record<string, unknown>;
    order: number;
  }>;

  /** 学习统计 */
  statistics: {
    learnedAt: number;
    lastTriggered?: number;
    triggerCount: number;
    acceptRate: number;
    confidence: number;
  };
}

export interface UserHabitProfile {
  userId: string;
  createdAt: number;
  updatedAt: number;

  /** 应用使用习惯 */
  appUsageHabits: Map<string, AppUsageHabit>;

  /** 文件组织习惯 */
  fileOrganizationHabit: FileOrganizationHabit;

  /** 工作流习惯 */
  workflowHabits: WorkflowHabit[];

  /** 时间偏好 */
  timePreferences: {
    preferredWorkHours: { start: number; end: number };
    mostProductiveHours: number[];
    breakPatterns: Array<{
      afterMinutes: number;
      durationMinutes: number;
    }>;
  };

  /** 通用偏好 */
  generalPreferences: {
    notificationTiming: 'immediate' | 'batched' | 'quiet';
    automationLevel: 'conservative' | 'moderate' | 'aggressive';
    suggestionFrequency: 'low' | 'medium' | 'high';
  };
}

export interface HabitSuggestion {
  id: string;
  type: 'automation' | 'optimization' | 'reminder' | 'workflow';
  title: string;
  description: string;
  confidence: number;
  basedOn: string[];
  actions?: Array<{
    type: string;
    params: Record<string, unknown>;
  }>;
  createdAt: number;
}

// ============ 习惯学习器实现 ============

export class HabitLearner extends EventEmitter {
  private config: HabitLearningConfig;
  private profile: UserHabitProfile;
  private eventHistory: BehaviorEvent[] = [];
  private suggestionCooldowns: Map<string, number> = new Map();

  constructor(config?: Partial<HabitLearningConfig>) {
    super();
    this.config = { ...DEFAULT_BEHAVIOR_CONFIG.habitLearning, ...config };
    this.profile = this.createEmptyProfile();
  }

  /**
   * 处理新的行为事件
   */
  processEvent(event: BehaviorEvent): void {
    this.eventHistory.push(event);

    // 限制历史记录大小
    const maxHistory = this.config.privacy.dataRetentionDays * 24 * 60; // 假设每分钟一个事件
    if (this.eventHistory.length > maxHistory) {
      this.eventHistory = this.eventHistory.slice(-maxHistory);
    }

    // 更新应用使用习惯
    this.updateAppUsageHabit(event);

    // 更新文件组织习惯
    if (this.isFileEvent(event)) {
      this.updateFileOrganizationHabit(event);
    }

    this.profile.updatedAt = Date.now();
    this.emit('profileUpdated', this.profile);
  }

  /**
   * 从特征和模式中学习习惯
   */
  learnFromPatterns(features: ExtractedFeatures, patterns: RecognizedPattern[]): HabitSuggestion[] {
    const suggestions: HabitSuggestion[] = [];

    // 学习时间偏好
    this.learnTimePreferences(features);

    // 从模式中学习工作流
    for (const pattern of patterns) {
      if (pattern.type === 'temporal' && pattern.confidence >= this.config.learning.confidenceThreshold) {
        const workflowHabit = this.createWorkflowFromPattern(pattern as TemporalPatternResult);
        if (workflowHabit && !this.hasExistingWorkflow(workflowHabit)) {
          this.profile.workflowHabits.push(workflowHabit);
        }
      }

      // 生成自动化建议
      if (this.config.automationSuggestion.enabled &&
          pattern.confidence >= this.config.automationSuggestion.minConfidence &&
          pattern.occurrences >= this.config.automationSuggestion.minFrequency) {
        const suggestion = this.createSuggestionFromPattern(pattern);
        if (suggestion && !this.isOnCooldown(suggestion.id)) {
          suggestions.push(suggestion);
        }
      }
    }

    // 分析应用使用模式生成优化建议
    const optimizationSuggestions = this.generateOptimizationSuggestions(features);
    suggestions.push(...optimizationSuggestions);

    return suggestions;
  }

  /**
   * 更新应用使用习惯
   */
  private updateAppUsageHabit(event: BehaviorEvent): void {
    const appName = event.environment.activeApp;

    if (!this.profile.appUsageHabits.has(appName)) {
      this.profile.appUsageHabits.set(appName, this.createEmptyAppHabit(appName));
    }

    const habit = this.profile.appUsageHabits.get(appName)!;
    const hour = new Date(event.timestamp).getHours();
    const day = new Date(event.timestamp).getDay();

    // 更新使用统计
    habit.usage.lastUsed = event.timestamp;
    habit.usage.sessionCount++;
    habit.usage.hourlyDistribution[hour]++;
    habit.usage.weeklyDistribution[day]++;

    // 计算平均会话时长 (简化处理)
    if (event.data.duration) {
      habit.usage.totalDuration += event.data.duration;
      habit.usage.averageSessionDuration =
        habit.usage.totalDuration / habit.usage.sessionCount;
    }
  }

  /**
   * 更新文件组织习惯
   */
  private updateFileOrganizationHabit(event: BehaviorEvent): void {
    const filePath = event.data.target;
    const ext = this.getFileExtension(filePath);
    const dir = this.getDirectoryPath(filePath);

    if (ext && dir) {
      // 更新目录偏好
      const existingPref = this.profile.fileOrganizationHabit.directoryPreferences.find(
        (p) => p.fileType === ext
      );

      if (existingPref) {
        if (existingPref.preferredPath === dir) {
          existingPref.confidence = Math.min(existingPref.confidence + 0.1, 1);
        } else {
          existingPref.confidence *= 0.9;
          if (existingPref.confidence < 0.3) {
            existingPref.preferredPath = dir;
            existingPref.confidence = 0.5;
          }
        }
        if (!existingPref.exampleFiles.includes(filePath)) {
          existingPref.exampleFiles.push(filePath);
          if (existingPref.exampleFiles.length > 10) {
            existingPref.exampleFiles.shift();
          }
        }
      } else {
        this.profile.fileOrganizationHabit.directoryPreferences.push({
          fileType: ext,
          preferredPath: dir,
          confidence: 0.5,
          exampleFiles: [filePath],
        });
      }
    }
  }

  /**
   * 学习时间偏好
   */
  private learnTimePreferences(features: ExtractedFeatures): void {
    const hourlyDist = features.frequencyFeatures.eventsPerHour;
    const total = hourlyDist.reduce((a, b) => a + b, 0);

    if (total === 0) return;

    // 找到工作时间段
    const threshold = total / 24 * 0.5; // 平均值的50%作为阈值
    let workStart = 24;
    let workEnd = 0;

    for (let hour = 0; hour < 24; hour++) {
      if (hourlyDist[hour] > threshold) {
        workStart = Math.min(workStart, hour);
        workEnd = Math.max(workEnd, hour);
      }
    }

    if (workStart < workEnd) {
      this.profile.timePreferences.preferredWorkHours = {
        start: workStart,
        end: workEnd + 1,
      };
    }

    // 找到最高效时段 (前3个最活跃的小时)
    const sortedHours = hourlyDist
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((h) => h.hour);

    this.profile.timePreferences.mostProductiveHours = sortedHours;
  }

  /**
   * 从模式创建工作流习惯
   */
  private createWorkflowFromPattern(pattern: TemporalPatternResult): WorkflowHabit | null {
    if (!pattern.details.actionSequence || pattern.details.actionSequence.length === 0) {
      return null;
    }

    return {
      id: uuidv4(),
      name: pattern.name,
      description: pattern.description,
      trigger: {
        type: pattern.details.patternType === 'event_triggered' ? 'event' : 'time',
        condition: pattern.details.schedule || {},
      },
      actions: pattern.details.actionSequence.map((action, index) => ({
        type: action,
        params: {},
        order: index,
      })),
      statistics: {
        learnedAt: Date.now(),
        triggerCount: pattern.occurrences,
        acceptRate: 1,
        confidence: pattern.confidence,
      },
    };
  }

  /**
   * 从模式创建建议
   */
  private createSuggestionFromPattern(pattern: RecognizedPattern): HabitSuggestion | null {
    const suggestionId = `suggestion-${pattern.type}-${pattern.name}`;

    switch (pattern.type) {
      case 'temporal':
        return {
          id: suggestionId,
          type: 'automation',
          title: `Automate: ${pattern.name}`,
          description: `Based on your pattern, we can automate this task. ${pattern.description}`,
          confidence: pattern.confidence,
          basedOn: [pattern.id],
          actions: (pattern as TemporalPatternResult).details.actionSequence?.map((action) => ({
            type: action,
            params: {},
          })),
          createdAt: Date.now(),
        };

      case 'sequence':
        return {
          id: suggestionId,
          type: 'workflow',
          title: `Create Workflow: ${pattern.name}`,
          description: `You often perform this sequence. Would you like to create a one-click workflow?`,
          confidence: pattern.confidence,
          basedOn: [pattern.id],
          createdAt: Date.now(),
        };

      case 'association':
        return {
          id: suggestionId,
          type: 'optimization',
          title: `App Association: ${pattern.name}`,
          description: pattern.description,
          confidence: pattern.confidence,
          basedOn: [pattern.id],
          createdAt: Date.now(),
        };

      default:
        return null;
    }
  }

  /**
   * 生成优化建议
   */
  private generateOptimizationSuggestions(features: ExtractedFeatures): HabitSuggestion[] {
    const suggestions: HabitSuggestion[] = [];

    // 检查分散注意力的应用切换
    const appSwitchPatterns = features.sequenceFeatures.appSwitchPatterns;
    const frequentSwitches = appSwitchPatterns.filter((p) => p.count > 10);

    if (frequentSwitches.length > 5) {
      suggestions.push({
        id: `suggestion-focus-mode`,
        type: 'optimization',
        title: 'Enable Focus Mode',
        description: `You switch between ${frequentSwitches.length} app pairs frequently. Consider using focus mode to reduce context switching.`,
        confidence: 0.7,
        basedOn: frequentSwitches.map((p) => `${p.from}->${p.to}`),
        createdAt: Date.now(),
      });
    }

    // 检查深夜工作
    const lateNightEvents = features.frequencyFeatures.eventsPerHour
      .slice(0, 6)
      .reduce((a, b) => a + b, 0);
    const totalEvents = features.frequencyFeatures.totalEvents;

    if (lateNightEvents > totalEvents * 0.1) {
      suggestions.push({
        id: `suggestion-sleep-reminder`,
        type: 'reminder',
        title: 'Late Night Work Detected',
        description: `${Math.round(lateNightEvents / totalEvents * 100)}% of your activity is during late hours (0-6 AM). Consider setting a wind-down reminder.`,
        confidence: 0.8,
        basedOn: ['late-night-pattern'],
        createdAt: Date.now(),
      });
    }

    return suggestions;
  }

  /**
   * 检查是否已有相似工作流
   */
  private hasExistingWorkflow(workflow: WorkflowHabit): boolean {
    return this.profile.workflowHabits.some((w) => w.name === workflow.name);
  }

  /**
   * 检查建议是否在冷却期
   */
  private isOnCooldown(suggestionId: string): boolean {
    const lastSuggested = this.suggestionCooldowns.get(suggestionId);
    if (!lastSuggested) return false;

    const cooldownMs = this.config.automationSuggestion.cooldownHours * 60 * 60 * 1000;
    return Date.now() - lastSuggested < cooldownMs;
  }

  /**
   * 记录建议被展示
   */
  recordSuggestionShown(suggestionId: string): void {
    this.suggestionCooldowns.set(suggestionId, Date.now());
  }

  /**
   * 记录用户反馈
   */
  recordFeedback(suggestionId: string, accepted: boolean, workflowId?: string): void {
    if (workflowId && accepted) {
      const workflow = this.profile.workflowHabits.find((w) => w.id === workflowId);
      if (workflow) {
        workflow.statistics.triggerCount++;
        workflow.statistics.acceptRate =
          (workflow.statistics.acceptRate * (workflow.statistics.triggerCount - 1) +
            (accepted ? 1 : 0)) /
          workflow.statistics.triggerCount;
      }
    }

    this.emit('feedback', { suggestionId, accepted, workflowId });
  }

  /**
   * 获取用户习惯档案
   */
  getProfile(): UserHabitProfile {
    return { ...this.profile };
  }

  /**
   * 导出习惯数据
   */
  exportHabits(): string {
    return JSON.stringify({
      profile: this.serializeProfile(this.profile),
      exportedAt: Date.now(),
    });
  }

  /**
   * 导入习惯数据
   */
  importHabits(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.profile = this.deserializeProfile(parsed.profile);
      this.emit('profileImported', this.profile);
    } catch (error) {
      this.emit('error', error);
    }
  }

  // ============ 辅助方法 ============

  private createEmptyProfile(): UserHabitProfile {
    return {
      userId: uuidv4(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      appUsageHabits: new Map(),
      fileOrganizationHabit: {
        directoryPreferences: [],
        organizationPatterns: [],
        namingConventions: [],
        cleanupHabits: {},
      },
      workflowHabits: [],
      timePreferences: {
        preferredWorkHours: { start: 9, end: 18 },
        mostProductiveHours: [10, 14, 16],
        breakPatterns: [],
      },
      generalPreferences: {
        notificationTiming: 'batched',
        automationLevel: 'moderate',
        suggestionFrequency: 'medium',
      },
    };
  }

  private createEmptyAppHabit(appName: string): AppUsageHabit {
    return {
      appId: appName.toLowerCase().replace(/\s+/g, '-'),
      appName,
      usage: {
        totalDuration: 0,
        averageSessionDuration: 0,
        sessionCount: 0,
        lastUsed: Date.now(),
        hourlyDistribution: new Array(24).fill(0),
        weeklyDistribution: new Array(7).fill(0),
      },
      context: {
        frequentCompanions: [],
        commonWorkflows: [],
        fileTypeAssociations: [],
      },
      preferences: {
        commonKeyboardShortcuts: [],
      },
    };
  }

  private isFileEvent(event: BehaviorEvent): boolean {
    return [
      'FILE_OPEN',
      'FILE_SAVE',
      'FILE_CREATE',
      'FILE_DELETE',
      'FILE_MOVE',
    ].includes(event.eventType);
  }

  private getFileExtension(filePath: string): string | null {
    const match = filePath.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : null;
  }

  private getDirectoryPath(filePath: string): string | null {
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return lastSlash > 0 ? filePath.substring(0, lastSlash) : null;
  }

  private serializeProfile(profile: UserHabitProfile): Record<string, unknown> {
    return {
      ...profile,
      appUsageHabits: Array.from(profile.appUsageHabits.entries()),
    };
  }

  private deserializeProfile(data: Record<string, unknown>): UserHabitProfile {
    const profile = data as unknown as UserHabitProfile;
    profile.appUsageHabits = new Map(data.appUsageHabits as [string, AppUsageHabit][]);
    return profile;
  }
}
