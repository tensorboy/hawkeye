/**
 * SessionStore - 会话持久化存储
 * 基于 memu-cowork 的会话管理模式
 *
 * 存储结构:
 * {basePath}/
 *   └── sessions/
 *       ├── index.json           # 会话列表索引 (快速加载)
 *       └── data/
 *           ├── {session-id}.json  # 完整会话数据
 *           └── ...
 */

import { existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ============ 类型定义 ============

/**
 * 会话状态
 */
export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived';

/**
 * 会话元数据
 */
export interface Session {
  id: string;
  /** 关联的代理会话 ID (如果有) */
  agentSessionId?: string;
  /** 代理 ID */
  agentId?: string;
  /** 会话标题 */
  title?: string;
  /** 工作目录 */
  workingDirectory?: string;
  /** 会话状态 */
  status: SessionStatus;
  /** 消息数量 */
  messageCount: number;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 会话更新记录
 */
export interface SessionUpdate {
  /** 时间戳 */
  timestamp: string;
  /** 序列号 (保证顺序) */
  sequenceNumber: number;
  /** 更新类型 */
  type: 'message' | 'status' | 'metadata' | 'memory';
  /** 更新数据 */
  data: unknown;
}

/**
 * 完整会话数据
 */
export interface SessionData {
  session: Session;
  updates: SessionUpdate[];
}

/**
 * 创建会话参数
 */
export interface CreateSessionParams {
  agentSessionId?: string;
  agentId?: string;
  title?: string;
  workingDirectory?: string;
}

/**
 * 列表查询选项
 */
export interface ListSessionsOptions {
  agentId?: string;
  status?: SessionStatus;
  limit?: number;
  offset?: number;
}

// ============ LRU 缓存实现 ============

class LRUCache<K, V> {
  private maxSize: number;
  private cache: Map<K, V> = new Map();

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;

    // Move to end (most recently used)
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    // If key exists, delete first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      } else {
        break;
      }
    }

    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============ 简单 Mutex 实现 ============

class Mutex {
  private locked = false;
  private waitQueue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// ============ SessionStore 类 ============

/** 默认缓存大小 */
const DEFAULT_CACHE_SIZE = 50;

export class SessionStore {
  private basePath: string;
  private indexPath: string;
  private dataPath: string;

  // 内存缓存 (LRU)
  private sessionsIndex: Map<string, Session> = new Map();
  private loadedSessions: LRUCache<string, SessionData>;

  // 写入队列 (防止并发写入)
  private writeQueues: Map<string, Promise<void>> = new Map();

  // 序列号计数器 (每个会话独立)
  private sequenceCounters: Map<string, number> = new Map();

  // Mutex for operations that need atomicity
  private appendMutex: Map<string, Mutex> = new Map();
  private indexMutex = new Mutex();

  constructor(basePath: string, cacheSize = DEFAULT_CACHE_SIZE) {
    this.basePath = basePath;
    this.indexPath = join(basePath, 'sessions', 'index.json');
    this.dataPath = join(basePath, 'sessions', 'data');
    this.loadedSessions = new LRUCache(cacheSize);
  }

  /**
   * 初始化存储目录和加载索引
   */
  async initialize(): Promise<void> {
    const sessionsDir = join(this.basePath, 'sessions');

    // 确保目录存在
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }
    if (!existsSync(this.dataPath)) {
      mkdirSync(this.dataPath, { recursive: true });
    }

    // 加载索引
    await this.loadIndex();
  }

  /**
   * 创建新会话
   */
  async create(params: CreateSessionParams): Promise<Session> {
    // 输入验证
    if (params.title && params.title.length > 500) {
      throw new Error('Session title exceeds maximum length of 500 characters');
    }
    if (params.workingDirectory && params.workingDirectory.length > 1000) {
      throw new Error('Working directory path exceeds maximum length');
    }

    const now = new Date().toISOString();
    const session: Session = {
      id: randomUUID(),
      agentSessionId: params.agentSessionId,
      agentId: params.agentId,
      title: params.title,
      workingDirectory: params.workingDirectory,
      status: 'active',
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // 添加到索引
    this.sessionsIndex.set(session.id, session);

    // 创建会话数据
    const sessionData: SessionData = {
      session,
      updates: [],
    };
    this.loadedSessions.set(session.id, sessionData);

    // 持久化: 先写数据，再写索引 (保证一致性)
    await this.saveSessionData(session.id);
    await this.saveIndex();

    return session;
  }

  /**
   * 获取会话列表
   */
  async list(options?: ListSessionsOptions): Promise<Session[]> {
    let sessions = Array.from(this.sessionsIndex.values());

    // 按代理过滤
    if (options?.agentId) {
      sessions = sessions.filter((s) => s.agentId === options.agentId);
    }

    // 按状态过滤
    if (options?.status) {
      sessions = sessions.filter((s) => s.status === options.status);
    }

    // 按更新时间降序排序
    sessions.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    // 分页
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? sessions.length;
    sessions = sessions.slice(offset, offset + limit);

    return sessions;
  }

  /**
   * 获取单个会话的完整数据
   */
  async get(sessionId: string): Promise<SessionData | null> {
    // 输入验证
    if (!sessionId || typeof sessionId !== 'string') {
      return null;
    }

    // 先检查缓存 (LRU cache will update access order)
    const cached = this.loadedSessions.get(sessionId);
    if (cached) {
      return cached;
    }

    // 检查索引中是否存在
    if (!this.sessionsIndex.has(sessionId)) {
      return null;
    }

    // 从磁盘加载
    const dataPath = this.getSessionDataPath(sessionId);
    if (!existsSync(dataPath)) {
      return null;
    }

    try {
      const content = await readFile(dataPath, 'utf-8');
      const sessionData = JSON.parse(content) as SessionData;
      this.loadedSessions.set(sessionId, sessionData);
      // 初始化序列号
      this.initSequenceCounter(sessionId, sessionData.updates);
      return sessionData;
    } catch (err) {
      console.error(`[SessionStore] Failed to load session: ${sessionId}`, err);
      return null;
    }
  }

  /**
   * 追加会话更新
   */
  async appendUpdate(
    sessionId: string,
    type: SessionUpdate['type'],
    data: unknown
  ): Promise<SessionUpdate> {
    // 获取或创建该会话的 mutex
    let mutex = this.appendMutex.get(sessionId);
    if (!mutex) {
      mutex = new Mutex();
      this.appendMutex.set(sessionId, mutex);
    }

    // 使用 mutex 保证原子性
    return mutex.withLock(async () => {
      // 确保会话已加载
      const sessionData = await this.get(sessionId);
      if (!sessionData) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // 获取下一个序列号 (在 mutex 保护下是安全的)
      const currentSeq = this.sequenceCounters.get(sessionId) ?? 0;
      const nextSeq = currentSeq + 1;
      this.sequenceCounters.set(sessionId, nextSeq);

      // 创建更新记录
      const update: SessionUpdate = {
        timestamp: new Date().toISOString(),
        sequenceNumber: nextSeq,
        type,
        data,
      };
      sessionData.updates.push(update);

      // 更新元数据
      sessionData.session.updatedAt = update.timestamp;
      if (type === 'message') {
        sessionData.session.messageCount++;
      }

      // 更新索引
      this.sessionsIndex.set(sessionId, sessionData.session);

      // 持久化: 先写数据，再写索引 (保证一致性)
      await this.saveSessionData(sessionId);
      await this.saveIndex();

      return update;
    });
  }

  /**
   * 更新会话元数据
   */
  async updateMeta(
    sessionId: string,
    updates: Partial<Session>
  ): Promise<Session> {
    // 输入验证
    if (updates.title && updates.title.length > 500) {
      throw new Error('Session title exceeds maximum length of 500 characters');
    }

    // 获取或创建该会话的 mutex
    let mutex = this.appendMutex.get(sessionId);
    if (!mutex) {
      mutex = new Mutex();
      this.appendMutex.set(sessionId, mutex);
    }

    return mutex.withLock(async () => {
      const sessionData = await this.get(sessionId);
      if (!sessionData) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // 应用更新
      if (updates.title !== undefined) {
        sessionData.session.title = updates.title;
      }
      if (updates.status !== undefined) {
        sessionData.session.status = updates.status;
      }
      if (updates.agentSessionId !== undefined) {
        sessionData.session.agentSessionId = updates.agentSessionId;
      }
      if (updates.agentId !== undefined) {
        sessionData.session.agentId = updates.agentId;
      }
      if (updates.workingDirectory !== undefined) {
        sessionData.session.workingDirectory = updates.workingDirectory;
      }

      // 更新时间戳
      sessionData.session.updatedAt = new Date().toISOString();

      // 更新索引
      this.sessionsIndex.set(sessionId, sessionData.session);

      // 持久化: 先写数据，再写索引
      await this.saveSessionData(sessionId);
      await this.saveIndex();

      return sessionData.session;
    });
  }

  /**
   * 删除会话
   */
  async delete(sessionId: string): Promise<void> {
    // 输入验证
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid session ID');
    }

    // 从索引移除
    this.sessionsIndex.delete(sessionId);

    // 从缓存移除
    this.loadedSessions.delete(sessionId);

    // 清理相关的 mutex 和 sequence counter
    this.appendMutex.delete(sessionId);
    this.sequenceCounters.delete(sessionId);

    // 清理 writeQueues 中该会话的条目
    this.writeQueues.delete(sessionId);

    // 删除数据文件
    const dataPath = this.getSessionDataPath(sessionId);
    if (existsSync(dataPath)) {
      unlinkSync(dataPath);
    }

    // 持久化索引
    await this.saveIndex();
  }

  /**
   * 通过代理会话 ID 查找
   */
  getByAgentSessionId(agentSessionId: string): Session | null {
    for (const session of this.sessionsIndex.values()) {
      if (session.agentSessionId === agentSessionId) {
        return session;
      }
    }
    return null;
  }

  /**
   * 获取会话历史记录 (用于恢复)
   */
  async getHistory(sessionId: string): Promise<SessionUpdate[]> {
    const sessionData = await this.get(sessionId);
    if (!sessionData) return [];

    // 按序列号排序
    return [...sessionData.updates].sort(
      (a, b) => a.sequenceNumber - b.sequenceNumber
    );
  }

  /**
   * 格式化历史为文本 (用于注入上下文)
   */
  async formatHistoryAsText(sessionId: string): Promise<string> {
    const history = await this.getHistory(sessionId);
    const messages = history.filter((u) => u.type === 'message');

    return messages
      .map((m) => {
        const data = m.data as { role?: string; content?: string };
        const role = data.role || 'unknown';
        const content = data.content || '';
        return `[${role}]: ${content}`;
      })
      .join('\n\n');
  }

  // --- 私有方法 ---

  private getSessionDataPath(sessionId: string): string {
    return join(this.dataPath, `${sessionId}.json`);
  }

  private async loadIndex(): Promise<void> {
    if (!existsSync(this.indexPath)) {
      this.sessionsIndex = new Map();
      return;
    }

    try {
      const content = await readFile(this.indexPath, 'utf-8');
      const sessions = JSON.parse(content) as Session[];
      this.sessionsIndex = new Map(sessions.map((s) => [s.id, s]));
    } catch {
      console.error('[SessionStore] Failed to load index, starting fresh');
      this.sessionsIndex = new Map();
    }
  }

  private async saveIndex(): Promise<void> {
    await this.atomicWrite('__index__', this.indexPath, async () => {
      const sessions = Array.from(this.sessionsIndex.values());
      return JSON.stringify(sessions, null, 2);
    });
  }

  private async saveSessionData(sessionId: string): Promise<void> {
    const sessionData = this.loadedSessions.get(sessionId);
    if (!sessionData) return;

    const dataPath = this.getSessionDataPath(sessionId);
    await this.atomicWrite(sessionId, dataPath, async () => {
      return JSON.stringify(sessionData, null, 2);
    });
  }

  private initSequenceCounter(
    sessionId: string,
    updates: SessionUpdate[]
  ): void {
    let maxSeq = 0;
    for (const update of updates) {
      if (update.sequenceNumber && update.sequenceNumber > maxSeq) {
        maxSeq = update.sequenceNumber;
      }
    }
    this.sequenceCounters.set(sessionId, maxSeq);
  }

  /**
   * 原子写入 (防止并发写入导致数据损坏)
   */
  private async atomicWrite(
    lockKey: string,
    filePath: string,
    getData: () => Promise<string>
  ): Promise<void> {
    const doWrite = async (): Promise<void> => {
      const tempPath = `${filePath}.tmp.${Date.now()}.${randomUUID().slice(0, 8)}`;
      try {
        const data = await getData();
        await writeFile(tempPath, data);
        renameSync(tempPath, filePath);
      } catch (err) {
        try {
          if (existsSync(tempPath)) {
            unlinkSync(tempPath);
          }
        } catch {
          // 忽略清理错误
        }
        throw err;
      }
    };

    // 获取当前写入队列
    const previousWrite = this.writeQueues.get(lockKey) ?? Promise.resolve();

    // 链式写入 (等待前一个完成)
    const thisWrite = previousWrite.catch(() => {}).then(doWrite);

    // 更新队列
    this.writeQueues.set(
      lockKey,
      thisWrite.catch(() => {})
    );

    // 写入完成后清理 writeQueues 中已完成的条目
    thisWrite
      .catch(() => {})
      .finally(() => {
        // 检查是否是最后一个写入操作
        const currentQueue = this.writeQueues.get(lockKey);
        if (currentQueue === thisWrite.catch(() => {})) {
          // 延迟清理，避免立即删除导致新写入丢失
          setTimeout(() => {
            const latestQueue = this.writeQueues.get(lockKey);
            if (latestQueue === currentQueue) {
              this.writeQueues.delete(lockKey);
            }
          }, 1000);
        }
      });

    return thisWrite;
  }

  /**
   * 清理所有资源
   */
  async dispose(): Promise<void> {
    // 等待所有写入完成
    const pending = Array.from(this.writeQueues.values());
    await Promise.all(pending.map((p) => p.catch(() => {})));

    // 清理所有缓存和状态
    this.loadedSessions.clear();
    this.writeQueues.clear();
    this.appendMutex.clear();
    this.sequenceCounters.clear();
  }
}

// ============ 单例实例 ============

let sessionStoreInstance: SessionStore | null = null;

/**
 * 获取 SessionStore 实例
 */
export function getSessionStore(): SessionStore | null {
  return sessionStoreInstance;
}

/**
 * 设置 SessionStore 实例
 */
export function setSessionStore(store: SessionStore): void {
  sessionStoreInstance = store;
}

/**
 * 创建并初始化 SessionStore
 */
export async function createSessionStore(
  basePath: string
): Promise<SessionStore> {
  const store = new SessionStore(basePath);
  await store.initialize();
  sessionStoreInstance = store;
  return store;
}
