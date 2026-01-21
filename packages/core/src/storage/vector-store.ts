/**
 * Vector Store - 向量存储
 * 用于语义搜索和相似性匹配
 * 使用简单的余弦相似度实现，可扩展为使用外部向量数据库
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

export interface VectorDocument {
  id: string;
  content: string;
  vector: number[];
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface VectorSearchResult {
  document: VectorDocument;
  score: number;
}

export interface VectorStoreConfig {
  /** 存储文件路径 */
  storePath?: string;
  /** 向量维度 */
  dimension?: number;
  /** 最大文档数 */
  maxDocuments?: number;
  /** 嵌入函数 (可选，默认使用简单的词频向量) */
  embedFunction?: (text: string) => Promise<number[]>;
}

export class VectorStore {
  private config: VectorStoreConfig;
  private documents: Map<string, VectorDocument> = new Map();
  private isLoaded: boolean = false;

  constructor(config: VectorStoreConfig = {}) {
    this.config = {
      storePath: path.join(os.homedir(), '.hawkeye', 'vectors.json'),
      dimension: 384, // 默认维度
      maxDocuments: 10000,
      ...config,
    };
  }

  /**
   * 初始化并加载存储
   */
  async initialize(): Promise<void> {
    try {
      const dir = path.dirname(this.config.storePath!);
      await fs.mkdir(dir, { recursive: true });

      // 尝试加载现有数据
      try {
        const data = await fs.readFile(this.config.storePath!, 'utf-8');
        const parsed = JSON.parse(data) as VectorDocument[];
        for (const doc of parsed) {
          this.documents.set(doc.id, doc);
        }
      } catch {
        // 文件不存在或无法解析，使用空存储
      }

      this.isLoaded = true;
    } catch (error) {
      console.warn('Vector store 初始化失败:', error);
    }
  }

  /**
   * 添加文档
   */
  async add(
    id: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // 生成向量
    const vector = await this.embed(content);

    const document: VectorDocument = {
      id,
      content,
      vector,
      metadata,
      createdAt: Date.now(),
    };

    this.documents.set(id, document);

    // 限制最大文档数
    if (this.documents.size > this.config.maxDocuments!) {
      this.pruneOldest();
    }

    // 持久化
    await this.save();
  }

  /**
   * 批量添加文档
   */
  async addBatch(
    documents: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>
  ): Promise<void> {
    for (const doc of documents) {
      const vector = await this.embed(doc.content);

      this.documents.set(doc.id, {
        id: doc.id,
        content: doc.content,
        vector,
        metadata: doc.metadata,
        createdAt: Date.now(),
      });
    }

    // 限制最大文档数
    while (this.documents.size > this.config.maxDocuments!) {
      this.pruneOldest();
    }

    // 持久化
    await this.save();
  }

  /**
   * 搜索相似文档
   */
  async search(query: string, limit: number = 5): Promise<VectorSearchResult[]> {
    const queryVector = await this.embed(query);

    const results: VectorSearchResult[] = [];

    for (const document of this.documents.values()) {
      const score = this.cosineSimilarity(queryVector, document.vector);
      results.push({ document, score });
    }

    // 按相似度排序
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * 按元数据过滤并搜索
   */
  async searchWithFilter(
    query: string,
    filter: Record<string, unknown>,
    limit: number = 5
  ): Promise<VectorSearchResult[]> {
    const queryVector = await this.embed(query);

    const results: VectorSearchResult[] = [];

    for (const document of this.documents.values()) {
      // 检查过滤条件
      if (!this.matchesFilter(document.metadata || {}, filter)) {
        continue;
      }

      const score = this.cosineSimilarity(queryVector, document.vector);
      results.push({ document, score });
    }

    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * 获取文档
   */
  get(id: string): VectorDocument | undefined {
    return this.documents.get(id);
  }

  /**
   * 删除文档
   */
  async delete(id: string): Promise<boolean> {
    const deleted = this.documents.delete(id);
    if (deleted) {
      await this.save();
    }
    return deleted;
  }

  /**
   * 清空所有文档
   */
  async clear(): Promise<void> {
    this.documents.clear();
    await this.save();
  }

  /**
   * 获取文档数量
   */
  get size(): number {
    return this.documents.size;
  }

  // ============ 私有方法 ============

  /**
   * 生成文本嵌入向量
   * 如果没有配置外部嵌入函数，使用简单的 TF-IDF 风格向量
   */
  private async embed(text: string): Promise<number[]> {
    if (this.config.embedFunction) {
      return this.config.embedFunction(text);
    }

    // 简单的词袋模型向量
    return this.simpleEmbed(text);
  }

  /**
   * 简单的词袋模型嵌入
   */
  private simpleEmbed(text: string): number[] {
    const dimension = this.config.dimension!;
    const vector = new Array(dimension).fill(0);

    // 简单分词
    const words = text.toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);

    // 使用哈希将词映射到向量维度
    for (const word of words) {
      const hash = this.hashString(word);
      const index = Math.abs(hash) % dimension;
      vector[index] += 1;
    }

    // L2 归一化
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < dimension; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  /**
   * 简单字符串哈希
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * 余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * 检查元数据是否匹配过滤条件
   */
  private matchesFilter(
    metadata: Record<string, unknown>,
    filter: Record<string, unknown>
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * 删除最旧的文档
   */
  private pruneOldest(): void {
    let oldest: VectorDocument | null = null;

    for (const doc of this.documents.values()) {
      if (!oldest || doc.createdAt < oldest.createdAt) {
        oldest = doc;
      }
    }

    if (oldest) {
      this.documents.delete(oldest.id);
    }
  }

  /**
   * 保存到文件
   */
  private async save(): Promise<void> {
    if (!this.config.storePath) return;

    try {
      const data = Array.from(this.documents.values());
      await fs.writeFile(
        this.config.storePath,
        JSON.stringify(data),
        'utf-8'
      );
    } catch (error) {
      console.warn('Vector store 保存失败:', error);
    }
  }
}

/**
 * 设置 AI 嵌入函数
 * 用于将 AI Manager 的嵌入能力注入到 Vector Store
 */
export function createAIEmbedFunction(
  aiChat: (messages: Array<{ role: string; content: string }>) => Promise<{ text: string }>
): (text: string) => Promise<number[]> {
  return async (text: string): Promise<number[]> => {
    // 使用 AI 生成语义表示，然后转换为数值向量
    // 这是一个简化版本，实际应用中可以使用专门的嵌入模型
    try {
      const response = await aiChat([
        {
          role: 'system',
          content: '将以下文本转换为一个简短的语义描述，提取关键概念和主题。只返回关键词，用逗号分隔。',
        },
        {
          role: 'user',
          content: text,
        },
      ]);

      // 使用关键词生成向量
      const keywords = response.text.split(',').map(k => k.trim());
      const dimension = 384;
      const vector = new Array(dimension).fill(0);

      for (const keyword of keywords) {
        let hash = 0;
        for (let i = 0; i < keyword.length; i++) {
          hash = ((hash << 5) - hash) + keyword.charCodeAt(i);
          hash = hash & hash;
        }
        const index = Math.abs(hash) % dimension;
        vector[index] += 1;
      }

      // 归一化
      const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
      if (norm > 0) {
        for (let i = 0; i < dimension; i++) {
          vector[i] /= norm;
        }
      }

      return vector;
    } catch {
      // 回退到简单嵌入
      const dimension = 384;
      const vector = new Array(dimension).fill(0);
      const words = text.toLowerCase().split(/\s+/);

      for (const word of words) {
        let hash = 0;
        for (let i = 0; i < word.length; i++) {
          hash = ((hash << 5) - hash) + word.charCodeAt(i);
          hash = hash & hash;
        }
        const index = Math.abs(hash) % dimension;
        vector[index] += 1;
      }

      const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
      if (norm > 0) {
        for (let i = 0; i < dimension; i++) {
          vector[i] /= norm;
        }
      }

      return vector;
    }
  };
}
