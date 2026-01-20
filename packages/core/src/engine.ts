/**
 * Hawkeye 主引擎
 * 整合感知、推理、执行三大能力
 */

import { PerceptionEngine, type PerceptionEngineConfig } from './perception/engine';
import { ReasoningEngine, type ReasoningEngineConfig } from './reasoning/engine';
import { ExecutionEngine, type ExecutionEngineConfig } from './execution/engine';
import { Storage, type StorageConfig } from './storage/storage';
import type {
  EngineConfig,
  PerceptionContext,
  TaskSuggestion,
  TaskExecution,
} from './types';

export interface HawkeyeEngineConfig extends EngineConfig {
  perception?: PerceptionEngineConfig;
  reasoning?: Omit<ReasoningEngineConfig, 'apiKey'>;
  execution?: ExecutionEngineConfig;
  storage?: StorageConfig;
}

export class YanliqinEngine {
  private perception: PerceptionEngine;
  private reasoning: ReasoningEngine;
  private execution: ExecutionEngine;
  private storage: Storage;
  private config: HawkeyeEngineConfig;

  constructor(config: HawkeyeEngineConfig) {
    this.config = config;

    // 初始化各引擎
    this.perception = new PerceptionEngine(config.perception);
    this.reasoning = new ReasoningEngine({
      apiKey: config.anthropicApiKey,
      model: config.model,
      ...config.reasoning,
    });
    this.execution = new ExecutionEngine(config.execution);
    this.storage = new Storage(config.storage);
  }

  /**
   * 完整的感知-推理-建议流程
   */
  async observe(): Promise<TaskSuggestion[]> {
    // 1. 感知
    const context = await this.perception.perceive();

    // 2. 推理
    const suggestions = await this.reasoning.reason(context);

    // 3. 保存到历史
    await this.saveSuggestionsHistory(suggestions);

    return suggestions;
  }

  /**
   * 基于文本输入分析
   */
  async analyzeText(text: string): Promise<TaskSuggestion[]> {
    // 获取当前窗口上下文
    const window = await this.perception.getActiveWindow();
    const context = window
      ? `当前应用: ${window.appName}\n窗口标题: ${window.title}`
      : undefined;

    return this.reasoning.reasonFromText(text, context);
  }

  /**
   * 执行任务建议
   */
  async execute(suggestionId: string): Promise<TaskExecution | null> {
    const suggestion = this.reasoning.getSuggestion(suggestionId);
    if (!suggestion) {
      return null;
    }

    const execution = await this.execution.execute(suggestion);

    // 保存执行历史
    await this.saveExecutionHistory(execution);

    return execution;
  }

  /**
   * 获取当前所有建议
   */
  getSuggestions(): TaskSuggestion[] {
    return this.reasoning.getSuggestions();
  }

  /**
   * 获取高置信度建议
   */
  getTopSuggestions(threshold?: number): TaskSuggestion[] {
    return this.reasoning.getTopSuggestions(threshold);
  }

  /**
   * 清除当前建议
   */
  clearSuggestions(): void {
    this.reasoning.clearSuggestions();
  }

  /**
   * 获取执行历史
   */
  async getExecutionHistory(): Promise<TaskExecution[]> {
    return (await this.storage.load<TaskExecution[]>('execution_history')) || [];
  }

  /**
   * 获取感知引擎（用于直接访问）
   */
  getPerceptionEngine(): PerceptionEngine {
    return this.perception;
  }

  /**
   * 获取推理引擎
   */
  getReasoningEngine(): ReasoningEngine {
    return this.reasoning;
  }

  /**
   * 获取执行引擎
   */
  getExecutionEngine(): ExecutionEngine {
    return this.execution;
  }

  /**
   * 获取存储实例
   */
  getStorage(): Storage {
    return this.storage;
  }

  // 私有方法

  private async saveSuggestionsHistory(suggestions: TaskSuggestion[]): Promise<void> {
    const history = (await this.storage.load<TaskSuggestion[]>('suggestions_history')) || [];
    history.push(...suggestions);

    // 只保留最近 1000 条
    const trimmed = history.slice(-1000);
    await this.storage.save('suggestions_history', trimmed);
  }

  private async saveExecutionHistory(execution: TaskExecution): Promise<void> {
    const history = (await this.storage.load<TaskExecution[]>('execution_history')) || [];
    history.push(execution);

    // 只保留最近 1000 条
    const trimmed = history.slice(-1000);
    await this.storage.save('execution_history', trimmed);
  }
}

// 导出别名
export { YanliqinEngine as HawkeyeEngine };
