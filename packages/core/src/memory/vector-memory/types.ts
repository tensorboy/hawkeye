/**
 * Vector Memory System - 类型定义
 * 基于 clawdbot/memory 的设计模式
 */

// ============ 基础类型 ============

export interface MemoryChunk {
  id: string;
  path: string;
  source: 'memory' | 'session' | 'user' | 'system';
  lineStart: number;
  lineEnd: number;
  hash: string;
  model: string;
  text: string;
  embedding?: number[];
  createdAt: number;
  updatedAt: number;
}

export interface FileMetadata {
  path: string;
  source: string;
  hash: string;
  mtime: number;
  size: number;
}

export interface EmbeddingCacheEntry {
  provider: string;
  model: string;
  hash: string;
  embedding: number[];
  dimensions: number;
  updatedAt: number;
}

// ============ Embedding Provider ============

export type EmbeddingProviderType = 'openai' | 'gemini' | 'local' | 'auto';

export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embedQuery(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingConfig {
  provider: EmbeddingProviderType;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  dimensions?: number;
  batchSize?: number;
  maxRetries?: number;
}

// ============ Search ============

export interface SearchResult {
  chunk: MemoryChunk;
  score: number;
  source: 'vector' | 'fts' | 'hybrid';
}

export interface SearchOptions {
  /** 最大返回结果数 */
  limit?: number;
  /** 最小相似度分数 (0-1) */
  minScore?: number;
  /** 向量搜索权重 (默认 0.6) */
  vectorWeight?: number;
  /** 全文搜索权重 (默认 0.4) */
  ftsWeight?: number;
  /** 按来源过滤 */
  source?: MemoryChunk['source'];
  /** 按路径前缀过滤 */
  pathPrefix?: string;
}

// ============ Memory Manager ============

export interface VectorMemoryConfig {
  /** 数据库路径 */
  dbPath?: string;
  /** Embedding 配置 */
  embedding: EmbeddingConfig;
  /** 分块 token 大小 */
  chunkSize?: number;
  /** 分块重叠 */
  chunkOverlap?: number;
  /** 最大缓存条目 */
  maxCacheEntries?: number;
  /** 是否启用 FTS */
  enableFTS?: boolean;
  /** 同步间隔 (ms) */
  syncInterval?: number;
  /** 会话文件增量阈值 (bytes) */
  sessionDeltaThreshold?: number;
}

export interface MemoryStats {
  totalChunks: number;
  totalFiles: number;
  cacheSize: number;
  lastSyncAt: number;
  embeddingModel: string;
  dimensions: number;
}

// ============ 常量 ============

export const DEFAULT_VECTOR_MEMORY_CONFIG: VectorMemoryConfig = {
  embedding: {
    provider: 'auto',
    dimensions: 384,
    batchSize: 10,
    maxRetries: 3,
  },
  chunkSize: 512,
  chunkOverlap: 64,
  maxCacheEntries: 10000,
  enableFTS: true,
  syncInterval: 60000, // 1 minute
  sessionDeltaThreshold: 4096, // 4KB
};

export const VECTOR_SEARCH_WEIGHTS = {
  vector: 0.6,
  fts: 0.4,
};
