/**
 * RAG Memory Retrieval - 检索增强生成记忆系统
 *
 * 参考 Cradle 和 Agent-S 的设计:
 * - Cradle: 使用 RAG 从经验库检索相似任务
 * - Agent-S: Experience-Augmented Hierarchical Planning
 *
 * 核心功能:
 * - 向量化存储记忆 (embeddings)
 * - 相似度检索
 * - 多维度过滤 (应用、时间、任务类型)
 * - 经验增强的任务规划
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// ============ 类型定义 ============

/**
 * 记忆条目 (用于向量化)
 */
export interface MemoryEntry {
  /** 唯一 ID */
  id: string;
  /** 内容文本 */
  content: string;
  /** 记忆类型 */
  type: 'episodic' | 'semantic' | 'procedural' | 'experience';
  /** 应用上下文 */
  appContext?: string;
  /** 任务类型 */
  taskType?: string;
  /** 元数据 */
  metadata: Record<string, unknown>;
  /** 创建时间 */
  createdAt: number;
  /** 成功标记 */
  success?: boolean;
  /** 重要性分数 */
  importance: number;
}

/**
 * 向量化的记忆
 */
export interface VectorizedMemory extends MemoryEntry {
  /** 嵌入向量 */
  embedding: number[];
  /** 向量维度 */
  dimension: number;
}

/**
 * 检索结果
 */
export interface RetrievalResult {
  /** 记忆条目 */
  memory: MemoryEntry;
  /** 相似度分数 (0-1) */
  similarity: number;
  /** 排名 */
  rank: number;
}

/**
 * 检索选项
 */
export interface RetrievalOptions {
  /** 返回结果数量 */
  topK?: number;
  /** 最小相似度阈值 */
  minSimilarity?: number;
  /** 按应用过滤 */
  appContext?: string;
  /** 按任务类型过滤 */
  taskType?: string;
  /** 按记忆类型过滤 */
  memoryType?: MemoryEntry['type'];
  /** 时间范围 (ms) */
  timeRange?: {
    start?: number;
    end?: number;
  };
  /** 仅检索成功的经验 */
  onlySuccess?: boolean;
  /** 重要性阈值 */
  minImportance?: number;
}

/**
 * 嵌入函数类型
 */
export type EmbeddingFunction = (text: string) => Promise<number[]>;

/**
 * RAG 配置
 */
export interface RAGConfig {
  /** 默认向量维度 */
  defaultDimension: number;
  /** 默认 topK */
  defaultTopK: number;
  /** 默认最小相似度 */
  defaultMinSimilarity: number;
  /** 是否启用缓存 */
  enableCache: boolean;
  /** 缓存大小 */
  cacheSize: number;
  /** 嵌入函数 (可选，如果不提供则使用简单的 TF-IDF) */
  embeddingFunction?: EmbeddingFunction;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: RAGConfig = {
  defaultDimension: 384,
  defaultTopK: 5,
  defaultMinSimilarity: 0.3,
  enableCache: true,
  cacheSize: 1000,
};

// ============ RAG Memory Retrieval ============

/**
 * RAGMemoryRetrieval - RAG 记忆检索系统
 *
 * 提供基于向量相似度的记忆检索能力
 */
export class RAGMemoryRetrieval extends EventEmitter {
  private config: RAGConfig;
  private memories: Map<string, VectorizedMemory> = new Map();
  private embeddingCache: Map<string, number[]> = new Map();
  private customEmbeddingFn: EmbeddingFunction | null = null;

  // TF-IDF 词汇表 (用于简单嵌入)
  private vocabulary: Map<string, number> = new Map();
  private idfScores: Map<string, number> = new Map();
  private documentCount: number = 0;

  constructor(config: Partial<RAGConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config.embeddingFunction) {
      this.customEmbeddingFn = config.embeddingFunction;
    }
  }

  /**
   * 设置自定义嵌入函数
   */
  setEmbeddingFunction(fn: EmbeddingFunction): void {
    this.customEmbeddingFn = fn;
  }

  /**
   * 添加记忆条目
   */
  async addMemory(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<string> {
    const id = this.generateId();
    const memory: MemoryEntry = {
      ...entry,
      id,
      createdAt: Date.now(),
    };

    // 生成嵌入向量
    const embedding = await this.getEmbedding(memory.content);

    const vectorized: VectorizedMemory = {
      ...memory,
      embedding,
      dimension: embedding.length,
    };

    this.memories.set(id, vectorized);
    this.documentCount++;

    // 更新 TF-IDF
    this.updateVocabulary(memory.content);

    this.emit('memory:added', { id, memory: vectorized });
    return id;
  }

  /**
   * 批量添加记忆
   */
  async addMemories(
    entries: Omit<MemoryEntry, 'id' | 'createdAt'>[]
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const entry of entries) {
      const id = await this.addMemory(entry);
      ids.push(id);
    }
    return ids;
  }

  /**
   * 检索相似记忆
   */
  async retrieve(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult[]> {
    const {
      topK = this.config.defaultTopK,
      minSimilarity = this.config.defaultMinSimilarity,
      appContext,
      taskType,
      memoryType,
      timeRange,
      onlySuccess,
      minImportance = 0,
    } = options;

    // 获取查询向量
    const queryEmbedding = await this.getEmbedding(query);

    // 计算所有记忆的相似度
    const results: RetrievalResult[] = [];

    for (const [, memory] of this.memories) {
      // 应用过滤条件
      if (appContext && memory.appContext !== appContext) continue;
      if (taskType && memory.taskType !== taskType) continue;
      if (memoryType && memory.type !== memoryType) continue;
      if (onlySuccess && !memory.success) continue;
      if (memory.importance < minImportance) continue;
      if (timeRange) {
        if (timeRange.start && memory.createdAt < timeRange.start) continue;
        if (timeRange.end && memory.createdAt > timeRange.end) continue;
      }

      // 计算余弦相似度
      const similarity = this.cosineSimilarity(queryEmbedding, memory.embedding);

      if (similarity >= minSimilarity) {
        results.push({
          memory: this.stripEmbedding(memory),
          similarity,
          rank: 0,
        });
      }
    }

    // 排序并取 topK
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, topK);

    // 更新排名
    topResults.forEach((r, i) => {
      r.rank = i + 1;
    });

    this.emit('memory:retrieved', { query, count: topResults.length });
    return topResults;
  }

  /**
   * 检索相关经验用于任务规划 (Agent-S 风格)
   */
  async retrieveExperiences(
    task: string,
    appContext?: string,
    options: Partial<RetrievalOptions> = {}
  ): Promise<{
    experiences: RetrievalResult[];
    summary: string;
  }> {
    const experiences = await this.retrieve(task, {
      ...options,
      appContext,
      memoryType: 'experience',
      onlySuccess: true,
      minImportance: 0.5,
    });

    // 生成经验摘要
    const summary = this.summarizeExperiences(experiences);

    return { experiences, summary };
  }

  /**
   * 添加成功的经验
   */
  async recordExperience(
    task: string,
    steps: string[],
    appContext?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    const content = `Task: ${task}\nSteps:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    return this.addMemory({
      content,
      type: 'experience',
      appContext,
      taskType: this.inferTaskType(task),
      metadata: {
        ...metadata,
        task,
        steps,
        stepCount: steps.length,
      },
      success: true,
      importance: this.calculateImportance(task, steps),
    });
  }

  /**
   * 获取记忆
   */
  getMemory(id: string): MemoryEntry | null {
    const memory = this.memories.get(id);
    return memory ? this.stripEmbedding(memory) : null;
  }

  /**
   * 删除记忆
   */
  deleteMemory(id: string): boolean {
    const deleted = this.memories.delete(id);
    if (deleted) {
      this.documentCount--;
      this.emit('memory:deleted', { id });
    }
    return deleted;
  }

  /**
   * 清空所有记忆
   */
  clear(): void {
    this.memories.clear();
    this.vocabulary.clear();
    this.idfScores.clear();
    this.embeddingCache.clear();
    this.documentCount = 0;
    this.emit('memory:cleared');
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalMemories: number;
    byType: Record<string, number>;
    byApp: Record<string, number>;
    averageImportance: number;
  } {
    const byType: Record<string, number> = {};
    const byApp: Record<string, number> = {};
    let totalImportance = 0;

    for (const [, memory] of this.memories) {
      byType[memory.type] = (byType[memory.type] || 0) + 1;
      if (memory.appContext) {
        byApp[memory.appContext] = (byApp[memory.appContext] || 0) + 1;
      }
      totalImportance += memory.importance;
    }

    return {
      totalMemories: this.memories.size,
      byType,
      byApp,
      averageImportance:
        this.memories.size > 0 ? totalImportance / this.memories.size : 0,
    };
  }

  /**
   * 导出记忆 (用于持久化)
   */
  export(): VectorizedMemory[] {
    return Array.from(this.memories.values());
  }

  /**
   * 导入记忆
   */
  import(memories: VectorizedMemory[]): void {
    for (const memory of memories) {
      this.memories.set(memory.id, memory);
      this.documentCount++;
      this.updateVocabulary(memory.content);
    }
    this.emit('memory:imported', { count: memories.length });
  }

  // ============ 私有方法 ============

  /**
   * 获取文本嵌入
   */
  private async getEmbedding(text: string): Promise<number[]> {
    // 检查缓存
    const cacheKey = this.hashText(text);
    if (this.config.enableCache && this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    let embedding: number[];

    if (this.customEmbeddingFn) {
      // 使用自定义嵌入函数 (如 OpenAI embeddings)
      embedding = await this.customEmbeddingFn(text);
    } else {
      // 使用简单的 TF-IDF 嵌入
      embedding = this.tfidfEmbedding(text);
    }

    // 缓存
    if (this.config.enableCache) {
      if (this.embeddingCache.size >= this.config.cacheSize) {
        // LRU: 删除最旧的条目
        const firstKey = this.embeddingCache.keys().next().value;
        if (firstKey) {
          this.embeddingCache.delete(firstKey);
        }
      }
      this.embeddingCache.set(cacheKey, embedding);
    }

    return embedding;
  }

  /**
   * 简单的 TF-IDF 嵌入
   */
  private tfidfEmbedding(text: string): number[] {
    const tokens = this.tokenize(text);
    const tf: Map<string, number> = new Map();

    // 计算词频
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // 生成固定维度的向量
    const embedding = new Array(this.config.defaultDimension).fill(0);

    for (const [token, freq] of tf) {
      const idf = this.idfScores.get(token) || Math.log(this.documentCount + 1);
      const tfidf = (freq / tokens.length) * idf;

      // 使用哈希将词映射到向量位置
      const index = this.hashToIndex(token, this.config.defaultDimension);
      embedding[index] += tfidf;
    }

    // 归一化
    return this.normalize(embedding);
  }

  /**
   * 更新词汇表和 IDF
   */
  private updateVocabulary(text: string): void {
    const tokens = new Set(this.tokenize(text));

    for (const token of tokens) {
      const count = this.vocabulary.get(token) || 0;
      this.vocabulary.set(token, count + 1);

      // 更新 IDF
      const df = this.vocabulary.get(token)!;
      this.idfScores.set(token, Math.log((this.documentCount + 1) / (df + 1)));
    }
  }

  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      // 调整维度
      const maxLen = Math.max(a.length, b.length);
      a = [...a, ...new Array(maxLen - a.length).fill(0)];
      b = [...b, ...new Array(maxLen - b.length).fill(0)];
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * 向量归一化
   */
  private normalize(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return norm === 0 ? vec : vec.map((v) => v / norm);
  }

  /**
   * 哈希到索引
   */
  private hashToIndex(text: string, maxIndex: number): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) % maxIndex;
    }
    return Math.abs(hash);
  }

  /**
   * 文本哈希
   */
  private hashText(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  /**
   * 生成 ID
   */
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * 移除嵌入向量 (返回时不暴露向量)
   */
  private stripEmbedding(memory: VectorizedMemory): MemoryEntry {
    const { embedding: _embedding, dimension: _dimension, ...rest } = memory;
    return rest;
  }

  /**
   * 推断任务类型
   */
  private inferTaskType(task: string): string {
    const taskLower = task.toLowerCase();

    if (taskLower.includes('click') || taskLower.includes('点击')) {
      return 'click';
    }
    if (taskLower.includes('type') || taskLower.includes('输入') || taskLower.includes('填写')) {
      return 'type';
    }
    if (taskLower.includes('search') || taskLower.includes('搜索') || taskLower.includes('查找')) {
      return 'search';
    }
    if (taskLower.includes('open') || taskLower.includes('打开') || taskLower.includes('启动')) {
      return 'open';
    }
    if (taskLower.includes('copy') || taskLower.includes('复制')) {
      return 'copy';
    }
    if (taskLower.includes('paste') || taskLower.includes('粘贴')) {
      return 'paste';
    }
    if (taskLower.includes('scroll') || taskLower.includes('滚动')) {
      return 'scroll';
    }
    if (taskLower.includes('navigate') || taskLower.includes('导航') || taskLower.includes('跳转')) {
      return 'navigate';
    }

    return 'general';
  }

  /**
   * 计算重要性分数
   */
  private calculateImportance(task: string, steps: string[]): number {
    let score = 0.5;

    // 步骤数量影响
    if (steps.length > 5) score += 0.2;
    else if (steps.length > 3) score += 0.1;

    // 任务复杂度 (通过关键词)
    const complexKeywords = ['multiple', 'several', '多个', '批量', 'loop', '循环'];
    for (const keyword of complexKeywords) {
      if (task.toLowerCase().includes(keyword)) {
        score += 0.1;
        break;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * 总结检索到的经验
   */
  private summarizeExperiences(experiences: RetrievalResult[]): string {
    if (experiences.length === 0) {
      return 'No relevant experiences found.';
    }

    const summaries = experiences.map((exp, i) => {
      const meta = exp.memory.metadata as { task?: string; stepCount?: number };
      return `${i + 1}. ${meta.task || exp.memory.content.slice(0, 50)}... (${meta.stepCount || 'N/A'} steps, similarity: ${(exp.similarity * 100).toFixed(1)}%)`;
    });

    return `Found ${experiences.length} relevant experiences:\n${summaries.join('\n')}`;
  }
}

// ============ 单例支持 ============

let globalRAGRetrieval: RAGMemoryRetrieval | null = null;

export function getRAGRetrieval(): RAGMemoryRetrieval {
  if (!globalRAGRetrieval) {
    globalRAGRetrieval = new RAGMemoryRetrieval();
  }
  return globalRAGRetrieval;
}

export function createRAGRetrieval(config?: Partial<RAGConfig>): RAGMemoryRetrieval {
  return new RAGMemoryRetrieval(config);
}

export function setRAGRetrieval(retrieval: RAGMemoryRetrieval): void {
  globalRAGRetrieval = retrieval;
}
