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

// ============ Advanced Search (RRF) ============

/** 搜索算法选择 */
export type SearchAlgorithm = 'weighted' | 'rrf' | 'rrf-rerank';

/** 高级搜索选项 */
export interface AdvancedSearchOptions extends SearchOptions {
  /** 搜索算法，默认 'weighted' */
  algorithm?: SearchAlgorithm;
  /** RRF 参数 k，默认 60 */
  rrfK?: number;
  /** 排名第1的奖励，默认 0.05 */
  topRankBonus?: number;
  /** 排名2-3的奖励，默认 0.02 */
  secondaryRankBonus?: number;
  /** 是否启用重排序（需要 reranker），默认 false */
  enableReranking?: boolean;
  /** 重排序的最大文档数，默认 50 */
  maxDocsToRerank?: number;
  /** 是否启用查询扩展，默认 false */
  enableQueryExpansion?: boolean;
}

/** 带排名的搜索结果 */
export interface RankedSearchResult extends SearchResult {
  /** 在原列表中的排名（0-indexed） */
  rank: number;
}

/** 详细搜索结果（包含 RRF 信息） */
export interface DetailedSearchResult extends SearchResult {
  /** RRF 融合分数 */
  rrfScore?: number;
  /** 向量搜索排名（如果参与） */
  vectorRank?: number;
  /** FTS 搜索排名（如果参与） */
  ftsRank?: number;
  /** 重排序分数（0-1，如果启用） */
  rerankerScore?: number;
  /** 最终混合分数（如果启用重排序） */
  blendedScore?: number;
}

/** 默认高级搜索配置 */
export const DEFAULT_ADVANCED_SEARCH_OPTIONS: Required<
  Pick<
    AdvancedSearchOptions,
    | 'algorithm'
    | 'rrfK'
    | 'topRankBonus'
    | 'secondaryRankBonus'
    | 'enableReranking'
    | 'maxDocsToRerank'
    | 'enableQueryExpansion'
  >
> = {
  algorithm: 'weighted',
  rrfK: 60,
  topRankBonus: 0.05,
  secondaryRankBonus: 0.02,
  enableReranking: false,
  maxDocsToRerank: 50,
  enableQueryExpansion: false,
};

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

// ============ Hierarchical Memory Types (memU-inspired) ============

/**
 * Memory Type - 记忆类型
 * 基于 memU 的分类系统
 */
export type MemoryType = 'profile' | 'event' | 'knowledge' | 'behavior' | 'skill';

/**
 * Memory Resource - 原始资源层 (Layer 1)
 * 存储原始数据源：对话、文档、图片、视频等
 */
export interface MemoryResource {
  id: string;
  /** 资源 URL 或路径 */
  url: string;
  /** 资源模态 */
  modality: 'conversation' | 'document' | 'image' | 'video' | 'audio';
  /** 本地存储路径 */
  localPath: string;
  /** 资源描述/标题 */
  caption?: string;
  /** 资源摘要的 embedding */
  embedding?: number[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Memory Item - 记忆项层 (Layer 2)
 * 从资源中提取的独立记忆单元
 */
export interface MemoryItem {
  id: string;
  /** 关联的资源 ID */
  resourceId?: string;
  /** 关联的类别 ID */
  categoryId?: string;
  /** 记忆类型 */
  memoryType: MemoryType;
  /** 记忆内容摘要 (自包含，不超过30词) */
  summary: string;
  /** 摘要的 embedding */
  embedding?: number[];
  /** 事件发生时间 (对于 event 类型) */
  happenedAt?: number;
  /** 短引用 ID (6字符) 用于 [ref:xxx] 引用 */
  refId?: string;
  /** 关联的其他记忆项 ID */
  relatedIds?: string[];
  /** 重要性分数 (0-1) */
  importance?: number;
  /** 访问次数 */
  accessCount?: number;
  /** 上次访问时间 */
  lastAccessedAt?: number;
  /** 扩展元数据 */
  extra?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Memory Category - 类别层 (Layer 3)
 * 聚合相关记忆项的高层摘要
 */
export interface MemoryCategory {
  id: string;
  /** 类别名称 */
  name: string;
  /** 类别描述 */
  description: string;
  /** 描述的 embedding (用于快速类别匹配) */
  embedding?: number[];
  /** LLM 生成的聚合摘要 (包含 [ref:xxx] 引用) */
  summary?: string;
  /** 摘要的 embedding */
  summaryEmbedding?: number[];
  /** 该类别下的记忆项数量 */
  itemCount?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Category Item Link - 类别与记忆项的多对多关系
 */
export interface CategoryItemLink {
  id: string;
  categoryId: string;
  itemId: string;
  createdAt: number;
}

/**
 * Theory of Mind Item - 心智推理项
 * 从对话中推断的隐含信息
 */
export interface TheoryOfMindItem {
  id: string;
  /** 推断对象 (通常是 'user') */
  characterName: string;
  /** 推断内容 */
  inferredContent: string;
  /** 置信度 */
  confidenceLevel: 'perhaps' | 'probably' | 'likely' | 'very_likely';
  /** 来源活动 ID 列表 */
  sourceActivityIds: string[];
  /** 是否已被用户确认 */
  confirmed?: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Memory Hierarchy - 完整的分层记忆结构
 */
export interface MemoryHierarchy {
  resources: MemoryResource[];
  items: MemoryItem[];
  categories: MemoryCategory[];
  links: CategoryItemLink[];
  theoryOfMind?: TheoryOfMindItem[];
}

// ============ Query Routing Types ============

/**
 * Query Route Decision - 查询路由决策
 */
export interface QueryRouteDecision {
  /** 是否需要记忆检索 */
  needsRetrieval: boolean;
  /** 重写后的查询 (更适合检索) */
  rewrittenQuery: string;
  /** 建议检索的层级 */
  suggestedTiers: ('category' | 'item' | 'resource')[];
  /** 决策理由 */
  reasoning?: string;
}

/**
 * Tier Sufficiency Check - 层级充分性检查结果
 */
export interface TierSufficiencyResult {
  /** 当前层级是否提供了足够的上下文 */
  sufficient: boolean;
  /** 如果不足，重写后的查询 */
  rewrittenQuery?: string;
  /** 检索到的内容摘要 */
  contentSummary?: string;
}

// ============ Memory Operations Types ============

/**
 * Memory Operation Type - 记忆操作类型
 */
export type MemoryOperationType = 'ADD' | 'UPDATE' | 'DELETE' | 'TOUCH';

/**
 * Memory Operation - 记忆操作
 */
export interface MemoryOperation {
  type: MemoryOperationType;
  targetId?: string;
  item?: Partial<MemoryItem>;
  timestamp?: number;
}

// ============ Memory Cluster Types ============

/**
 * Memory Cluster - 动态记忆聚类
 */
export interface MemoryCluster {
  id: string;
  /** 聚类名称 (自动发现的主题) */
  name: string;
  /** 聚类描述 */
  description: string;
  /** 聚类中的记忆项 ID */
  itemIds: string[];
  /** 聚类质心 embedding */
  centroidEmbedding?: number[];
  /** 聚类创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
}
