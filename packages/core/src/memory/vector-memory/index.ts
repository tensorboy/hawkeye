/**
 * Vector Memory System - 向量记忆系统
 * 基于 SQLite + sqlite-vec 的混合搜索记忆系统
 */

// Types
export type {
  MemoryChunk,
  FileMetadata,
  EmbeddingCacheEntry,
  EmbeddingProviderType,
  EmbeddingProvider,
  EmbeddingConfig,
  SearchResult,
  SearchOptions,
  VectorMemoryConfig,
  MemoryStats,
} from './types';

export {
  DEFAULT_VECTOR_MEMORY_CONFIG,
  VECTOR_SEARCH_WEIGHTS,
} from './types';

// Embedding Providers
export {
  OpenAIEmbeddingProvider,
  GeminiEmbeddingProvider,
  LocalEmbeddingProvider,
  createEmbeddingProvider,
  EmbeddingCache,
} from './embeddings';

// SQLite Vector Store
export { SQLiteVecStore } from './sqlite-vec-store';

// Memory Manager
export {
  VectorMemoryManager,
  getVectorMemory,
  setVectorMemory,
  createVectorMemory,
  type AddMemoryOptions,
} from './memory-manager';
