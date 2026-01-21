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

      -- 索引
      CREATE INDEX IF NOT EXISTS idx_contexts_timestamp ON contexts(timestamp);
      CREATE INDEX IF NOT EXISTS idx_intents_context_id ON intents(context_id);
      CREATE INDEX IF NOT EXISTS idx_intents_type ON intents(type);
      CREATE INDEX IF NOT EXISTS idx_plans_intent_id ON plans(intent_id);
      CREATE INDEX IF NOT EXISTS idx_executions_plan_id ON executions(plan_id);
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

  // ============ 清理操作 ============

  /**
   * 清理旧数据
   */
  cleanup(olderThanDays: number = 30): number {
    if (!this.db) return 0;

    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    let totalDeleted = 0;

    const tables = ['contexts', 'intents', 'plans', 'executions', 'learning_data'];

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
    const tables = ['contexts', 'intents', 'plans', 'executions', 'preferences', 'learning_data'];

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
