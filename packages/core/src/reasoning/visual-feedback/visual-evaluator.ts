/**
 * Visual Evaluator - 视觉评估器
 * 负责评估执行步骤的结果，生成改进建议
 */

import type {
  ExecutionEvaluation,
  RefinementSuggestion,
  ExpectedState
} from './evaluation-types';
import { StateComparator } from './state-comparator';
import type { ExtendedPerceptionContext } from '../../perception/engine';
import { getUIParserPipeline } from '../../perception/ui-parser';

export class VisualEvaluator {
  private comparator: StateComparator;
  private uiParser = getUIParserPipeline();

  constructor() {
    this.comparator = new StateComparator();
  }

  /**
   * 评估执行结果
   * @param stepId 步骤 ID
   * @param expected 预期状态
   * @param context 感知上下文
   */
  async evaluate(
    stepId: string,
    expected: ExpectedState,
    context: ExtendedPerceptionContext
  ): Promise<ExecutionEvaluation> {
    const startTime = Date.now();

    // 1. 确保有 UI 解析结果
    if (!context.ui && context.screenshot?.imageData) {
      // 如果还没有 UI 解析结果，现场解析
      const buffer = Buffer.from(context.screenshot.imageData, 'base64');
      context.ui = await this.uiParser.parse(buffer, context.ocr?.text);
    }

    if (!context.ui) {
      throw new Error('No UI data available for evaluation');
    }

    const actualState = {
      ui: context.ui,
      screenshotHash: context.ui.screenshotHash,
      timestamp: context.ui.timestamp
    };

    // 2. 对比状态
    const comparison = await this.comparator.compare(expected, actualState);

    // 3. 生成改进建议
    const suggestions = await this.generateSuggestions(comparison);

    // 4. 计算最终分数和成功状态
    // 如果分数高于 0.8 且没有关键元素缺失，认为成功
    const success = comparison.matchScore >= 0.8 && comparison.missingElements.length === 0;

    return {
      stepId,
      success,
      score: comparison.matchScore,
      comparison,
      suggestions,
      duration: Date.now() - startTime,
      actualState
    };
  }

  /**
   * 基于对比结果生成改进建议
   */
  private async generateSuggestions(
    comparison: import('./evaluation-types').StateComparison
  ): Promise<RefinementSuggestion[]> {
    const suggestions: RefinementSuggestion[] = [];

    // 1. 如果有缺失元素，可能是没加载出来，建议等待
    if (comparison.missingElements.length > 0) {
      suggestions.push({
        type: 'add_wait',
        parameters: { duration: 2000 },
        confidence: 0.9,
        reasoning: 'Missing expected elements, UI might be loading',
        priority: 1
      });

      // 也可能是需要滚动
      suggestions.push({
        type: 'scroll',
        parameters: { direction: 'down', amount: 300 },
        confidence: 0.6,
        reasoning: 'Element might be off-screen',
        priority: 2
      });
    }

    // 2. 如果分数太低，建议重试
    if (comparison.matchScore < 0.5) {
      suggestions.push({
        type: 'retry',
        parameters: {},
        confidence: 0.8,
        reasoning: 'State mismatch significant, retry action',
        priority: 3
      });
    }

    // 3. 如果有意外元素（比如报错弹窗），建议处理
    if (comparison.unexpectedElements.some(e => e.includes('error') || e.includes('warning'))) {
      suggestions.push({
        type: 'change_action',
        parameters: { action: 'close_modal' },
        confidence: 0.7,
        reasoning: 'Error dialog detected',
        priority: 0 // 最高优先级
      });
    }

    return suggestions.sort((a, b) => a.priority - b.priority);
  }
}
