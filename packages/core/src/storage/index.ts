/**
 * 存储模块 - 数据持久化
 */

// 简单 JSON 存储
export { Storage, type StorageConfig } from './storage';

// SQLite 数据库
export {
  HawkeyeDatabase,
  type DatabaseConfig,
  type ContextRecord,
  type IntentRecord,
  type PlanRecord,
  type ExecutionRecord,
} from './database';

// 向量存储
export {
  VectorStore,
  type VectorStoreConfig,
  type VectorDocument,
  type VectorSearchResult,
  createAIEmbedFunction,
} from './vector-store';
