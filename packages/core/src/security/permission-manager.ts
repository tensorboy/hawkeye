/**
 * Permission Manager - 权限管理器
 * 管理工具权限、策略评估和用户确认
 */

import { EventEmitter } from 'events';
import type {
  PermissionLevel,
  ToolCategory,
  ToolPermission,
  PermissionPolicy,
  PolicyRule,
  PermissionResult,
  ExecutionContext,
  PermissionCondition,
  DEFAULT_POLICIES,
} from './permission-types';

export interface PermissionManagerConfig {
  defaultLevel: PermissionLevel;
  enableAudit: boolean;
  maxCachedPermissions: number;
  permissionTTL: number; // 权限缓存时间 (ms)
  onPermissionRequest?: (context: ExecutionContext) => Promise<boolean>;
}

const DEFAULT_CONFIG: PermissionManagerConfig = {
  defaultLevel: 'prompt',
  enableAudit: true,
  maxCachedPermissions: 1000,
  permissionTTL: 3600000, // 1 hour
};

export class PermissionManager extends EventEmitter {
  private config: PermissionManagerConfig;
  private policies: Map<string, PermissionPolicy> = new Map();
  private permissions: Map<string, ToolPermission> = new Map();
  private sessionPermissions: Map<string, Set<string>> = new Map(); // 会话级权限

  constructor(config: Partial<PermissionManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadDefaultPolicies();
  }

  /**
   * 加载默认策略
   */
  private loadDefaultPolicies(): void {
    const { DEFAULT_POLICIES } = require('./permission-types');
    for (const policy of DEFAULT_POLICIES) {
      this.policies.set(policy.id, policy);
    }
  }

  /**
   * 检查权限
   */
  async checkPermission(context: ExecutionContext): Promise<PermissionResult> {
    const cacheKey = this.getCacheKey(context);

    // 1. 检查缓存的权限
    const cached = this.permissions.get(cacheKey);
    if (cached && this.isPermissionValid(cached)) {
      return this.createResult(cached.level, cached);
    }

    // 2. 检查会话级权限
    const sessionKey = `${context.sessionId}:${context.toolId}`;
    if (context.sessionId && this.sessionPermissions.get(context.sessionId)?.has(context.toolId)) {
      return this.createResult('allow');
    }

    // 3. 评估策略规则
    const result = this.evaluatePolicies(context);

    // 4. 如果需要提示，请求用户确认
    if (result.level === 'prompt' && this.config.onPermissionRequest) {
      const granted = await this.config.onPermissionRequest(context);
      result.allowed = granted;
      result.level = granted ? 'allow' : 'deny';

      // 缓存用户决定
      if (granted) {
        this.cachePermission(context, 'allow');
      }
    }

    this.emit('permission_checked', { context, result });
    return result;
  }

  /**
   * 评估策略规则
   */
  private evaluatePolicies(context: ExecutionContext): PermissionResult {
    const matchedRules: PolicyRule[] = [];

    // 遍历所有启用的策略
    for (const policy of this.policies.values()) {
      if (!policy.enabled) continue;

      for (const rule of policy.rules) {
        if (this.matchRule(rule, context)) {
          matchedRules.push(rule);
        }
      }
    }

    // 按优先级排序，取最高优先级的规则
    if (matchedRules.length > 0) {
      matchedRules.sort((a, b) => b.priority - a.priority);
      const topRule = matchedRules[0];

      return this.createResult(topRule.permission, undefined, topRule);
    }

    // 没有匹配规则，使用默认级别
    return this.createResult(this.config.defaultLevel);
  }

  /**
   * 匹配规则
   */
  private matchRule(rule: PolicyRule, context: ExecutionContext): boolean {
    // 检查类别
    if (rule.category && rule.category !== context.category) {
      return false;
    }

    // 检查模式
    const target = this.getMatchTarget(context);
    if (rule.pattern instanceof RegExp) {
      return rule.pattern.test(target);
    }
    return target.includes(rule.pattern);
  }

  /**
   * 获取匹配目标字符串
   */
  private getMatchTarget(context: ExecutionContext): string {
    switch (context.category) {
      case 'shell':
        return String(context.parameters.command || context.action);
      case 'file':
        return String(context.parameters.path || context.action);
      case 'browser':
        return String(context.parameters.url || context.action);
      case 'network':
        return String(context.parameters.url || context.parameters.host || context.action);
      default:
        return context.action;
    }
  }

  /**
   * 创建权限结果
   */
  private createResult(
    level: PermissionLevel,
    permission?: ToolPermission,
    matchedRule?: PolicyRule
  ): PermissionResult {
    return {
      allowed: level === 'allow',
      level,
      reason: matchedRule?.reason || permission?.reason,
      matchedRule,
      requiresConfirmation: level === 'prompt',
    };
  }

  /**
   * 缓存权限
   */
  private cachePermission(context: ExecutionContext, level: PermissionLevel): void {
    const cacheKey = this.getCacheKey(context);

    // 清理过期缓存
    if (this.permissions.size >= this.config.maxCachedPermissions) {
      this.cleanExpiredPermissions();
    }

    const permission: ToolPermission = {
      toolId: context.toolId,
      category: context.category,
      level,
      lastUsed: Date.now(),
      usageCount: 1,
      expiresAt: Date.now() + this.config.permissionTTL,
    };

    this.permissions.set(cacheKey, permission);
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(context: ExecutionContext): string {
    return `${context.toolId}:${context.category}:${context.action}`;
  }

  /**
   * 检查权限是否有效
   */
  private isPermissionValid(permission: ToolPermission): boolean {
    if (permission.expiresAt && permission.expiresAt < Date.now()) {
      return false;
    }
    return true;
  }

  /**
   * 清理过期权限
   */
  private cleanExpiredPermissions(): void {
    const now = Date.now();
    for (const [key, permission] of this.permissions) {
      if (permission.expiresAt && permission.expiresAt < now) {
        this.permissions.delete(key);
      }
    }
  }

  /**
   * 注册策略
   */
  registerPolicy(policy: PermissionPolicy): void {
    this.policies.set(policy.id, policy);
    this.emit('policy_registered', policy);
  }

  /**
   * 移除策略
   */
  removePolicy(policyId: string): boolean {
    const removed = this.policies.delete(policyId);
    if (removed) {
      this.emit('policy_removed', policyId);
    }
    return removed;
  }

  /**
   * 获取策略
   */
  getPolicy(policyId: string): PermissionPolicy | undefined {
    return this.policies.get(policyId);
  }

  /**
   * 获取所有策略
   */
  getAllPolicies(): PermissionPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * 授予会话权限
   */
  grantSessionPermission(sessionId: string, toolId: string): void {
    if (!this.sessionPermissions.has(sessionId)) {
      this.sessionPermissions.set(sessionId, new Set());
    }
    this.sessionPermissions.get(sessionId)!.add(toolId);
    this.emit('session_permission_granted', { sessionId, toolId });
  }

  /**
   * 撤销会话权限
   */
  revokeSessionPermission(sessionId: string, toolId?: string): void {
    if (toolId) {
      this.sessionPermissions.get(sessionId)?.delete(toolId);
    } else {
      this.sessionPermissions.delete(sessionId);
    }
    this.emit('session_permission_revoked', { sessionId, toolId });
  }

  /**
   * 清除所有缓存
   */
  clearCache(): void {
    this.permissions.clear();
    this.sessionPermissions.clear();
    this.emit('cache_cleared');
  }

  /**
   * 设置权限请求处理器
   */
  setPermissionRequestHandler(
    handler: (context: ExecutionContext) => Promise<boolean>
  ): void {
    this.config.onPermissionRequest = handler;
  }
}

// 单例
let globalPermissionManager: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!globalPermissionManager) {
    globalPermissionManager = new PermissionManager();
  }
  return globalPermissionManager;
}

export function setPermissionManager(manager: PermissionManager): void {
  globalPermissionManager = manager;
}
