/**
 * Audit Logger - 审计日志记录器
 * 记录所有安全相关事件用于审计和分析
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import type {
  AuditLogEntry,
  AuditEventType,
  ExecutionContext,
  ToolCategory,
} from './permission-types';

export interface AuditLoggerConfig {
  maxEntries: number;
  enableConsoleLog: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  persistLogs: boolean;
  onLogEntry?: (entry: AuditLogEntry) => void;
}

const DEFAULT_CONFIG: AuditLoggerConfig = {
  maxEntries: 10000,
  enableConsoleLog: false,
  logLevel: 'info',
  persistLogs: true,
};

const LOG_LEVEL_PRIORITY: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class AuditLogger extends EventEmitter {
  private config: AuditLoggerConfig;
  private entries: AuditLogEntry[] = [];
  private entryIndex: Map<string, number> = new Map(); // 快速查找索引

  constructor(config: Partial<AuditLoggerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 记录审计事件
   */
  log(
    eventType: AuditEventType,
    action: string,
    result: AuditLogEntry['result'],
    context?: Partial<ExecutionContext>,
    details?: Record<string, unknown>
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      eventType,
      action,
      result,
      context: context || {},
      details,
      toolId: context?.toolId,
      category: context?.category,
      sessionId: context?.sessionId,
    };

    this.addEntry(entry);
    return entry;
  }

  /**
   * 记录权限检查
   */
  logPermissionCheck(
    context: ExecutionContext,
    result: 'allowed' | 'denied' | 'prompted'
  ): AuditLogEntry {
    return this.log('permission_check', context.action, result, context);
  }

  /**
   * 记录注入检测
   */
  logInjectionDetected(
    context: ExecutionContext,
    injectionType: string,
    pattern?: string
  ): AuditLogEntry {
    return this.log('injection_detected', context.action, 'denied', context, {
      injectionType,
      pattern,
    });
  }

  /**
   * 记录敏感操作
   */
  logSensitiveOperation(
    context: ExecutionContext,
    operationType: string,
    details?: Record<string, unknown>
  ): AuditLogEntry {
    return this.log('sensitive_operation', context.action, 'allowed', context, {
      operationType,
      ...details,
    });
  }

  /**
   * 记录错误
   */
  logError(
    action: string,
    error: Error | string,
    context?: Partial<ExecutionContext>
  ): AuditLogEntry {
    return this.log('error', action, 'error', context, {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  /**
   * 记录速率限制
   */
  logRateLimitExceeded(
    context: ExecutionContext,
    limit: number,
    current: number
  ): AuditLogEntry {
    return this.log('rate_limit_exceeded', context.action, 'denied', context, {
      limit,
      current,
    });
  }

  /**
   * 添加日志条目
   */
  private addEntry(entry: AuditLogEntry): void {
    // 清理旧条目
    if (this.entries.length >= this.config.maxEntries) {
      const removed = this.entries.shift();
      if (removed) {
        this.entryIndex.delete(removed.id);
      }
    }

    this.entries.push(entry);
    this.entryIndex.set(entry.id, this.entries.length - 1);

    // 触发事件
    this.emit('entry_added', entry);

    // 调用回调
    if (this.config.onLogEntry) {
      this.config.onLogEntry(entry);
    }

    // 控制台输出
    if (this.config.enableConsoleLog) {
      this.consoleLog(entry);
    }
  }

  /**
   * 控制台输出
   */
  private consoleLog(entry: AuditLogEntry): void {
    const level = this.getLogLevel(entry.eventType);
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.logLevel]) {
      return;
    }

    const prefix = `[Audit:${entry.eventType}]`;
    const message = `${entry.action} -> ${entry.result}`;

    switch (level) {
      case 'error':
        console.error(prefix, message, entry.details);
        break;
      case 'warn':
        console.warn(prefix, message, entry.details);
        break;
      case 'info':
        console.info(prefix, message);
        break;
      default:
        console.debug(prefix, message);
    }
  }

  /**
   * 获取日志级别
   */
  private getLogLevel(eventType: AuditEventType): string {
    switch (eventType) {
      case 'error':
      case 'injection_detected':
        return 'error';
      case 'permission_denied':
      case 'rate_limit_exceeded':
        return 'warn';
      case 'sensitive_operation':
      case 'permission_prompted':
        return 'info';
      default:
        return 'debug';
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 获取日志条目
   */
  getEntry(id: string): AuditLogEntry | undefined {
    const index = this.entryIndex.get(id);
    return index !== undefined ? this.entries[index] : undefined;
  }

  /**
   * 查询日志
   */
  query(options: QueryOptions = {}): AuditLogEntry[] {
    let results = [...this.entries];

    // 按时间范围过滤
    if (options.startTime) {
      results = results.filter(e => e.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      results = results.filter(e => e.timestamp <= options.endTime!);
    }

    // 按事件类型过滤
    if (options.eventType) {
      results = results.filter(e => e.eventType === options.eventType);
    }

    // 按结果过滤
    if (options.result) {
      results = results.filter(e => e.result === options.result);
    }

    // 按工具ID过滤
    if (options.toolId) {
      results = results.filter(e => e.toolId === options.toolId);
    }

    // 按类别过滤
    if (options.category) {
      results = results.filter(e => e.category === options.category);
    }

    // 按会话ID过滤
    if (options.sessionId) {
      results = results.filter(e => e.sessionId === options.sessionId);
    }

    // 排序
    if (options.sortOrder === 'asc') {
      results.sort((a, b) => a.timestamp - b.timestamp);
    } else {
      results.sort((a, b) => b.timestamp - a.timestamp);
    }

    // 分页
    if (options.limit) {
      const offset = options.offset || 0;
      results = results.slice(offset, offset + options.limit);
    }

    return results;
  }

  /**
   * 获取统计信息
   */
  getStats(): AuditStats {
    const stats: AuditStats = {
      totalEntries: this.entries.length,
      byEventType: {} as Record<AuditEventType, number>,
      byResult: {
        allowed: 0,
        denied: 0,
        prompted: 0,
        error: 0,
      },
      byCategory: {} as Record<ToolCategory, number>,
      recentActivity: [],
    };

    for (const entry of this.entries) {
      // 按事件类型统计
      stats.byEventType[entry.eventType] = (stats.byEventType[entry.eventType] || 0) + 1;

      // 按结果统计
      stats.byResult[entry.result]++;

      // 按类别统计
      if (entry.category) {
        stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;
      }
    }

    // 最近活动 (最新10条)
    stats.recentActivity = this.entries.slice(-10).reverse();

    return stats;
  }

  /**
   * 导出日志
   */
  export(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['id', 'timestamp', 'eventType', 'action', 'result', 'toolId', 'category', 'sessionId'];
      const rows = this.entries.map(e => [
        e.id,
        new Date(e.timestamp).toISOString(),
        e.eventType,
        e.action,
        e.result,
        e.toolId || '',
        e.category || '',
        e.sessionId || '',
      ]);
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    return JSON.stringify(this.entries, null, 2);
  }

  /**
   * 清除日志
   */
  clear(): void {
    this.entries = [];
    this.entryIndex.clear();
    this.emit('cleared');
  }

  /**
   * 获取条目数量
   */
  get size(): number {
    return this.entries.length;
  }
}

export interface QueryOptions {
  startTime?: number;
  endTime?: number;
  eventType?: AuditEventType;
  result?: AuditLogEntry['result'];
  toolId?: string;
  category?: ToolCategory;
  sessionId?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalEntries: number;
  byEventType: Record<AuditEventType, number>;
  byResult: Record<AuditLogEntry['result'], number>;
  byCategory: Record<ToolCategory, number>;
  recentActivity: AuditLogEntry[];
}

// 单例
let globalAuditLogger: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger();
  }
  return globalAuditLogger;
}

export function setAuditLogger(logger: AuditLogger): void {
  globalAuditLogger = logger;
}
