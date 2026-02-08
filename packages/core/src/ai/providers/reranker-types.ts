/**
 * Reranker Provider Types
 * 定义重排序提供者的接口，用于对搜索结果进行二次排序
 */

// ============ 基础类型 ============

/** 重排序结果 */
export interface RankResult {
  /** 原始文档索引 */
  index: number;
  /** 重排序分数 (0-1) */
  score: number;
  /** 文档文本 */
  text: string;
}

/** 重排序配置 */
export interface RerankerConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 模型 URI (例如 hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF) */
  modelUri?: string;
  /** 本地模型路径 */
  modelPath?: string;
  /** 重排序的最大文档数 */
  maxDocsToRerank: number;
  /** GPU 层数 (-1 表示自动) */
  gpuLayers: number;
  /** 上下文大小 */
  contextSize?: number;
  /** 批处理大小 */
  batchSize?: number;
}

/** 默认重排序配置 */
export const DEFAULT_RERANKER_CONFIG: RerankerConfig = {
  enabled: false,
  modelUri: 'hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF',
  maxDocsToRerank: 50,
  gpuLayers: -1, // Auto
  contextSize: 512,
  batchSize: 16,
};

// ============ Provider 接口 ============

/**
 * 重排序提供者接口
 * 支持多种重排序实现（LLM、Cross-Encoder 等）
 */
export interface RerankerProvider {
  /** 提供者名称 */
  readonly name: string;

  /** 是否已初始化 */
  readonly isInitialized: boolean;

  /**
   * 初始化重排序器
   * 加载模型等准备工作
   */
  initialize(): Promise<void>;

  /**
   * 对文档进行重排序
   *
   * @param query - 查询文本
   * @param documents - 待排序的文档文本数组
   * @returns 排序后的结果数组，按分数降序排列
   *
   * @example
   * ```typescript
   * const results = await reranker.rank(
   *   'What is RRF?',
   *   ['Doc about RRF algorithm', 'Doc about search', 'Doc about AI']
   * );
   * // results: [{ index: 0, score: 0.95, text: 'Doc about RRF...' }, ...]
   * ```
   */
  rank(query: string, documents: string[]): Promise<RankResult[]>;

  /**
   * 批量重排序
   * 对多个查询分别进行重排序
   *
   * @param queries - 查询数组
   * @param documentSets - 每个查询对应的文档数组
   * @returns 每个查询的排序结果
   */
  rankBatch?(
    queries: string[],
    documentSets: string[][]
  ): Promise<RankResult[][]>;

  /**
   * 获取查询-文档对的相关性分数
   * 不进行排序，只返回分数
   *
   * @param query - 查询文本
   * @param document - 文档文本
   * @returns 相关性分数 (0-1)
   */
  score?(query: string, document: string): Promise<number>;

  /**
   * 终止重排序器
   * 释放模型资源
   */
  terminate(): Promise<void>;
}

// ============ 工厂函数类型 ============

export type RerankerProviderFactory = (
  config: Partial<RerankerConfig>
) => Promise<RerankerProvider>;

// ============ 辅助类型 ============

/** 重排序状态 */
export interface RerankerStatus {
  isInitialized: boolean;
  modelName?: string;
  modelSize?: number;
  gpuEnabled?: boolean;
  lastRankTime?: number;
}

/** 重排序统计 */
export interface RerankerStats {
  totalRankCalls: number;
  totalDocumentsRanked: number;
  averageRankTime: number;
  lastRankTime: number;
}
