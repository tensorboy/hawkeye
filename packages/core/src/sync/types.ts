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
}

export interface SyncMessage {
  type: 'suggestions' | 'execute' | 'status' | 'heartbeat' | 'auth';
  payload: unknown;
  timestamp: number;
  source: 'desktop' | 'extension' | 'web';
}

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

export interface StatusSyncPayload {
  connected: boolean;
  lastSeen: number;
  clientType: string;
}
