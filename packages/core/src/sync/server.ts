/**
 * 同步服务器 - 运行在桌面应用中
 * 使用 WebSocket 与浏览器扩展和 Web 应用通信
 */

import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';
import type {
  SyncConfig,
  SyncMessage,
  SyncMessageType,
  ContextUpdatePayload,
  IntentDetectedPayload,
  PlanGeneratedPayload,
  ExecutionProgressPayload,
  ExecutionCompletedPayload,
  ExecutionFailedPayload,
  StatusPayload,
  ErrorPayload,
} from './types';

interface WebSocketLike {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
}

interface WebSocketServerLike {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  close: () => void;
}

interface ClientInfo {
  ws: WebSocketLike;
  type: 'desktop' | 'extension' | 'web' | 'vscode';
  connectedAt: number;
  lastSeen: number;
  authenticated: boolean;
}

export class SyncServer extends EventEmitter {
  private config: Required<SyncConfig>;
  private server: WebSocketServerLike | null = null;
  private clients: Map<WebSocketLike, ClientInfo> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private messageId: number = 0;

  constructor(config: SyncConfig = {}) {
    super();
    this.config = {
      port: 9527,
      authToken: config.authToken || randomBytes(32).toString('hex'),
      heartbeatInterval: 30000,
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      ...config,
    };
    // Ensure authToken is never empty — auto-generate if missing
    if (!this.config.authToken) {
      this.config.authToken = randomBytes(32).toString('hex');
    }
  }

  getAuthToken(): string {
    return this.config.authToken;
  }

  /**
   * 启动同步服务器
   * 支持端口冲突时自动尝试备选端口
   */
  async start(): Promise<void> {
    const maxRetries = 5;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const port = this.config.port + attempt;
      try {
        await this.tryStartOnPort(port);
        if (attempt > 0) {
          console.log(`[SyncServer] 端口 ${this.config.port} 被占用，使用备选端口 ${port}`);
        }
        this.config.port = port; // 更新实际使用的端口
        return;
      } catch (error: any) {
        lastError = error;
        if (error.code === 'EADDRINUSE') {
          console.log(`[SyncServer] 端口 ${port} 被占用，尝试下一个...`);
          continue;
        }
        // 非端口占用错误，直接抛出
        throw error;
      }
    }

    // 所有端口都被占用，发出警告但不阻止应用启动
    console.warn(`[SyncServer] ⚠️ 无法启动同步服务器：所有端口 ${this.config.port}-${this.config.port + maxRetries - 1} 都被占用`);
    console.warn(`[SyncServer] 应用将在无同步功能的模式下运行`);
    this.emit('start-failed', { reason: 'all-ports-busy', lastError });
  }

  /**
   * 尝试在指定端口启动服务器
   */
  private async tryStartOnPort(port: number): Promise<void> {
    return new Promise(async (resolve, reject) => {
      // 动态导入 ws 模块
      const { WebSocketServer } = await import('ws');

      const server = new WebSocketServer({ port }) as WebSocketServerLike;

      // 监听错误（包括 EADDRINUSE）
      const errorHandler = ((...args: unknown[]) => {
        const error = args[0] as Error;
        server.close();
        reject(error);
      }) as (...args: unknown[]) => void;
      server.on('error', errorHandler);

      // 监听 listening 事件确认启动成功
      (server as any).on('listening', () => {
        // 移除临时错误处理器，设置正式的
        (server as any).removeListener('error', errorHandler);

        this.server = server;

        server.on('connection', ((...args: unknown[]) => {
          const ws = args[0] as WebSocketLike;
          const req = args[1];
          this.handleConnection(ws, req);
        }) as (...args: unknown[]) => void);

        server.on('error', ((...args: unknown[]) => {
          const error = args[0] as Error;
          this.emit('error', error);
        }) as (...args: unknown[]) => void);

        // 启动心跳
        this.startHeartbeat();

        this.emit('started', { port });
        resolve();
      });
    });
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
      this.server.close();
      this.server = null;
    }

    this.clients.clear();
    this.emit('stopped');
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast<T>(type: SyncMessageType, payload: T): void {
    const message = this.createMessage(type, payload);
    const data = JSON.stringify(message);

    for (const [ws, info] of this.clients) {
      if (ws.readyState === 1 && info.authenticated) { // WebSocket.OPEN
        ws.send(data);
      }
    }
  }

  /**
   * 发送消息给特定客户端
   */
  send<T>(ws: WebSocketLike, type: SyncMessageType, payload: T): void {
    if (ws.readyState === 1) {
      const message = this.createMessage(type, payload);
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * 发送消息给特定类型的客户端
   */
  sendToType<T>(clientType: ClientInfo['type'], type: SyncMessageType, payload: T): void {
    const message = this.createMessage(type, payload);
    const data = JSON.stringify(message);

    for (const [ws, info] of this.clients) {
      if (ws.readyState === 1 && info.authenticated && info.type === clientType) {
        ws.send(data);
      }
    }
  }

  // ============ 便捷发送方法 ============

  /**
   * 广播上下文更新
   */
  broadcastContextUpdate(payload: ContextUpdatePayload): void {
    this.broadcast('context_update', payload);
  }

  /**
   * 广播意图检测结果
   */
  broadcastIntentDetected(payload: IntentDetectedPayload): void {
    this.broadcast('intent_detected', payload);
  }

  /**
   * 广播计划生成结果
   */
  broadcastPlanGenerated(payload: PlanGeneratedPayload): void {
    this.broadcast('plan_generated', payload);
  }

  /**
   * 广播执行进度
   */
  broadcastExecutionProgress(payload: ExecutionProgressPayload): void {
    this.broadcast('execution_progress', payload);
  }

  /**
   * 广播执行完成
   */
  broadcastExecutionCompleted(payload: ExecutionCompletedPayload): void {
    this.broadcast('execution_completed', payload);
  }

  /**
   * 广播执行失败
   */
  broadcastExecutionFailed(payload: ExecutionFailedPayload): void {
    this.broadcast('execution_failed', payload);
  }

  /**
   * 广播错误
   */
  broadcastError(payload: ErrorPayload): void {
    this.broadcast('error', payload);
  }

  /**
   * 获取连接的客户端数量
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 获取已认证的客户端数量
   */
  getAuthenticatedClientCount(): number {
    let count = 0;
    for (const info of this.clients.values()) {
      if (info.authenticated) count++;
    }
    return count;
  }

  /**
   * 获取客户端信息
   */
  getClientsInfo(): Array<{
    type: ClientInfo['type'];
    connectedAt: number;
    lastSeen: number;
  }> {
    return Array.from(this.clients.values())
      .filter(info => info.authenticated)
      .map(info => ({
        type: info.type,
        connectedAt: info.connectedAt,
        lastSeen: info.lastSeen,
      }));
  }

  // ============ 私有方法 ============

  private handleConnection(ws: WebSocketLike, _req: unknown): void {
    const clientInfo: ClientInfo = {
      ws,
      type: 'extension',
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      authenticated: !this.config.authToken, // 没有 token 时自动认证
    };

    this.clients.set(ws, clientInfo);

    // 认证检查
    if (this.config.authToken) {
      // 等待认证消息
      const authTimeout = setTimeout(() => {
        ws.close(4001, 'Authentication timeout');
        this.clients.delete(ws);
      }, 5000);

      ws.once('message', ((...args: unknown[]) => {
        const data = args[0] as Buffer;
        clearTimeout(authTimeout);
        try {
          const message = JSON.parse(data.toString()) as SyncMessage;
          if (message.type === 'auth') {
            const authPayload = message.payload as { token: string; clientType?: ClientInfo['type'] };
            if (authPayload.token === this.config.authToken) {
              clientInfo.authenticated = true;
              clientInfo.type = authPayload.clientType || 'extension';
              this.send(ws, 'auth_success', { message: 'Authenticated' });
              this.setupClientListeners(ws, clientInfo);
            } else {
              this.send(ws, 'auth_failed', { message: 'Invalid token' });
              ws.close(4002, 'Invalid token');
              this.clients.delete(ws);
            }
          } else {
            ws.close(4003, 'Expected auth message');
            this.clients.delete(ws);
          }
        } catch {
          ws.close(4003, 'Invalid message');
          this.clients.delete(ws);
        }
      }) as (...args: unknown[]) => void);
    } else {
      this.setupClientListeners(ws, clientInfo);
    }
  }

  private setupClientListeners(ws: WebSocketLike, clientInfo: ClientInfo): void {
    this.emit('client-connected', {
      clientCount: this.getAuthenticatedClientCount(),
      clientType: clientInfo.type,
    });

    ws.on('message', ((...args: unknown[]) => {
      const data = args[0] as Buffer;
      try {
        const message = JSON.parse(data.toString()) as SyncMessage;
        clientInfo.lastSeen = Date.now();

        // 更新客户端类型
        if (message.source) {
          clientInfo.type = message.source;
        }

        // 处理心跳响应
        if (message.type === 'pong') {
          return;
        }

        // 触发通用消息事件
        this.emit('message', message, ws);

        // 触发特定类型的消息事件
        this.emit(message.type, message.payload, ws, message);
      } catch (error) {
        this.emit('error', error);
      }
    }) as (...args: unknown[]) => void);

    ws.on('close', (() => {
      this.clients.delete(ws);
      this.emit('client-disconnected', {
        clientCount: this.getAuthenticatedClientCount(),
        clientType: clientInfo.type,
      });
    }) as (...args: unknown[]) => void);

    ws.on('error', ((...args: unknown[]) => {
      const error = args[0] as Error;
      this.emit('error', error);
    }) as (...args: unknown[]) => void);

    // 发送当前状态
    this.sendStatus(ws);
  }

  private sendStatus(ws: WebSocketLike): void {
    const status: StatusPayload = {
      connected: true,
      lastSeen: Date.now(),
      clientType: 'desktop',
      capabilities: [
        'context_update',
        'intent_detection',
        'plan_generation',
        'execution',
      ],
    };
    this.send(ws, 'status', status);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const message = this.createMessage('heartbeat', { timestamp: Date.now() });
      const data = JSON.stringify(message);

      for (const [ws, info] of this.clients) {
        if (ws.readyState === 1 && info.authenticated) {
          ws.send(data);

          // 检查客户端是否响应
          const timeSinceLastSeen = Date.now() - info.lastSeen;
          if (timeSinceLastSeen > this.config.heartbeatInterval * 3) {
            // 客户端可能已断开
            ws.close(4004, 'Heartbeat timeout');
            this.clients.delete(ws);
          }
        }
      }
    }, this.config.heartbeatInterval);
  }

  private createMessage<T>(type: SyncMessageType, payload: T): SyncMessage<T> {
    return {
      type,
      payload,
      timestamp: Date.now(),
      source: 'desktop',
      id: `msg_${++this.messageId}`,
    };
  }
}
