/**
 * PermissionStore - 权限持久化存储
 * 基于 memu-cowork 的权限管理模式
 *
 * 功能：
 * - 存储用户对各种操作的权限偏好
 * - 支持多个问题的权限组
 * - 自动过期机制
 */

import { existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ============ 类型定义 ============

/**
 * 权限级别
 */
export type PermissionLevel =
  | 'always_allow' // 总是允许
  | 'allow_once' // 仅本次允许
  | 'deny_once' // 仅本次拒绝
  | 'always_deny' // 总是拒绝
  | 'ask'; // 每次询问

/**
 * 单个权限问题
 */
export interface PermissionQuestion {
  id: string;
  /** 问题标签 */
  label: string;
  /** 问题描述 */
  description?: string;
  /** 用户选择的答案 */
  answer?: string;
  /** 权限级别 */
  level?: PermissionLevel;
}

/**
 * 权限请求 (可包含多个问题)
 */
export interface PermissionRequest {
  id: string;
  /** 请求来源 (工具/功能名称) */
  source: string;
  /** 问题列表 */
  questions: PermissionQuestion[];
  /** 创建时间 */
  createdAt: string;
  /** 过期时间 (null = 永不过期) */
  expiresAt: string | null;
  /** 使用次数 */
  usageCount: number;
}

/**
 * 存储的权限规则
 */
export interface PermissionRule {
  id: string;
  /** 规则模式 (支持通配符) */
  pattern: string;
  /** 权限级别 */
  level: PermissionLevel;
  /** 来源 */
  source: string;
  /** 创建时间 */
  createdAt: string;
  /** 过期时间 */
  expiresAt: string | null;
  /** 上次使用时间 */
  lastUsedAt: string | null;
  /** 使用次数 */
  usageCount: number;
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  allowed: boolean;
  rule?: PermissionRule;
  needsPrompt: boolean;
  reason?: string;
}

/**
 * 创建权限规则参数
 */
export interface CreateRuleParams {
  pattern: string;
  level: PermissionLevel;
  source: string;
  /** 过期时间 (毫秒), null = 永不过期 */
  ttlMs?: number | null;
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

  withLockSync<T>(fn: () => T): T {
    // 同步版本，仅用于检测锁状态
    if (this.locked) {
      throw new Error('Cannot acquire lock synchronously while locked');
    }
    this.locked = true;
    try {
      return fn();
    } finally {
      this.release();
    }
  }
}

// ============ 输入验证 ============

const MAX_PATTERN_LENGTH = 500;
const MAX_SOURCE_LENGTH = 200;
const MAX_LABEL_LENGTH = 200;
const VALID_LEVELS: PermissionLevel[] = [
  'always_allow',
  'allow_once',
  'deny_once',
  'always_deny',
  'ask',
];

function validatePattern(pattern: string): void {
  if (!pattern || typeof pattern !== 'string') {
    throw new Error('Pattern is required and must be a string');
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(`Pattern exceeds maximum length of ${MAX_PATTERN_LENGTH}`);
  }
}

function validateSource(source: string): void {
  if (!source || typeof source !== 'string') {
    throw new Error('Source is required and must be a string');
  }
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new Error(`Source exceeds maximum length of ${MAX_SOURCE_LENGTH}`);
  }
}

function validateLevel(level: PermissionLevel): void {
  if (!VALID_LEVELS.includes(level)) {
    throw new Error(`Invalid permission level: ${level}`);
  }
}

// ============ PermissionStore 类 ============

export class PermissionStore {
  private basePath: string;
  private rulesPath: string;
  private requestsPath: string;

  // 内存缓存
  private rules: Map<string, PermissionRule> = new Map();
  private pendingRequests: Map<string, PermissionRequest> = new Map();

  // 写入锁
  private writePromise: Promise<void> = Promise.resolve();

  // Mutex for check operations
  private checkMutex = new Mutex();

  constructor(basePath: string) {
    this.basePath = basePath;
    this.rulesPath = join(basePath, 'permissions', 'rules.json');
    this.requestsPath = join(basePath, 'permissions', 'requests.json');
  }

  /**
   * 初始化存储
   */
  async initialize(): Promise<void> {
    const permDir = join(this.basePath, 'permissions');

    if (!existsSync(permDir)) {
      mkdirSync(permDir, { recursive: true });
    }

    await this.loadRules();
    await this.loadRequests();
    await this.cleanupExpired();
  }

  /**
   * 检查权限 (同步版本，用于快速检查)
   */
  check(pattern: string, source?: string): PermissionCheckResult {
    // 输入验证
    if (!pattern || typeof pattern !== 'string') {
      return {
        allowed: false,
        needsPrompt: true,
        reason: 'Invalid pattern',
      };
    }

    // 清理过期规则
    this.cleanupExpiredSync();

    // 查找匹配的规则
    const rule = this.findMatchingRule(pattern, source);

    if (!rule) {
      return {
        allowed: false,
        needsPrompt: true,
        reason: 'No matching rule found',
      };
    }

    // 复制规则以返回，避免直接暴露内部状态
    const ruleCopy = { ...rule };

    // 更新使用统计
    rule.lastUsedAt = new Date().toISOString();
    rule.usageCount++;

    switch (rule.level) {
      case 'always_allow':
        this.saveRulesAsync(); // 保存使用统计更新
        return { allowed: true, rule: ruleCopy, needsPrompt: false };

      case 'always_deny':
        this.saveRulesAsync(); // 保存使用统计更新
        return {
          allowed: false,
          rule: ruleCopy,
          needsPrompt: false,
          reason: 'Denied by rule',
        };

      case 'allow_once':
        // 使用后删除
        this.rules.delete(rule.id);
        this.saveRulesAsync();
        return { allowed: true, rule: ruleCopy, needsPrompt: false };

      case 'deny_once':
        // 使用后删除
        this.rules.delete(rule.id);
        this.saveRulesAsync();
        return {
          allowed: false,
          rule: ruleCopy,
          needsPrompt: false,
          reason: 'Denied once',
        };

      case 'ask':
      default:
        return { allowed: false, rule: ruleCopy, needsPrompt: true };
    }
  }

  /**
   * 检查权限 (异步版本，保证线程安全)
   */
  async checkAsync(
    pattern: string,
    source?: string
  ): Promise<PermissionCheckResult> {
    return this.checkMutex.withLock(async () => {
      return this.check(pattern, source);
    });
  }

  /**
   * 创建权限规则
   */
  async createRule(params: CreateRuleParams): Promise<PermissionRule> {
    // 输入验证
    validatePattern(params.pattern);
    validateSource(params.source);
    validateLevel(params.level);

    if (params.ttlMs !== undefined && params.ttlMs !== null) {
      if (typeof params.ttlMs !== 'number' || params.ttlMs < 0) {
        throw new Error('TTL must be a non-negative number');
      }
      // 最大 1 年
      if (params.ttlMs > 365 * 24 * 60 * 60 * 1000) {
        throw new Error('TTL exceeds maximum of 1 year');
      }
    }

    const now = new Date().toISOString();
    const rule: PermissionRule = {
      id: randomUUID(),
      pattern: params.pattern,
      level: params.level,
      source: params.source,
      createdAt: now,
      expiresAt:
        params.ttlMs != null
          ? new Date(Date.now() + params.ttlMs).toISOString()
          : null,
      lastUsedAt: null,
      usageCount: 0,
    };

    // 删除可能冲突的旧规则
    for (const [id, existing] of this.rules) {
      if (
        existing.pattern === params.pattern &&
        existing.source === params.source
      ) {
        this.rules.delete(id);
      }
    }

    this.rules.set(rule.id, rule);
    await this.saveRules();

    return rule;
  }

  /**
   * 批量创建规则 (用于多问题权限请求)
   */
  async createRulesFromRequest(
    request: PermissionRequest,
    answers: Map<string, { answer: string; level: PermissionLevel }>
  ): Promise<PermissionRule[]> {
    const rules: PermissionRule[] = [];

    for (const question of request.questions) {
      const answerData = answers.get(question.id);
      if (!answerData) continue;

      const rule = await this.createRule({
        pattern: `${request.source}:${question.id}`,
        level: answerData.level,
        source: request.source,
      });

      rules.push(rule);
    }

    // 移除已处理的请求
    this.pendingRequests.delete(request.id);
    await this.saveRequests();

    return rules;
  }

  /**
   * 删除规则
   */
  async deleteRule(ruleId: string): Promise<boolean> {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      await this.saveRules();
    }
    return deleted;
  }

  /**
   * 获取所有规则
   */
  getAllRules(): PermissionRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 按来源获取规则
   */
  getRulesBySource(source: string): PermissionRule[] {
    return Array.from(this.rules.values()).filter((r) => r.source === source);
  }

  /**
   * 创建权限请求
   */
  async createRequest(
    source: string,
    questions: Omit<PermissionQuestion, 'id'>[]
  ): Promise<PermissionRequest> {
    // 输入验证
    validateSource(source);

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Questions array is required and cannot be empty');
    }

    if (questions.length > 50) {
      throw new Error('Too many questions (max 50)');
    }

    for (const q of questions) {
      if (!q.label || typeof q.label !== 'string') {
        throw new Error('Each question must have a label');
      }
      if (q.label.length > MAX_LABEL_LENGTH) {
        throw new Error(`Question label exceeds maximum length of ${MAX_LABEL_LENGTH}`);
      }
    }

    const request: PermissionRequest = {
      id: randomUUID(),
      source,
      questions: questions.map((q) => ({
        ...q,
        id: randomUUID(),
      })),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30分钟过期
      usageCount: 0,
    };

    this.pendingRequests.set(request.id, request);
    await this.saveRequests();

    return request;
  }

  /**
   * 获取待处理的请求
   */
  getPendingRequest(requestId: string): PermissionRequest | null {
    return this.pendingRequests.get(requestId) || null;
  }

  /**
   * 获取所有待处理请求
   */
  getAllPendingRequests(): PermissionRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * 清除所有规则
   */
  async clearAllRules(): Promise<void> {
    this.rules.clear();
    await this.saveRules();
  }

  /**
   * 清除指定来源的规则
   */
  async clearRulesBySource(source: string): Promise<number> {
    let count = 0;
    for (const [id, rule] of this.rules) {
      if (rule.source === source) {
        this.rules.delete(id);
        count++;
      }
    }
    if (count > 0) {
      await this.saveRules();
    }
    return count;
  }

  // --- 私有方法 ---

  private findMatchingRule(
    pattern: string,
    source?: string
  ): PermissionRule | null {
    // 精确匹配优先
    for (const rule of this.rules.values()) {
      if (source && rule.source !== source) continue;
      if (rule.pattern === pattern) {
        return rule;
      }
    }

    // 通配符匹配
    for (const rule of this.rules.values()) {
      if (source && rule.source !== source) continue;
      if (this.matchPattern(pattern, rule.pattern)) {
        return rule;
      }
    }

    return null;
  }

  private matchPattern(input: string, pattern: string): boolean {
    // 简单通配符匹配
    if (pattern === '*') return true;

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return input.startsWith(prefix);
    }

    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      return input.endsWith(suffix);
    }

    return input === pattern;
  }

  private cleanupExpiredSync(): void {
    const now = Date.now();
    let hasChanges = false;

    for (const [id, rule] of this.rules) {
      if (rule.expiresAt && new Date(rule.expiresAt).getTime() < now) {
        this.rules.delete(id);
        hasChanges = true;
      }
    }

    for (const [id, request] of this.pendingRequests) {
      if (request.expiresAt && new Date(request.expiresAt).getTime() < now) {
        this.pendingRequests.delete(id);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.saveRulesAsync();
      this.saveRequestsAsync();
    }
  }

  private async cleanupExpired(): Promise<void> {
    this.cleanupExpiredSync();
  }

  private async loadRules(): Promise<void> {
    if (!existsSync(this.rulesPath)) {
      this.rules = new Map();
      return;
    }

    try {
      const content = await readFile(this.rulesPath, 'utf-8');
      const rules = JSON.parse(content) as PermissionRule[];
      this.rules = new Map(rules.map((r) => [r.id, r]));
    } catch {
      console.error('[PermissionStore] Failed to load rules');
      this.rules = new Map();
    }
  }

  private async loadRequests(): Promise<void> {
    if (!existsSync(this.requestsPath)) {
      this.pendingRequests = new Map();
      return;
    }

    try {
      const content = await readFile(this.requestsPath, 'utf-8');
      const requests = JSON.parse(content) as PermissionRequest[];
      this.pendingRequests = new Map(requests.map((r) => [r.id, r]));
    } catch {
      console.error('[PermissionStore] Failed to load requests');
      this.pendingRequests = new Map();
    }
  }

  private async saveRules(): Promise<void> {
    await this.atomicWrite(this.rulesPath, async () => {
      const rules = Array.from(this.rules.values());
      return JSON.stringify(rules, null, 2);
    });
  }

  private async saveRequests(): Promise<void> {
    await this.atomicWrite(this.requestsPath, async () => {
      const requests = Array.from(this.pendingRequests.values());
      return JSON.stringify(requests, null, 2);
    });
  }

  private saveRulesAsync(): void {
    this.saveRules().catch((err) =>
      console.error('[PermissionStore] Save rules failed:', err)
    );
  }

  private saveRequestsAsync(): void {
    this.saveRequests().catch((err) =>
      console.error('[PermissionStore] Save requests failed:', err)
    );
  }

  private async atomicWrite(
    filePath: string,
    getData: () => Promise<string>
  ): Promise<void> {
    const doWrite = async (): Promise<void> => {
      const tempPath = `${filePath}.tmp.${Date.now()}`;
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
          // ignore cleanup error
        }
        throw err;
      }
    };

    // 串行化写入
    this.writePromise = this.writePromise.catch(() => {}).then(doWrite);
    return this.writePromise;
  }
}

// ============ 单例实例 ============

let permissionStoreInstance: PermissionStore | null = null;

/**
 * 获取 PermissionStore 实例
 */
export function getPermissionStore(): PermissionStore | null {
  return permissionStoreInstance;
}

/**
 * 设置 PermissionStore 实例
 */
export function setPermissionStore(store: PermissionStore): void {
  permissionStoreInstance = store;
}

/**
 * 创建并初始化 PermissionStore
 */
export async function createPermissionStore(
  basePath: string
): Promise<PermissionStore> {
  const store = new PermissionStore(basePath);
  await store.initialize();
  permissionStoreInstance = store;
  return store;
}
