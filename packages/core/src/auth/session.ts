/**
 * 会话管理器
 * Session Manager
 *
 * 管理用户会话、自动锁定和认证状态
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  Session,
  User,
  UserPreferences,
  AuthMethod,
  SessionManagerConfig,
  DEFAULT_USER_PREFERENCES,
} from './types';

/**
 * 会话管理器事件
 */
export interface SessionManagerEvents {
  'session:created': (session: Session) => void;
  'session:expired': (sessionId: string) => void;
  'session:locked': (sessionId: string) => void;
  'session:unlocked': (sessionId: string) => void;
  'session:activity': (sessionId: string) => void;
  'auth:required': (reason: string) => void;
}

/**
 * 会话管理器
 */
export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private currentSessionId: string | null = null;
  private users: Map<string, User> = new Map();
  private passwordHashes: Map<string, string> = new Map();
  private autoLockTimer: NodeJS.Timeout | null = null;
  private config: SessionManagerConfig;

  constructor(config?: Partial<SessionManagerConfig>) {
    super();

    this.config = {
      sessionTimeout: config?.sessionTimeout ?? 24 * 60 * 60 * 1000, // 24 hours
      autoLockEnabled: config?.autoLockEnabled ?? true,
      autoLockTimeout: config?.autoLockTimeout ?? 5 * 60 * 1000, // 5 minutes
      maxConcurrentSessions: config?.maxConcurrentSessions ?? 3,
    };

    // 启动会话过期检查
    this.startExpirationCheck();
  }

  /**
   * 创建或获取默认用户
   */
  getOrCreateDefaultUser(): User {
    const defaultUserId = 'default';
    let user = this.users.get(defaultUserId);

    if (!user) {
      user = {
        id: defaultUserId,
        username: 'default',
        role: 'executor',
        createdAt: Date.now(),
        preferences: { ...DEFAULT_USER_PREFERENCES },
      };
      this.users.set(defaultUserId, user);
    }

    return user;
  }

  /**
   * 创建会话
   */
  createSession(
    userId: string,
    authMethod: AuthMethod = 'none'
  ): Session {
    // 检查用户是否存在
    let user = this.users.get(userId);
    if (!user) {
      user = this.getOrCreateDefaultUser();
      userId = user.id;
    }

    // 检查并发会话数
    const userSessions = this.getUserSessions(userId);
    if (userSessions.length >= this.config.maxConcurrentSessions) {
      // 关闭最旧的会话
      const oldestSession = userSessions.sort(
        (a, b) => a.createdAt - b.createdAt
      )[0];
      this.endSession(oldestSession.id);
    }

    const now = Date.now();
    const session: Session = {
      id: uuidv4(),
      userId,
      createdAt: now,
      expiresAt: now + this.config.sessionTimeout,
      lastActivityAt: now,
      authMethod,
      isLocked: false,
      deviceInfo: {
        platform: process.platform,
        hostname: require('os').hostname(),
      },
    };

    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;

    // 更新用户最后登录时间
    user.lastLoginAt = now;

    // 启动自动锁定计时器
    this.resetAutoLockTimer();

    this.emit('session:created', session);
    return session;
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): Session | null {
    if (!this.currentSessionId) {
      return null;
    }
    return this.sessions.get(this.currentSessionId) ?? null;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 获取用户所有会话
   */
  getUserSessions(userId: string): Session[] {
    return Array.from(this.sessions.values()).filter(
      s => s.userId === userId
    );
  }

  /**
   * 记录活动
   */
  recordActivity(): void {
    const session = this.getCurrentSession();
    if (session && !session.isLocked) {
      session.lastActivityAt = Date.now();
      this.resetAutoLockTimer();
      this.emit('session:activity', session.id);
    }
  }

  /**
   * 锁定当前会话
   */
  lockSession(): void {
    const session = this.getCurrentSession();
    if (session) {
      session.isLocked = true;
      this.clearAutoLockTimer();
      this.emit('session:locked', session.id);
    }
  }

  /**
   * 解锁会话
   */
  async unlockSession(password?: string): Promise<boolean> {
    const session = this.getCurrentSession();
    if (!session) {
      return false;
    }

    // 如果需要密码验证
    if (session.authMethod === 'password' && password) {
      const user = this.users.get(session.userId);
      if (!user) {
        return false;
      }

      const valid = await this.verifyPassword(session.userId, password);
      if (!valid) {
        return false;
      }
    }

    session.isLocked = false;
    session.lastActivityAt = Date.now();
    this.resetAutoLockTimer();
    this.emit('session:unlocked', session.id);
    return true;
  }

  /**
   * 结束会话
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
        this.clearAutoLockTimer();
      }
      this.emit('session:expired', sessionId);
    }
  }

  /**
   * 结束当前会话
   */
  endCurrentSession(): void {
    if (this.currentSessionId) {
      this.endSession(this.currentSessionId);
    }
  }

  /**
   * 检查会话是否有效
   */
  isSessionValid(): boolean {
    const session = this.getCurrentSession();
    if (!session) {
      return false;
    }

    if (session.isLocked) {
      return false;
    }

    if (session.expiresAt < Date.now()) {
      this.endSession(session.id);
      return false;
    }

    return true;
  }

  /**
   * 检查是否需要认证
   */
  requiresAuth(reason?: string): boolean {
    const session = this.getCurrentSession();
    if (!session || session.isLocked) {
      this.emit('auth:required', reason ?? 'Session locked or not found');
      return true;
    }
    return false;
  }

  /**
   * 设置用户密码
   */
  async setPassword(userId: string, password: string): Promise<void> {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await this.hashPassword(password, salt);
    this.passwordHashes.set(userId, `${salt}:${hash}`);
  }

  /**
   * 验证密码
   */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const stored = this.passwordHashes.get(userId);
    if (!stored) {
      return false;
    }

    const [salt, storedHash] = stored.split(':');
    const hash = await this.hashPassword(password, salt);
    return hash === storedHash;
  }

  /**
   * 哈希密码
   */
  private async hashPassword(password: string, salt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey.toString('hex'));
      });
    });
  }

  /**
   * 重置自动锁定计时器
   */
  private resetAutoLockTimer(): void {
    this.clearAutoLockTimer();

    if (!this.config.autoLockEnabled) {
      return;
    }

    const session = this.getCurrentSession();
    if (!session) {
      return;
    }

    const user = this.users.get(session.userId);
    const timeout = user?.preferences.autoLockTimeout ?? this.config.autoLockTimeout;

    this.autoLockTimer = setTimeout(() => {
      this.lockSession();
    }, timeout);
  }

  /**
   * 清除自动锁定计时器
   */
  private clearAutoLockTimer(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }

  /**
   * 启动会话过期检查
   */
  private startExpirationCheck(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        if (session.expiresAt < now) {
          this.endSession(id);
        }
      }
    }, 60 * 1000); // 每分钟检查一次
  }

  /**
   * 获取用户
   */
  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  /**
   * 更新用户偏好
   */
  updateUserPreferences(
    userId: string,
    preferences: Partial<UserPreferences>
  ): void {
    const user = this.users.get(userId);
    if (user) {
      user.preferences = { ...user.preferences, ...preferences };
    }
  }

  /**
   * 导出会话状态
   */
  exportState(): {
    sessions: Session[];
    users: User[];
    currentSessionId: string | null;
  } {
    return {
      sessions: Array.from(this.sessions.values()),
      users: Array.from(this.users.values()),
      currentSessionId: this.currentSessionId,
    };
  }

  /**
   * 导入会话状态
   */
  importState(state: {
    sessions?: Session[];
    users?: User[];
    currentSessionId?: string | null;
  }): void {
    // 导入用户
    if (state.users) {
      for (const user of state.users) {
        this.users.set(user.id, user);
      }
    }

    // 导入会话（跳过已过期的）
    if (state.sessions) {
      const now = Date.now();
      for (const session of state.sessions) {
        if (session.expiresAt > now) {
          this.sessions.set(session.id, session);
        }
      }
    }

    // 恢复当前会话
    if (state.currentSessionId && this.sessions.has(state.currentSessionId)) {
      this.currentSessionId = state.currentSessionId;
      this.resetAutoLockTimer();
    }
  }

  /**
   * 销毁会话管理器
   */
  destroy(): void {
    this.clearAutoLockTimer();
    this.sessions.clear();
    this.currentSessionId = null;
  }
}

/**
 * 创建会话管理器
 */
export function createSessionManager(
  config?: Partial<SessionManagerConfig>
): SessionManager {
  return new SessionManager(config);
}
