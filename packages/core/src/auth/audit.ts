/**
 * 审计日志管理器
 * Audit Log Manager
 *
 * 记录所有安全相关的事件和操作
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  AuditLogEntry,
  AuditEventType,
} from './types';

/**
 * 审计日志配置
 */
export interface AuditLogConfig {
  enabled: boolean;
  logRetentionDays: number;
  logSensitiveData: boolean;
  maxEntriesInMemory: number;
  onLog?: (entry: AuditLogEntry) => void;
}

/**
 * 默认审计日志配置
 */
const DEFAULT_AUDIT_CONFIG: AuditLogConfig = {
  enabled: true,
  logRetentionDays: 90,
  logSensitiveData: false,
  maxEntriesInMemory: 10000,
};

/**
 * 审计日志管理器事件
 */
export interface AuditLogManagerEvents {
  'log:created': (entry: AuditLogEntry) => void;
  'log:exported': (entries: AuditLogEntry[]) => void;
  'log:cleaned': (deletedCount: number) => void;
}

/**
 * 审计日志管理器
 */
export class AuditLogManager extends EventEmitter {
  private logs: AuditLogEntry[] = [];
  private config: AuditLogConfig;

  constructor(config?: Partial<AuditLogConfig>) {
    super();
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };

    // 启动定期清理
    this.startCleanupJob();
  }

  /**
   * 记录审计事件
   */
  log(
    eventType: AuditEventType,
    details: Partial<AuditLogEntry['details']>,
    metadata?: Partial<AuditLogEntry['metadata']>,
    options?: {
      userId?: string;
      sessionId?: string;
    }
  ): AuditLogEntry {
    if (!this.config.enabled) {
      return {} as AuditLogEntry;
    }

    // 如果不记录敏感数据，清理相关字段
    if (!this.config.logSensitiveData) {
      delete details.reason;
    }

    const entry: AuditLogEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      eventType,
      userId: options?.userId,
      sessionId: options?.sessionId,
      details: {
        ...details,
      },
      metadata: {
        platform: process.platform,
        ...metadata,
      },
    };

    this.logs.push(entry);

    // 内存限制检查
    if (this.logs.length > this.config.maxEntriesInMemory) {
      this.logs.shift();
    }

    this.emit('log:created', entry);

    // 调用外部处理器
    if (this.config.onLog) {
      this.config.onLog(entry);
    }

    return entry;
  }

  // ============================================================================
  // 便捷方法 (Convenience Methods)
  // ============================================================================

  /**
   * 记录登录事件
   */
  logLogin(userId: string, sessionId: string, success: boolean): void {
    this.log(
      success ? 'auth_login' : 'auth_failed',
      {
        result: success ? 'success' : 'failure',
      },
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录登出事件
   */
  logLogout(userId: string, sessionId: string): void {
    this.log(
      'auth_logout',
      { result: 'success' },
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录会话创建
   */
  logSessionCreated(userId: string, sessionId: string): void {
    this.log(
      'session_created',
      { result: 'success' },
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录会话过期
   */
  logSessionExpired(userId: string, sessionId: string): void {
    this.log(
      'session_expired',
      {},
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录会话锁定
   */
  logSessionLocked(userId: string, sessionId: string): void {
    this.log(
      'session_locked',
      {},
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录会话解锁
   */
  logSessionUnlocked(userId: string, sessionId: string): void {
    this.log(
      'session_unlocked',
      {},
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录权限请求
   */
  logPermissionRequested(
    permissionId: string,
    reason: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.log(
      'permission_requested',
      {
        permissionId,
        reason: this.config.logSensitiveData ? reason : undefined,
      },
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录权限授予
   */
  logPermissionGranted(
    permissionId: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.log(
      'permission_granted',
      {
        permissionId,
        result: 'success',
      },
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录权限拒绝
   */
  logPermissionDenied(
    permissionId: string,
    reason?: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.log(
      'permission_denied',
      {
        permissionId,
        reason: this.config.logSensitiveData ? reason : undefined,
        result: 'failure',
      },
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录权限撤销
   */
  logPermissionRevoked(
    permissionId: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.log(
      'permission_revoked',
      { permissionId },
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录操作执行
   */
  logActionExecuted(
    action: string,
    resourceType: string,
    resourceId: string,
    success: boolean,
    errorMessage?: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.log(
      success ? 'action_executed' : 'action_failed',
      {
        action,
        resourceType,
        resourceId,
        result: success ? 'success' : 'failure',
        errorMessage,
      },
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录操作被阻止
   */
  logActionBlocked(
    action: string,
    reason: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.log(
      'action_blocked',
      {
        action,
        reason: this.config.logSensitiveData ? reason : undefined,
        result: 'failure',
      },
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录紧急覆盖
   */
  logEmergencyOverride(
    action: string,
    reason: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.log(
      'emergency_override',
      {
        action,
        reason,
        result: 'success',
      },
      {},
      { userId, sessionId }
    );
  }

  /**
   * 记录配置变更
   */
  logConfigChanged(
    configKey: string,
    userId?: string,
    sessionId?: string
  ): void {
    this.log(
      'config_changed',
      {
        action: `config.${configKey}`,
        result: 'success',
      },
      {},
      { userId, sessionId }
    );
  }

  // ============================================================================
  // 查询方法 (Query Methods)
  // ============================================================================

  /**
   * 获取所有日志
   */
  getAllLogs(): AuditLogEntry[] {
    return [...this.logs];
  }

  /**
   * 按事件类型查询
   */
  getLogsByEventType(eventType: AuditEventType): AuditLogEntry[] {
    return this.logs.filter(log => log.eventType === eventType);
  }

  /**
   * 按用户查询
   */
  getLogsByUser(userId: string): AuditLogEntry[] {
    return this.logs.filter(log => log.userId === userId);
  }

  /**
   * 按会话查询
   */
  getLogsBySession(sessionId: string): AuditLogEntry[] {
    return this.logs.filter(log => log.sessionId === sessionId);
  }

  /**
   * 按时间范围查询
   */
  getLogsByTimeRange(startTime: number, endTime: number): AuditLogEntry[] {
    return this.logs.filter(
      log => log.timestamp >= startTime && log.timestamp <= endTime
    );
  }

  /**
   * 获取最近的日志
   */
  getRecentLogs(count: number): AuditLogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * 搜索日志
   */
  searchLogs(query: {
    eventTypes?: AuditEventType[];
    userId?: string;
    sessionId?: string;
    startTime?: number;
    endTime?: number;
    action?: string;
    result?: 'success' | 'failure';
  }): AuditLogEntry[] {
    return this.logs.filter(log => {
      if (query.eventTypes && !query.eventTypes.includes(log.eventType)) {
        return false;
      }
      if (query.userId && log.userId !== query.userId) {
        return false;
      }
      if (query.sessionId && log.sessionId !== query.sessionId) {
        return false;
      }
      if (query.startTime && log.timestamp < query.startTime) {
        return false;
      }
      if (query.endTime && log.timestamp > query.endTime) {
        return false;
      }
      if (query.action && log.details.action !== query.action) {
        return false;
      }
      if (query.result && log.details.result !== query.result) {
        return false;
      }
      return true;
    });
  }

  // ============================================================================
  // 统计方法 (Statistics Methods)
  // ============================================================================

  /**
   * 获取统计信息
   */
  getStatistics(): {
    totalLogs: number;
    logsByType: Record<string, number>;
    successRate: number;
    failedActions: number;
    securityEvents: number;
  } {
    const logsByType: Record<string, number> = {};
    let successCount = 0;
    let failedCount = 0;
    let securityEvents = 0;

    for (const log of this.logs) {
      logsByType[log.eventType] = (logsByType[log.eventType] || 0) + 1;

      if (log.details.result === 'success') {
        successCount++;
      } else if (log.details.result === 'failure') {
        failedCount++;
      }

      if (['auth_failed', 'action_blocked', 'permission_denied'].includes(log.eventType)) {
        securityEvents++;
      }
    }

    const totalWithResult = successCount + failedCount;
    const successRate = totalWithResult > 0 ? successCount / totalWithResult : 1;

    return {
      totalLogs: this.logs.length,
      logsByType,
      successRate,
      failedActions: failedCount,
      securityEvents,
    };
  }

  // ============================================================================
  // 维护方法 (Maintenance Methods)
  // ============================================================================

  /**
   * 清理过期日志
   */
  cleanup(): number {
    const cutoffTime = Date.now() - this.config.logRetentionDays * 24 * 60 * 60 * 1000;
    const beforeCount = this.logs.length;

    this.logs = this.logs.filter(log => log.timestamp >= cutoffTime);

    const deletedCount = beforeCount - this.logs.length;
    if (deletedCount > 0) {
      this.emit('log:cleaned', deletedCount);
    }

    return deletedCount;
  }

  /**
   * 导出日志
   */
  exportLogs(format: 'json' | 'csv' = 'json'): string {
    this.emit('log:exported', this.logs);

    if (format === 'csv') {
      const headers = [
        'id',
        'timestamp',
        'eventType',
        'userId',
        'sessionId',
        'action',
        'result',
        'errorMessage',
      ];

      const rows = this.logs.map(log => [
        log.id,
        new Date(log.timestamp).toISOString(),
        log.eventType,
        log.userId ?? '',
        log.sessionId ?? '',
        log.details.action ?? '',
        log.details.result ?? '',
        log.details.errorMessage ?? '',
      ]);

      return [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n');
    }

    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * 导入日志
   */
  importLogs(data: string, format: 'json' | 'csv' = 'json'): number {
    if (format === 'json') {
      const entries = JSON.parse(data) as AuditLogEntry[];
      this.logs.push(...entries);
      return entries.length;
    }

    // CSV 解析略
    return 0;
  }

  /**
   * 清空所有日志
   */
  clearAll(): void {
    const count = this.logs.length;
    this.logs = [];
    this.emit('log:cleaned', count);
  }

  /**
   * 启动定期清理任务
   */
  private startCleanupJob(): void {
    // 每天清理一次
    setInterval(() => {
      this.cleanup();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * 保存到持久化存储
   */
  async save(saveFn: (logs: AuditLogEntry[]) => Promise<void>): Promise<void> {
    await saveFn(this.logs);
  }

  /**
   * 从持久化存储加载
   */
  async load(loadFn: () => Promise<AuditLogEntry[]>): Promise<void> {
    const logs = await loadFn();
    this.logs = logs;
  }
}

/**
 * 创建审计日志管理器
 */
export function createAuditLogManager(
  config?: Partial<AuditLogConfig>
): AuditLogManager {
  return new AuditLogManager(config);
}
