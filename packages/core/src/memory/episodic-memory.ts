/**
 * 情节记忆管理器
 * Episodic Memory Manager
 *
 * 记录用户的具体行为事件和上下文
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  EpisodicMemory,
  EventType,
  WindowInfo,
  EpisodicMemoryConfig,
  MemoryQuery,
  MemoryQueryResult,
  DEFAULT_EPISODIC_CONFIG,
} from './types';

/**
 * 情节记忆事件
 */
export interface EpisodicMemoryEvents {
  'memory:added': (memory: EpisodicMemory) => void;
  'memory:updated': (memory: EpisodicMemory) => void;
  'memory:removed': (id: string) => void;
  'memory:consolidated': (originalIds: string[], newId: string) => void;
  'cleanup:completed': (removedCount: number) => void;
}

/**
 * 情节记忆管理器
 */
export class EpisodicMemoryManager extends EventEmitter {
  private memories: Map<string, EpisodicMemory> = new Map();
  private config: EpisodicMemoryConfig;
  private consolidationTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<EpisodicMemoryConfig>) {
    super();
    this.config = { ...DEFAULT_EPISODIC_CONFIG, ...config };

    if (this.config.autoConsolidate) {
      this.startConsolidationTimer();
    }
  }

  /**
   * 记录事件
   */
  recordEvent(params: {
    type: EventType;
    source: EpisodicMemory['event']['source'];
    data: Record<string, unknown>;
    context: {
      activeWindow: WindowInfo;
      recentClipboard?: string;
      openFiles?: string[];
      runningApps?: string[];
    };
    importance?: number;
    tags?: string[];
  }): EpisodicMemory {
    const now = Date.now();

    const memory: EpisodicMemory = {
      id: uuidv4(),
      timestamp: now,
      event: {
        type: params.type,
        source: params.source,
        data: params.data,
      },
      context: {
        activeWindow: params.context.activeWindow,
        recentClipboard: params.context.recentClipboard,
        openFiles: params.context.openFiles ?? [],
        runningApps: params.context.runningApps ?? [],
      },
      metadata: {
        importance: params.importance ?? this.calculateImportance(params.type),
        emotionalValence: 0,  // 默认中性
        tags: params.tags ?? [],
      },
      associations: {
        relatedMemories: [],
        causalLinks: [],
      },
      decay: {
        lastAccessed: now,
        accessCount: 0,
        retentionScore: 1.0,
      },
    };

    // 检查是否超过最大记录数
    if (this.memories.size >= this.config.maxItems) {
      this.removeOldestLowImportanceMemory();
    }

    // 自动关联最近的相关记忆
    const relatedIds = this.findRelatedMemories(memory);
    memory.associations.relatedMemories = relatedIds.slice(0, 5);

    this.memories.set(memory.id, memory);
    this.emit('memory:added', memory);

    return memory;
  }

  /**
   * 获取记忆
   */
  getMemory(id: string): EpisodicMemory | undefined {
    const memory = this.memories.get(id);
    if (memory) {
      // 更新访问信息
      memory.decay.lastAccessed = Date.now();
      memory.decay.accessCount++;
    }
    return memory;
  }

  /**
   * 查询记忆
   */
  query(query: MemoryQuery): MemoryQueryResult<EpisodicMemory> {
    const startTime = Date.now();
    let results = Array.from(this.memories.values());

    // 时间范围过滤
    if (query.timeRange) {
      results = results.filter(
        m => m.timestamp >= query.timeRange!.start && m.timestamp <= query.timeRange!.end
      );
    }

    // 重要性过滤
    if (query.importance) {
      if (query.importance.min !== undefined) {
        results = results.filter(m => m.metadata.importance >= query.importance!.min!);
      }
      if (query.importance.max !== undefined) {
        results = results.filter(m => m.metadata.importance <= query.importance!.max!);
      }
    }

    // 关键词过滤
    if (query.keywords && query.keywords.length > 0) {
      const keywords = query.keywords.map(k => k.toLowerCase());
      results = results.filter(m => {
        const searchText = [
          m.context.activeWindow.title,
          m.context.activeWindow.appName,
          ...m.metadata.tags,
          JSON.stringify(m.event.data),
        ].join(' ').toLowerCase();

        return keywords.some(k => searchText.includes(k));
      });
    }

    // 排序
    const sortBy = query.sortBy ?? 'timestamp';
    const sortOrder = query.sortOrder ?? 'desc';
    const sortMultiplier = sortOrder === 'desc' ? -1 : 1;

    results.sort((a, b) => {
      switch (sortBy) {
        case 'timestamp':
          return (a.timestamp - b.timestamp) * sortMultiplier;
        case 'importance':
          return (a.metadata.importance - b.metadata.importance) * sortMultiplier;
        case 'relevance':
          // 综合考虑重要性和时间
          const aScore = a.metadata.importance * this.calculateDecay(a);
          const bScore = b.metadata.importance * this.calculateDecay(b);
          return (aScore - bScore) * sortMultiplier;
        default:
          return 0;
      }
    });

    const total = results.length;

    // 分页
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    results = results.slice(offset, offset + limit);

    return {
      items: results,
      total,
      query,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * 获取最近的记忆
   */
  getRecentMemories(limit: number = 10): EpisodicMemory[] {
    return this.query({
      sortBy: 'timestamp',
      sortOrder: 'desc',
      limit,
    }).items;
  }

  /**
   * 按事件类型获取
   */
  getByEventType(type: EventType, limit?: number): EpisodicMemory[] {
    let results = Array.from(this.memories.values())
      .filter(m => m.event.type === type)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (limit) {
      results = results.slice(0, limit);
    }

    return results;
  }

  /**
   * 按应用获取
   */
  getByApp(appName: string, limit?: number): EpisodicMemory[] {
    let results = Array.from(this.memories.values())
      .filter(m => m.context.activeWindow.appName === appName)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (limit) {
      results = results.slice(0, limit);
    }

    return results;
  }

  /**
   * 更新记忆的关联
   */
  updateAssociations(
    id: string,
    associations: Partial<EpisodicMemory['associations']>
  ): void {
    const memory = this.memories.get(id);
    if (!memory) return;

    if (associations.relatedMemories) {
      memory.associations.relatedMemories = [
        ...new Set([...memory.associations.relatedMemories, ...associations.relatedMemories])
      ];
    }

    if (associations.causalLinks) {
      memory.associations.causalLinks = [
        ...new Set([...memory.associations.causalLinks, ...associations.causalLinks])
      ];
    }

    this.emit('memory:updated', memory);
  }

  /**
   * 添加标签
   */
  addTags(id: string, tags: string[]): void {
    const memory = this.memories.get(id);
    if (!memory) return;

    memory.metadata.tags = [...new Set([...memory.metadata.tags, ...tags])];
    this.emit('memory:updated', memory);
  }

  /**
   * 删除记忆
   */
  removeMemory(id: string): boolean {
    const removed = this.memories.delete(id);
    if (removed) {
      this.emit('memory:removed', id);
    }
    return removed;
  }

  /**
   * 整合相似记忆
   */
  consolidate(): { consolidated: number; removed: number } {
    let consolidated = 0;
    let removed = 0;

    // 按事件类型和应用分组
    const groups = new Map<string, EpisodicMemory[]>();

    for (const memory of this.memories.values()) {
      const key = `${memory.event.type}:${memory.context.activeWindow.appName}`;
      const group = groups.get(key) ?? [];
      group.push(memory);
      groups.set(key, group);
    }

    // 处理每个分组
    for (const [_, group] of groups) {
      if (group.length < 3) continue;

      // 按时间排序
      group.sort((a, b) => a.timestamp - b.timestamp);

      // 查找时间相近的记忆（5分钟内）
      const timeWindow = 5 * 60 * 1000;
      let i = 0;

      while (i < group.length - 1) {
        const cluster: EpisodicMemory[] = [group[i]];

        // 收集时间相近的记忆
        let j = i + 1;
        while (j < group.length && group[j].timestamp - group[j - 1].timestamp < timeWindow) {
          cluster.push(group[j]);
          j++;
        }

        // 如果聚类中有多个记忆，则整合
        if (cluster.length > 2) {
          const mergedMemory = this.mergeMemories(cluster);
          const originalIds = cluster.map(m => m.id);

          // 删除原始记忆
          for (const m of cluster) {
            this.memories.delete(m.id);
            removed++;
          }

          // 添加整合后的记忆
          this.memories.set(mergedMemory.id, mergedMemory);
          consolidated++;

          this.emit('memory:consolidated', originalIds, mergedMemory.id);
        }

        i = j;
      }
    }

    return { consolidated, removed };
  }

  /**
   * 清理过期和低重要性记忆
   */
  cleanup(): number {
    const now = Date.now();
    const cutoffTime = now - this.config.retentionDays * 24 * 60 * 60 * 1000;
    let removedCount = 0;

    for (const [id, memory] of this.memories) {
      // 检查时间
      if (memory.timestamp < cutoffTime) {
        this.memories.delete(id);
        removedCount++;
        continue;
      }

      // 更新衰减分数
      memory.decay.retentionScore = this.calculateDecay(memory);

      // 检查重要性和衰减
      if (memory.metadata.importance < this.config.importanceThreshold &&
          memory.decay.retentionScore < 0.3) {
        this.memories.delete(id);
        removedCount++;
      }
    }

    this.emit('cleanup:completed', removedCount);
    return removedCount;
  }

  /**
   * 获取统计信息
   */
  getStatistics(): {
    totalMemories: number;
    byEventType: Record<string, number>;
    byApp: Record<string, number>;
    averageImportance: number;
    oldestTimestamp: number;
    newestTimestamp: number;
  } {
    const byEventType: Record<string, number> = {};
    const byApp: Record<string, number> = {};
    let totalImportance = 0;
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;

    for (const memory of this.memories.values()) {
      byEventType[memory.event.type] = (byEventType[memory.event.type] || 0) + 1;
      byApp[memory.context.activeWindow.appName] = (byApp[memory.context.activeWindow.appName] || 0) + 1;
      totalImportance += memory.metadata.importance;

      if (memory.timestamp < oldestTimestamp) oldestTimestamp = memory.timestamp;
      if (memory.timestamp > newestTimestamp) newestTimestamp = memory.timestamp;
    }

    return {
      totalMemories: this.memories.size,
      byEventType,
      byApp,
      averageImportance: this.memories.size > 0 ? totalImportance / this.memories.size : 0,
      oldestTimestamp: oldestTimestamp === Infinity ? 0 : oldestTimestamp,
      newestTimestamp,
    };
  }

  /**
   * 计算事件的默认重要性
   */
  private calculateImportance(eventType: EventType): number {
    const importanceMap: Record<EventType, number> = {
      [EventType.SCREEN_CAPTURE]: 0.3,
      [EventType.CLIPBOARD_COPY]: 0.4,
      [EventType.FILE_CREATED]: 0.6,
      [EventType.FILE_MODIFIED]: 0.5,
      [EventType.FILE_MOVED]: 0.5,
      [EventType.FILE_DELETED]: 0.7,
      [EventType.WINDOW_SWITCH]: 0.2,
      [EventType.APP_LAUNCH]: 0.4,
      [EventType.APP_CLOSE]: 0.3,
      [EventType.SUGGESTION_SHOWN]: 0.3,
      [EventType.SUGGESTION_ACCEPTED]: 0.8,
      [EventType.SUGGESTION_REJECTED]: 0.5,
      [EventType.TASK_STARTED]: 0.7,
      [EventType.TASK_COMPLETED]: 0.9,
      [EventType.ERROR_DETECTED]: 0.8,
      [EventType.USER_INPUT]: 0.5,
      [EventType.BROWSER_NAVIGATE]: 0.3,
    };

    return importanceMap[eventType] ?? 0.5;
  }

  /**
   * 计算衰减系数
   */
  private calculateDecay(memory: EpisodicMemory): number {
    const now = Date.now();
    const daysSinceCreation = (now - memory.timestamp) / (24 * 60 * 60 * 1000);
    const daysSinceAccess = (now - memory.decay.lastAccessed) / (24 * 60 * 60 * 1000);

    // 遗忘曲线：基于艾宾浩斯遗忘曲线
    const baseDecay = Math.exp(-daysSinceAccess / 7);  // 7天半衰期

    // 访问频率加成
    const accessBonus = Math.min(memory.decay.accessCount * 0.1, 0.5);

    // 重要性加成
    const importanceBonus = memory.metadata.importance * 0.3;

    return Math.min(1, baseDecay + accessBonus + importanceBonus);
  }

  /**
   * 查找相关记忆
   */
  private findRelatedMemories(memory: EpisodicMemory): string[] {
    const related: { id: string; score: number }[] = [];
    const recentWindow = 30 * 60 * 1000; // 30 minutes

    for (const [id, other] of this.memories) {
      if (id === memory.id) continue;

      let score = 0;

      // 时间相近性
      const timeDiff = Math.abs(memory.timestamp - other.timestamp);
      if (timeDiff < recentWindow) {
        score += 1 - timeDiff / recentWindow;
      }

      // 相同应用
      if (memory.context.activeWindow.appName === other.context.activeWindow.appName) {
        score += 0.5;
      }

      // 相同事件类型
      if (memory.event.type === other.event.type) {
        score += 0.3;
      }

      // 标签重叠
      const commonTags = memory.metadata.tags.filter(t =>
        other.metadata.tags.includes(t)
      );
      score += commonTags.length * 0.2;

      if (score > 0.3) {
        related.push({ id, score });
      }
    }

    // 按分数排序并返回 ID
    return related
      .sort((a, b) => b.score - a.score)
      .map(r => r.id);
  }

  /**
   * 合并多个记忆
   */
  private mergeMemories(memories: EpisodicMemory[]): EpisodicMemory {
    // 取最高重要性
    const maxImportance = Math.max(...memories.map(m => m.metadata.importance));

    // 合并标签
    const allTags = new Set<string>();
    for (const m of memories) {
      for (const tag of m.metadata.tags) {
        allTags.add(tag);
      }
    }

    // 合并关联
    const allRelated = new Set<string>();
    const allCausal = new Set<string>();
    for (const m of memories) {
      for (const id of m.associations.relatedMemories) {
        allRelated.add(id);
      }
      for (const id of m.associations.causalLinks) {
        allCausal.add(id);
      }
    }

    // 创建合并记忆
    return {
      id: uuidv4(),
      timestamp: memories[0].timestamp,  // 使用最早的时间
      event: {
        ...memories[0].event,
        data: {
          ...memories[0].event.data,
          mergedCount: memories.length,
          mergedFrom: memories.map(m => m.id),
        },
      },
      context: memories[0].context,
      metadata: {
        importance: maxImportance,
        emotionalValence: memories.reduce((sum, m) => sum + m.metadata.emotionalValence, 0) / memories.length,
        tags: Array.from(allTags),
      },
      associations: {
        relatedMemories: Array.from(allRelated),
        causalLinks: Array.from(allCausal),
      },
      decay: {
        lastAccessed: Date.now(),
        accessCount: memories.reduce((sum, m) => sum + m.decay.accessCount, 0),
        retentionScore: 1.0,
      },
    };
  }

  /**
   * 删除最旧的低重要性记忆
   */
  private removeOldestLowImportanceMemory(): void {
    let oldest: EpisodicMemory | null = null;
    let lowestScore = Infinity;

    for (const memory of this.memories.values()) {
      const score = memory.metadata.importance * this.calculateDecay(memory);
      if (score < lowestScore) {
        lowestScore = score;
        oldest = memory;
      }
    }

    if (oldest) {
      this.memories.delete(oldest.id);
      this.emit('memory:removed', oldest.id);
    }
  }

  /**
   * 启动整合定时器
   */
  private startConsolidationTimer(): void {
    this.consolidationTimer = setInterval(() => {
      this.consolidate();
      this.cleanup();
    }, this.config.consolidationInterval);
  }

  /**
   * 导出所有记忆
   */
  exportAll(): EpisodicMemory[] {
    return Array.from(this.memories.values());
  }

  /**
   * 导入记忆
   */
  importAll(memories: EpisodicMemory[]): void {
    for (const memory of memories) {
      this.memories.set(memory.id, memory);
    }
  }

  /**
   * 清空所有记忆
   */
  clear(): void {
    this.memories.clear();
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
      this.consolidationTimer = null;
    }
  }
}

/**
 * 创建情节记忆管理器
 */
export function createEpisodicMemory(
  config?: Partial<EpisodicMemoryConfig>
): EpisodicMemoryManager {
  return new EpisodicMemoryManager(config);
}
