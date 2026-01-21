/**
 * Hawkeye VS Code Extension - Sync Client
 * WebSocket client for communicating with Desktop app
 */

import type { UserIntent, ExecutionPlan, SyncMessage } from './types';
import WebSocket from 'ws';

export interface SyncClientConfig {
  host: string;
  port: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export interface SyncClientStatus {
  connected: boolean;
  desktopAvailable: boolean;
  aiProvider?: string;
  aiProviderStatus?: 'available' | 'unavailable' | 'initializing';
}

type MessageHandler = (message: SyncMessage) => void;

export class SyncClient {
  private config: SyncClientConfig;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();

  private _connected = false;
  private _desktopAvailable = false;
  private _status: SyncClientStatus = {
    connected: false,
    desktopAvailable: false,
  };

  constructor(config: Partial<SyncClientConfig> = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 9527,
      reconnectDelay: config.reconnectDelay || 3000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      ...config,
    };
  }

  get isConnected(): boolean {
    return this._connected;
  }

  get status(): SyncClientStatus {
    return this._status;
  }

  /**
   * Connect to Desktop app
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const url = `ws://${this.config.host}:${this.config.port}`;

      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('[Hawkeye] Connected to Desktop');
          this._connected = true;
          this._desktopAvailable = true;
          this.reconnectAttempts = 0;

          // Request status
          this.send('status_request', {});

          this.emit('connected', {});
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = typeof event.data === 'string' ? event.data : event.data.toString();
            const message = JSON.parse(data) as SyncMessage;
            this.handleMessage(message);
          } catch (error) {
            console.error('[Hawkeye] Failed to parse message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('[Hawkeye] Disconnected from Desktop');
          this._connected = false;
          this.emit('disconnected', {});
          this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('[Hawkeye] WebSocket error:', error);
          this._connected = false;
          this._desktopAvailable = false;
          this.emit('error', { error });
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from Desktop app
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this._connected = false;
  }

  /**
   * Send message to Desktop
   */
  send(type: string, payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[Hawkeye] Not connected to Desktop');
      return;
    }

    const message: SyncMessage = {
      type,
      payload,
      timestamp: Date.now(),
      source: 'extension',
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send request and wait for response
   */
  request<T>(type: string, payload: unknown, timeout = 30000): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutHandle,
      });

      this.send(type, { ...payload as object, requestId });
    });
  }

  /**
   * Register message handler
   */
  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  /**
   * Remove message handler
   */
  off(type: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // ============ Desktop Communication Methods ============

  /**
   * Request Desktop to observe screen and recognize intents
   */
  async requestObserve(context?: {
    filePath?: string;
    selection?: string;
    language?: string;
  }): Promise<UserIntent[]> {
    this.send('context_update', {
      contextId: `ctx_vscode_${Date.now()}`,
      activeWindow: {
        appName: 'VS Code',
        title: context?.filePath || 'Unknown',
      },
      clipboard: context?.selection || '',
      fileContext: {
        filePath: context?.filePath,
        language: context?.language,
        selection: context?.selection,
      },
    });

    this.send('context_request', {});

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off('intent_detected', handler);
        reject(new Error('Observe request timeout'));
      }, 60000);

      const handler = (message: SyncMessage) => {
        clearTimeout(timeout);
        this.off('intent_detected', handler);
        const payload = message.payload as { intents: UserIntent[] };
        resolve(payload.intents);
      };

      this.on('intent_detected', handler);
    });
  }

  /**
   * Provide feedback on intent
   */
  sendIntentFeedback(intentId: string, feedback: 'accept' | 'reject' | 'irrelevant'): void {
    this.send('intent_feedback', { intentId, feedback });
  }

  /**
   * Confirm plan execution
   */
  confirmPlan(planId: string): void {
    this.send('plan_confirm', { planId });
  }

  /**
   * Reject plan
   */
  rejectPlan(planId: string, reason?: string): void {
    this.send('plan_reject', { planId, reason });
  }

  /**
   * Pause execution
   */
  pauseExecution(executionId: string): void {
    this.send('execution_pause', { executionId });
  }

  /**
   * Resume execution
   */
  resumeExecution(executionId: string): void {
    this.send('execution_resume', { executionId });
  }

  /**
   * Cancel execution
   */
  cancelExecution(executionId: string): void {
    this.send('execution_cancel', { executionId });
  }

  // ============ Private Methods ============

  private handleMessage(message: SyncMessage): void {
    switch (message.type) {
      case 'status':
        this._status = {
          connected: true,
          desktopAvailable: true,
          aiProvider: (message.payload as SyncClientStatus).aiProvider,
          aiProviderStatus: (message.payload as SyncClientStatus).aiProviderStatus,
        };
        break;

      case 'pong':
        // Heartbeat response
        break;
    }

    // Check for pending request response
    const payload = message.payload as { requestId?: string };
    if (payload.requestId) {
      const pending = this.pendingRequests.get(payload.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(payload.requestId);
        pending.resolve(message.payload);
        return;
      }
    }

    // Emit to handlers
    this.emit(message.type, message);
  }

  private emit(type: string, message: SyncMessage | Record<string, unknown>): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const syncMessage: SyncMessage = 'type' in message && 'payload' in message
        ? message as SyncMessage
        : { type, payload: message, timestamp: Date.now(), source: 'extension' };
      handlers.forEach((handler) => handler(syncMessage));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      console.log('[Hawkeye] Max reconnect attempts reached');
      this._desktopAvailable = false;
      this.emit('max_reconnect_reached', {});
      return;
    }

    this.reconnectAttempts++;
    console.log(`[Hawkeye] Reconnecting in ${this.config.reconnectDelay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Will trigger onclose and schedule another reconnect
      });
    }, this.config.reconnectDelay);
  }
}

// Singleton instance
let syncClient: SyncClient | null = null;

export function getSyncClient(): SyncClient {
  if (!syncClient) {
    syncClient = new SyncClient();
  }
  return syncClient;
}

export function createSyncClient(config: Partial<SyncClientConfig>): SyncClient {
  syncClient = new SyncClient(config);
  return syncClient;
}
