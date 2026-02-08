/**
 * Vector Memory System - 向量记忆系统
 * 基于 SQLite + sqlite-vec 的混合搜索记忆系统
 *
 * Enhanced with memU-inspired features:
 * - Hierarchical memory (Resource → Item → Category)
 * - Reference tracking [ref:xxx]
 * - Query routing with sufficiency checks
 * - Theory of Mind extraction
 * - Memory linking and clustering
 * - Deduplication and merging
 */

// ============ Core Types ============
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
  // Advanced Search Types
  SearchAlgorithm,
  AdvancedSearchOptions,
  RankedSearchResult,
  DetailedSearchResult,
  // Hierarchical Memory Types (memU-inspired)
  MemoryType,
  MemoryResource,
  MemoryItem,
  MemoryCategory,
  CategoryItemLink,
  MemoryHierarchy,
  TheoryOfMindItem,
  // Query Routing Types
  QueryRouteDecision,
  TierSufficiencyResult,
  // Memory Operations
  MemoryOperationType,
  MemoryOperation,
  // Clustering
  MemoryCluster,
} from './types';

export {
  DEFAULT_VECTOR_MEMORY_CONFIG,
  VECTOR_SEARCH_WEIGHTS,
  DEFAULT_ADVANCED_SEARCH_OPTIONS,
} from './types';

// ============ Embedding Providers ============
export {
  OpenAIEmbeddingProvider,
  GeminiEmbeddingProvider,
  LocalEmbeddingProvider,
  createEmbeddingProvider,
  EmbeddingCache,
} from './embeddings';

// ============ SQLite Vector Store ============
export { SQLiteVecStore } from './sqlite-vec-store';

// ============ Memory Manager ============
export {
  VectorMemoryManager,
  getVectorMemory,
  setVectorMemory,
  createVectorMemory,
  type AddMemoryOptions,
} from './memory-manager';

// ============ RRF Fusion Algorithm ============
export {
  reciprocalRankFusion,
  fuseVectorAndFTS,
  applyPositionBlending,
  extractItems,
  limitResults,
  DEFAULT_RRF_CONFIG,
  DEFAULT_BLENDING_CONFIG,
  type RRFConfig,
  type BlendingConfig,
  type RankedItem,
  type RRFResult,
  type RankedResultList,
} from './rrf-fusion';

// ============ Query Expansion ============
export {
  expandQuery,
  expandQuerySimple,
  mergeExpandedResults,
  DEFAULT_QUERY_EXPANSION_CONFIG,
  type ExpandedQuery,
  type QueryExpansionConfig,
} from './query-expansion';

// ============ Reference Tracking (memU-inspired) ============
export {
  extractReferences,
  stripReferences,
  formatAsCitations,
  buildItemRefId,
  hasReferences,
  countReferences,
  addReferencesToSummary,
  parseMemoryWithReferences,
  buildCategorySummaryPrompt,
  // Database integration functions
  fetchReferencedItems,
  fetchReferencedItemsSync,
  buildItemReferenceMap,
  validateReferences,
  type ReferencedItem,
} from './references';

// ============ Query Router (memU-inspired) ============
export {
  routeQuery,
  quickRouteDecision,
  checkTierSufficiency,
  quickSufficiencyCheck,
  suggestRetrievalTiers,
  rewriteQuerySimple,
} from './query-router';

// ============ Theory of Mind (memU-experiment inspired) ============
export {
  extractTheoryOfMind,
  extractTheoryOfMindSimple,
  validateInference,
  mergeInferences,
  DEFAULT_TOM_CONFIG,
  type TheoryOfMindConfig,
} from './theory-of-mind';

// ============ Memory Linking (memU-experiment inspired) ============
export {
  findRelatedMemories,
  findRelatedAcrossCategories,
  linkMemoryItem,
  linkAllMemories,
  buildMemoryGraph,
  getLinkedMemories,
  formatLinkedMemory,
  calculateSimilarity,
  batchCosineSimilarity,
  DEFAULT_LINKING_CONFIG,
  type MemoryLinkingConfig,
  type LinkedMemory,
  type MemoryLink,
  type RelatedMemoryResult,
} from './memory-linking';

// ============ Dynamic Clustering (memU-experiment inspired) ============
export {
  detectNewClusters,
  clusterByEmbedding,
  generateClusterName,
  generateClusterNameSimple,
  assignToCluster,
  updateClusterCentroid,
  clusterToCategory,
  DEFAULT_CLUSTERING_CONFIG,
  type ClusteringConfig,
} from './clustering';

// ============ Hierarchical Memory Manager (memU-inspired) ============
export {
  HierarchicalMemoryManager,
  DEFAULT_HIERARCHY_CONFIG,
  type HierarchyConfig,
} from './hierarchy';

// ============ Memory Deduplication (memU-inspired) ============
export {
  detectDuplicates,
  detectMergeable,
  mergeItemsSimple,
  mergeItemsWithLLM,
  generateDeduplicationOps,
  executeDeduplicationOps,
  deduplicateMemories,
  checkDuplicate,
  DEFAULT_DEDUP_CONFIG,
  type DeduplicationConfig,
} from './deduplication';
