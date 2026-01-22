/**
 * Pattern Detector - 行为模式检测器
 *
 * 检测用户行为的重复模式、时间规律和上下文关联
 * 为 AutoSuggestEngine 提供模式数据支持
 */

import { EventEmitter } from 'events';
import type {
  RecordedAction,
  BehaviorPattern,
  PatternMatch,
  PatternType,
  PatternDetectorConfig,
} from './types';
import { DEFAULT_PATTERN_DETECTOR_CONFIG } from './types';
import type { ExtendedPerceptionContext } from '../perception/engine';

// ============ 辅助函数 ============

function generateId(): string {
  return `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getTimeOfDay(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function actionsMatch(a: RecordedAction, b: RecordedAction): boolean {
  if (a.type !== b.type) return false;

  // 比较关键参数
  const aParams = JSON.stringify(a.params);
  const bParams = JSON.stringify(b.params);
  return aParams === bParams;
}

function calculateSimilarity(seq1: RecordedAction[], seq2: RecordedAction[]): number {
  if (seq1.length !== seq2.length) return 0;

  let matches = 0;
  for (let i = 0; i < seq1.length; i++) {
    if (actionsMatch(seq1[i], seq2[i])) {
      matches++;
    }
  }
  return matches / seq1.length;
}

// ============ PatternDetector 类 ============

export class PatternDetector extends EventEmitter {
  private config: PatternDetectorConfig;
  private observations: RecordedAction[] = [];
  private patterns: Map<string, BehaviorPattern> = new Map();
  private lastPatternCheck: number = 0;
  private patternCheckInterval: number = 5000; // 5秒检查一次

  constructor(config: Partial<PatternDetectorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_PATTERN_DETECTOR_CONFIG, ...config };
  }

  /**
   * 添加新的观察记录
   */
  addObservation(action: RecordedAction): void {
    if (!this.config.enabled) return;

    this.observations.push(action);

    // 限制观察数量
    if (this.observations.length > this.config.maxObservations) {
      this.observations = this.observations.slice(-this.config.maxObservations);
    }

    // 定期检测模式
    const now = Date.now();
    if (now - this.lastPatternCheck > this.patternCheckInterval) {
      this.detectPatterns();
      this.lastPatternCheck = now;
    }

    this.emit('observation:added', action);
  }

  /**
   * 从感知上下文创建观察记录
   */
  createObservationFromContext(
    actionType: string,
    params: Record<string, unknown>,
    context: ExtendedPerceptionContext,
    result?: { success: boolean; duration: number }
  ): RecordedAction {
    const observation: RecordedAction = {
      id: generateId(),
      timestamp: Date.now(),
      type: actionType,
      params,
      context: {
        appName: context.activeWindow?.appName,
        windowTitle: context.activeWindow?.title,
      },
      result,
    };

    this.addObservation(observation);
    return observation;
  }

  /**
   * 检测所有模式
   */
  detectPatterns(): BehaviorPattern[] {
    const detectedPatterns: BehaviorPattern[] = [];

    // 1. 检测序列模式
    const sequencePatterns = this.detectSequencePatterns();
    detectedPatterns.push(...sequencePatterns);

    // 2. 检测时间模式
    const timePatterns = this.detectTimePatterns();
    detectedPatterns.push(...timePatterns);

    // 3. 检测上下文模式
    const contextPatterns = this.detectContextPatterns();
    detectedPatterns.push(...contextPatterns);

    // 更新模式存储
    for (const pattern of detectedPatterns) {
      const existing = this.findSimilarPattern(pattern);
      if (existing) {
        // 更新现有模式
        existing.frequency++;
        existing.lastOccurrence = Date.now();
        existing.confidence = Math.min(1, existing.confidence + 0.1);
      } else {
        // 添加新模式
        this.patterns.set(pattern.id, pattern);
        this.emit('pattern:detected', pattern);
      }
    }

    // 清理过期模式
    this.cleanupExpiredPatterns();

    return Array.from(this.patterns.values());
  }

  /**
   * 检测序列模式 (连续的动作序列)
   */
  private detectSequencePatterns(): BehaviorPattern[] {
    const patterns: BehaviorPattern[] = [];
    const { minPatternLength, maxPatternLength, minOccurrences } = this.config;

    // 滑动窗口检测重复序列
    for (let len = minPatternLength; len <= maxPatternLength; len++) {
      const sequenceCounts = new Map<string, { actions: RecordedAction[]; count: number; timestamps: number[] }>();

      for (let i = 0; i <= this.observations.length - len; i++) {
        const sequence = this.observations.slice(i, i + len);
        const key = sequence.map(a => `${a.type}:${JSON.stringify(a.params)}`).join('|');

        if (sequenceCounts.has(key)) {
          const entry = sequenceCounts.get(key)!;
          entry.count++;
          entry.timestamps.push(sequence[0].timestamp);
        } else {
          sequenceCounts.set(key, {
            actions: sequence,
            count: 1,
            timestamps: [sequence[0].timestamp],
          });
        }
      }

      // 筛选出频繁序列
      for (const [, data] of sequenceCounts) {
        if (data.count >= minOccurrences) {
          const intervals = [];
          for (let i = 1; i < data.timestamps.length; i++) {
            intervals.push(data.timestamps[i] - data.timestamps[i - 1]);
          }
          const avgInterval = intervals.length > 0
            ? intervals.reduce((a, b) => a + b, 0) / intervals.length
            : 0;

          patterns.push({
            id: generateId(),
            type: 'sequence',
            name: `Sequence: ${data.actions.map(a => a.type).join(' → ')}`,
            description: `检测到 ${data.count} 次重复的动作序列`,
            actions: data.actions,
            frequency: data.count,
            avgInterval,
            lastOccurrence: data.timestamps[data.timestamps.length - 1],
            confidence: Math.min(1, data.count / 10),
            contexts: this.extractContexts(data.actions),
          });
        }
      }
    }

    return patterns;
  }

  /**
   * 检测时间模式 (特定时间的动作)
   */
  private detectTimePatterns(): BehaviorPattern[] {
    const patterns: BehaviorPattern[] = [];
    const timeGroups = new Map<string, RecordedAction[]>();

    // 按时间段分组
    for (const action of this.observations) {
      const date = new Date(action.timestamp);
      const timeOfDay = getTimeOfDay(date);
      const dayOfWeek = date.getDay();
      const key = `${timeOfDay}-${dayOfWeek}-${action.type}`;

      if (!timeGroups.has(key)) {
        timeGroups.set(key, []);
      }
      timeGroups.get(key)!.push(action);
    }

    // 检测频繁的时间模式
    for (const [key, actions] of timeGroups) {
      if (actions.length >= this.config.minOccurrences) {
        const [timeOfDay, dayOfWeek, actionType] = key.split('-');
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const timeNames = { morning: '上午', afternoon: '下午', evening: '傍晚', night: '晚上' };

        patterns.push({
          id: generateId(),
          type: 'time_based',
          name: `Time: ${dayNames[parseInt(dayOfWeek)]} ${timeNames[timeOfDay as keyof typeof timeNames]} - ${actionType}`,
          description: `你通常在${dayNames[parseInt(dayOfWeek)]}${timeNames[timeOfDay as keyof typeof timeNames]}执行此操作`,
          actions: actions.slice(-3),  // 只保留最近 3 次
          frequency: actions.length,
          avgInterval: 24 * 60 * 60 * 1000,  // 约 1 天
          lastOccurrence: actions[actions.length - 1].timestamp,
          confidence: Math.min(1, actions.length / 5),
          contexts: [{
            timeOfDay: timeOfDay as 'morning' | 'afternoon' | 'evening' | 'night',
            dayOfWeek: parseInt(dayOfWeek),
          }],
        });
      }
    }

    return patterns;
  }

  /**
   * 检测上下文模式 (特定应用/窗口的动作)
   */
  private detectContextPatterns(): BehaviorPattern[] {
    const patterns: BehaviorPattern[] = [];
    const contextGroups = new Map<string, RecordedAction[]>();

    // 按应用上下文分组
    for (const action of this.observations) {
      if (action.context.appName) {
        const key = `${action.context.appName}-${action.type}`;
        if (!contextGroups.has(key)) {
          contextGroups.set(key, []);
        }
        contextGroups.get(key)!.push(action);
      }
    }

    // 检测频繁的上下文模式
    for (const [key, actions] of contextGroups) {
      if (actions.length >= this.config.minOccurrences) {
        const [appName, actionType] = key.split('-');

        patterns.push({
          id: generateId(),
          type: 'context_based',
          name: `Context: ${appName} - ${actionType}`,
          description: `在 ${appName} 中你经常执行 ${actionType}`,
          actions: actions.slice(-3),
          frequency: actions.length,
          avgInterval: this.calculateAvgInterval(actions),
          lastOccurrence: actions[actions.length - 1].timestamp,
          confidence: Math.min(1, actions.length / 5),
          contexts: [{ appName }],
        });
      }
    }

    return patterns;
  }

  /**
   * 根据当前上下文获取匹配的模式
   */
  getPatternForContext(context: ExtendedPerceptionContext): PatternMatch | null {
    const now = Date.now();
    const currentTimeOfDay = getTimeOfDay(new Date());
    const currentDayOfWeek = new Date().getDay();
    const currentApp = context.activeWindow?.appName;

    let bestMatch: PatternMatch | null = null;
    let bestScore = 0;

    for (const pattern of this.patterns.values()) {
      let score = 0;

      // 检查模式是否过期
      if (now - pattern.lastOccurrence > this.config.patternTTL) {
        continue;
      }

      // 计算匹配分数
      for (const ctx of pattern.contexts) {
        if (ctx.appName && ctx.appName === currentApp) {
          score += 0.4;
        }
        if (ctx.timeOfDay && ctx.timeOfDay === currentTimeOfDay) {
          score += 0.3;
        }
        if (ctx.dayOfWeek !== undefined && ctx.dayOfWeek === currentDayOfWeek) {
          score += 0.2;
        }
      }

      // 考虑模式置信度
      score *= pattern.confidence;

      // 考虑模式新鲜度
      const hoursSinceLastOccurrence = (now - pattern.lastOccurrence) / (1000 * 60 * 60);
      const freshnessBonus = Math.max(0, 1 - hoursSinceLastOccurrence / 24);
      score += freshnessBonus * 0.1;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          pattern,
          matchScore: score,
          predictedNextActions: pattern.actions.map(a => ({
            id: generateId(),
            description: a.type,
            actionType: a.type as any,
            params: a.params,
            riskLevel: 'low' as const,
            reversible: false,
          })),
        };
      }
    }

    return bestMatch;
  }

  /**
   * 获取所有模式
   */
  getAllPatterns(): BehaviorPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * 获取最近的观察记录
   */
  getRecentObservations(limit: number = 10): RecordedAction[] {
    return this.observations.slice(-limit);
  }

  /**
   * 检测重复动作
   */
  detectRepetition(threshold: number = 3): RecordedAction | null {
    if (this.observations.length < threshold) return null;

    const recent = this.observations.slice(-threshold);
    const first = recent[0];

    // 检查最近的动作是否都相同
    const allSame = recent.every(a => actionsMatch(a, first));
    if (allSame) {
      return first;
    }

    return null;
  }

  /**
   * 导出模式
   */
  exportPatterns(): BehaviorPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * 导入模式
   */
  importPatterns(patterns: BehaviorPattern[]): void {
    for (const pattern of patterns) {
      this.patterns.set(pattern.id, pattern);
    }
    this.emit('patterns:imported', patterns.length);
  }

  /**
   * 清除所有数据
   */
  clear(): void {
    this.observations = [];
    this.patterns.clear();
    this.emit('cleared');
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PatternDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    observationCount: number;
    patternCount: number;
    patternTypes: Record<PatternType, number>;
  } {
    const patternTypes: Record<PatternType, number> = {
      sequence: 0,
      time_based: 0,
      context_based: 0,
      frequency: 0,
    };

    for (const pattern of this.patterns.values()) {
      patternTypes[pattern.type]++;
    }

    return {
      observationCount: this.observations.length,
      patternCount: this.patterns.size,
      patternTypes,
    };
  }

  // ============ 私有辅助方法 ============

  private findSimilarPattern(newPattern: BehaviorPattern): BehaviorPattern | null {
    for (const existing of this.patterns.values()) {
      if (existing.type !== newPattern.type) continue;

      const similarity = calculateSimilarity(existing.actions, newPattern.actions);
      if (similarity > 0.8) {
        return existing;
      }
    }
    return null;
  }

  private extractContexts(actions: RecordedAction[]): BehaviorPattern['contexts'] {
    const contexts: BehaviorPattern['contexts'] = [];
    const seenApps = new Set<string>();

    for (const action of actions) {
      if (action.context.appName && !seenApps.has(action.context.appName)) {
        seenApps.add(action.context.appName);
        contexts.push({ appName: action.context.appName });
      }
    }

    return contexts;
  }

  private calculateAvgInterval(actions: RecordedAction[]): number {
    if (actions.length < 2) return 0;

    let totalInterval = 0;
    for (let i = 1; i < actions.length; i++) {
      totalInterval += actions[i].timestamp - actions[i - 1].timestamp;
    }
    return totalInterval / (actions.length - 1);
  }

  private cleanupExpiredPatterns(): void {
    const now = Date.now();
    const ttl = this.config.patternTTL;

    for (const [id, pattern] of this.patterns) {
      if (now - pattern.lastOccurrence > ttl) {
        this.patterns.delete(id);
        this.emit('pattern:expired', pattern);
      }
    }
  }
}

// ============ 工厂函数 ============

export function createPatternDetector(config?: Partial<PatternDetectorConfig>): PatternDetector {
  return new PatternDetector(config);
}
