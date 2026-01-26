/**
 * Quality Metrics - 质量指标定义
 * 定义评估执行计划和结果的量化指标
 */

import type { ExecutionResult } from '../../../types';
import type { ExecutionPlan } from '../../../ai/types';

/**
 * 质量评分维度
 */
export interface QualityDimensions {
  /** 成功率 (0-1) */
  successRate: number;
  /** 执行效率 (速度) */
  efficiency: number;
  /** 步骤冗余度 (越低越好) */
  redundancy: number;
  /** 鲁棒性 (错误恢复能力) */
  robustness: number;
  /** 用户满意度 (如果有反馈) */
  userSatisfaction?: number;
}

/**
 * 执行评估结果
 */
export interface ExecutionQuality {
  /** 总体得分 (0-1) */
  score: number;
  /** 维度详情 */
  dimensions: QualityDimensions;
  /** 失败原因分析 */
  failureAnalysis?: string;
  /** 改进建议 */
  suggestions: OptimizationSuggestion[];
}

/**
 * 优化建议类型
 */
export type OptimizationType =
  | 'remove_step'      // 删除多余步骤
  | 'combine_steps'    // 合并步骤
  | 'reorder_steps'    // 重排序
  | 'add_check'        // 增加检查点
  | 'change_tool'      // 更换工具
  | 'adjust_params';   // 调整参数

/**
 * 优化建议
 */
export interface OptimizationSuggestion {
  type: OptimizationType;
  targetStepIndex?: number;
  params?: Record<string, unknown>;
  reasoning: string;
  confidence: number; // 0-1
}

/**
 * 计算执行质量
 */
export function calculateQuality(
  plan: ExecutionPlan,
  result: ExecutionResult,
  executionHistory: any[] = [] // 历史执行记录
): ExecutionQuality {
  // 基础评分
  let successRate = result.success ? 1.0 : 0.0;

  // 效率评分 (基于预期耗时和实际耗时)
  const estimatedDuration = plan.impact?.estimatedDuration || 10;
  const actualDuration = (result.duration || 1000) / 1000;
  let efficiency = Math.min(1.0, estimatedDuration / Math.max(1, actualDuration));

  // 鲁棒性评分 (基于重试次数等)
  const attempts = (result.metadata?.attempts as number) || 1;
  let robustness = 1.0 / attempts;

  // 冗余度评分 (简单实现：步骤数越多，潜在冗余越高)
  let redundancy = Math.min(1.0, plan.steps.length / 20);

  // 综合评分
  const score = (successRate * 0.5) + (efficiency * 0.2) + (robustness * 0.2) + ((1 - redundancy) * 0.1);

  return {
    score,
    dimensions: {
      successRate,
      efficiency,
      redundancy,
      robustness
    },
    suggestions: [] // 由 Evaluator 填充
  };
}
