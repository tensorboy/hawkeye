/**
 * Vector Memory Manager - 向量记忆管理器
 * 整合 Embedding 生成、SQLite 存储、混合搜索
 */

import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { SQLiteVecStore } from './sqlite-vec-store';
import { createEmbeddingProvider, EmbeddingCache } from './embeddings';
import type { EmbeddingProvider } from './types';
import type {
  VectorMemoryConfig,
  MemoryChunk,
  SearchResult,
  SearchOptions,
  MemoryStats,
  DEFAULT_VECTOR_MEMORY_CONFIG,
} from './types';

export interface AddMemoryOptions {
  source?: MemoryChunk['source'];
  path?: string;
  metadata?: Record<string, unknown>;
}

export class VectorMemoryManager extends EventEmitter {
  private config: VectorMemoryConfig;
  private store: SQLiteVecStore;
  private embeddingProvider: EmbeddingProvider;
  private embeddingCache: EmbeddingCache;
  private isInitialized = false;
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<VectorMemoryConfig> = {}) {
    super();

    // Merge with defaults
    const defaultConfig: VectorMemoryConfig = {
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
      syncInterval: 60000,
      sessionDeltaThreshold: 4096,
    };

    this.config = {
      ...defaultConfig,
      ...config,
      embedding: { ...defaultConfig.embedding, ...config.embedding },
    };

    // Initialize components
    this.store = new SQLiteVecStore({
      dbPath: this.config.dbPath,
      dimensions: this.config.embedding.dimensions || 384,
      enableFTS: this.config.enableFTS,
    });

    this.embeddingProvider = createEmbeddingProvider(this.config.embedding);
    this.embeddingCache = new EmbeddingCache(this.config.maxCacheEntries);
  }

  /**
   * 初始化记忆系统
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[VectorMemory] Initializing...');

    await this.store.initialize();

    this.isInitialized = true;
    this.emit('initialized');

    console.log('[VectorMemory] Initialized with provider:', this.embeddingProvider.name);
  }

  /**
   * 添加文本到记忆
   */
  async add(text: string, options: AddMemoryOptions = {}): Promise<string> {
    await this.ensureInitialized();

    const {
      source = 'user',
      path = `memory/${Date.now()}`,
      metadata = {},
    } = options;

    // Generate chunk ID
    const id = this.generateId();
    const hash = this.hashText(text);
    const now = Date.now();

    // Generate embedding
    const embedding = await this.getOrCreateEmbedding(text);

    // Create chunk
    const chunk: MemoryChunk = {
      id,
      path,
      source,
      lineStart: 0,
      lineEnd: text.split('\n').length,
      hash,
      model: this.embeddingProvider.name,
      text,
      embedding,
      createdAt: now,
      updatedAt: now,
    };

    // Save to store
    this.store.saveChunk(chunk);

    this.emit('added', { id, text: text.substring(0, 100) });

    return id;
  }

  /**
   * 批量添加文本到记忆
   */
  async addBatch(
    items: Array<{ text: string; options?: AddMemoryOptions }>
  ): Promise<string[]> {
    await this.ensureInitialized();

    const chunks: MemoryChunk[] = [];
    const ids: string[] = [];
    const now = Date.now();

    // Generate embeddings in batches
    const texts = items.map(item => item.text);
    const embeddings = await this.getOrCreateEmbeddings(texts);

    for (let i = 0; i < items.length; i++) {
      const { text, options = {} } = items[i];
      const {
        source = 'user',
        path = `memory/${now}_${i}`,
      } = options;

      const id = this.generateId();
      ids.push(id);

      chunks.push({
        id,
        path,
        source,
        lineStart: 0,
        lineEnd: text.split('\n').length,
        hash: this.hashText(text),
        model: this.embeddingProvider.name,
        text,
        embedding: embeddings[i],
        createdAt: now,
        updatedAt: now,
      });
    }

    // Save all chunks
    this.store.saveChunks(chunks);

    this.emit('batch_added', { count: ids.length });

    return ids;
  }

  /**
   * 搜索记忆
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    await this.ensureInitialized();

    // Generate query embedding
    const queryEmbedding = await this.getOrCreateEmbedding(query);

    // Perform hybrid search
    const results = this.store.searchHybrid(query, queryEmbedding, options);

    this.emit('searched', { query: query.substring(0, 50), resultCount: results.length });

    return results;
  }

  /**
   * 仅向量搜索
   */
  async searchVector(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    await this.ensureInitialized();

    const queryEmbedding = await this.getOrCreateEmbedding(query);
    return this.store.searchVector(queryEmbedding, options);
  }

  /**
   * 仅全文搜索
   */
  async searchFTS(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    await this.ensureInitialized();
    return this.store.searchFTS(query, options);
  }

  /**
   * 获取记忆
   */
  async get(id: string): Promise<MemoryChunk | null> {
    await this.ensureInitialized();
    return this.store.getChunk(id);
  }

  /**
   * 删除记忆
   */
  async delete(path: string): Promise<number> {
    await this.ensureInitialized();
    const count = this.store.deleteChunksByPath(path);
    this.store.deleteFileMetadata(path);
    this.emit('deleted', { path, count });
    return count;
  }

  /**
   * 添加 Markdown 文档到记忆 (自动分块)
   */
  async addDocument(
    content: string,
    path: string,
    source: MemoryChunk['source'] = 'memory'
  ): Promise<string[]> {
    await this.ensureInitialized();

    // Split into chunks
    const chunks = this.splitIntoChunks(content);
    const ids: string[] = [];
    const now = Date.now();

    // Generate embeddings for all chunks
    const embeddings = await this.getOrCreateEmbeddings(chunks.map(c => c.text));

    const memoryChunks: MemoryChunk[] = chunks.map((chunk, i) => {
      const id = this.generateId();
      ids.push(id);

      return {
        id,
        path,
        source,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        hash: this.hashText(chunk.text),
        model: this.embeddingProvider.name,
        text: chunk.text,
        embedding: embeddings[i],
        createdAt: now,
        updatedAt: now,
      };
    });

    // Delete old chunks for this path first
    this.store.deleteChunksByPath(path);

    // Save new chunks
    this.store.saveChunks(memoryChunks);

    // Update file metadata
    this.store.saveFileMetadata({
      path,
      source,
      hash: this.hashText(content),
      mtime: now,
      size: content.length,
    });

    this.emit('document_added', { path, chunks: ids.length });

    return ids;
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<MemoryStats> {
    await this.ensureInitialized();

    const storeStats = this.store.getStats();

    return {
      totalChunks: storeStats.chunks,
      totalFiles: storeStats.files,
      cacheSize: this.embeddingCache.size,
      lastSyncAt: Date.now(),
      embeddingModel: this.embeddingProvider.name,
      dimensions: this.embeddingProvider.dimensions,
    };
  }

  /**
   * 关闭记忆系统
   */
  async close(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    this.store.close();
    this.isInitialized = false;
    this.emit('closed');
  }

  // ============ Private Methods ============

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async getOrCreateEmbedding(text: string): Promise<number[]> {
    const hash = this.hashText(text);

    // Check in-memory cache first
    const cached = this.embeddingCache.get(
      this.embeddingProvider.name,
      this.config.embedding.model || 'default',
      text
    );
    if (cached) return cached;

    // Check database cache
    const dbCached = this.store.getCachedEmbedding(
      this.embeddingProvider.name,
      this.config.embedding.model || 'default',
      hash
    );
    if (dbCached) {
      this.embeddingCache.set(
        this.embeddingProvider.name,
        this.config.embedding.model || 'default',
        text,
        dbCached
      );
      return dbCached;
    }

    // Generate new embedding
    const embedding = await this.embeddingProvider.embedQuery(text);

    // Cache it
    this.embeddingCache.set(
      this.embeddingProvider.name,
      this.config.embedding.model || 'default',
      text,
      embedding
    );

    // Save to database cache
    this.store.saveCachedEmbedding({
      provider: this.embeddingProvider.name,
      model: this.config.embedding.model || 'default',
      hash,
      embedding,
      dimensions: embedding.length,
      updatedAt: Date.now(),
    });

    return embedding;
  }

  private async getOrCreateEmbeddings(texts: string[]): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    // Check caches
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const hash = this.hashText(text);

      // Check in-memory cache
      const cached = this.embeddingCache.get(
        this.embeddingProvider.name,
        this.config.embedding.model || 'default',
        text
      );
      if (cached) {
        results[i] = cached;
        continue;
      }

      // Check database cache
      const dbCached = this.store.getCachedEmbedding(
        this.embeddingProvider.name,
        this.config.embedding.model || 'default',
        hash
      );
      if (dbCached) {
        results[i] = dbCached;
        this.embeddingCache.set(
          this.embeddingProvider.name,
          this.config.embedding.model || 'default',
          text,
          dbCached
        );
        continue;
      }

      uncachedIndices.push(i);
      uncachedTexts.push(text);
    }

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      const batchSize = this.config.embedding.batchSize || 10;
      for (let i = 0; i < uncachedTexts.length; i += batchSize) {
        const batch = uncachedTexts.slice(i, i + batchSize);
        const batchEmbeddings = await this.embeddingProvider.embedBatch(batch);

        for (let j = 0; j < batchEmbeddings.length; j++) {
          const originalIndex = uncachedIndices[i + j];
          const text = texts[originalIndex];
          const embedding = batchEmbeddings[j];

          results[originalIndex] = embedding;

          // Cache
          this.embeddingCache.set(
            this.embeddingProvider.name,
            this.config.embedding.model || 'default',
            text,
            embedding
          );

          this.store.saveCachedEmbedding({
            provider: this.embeddingProvider.name,
            model: this.config.embedding.model || 'default',
            hash: this.hashText(text),
            embedding,
            dimensions: embedding.length,
            updatedAt: Date.now(),
          });
        }
      }
    }

    return results;
  }

  private splitIntoChunks(content: string): Array<{ text: string; lineStart: number; lineEnd: number }> {
    const lines = content.split('\n');
    const chunks: Array<{ text: string; lineStart: number; lineEnd: number }> = [];

    const chunkSize = this.config.chunkSize || 512;
    const overlap = this.config.chunkOverlap || 64;

    let currentChunk: string[] = [];
    let currentSize = 0;
    let chunkStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineSize = line.length + 1; // +1 for newline

      if (currentSize + lineSize > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          text: currentChunk.join('\n'),
          lineStart: chunkStart,
          lineEnd: i,
        });

        // Start new chunk with overlap
        const overlapLines = Math.ceil(overlap / (currentSize / currentChunk.length));
        const startIndex = Math.max(0, currentChunk.length - overlapLines);
        currentChunk = currentChunk.slice(startIndex);
        currentSize = currentChunk.join('\n').length;
        chunkStart = i - (currentChunk.length - 1);
      }

      currentChunk.push(line);
      currentSize += lineSize;
    }

    // Save last chunk
    if (currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join('\n'),
        lineStart: chunkStart,
        lineEnd: lines.length,
      });
    }

    return chunks;
  }

  private generateId(): string {
    return `mem_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  private hashText(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
  }
}

// ============ Singleton ============

let globalMemoryManager: VectorMemoryManager | null = null;

export function getVectorMemory(): VectorMemoryManager {
  if (!globalMemoryManager) {
    globalMemoryManager = new VectorMemoryManager();
  }
  return globalMemoryManager;
}

export function setVectorMemory(manager: VectorMemoryManager): void {
  globalMemoryManager = manager;
}

export function createVectorMemory(config: Partial<VectorMemoryConfig> = {}): VectorMemoryManager {
  return new VectorMemoryManager(config);
}
