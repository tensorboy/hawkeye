/**
 * 程序性记忆管理器
 * Procedural Memory Manager
 *
 * 存储用户的行为模式和工作流程，支持自动化
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  ProceduralMemory,
  RecordedAction,
  TriggerCondition,
  TriggerType,
  WorkflowConfig,
  ProceduralMemoryConfig,
  DEFAULT_PROCEDURAL_CONFIG,
} from './types';

/**
 * 程序性记忆事件
 */
export interface ProceduralMemoryEvents {
  'pattern:detected': (pattern: ProceduralMemory) => void;
  'pattern:updated': (pattern: ProceduralMemory) => void;
  'pattern:removed': (id: string) => void;
  'pattern:triggered': (pattern: ProceduralMemory, context: Record<string, unknown>) => void;
  'automation:enabled': (pattern: ProceduralMemory) => void;
  'automation:disabled': (patternId: string) => void;
}

/**
 * 动作序列相似度结果
 */
interface SimilarityResult {
  patternId: string;
  similarity: number;
}

/**
 * 程序性记忆管理器
 */
export class ProceduralMemoryManager extends EventEmitter {
  private patterns: Map<string, ProceduralMemory> = new Map();
  private config: ProceduralMemoryConfig;

  // 动作历史缓冲区（用于模式检测）
  private actionBuffer: RecordedAction[] = [];
  private bufferMaxSize = 100;

  // 触发器索引
  private triggerIndex: Map<TriggerType, Set<string>> = new Map();

  constructor(config?: Partial<ProceduralMemoryConfig>) {
    super();
    this.config = { ...DEFAULT_PROCEDURAL_CONFIG, ...config };

    // 初始化触发器索引
    for (const type of ['time', 'event', 'context', 'sequence'] as TriggerType[]) {
      this.triggerIndex.set(type, new Set());
    }
  }

  /**
   * 记录动作
   */
  recordAction(action: RecordedAction): void {
    this.actionBuffer.push(action);

    // 限制缓冲区大小
    if (this.actionBuffer.length > this.bufferMaxSize) {
      this.actionBuffer.shift();
    }

    // 检测模式
    if (this.config.patternDetectionEnabled) {
      this.detectPatterns();
    }
  }

  /**
   * 检测模式
   */
  private detectPatterns(): void {
    if (this.actionBuffer.length < 3) return;

    // 提取最近的动作序列
    const recentSequence = this.actionBuffer.slice(-10);

    // 检查是否与现有模式匹配
    for (const pattern of this.patterns.values()) {
      const similarity = this.calculateSequenceSimilarity(
        recentSequence,
        pattern.pattern.actionSequence
      );

      if (similarity >= this.config.patternSimilarityThreshold) {
        // 更新现有模式
        this.updatePatternOccurrence(pattern, recentSequence);
        return;
      }
    }

    // 检查缓冲区中是否有重复的序列
    const repeatedSequence = this.findRepeatedSequence();
    if (repeatedSequence && repeatedSequence.occurrences >= this.config.minOccurrences) {
      // 创建新模式
      this.createPattern(repeatedSequence.sequence, repeatedSequence.occurrences);
    }
  }

  /**
   * 查找重复的动作序列
   */
  private findRepeatedSequence(): { sequence: RecordedAction[]; occurrences: number } | null {
    const minLength = 2;
    const maxLength = 10;
    const occurrenceThreshold = this.config.minOccurrences;

    // 尝试不同长度的序列
    for (let length = maxLength; length >= minLength; length--) {
      // 提取候选序列
      const candidates = new Map<string, { sequence: RecordedAction[]; count: number }>();

      for (let i = 0; i <= this.actionBuffer.length - length; i++) {
        const sequence = this.actionBuffer.slice(i, i + length);
        const signature = this.getSequenceSignature(sequence);

        const existing = candidates.get(signature);
        if (existing) {
          existing.count++;
        } else {
          candidates.set(signature, { sequence, count: 1 });
        }
      }

      // 查找满足阈值的序列
      for (const { sequence, count } of candidates.values()) {
        if (count >= occurrenceThreshold) {
          return { sequence, occurrences: count };
        }
      }
    }

    return null;
  }

  /**
   * 创建模式
   */
  createPattern(
    actionSequence: RecordedAction[],
    initialOccurrences: number = 1
  ): ProceduralMemory {
    const now = Date.now();

    // 自动生成名称
    const name = this.generatePatternName(actionSequence);

    // 推断触发条件
    const triggerConditions = this.inferTriggerConditions(actionSequence);

    const pattern: ProceduralMemory = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      pattern: {
        name,
        description: `自动检测的操作模式: ${name}`,
        triggerConditions,
        actionSequence: [...actionSequence],
      },
      statistics: {
        occurrenceCount: initialOccurrences,
        successRate: 1.0,
        averageDuration: this.calculateAverageDuration(actionSequence),
        lastOccurrence: now,
        firstOccurrence: now,
      },
      variants: [],
      automation: {
        isAutomated: false,
      },
    };

    // 检查最大模式数
    if (this.patterns.size >= this.config.maxPatterns) {
      this.removeLowestOccurrencePattern();
    }

    this.patterns.set(pattern.id, pattern);
    this.addToTriggerIndex(pattern);

    this.emit('pattern:detected', pattern);
    return pattern;
  }

  /**
   * 更新模式出现次数
   */
  private updatePatternOccurrence(
    pattern: ProceduralMemory,
    currentSequence: RecordedAction[]
  ): void {
    const now = Date.now();

    pattern.statistics.occurrenceCount++;
    pattern.statistics.lastOccurrence = now;

    // 更新平均时长
    const currentDuration = this.calculateAverageDuration(currentSequence);
    pattern.statistics.averageDuration =
      (pattern.statistics.averageDuration * (pattern.statistics.occurrenceCount - 1) +
        currentDuration) /
      pattern.statistics.occurrenceCount;

    pattern.updatedAt = now;

    // 检查是否为变体
    const similarity = this.calculateSequenceSimilarity(
      currentSequence,
      pattern.pattern.actionSequence
    );

    if (similarity < 1.0 && similarity >= this.config.patternSimilarityThreshold) {
      // 记录变体
      const existingVariant = pattern.variants.find(
        v => this.calculateSequenceSimilarity(currentSequence, v.actionSequence) > 0.95
      );

      if (existingVariant) {
        existingVariant.frequency++;
      } else {
        pattern.variants.push({
          actionSequence: [...currentSequence],
          frequency: 1,
        });
      }
    }

    this.emit('pattern:updated', pattern);
  }

  /**
   * 获取模式
   */
  getPattern(id: string): ProceduralMemory | undefined {
    return this.patterns.get(id);
  }

  /**
   * 获取所有模式
   */
  getAllPatterns(): ProceduralMemory[] {
    return Array.from(this.patterns.values());
  }

  /**
   * 按名称搜索模式
   */
  searchPatterns(query: string): ProceduralMemory[] {
    const normalizedQuery = query.toLowerCase();
    return this.getAllPatterns().filter(
      p =>
        p.pattern.name.toLowerCase().includes(normalizedQuery) ||
        p.pattern.description.toLowerCase().includes(normalizedQuery)
    );
  }

  /**
   * 获取频繁模式
   */
  getFrequentPatterns(minOccurrences?: number): ProceduralMemory[] {
    const threshold = minOccurrences ?? this.config.minOccurrences;
    return this.getAllPatterns()
      .filter(p => p.statistics.occurrenceCount >= threshold)
      .sort((a, b) => b.statistics.occurrenceCount - a.statistics.occurrenceCount);
  }

  /**
   * 删除模式
   */
  removePattern(id: string): boolean {
    const pattern = this.patterns.get(id);
    if (!pattern) return false;

    this.removeFromTriggerIndex(pattern);
    this.patterns.delete(id);

    this.emit('pattern:removed', id);
    return true;
  }

  /**
   * 启用自动化
   */
  enableAutomation(patternId: string, config?: Partial<WorkflowConfig>): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern not found: ${patternId}`);
    }

    pattern.automation.isAutomated = true;
    pattern.automation.automationConfig = {
      id: uuidv4(),
      name: config?.name ?? pattern.pattern.name,
      description: config?.description ?? pattern.pattern.description,
      enabled: true,
      triggers: config?.triggers ?? pattern.pattern.triggerConditions,
      actions: pattern.pattern.actionSequence,
      schedule: config?.schedule,
    };
    pattern.updatedAt = Date.now();

    this.emit('automation:enabled', pattern);
  }

  /**
   * 禁用自动化
   */
  disableAutomation(patternId: string): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    pattern.automation.isAutomated = false;
    delete pattern.automation.automationConfig;
    pattern.updatedAt = Date.now();

    this.emit('automation:disabled', patternId);
  }

  /**
   * 检查触发条件
   */
  checkTriggers(context: {
    type: TriggerType;
    data: Record<string, unknown>;
  }): ProceduralMemory[] {
    const triggered: ProceduralMemory[] = [];
    const patternIds = this.triggerIndex.get(context.type);

    if (!patternIds) return triggered;

    for (const id of patternIds) {
      const pattern = this.patterns.get(id);
      if (!pattern || !pattern.automation.isAutomated) continue;

      const matchingTrigger = pattern.pattern.triggerConditions.find(
        t => t.type === context.type && this.evaluateTriggerCondition(t, context.data)
      );

      if (matchingTrigger) {
        triggered.push(pattern);
        this.emit('pattern:triggered', pattern, context.data);
      }
    }

    return triggered;
  }

  /**
   * 评估触发条件
   */
  private evaluateTriggerCondition(
    trigger: TriggerCondition,
    contextData: Record<string, unknown>
  ): boolean {
    const condition = trigger.condition;

    switch (trigger.type) {
      case 'time':
        // 检查时间条件
        if (condition.hour !== undefined) {
          const currentHour = new Date().getHours();
          if (currentHour !== condition.hour) return false;
        }
        if (condition.dayOfWeek !== undefined) {
          const currentDay = new Date().getDay();
          if (currentDay !== condition.dayOfWeek) return false;
        }
        return true;

      case 'event':
        // 检查事件类型匹配
        return condition.eventType === contextData.eventType;

      case 'context':
        // 检查上下文条件
        for (const [key, value] of Object.entries(condition)) {
          if (contextData[key] !== value) return false;
        }
        return true;

      case 'sequence':
        // 检查前置动作序列
        if (!Array.isArray(condition.previousActions)) return false;
        const recentActions = this.actionBuffer.slice(-condition.previousActions.length);
        return this.calculateSequenceSimilarity(
          recentActions,
          condition.previousActions as RecordedAction[]
        ) >= 0.9;

      default:
        return false;
    }
  }

  /**
   * 记录执行结果
   */
  recordExecutionResult(patternId: string, success: boolean): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    const currentRate = pattern.statistics.successRate;
    const count = pattern.statistics.occurrenceCount;

    // 更新成功率（滑动平均）
    pattern.statistics.successRate =
      (currentRate * count + (success ? 1 : 0)) / (count + 1);

    if (success && pattern.automation.automationConfig) {
      pattern.automation.lastAutoRun = Date.now();
    }

    pattern.updatedAt = Date.now();
    this.emit('pattern:updated', pattern);
  }

  /**
   * 获取统计信息
   */
  getStatistics(): {
    totalPatterns: number;
    automatedPatterns: number;
    averageOccurrences: number;
    averageSuccessRate: number;
    topPatterns: Array<{ name: string; occurrences: number }>;
  } {
    const patterns = this.getAllPatterns();
    const automated = patterns.filter(p => p.automation.isAutomated);

    const totalOccurrences = patterns.reduce(
      (sum, p) => sum + p.statistics.occurrenceCount,
      0
    );
    const totalSuccessRate = patterns.reduce(
      (sum, p) => sum + p.statistics.successRate,
      0
    );

    const topPatterns = patterns
      .sort((a, b) => b.statistics.occurrenceCount - a.statistics.occurrenceCount)
      .slice(0, 5)
      .map(p => ({
        name: p.pattern.name,
        occurrences: p.statistics.occurrenceCount,
      }));

    return {
      totalPatterns: patterns.length,
      automatedPatterns: automated.length,
      averageOccurrences: patterns.length > 0 ? totalOccurrences / patterns.length : 0,
      averageSuccessRate: patterns.length > 0 ? totalSuccessRate / patterns.length : 0,
      topPatterns,
    };
  }

  /**
   * 计算序列相似度
   */
  private calculateSequenceSimilarity(
    seq1: RecordedAction[],
    seq2: RecordedAction[]
  ): number {
    if (seq1.length === 0 || seq2.length === 0) return 0;
    if (seq1.length !== seq2.length) {
      // 使用编辑距离
      const distance = this.levenshteinDistance(
        seq1.map(a => `${a.type}:${a.target}`),
        seq2.map(a => `${a.type}:${a.target}`)
      );
      return 1 - distance / Math.max(seq1.length, seq2.length);
    }

    // 逐一比较
    let matches = 0;
    for (let i = 0; i < seq1.length; i++) {
      if (seq1[i].type === seq2[i].type && seq1[i].target === seq2[i].target) {
        matches++;
      }
    }

    return matches / seq1.length;
  }

  /**
   * 编辑距离算法
   */
  private levenshteinDistance(s1: string[], s2: string[]): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * 获取序列签名
   */
  private getSequenceSignature(sequence: RecordedAction[]): string {
    return sequence.map(a => `${a.type}:${a.target}`).join('|');
  }

  /**
   * 生成模式名称
   */
  private generatePatternName(sequence: RecordedAction[]): string {
    if (sequence.length === 0) return 'Unknown Pattern';

    const firstAction = sequence[0];
    const lastAction = sequence[sequence.length - 1];

    return `${firstAction.type} -> ${lastAction.type} (${sequence.length} steps)`;
  }

  /**
   * 推断触发条件
   */
  private inferTriggerConditions(sequence: RecordedAction[]): TriggerCondition[] {
    const conditions: TriggerCondition[] = [];

    if (sequence.length > 0) {
      // 基于第一个动作创建事件触发器
      conditions.push({
        type: 'event',
        condition: {
          eventType: sequence[0].type,
        },
      });

      // 如果有时间模式，创建时间触发器
      const hour = new Date(sequence[0].timestamp).getHours();
      conditions.push({
        type: 'time',
        condition: {
          hour,
        },
      });
    }

    return conditions;
  }

  /**
   * 计算平均时长
   */
  private calculateAverageDuration(sequence: RecordedAction[]): number {
    if (sequence.length < 2) return 0;

    const totalDuration = sequence.reduce((sum, a) => sum + a.duration, 0);
    return totalDuration / sequence.length;
  }

  /**
   * 添加到触发器索引
   */
  private addToTriggerIndex(pattern: ProceduralMemory): void {
    for (const trigger of pattern.pattern.triggerConditions) {
      const set = this.triggerIndex.get(trigger.type);
      set?.add(pattern.id);
    }
  }

  /**
   * 从触发器索引移除
   */
  private removeFromTriggerIndex(pattern: ProceduralMemory): void {
    for (const trigger of pattern.pattern.triggerConditions) {
      const set = this.triggerIndex.get(trigger.type);
      set?.delete(pattern.id);
    }
  }

  /**
   * 移除最低出现次数的模式
   */
  private removeLowestOccurrencePattern(): void {
    let lowestPattern: ProceduralMemory | null = null;
    let lowestCount = Infinity;

    for (const pattern of this.patterns.values()) {
      if (!pattern.automation.isAutomated &&
          pattern.statistics.occurrenceCount < lowestCount) {
        lowestCount = pattern.statistics.occurrenceCount;
        lowestPattern = pattern;
      }
    }

    if (lowestPattern) {
      this.removePattern(lowestPattern.id);
    }
  }

  /**
   * 导出所有模式
   */
  exportAll(): ProceduralMemory[] {
    return Array.from(this.patterns.values());
  }

  /**
   * 导入模式
   */
  importAll(patterns: ProceduralMemory[]): void {
    for (const pattern of patterns) {
      this.patterns.set(pattern.id, pattern);
      this.addToTriggerIndex(pattern);
    }
  }

  /**
   * 清空
   */
  clear(): void {
    this.patterns.clear();
    this.actionBuffer = [];
    for (const set of this.triggerIndex.values()) {
      set.clear();
    }
  }
}

/**
 * 创建程序性记忆管理器
 */
export function createProceduralMemory(
  config?: Partial<ProceduralMemoryConfig>
): ProceduralMemoryManager {
  return new ProceduralMemoryManager(config);
}
