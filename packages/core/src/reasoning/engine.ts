/**
 * 推理引擎 - 整合 AI 分析和建议管理
 */

import { ClaudeClient, type ClaudeClientConfig } from './claude';
import { SuggestionGenerator } from './suggestions';
import type { PerceptionContext, TaskSuggestion } from '../types';

export interface ReasoningEngineConfig extends ClaudeClientConfig {
  /** 自动去重 */
  autoDeduplicate?: boolean;
  /** 最小置信度阈值 */
  minConfidence?: number;
}

export class ReasoningEngine {
  private claude: ClaudeClient;
  private generator: SuggestionGenerator;
  private config: ReasoningEngineConfig;

  constructor(config: ReasoningEngineConfig) {
    this.config = {
      autoDeduplicate: true,
      minConfidence: 0.3,
      ...config,
    };

    this.claude = new ClaudeClient(config);
    this.generator = new SuggestionGenerator();
  }

  /**
   * 分析感知上下文并生成建议
   */
  async reason(context: PerceptionContext): Promise<TaskSuggestion[]> {
    // 调用 Claude 分析
    const suggestions = await this.claude.analyze(context);

    // 过滤低置信度建议
    const filtered = suggestions.filter(
      (s) => s.confidence >= (this.config.minConfidence || 0)
    );

    // 添加到生成器
    this.generator.add(filtered);

    // 自动去重
    if (this.config.autoDeduplicate) {
      this.generator.deduplicate();
    }

    return this.generator.getSorted();
  }

  /**
   * 基于文本输入分析
   */
  async reasonFromText(text: string, additionalContext?: string): Promise<TaskSuggestion[]> {
    const suggestions = await this.claude.analyzeText(text, additionalContext);

    const filtered = suggestions.filter(
      (s) => s.confidence >= (this.config.minConfidence || 0)
    );

    this.generator.add(filtered);

    if (this.config.autoDeduplicate) {
      this.generator.deduplicate();
    }

    return this.generator.getSorted();
  }

  /**
   * 获取当前所有建议
   */
  getSuggestions(): TaskSuggestion[] {
    return this.generator.getSorted();
  }

  /**
   * 获取高置信度建议
   */
  getTopSuggestions(threshold?: number): TaskSuggestion[] {
    return this.generator.getHighConfidence(threshold);
  }

  /**
   * 获取单个建议
   */
  getSuggestion(id: string): TaskSuggestion | undefined {
    return this.generator.get(id);
  }

  /**
   * 移除建议
   */
  removeSuggestion(id: string): void {
    this.generator.remove(id);
  }

  /**
   * 清空所有建议
   */
  clearSuggestions(): void {
    this.generator.clear();
  }
}
