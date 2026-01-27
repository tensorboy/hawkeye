/**
 * Plan Editor - 计划编辑器
 * 根据优化建议修改执行计划
 */

import type { ExecutionPlan, PlanStep } from '../../ai/types';
import type { OptimizationSuggestion } from './quality-metrics';

export class SEPOEditor {
  /**
   * 应用优化建议到计划
   */
  async applyEdits(
    plan: ExecutionPlan,
    suggestions: OptimizationSuggestion[]
  ): Promise<ExecutionPlan> {
    let optimizedPlan = JSON.parse(JSON.stringify(plan)) as ExecutionPlan; // Deep clone

    for (const suggestion of suggestions) {
      optimizedPlan = this.applySuggestion(optimizedPlan, suggestion);
    }

    // 更新元数据
    optimizedPlan.id = `${plan.id}_optimized_${Date.now()}`;
    optimizedPlan.description += ' (SEPO Optimized)';
    optimizedPlan.createdAt = Date.now();

    return optimizedPlan;
  }

  private applySuggestion(plan: ExecutionPlan, suggestion: OptimizationSuggestion): ExecutionPlan {
    const newSteps = [...plan.steps];

    switch (suggestion.type) {
      case 'remove_step':
        if (suggestion.targetStepIndex !== undefined) {
          newSteps.splice(suggestion.targetStepIndex, 1);
        }
        break;

      case 'add_check':
        // 在所有主要操作前添加等待/检查
        // 这里简单实现在开头添加一个 wait
        if (!newSteps.some(s => s.actionType === 'wait')) {
          newSteps.unshift({
            description: 'Wait for system stability',
            actionType: 'wait',
            params: { duration: 1000 },
            reversible: false,
            riskLevel: 'safe'
          });
        }
        break;

      case 'adjust_params':
        // 调整全局或特定步骤参数
        if (suggestion.params) {
          newSteps.forEach(step => {
            if (suggestion.targetStepIndex === undefined || step.order === suggestion.targetStepIndex) {
              step.params = { ...step.params, ...suggestion.params };
            }
          });
        }
        break;

      // 其他类型暂不实现复杂逻辑
    }

    // 重新排序
    newSteps.forEach((step, index) => {
      step.order = index + 1;
    });

    return {
      ...plan,
      steps: newSteps
    };
  }
}
