/**
 * 认证管理器
 * Authentication Manager
 *
 * 统一的认证和权限管理入口
 */

import { EventEmitter } from 'events';
import {
  AuthConfig,
  DEFAULT_AUTH_CONFIG,
  Permission,
  PermissionGrant,
  PermissionRequest,
  PermissionResponse,
  PermissionScope,
  Session,
  User,
  AuthMethod,
  AuditLogEntry,
} from './types';
import {
  PermissionManager,
  createPermissionManager,
} from './permissions';
import {
  SessionManager,
  createSessionManager,
} from './session';
import {
  AuditLogManager,
  createAuditLogManager,
} from './audit';

/**
 * 认证管理器事件
 */
export interface AuthManagerEvents {
  'auth:login': (session: Session) => void;
  'auth:logout': (sessionId: string) => void;
  'auth:locked': (sessionId: string) => void;
  'auth:unlocked': (sessionId: string) => void;
  'auth:required': (reason: string) => void;
  'permission:requested': (request: PermissionRequest) => void;
  'permission:granted': (grant: PermissionGrant) => void;
  'permission:denied': (permissionId: string, reason?: string) => void;
}

/**
 * 认证管理器
 */
export class AuthManager extends EventEmitter {
  private config: AuthConfig;
  private permissionManager: PermissionManager;
  private sessionManager: SessionManager;
  private auditLogManager: AuditLogManager;

  constructor(config?: Partial<AuthConfig>) {
    super();

    this.config = {
      ...DEFAULT_AUTH_CONFIG,
      ...config,
      authentication: {
        ...DEFAULT_AUTH_CONFIG.authentication,
        ...config?.authentication,
      },
      session: {
        ...DEFAULT_AUTH_CONFIG.session,
        ...config?.session,
      },
      authorization: {
        ...DEFAULT_AUTH_CONFIG.authorization,
        ...config?.authorization,
      },
      audit: {
        ...DEFAULT_AUTH_CONFIG.audit,
        ...config?.audit,
      },
    };

    // 创建子管理器
    this.permissionManager = createPermissionManager({
      approvalPolicy: this.config.authorization.approvalPolicy,
      defaultPermissions: this.config.authorization.defaultPermissions,
    });

    this.sessionManager = createSessionManager({
      sessionTimeout: this.config.session.timeout,
      autoLockEnabled: this.config.session.autoLockEnabled,
      autoLockTimeout: this.config.session.autoLockTimeout,
      maxConcurrentSessions: this.config.session.maxConcurrentSessions,
    });

    this.auditLogManager = createAuditLogManager({
      enabled: this.config.audit.enabled,
      logRetentionDays: this.config.audit.logRetentionDays,
      logSensitiveData: this.config.audit.logSensitiveData,
    });

    // 绑定事件
    this.bindEvents();
  }

  /**
   * 绑定子管理器事件
   */
  private bindEvents(): void {
    // 会话事件
    this.sessionManager.on('session:created', (session) => {
      this.auditLogManager.logSessionCreated(session.userId, session.id);
      this.emit('auth:login', session);
    });

    this.sessionManager.on('session:expired', (sessionId) => {
      const session = this.sessionManager.getSession(sessionId);
      if (session) {
        this.auditLogManager.logSessionExpired(session.userId, sessionId);
      }
      this.permissionManager.clearSessionPermissions();
      this.emit('auth:logout', sessionId);
    });

    this.sessionManager.on('session:locked', (sessionId) => {
      const session = this.sessionManager.getSession(sessionId);
      if (session) {
        this.auditLogManager.logSessionLocked(session.userId, sessionId);
      }
      this.emit('auth:locked', sessionId);
    });

    this.sessionManager.on('session:unlocked', (sessionId) => {
      const session = this.sessionManager.getSession(sessionId);
      if (session) {
        this.auditLogManager.logSessionUnlocked(session.userId, sessionId);
      }
      this.emit('auth:unlocked', sessionId);
    });

    this.sessionManager.on('auth:required', (reason) => {
      this.emit('auth:required', reason);
    });

    // 权限事件
    this.permissionManager.on('permission:requested', (request) => {
      const session = this.sessionManager.getCurrentSession();
      this.auditLogManager.logPermissionRequested(
        request.permissionId,
        request.reason,
        session?.userId,
        session?.id
      );
      this.emit('permission:requested', request);
    });

    this.permissionManager.on('permission:granted', (grant) => {
      const session = this.sessionManager.getCurrentSession();
      this.auditLogManager.logPermissionGranted(
        grant.permissionId,
        session?.userId,
        session?.id
      );
      this.emit('permission:granted', grant);
    });

    this.permissionManager.on('permission:denied', (permissionId, reason) => {
      const session = this.sessionManager.getCurrentSession();
      this.auditLogManager.logPermissionDenied(
        permissionId,
        reason,
        session?.userId,
        session?.id
      );
      this.emit('permission:denied', permissionId, reason);
    });
  }

  // ============================================================================
  // 认证方法 (Authentication Methods)
  // ============================================================================

  /**
   * 登录
   */
  async login(
    options?: {
      password?: string;
      authMethod?: AuthMethod;
    }
  ): Promise<Session> {
    const user = this.sessionManager.getOrCreateDefaultUser();

    // 如果启用密码认证
    if (this.config.authentication.enabled &&
        this.config.authentication.methods.includes('password') &&
        options?.password) {
      const valid = await this.sessionManager.verifyPassword(user.id, options.password);
      if (!valid) {
        this.auditLogManager.logLogin(user.id, '', false);
        throw new Error('Invalid password');
      }
    }

    const session = this.sessionManager.createSession(
      user.id,
      options?.authMethod ?? 'none'
    );

    // 设置角色
    this.permissionManager.setRole(user.role);

    this.auditLogManager.logLogin(user.id, session.id, true);
    return session;
  }

  /**
   * 登出
   */
  logout(): void {
    const session = this.sessionManager.getCurrentSession();
    if (session) {
      this.auditLogManager.logLogout(session.userId, session.id);
    }
    this.sessionManager.endCurrentSession();
    this.permissionManager.clearSessionPermissions();
  }

  /**
   * 锁定
   */
  lock(): void {
    this.sessionManager.lockSession();
  }

  /**
   * 解锁
   */
  async unlock(password?: string): Promise<boolean> {
    return this.sessionManager.unlockSession(password);
  }

  /**
   * 检查是否已认证
   */
  isAuthenticated(): boolean {
    return this.sessionManager.isSessionValid();
  }

  /**
   * 记录活动
   */
  recordActivity(): void {
    this.sessionManager.recordActivity();
  }

  // ============================================================================
  // 权限方法 (Permission Methods)
  // ============================================================================

  /**
   * 检查是否有权限
   */
  hasPermission(permissionId: string, scope?: PermissionScope): boolean {
    if (!this.isAuthenticated()) {
      return false;
    }
    return this.permissionManager.hasPermission(permissionId, scope);
  }

  /**
   * 请求权限
   */
  async requestPermission(
    permissionId: string,
    context: {
      reason: string;
      planId?: string;
      stepId?: string;
      actionDescription: string;
      potentialImpact: string[];
      scope?: PermissionScope;
    }
  ): Promise<PermissionResponse> {
    if (!this.isAuthenticated()) {
      this.emit('auth:required', 'Permission request requires authentication');
      throw new Error('Not authenticated');
    }

    return this.permissionManager.requestPermission(permissionId, context);
  }

  /**
   * 响应权限请求
   */
  respondToPermissionRequest(response: PermissionResponse): void {
    this.permissionManager.respondToRequest(response);
  }

  /**
   * 获取待处理的权限请求
   */
  getPendingPermissionRequests(): PermissionRequest[] {
    return this.permissionManager.getPendingRequests();
  }

  /**
   * 获取权限定义
   */
  getPermission(permissionId: string): Permission | undefined {
    return this.permissionManager.getPermission(permissionId);
  }

  /**
   * 获取所有权限定义
   */
  getAllPermissions(): Permission[] {
    return this.permissionManager.getAllPermissions();
  }

  /**
   * 获取权限授权状态
   */
  getPermissionGrant(permissionId: string): PermissionGrant | undefined {
    return this.permissionManager.getGrant(permissionId);
  }

  /**
   * 获取所有权限授权
   */
  getAllPermissionGrants(): PermissionGrant[] {
    return this.permissionManager.getAllGrants();
  }

  /**
   * 撤销权限
   */
  revokePermission(permissionId: string): void {
    const session = this.sessionManager.getCurrentSession();
    this.auditLogManager.logPermissionRevoked(
      permissionId,
      session?.userId,
      session?.id
    );
    this.permissionManager.revokePermission(permissionId);
  }

  // ============================================================================
  // 会话方法 (Session Methods)
  // ============================================================================

  /**
   * 获取当前会话
   */
  getCurrentSession(): Session | null {
    return this.sessionManager.getCurrentSession();
  }

  /**
   * 获取当前用户
   */
  getCurrentUser(): User | undefined {
    const session = this.getCurrentSession();
    if (!session) {
      return undefined;
    }
    return this.sessionManager.getUser(session.userId);
  }

  // ============================================================================
  // 审计方法 (Audit Methods)
  // ============================================================================

  /**
   * 记录操作
   */
  logAction(
    action: string,
    resourceType: string,
    resourceId: string,
    success: boolean,
    errorMessage?: string
  ): void {
    const session = this.sessionManager.getCurrentSession();
    this.auditLogManager.logActionExecuted(
      action,
      resourceType,
      resourceId,
      success,
      errorMessage,
      session?.userId,
      session?.id
    );
  }

  /**
   * 记录操作被阻止
   */
  logActionBlocked(action: string, reason: string): void {
    const session = this.sessionManager.getCurrentSession();
    this.auditLogManager.logActionBlocked(
      action,
      reason,
      session?.userId,
      session?.id
    );
  }

  /**
   * 获取审计日志
   */
  getAuditLogs(query?: {
    eventTypes?: string[];
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): AuditLogEntry[] {
    if (!query) {
      return this.auditLogManager.getAllLogs();
    }

    if (query.startTime || query.endTime) {
      return this.auditLogManager.getLogsByTimeRange(
        query.startTime ?? 0,
        query.endTime ?? Date.now()
      );
    }

    if (query.limit) {
      return this.auditLogManager.getRecentLogs(query.limit);
    }

    return this.auditLogManager.getAllLogs();
  }

  /**
   * 获取审计统计
   */
  getAuditStatistics(): ReturnType<AuditLogManager['getStatistics']> {
    return this.auditLogManager.getStatistics();
  }

  // ============================================================================
  // 配置方法 (Configuration Methods)
  // ============================================================================

  /**
   * 获取配置
   */
  getConfig(): AuthConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AuthConfig>): void {
    const session = this.sessionManager.getCurrentSession();

    if (config.authentication) {
      Object.assign(this.config.authentication, config.authentication);
      this.auditLogManager.logConfigChanged(
        'authentication',
        session?.userId,
        session?.id
      );
    }

    if (config.session) {
      Object.assign(this.config.session, config.session);
      this.auditLogManager.logConfigChanged(
        'session',
        session?.userId,
        session?.id
      );
    }

    if (config.authorization) {
      Object.assign(this.config.authorization, config.authorization);
      this.auditLogManager.logConfigChanged(
        'authorization',
        session?.userId,
        session?.id
      );
    }

    if (config.audit) {
      Object.assign(this.config.audit, config.audit);
      this.auditLogManager.logConfigChanged(
        'audit',
        session?.userId,
        session?.id
      );
    }
  }

  // ============================================================================
  // 状态导出/导入 (State Export/Import)
  // ============================================================================

  /**
   * 导出状态
   */
  exportState(): {
    permissions: ReturnType<PermissionManager['exportState']>;
    sessions: ReturnType<SessionManager['exportState']>;
  } {
    return {
      permissions: this.permissionManager.exportState(),
      sessions: this.sessionManager.exportState(),
    };
  }

  /**
   * 导入状态
   */
  importState(state: {
    permissions?: ReturnType<PermissionManager['exportState']>;
    sessions?: ReturnType<SessionManager['exportState']>;
  }): void {
    if (state.permissions) {
      this.permissionManager.importState(state.permissions);
    }
    if (state.sessions) {
      this.sessionManager.importState(state.sessions);
    }
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.sessionManager.destroy();
  }

  // ============================================================================
  // 子管理器访问 (Sub-manager Access)
  // ============================================================================

  /**
   * 获取权限管理器
   */
  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }

  /**
   * 获取会话管理器
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * 获取审计日志管理器
   */
  getAuditLogManager(): AuditLogManager {
    return this.auditLogManager;
  }
}

// 单例实例
let authManagerInstance: AuthManager | null = null;

/**
 * 获取认证管理器单例
 */
export function getAuthManager(): AuthManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager();
  }
  return authManagerInstance;
}

/**
 * 创建认证管理器
 */
export function createAuthManager(config?: Partial<AuthConfig>): AuthManager {
  return new AuthManager(config);
}

/**
 * 设置认证管理器单例
 */
export function setAuthManager(manager: AuthManager): void {
  authManagerInstance = manager;
}
