/**
 * Autonomous Module - 自主能力模块
 *
 * 提供无需 Prompt 输入的自主操作建议和执行能力
 *
 * 核心组件：
 * - PatternDetector: 行为模式检测
 * - AutoSuggestEngine: 自动建议引擎
 * - ProactiveIntentDetector: 主动意图检测
 *
 * 使用示例:
 * ```typescript
 * import {
 *   createPatternDetector,
 *   createAutoSuggestEngine,
 *   createProactiveIntentDetector,
 *   createAutonomousManager,
 * } from './autonomous';
 *
 * // 方式1: 单独使用各组件
 * const patternDetector = createPatternDetector();
 * const autoSuggest = createAutoSuggestEngine(patternDetector);
 * const proactiveIntent = createProactiveIntentDetector(patternDetector);
 *
 * // 方式2: 使用统一管理器
 * const manager = createAutonomousManager();
 * const suggestions = await manager.analyze(context);
 * ```
 */

// 类型导出
export * from './types';

// 模式检测器
export { PatternDetector, createPatternDetector } from './pattern-detector';

// 自动建议引擎
export { AutoSuggestEngine, createAutoSuggestEngine } from './auto-suggest';

// 主动意图检测器
export { ProactiveIntentDetector, createProactiveIntentDetector } from './proactive-intent';

// 技能学习器
export {
  SkillLearner,
  type SkillType,
  type SkillStatus,
  type SkillParameter,
  type SkillStep,
  type SkillActionTemplate,
  type SkillCondition,
  type LearnedSkill,
  type SkillMetadata,
  type ActionRecord,
  type ActionContext,
  type PatternMatch,
  type SkillLearnerConfig,
  getSkillLearner,
  createSkillLearner,
  setSkillLearner,
} from './skill-learner';

// 自我反思模块
export {
  SelfReflection,
  type ReflectionType,
  type ErrorSeverity,
  type ErrorCategory,
  type ReflectionEntry,
  type ReflectionContext,
  type CauseAnalysis,
  type RootCauseType,
  type ImprovementSuggestion,
  type ImprovementType,
  type LearningRecord,
  type SelfReflectionConfig,
  type ReflectionStatistics,
  getSelfReflection,
  createSelfReflection,
  setSelfReflection,
} from './self-reflection';

// ============ 统一管理器 ============

import { EventEmitter } from 'events';
import { PatternDetector, createPatternDetector } from './pattern-detector';
import { AutoSuggestEngine, createAutoSuggestEngine } from './auto-suggest';
import { ProactiveIntentDetector, createProactiveIntentDetector } from './proactive-intent';
import type {
  AutonomousConfig,
  SuggestedAction,
  ProactiveIntent,
  RecordedAction,
  BehaviorPattern,
  SuggestionFeedback,
} from './types';
import { DEFAULT_AUTONOMOUS_CONFIG } from './types';
import type { ExtendedPerceptionContext } from '../perception/engine';
import type { ExecutionResult } from '../types';

/**
 * 自主分析结果
 */
export interface AutonomousAnalysisResult {
  /** 建议的操作列表 */
  suggestions: SuggestedAction[];
  /** 检测到的主动意图 (如果有) */
  intent: ProactiveIntent | null;
  /** 匹配的行为模式 (如果有) */
  matchedPattern: BehaviorPattern | null;
  /** 分析耗时 */
  duration: number;
}

/**
 * AutonomousManager - 自主能力统一管理器
 *
 * 整合 PatternDetector、AutoSuggestEngine、ProactiveIntentDetector
 * 提供简化的 API 供 Hawkeye 主引擎使用
 */
export class AutonomousManager extends EventEmitter {
  private config: AutonomousConfig;
  private patternDetector: PatternDetector;
  private autoSuggest: AutoSuggestEngine;
  private proactiveIntent: ProactiveIntentDetector;

  private lastContext: ExtendedPerceptionContext | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<AutonomousConfig> = {}) {
    super();
    this.config = {
      ...DEFAULT_AUTONOMOUS_CONFIG,
      ...config,
      autoSuggest: { ...DEFAULT_AUTONOMOUS_CONFIG.autoSuggest, ...config.autoSuggest },
      proactiveIntent: { ...DEFAULT_AUTONOMOUS_CONFIG.proactiveIntent, ...config.proactiveIntent },
      patternDetector: { ...DEFAULT_AUTONOMOUS_CONFIG.patternDetector, ...config.patternDetector },
    };

    // 初始化组件
    this.patternDetector = createPatternDetector(this.config.patternDetector);
    this.autoSuggest = createAutoSuggestEngine(this.patternDetector, this.config.autoSuggest);
    this.proactiveIntent = createProactiveIntentDetector(this.patternDetector, this.config.proactiveIntent);

    // 设置事件转发
    this.setupEventForwarding();
  }

  /**
   * 启动自主能力
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.proactiveIntent.startIdleDetection();
    this.emit('started');
  }

  /**
   * 停止自主能力
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.proactiveIntent.stopIdleDetection();
    this.emit('stopped');
  }

  /**
   * 分析感知上下文，生成建议和检测意图
   */
  async analyze(context: ExtendedPerceptionContext): Promise<AutonomousAnalysisResult> {
    const startTime = Date.now();

    // 并行执行分析
    const [suggestions, intent] = await Promise.all([
      this.autoSuggest.analyze(context),
      this.proactiveIntent.detect(context, this.lastContext ?? undefined),
    ]);

    // 获取匹配的模式
    const patternMatch = this.patternDetector.getPatternForContext(context);

    const result: AutonomousAnalysisResult = {
      suggestions,
      intent,
      matchedPattern: patternMatch?.pattern ?? null,
      duration: Date.now() - startTime,
    };

    this.lastContext = context;
    this.emit('analysis:complete', result);

    return result;
  }

  /**
   * 记录用户操作 (用于模式学习)
   */
  recordAction(
    actionType: string,
    params: Record<string, unknown>,
    context: ExtendedPerceptionContext,
    result?: { success: boolean; duration: number }
  ): RecordedAction {
    return this.patternDetector.createObservationFromContext(
      actionType,
      params,
      context,
      result
    );
  }

  /**
   * 获取当前建议
   */
  getSuggestions(limit?: number): SuggestedAction[] {
    return this.autoSuggest.getTopSuggestions(limit);
  }

  /**
   * 执行建议
   */
  async executeSuggestion(id: string): Promise<ExecutionResult> {
    return this.autoSuggest.executeSuggestion(id);
  }

  /**
   * 忽略建议
   */
  dismissSuggestion(id: string): void {
    this.autoSuggest.dismissSuggestion(id);
  }

  /**
   * 提供反馈
   */
  provideFeedback(suggestionId: string, accepted: boolean, result?: ExecutionResult): void {
    this.autoSuggest.learnFromFeedback(suggestionId, accepted, result);
  }

  /**
   * 获取检测到的模式
   */
  getPatterns(): BehaviorPattern[] {
    return this.patternDetector.getAllPatterns();
  }

  /**
   * 导出学习数据
   */
  exportLearningData(): {
    patterns: BehaviorPattern[];
    stats: ReturnType<AutoSuggestEngine['getStats']>;
  } {
    return {
      patterns: this.patternDetector.exportPatterns(),
      stats: this.autoSuggest.getStats(),
    };
  }

  /**
   * 导入学习数据
   */
  importLearningData(data: { patterns?: BehaviorPattern[] }): void {
    if (data.patterns) {
      this.patternDetector.importPatterns(data.patterns);
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AutonomousConfig>): void {
    if (config.autoSuggest) {
      this.autoSuggest.updateConfig(config.autoSuggest);
    }
    if (config.proactiveIntent) {
      this.proactiveIntent.updateConfig(config.proactiveIntent);
    }
    if (config.patternDetector) {
      this.patternDetector.updateConfig(config.patternDetector);
    }
    this.config = { ...this.config, ...config };
    this.emit('config:updated', this.config);
  }

  /**
   * 获取状态
   */
  getStatus(): {
    isRunning: boolean;
    suggestionsCount: number;
    patternsCount: number;
    observationsCount: number;
  } {
    const patternStats = this.patternDetector.getStats();
    return {
      isRunning: this.isRunning,
      suggestionsCount: this.autoSuggest.getTopSuggestions().length,
      patternsCount: patternStats.patternCount,
      observationsCount: patternStats.observationCount,
    };
  }

  /**
   * 清除所有数据
   */
  clear(): void {
    this.patternDetector.clear();
    this.emit('cleared');
  }

  // ============ 私有方法 ============

  private setupEventForwarding(): void {
    // 转发模式检测事件
    this.patternDetector.on('pattern:detected', (pattern) => {
      this.emit('pattern:detected', pattern);
    });

    // 转发建议事件
    this.autoSuggest.on('suggestions:updated', (suggestions) => {
      this.emit('suggestions:updated', suggestions);
    });

    this.autoSuggest.on('suggestion:executing', (suggestion) => {
      this.emit('suggestion:executing', suggestion);
    });

    // 转发意图事件
    this.proactiveIntent.on('intent:detected', (intent) => {
      this.emit('intent:detected', intent);
    });
  }
}

// ============ 工厂函数 ============

/**
 * 创建自主能力管理器
 */
export function createAutonomousManager(config?: Partial<AutonomousConfig>): AutonomousManager {
  return new AutonomousManager(config);
}

// ============ 单例支持 ============

let globalAutonomousManager: AutonomousManager | null = null;

/**
 * 获取全局自主能力管理器实例
 */
export function getAutonomousManager(): AutonomousManager {
  if (!globalAutonomousManager) {
    globalAutonomousManager = createAutonomousManager();
  }
  return globalAutonomousManager;
}

/**
 * 设置全局自主能力管理器实例
 */
export function setAutonomousManager(manager: AutonomousManager): void {
  globalAutonomousManager = manager;
}
