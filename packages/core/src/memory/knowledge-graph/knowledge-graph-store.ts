import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  KGEntity,
  KGEntityType,
  KGEdge,
  KGRelationType,
  KGFact,
  KGFactType,
  HierarchicalSummary,
  SummaryNodeType,
  CostEntry,
  CostSource,
  LearningRecord,
  LearningType,
} from './types';

// Type definitions (runtime dynamic import of better-sqlite3)
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

export interface KnowledgeGraphStoreConfig {
  dbPath?: string;
  enableWAL?: boolean;
  inMemory?: boolean;
}

export class KnowledgeGraphStore {
  private db: Database | null = null;
  private isInitialized = false;

  constructor(private config: KnowledgeGraphStoreConfig = {}) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const Database = (await import('better-sqlite3')).default;

      let dbPath: string;
      if (this.config.inMemory) {
        dbPath = ':memory:';
      } else {
        dbPath = this.config.dbPath || path.join(os.homedir(), '.hawkeye', 'knowledge-graph.db');
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      this.db = new Database(dbPath) as unknown as Database;

      if (this.config.enableWAL !== false) {
        this.db.pragma('journal_mode = WAL');
      }

      this.initializeSchema();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize KnowledgeGraphStore:', error);
      throw error;
    }
  }

  private initializeSchema(): void {
    if (!this.db) return;

    // Entities table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kg_entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_type_raw TEXT,
        aliases TEXT DEFAULT '[]',
        description TEXT DEFAULT '',
        embedding BLOB,
        importance REAL DEFAULT 0.5,
        access_count INTEGER DEFAULT 0,
        first_seen INTEGER,
        last_seen INTEGER,
        source_event_ids TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_kg_entities_name ON kg_entities(name);
      CREATE INDEX IF NOT EXISTS idx_kg_entities_type ON kg_entities(entity_type);
      CREATE INDEX IF NOT EXISTS idx_kg_entities_importance ON kg_entities(importance DESC);
      CREATE INDEX IF NOT EXISTS idx_kg_entities_last_seen ON kg_entities(last_seen DESC);
    `);

    // Edges table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kg_edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        strength REAL DEFAULT 0.5,
        bidirectional INTEGER DEFAULT 0,
        evidence TEXT DEFAULT '[]',
        is_current INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (source_id) REFERENCES kg_entities(id),
        FOREIGN KEY (target_id) REFERENCES kg_entities(id)
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON kg_edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON kg_edges(target_id);
      CREATE INDEX IF NOT EXISTS idx_kg_edges_relation ON kg_edges(relation);
    `);

    // Facts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kg_facts (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object TEXT NOT NULL,
        fact_text TEXT DEFAULT '',
        fact_type TEXT NOT NULL DEFAULT 'relation',
        confidence REAL DEFAULT 0.8,
        strength REAL DEFAULT 0.5,
        source_event_ids TEXT DEFAULT '[]',
        contradicts TEXT,
        embedding BLOB,
        valid_from INTEGER,
        valid_to INTEGER,
        times_retrieved INTEGER DEFAULT 0,
        times_used INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_kg_facts_subject ON kg_facts(subject);
      CREATE INDEX IF NOT EXISTS idx_kg_facts_predicate ON kg_facts(predicate);
      CREATE INDEX IF NOT EXISTS idx_kg_facts_type ON kg_facts(fact_type);
      CREATE INDEX IF NOT EXISTS idx_kg_facts_confidence ON kg_facts(confidence DESC);
    `);

    // Summaries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kg_summaries (
        id TEXT PRIMARY KEY,
        node_type TEXT NOT NULL,
        node_key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        content TEXT DEFAULT '',
        parent_id TEXT,
        child_ids TEXT DEFAULT '[]',
        embedding BLOB,
        events_since_refresh INTEGER DEFAULT 0,
        staleness_score REAL DEFAULT 0,
        priority_multiplier REAL DEFAULT 1.0,
        total_event_count INTEGER DEFAULT 0,
        first_event_at INTEGER,
        last_event_at INTEGER,
        last_refreshed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_kg_summaries_type ON kg_summaries(node_type);
      CREATE INDEX IF NOT EXISTS idx_kg_summaries_parent ON kg_summaries(parent_id);
      CREATE INDEX IF NOT EXISTS idx_kg_summaries_staleness ON kg_summaries(staleness_score DESC);
    `);

    // Cost tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kg_cost_tracking (
        id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        source TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_kg_cost_timestamp ON kg_cost_tracking(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_kg_cost_source ON kg_cost_tracking(source);
    `);

    // Learning records table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kg_learning_records (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        recommendation TEXT,
        sentiment TEXT DEFAULT 'neutral',
        confidence REAL DEFAULT 0.5,
        related_tool_id TEXT,
        related_entity_id TEXT,
        superseded_by TEXT,
        applied_count INTEGER DEFAULT 0,
        embedding BLOB,
        learned_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_kg_learning_type ON kg_learning_records(type);
      CREATE INDEX IF NOT EXISTS idx_kg_learning_learned_at ON kg_learning_records(learned_at DESC);
    `);

    // FTS5 tables for full-text search
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS kg_entities_fts USING fts5(
          name, aliases, description, content='', contentless_delete=1
        );
      `);

      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS kg_facts_fts USING fts5(
          subject, predicate, object, fact_text, content='', contentless_delete=1
        );
      `);
    } catch (error) {
      console.warn('FTS5 not available, full-text search disabled:', error);
    }
  }

  // === Helper Methods ===

  private serializeEmbedding(embedding?: number[]): Buffer | null {
    if (!embedding || embedding.length === 0) return null;
    return Buffer.from(new Float32Array(embedding).buffer);
  }

  private deserializeEmbedding(buffer?: Buffer | null): number[] | undefined {
    if (!buffer) return undefined;
    const float32Array = new Float32Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / 4
    );
    return Array.from(float32Array);
  }

  private mapRowToEntity(row: any): KGEntity {
    return {
      id: row.id,
      name: row.name,
      entityType: row.entity_type as KGEntityType,
      entityTypeRaw: row.entity_type_raw,
      aliases: JSON.parse(row.aliases || '[]'),
      description: row.description,
      embedding: this.deserializeEmbedding(row.embedding),
      importance: row.importance,
      accessCount: row.access_count,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      sourceEventIds: JSON.parse(row.source_event_ids || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToEdge(row: any): KGEdge {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      relation: row.relation,
      relationType: row.relation_type as KGRelationType,
      strength: row.strength,
      bidirectional: row.bidirectional === 1,
      evidence: JSON.parse(row.evidence || '[]'),
      isCurrent: row.is_current === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToFact(row: any): KGFact {
    return {
      id: row.id,
      subject: row.subject,
      predicate: row.predicate,
      object: row.object,
      factText: row.fact_text,
      factType: row.fact_type as KGFactType,
      confidence: row.confidence,
      strength: row.strength,
      sourceEventIds: JSON.parse(row.source_event_ids || '[]'),
      contradicts: row.contradicts,
      embedding: this.deserializeEmbedding(row.embedding),
      validFrom: row.valid_from,
      validTo: row.valid_to,
      timesRetrieved: row.times_retrieved,
      timesUsed: row.times_used,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToSummary(row: any): HierarchicalSummary {
    return {
      id: row.id,
      nodeType: row.node_type as SummaryNodeType,
      nodeKey: row.node_key,
      label: row.label,
      content: row.content,
      parentId: row.parent_id,
      childIds: JSON.parse(row.child_ids || '[]'),
      embedding: this.deserializeEmbedding(row.embedding),
      eventsSinceRefresh: row.events_since_refresh,
      stalenessScore: row.staleness_score,
      priorityMultiplier: row.priority_multiplier,
      totalEventCount: row.total_event_count,
      firstEventAt: row.first_event_at,
      lastEventAt: row.last_event_at,
      lastRefreshedAt: row.last_refreshed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToCostEntry(row: any): CostEntry {
    return {
      id: row.id,
      model: row.model,
      source: row.source as CostSource,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cost: row.cost,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp,
    };
  }

  private mapRowToLearningRecord(row: any): LearningRecord {
    return {
      id: row.id,
      type: row.type as LearningType,
      content: row.content,
      recommendation: row.recommendation,
      sentiment: row.sentiment as 'positive' | 'negative' | 'neutral',
      confidence: row.confidence,
      relatedToolId: row.related_tool_id,
      relatedEntityId: row.related_entity_id,
      supersededBy: row.superseded_by,
      appliedCount: row.applied_count,
      embedding: this.deserializeEmbedding(row.embedding),
      learnedAt: row.learned_at,
      updatedAt: row.updated_at,
    };
  }

  private syncEntityToFts(entity: KGEntity): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO kg_entities_fts (rowid, name, aliases, description)
        VALUES ((SELECT rowid FROM kg_entities WHERE id = ?), ?, ?, ?)
      `);
      stmt.run(
        entity.id,
        entity.name,
        entity.aliases.join(' '),
        entity.description
      );
    } catch (error) {
      // Silent fail if FTS5 unavailable
    }
  }

  private syncFactToFts(fact: KGFact): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO kg_facts_fts (rowid, subject, predicate, object, fact_text)
        VALUES ((SELECT rowid FROM kg_facts WHERE id = ?), ?, ?, ?, ?)
      `);
      stmt.run(
        fact.id,
        fact.subject,
        fact.predicate,
        fact.object,
        fact.factText
      );
    } catch (error) {
      // Silent fail if FTS5 unavailable
    }
  }

  // === Entity CRUD ===

  saveEntity(entity: KGEntity): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO kg_entities (
        id, name, entity_type, entity_type_raw, aliases, description,
        embedding, importance, access_count, first_seen, last_seen,
        source_event_ids, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entity.id,
      entity.name,
      entity.entityType,
      entity.entityTypeRaw || null,
      JSON.stringify(entity.aliases || []),
      entity.description || '',
      this.serializeEmbedding(entity.embedding),
      entity.importance || 0.5,
      entity.accessCount || 0,
      entity.firstSeen || null,
      entity.lastSeen || null,
      JSON.stringify(entity.sourceEventIds || []),
      entity.createdAt,
      entity.updatedAt
    );

    this.syncEntityToFts(entity);
  }

  getEntity(id: string): KGEntity | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM kg_entities WHERE id = ?');
    const row = stmt.get(id);

    return row ? this.mapRowToEntity(row) : null;
  }

  getEntityByName(name: string): KGEntity | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM kg_entities WHERE name = ? LIMIT 1');
    const row = stmt.get(name);

    return row ? this.mapRowToEntity(row) : null;
  }

  findEntities(options: {
    type?: KGEntityType;
    minImportance?: number;
    limit?: number;
    offset?: number;
  }): KGEntity[] {
    if (!this.db) return [];

    let sql = 'SELECT * FROM kg_entities WHERE 1=1';
    const params: unknown[] = [];

    if (options.type) {
      sql += ' AND entity_type = ?';
      params.push(options.type);
    }

    if (options.minImportance !== undefined) {
      sql += ' AND importance >= ?';
      params.push(options.minImportance);
    }

    sql += ' ORDER BY importance DESC';

    if (options.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset !== undefined) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map((row) => this.mapRowToEntity(row));
  }

  searchEntities(query: string, limit: number = 10): KGEntity[] {
    if (!this.db) return [];

    try {
      const stmt = this.db.prepare(`
        SELECT e.* FROM kg_entities e
        JOIN kg_entities_fts fts ON e.rowid = fts.rowid
        WHERE kg_entities_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      const rows = stmt.all(query, limit);
      return rows.map((row) => this.mapRowToEntity(row));
    } catch (error) {
      // Fallback to simple LIKE search if FTS5 unavailable
      const stmt = this.db.prepare(`
        SELECT * FROM kg_entities
        WHERE name LIKE ? OR description LIKE ?
        LIMIT ?
      `);
      const searchPattern = `%${query}%`;
      const rows = stmt.all(searchPattern, searchPattern, limit);
      return rows.map((row) => this.mapRowToEntity(row));
    }
  }

  updateEntityImportance(id: string, importance: number): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      UPDATE kg_entities
      SET importance = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(importance, Date.now(), id);
  }

  incrementEntityAccess(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      UPDATE kg_entities
      SET access_count = access_count + 1, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(Date.now(), id);
  }

  deleteEntity(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare('DELETE FROM kg_entities WHERE id = ?');
    stmt.run(id);

    try {
      const ftsDel = this.db.prepare(`
        DELETE FROM kg_entities_fts WHERE rowid IN (
          SELECT rowid FROM kg_entities WHERE id = ?
        )
      `);
      ftsDel.run(id);
    } catch (error) {
      // Silent fail
    }
  }

  // === Edge CRUD ===

  saveEdge(edge: KGEdge): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO kg_edges (
        id, source_id, target_id, relation, relation_type,
        strength, bidirectional, evidence, is_current,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      edge.id,
      edge.sourceId,
      edge.targetId,
      edge.relation,
      edge.relationType,
      edge.strength || 0.5,
      edge.bidirectional ? 1 : 0,
      JSON.stringify(edge.evidence || []),
      edge.isCurrent ? 1 : 0,
      edge.createdAt,
      edge.updatedAt
    );
  }

  getEdge(id: string): KGEdge | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM kg_edges WHERE id = ?');
    const row = stmt.get(id);

    return row ? this.mapRowToEdge(row) : null;
  }

  getEdgesForEntity(
    entityId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): KGEdge[] {
    if (!this.db) return [];

    let sql = 'SELECT * FROM kg_edges WHERE ';
    if (direction === 'outgoing') {
      sql += 'source_id = ?';
    } else if (direction === 'incoming') {
      sql += 'target_id = ?';
    } else {
      sql += '(source_id = ? OR target_id = ?)';
    }

    const stmt = this.db.prepare(sql);
    const rows = direction === 'both'
      ? stmt.all(entityId, entityId)
      : stmt.all(entityId);

    return rows.map((row) => this.mapRowToEdge(row));
  }

  findEdges(options: {
    relation?: string;
    relationType?: KGRelationType;
    minStrength?: number;
  }): KGEdge[] {
    if (!this.db) return [];

    let sql = 'SELECT * FROM kg_edges WHERE 1=1';
    const params: unknown[] = [];

    if (options.relation) {
      sql += ' AND relation = ?';
      params.push(options.relation);
    }

    if (options.relationType) {
      sql += ' AND relation_type = ?';
      params.push(options.relationType);
    }

    if (options.minStrength !== undefined) {
      sql += ' AND strength >= ?';
      params.push(options.minStrength);
    }

    sql += ' ORDER BY strength DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map((row) => this.mapRowToEdge(row));
  }

  deleteEdge(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare('DELETE FROM kg_edges WHERE id = ?');
    stmt.run(id);
  }

  // === Fact CRUD ===

  saveFact(fact: KGFact): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO kg_facts (
        id, subject, predicate, object, fact_text, fact_type,
        confidence, strength, source_event_ids, contradicts,
        embedding, valid_from, valid_to, times_retrieved, times_used,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fact.id,
      fact.subject,
      fact.predicate,
      fact.object,
      fact.factText || '',
      fact.factType,
      fact.confidence || 0.8,
      fact.strength || 0.5,
      JSON.stringify(fact.sourceEventIds || []),
      fact.contradicts || null,
      this.serializeEmbedding(fact.embedding),
      fact.validFrom || null,
      fact.validTo || null,
      fact.timesRetrieved || 0,
      fact.timesUsed || 0,
      fact.createdAt,
      fact.updatedAt
    );

    this.syncFactToFts(fact);
  }

  getFact(id: string): KGFact | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM kg_facts WHERE id = ?');
    const row = stmt.get(id);

    return row ? this.mapRowToFact(row) : null;
  }

  getFactsForSubject(subject: string): KGFact[] {
    if (!this.db) return [];

    const stmt = this.db.prepare('SELECT * FROM kg_facts WHERE subject = ?');
    const rows = stmt.all(subject);

    return rows.map((row) => this.mapRowToFact(row));
  }

  searchFacts(query: string, limit: number = 10): KGFact[] {
    if (!this.db) return [];

    try {
      const stmt = this.db.prepare(`
        SELECT f.* FROM kg_facts f
        JOIN kg_facts_fts fts ON f.rowid = fts.rowid
        WHERE kg_facts_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      const rows = stmt.all(query, limit);
      return rows.map((row) => this.mapRowToFact(row));
    } catch (error) {
      // Fallback to simple LIKE search if FTS5 unavailable
      const stmt = this.db.prepare(`
        SELECT * FROM kg_facts
        WHERE subject LIKE ? OR predicate LIKE ? OR object LIKE ? OR fact_text LIKE ?
        LIMIT ?
      `);
      const searchPattern = `%${query}%`;
      const rows = stmt.all(searchPattern, searchPattern, searchPattern, searchPattern, limit);
      return rows.map((row) => this.mapRowToFact(row));
    }
  }

  findFacts(options: {
    factType?: KGFactType;
    minConfidence?: number;
    limit?: number;
  }): KGFact[] {
    if (!this.db) return [];

    let sql = 'SELECT * FROM kg_facts WHERE 1=1';
    const params: unknown[] = [];

    if (options.factType) {
      sql += ' AND fact_type = ?';
      params.push(options.factType);
    }

    if (options.minConfidence !== undefined) {
      sql += ' AND confidence >= ?';
      params.push(options.minConfidence);
    }

    sql += ' ORDER BY confidence DESC';

    if (options.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map((row) => this.mapRowToFact(row));
  }

  incrementFactRetrieval(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      UPDATE kg_facts
      SET times_retrieved = times_retrieved + 1, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(Date.now(), id);
  }

  incrementFactUsage(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      UPDATE kg_facts
      SET times_used = times_used + 1, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(Date.now(), id);
  }

  deleteFact(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare('DELETE FROM kg_facts WHERE id = ?');
    stmt.run(id);

    try {
      const ftsDel = this.db.prepare(`
        DELETE FROM kg_facts_fts WHERE rowid IN (
          SELECT rowid FROM kg_facts WHERE id = ?
        )
      `);
      ftsDel.run(id);
    } catch (error) {
      // Silent fail
    }
  }

  // === Summary CRUD ===

  saveSummary(summary: HierarchicalSummary): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO kg_summaries (
        id, node_type, node_key, label, content, parent_id, child_ids,
        embedding, events_since_refresh, staleness_score, priority_multiplier,
        total_event_count, first_event_at, last_event_at, last_refreshed_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      summary.id,
      summary.nodeType,
      summary.nodeKey,
      summary.label,
      summary.content || '',
      summary.parentId || null,
      JSON.stringify(summary.childIds || []),
      this.serializeEmbedding(summary.embedding),
      summary.eventsSinceRefresh || 0,
      summary.stalenessScore || 0,
      summary.priorityMultiplier || 1.0,
      summary.totalEventCount || 0,
      summary.firstEventAt || null,
      summary.lastEventAt || null,
      summary.lastRefreshedAt || null,
      summary.createdAt,
      summary.updatedAt
    );
  }

  getSummary(id: string): HierarchicalSummary | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM kg_summaries WHERE id = ?');
    const row = stmt.get(id);

    return row ? this.mapRowToSummary(row) : null;
  }

  getSummaryByKey(nodeKey: string): HierarchicalSummary | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM kg_summaries WHERE node_key = ?');
    const row = stmt.get(nodeKey);

    return row ? this.mapRowToSummary(row) : null;
  }

  getChildSummaries(parentId: string): HierarchicalSummary[] {
    if (!this.db) return [];

    const stmt = this.db.prepare('SELECT * FROM kg_summaries WHERE parent_id = ?');
    const rows = stmt.all(parentId);

    return rows.map((row) => this.mapRowToSummary(row));
  }

  getRootSummary(): HierarchicalSummary | null {
    if (!this.db) return null;

    const stmt = this.db.prepare(`
      SELECT * FROM kg_summaries
      WHERE node_type = 'root'
      LIMIT 1
    `);
    const row = stmt.get();

    return row ? this.mapRowToSummary(row) : null;
  }

  getStalestSummaries(limit: number): HierarchicalSummary[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM kg_summaries
      ORDER BY staleness_score DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit);

    return rows.map((row) => this.mapRowToSummary(row));
  }

  incrementSummaryEvents(id: string, count: number = 1): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      UPDATE kg_summaries
      SET events_since_refresh = events_since_refresh + ?,
          total_event_count = total_event_count + ?,
          updated_at = ?
      WHERE id = ?
    `);
    stmt.run(count, count, Date.now(), id);
  }

  updateSummaryContent(id: string, content: string, embedding?: number[]): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      UPDATE kg_summaries
      SET content = ?,
          embedding = ?,
          events_since_refresh = 0,
          staleness_score = 0,
          last_refreshed_at = ?,
          updated_at = ?
      WHERE id = ?
    `);

    const now = Date.now();
    stmt.run(
      content,
      this.serializeEmbedding(embedding),
      now,
      now,
      id
    );
  }

  deleteSummary(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare('DELETE FROM kg_summaries WHERE id = ?');
    stmt.run(id);
  }

  // === Cost Tracking ===

  saveCostEntry(entry: CostEntry): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO kg_cost_tracking (
        id, model, source, input_tokens, output_tokens, cost, metadata, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      entry.model,
      entry.source,
      entry.inputTokens || 0,
      entry.outputTokens || 0,
      entry.cost || 0,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.timestamp
    );
  }

  getCostReport(from: number, to: number): {
    totalCost: number;
    entries: CostEntry[];
    byModel: Record<string, number>;
    bySource: Record<string, number>;
  } {
    if (!this.db) {
      return { totalCost: 0, entries: [], byModel: {}, bySource: {} };
    }

    const stmt = this.db.prepare(`
      SELECT * FROM kg_cost_tracking
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC
    `);
    const rows = stmt.all(from, to);
    const entries = rows.map((row) => this.mapRowToCostEntry(row));

    let totalCost = 0;
    const byModel: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const entry of entries) {
      totalCost += entry.cost;
      byModel[entry.model] = (byModel[entry.model] || 0) + entry.cost;
      bySource[entry.source] = (bySource[entry.source] || 0) + entry.cost;
    }

    return { totalCost, entries, byModel, bySource };
  }

  getTotalCostToday(): number {
    if (!this.db) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = today.getTime();
    const endOfDay = startOfDay + 86400000;

    const stmt = this.db.prepare(`
      SELECT SUM(cost) as total FROM kg_cost_tracking
      WHERE timestamp >= ? AND timestamp < ?
    `);
    const row = stmt.get(startOfDay, endOfDay) as any;

    return row?.total || 0;
  }

  // === Learning Records ===

  saveLearningRecord(record: LearningRecord): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO kg_learning_records (
        id, type, content, recommendation, sentiment, confidence,
        related_tool_id, related_entity_id, superseded_by, applied_count,
        embedding, learned_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.id,
      record.type,
      record.content,
      record.recommendation || null,
      record.sentiment || 'neutral',
      record.confidence || 0.5,
      record.relatedToolId || null,
      record.relatedEntityId || null,
      record.supersededBy || null,
      record.appliedCount || 0,
      this.serializeEmbedding(record.embedding),
      record.learnedAt,
      record.updatedAt
    );
  }

  getLearningRecords(options?: {
    type?: LearningType;
    limit?: number;
  }): LearningRecord[] {
    if (!this.db) return [];

    let sql = 'SELECT * FROM kg_learning_records WHERE 1=1';
    const params: unknown[] = [];

    if (options?.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }

    sql += ' ORDER BY learned_at DESC';

    if (options?.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map((row) => this.mapRowToLearningRecord(row));
  }

  incrementLearningApplied(id: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      UPDATE kg_learning_records
      SET applied_count = applied_count + 1, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(Date.now(), id);
  }

  // === Statistics ===

  getStats(): {
    entities: number;
    edges: number;
    facts: number;
    summaries: number;
    costEntries: number;
    learningRecords: number;
  } {
    if (!this.db) {
      return {
        entities: 0,
        edges: 0,
        facts: 0,
        summaries: 0,
        costEntries: 0,
        learningRecords: 0,
      };
    }

    const getCount = (table: string): number => {
      const stmt = this.db!.prepare(`SELECT COUNT(*) as count FROM ${table}`);
      const row = stmt.get() as any;
      return row?.count || 0;
    };

    return {
      entities: getCount('kg_entities'),
      edges: getCount('kg_edges'),
      facts: getCount('kg_facts'),
      summaries: getCount('kg_summaries'),
      costEntries: getCount('kg_cost_tracking'),
      learningRecords: getCount('kg_learning_records'),
    };
  }

  // === Cleanup ===

  cleanup(olderThanDays: number = 90): number {
    if (!this.db) return 0;

    const cutoffTime = Date.now() - olderThanDays * 86400000;
    let totalDeleted = 0;

    // Clean old cost entries
    const costStmt = this.db.prepare(`
      DELETE FROM kg_cost_tracking WHERE timestamp < ?
    `);
    const costResult = costStmt.run(cutoffTime);
    totalDeleted += costResult.changes;

    // Clean expired facts
    const factStmt = this.db.prepare(`
      DELETE FROM kg_facts WHERE valid_to IS NOT NULL AND valid_to < ?
    `);
    const factResult = factStmt.run(Date.now());
    totalDeleted += factResult.changes;

    // Clean superseded learning records
    const learningStmt = this.db.prepare(`
      DELETE FROM kg_learning_records WHERE superseded_by IS NOT NULL
    `);
    const learningResult = learningStmt.run();
    totalDeleted += learningResult.changes;

    return totalDeleted;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}
