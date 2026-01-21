/**
 * SQLite 数据库存储
 * 使用 better-sqlite3 实现高性能本地存储
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// 类型定义（运行时动态导入 better-sqlite3）
interface Database {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  close(): void;
  pragma(pragma: string): unknown;
}

interface Statement {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface DatabaseConfig {
  /** 数据库文件路径 */
  dbPath?: string;
  /** 是否启用 WAL 模式 */
  enableWAL?: boolean;
  /** 是否在内存中运行 */
  inMemory?: boolean;
}

export interface ContextRecord {
  id: string;
  timestamp: number;
  appName?: string;
  windowTitle?: string;
  clipboard?: string;
  screenshot?: string;
  ocrText?: string;
  metadata?: string;
}

export interface IntentRecord {
  id: string;
  contextId: string;
  type: string;
  description: string;
  confidence: number;
  entities?: string;
  createdAt: number;
}

export interface PlanRecord {
  id: string;
  intentId: string;
  title: string;
  description: string;
  steps: string;
  pros: string;
  cons: string;
  status: string;
  createdAt: number;
  completedAt?: number;
}

export interface ExecutionRecord {
  id: string;
  planId: string;
  status: string;
  stepResults: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export class HawkeyeDatabase {
  private db: Database | null = null;
  private config: DatabaseConfig;
  private isInitialized = false;

  constructor(config: DatabaseConfig = {}) {
    this.config = {
      dbPath: path.join(os.homedir(), '.hawkeye', 'hawkeye.db'),
      enableWAL: true,
      inMemory: false,
      ...config,
    };
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 动态导入 better-sqlite3
      const BetterSqlite3 = await import('better-sqlite3');
      const Database = BetterSqlite3.default || BetterSqlite3;

      // 确保目录存在
      if (!this.config.inMemory && this.config.dbPath) {
        const dir = path.dirname(this.config.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      // 创建数据库连接
      const dbPath = this.config.inMemory ? ':memory:' : this.config.dbPath!;
      this.db = new Database(dbPath) as Database;

      // 启用 WAL 模式
      if (this.config.enableWAL && !this.config.inMemory) {
        this.db.pragma('journal_mode = WAL');
      }

      // 创建表
      this.createTables();

      this.isInitialized = true;
    } catch (error) {
      console.warn('SQLite 不可用，使用 JSON 文件存储作为后备:', error);
      throw error;
    }
  }

  /**
   * 创建数据表
   */
  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      -- 感知上下文表
      CREATE TABLE IF NOT EXISTS contexts (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        app_name TEXT,
        window_title TEXT,
        clipboard TEXT,
        screenshot TEXT,
        ocr_text TEXT,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      -- 意图表
      CREATE TABLE IF NOT EXISTS intents (
        id TEXT PRIMARY KEY,
        context_id TEXT,
        type TEXT NOT NULL,
        description TEXT,
        confidence REAL,
        entities TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (context_id) REFERENCES contexts(id)
      );

      -- 执行计划表
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        intent_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        steps TEXT,
        pros TEXT,
        cons TEXT,
        status TEXT DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (intent_id) REFERENCES intents(id)
      );

      -- 执行记录表
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        plan_id TEXT,
        status TEXT NOT NULL,
        step_results TEXT,
        error TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (plan_id) REFERENCES plans(id)
      );

      -- 用户偏好表
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      -- 学习数据表（用于个性化）
      CREATE TABLE IF NOT EXISTS learning_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        feedback INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      -- 行为事件表
      CREATE TABLE IF NOT EXISTS behavior_events (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        action TEXT,
        target TEXT,
        context TEXT,
        duration INTEGER,
        result TEXT,
        platform TEXT,
        active_app TEXT,
        window_title TEXT,
        feedback_type TEXT,
        feedback_reason TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      -- 识别的模式表
      CREATE TABLE IF NOT EXISTS behavior_patterns (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        confidence REAL,
        occurrences INTEGER,
        details TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      );

      -- 用户习惯档案表
      CREATE TABLE IF NOT EXISTS habit_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        profile_data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- 索引
      CREATE INDEX IF NOT EXISTS idx_contexts_timestamp ON contexts(timestamp);
      CREATE INDEX IF NOT EXISTS idx_intents_context_id ON intents(context_id);
      CREATE INDEX IF NOT EXISTS idx_intents_type ON intents(type);
      CREATE INDEX IF NOT EXISTS idx_plans_intent_id ON plans(intent_id);
      CREATE INDEX IF NOT EXISTS idx_executions_plan_id ON executions(plan_id);
      CREATE INDEX IF NOT EXISTS idx_behavior_events_timestamp ON behavior_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_behavior_events_type ON behavior_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_behavior_events_app ON behavior_events(active_app);
      CREATE INDEX IF NOT EXISTS idx_behavior_patterns_type ON behavior_patterns(type);

      -- 用户表
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'executor',
        password_hash TEXT,
        preferences TEXT,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER
      );

      -- 会话表
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        auth_method TEXT NOT NULL,
        is_locked INTEGER DEFAULT 0,
        device_info TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      -- 权限授权表
      CREATE TABLE IF NOT EXISTS permission_grants (
        permission_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        granted_at INTEGER,
        expires_at INTEGER,
        granted_by TEXT,
        scope TEXT,
        reason TEXT
      );

      -- 审计日志表
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        user_id TEXT,
        session_id TEXT,
        action TEXT,
        permission_id TEXT,
        resource_type TEXT,
        resource_id TEXT,
        reason TEXT,
        result TEXT,
        error_message TEXT,
        ip TEXT,
        user_agent TEXT,
        platform TEXT
      );

      -- 认证相关索引
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    `);
  }

  // ============ 上下文操作 ============

  saveContext(context: ContextRecord): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO contexts (id, timestamp, app_name, window_title, clipboard, screenshot, ocr_text, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      context.id,
      context.timestamp,
      context.appName,
      context.windowTitle,
      context.clipboard,
      context.screenshot,
      context.ocrText,
      context.metadata
    );
  }

  getContext(id: string): ContextRecord | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM contexts WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: row.id as string,
      timestamp: row.timestamp as number,
      appName: row.app_name as string | undefined,
      windowTitle: row.window_title as string | undefined,
      clipboard: row.clipboard as string | undefined,
      screenshot: row.screenshot as string | undefined,
      ocrText: row.ocr_text as string | undefined,
      metadata: row.metadata as string | undefined,
    };
  }

  getRecentContexts(limit: number = 10): ContextRecord[] {
    if (!this.db) return [];

    const stmt = this.db.prepare('SELECT * FROM contexts ORDER BY timestamp DESC LIMIT ?');
    const rows = stmt.all(limit) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as string,
      timestamp: row.timestamp as number,
      appName: row.app_name as string | undefined,
      windowTitle: row.window_title as string | undefined,
      clipboard: row.clipboard as string | undefined,
      screenshot: row.screenshot as string | undefined,
      ocrText: row.ocr_text as string | undefined,
      metadata: row.metadata as string | undefined,
    }));
  }

  // ============ 意图操作 ============

  saveIntent(intent: IntentRecord): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO intents (id, context_id, type, description, confidence, entities, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      intent.id,
      intent.contextId,
      intent.type,
      intent.description,
      intent.confidence,
      intent.entities,
      intent.createdAt
    );
  }

  getIntentsByType(type: string, limit: number = 10): IntentRecord[] {
    if (!this.db) return [];

    const stmt = this.db.prepare('SELECT * FROM intents WHERE type = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(type, limit) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as string,
      contextId: row.context_id as string,
      type: row.type as string,
      description: row.description as string,
      confidence: row.confidence as number,
      entities: row.entities as string | undefined,
      createdAt: row.created_at as number,
    }));
  }

  // ============ 计划操作 ============

  savePlan(plan: PlanRecord): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO plans (id, intent_id, title, description, steps, pros, cons, status, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      plan.id,
      plan.intentId,
      plan.title,
      plan.description,
      plan.steps,
      plan.pros,
      plan.cons,
      plan.status,
      plan.createdAt,
      plan.completedAt
    );
  }

  updatePlanStatus(id: string, status: string, completedAt?: number): void {
    if (!this.db) return;

    const stmt = this.db.prepare('UPDATE plans SET status = ?, completed_at = ? WHERE id = ?');
    stmt.run(status, completedAt, id);
  }

  // ============ 执行记录操作 ============

  saveExecution(execution: ExecutionRecord): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO executions (id, plan_id, status, step_results, error, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      execution.id,
      execution.planId,
      execution.status,
      execution.stepResults,
      execution.error,
      execution.startedAt,
      execution.completedAt
    );
  }

  // ============ 偏好设置操作 ============

  setPreference(key: string, value: unknown): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO preferences (key, value, updated_at)
      VALUES (?, ?, ?)
    `);

    stmt.run(key, JSON.stringify(value), Date.now());
  }

  getPreference<T>(key: string, defaultValue?: T): T | undefined {
    if (!this.db) return defaultValue;

    const stmt = this.db.prepare('SELECT value FROM preferences WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;

    if (!row) return defaultValue;

    try {
      return JSON.parse(row.value) as T;
    } catch {
      return defaultValue;
    }
  }

  // ============ 学习数据操作 ============

  saveLearningData(type: string, data: unknown, feedback?: number): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO learning_data (type, data, feedback)
      VALUES (?, ?, ?)
    `);

    stmt.run(type, JSON.stringify(data), feedback);
  }

  getLearningData(type: string, limit: number = 100): unknown[] {
    if (!this.db) return [];

    const stmt = this.db.prepare('SELECT data FROM learning_data WHERE type = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(type, limit) as { data: string }[];

    return rows.map(row => {
      try {
        return JSON.parse(row.data);
      } catch {
        return row.data;
      }
    });
  }

  // ============ 行为事件操作 ============

  saveBehaviorEvent(event: {
    id: string;
    timestamp: number;
    eventType: string;
    action?: string;
    target?: string;
    context?: string;
    duration?: number;
    result?: string;
    platform?: string;
    activeApp?: string;
    windowTitle?: string;
    feedbackType?: string;
    feedbackReason?: string;
  }): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO behavior_events (
        id, timestamp, event_type, action, target, context, duration, result,
        platform, active_app, window_title, feedback_type, feedback_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.timestamp,
      event.eventType,
      event.action,
      event.target,
      event.context,
      event.duration,
      event.result,
      event.platform,
      event.activeApp,
      event.windowTitle,
      event.feedbackType,
      event.feedbackReason
    );
  }

  saveBehaviorEvents(events: Array<{
    id: string;
    timestamp: number;
    eventType: string;
    action?: string;
    target?: string;
    context?: string;
    duration?: number;
    result?: string;
    platform?: string;
    activeApp?: string;
    windowTitle?: string;
    feedbackType?: string;
    feedbackReason?: string;
  }>): void {
    for (const event of events) {
      this.saveBehaviorEvent(event);
    }
  }

  getBehaviorEvents(options: {
    limit?: number;
    offset?: number;
    eventType?: string;
    activeApp?: string;
    startTime?: number;
    endTime?: number;
  } = {}): Array<Record<string, unknown>> {
    if (!this.db) return [];

    const { limit = 100, offset = 0, eventType, activeApp, startTime, endTime } = options;

    let sql = 'SELECT * FROM behavior_events WHERE 1=1';
    const params: unknown[] = [];

    if (eventType) {
      sql += ' AND event_type = ?';
      params.push(eventType);
    }

    if (activeApp) {
      sql += ' AND active_app = ?';
      params.push(activeApp);
    }

    if (startTime) {
      sql += ' AND timestamp >= ?';
      params.push(startTime);
    }

    if (endTime) {
      sql += ' AND timestamp <= ?';
      params.push(endTime);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Array<Record<string, unknown>>;
  }

  getBehaviorEventCount(options: {
    eventType?: string;
    activeApp?: string;
    startTime?: number;
    endTime?: number;
  } = {}): number {
    if (!this.db) return 0;

    const { eventType, activeApp, startTime, endTime } = options;

    let sql = 'SELECT COUNT(*) as count FROM behavior_events WHERE 1=1';
    const params: unknown[] = [];

    if (eventType) {
      sql += ' AND event_type = ?';
      params.push(eventType);
    }

    if (activeApp) {
      sql += ' AND active_app = ?';
      params.push(activeApp);
    }

    if (startTime) {
      sql += ' AND timestamp >= ?';
      params.push(startTime);
    }

    if (endTime) {
      sql += ' AND timestamp <= ?';
      params.push(endTime);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  // ============ 行为模式操作 ============

  saveBehaviorPattern(pattern: {
    id: string;
    type: string;
    name: string;
    description?: string;
    confidence: number;
    occurrences: number;
    details?: string;
    createdAt: number;
  }): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO behavior_patterns (
        id, type, name, description, confidence, occurrences, details, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      pattern.id,
      pattern.type,
      pattern.name,
      pattern.description,
      pattern.confidence,
      pattern.occurrences,
      pattern.details,
      pattern.createdAt,
      Date.now()
    );
  }

  getBehaviorPatterns(type?: string, minConfidence?: number): Array<Record<string, unknown>> {
    if (!this.db) return [];

    let sql = 'SELECT * FROM behavior_patterns WHERE 1=1';
    const params: unknown[] = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    if (minConfidence !== undefined) {
      sql += ' AND confidence >= ?';
      params.push(minConfidence);
    }

    sql += ' ORDER BY confidence DESC, occurrences DESC';

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Array<Record<string, unknown>>;
  }

  deleteBehaviorPattern(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare('DELETE FROM behavior_patterns WHERE id = ?');
    stmt.run(id);
  }

  // ============ 习惯档案操作 ============

  saveHabitProfile(profile: {
    id: string;
    userId: string;
    profileData: string;
    createdAt: number;
    updatedAt: number;
  }): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO habit_profiles (id, user_id, profile_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      profile.id,
      profile.userId,
      profile.profileData,
      profile.createdAt,
      profile.updatedAt
    );
  }

  getHabitProfile(userId: string): Record<string, unknown> | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM habit_profiles WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1');
    return stmt.get(userId) as Record<string, unknown> | null;
  }

  // ============ 用户操作 ============

  saveUser(user: {
    id: string;
    username: string;
    role: string;
    passwordHash?: string;
    preferences?: string;
    createdAt: number;
    lastLoginAt?: number;
  }): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO users (id, username, role, password_hash, preferences, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      user.id,
      user.username,
      user.role,
      user.passwordHash,
      user.preferences,
      user.createdAt,
      user.lastLoginAt
    );
  }

  getUser(id: string): Record<string, unknown> | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as Record<string, unknown> | null;
  }

  getUserByUsername(username: string): Record<string, unknown> | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) as Record<string, unknown> | null;
  }

  updateUserLastLogin(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?');
    stmt.run(Date.now(), id);
  }

  // ============ 会话操作 ============

  saveSession(session: {
    id: string;
    userId: string;
    authMethod: string;
    isLocked: boolean;
    deviceInfo?: string;
    createdAt: number;
    expiresAt: number;
    lastActivityAt: number;
  }): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (
        id, user_id, auth_method, is_locked, device_info, created_at, expires_at, last_activity_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.userId,
      session.authMethod,
      session.isLocked ? 1 : 0,
      session.deviceInfo,
      session.createdAt,
      session.expiresAt,
      session.lastActivityAt
    );
  }

  getSession(id: string): Record<string, unknown> | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(id) as Record<string, unknown> | null;
  }

  getActiveSessions(userId: string): Array<Record<string, unknown>> {
    if (!this.db) return [];

    const now = Date.now();
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE user_id = ? AND expires_at > ?');
    return stmt.all(userId, now) as Array<Record<string, unknown>>;
  }

  updateSessionActivity(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare('UPDATE sessions SET last_activity_at = ? WHERE id = ?');
    stmt.run(Date.now(), id);
  }

  updateSessionLocked(id: string, isLocked: boolean): void {
    if (!this.db) return;

    const stmt = this.db.prepare('UPDATE sessions SET is_locked = ? WHERE id = ?');
    stmt.run(isLocked ? 1 : 0, id);
  }

  deleteSession(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(id);
  }

  deleteExpiredSessions(): number {
    if (!this.db) return 0;

    const stmt = this.db.prepare('DELETE FROM sessions WHERE expires_at < ?');
    const result = stmt.run(Date.now());
    return result.changes;
  }

  // ============ 权限授权操作 ============

  savePermissionGrant(grant: {
    permissionId: string;
    status: string;
    grantedAt?: number;
    expiresAt?: number;
    grantedBy: string;
    scope?: string;
    reason?: string;
  }): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO permission_grants (
        permission_id, status, granted_at, expires_at, granted_by, scope, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      grant.permissionId,
      grant.status,
      grant.grantedAt,
      grant.expiresAt,
      grant.grantedBy,
      grant.scope,
      grant.reason
    );
  }

  getPermissionGrant(permissionId: string): Record<string, unknown> | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM permission_grants WHERE permission_id = ?');
    return stmt.get(permissionId) as Record<string, unknown> | null;
  }

  getAllPermissionGrants(): Array<Record<string, unknown>> {
    if (!this.db) return [];

    const stmt = this.db.prepare('SELECT * FROM permission_grants');
    return stmt.all() as Array<Record<string, unknown>>;
  }

  deletePermissionGrant(permissionId: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare('DELETE FROM permission_grants WHERE permission_id = ?');
    stmt.run(permissionId);
  }

  deleteExpiredPermissionGrants(): number {
    if (!this.db) return 0;

    const stmt = this.db.prepare('DELETE FROM permission_grants WHERE expires_at IS NOT NULL AND expires_at < ?');
    const result = stmt.run(Date.now());
    return result.changes;
  }

  // ============ 审计日志操作 ============

  saveAuditLog(log: {
    id: string;
    timestamp: number;
    eventType: string;
    userId?: string;
    sessionId?: string;
    action?: string;
    permissionId?: string;
    resourceType?: string;
    resourceId?: string;
    reason?: string;
    result?: string;
    errorMessage?: string;
    ip?: string;
    userAgent?: string;
    platform?: string;
  }): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (
        id, timestamp, event_type, user_id, session_id, action, permission_id,
        resource_type, resource_id, reason, result, error_message, ip, user_agent, platform
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      log.id,
      log.timestamp,
      log.eventType,
      log.userId,
      log.sessionId,
      log.action,
      log.permissionId,
      log.resourceType,
      log.resourceId,
      log.reason,
      log.result,
      log.errorMessage,
      log.ip,
      log.userAgent,
      log.platform
    );
  }

  getAuditLogs(options: {
    limit?: number;
    offset?: number;
    eventType?: string;
    userId?: string;
    sessionId?: string;
    startTime?: number;
    endTime?: number;
  } = {}): Array<Record<string, unknown>> {
    if (!this.db) return [];

    const { limit = 100, offset = 0, eventType, userId, sessionId, startTime, endTime } = options;

    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: unknown[] = [];

    if (eventType) {
      sql += ' AND event_type = ?';
      params.push(eventType);
    }

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    if (sessionId) {
      sql += ' AND session_id = ?';
      params.push(sessionId);
    }

    if (startTime) {
      sql += ' AND timestamp >= ?';
      params.push(startTime);
    }

    if (endTime) {
      sql += ' AND timestamp <= ?';
      params.push(endTime);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Array<Record<string, unknown>>;
  }

  getAuditLogCount(options: {
    eventType?: string;
    userId?: string;
    startTime?: number;
    endTime?: number;
  } = {}): number {
    if (!this.db) return 0;

    const { eventType, userId, startTime, endTime } = options;

    let sql = 'SELECT COUNT(*) as count FROM audit_logs WHERE 1=1';
    const params: unknown[] = [];

    if (eventType) {
      sql += ' AND event_type = ?';
      params.push(eventType);
    }

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    if (startTime) {
      sql += ' AND timestamp >= ?';
      params.push(startTime);
    }

    if (endTime) {
      sql += ' AND timestamp <= ?';
      params.push(endTime);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  deleteOldAuditLogs(olderThanDays: number): number {
    if (!this.db) return 0;

    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const stmt = this.db.prepare('DELETE FROM audit_logs WHERE timestamp < ?');
    const result = stmt.run(cutoffTime);
    return result.changes;
  }

  // ============ 清理操作 ============

  /**
   * 清理旧数据
   */
  cleanup(olderThanDays: number = 30): number {
    if (!this.db) return 0;

    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    let totalDeleted = 0;

    const tables = ['contexts', 'intents', 'plans', 'executions', 'learning_data', 'behavior_events', 'behavior_patterns', 'audit_logs'];

    for (const table of tables) {
      const column = table === 'learning_data' ? 'created_at' : (table === 'contexts' ? 'timestamp' : 'created_at');
      const stmt = this.db.prepare(`DELETE FROM ${table} WHERE ${column} < ?`);
      const result = stmt.run(cutoffTime);
      totalDeleted += result.changes;
    }

    // 执行 VACUUM 以回收空间
    this.db.exec('VACUUM');

    return totalDeleted;
  }

  /**
   * 获取数据库统计
   */
  getStats(): Record<string, number> {
    if (!this.db) return {};

    const stats: Record<string, number> = {};
    const tables = ['contexts', 'intents', 'plans', 'executions', 'preferences', 'learning_data', 'behavior_events', 'behavior_patterns', 'habit_profiles', 'users', 'sessions', 'permission_grants', 'audit_logs'];

    for (const table of tables) {
      const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`);
      const result = stmt.get() as { count: number };
      stats[table] = result.count;
    }

    return stats;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}
