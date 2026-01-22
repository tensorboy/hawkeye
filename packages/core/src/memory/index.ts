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
