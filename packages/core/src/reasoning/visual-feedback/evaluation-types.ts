/**
 * Evaluation Types - 视觉评估类型定义
 * 定义执行结果评估和反馈的数据结构
 */

import type { UIElement, ParsedUI } from '../../perception/ui-parser/element-types';

/**
 * 屏幕状态快照
 */
export interface ScreenState {
  ui: ParsedUI;
  screenshotHash: string;
  timestamp: number;
}

/**
 * 预期状态定义
 */
export interface ExpectedState {
  /** 必须存在的元素描述 */
  mustExist?: string[];

  /** 必须消失的元素描述 */
  mustNotExist?: string[];

  /** 期望的文本内容 */
  expectedText?: string[];

  /** 视觉相似度阈值 (0-1) */
  visualSimilarityThreshold?: number;

  /** 关键区域哈希 (用于精确匹配) */
  regionHash?: string;
}

/**
 * 改进建议类型
 */
export type SuggestionType =
  | 'retry'          // 重试当前操作
  | 'adjust_target'  // 调整操作目标(坐标/元素)
  | 'add_wait'       // 增加等待时间
  | 'change_action'  // 更改操作类型(如 click -> double_click)
  | 'scroll'         // 滚动页面寻找目标
  | 'fallback';      // 使用备选方案

/**
 * 改进建议
 */
export interface RefinementSuggestion {
  type: SuggestionType;
  parameters: Record<string, unknown>;
  confidence: number;
  reasoning: string;
  priority: number;
}

/**
 * 状态对比结果
 */
export interface StateComparison {
  /** 匹配分数 (0-1) */
  matchScore: number;

  /** 缺失的元素 */
  missingElements: string[];

  /** 意外存在的元素 */
  unexpectedElements: string[];

  /** 文本匹配情况 */
  textMatches: {
    expected: string;
    found: boolean;
    actual?: string;
  }[];

  /** 视觉差异描述 */
  visualDiff?: string;
}

/**
 * 执行评估结果
 */
export interface ExecutionEvaluation {
  /** 步骤 ID */
  stepId: string;

  /** 执行是否成功 */
  success: boolean;

  /** 评估分数 (0-1) */
  score: number;

  /** 状态对比详情 */
  comparison: StateComparison;

  /** 改进建议 */
  suggestions: RefinementSuggestion[];

  /** 评估耗时 */
  duration: number;

  /** 实际观察到的状态 */
  actualState: ScreenState;
}

/**
 * 反馈循环配置
 */
export interface FeedbackConfig {
  /** 最大重试次数 */
  maxRetries: number;

  /** 最小成功分数阈值 */
  successThreshold: number;

  /** 是否启用自动纠正 */
  enableAutoCorrection: boolean;

  /** 截图对比策略 */
  comparisonStrategy: 'semantic' | 'pixel' | 'hybrid';
}
