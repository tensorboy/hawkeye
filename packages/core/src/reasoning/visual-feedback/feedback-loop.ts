/**
 * Feedback Loop - 反馈循环控制器
 * 编排 "执行-观察-评估-修正" 循环
 */

import { VisualEvaluator } from './visual-evaluator';
import type {
  ExpectedState,
  ExecutionEvaluation,
  FeedbackConfig
} from './evaluation-types';
import type { PerceptionEngine } from '../../perception/engine';
import type { ExecutionResult } from '../../types';
import type { PlanStep, ActionType } from '../../ai/types';

export interface StepExecutor {
  executeSingleAction(step: PlanStep): Promise<ExecutionResult>;
}

const DEFAULT_CONFIG: FeedbackConfig = {
  maxRetries: 3,
  successThreshold: 0.8,
  enableAutoCorrection: true,
  comparisonStrategy: 'hybrid'
};

export class FeedbackLoop {
  private evaluator: VisualEvaluator;
  private config: FeedbackConfig;

  constructor(
    private perceptionEngine: PerceptionEngine,
    config: Partial<FeedbackConfig> = {}
  ) {
    this.evaluator = new VisualEvaluator();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 带反馈循环的执行
   */
  async executeWithFeedback(
    step: PlanStep,
    executor: StepExecutor
  ): Promise<ExecutionResult> {
    // 确保有 ID
    const stepWithId: PlanStep & { id: string } = { ...step, id: step.id || `step_${Date.now()}` };
    let currentStep: PlanStep & { id: string } = { ...stepWithId };
    let attempt = 0;
    let lastEvaluation: ExecutionEvaluation | null = null;

    console.log(`[FeedbackLoop] Starting execution loop for step ${currentStep.id}`);

    while (attempt <= this.config.maxRetries) {
      attempt++;

      // 1. 执行步骤
      console.log(`[FeedbackLoop] Attempt ${attempt}/${this.config.maxRetries + 1}`);
      const result = await executor.executeSingleAction(currentStep);

      // 如果没有预期状态或执行本身失败，直接返回
      // 只有在执行成功但视觉验证失败时才进行重试
      if (!currentStep.expectedState || !result.success) {
        return result;
      }

      // 2. 感知当前状态
      // 等待一点时间让 UI 安定
      await new Promise(resolve => setTimeout(resolve, 1000));
      const context = await this.perceptionEngine.perceive();

      // 3. 评估结果
      const evaluation = await this.evaluator.evaluate(
        currentStep.id!,
        currentStep.expectedState as ExpectedState,
        context
      );
      lastEvaluation = evaluation;

      console.log(`[FeedbackLoop] Evaluation score: ${evaluation.score}, Success: ${evaluation.success}`);

      // 4. 判定是否满足要求
      if (evaluation.success || evaluation.score >= this.config.successThreshold) {
        console.log('[FeedbackLoop] Success threshold met');
        return {
          ...result,
          metadata: {
            ...result.metadata,
            evaluation
          }
        };
      }

      // 5. 如果未满足且还有重试机会，应用修正
      if (attempt <= this.config.maxRetries && this.config.enableAutoCorrection) {
        const refinement = this.selectBestRefinement(evaluation.suggestions);

        if (refinement) {
          console.log(`[FeedbackLoop] Applying refinement: ${refinement.type}`, refinement.reasoning);
          currentStep = this.applyRefinement(currentStep, refinement) as PlanStep & { id: string };

          // 如果是等待建议，直接执行等待
          if (refinement.type === 'add_wait') {
            const duration = (refinement.parameters.duration as number) || 1000;
            await new Promise(resolve => setTimeout(resolve, duration));
            // 此次循环不计入执行次数，或者单纯等待后继续
            // 这里简单处理：修改步骤后继续下一次循环
          }
        } else {
          console.log('[FeedbackLoop] No applicable refinements found');
          break;
        }
      } else {
        break;
      }
    }

    // 耗尽重试次数或无法修正，返回最后一次结果，但标记警告
    return {
      success: false, // 标记为失败，因为没达到视觉预期
      error: `Visual verification failed after ${attempt} attempts. Score: ${lastEvaluation?.score}`,
      metadata: {
        evaluation: lastEvaluation,
        attempts: attempt
      }
    };
  }

  /**
   * 选择最佳改进建议
   */
  private selectBestRefinement(
    suggestions: import('./evaluation-types').RefinementSuggestion[]
  ): import('./evaluation-types').RefinementSuggestion | null {
    if (!suggestions || suggestions.length === 0) return null;

    // 建议已经按优先级排序，直接取第一个置信度够高的
    return suggestions.find(s => s.confidence > 0.5) || null;
  }

  /**
   * 应用改进建议到步骤
   */
  private applyRefinement(
    step: PlanStep,
    refinement: import('./evaluation-types').RefinementSuggestion
  ): PlanStep {
    const newStep = { ...step };

    switch (refinement.type) {
      case 'adjust_target':
        // 调整参数中的目标
        if (newStep.params && refinement.parameters.target) {
          newStep.params.target = refinement.parameters.target;
        }
        break;

      case 'change_action':
        if (refinement.parameters.action) {
          newStep.actionType = refinement.parameters.action as ActionType;
        }
        break;

      case 'retry':
        // 保持不变，单纯重试
        break;

      case 'add_wait':
        // 可能会在参数里加 delay
        newStep.params.delay = (newStep.params.delay as number || 0) + 2000;
        break;
    }

    return newStep;
  }
}
