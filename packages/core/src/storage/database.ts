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
      const DatabaseCtor: new (filename: string) => Database =
        (BetterSqlite3 as Record<string, unknown>).default as never ?? BetterSqlite3;

      // 确保目录存在
      if (!this.config.inMemory && this.config.dbPath) {
        const dir = path.dirname(this.config.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      // 创建数据库连接
      const dbPath = this.config.inMemory ? ':memory:' : this.config.dbPath!;
      this.db = new DatabaseCtor(dbPath);

      // 启用 WAL 模式
      if (this.config.enableWAL && !this.config.inMemory) {
        this.db.pragma('journal_mode = WAL');
      }

      // 创建表
      this.createTables();

      this.isInitialized = true;
    } catch (error) {
      // SQLite not available - gracefully degrade to no-op mode
      // All database operations will return empty/null results
      console.warn('SQLite 不可用，数据库功能已禁用。功能将以只读/无持久化模式运行:', (error as Error).message);
      this.db = null;
      this.isInitialized = true;
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

      -- 人生树节点表
      CREATE TABLE IF NOT EXISTS life_tree_nodes (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        label TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        stage TEXT,
        confidence REAL DEFAULT 0.5,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        frequency INTEGER DEFAULT 1,
        source TEXT DEFAULT 'inferred',
        description TEXT,
        tags TEXT DEFAULT '[]',
        experiment_status TEXT,
        experiment_phase TEXT,
        experiment_config TEXT,
        experiment_results TEXT,
        tree_version INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      -- 人生树快照表
      CREATE TABLE IF NOT EXISTS life_tree_snapshots (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        tree_data TEXT NOT NULL,
        total_nodes INTEGER DEFAULT 0,
        active_experiments INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      -- 实验记录表
      CREATE TABLE IF NOT EXISTS life_tree_experiments (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        hypothesis TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at INTEGER,
        completed_at INTEGER,
        config TEXT,
        results TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (node_id) REFERENCES life_tree_nodes(id)
      );

      -- 人生树索引
      CREATE INDEX IF NOT EXISTS idx_life_tree_nodes_parent ON life_tree_nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_life_tree_nodes_type ON life_tree_nodes(type);
      CREATE INDEX IF NOT EXISTS idx_life_tree_nodes_stage ON life_tree_nodes(stage);
      CREATE INDEX IF NOT EXISTS idx_life_tree_nodes_status ON life_tree_nodes(status);
      CREATE INDEX IF NOT EXISTS idx_life_tree_snapshots_version ON life_tree_snapshots(version);
      CREATE INDEX IF NOT EXISTS idx_life_tree_experiments_node ON life_tree_experiments(node_id);
      CREATE INDEX IF NOT EXISTS idx_life_tree_experiments_status ON life_tree_experiments(status);
    `);

    // FTS5 全文搜索 (参考 steipete/wacli)
    // 使用 content-less FTS5 表以节省空间，通过 contentless_delete=1 支持删除
    this.createFTS5Tables();
  }

  /**
   * 创建 FTS5 全文搜索表
   * 参考 steipete/wacli 的 SQLite FTS5 模式
   */
  private createFTS5Tables(): void {
    if (!this.db) return;

    try {
      this.db.exec(`
        -- FTS5 虚拟表用于上下文搜索
        -- 使用 content='' 创建 contentless FTS 表以节省空间
        -- 原始数据保存在 contexts 表中
        CREATE VIRTUAL TABLE IF NOT EXISTS contexts_fts USING fts5(
          window_title,
          clipboard,
          ocr_text,
          content='',
          contentless_delete=1
        );

        -- FTS5 虚拟表用于意图搜索
        CREATE VIRTUAL TABLE IF NOT EXISTS intents_fts USING fts5(
          description,
          entities,
          content='',
          contentless_delete=1
        );

        -- FTS5 虚拟表用于计划搜索
        CREATE VIRTUAL TABLE IF NOT EXISTS plans_fts USING fts5(
          title,
          description,
          steps,
          content='',
          contentless_delete=1
        );

        -- FTS5 虚拟表用于行为事件搜索
        CREATE VIRTUAL TABLE IF NOT EXISTS behavior_events_fts USING fts5(
          action,
          target,
          context,
          window_title,
          content='',
          contentless_delete=1
        );
      `);
    } catch (error) {
      // FTS5 可能不可用（某些 SQLite 编译没有包含）
      console.warn('FTS5 不可用，全文搜索功能已禁用:', (error as Error).message);
    }
  }

  /**
   * 同步内容到 FTS 索引
   * 在保存记录后调用以更新搜索索引
   */
  private syncToFTS(table: 'contexts' | 'intents' | 'plans' | 'behavior_events', rowid: number | bigint, data: Record<string, string | undefined>): void {
    if (!this.db) return;

    try {
      const ftsTable = `${table}_fts`;
      const columns = Object.keys(data);
      const values = Object.values(data);

      // 先删除旧记录（如果存在）
      const deleteStmt = this.db.prepare(`DELETE FROM ${ftsTable} WHERE rowid = ?`);
      deleteStmt.run(rowid);

      // 插入新记录
      const placeholders = columns.map(() => '?').join(', ');
      const insertStmt = this.db.prepare(
        `INSERT INTO ${ftsTable}(rowid, ${columns.join(', ')}) VALUES (?, ${placeholders})`
      );
      insertStmt.run(rowid, ...values);
    } catch {
      // FTS 不可用时静默失败
    }
  }

  /**
   * 从 FTS 索引删除记录
   */
  private deleteFromFTS(table: 'contexts' | 'intents' | 'plans' | 'behavior_events', rowid: number | bigint): void {
    if (!this.db) return;

    try {
      const ftsTable = `${table}_fts`;
      const stmt = this.db.prepare(`DELETE FROM ${ftsTable} WHERE rowid = ?`);
      stmt.run(rowid);
    } catch {
      // FTS 不可用时静默失败
    }
  }

  // ============ 上下文操作 ============

  saveContext(context: ContextRecord): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO contexts (id, timestamp, app_name, window_title, clipboard, screenshot, ocr_text, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      context.id,
      context.timestamp,
      context.appName,
      context.windowTitle,
      context.clipboard,
      context.screenshot,
      context.ocrText,
      context.metadata
    );

    // 同步到 FTS 索引
    this.syncToFTS('contexts', result.lastInsertRowid, {
      window_title: context.windowTitle,
      clipboard: context.clipboard,
      ocr_text: context.ocrText,
    });
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

  // ============ FTS5 全文搜索 (参考 steipete/wacli) ============

  /**
   * 全文搜索上下文记录
   * 使用 FTS5 的 MATCH 语法进行高效搜索
   * @param query 搜索查询（支持 FTS5 语法如 "hello world"、hello OR world、hello NOT goodbye）
   * @param limit 返回结果数量限制
   * @returns 匹配的上下文记录，按相关性排序
   */
  searchContexts(query: string, limit: number = 20): Array<ContextRecord & { rank: number }> {
    if (!this.db || !query.trim()) return [];

    try {
      // 使用 FTS5 的 bm25() 排名函数获取相关性分数
      const stmt = this.db.prepare(`
        SELECT c.*, fts.rank
        FROM contexts c
        JOIN (
          SELECT rowid, rank
          FROM contexts_fts
          WHERE contexts_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        ) fts ON c.rowid = fts.rowid
        ORDER BY fts.rank
      `);

      const rows = stmt.all(query, limit) as Array<Record<string, unknown>>;

      return rows.map(row => ({
        id: row.id as string,
        timestamp: row.timestamp as number,
        appName: row.app_name as string | undefined,
        windowTitle: row.window_title as string | undefined,
        clipboard: row.clipboard as string | undefined,
        screenshot: row.screenshot as string | undefined,
        ocrText: row.ocr_text as string | undefined,
        metadata: row.metadata as string | undefined,
        rank: row.rank as number,
      }));
    } catch (error) {
      // FTS 不可用或查询语法错误时回退到 LIKE 搜索
      console.warn('FTS5 搜索失败，回退到 LIKE 搜索:', (error as Error).message);
      return this.searchContextsFallback(query, limit);
    }
  }

  /**
   * LIKE 回退搜索（当 FTS5 不可用时）
   */
  private searchContextsFallback(query: string, limit: number): Array<ContextRecord & { rank: number }> {
    if (!this.db) return [];

    const likeQuery = `%${query}%`;
    const stmt = this.db.prepare(`
      SELECT * FROM contexts
      WHERE window_title LIKE ? OR clipboard LIKE ? OR ocr_text LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(likeQuery, likeQuery, likeQuery, limit) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      id: row.id as string,
      timestamp: row.timestamp as number,
      appName: row.app_name as string | undefined,
      windowTitle: row.window_title as string | undefined,
      clipboard: row.clipboard as string | undefined,
      screenshot: row.screenshot as string | undefined,
      ocrText: row.ocr_text as string | undefined,
      metadata: row.metadata as string | undefined,
      rank: 0,  // LIKE 搜索没有排名
    }));
  }

  /**
   * 搜索所有可搜索内容（上下文、意图、计划、行为事件）
   * @param query 搜索查询
   * @param options 搜索选项
   */
  searchAll(query: string, options: {
    limit?: number;
    includeContexts?: boolean;
    includeIntents?: boolean;
    includePlans?: boolean;
    includeBehaviorEvents?: boolean;
  } = {}): {
    contexts: Array<ContextRecord & { rank: number }>;
    intents: Array<IntentRecord & { rank: number }>;
    plans: Array<PlanRecord & { rank: number }>;
    behaviorEvents: Array<Record<string, unknown> & { rank: number }>;
  } {
    const {
      limit = 10,
      includeContexts = true,
      includeIntents = true,
      includePlans = true,
      includeBehaviorEvents = true,
    } = options;

    const results: {
      contexts: Array<ContextRecord & { rank: number }>;
      intents: Array<IntentRecord & { rank: number }>;
      plans: Array<PlanRecord & { rank: number }>;
      behaviorEvents: Array<Record<string, unknown> & { rank: number }>;
    } = {
      contexts: [],
      intents: [],
      plans: [],
      behaviorEvents: [],
    };

    if (includeContexts) {
      results.contexts = this.searchContexts(query, limit);
    }

    if (includeIntents) {
      results.intents = this.searchIntents(query, limit);
    }

    if (includePlans) {
      results.plans = this.searchPlans(query, limit);
    }

    if (includeBehaviorEvents) {
      results.behaviorEvents = this.searchBehaviorEvents(query, limit);
    }

    return results;
  }

  /**
   * 搜索意图记录
   */
  searchIntents(query: string, limit: number = 20): Array<IntentRecord & { rank: number }> {
    if (!this.db || !query.trim()) return [];

    try {
      const stmt = this.db.prepare(`
        SELECT i.*, fts.rank
        FROM intents i
        JOIN (
          SELECT rowid, rank
          FROM intents_fts
          WHERE intents_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        ) fts ON i.rowid = fts.rowid
        ORDER BY fts.rank
      `);

      const rows = stmt.all(query, limit) as Array<Record<string, unknown>>;

      return rows.map(row => ({
        id: row.id as string,
        contextId: row.context_id as string,
        type: row.type as string,
        description: row.description as string,
        confidence: row.confidence as number,
        entities: row.entities as string | undefined,
        createdAt: row.created_at as number,
        rank: row.rank as number,
      }));
    } catch {
      // 回退到 LIKE 搜索
      const likeQuery = `%${query}%`;
      const stmt = this.db.prepare(`
        SELECT * FROM intents
        WHERE description LIKE ? OR entities LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `);

      const rows = stmt.all(likeQuery, likeQuery, limit) as Array<Record<string, unknown>>;

      return rows.map(row => ({
        id: row.id as string,
        contextId: row.context_id as string,
        type: row.type as string,
        description: row.description as string,
        confidence: row.confidence as number,
        entities: row.entities as string | undefined,
        createdAt: row.created_at as number,
        rank: 0,
      }));
    }
  }

  /**
   * 搜索计划记录
   */
  searchPlans(query: string, limit: number = 20): Array<PlanRecord & { rank: number }> {
    if (!this.db || !query.trim()) return [];

    try {
      const stmt = this.db.prepare(`
        SELECT p.*, fts.rank
        FROM plans p
        JOIN (
          SELECT rowid, rank
          FROM plans_fts
          WHERE plans_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        ) fts ON p.rowid = fts.rowid
        ORDER BY fts.rank
      `);

      const rows = stmt.all(query, limit) as Array<Record<string, unknown>>;

      return rows.map(row => ({
        id: row.id as string,
        intentId: row.intent_id as string,
        title: row.title as string,
        description: row.description as string,
        steps: row.steps as string,
        pros: row.pros as string,
        cons: row.cons as string,
        status: row.status as string,
        createdAt: row.created_at as number,
        completedAt: row.completed_at as number | undefined,
        rank: row.rank as number,
      }));
    } catch {
      // 回退到 LIKE 搜索
      const likeQuery = `%${query}%`;
      const stmt = this.db.prepare(`
        SELECT * FROM plans
        WHERE title LIKE ? OR description LIKE ? OR steps LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `);

      const rows = stmt.all(likeQuery, likeQuery, likeQuery, limit) as Array<Record<string, unknown>>;

      return rows.map(row => ({
        id: row.id as string,
        intentId: row.intent_id as string,
        title: row.title as string,
        description: row.description as string,
        steps: row.steps as string,
        pros: row.pros as string,
        cons: row.cons as string,
        status: row.status as string,
        createdAt: row.created_at as number,
        completedAt: row.completed_at as number | undefined,
        rank: 0,
      }));
    }
  }

  /**
   * 搜索行为事件记录
   */
  searchBehaviorEvents(query: string, limit: number = 20): Array<Record<string, unknown> & { rank: number }> {
    if (!this.db || !query.trim()) return [];

    try {
      const stmt = this.db.prepare(`
        SELECT e.*, fts.rank
        FROM behavior_events e
        JOIN (
          SELECT rowid, rank
          FROM behavior_events_fts
          WHERE behavior_events_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        ) fts ON e.rowid = fts.rowid
        ORDER BY fts.rank
      `);

      return stmt.all(query, limit) as Array<Record<string, unknown> & { rank: number }>;
    } catch {
      // 回退到 LIKE 搜索
      const likeQuery = `%${query}%`;
      const stmt = this.db.prepare(`
        SELECT *, 0 as rank FROM behavior_events
        WHERE action LIKE ? OR target LIKE ? OR context LIKE ? OR window_title LIKE ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      return stmt.all(likeQuery, likeQuery, likeQuery, likeQuery, limit) as Array<Record<string, unknown> & { rank: number }>;
    }
  }

  /**
   * 重建 FTS 索引
   * 用于初始化或修复 FTS 索引
   */
  rebuildFTSIndex(): void {
    if (!this.db) return;

    try {
      // 重建上下文 FTS 索引
      const contexts = this.db.prepare('SELECT rowid, window_title, clipboard, ocr_text FROM contexts').all() as Array<Record<string, unknown>>;
      this.db.exec('DELETE FROM contexts_fts');
      for (const ctx of contexts) {
        this.syncToFTS('contexts', ctx.rowid as number, {
          window_title: ctx.window_title as string | undefined,
          clipboard: ctx.clipboard as string | undefined,
          ocr_text: ctx.ocr_text as string | undefined,
        });
      }

      // 重建意图 FTS 索引
      const intents = this.db.prepare('SELECT rowid, description, entities FROM intents').all() as Array<Record<string, unknown>>;
      this.db.exec('DELETE FROM intents_fts');
      for (const intent of intents) {
        this.syncToFTS('intents', intent.rowid as number, {
          description: intent.description as string | undefined,
          entities: intent.entities as string | undefined,
        });
      }

      // 重建计划 FTS 索引
      const plans = this.db.prepare('SELECT rowid, title, description, steps FROM plans').all() as Array<Record<string, unknown>>;
      this.db.exec('DELETE FROM plans_fts');
      for (const plan of plans) {
        this.syncToFTS('plans', plan.rowid as number, {
          title: plan.title as string | undefined,
          description: plan.description as string | undefined,
          steps: plan.steps as string | undefined,
        });
      }

      // 重建行为事件 FTS 索引
      const events = this.db.prepare('SELECT rowid, action, target, context, window_title FROM behavior_events').all() as Array<Record<string, unknown>>;
      this.db.exec('DELETE FROM behavior_events_fts');
      for (const event of events) {
        this.syncToFTS('behavior_events', event.rowid as number, {
          action: event.action as string | undefined,
          target: event.target as string | undefined,
          context: event.context as string | undefined,
          window_title: event.window_title as string | undefined,
        });
      }

      console.log('FTS 索引重建完成');
    } catch (error) {
      console.error('FTS 索引重建失败:', (error as Error).message);
    }
  }

  // ============ 意图操作 ============

  saveIntent(intent: IntentRecord): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO intents (id, context_id, type, description, confidence, entities, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      intent.id,
      intent.contextId,
      intent.type,
      intent.description,
      intent.confidence,
      intent.entities,
      intent.createdAt
    );

    // 同步到 FTS 索引
    this.syncToFTS('intents', result.lastInsertRowid, {
      description: intent.description,
      entities: intent.entities,
    });
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

    const result = stmt.run(
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

    // 同步到 FTS 索引
    this.syncToFTS('plans', result.lastInsertRowid, {
      title: plan.title,
      description: plan.description,
      steps: plan.steps,
    });
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

  /**
   * 获取最近的执行记录（包含计划详情）
   */
  getRecentExecutions(limit: number = 20): Array<ExecutionRecord & { plan?: PlanRecord }> {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT
        e.id, e.plan_id, e.status, e.step_results, e.error, e.started_at, e.completed_at,
        p.id as p_id, p.intent_id, p.title, p.description, p.steps, p.pros, p.cons,
        p.status as p_status, p.created_at as p_created_at, p.completed_at as p_completed_at
      FROM executions e
      LEFT JOIN plans p ON e.plan_id = p.id
      ORDER BY e.started_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      id: row.id as string,
      planId: row.plan_id as string,
      status: row.status as string,
      stepResults: row.step_results as string,
      error: row.error as string | undefined,
      startedAt: row.started_at as number,
      completedAt: row.completed_at as number | undefined,
      plan: row.p_id ? {
        id: row.p_id as string,
        intentId: row.intent_id as string,
        title: row.title as string,
        description: row.description as string,
        steps: row.steps as string,
        pros: row.pros as string,
        cons: row.cons as string,
        status: row.p_status as string,
        createdAt: row.p_created_at as number,
        completedAt: row.p_completed_at as number | undefined,
      } : undefined,
    }));
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

    const result = stmt.run(
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

    // 同步到 FTS 索引
    this.syncToFTS('behavior_events', result.lastInsertRowid, {
      action: event.action,
      target: event.target,
      context: event.context,
      window_title: event.windowTitle,
    });
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

  // ============ Life Tree CRUD ============

  saveLifeTreeNode(node: {
    id: string;
    parentId: string | null;
    label: string;
    type: string;
    status: string;
    stage?: string;
    confidence: number;
    firstSeen: number;
    lastSeen: number;
    frequency: number;
    source: string;
    description?: string;
    tags: string;
    experimentStatus?: string;
    experimentPhase?: string;
    experimentConfig?: string;
    experimentResults?: string;
    treeVersion: number;
  }): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO life_tree_nodes
        (id, parent_id, label, type, status, stage, confidence, first_seen, last_seen,
         frequency, source, description, tags, experiment_status, experiment_phase,
         experiment_config, experiment_results, tree_version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      node.id, node.parentId, node.label, node.type, node.status,
      node.stage, node.confidence, node.firstSeen, node.lastSeen,
      node.frequency, node.source, node.description, node.tags,
      node.experimentStatus, node.experimentPhase,
      node.experimentConfig, node.experimentResults,
      node.treeVersion, Date.now()
    );
  }

  getLifeTreeNodes(treeVersion?: number): Array<Record<string, unknown>> {
    if (!this.db) return [];
    if (treeVersion != null) {
      const stmt = this.db.prepare('SELECT * FROM life_tree_nodes WHERE tree_version = ? ORDER BY first_seen ASC');
      return stmt.all(treeVersion) as Array<Record<string, unknown>>;
    }
    const stmt = this.db.prepare('SELECT * FROM life_tree_nodes ORDER BY first_seen ASC');
    return stmt.all() as Array<Record<string, unknown>>;
  }

  getLifeTreeNodesByParent(parentId: string | null): Array<Record<string, unknown>> {
    if (!this.db) return [];
    if (parentId === null) {
      const stmt = this.db.prepare('SELECT * FROM life_tree_nodes WHERE parent_id IS NULL ORDER BY first_seen ASC');
      return stmt.all() as Array<Record<string, unknown>>;
    }
    const stmt = this.db.prepare('SELECT * FROM life_tree_nodes WHERE parent_id = ? ORDER BY first_seen ASC');
    return stmt.all(parentId) as Array<Record<string, unknown>>;
  }

  deleteLifeTreeNode(id: string): void {
    if (!this.db) return;
    this.db.prepare('DELETE FROM life_tree_nodes WHERE id = ?').run(id);
  }

  saveLifeTreeSnapshot(snapshot: {
    id: string;
    version: number;
    treeData: string;
    totalNodes: number;
    activeExperiments: number;
  }): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO life_tree_snapshots (id, version, tree_data, total_nodes, active_experiments, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(snapshot.id, snapshot.version, snapshot.treeData, snapshot.totalNodes, snapshot.activeExperiments, Date.now());
  }

  getLatestLifeTreeSnapshot(): Record<string, unknown> | null {
    if (!this.db) return null;
    const stmt = this.db.prepare('SELECT * FROM life_tree_snapshots ORDER BY version DESC LIMIT 1');
    return (stmt.get() as Record<string, unknown>) ?? null;
  }

  saveLifeTreeExperiment(experiment: {
    id: string;
    nodeId: string;
    phase: string;
    hypothesis: string;
    status: string;
    startedAt?: number;
    completedAt?: number;
    config?: string;
    results?: string;
  }): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO life_tree_experiments
        (id, node_id, phase, hypothesis, status, started_at, completed_at, config, results, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      experiment.id, experiment.nodeId, experiment.phase, experiment.hypothesis,
      experiment.status, experiment.startedAt, experiment.completedAt,
      experiment.config, experiment.results, Date.now()
    );
  }

  getLifeTreeExperiments(status?: string): Array<Record<string, unknown>> {
    if (!this.db) return [];
    if (status) {
      const stmt = this.db.prepare('SELECT * FROM life_tree_experiments WHERE status = ? ORDER BY created_at DESC');
      return stmt.all(status) as Array<Record<string, unknown>>;
    }
    const stmt = this.db.prepare('SELECT * FROM life_tree_experiments ORDER BY created_at DESC');
    return stmt.all() as Array<Record<string, unknown>>;
  }

  updateLifeTreeExperimentStatus(id: string, status: string, completedAt?: number): void {
    if (!this.db) return;
    if (completedAt != null) {
      this.db.prepare('UPDATE life_tree_experiments SET status = ?, completed_at = ? WHERE id = ?').run(status, completedAt, id);
    } else {
      this.db.prepare('UPDATE life_tree_experiments SET status = ? WHERE id = ?').run(status, id);
    }
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
