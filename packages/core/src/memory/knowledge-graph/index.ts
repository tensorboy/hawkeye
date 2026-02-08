/**
 * Knowledge Graph Memory Module
 *
 * Three-layer memory architecture (based on babyagi3):
 * - Layer 1: Event Log (immutable events)
 * - Layer 2: Knowledge Graph (entities, edges, facts)
 * - Layer 3: Hierarchical Summaries (with staleness tracking)
 */

// Export all types, interfaces, constants, and utility functions
export * from './types';

// Export KnowledgeGraphStore
export {
  KnowledgeGraphStore,
  type KnowledgeGraphStoreConfig,
} from './knowledge-graph-store';

// Export ExtractionPipeline
export {
  ExtractionPipeline,
  type LLMCallFunction,
} from './extraction-pipeline';

// Export StalenessQueue
export {
  StalenessQueue,
  type SummaryRefreshFunction,
} from './staleness-queue';

// Export ContextAssembler
export {
  ContextAssembler,
  type ContextAssemblerConfig,
  DEFAULT_ASSEMBLER_CONFIG,
} from './context-assembler';

// Export SelfImprovementManager
export {
  SelfImprovementManager,
  type SelfImprovementConfig,
  DEFAULT_SELF_IMPROVEMENT_CONFIG,
} from './self-improvement';
