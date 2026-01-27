/**
 * Feedback Collector - 反馈收集器
 * 收集执行反馈并存储到向量数据库，用于长期学习
 */

import type { VectorStore } from '../../storage/vector-store';
import type { ExecutionPlan } from '../../ai/types';
import type { ExecutionResult } from '../../types';
import type { ExecutionQuality } from './quality-metrics';

export class FeedbackCollector {
  constructor(private vectorStore: VectorStore) {}

  /**
   * 收集并存储反馈
   */
  async collect(
    plan: ExecutionPlan,
    result: ExecutionResult,
    quality: ExecutionQuality
  ): Promise<void> {
    // 构建存储的文档内容
    const content = `
Intent: ${plan.intent.description}
Plan: ${plan.title}
Result: ${result.success ? 'Success' : 'Failure'}
Error: ${result.error || 'None'}
Quality Score: ${quality.score}
Suggestions: ${quality.suggestions.map(s => s.reasoning).join('; ')}
    `.trim();

    // 存储到向量数据库
    await this.vectorStore.add(
      `sepo_feedback_${plan.id}_${Date.now()}`,
      content,
      {
        type: 'sepo_feedback',
        intentId: plan.intent.id,
        planId: plan.id,
        success: result.success,
        score: quality.score,
        timestamp: Date.now()
      }
    );
  }

  /**
   * 检索类似任务的历史反馈
   */
  async retrieveRelevantFeedback(intentDescription: string): Promise<string[]> {
    const results = await this.vectorStore.search(
      `feedback for: ${intentDescription}`,
      5
    );

    return results.map((r: { document: { content: string } }) => r.document.content);
  }
}
