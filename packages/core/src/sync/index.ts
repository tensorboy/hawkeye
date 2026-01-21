/**
 * 同步模块 - 桌面应用与浏览器扩展通信
 */

export { SyncServer } from './server';
export { SyncClient } from './client';

// 基础类型
export type {
  SyncConfig,
  SyncMessage,
  SyncMessageType,
} from './types';

// 上下文消息
export type { ContextUpdatePayload } from './types';

// 意图消息
export type {
  IntentDetectedPayload,
  IntentFeedbackPayload,
} from './types';

// 计划消息
export type {
  PlanGeneratedPayload,
  PlanConfirmPayload,
  PlanRejectPayload,
} from './types';

// 执行消息
export type {
  ExecutionStartPayload,
  ExecutionProgressPayload,
  ExecutionCompletedPayload,
  ExecutionFailedPayload,
} from './types';

// 兼容消息
export type {
  SuggestionsSyncPayload,
  ExecuteSyncPayload,
} from './types';

// 状态消息
export type {
  StatusPayload,
  StatusSyncPayload,
} from './types';

// 配置消息
export type { ConfigUpdatePayload } from './types';

// 错误消息
export type { ErrorPayload } from './types';
