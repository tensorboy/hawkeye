/**
 * 同步客户端 - 运行在浏览器扩展或 Web 应用中
 */

import { EventEmitter } from 'events';
import type { SyncConfig, SyncMessage } from './types';

export class SyncClient extends EventEmitter {
  private config: Required<SyncConfig>;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private source: SyncMessage['source'];

  constructor(config: SyncConfig = {}, source: SyncMessage['source'] = 'extension') {
    super();
    this.config = {
      port: 9527,
      authToken: '',
      heartbeatInterval: 30000,
      ...config,
    };
    this.source = source;
  }

  /**
   * 连接到同步服务器
   */
  connect(host = 'localhost'): void {
    const url = `ws://${host}:${this.config.port}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;

        // 发送认证
        if (this.config.authToken) {
          this.send({
            type: 'auth',
            payload: this.config.authToken,
            timestamp: Date.now(),
            source: this.source,
          });
        }

        this.emit('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as SyncMessage;
          this.emit('message', message);
          this.emit(message.type, message.payload);
        } catch (error) {
          this.emit('error', error);
        }
      };

      this.ws.onclose = () => {
        this.emit('disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        this.emit('error', error);
      };
    } catch (error) {
      this.emit('error', error);
      this.scheduleReconnect();
    }
  }

  /**
   * 断开连接
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
  }

  /**
   * 发送消息
   */
  send(message: SyncMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * 发送建议同步
   */
  syncSuggestions(suggestions: unknown[]): void {
    this.send({
      type: 'suggestions',
      payload: { suggestions },
      timestamp: Date.now(),
      source: this.source,
    });
  }

  /**
   * 请求执行任务
   */
  requestExecute(suggestionId: string): void {
    this.send({
      type: 'execute',
      payload: { suggestionId },
      timestamp: Date.now(),
      source: this.source,
    });
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('max-reconnect-reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.emit('reconnecting', { attempt: this.reconnectAttempts });
      this.connect();
    }, delay);
  }
}
