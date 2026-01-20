/**
 * 建议生成器 - 管理和过滤建议
 */

import type { TaskSuggestion } from '../types';

export class SuggestionGenerator {
  private suggestions: Map<string, TaskSuggestion> = new Map();

  /**
   * 添加建议
   */
  add(suggestions: TaskSuggestion[]): void {
    for (const suggestion of suggestions) {
      this.suggestions.set(suggestion.id, suggestion);
    }
  }

  /**
   * 获取所有建议
   */
  getAll(): TaskSuggestion[] {
    return Array.from(this.suggestions.values());
  }

  /**
   * 按置信度排序获取建议
   */
  getSorted(): TaskSuggestion[] {
    return this.getAll().sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 获取置信度高于阈值的建议
   */
  getHighConfidence(threshold: number = 0.7): TaskSuggestion[] {
    return this.getSorted().filter((s) => s.confidence >= threshold);
  }

  /**
   * 按类型过滤
   */
  getByType(type: TaskSuggestion['type']): TaskSuggestion[] {
    return this.getAll().filter((s) => s.type === type);
  }

  /**
   * 获取单个建议
   */
  get(id: string): TaskSuggestion | undefined {
    return this.suggestions.get(id);
  }

  /**
   * 移除建议
   */
  remove(id: string): boolean {
    return this.suggestions.delete(id);
  }

  /**
   * 清空所有建议
   */
  clear(): void {
    this.suggestions.clear();
  }

  /**
   * 获取建议数量
   */
  get count(): number {
    return this.suggestions.size;
  }

  /**
   * 合并去重（相似的建议只保留置信度最高的）
   */
  deduplicate(): void {
    const titleMap = new Map<string, TaskSuggestion>();

    for (const suggestion of this.suggestions.values()) {
      const normalizedTitle = suggestion.title.toLowerCase().trim();
      const existing = titleMap.get(normalizedTitle);

      if (!existing || suggestion.confidence > existing.confidence) {
        titleMap.set(normalizedTitle, suggestion);
      }
    }

    this.suggestions.clear();
    for (const suggestion of titleMap.values()) {
      this.suggestions.set(suggestion.id, suggestion);
    }
  }
}
