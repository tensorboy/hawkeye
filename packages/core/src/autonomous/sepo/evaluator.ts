/**
 * Plan Evaluator - 计划评估器
 * 分析执行结果，识别问题并生成优化建议
 */

import type { ExecutionPlan } from '../../ai/types';
import type { ExecutionResult } from '../../types';
import {
  type ExecutionQuality,
  type OptimizationSuggestion,
  calculateQuality
} from './quality-metrics';

export class SEPOEvaluator {
  /**
   * 评估执行结果
   */
  async evaluate(
    plan: ExecutionPlan,
    result: ExecutionResult
  ): Promise<ExecutionQuality> {
    // 1. 计算基础指标
    const quality = calculateQuality(plan, result);

    // 2. 生成具体建议
    if (!result.success) {
      quality.suggestions.push(this.analyzeFailure(plan, result));
    } else {
      const optimization = this.analyzeOptimization(plan, result);
      if (optimization) {
        quality.suggestions.push(optimization);
      }
    }

    return quality;
  }

  /**
   * 分析失败原因并生成建议
   */
  private analyzeFailure(
    plan: ExecutionPlan,
    result: ExecutionResult
  ): OptimizationSuggestion {
    // 简单启发式：如果因为超时失败，建议增加等待
    if (result.error?.includes('timeout') || result.error?.includes('Timed out')) {
      return {
        type: 'adjust_params',
        reasoning: 'Execution timed out, suggesting increased timeout or wait times',
        confidence: 0.8,
        params: { timeout: 30000 } // 增加超时
      };
    }

    // 如果找不到元素，建议增加检查或等待
    if (result.error?.includes('not found') || result.error?.includes('Element')) {
      return {
        type: 'add_check',
        reasoning: 'Element not found, suggesting proactive check before interaction',
        confidence: 0.7
      };
    }

    // 默认建议
    return {
      type: 'change_tool',
      reasoning: `Execution failed: ${result.error}`,
      confidence: 0.5
    };
  }

  /**
   * 分析成功执行的优化空间
   */
  private analyzeOptimization(
    plan: ExecutionPlan,
    result: ExecutionResult
  ): OptimizationSuggestion | null {
    // 如果执行很快但步骤很多，可能可以合并
    if (plan.steps.length > 5 && (result.duration || 0) < 2000) {
      return {
        type: 'combine_steps',
        reasoning: 'Steps executed very quickly, considering combining them',
        confidence: 0.6
      };
    }

    return null;
  }
}
