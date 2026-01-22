/**
 * Autonomous Module Types
 * 自主能力模块类型定义
 *
 * 支持无需 Prompt 输入的自主操作建议和执行
 */

import type { ExecutionPlan, PlanStep } from '../ai/types';
import type { ExtendedPerceptionContext } from '../perception/engine';
import type { ExecutionResult } from '../types';

// ============ 基础类型 ============

/** 建议类型 */
export type SuggestionType =
  | 'predicted'      // 基于历史预测
  | 'repetitive'     // 检测到重复模式
  | 'contextual'     // 基于当前上下文
  | 'scheduled'      // 定时任务
  | 'error_fix'      // 错误修复建议
  | 'optimization';  // 优化建议

/** 意图触发条件 */
export type IntentTrigger =
  | 'window_switch'      // 窗口切换
  | 'app_launch'         // 应用启动
  | 'app_close'          // 应用关闭
  | 'idle_timeout'       // 空闲超时
  | 'repeated_action'    // 重复操作
  | 'error_detected'     // 检测到错误
  | 'file_changed'       // 文件变化
  | 'clipboard_content'  // 剪贴板内容变化
  | 'time_based'         // 时间触发
  | 'pattern_match';     // 模式匹配

/** 模式类型 */
export type PatternType =
  | 'sequence'       // 动作序列
  | 'time_based'     // 时间规律
  | 'context_based'  // 上下文关联
  | 'frequency';     // 频率模式

/** 风险等级 */
export type RiskLevel = 'safe' | 'low' | 'moderate' | 'high' | 'critical';

// ============ 记录的动作 ============

/** 记录的用户动作 */
export interface RecordedAction {
  id: string;
  timestamp: number;
  type: string;
  params: Record<string, unknown>;
  context: {
    appName?: string;
    windowTitle?: string;
    url?: string;
  };
  result?: {
    success: boolean;
    duration: number;
  };
}

// ============ 建议相关 ============

/** 建议的操作 */
export interface SuggestedAction {
  id: string;
  type: SuggestionType;
  title: string;
  description: string;
  action: PlanStep;
  confidence: number;       // 0-1
  reason: string;
  priority: number;         // 1-10
  riskLevel: RiskLevel;
  autoExecutable: boolean;  // 是否可自动执行
  expiresAt?: number;       // 建议过期时间
  metadata?: Record<string, unknown>;
}

/** 建议分组 */
export interface SuggestionGroup {
  category: string;
  icon: string;
  suggestions: SuggestedAction[];
}

/** 建议反馈 */
export interface SuggestionFeedback {
  suggestionId: string;
  accepted: boolean;
  executionResult?: ExecutionResult;
  userRating?: number;  // 1-5
  comment?: string;
}

// ============ 意图相关 ============

/** 主动检测到的意图 */
export interface ProactiveIntent {
  id: string;
  trigger: IntentTrigger;
  confidence: number;
  title: string;
  description: string;
  suggestedPlan: ExecutionPlan;
  autoExecute: boolean;      // 是否自动执行 (高置信度)
  requiresConfirmation: boolean;
  detectedAt: number;
  context: Partial<ExtendedPerceptionContext>;
}

/** 意图触发处理器 */
export type TriggerHandler = (
  context: ExtendedPerceptionContext,
  prevContext?: ExtendedPerceptionContext
) => Promise<ProactiveIntent | null>;

/** 触发器配置 */
export interface TriggerConfig {
  trigger: IntentTrigger;
  enabled: boolean;
  cooldown: number;         // 触发冷却时间 (ms)
  minConfidence: number;    // 最小置信度阈值
  autoExecuteThreshold: number;  // 自动执行阈值
}

// ============ 模式相关 ============

/** 行为模式 */
export interface BehaviorPattern {
  id: string;
  type: PatternType;
  name: string;
  description: string;
  actions: RecordedAction[];
  frequency: number;        // 出现频率
  avgInterval: number;      // 平均间隔 (ms)
  lastOccurrence: number;
  confidence: number;
  contexts: Array<{
    appName?: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    dayOfWeek?: number;
  }>;
}

/** 模式匹配结果 */
export interface PatternMatch {
  pattern: BehaviorPattern;
  matchScore: number;
  predictedNextActions: PlanStep[];
}

// ============ 配置 ============

/** 自动建议引擎配置 */
export interface AutoSuggestConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 最大建议数量 */
  maxSuggestions: number;
  /** 最小置信度阈值 */
  minConfidence: number;
  /** 建议过期时间 (ms) */
  suggestionTTL: number;
  /** 是否启用自动执行 */
  enableAutoExecute: boolean;
  /** 自动执行的置信度阈值 */
  autoExecuteThreshold: number;
  /** 是否从反馈中学习 */
  learnFromFeedback: boolean;
}

/** 主动意图检测配置 */
export interface ProactiveIntentConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 触发器配置 */
  triggers: TriggerConfig[];
  /** 空闲超时时间 (ms) */
  idleTimeout: number;
  /** 重复动作检测阈值 */
  repetitionThreshold: number;
  /** 全局冷却时间 (ms) */
  globalCooldown: number;
}

/** 模式检测配置 */
export interface PatternDetectorConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 最小模式长度 */
  minPatternLength: number;
  /** 最大模式长度 */
  maxPatternLength: number;
  /** 模式确认所需最小出现次数 */
  minOccurrences: number;
  /** 最大存储的观察数量 */
  maxObservations: number;
  /** 模式过期时间 (ms) */
  patternTTL: number;
}

/** 自主模块总配置 */
export interface AutonomousConfig {
  autoSuggest: AutoSuggestConfig;
  proactiveIntent: ProactiveIntentConfig;
  patternDetector: PatternDetectorConfig;
}

// ============ 默认配置 ============

export const DEFAULT_AUTO_SUGGEST_CONFIG: AutoSuggestConfig = {
  enabled: true,
  maxSuggestions: 5,
  minConfidence: 0.3,
  suggestionTTL: 5 * 60 * 1000,  // 5 分钟
  enableAutoExecute: false,
  autoExecuteThreshold: 0.9,
  learnFromFeedback: true,
};

export const DEFAULT_PROACTIVE_INTENT_CONFIG: ProactiveIntentConfig = {
  enabled: true,
  triggers: [
    { trigger: 'window_switch', enabled: true, cooldown: 3000, minConfidence: 0.5, autoExecuteThreshold: 0.95 },
    { trigger: 'idle_timeout', enabled: true, cooldown: 60000, minConfidence: 0.6, autoExecuteThreshold: 0.9 },
    { trigger: 'repeated_action', enabled: true, cooldown: 5000, minConfidence: 0.7, autoExecuteThreshold: 0.85 },
    { trigger: 'error_detected', enabled: true, cooldown: 1000, minConfidence: 0.8, autoExecuteThreshold: 0.95 },
    { trigger: 'file_changed', enabled: true, cooldown: 2000, minConfidence: 0.5, autoExecuteThreshold: 0.9 },
    { trigger: 'clipboard_content', enabled: true, cooldown: 1000, minConfidence: 0.6, autoExecuteThreshold: 0.9 },
    { trigger: 'time_based', enabled: true, cooldown: 300000, minConfidence: 0.7, autoExecuteThreshold: 0.95 },
  ],
  idleTimeout: 30000,  // 30 秒
  repetitionThreshold: 3,
  globalCooldown: 1000,
};

export const DEFAULT_PATTERN_DETECTOR_CONFIG: PatternDetectorConfig = {
  enabled: true,
  minPatternLength: 2,
  maxPatternLength: 10,
  minOccurrences: 3,
  maxObservations: 1000,
  patternTTL: 7 * 24 * 60 * 60 * 1000,  // 7 天
};

export const DEFAULT_AUTONOMOUS_CONFIG: AutonomousConfig = {
  autoSuggest: DEFAULT_AUTO_SUGGEST_CONFIG,
  proactiveIntent: DEFAULT_PROACTIVE_INTENT_CONFIG,
  patternDetector: DEFAULT_PATTERN_DETECTOR_CONFIG,
};
