/**
 * 同步模块类型定义
 */

export interface SyncConfig {
  /** WebSocket 服务器端口 */
  port?: number;
  /** 认证 token */
  authToken?: string;
  /** 心跳间隔 (ms) */
  heartbeatInterval?: number;
  /** 最大重连次数 */
  maxReconnectAttempts?: number;
  /** 重连延迟 (ms) */
  reconnectDelay?: number;
}

export type SyncMessageType =
  | 'auth'
  | 'auth_success'
  | 'auth_failed'
  | 'heartbeat'
  | 'pong'
  // 上下文相关
  | 'context_update'
  | 'context_request'
  // 意图相关
  | 'intent_detected'
  | 'intent_feedback'
  // 计划相关
  | 'plan_generated'
  | 'plan_confirm'
  | 'plan_reject'
  | 'plan_modify'
  // 执行相关
  | 'execution_start'
  | 'execution_progress'
  | 'execution_completed'
  | 'execution_failed'
  | 'execution_pause'
  | 'execution_resume'
  | 'execution_cancel'
  // 建议相关 (旧 API 兼容)
  | 'suggestions'
  | 'execute'
  // 状态相关
  | 'status'
  | 'status_request'
  // 配置相关
  | 'config_update'
  | 'config_request'
  // 错误
  | 'error';

export interface SyncMessage<T = unknown> {
  type: SyncMessageType;
  payload: T;
  timestamp: number;
  source: 'desktop' | 'extension' | 'web' | 'vscode';
  id?: string;
}

// ============ 上下文消息 ============

export interface ContextUpdatePayload {
  contextId: string;
  activeWindow?: {
    appName: string;
    title: string;
  };
  clipboard?: string;
  screenshot?: string;
  ocrText?: string;
  fileEvents?: Array<{
    type: 'create' | 'modify' | 'delete';
    path: string;
  }>;
}

// ============ 意图消息 ============

export interface IntentDetectedPayload {
  intents: Array<{
    id: string;
    type: string;
    description: string;
    confidence: number;
    entities?: Array<{
      type: string;
      value: string;
    }>;
  }>;
  contextId: string;
}

export interface IntentFeedbackPayload {
  intentId: string;
  feedback: 'accept' | 'reject' | 'irrelevant';
  comment?: string;
}

// ============ 计划消息 ============

export interface PlanGeneratedPayload {
  plan: {
    id: string;
    title: string;
    description: string;
    steps: Array<{
      order: number;
      description: string;
      actionType: string;
      riskLevel: 'low' | 'medium' | 'high';
    }>;
    pros: string[];
    cons: string[];
    alternatives?: Array<{
      description: string;
      difference: string;
    }>;
    impact: {
      filesAffected: number;
      systemChanges: boolean;
      requiresNetwork: boolean;
      fullyReversible: boolean;
    };
  };
  intentId: string;
}

export interface PlanConfirmPayload {
  planId: string;
  modifiedSteps?: Array<{
    order: number;
    skip?: boolean;
  }>;
}

export interface PlanRejectPayload {
  planId: string;
  reason?: string;
}

// ============ 执行消息 ============

export interface ExecutionStartPayload {
  planId: string;
  executionId: string;
}

export interface ExecutionProgressPayload {
  executionId: string;
  currentStep: number;
  totalSteps: number;
  stepDescription: string;
  progress: number;
}

export interface ExecutionCompletedPayload {
  executionId: string;
  planId: string;
  duration: number;
  results: Array<{
    stepOrder: number;
    success: boolean;
    output?: string;
    error?: string;
  }>;
}

export interface ExecutionFailedPayload {
  executionId: string;
  planId: string;
  failedStep: number;
  error: string;
  canRollback: boolean;
}

// ============ 建议消息 (兼容) ============

export interface SuggestionsSyncPayload {
  suggestions: Array<{
    id: string;
    title: string;
    description: string;
    type: string;
    confidence: number;
  }>;
}

export interface ExecuteSyncPayload {
  suggestionId: string;
  action?: string;
}

// ============ 状态消息 ============

export interface StatusPayload {
  connected: boolean;
  lastSeen: number;
  clientType: 'desktop' | 'extension' | 'web' | 'vscode';
  version?: string;
  capabilities?: string[];
  aiProvider?: string;
  aiProviderStatus?: 'available' | 'unavailable' | 'initializing';
}

export interface StatusSyncPayload extends StatusPayload {}

// ============ 配置消息 ============

export interface ConfigUpdatePayload {
  aiProvider?: {
    type: string;
    model?: string;
  };
  perception?: {
    enableScreen?: boolean;
    enableClipboard?: boolean;
    enableFileWatch?: boolean;
    enableOCR?: boolean;
  };
  execution?: {
    requireConfirmation?: boolean;
    autoRollbackOnFailure?: boolean;
  };
}

// ============ 错误消息 ============

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}
