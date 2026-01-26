/**
 * SEPO Optimization Loop - 自进化流程优化循环
 * 协调评估、编辑和学习过程
 */

import { SEPOEvaluator } from './evaluator';
import { SEPOEditor } from './editor';
import { FeedbackCollector } from './feedback-collector';
import type { VectorStore } from '../../../storage/vector-store';
import type { ExecutionPlan } from '../../../ai/types';
import type { ExecutionResult } from '../../../types';

export interface OptimizedPlanResult {
  original: ExecutionPlan;
  optimized: ExecutionPlan;
  improvementScore: number;
}

export class SEPOptimizationLoop {
  private evaluator: SEPOEvaluator;
  private editor: SEPOEditor;
  private feedbackCollector: FeedbackCollector;

  constructor(vectorStore: VectorStore) {
    this.evaluator = new SEPOEvaluator();
    this.editor = new SEPOEditor();
    this.feedbackCollector = new FeedbackCollector(vectorStore);
  }

  /**
   * 运行优化循环
   * @param plan 原始计划
   * @param result 执行结果
   */
  async optimize(plan: ExecutionPlan, result: ExecutionResult): Promise<OptimizedPlanResult | null> {
    console.log(`[SEPO] Starting optimization loop for plan ${plan.id}`);

    // 1. 评估执行质量
    const quality = await this.evaluator.evaluate(plan, result);
    console.log(`[SEPO] Quality score: ${quality.score}`);

    // 2. 收集反馈用于长期记忆
    await this.feedbackCollector.collect(plan, result, quality);

    // 3. 如果有改进建议，生成优化后的计划
    if (quality.suggestions.length > 0) {
      console.log(`[SEPO] Applying ${quality.suggestions.length} optimization suggestions`);

      const optimizedPlan = await this.editor.applyEdits(plan, quality.suggestions);

      return {
        original: plan,
        optimized: optimizedPlan,
        improvementScore: quality.score // 这里可以用预估提升分数
      };
    }

    return null;
  }

  /**
   * 获取针对新意图的优化建议（基于历史学习）
   */
  async getOptimizationInsights(intentDescription: string): Promise<string[]> {
    return this.feedbackCollector.retrieveRelevantFeedback(intentDescription);
  }
}
