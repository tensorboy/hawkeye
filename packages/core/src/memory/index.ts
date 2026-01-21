/**
 * MemOS - 记忆操作系统
 * Memory Operating System
 *
 * 提供情景记忆、语义记忆、程序记忆和工作记忆的统一管理
 * Provides unified management of episodic, semantic, procedural, and working memory
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
