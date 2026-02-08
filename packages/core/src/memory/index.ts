/**
 * MemOS - 记忆操作系统
 * Memory Operating System
 *
 * 提供情景记忆、语义记忆、程序记忆和工作记忆的统一管理
 * Provides unified management of episodic, semantic, procedural, and working memory
 *
 * 增强功能（基于 Agent-S、Cradle、UI-TARS、Open Interpreter）：
 * - 双重记忆系统（情节记忆 + 语义记忆）
 * - 工作区设计（LocalMemory + recent_history）
 * - 对话历史管理与上下文裁剪
 * - 代码执行状态与变量持久化
 * - 状态序列化和持久化
 * - 状态恢复和断点续传
 * - 内存效率优化
 * - 状态版本管理
 */

// 类型导出
export * from './types';

// 情景记忆 (Episodic Memory)
export { EpisodicMemoryManager } from './episodic-memory';

// 语义记忆 (Semantic Memory)
export { SemanticMemoryManager } from './semantic-memory';

// 程序记忆 (Procedural Memory)
export { ProceduralMemoryManager } from './procedural-memory';

// 工作记忆 (Working Memory)
export { WorkingMemoryManager } from './working-memory';

// MemOS 统一管理器
export {
  MemOSManager,
  getMemOS,
  createMemOS,
  setMemOS,
} from './memos-manager';

// 高级状态管理器 (基于 Agent-S、Cradle、UI-TARS、Open Interpreter 设计模式)
export {
  StateManager,
  createStateManager,
  createPersistentStateManager,
  // 类型
  type StateVersion,
  type SerializedState,
  type Checkpoint,
  type ConversationMessage,
  type ConversationConfig,
  type ExecutionContext,
  type WorkingAreaItem,
  type DualMemoryEntry,
  type StateManagerConfig,
  DEFAULT_STATE_MANAGER_CONFIG,
} from './state-manager';

// 内存效率优化器
export {
  LRUCache,
  IncrementalUpdateManager,
  MemoryPool,
  MemoryPressureMonitor,
  MemoryPressureLevel,
  // 类型
  type LRUCacheConfig,
  type IncrementalConfig,
  type MemoryPoolConfig,
  type CacheItemMeta,
  type JsonPatch,
  type IncrementalSnapshot,
} from './memory-optimizer';

// 会话恢复与断点续传
export {
  SessionRecoveryManager,
  createSessionRecovery,
  createAndRecover,
  TaskState,
  RecoveryStrategy,
  // 类型
  type ExecutionStep,
  type TaskExecutionContext,
  type SavePoint,
  type RecoveryResult,
  type SessionRecoveryConfig,
} from './session-recovery';

// RAG 增强记忆检索 (参考 Cradle、Agent-S)
export {
  RAGMemoryRetrieval,
  createRAGRetrieval,
  getRAGRetrieval,
  setRAGRetrieval,
  // 类型
  type MemoryEntry,
  type VectorizedMemory,
  type RetrievalResult,
  type RetrievalOptions,
  type EmbeddingFunction,
  type RAGConfig,
} from './rag-retrieval';

// Vector Memory System (基于 clawdbot/memory 设计模式)
// SQLite + sqlite-vec 混合搜索记忆系统
export {
  // Memory Manager
  VectorMemoryManager,
  getVectorMemory,
  setVectorMemory,
  createVectorMemory,
  // SQLite Store
  SQLiteVecStore,
  // Embedding Providers
  OpenAIEmbeddingProvider,
  GeminiEmbeddingProvider,
  LocalEmbeddingProvider,
  createEmbeddingProvider,
  EmbeddingCache,
  // Constants
  DEFAULT_VECTOR_MEMORY_CONFIG,
  VECTOR_SEARCH_WEIGHTS,
  // Types
  type MemoryChunk,
  type FileMetadata,
  type EmbeddingCacheEntry,
  type EmbeddingProviderType,
  type EmbeddingProvider,
  type EmbeddingConfig,
  type SearchResult as VectorSearchResult,
  type SearchOptions as VectorSearchOptions,
  type VectorMemoryConfig,
  type MemoryStats as VectorMemoryStats,
  type AddMemoryOptions,
} from './vector-memory';

// Knowledge Graph Memory (based on babyagi3 three-layer architecture)
// Event Log → Knowledge Graph (entities, edges, facts) → Hierarchical Summaries
export {
  // Store
  KnowledgeGraphStore,
  // Extraction Pipeline
  ExtractionPipeline,
  // Staleness Queue
  StalenessQueue,
  // Context Assembler
  ContextAssembler,
  DEFAULT_ASSEMBLER_CONFIG,
  // Self-Improvement
  SelfImprovementManager,
  DEFAULT_SELF_IMPROVEMENT_CONFIG,
  // Cost utilities
  calculateCost,
  estimateTokens,
  formatCost,
  LLM_PRICING,
  // Constants
  DEFAULT_STALENESS_CONFIG,
  DEFAULT_CONTEXT_BUDGET,
  DEFAULT_EXTRACTION_CONFIG,
  // Types
  type KGEntity,
  type KGEntityType,
  type KGEdge,
  type KGRelationType,
  type KGFact,
  type KGFactType,
  type HierarchicalSummary,
  type SummaryNodeType,
  type StalenessConfig,
  type ContextBudget,
  type AssembledContext,
  type ExtractionEvent,
  type ExtractionResult,
  type ExtractedTopic,
  type ExtractionConfig,
  type LearningRecord,
  type LearningType,
  type CostEntry,
  type CostSource,
  type CostReport,
  type KnowledgeGraphStoreConfig,
  type ContextAssemblerConfig,
  type SelfImprovementConfig,
  type LLMCallFunction,
  type SummaryRefreshFunction,
} from './knowledge-graph';

// Daily Notes (基于 nanobot 设计模式)
// 按日期组织的每日笔记系统
export {
  DailyNotesManager,
  createDailyNotesManager,
} from './daily-notes';

export {
  DEFAULT_DAILY_NOTES_CONFIG,
  DEFAULT_DAILY_NOTE_TEMPLATE,
  // Types
  type DailyNote,
  type DailyNoteMetadata,
  type DailyNoteSections,
  type DailyNotesConfig,
  type DailyNotesEvents,
  type DailyNotesSearchOptions,
  type DailyNotesSearchResult,
  type DailyNoteSectionId,
  type TemplateVariables,
} from './daily-notes-types';

// Life Template (Dynamic Personal Development System)
// Integrates: Big Five, Freud, Erikson, Wheel of Life, Ikigai, Life Narrative
export {
  LifeTemplateManager,
  getLifeTemplateManager,
  setLifeTemplateManager,
  createLifeTemplateManager,
} from './life-template-manager';

export {
  DEFAULT_LIFE_TEMPLATE_CONFIG,
  ERIKSON_STAGES,
  WHEEL_CATEGORIES,
  // Types
  type LifeTemplate,
  type LifeTemplateConfig,
  type LifeTemplateEvents,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type TemplateSummary,
  type TemplateSnapshot,
  type DailyActivitySummary,
  type BigFivePersonality,
  type PsychodynamicProfile,
  type DefenseMechanism,
  type WheelOfLife,
  type WheelOfLifeCategory,
  type WheelCategoryMeta,
  type Ikigai,
  type IkigaiIntersection,
  type IkigaiIntersectionType,
  type EriksonStage,
  type EriksonStageNumber,
  type EriksonProgress,
  type LifeNarrative,
  type LifeChapter,
  type TurningPoint,
  type NarrativeTheme,
  type SelfDefiningMemory,
  type AppUsageEntry,
  type AppCategory,
  type CompletedGoal,
  type MoodEntry,
} from './life-template-types';

// Memory Stores (基于 memu-cowork 设计模式)
// Session, Permission, and State Management
export {
  // Session Store
  SessionStore,
  getSessionStore,
  setSessionStore,
  createSessionStore,
  type Session,
  type SessionStatus,
  type SessionUpdate,
  type SessionData,
  type CreateSessionParams,
  type ListSessionsOptions,
  // Permission Store
  PermissionStore,
  getPermissionStore,
  setPermissionStore,
  createPermissionStore,
  type PermissionLevel,
  type PermissionQuestion,
  type PermissionRequest,
  type PermissionRule,
  type PermissionCheckResult,
  type CreateRuleParams,
  // Memu Store
  MemuStore,
  getMemuStore,
  setMemuStore,
  createMemuStore,
  type MemoryViewMode,
  type MemorySortBy,
  type MemoryFilter,
  type SearchState,
  type MemoryStats as MemuStats,
  type MemoryAction,
  type MemuState,
  type StateUpdater,
} from './stores';
