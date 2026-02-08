/**
 * LLaMA Reranker Provider
 * 使用 node-llama-cpp 的 createRankingContext API 进行文档重排序
 * 默认使用 Qwen3-Reranker-0.6B 模型
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type {
  RerankerProvider,
  RerankerConfig,
  RankResult,
  RerankerStats,
} from './reranker-types';
import { DEFAULT_RERANKER_CONFIG } from './reranker-types';

// node-llama-cpp 类型（动态导入）
interface LlamaModule {
  getLlama: (options?: { gpu?: 'metal' | 'cuda' | 'auto' | false }) => Promise<LlamaInstance>;
  resolveModelFile: (modelUri: string) => Promise<string>;
}

interface LlamaInstance {
  loadModel: (options: { modelPath: string; gpuLayers?: number }) => Promise<LlamaModel>;
}

interface LlamaModel {
  createRankingContext: (options?: { batchSize?: number }) => Promise<LlamaRankingContext>;
  dispose: () => Promise<void>;
}

interface LlamaRankingContext {
  rankAndSort: (
    query: string,
    documents: string[]
  ) => Promise<Array<{ document: string; score: number }>>;
  dispose: () => Promise<void>;
}

export class LlamaRerankerProvider extends EventEmitter implements RerankerProvider {
  readonly name = 'llama-reranker';
  private config: Required<RerankerConfig>;
  private _isInitialized = false;

  // node-llama-cpp 实例
  private llama: LlamaInstance | null = null;
  private model: LlamaModel | null = null;
  private rankingContext: LlamaRankingContext | null = null;

  // 统计信息
  private stats: RerankerStats = {
    totalRankCalls: 0,
    totalDocumentsRanked: 0,
    averageRankTime: 0,
    lastRankTime: 0,
  };

  constructor(config: Partial<RerankerConfig> = {}) {
    super();
    this.config = {
      ...DEFAULT_RERANKER_CONFIG,
      ...config,
    } as Required<RerankerConfig>;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * 初始化重排序器
   * 加载模型并创建 RankingContext
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    try {
      console.log('[LlamaReranker] Initializing...');

      // 动态导入 node-llama-cpp
      const nodeLlamaCpp = (await import('node-llama-cpp')) as unknown as LlamaModule;

      // 确定 GPU 选项
      const gpuOption = this.config.gpuLayers === 0 ? false : 'auto';

      // 获取 Llama 实例
      this.llama = await nodeLlamaCpp.getLlama({ gpu: gpuOption });

      // 解析模型路径
      let modelPath: string;

      if (this.config.modelPath) {
        // 使用本地路径
        modelPath = this.config.modelPath;
      } else if (this.config.modelUri) {
        // 从 Hugging Face 下载模型
        console.log(`[LlamaReranker] Resolving model: ${this.config.modelUri}`);
        modelPath = await nodeLlamaCpp.resolveModelFile(this.config.modelUri);
      } else {
        throw new Error('Neither modelPath nor modelUri specified');
      }

      // 验证模型文件存在
      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model file not found: ${modelPath}`);
      }

      console.log(`[LlamaReranker] Loading model: ${modelPath}`);

      // 加载模型
      this.model = await this.llama.loadModel({
        modelPath,
        gpuLayers: this.config.gpuLayers,
      });

      // 创建 RankingContext
      console.log('[LlamaReranker] Creating ranking context...');
      this.rankingContext = await this.model.createRankingContext({
        batchSize: this.config.batchSize,
      });

      this._isInitialized = true;
      this.emit('initialized');
      console.log('[LlamaReranker] Ready');
    } catch (error) {
      this._isInitialized = false;

      // Cleanup partially initialized resources to prevent leaks
      if (this.rankingContext) {
        try { await this.rankingContext.dispose(); } catch { /* ignore */ }
        this.rankingContext = null;
      }
      if (this.model) {
        try { await this.model.dispose(); } catch { /* ignore */ }
        this.model = null;
      }
      this.llama = null;

      const message = error instanceof Error ? error.message : String(error);

      // 提供详细的错误信息
      throw new Error(
        `LlamaReranker initialization failed: ${message}\n` +
          'Ensure:\n' +
          '1. node-llama-cpp is installed correctly\n' +
          '2. Model file exists and is valid GGUF format\n' +
          '3. For HuggingFace models, internet connection is available\n' +
          '4. Sufficient disk space for model download (~640MB for Qwen3-Reranker)'
      );
    }
  }

  /**
   * 对文档进行重排序
   *
   * @param query - 查询文本
   * @param documents - 待排序的文档数组
   * @returns 排序后的结果，按分数降序
   */
  async rank(query: string, documents: string[]): Promise<RankResult[]> {
    if (!this._isInitialized || !this.rankingContext) {
      throw new Error('LlamaReranker not initialized. Call initialize() first.');
    }

    if (documents.length === 0) {
      return [];
    }

    const startTime = Date.now();

    // 限制文档数量
    const docsToRank = documents.slice(0, this.config.maxDocsToRerank);

    try {
      // 使用 node-llama-cpp 的 rankAndSort API
      const ranked = await this.rankingContext.rankAndSort(query, docsToRank);

      // 转换为 RankResult 格式
      // 需要找回原始索引
      const results: RankResult[] = ranked
        .map((item) => {
          let originalIndex = docsToRank.indexOf(item.document);
          if (originalIndex === -1) {
            originalIndex = docsToRank.findIndex((d) => d.includes(item.document) || item.document.includes(d));
          }
          if (originalIndex === -1) {
            // Document not found in original list — skip to avoid wrong index assignment
            return null;
          }
          return {
            index: originalIndex,
            score: this.normalizeScore(item.score),
            text: item.document,
          };
        })
        .filter((r): r is RankResult => r !== null);

      // 更新统计
      const duration = Date.now() - startTime;
      this.updateStats(docsToRank.length, duration);

      this.emit('ranked', { query: query.substring(0, 50), count: results.length, duration });

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Reranking failed: ${message}`);
    }
  }

  /**
   * 获取单个查询-文档对的相关性分数
   */
  async score(query: string, document: string): Promise<number> {
    const results = await this.rank(query, [document]);
    return results.length > 0 ? results[0].score : 0;
  }

  /**
   * 批量重排序
   */
  async rankBatch(queries: string[], documentSets: string[][]): Promise<RankResult[][]> {
    const results: RankResult[][] = [];

    for (let i = 0; i < queries.length; i++) {
      const ranked = await this.rank(queries[i], documentSets[i]);
      results.push(ranked);
    }

    return results;
  }

  /**
   * 获取统计信息
   */
  getStats(): RerankerStats {
    return { ...this.stats };
  }

  /**
   * 终止并释放资源
   */
  async terminate(): Promise<void> {
    try {
      if (this.rankingContext) {
        await this.rankingContext.dispose();
        this.rankingContext = null;
      }

      if (this.model) {
        await this.model.dispose();
        this.model = null;
      }

      this.llama = null;
    } catch (error) {
      console.warn('[LlamaReranker] Error during cleanup:', error);
    }

    this._isInitialized = false;
    this.emit('terminated');
    console.log('[LlamaReranker] Terminated');
  }

  // ============ Private Methods ============

  /**
   * 将原始分数归一化到 0-1 范围
   * Reranker 模型输出的分数通常是 logits，需要转换
   */
  private normalizeScore(rawScore: number): number {
    // 使用 sigmoid 函数将分数映射到 0-1
    // 对于大多数 reranker 模型，分数范围在 -10 到 10 之间
    return 1 / (1 + Math.exp(-rawScore));
  }

  /**
   * 更新统计信息
   */
  private updateStats(documentCount: number, duration: number): void {
    this.stats.totalRankCalls++;
    this.stats.totalDocumentsRanked += documentCount;
    this.stats.lastRankTime = duration;

    // 计算移动平均
    const weight = 1 / this.stats.totalRankCalls;
    this.stats.averageRankTime =
      this.stats.averageRankTime * (1 - weight) + duration * weight;
  }
}

// ============ Factory Function ============

/**
 * 创建 LlamaRerankerProvider 实例
 *
 * @example
 * ```typescript
 * const reranker = await createLlamaReranker({
 *   modelUri: 'hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF',
 *   maxDocsToRerank: 50,
 * });
 *
 * await reranker.initialize();
 *
 * const results = await reranker.rank('What is RRF?', [
 *   'RRF is a fusion algorithm...',
 *   'Machine learning basics...',
 * ]);
 * ```
 */
export async function createLlamaReranker(
  config: Partial<RerankerConfig> = {}
): Promise<LlamaRerankerProvider> {
  const reranker = new LlamaRerankerProvider(config);
  return reranker;
}

/**
 * 获取默认模型的缓存目录
 */
export function getRerankerModelCacheDir(): string {
  return path.join(os.homedir(), '.cache', 'hawkeye', 'models', 'reranker');
}

/**
 * 检查默认 reranker 模型是否已下载
 */
export async function isRerankerModelAvailable(): Promise<boolean> {
  const cacheDir = getRerankerModelCacheDir();

  if (!fs.existsSync(cacheDir)) {
    return false;
  }

  // 检查是否有 GGUF 文件
  const files = fs.readdirSync(cacheDir);
  return files.some((f) => f.endsWith('.gguf'));
}
