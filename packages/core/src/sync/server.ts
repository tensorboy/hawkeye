/**
 * 同步服务器 - 运行在桌面应用中
 * 使用 WebSocket 与浏览器扩展和 Web 应用通信
 */

import { EventEmitter } from 'events';
import type { SyncConfig, SyncMessage } from './types';

// 注意：实际运行需要安装 ws 包
// import { WebSocketServer, WebSocket } from 'ws';

export class SyncServer extends EventEmitter {
  private config: Required<SyncConfig>;
  private server: unknown = null;
  private clients: Set<unknown> = new Set();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(config: SyncConfig = {}) {
    super();
    this.config = {
      port: 9527,
      authToken: '',
      heartbeatInterval: 30000,
      ...config,
    };
  }

  /**
   * 启动同步服务器
   */
  async start(): Promise<void> {
    // 动态导入 ws 模块
    const { WebSocketServer } = await import('ws');

    this.server = new WebSocketServer({ port: this.config.port });

    (this.server as { on: Function }).on('connection', (ws: unknown, req: unknown) => {
      this.handleConnection(ws, req);
    });

    (this.server as { on: Function }).on('error', (error: Error) => {
      this.emit('error', error);
    });

    // 启动心跳
    this.startHeartbeat();

    this.emit('started', { port: this.config.port });
  }

  /**
   * 停止服务器
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.server) {
      (this.server as { close: Function }).close();
      this.server = null;
    }

    this.clients.clear();
    this.emit('stopped');
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast(message: SyncMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if ((client as { readyState: number }).readyState === 1) { // WebSocket.OPEN
        (client as { send: Function }).send(data);
      }
    }
  }

  /**
   * 发送消息给特定客户端
   */
  send(client: unknown, message: SyncMessage): void {
    if ((client as { readyState: number }).readyState === 1) {
      (client as { send: Function }).send(JSON.stringify(message));
    }
  }

  /**
   * 获取连接的客户端数量
   */
  getClientCount(): number {
    return this.clients.size;
  }

  private handleConnection(ws: unknown, _req: unknown): void {
    // 认证检查
    if (this.config.authToken) {
      // 等待认证消息
      const authTimeout = setTimeout(() => {
        (ws as { close: Function }).close(4001, 'Authentication timeout');
      }, 5000);

      (ws as { once: Function }).once('message', (data: Buffer) => {
        clearTimeout(authTimeout);
        try {
          const message = JSON.parse(data.toString()) as SyncMessage;
          if (message.type === 'auth' && message.payload === this.config.authToken) {
            this.addClient(ws);
          } else {
            (ws as { close: Function }).close(4002, 'Invalid token');
          }
        } catch {
          (ws as { close: Function }).close(4003, 'Invalid message');
        }
      });
    } else {
      this.addClient(ws);
    }
  }

  private addClient(ws: unknown): void {
    this.clients.add(ws);
    this.emit('client-connected', { clientCount: this.clients.size });

    (ws as { on: Function }).on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as SyncMessage;
        this.emit('message', message, ws);
        this.emit(message.type, message.payload, ws);
      } catch (error) {
        this.emit('error', error);
      }
    });

    (ws as { on: Function }).on('close', () => {
      this.clients.delete(ws);
      this.emit('client-disconnected', { clientCount: this.clients.size });
    });

    (ws as { on: Function }).on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const message: SyncMessage = {
        type: 'heartbeat',
        payload: { timestamp: Date.now() },
        timestamp: Date.now(),
        source: 'desktop',
      };
      this.broadcast(message);
    }, this.config.heartbeatInterval);
  }
}
