/**
 * SQLite Vector Store - 使用 sqlite-vec 的向量存储
 * 支持向量相似度搜索和全文搜索 (FTS5)
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type BetterSqlite3 from 'better-sqlite3';
type Database = InstanceType<typeof BetterSqlite3>;
import type { MemoryChunk, FileMetadata, EmbeddingCacheEntry, SearchResult, SearchOptions } from './types';

export interface SQLiteVecStoreConfig {
  dbPath?: string;
  dimensions: number;
  enableFTS?: boolean;
}

export class SQLiteVecStore {
  private db: Database | null = null;
  private config: SQLiteVecStoreConfig;
  private isInitialized = false;
  private vecExtensionLoaded = false;

  constructor(config: SQLiteVecStoreConfig) {
    this.config = {
      dbPath: path.join(os.homedir(), '.hawkeye', 'memory.db'),
      enableFTS: true,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Dynamic import better-sqlite3
      const BetterSqlite3 = await import('better-sqlite3');
      const Database = BetterSqlite3.default || BetterSqlite3;

      // Ensure directory exists
      const dir = path.dirname(this.config.dbPath!);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Create database connection
      this.db = new Database(this.config.dbPath!);

      // Enable WAL mode for better performance
      this.db.pragma('journal_mode = WAL');

      // Try to load sqlite-vec extension
      await this.loadVecExtension();

      // Create tables
      this.createTables();

      this.isInitialized = true;
      console.log('[VectorMemory] SQLite store initialized');
    } catch (error) {
      console.warn('[VectorMemory] SQLite initialization failed:', (error as Error).message);
      this.db = null;
      this.isInitialized = true; // Mark as initialized to prevent retries
    }
  }

  private async loadVecExtension(): Promise<void> {
    if (!this.db) return;

    try {
      const sqliteVec = await import('sqlite-vec');
      this.db.loadExtension(sqliteVec.getLoadablePath());
      this.vecExtensionLoaded = true;
      console.log('[VectorMemory] sqlite-vec extension loaded');
    } catch (error) {
      console.warn('[VectorMemory] sqlite-vec extension not available, using fallback:', (error as Error).message);
      this.vecExtensionLoaded = false;
    }
  }

  private createTables(): void {
    if (!this.db) return;

    // Meta table for configuration
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Files table for tracking source files
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        hash TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        size INTEGER NOT NULL
      );
    `);

    // Chunks table for storing text segments
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        source TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        hash TEXT NOT NULL,
        model TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding BLOB,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
      CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(hash);
    `);

    // Embedding cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        hash TEXT NOT NULL,
        embedding BLOB NOT NULL,
        dimensions INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(provider, model, hash)
      );

      CREATE INDEX IF NOT EXISTS idx_cache_lookup ON embedding_cache(provider, model, hash);
    `);

    // Create FTS5 virtual table if enabled
    if (this.config.enableFTS) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            id UNINDEXED,
            path UNINDEXED,
            source UNINDEXED,
            model UNINDEXED,
            text,
            content='chunks',
            content_rowid='rowid'
          );

          -- Triggers to keep FTS in sync
          CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
            INSERT INTO chunks_fts(rowid, id, path, source, model, text)
            VALUES (NEW.rowid, NEW.id, NEW.path, NEW.source, NEW.model, NEW.text);
          END;

          CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, id, path, source, model, text)
            VALUES ('delete', OLD.rowid, OLD.id, OLD.path, OLD.source, OLD.model, OLD.text);
          END;

          CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, id, path, source, model, text)
            VALUES ('delete', OLD.rowid, OLD.id, OLD.path, OLD.source, OLD.model, OLD.text);
            INSERT INTO chunks_fts(rowid, id, path, source, model, text)
            VALUES (NEW.rowid, NEW.id, NEW.path, NEW.source, NEW.model, NEW.text);
          END;
        `);
      } catch (error) {
        console.warn('[VectorMemory] FTS5 setup failed:', (error as Error).message);
      }
    }

    // Create vector index if sqlite-vec is available
    if (this.vecExtensionLoaded) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
            embedding float[${this.config.dimensions}]
          );
        `);
      } catch (error) {
        console.warn('[VectorMemory] Vector index creation failed:', (error as Error).message);
      }
    }
  }

  // ============ Chunk Operations ============

  saveChunk(chunk: MemoryChunk): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunks
      (id, path, source, line_start, line_end, hash, model, text, embedding, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const embeddingBlob = chunk.embedding
      ? Buffer.from(new Float32Array(chunk.embedding).buffer)
      : null;

    stmt.run(
      chunk.id,
      chunk.path,
      chunk.source,
      chunk.lineStart,
      chunk.lineEnd,
      chunk.hash,
      chunk.model,
      chunk.text,
      embeddingBlob,
      chunk.createdAt,
      chunk.updatedAt
    );

    // Update vector index if available
    if (this.vecExtensionLoaded && chunk.embedding) {
      try {
        this.db.prepare(`
          INSERT OR REPLACE INTO chunks_vec (rowid, embedding)
          SELECT rowid, ? FROM chunks WHERE id = ?
        `).run(embeddingBlob, chunk.id);
      } catch (error) {
        // Vector index update failed, continue without it
      }
    }
  }

  saveChunks(chunks: MemoryChunk[]): void {
    if (!this.db || chunks.length === 0) return;

    const insertChunk = this.db.prepare(`
      INSERT OR REPLACE INTO chunks
      (id, path, source, line_start, line_end, hash, model, text, embedding, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const chunk of chunks) {
        const embeddingBlob = chunk.embedding
          ? Buffer.from(new Float32Array(chunk.embedding).buffer)
          : null;

        insertChunk.run(
          chunk.id,
          chunk.path,
          chunk.source,
          chunk.lineStart,
          chunk.lineEnd,
          chunk.hash,
          chunk.model,
          chunk.text,
          embeddingBlob,
          chunk.createdAt,
          chunk.updatedAt
        );
      }
    });

    transaction();
  }

  getChunk(id: string): MemoryChunk | null {
    if (!this.db) return null;

    const row = this.db.prepare('SELECT * FROM chunks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    return this.rowToChunk(row);
  }

  getChunksByPath(path: string): MemoryChunk[] {
    if (!this.db) return [];

    const rows = this.db.prepare('SELECT * FROM chunks WHERE path = ?').all(path) as Array<Record<string, unknown>>;
    return rows.map(row => this.rowToChunk(row));
  }

  deleteChunksByPath(path: string): number {
    if (!this.db) return 0;

    const result = this.db.prepare('DELETE FROM chunks WHERE path = ?').run(path);
    return result.changes;
  }

  private rowToChunk(row: Record<string, unknown>): MemoryChunk {
    let embedding: number[] | undefined;
    if (row.embedding && row.embedding instanceof Buffer) {
      const floatArray = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.length / 4);
      embedding = Array.from(floatArray);
    }

    return {
      id: row.id as string,
      path: row.path as string,
      source: row.source as MemoryChunk['source'],
      lineStart: row.line_start as number,
      lineEnd: row.line_end as number,
      hash: row.hash as string,
      model: row.model as string,
      text: row.text as string,
      embedding,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  // ============ Search Operations ============

  /**
   * Vector similarity search
   */
  searchVector(queryEmbedding: number[], options: SearchOptions = {}): SearchResult[] {
    if (!this.db) return [];

    const { limit = 10, minScore = 0, source, pathPrefix } = options;
    const results: SearchResult[] = [];

    // If sqlite-vec is available, use it for fast search
    if (this.vecExtensionLoaded) {
      try {
        const queryBlob = Buffer.from(new Float32Array(queryEmbedding).buffer);

        let sql = `
          SELECT c.*, v.distance
          FROM chunks_vec v
          JOIN chunks c ON c.rowid = v.rowid
          WHERE v.embedding MATCH ?
        `;
        const params: unknown[] = [queryBlob];

        if (source) {
          sql += ' AND c.source = ?';
          params.push(source);
        }

        if (pathPrefix) {
          sql += ' AND c.path LIKE ?';
          params.push(`${pathPrefix}%`);
        }

        sql += ` ORDER BY v.distance LIMIT ?`;
        params.push(limit);

        const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown> & { distance: number }>;

        for (const row of rows) {
          // Convert distance to similarity score (1 - distance for L2)
          const score = 1 / (1 + row.distance);
          if (score >= minScore) {
            results.push({
              chunk: this.rowToChunk(row),
              score,
              source: 'vector',
            });
          }
        }

        return results;
      } catch (error) {
        console.warn('[VectorMemory] Vector search failed, using fallback:', (error as Error).message);
      }
    }

    // Fallback: brute-force search
    return this.bruteForceSearch(queryEmbedding, options);
  }

  private bruteForceSearch(queryEmbedding: number[], options: SearchOptions = {}): SearchResult[] {
    if (!this.db) return [];

    const { limit = 10, minScore = 0, source, pathPrefix } = options;

    let sql = 'SELECT * FROM chunks WHERE embedding IS NOT NULL';
    const params: unknown[] = [];

    if (source) {
      sql += ' AND source = ?';
      params.push(source);
    }

    if (pathPrefix) {
      sql += ' AND path LIKE ?';
      params.push(`${pathPrefix}%`);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    const results: Array<{ chunk: MemoryChunk; score: number }> = [];

    for (const row of rows) {
      const chunk = this.rowToChunk(row);
      if (!chunk.embedding) continue;

      const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= minScore) {
        results.push({ chunk, score });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit).map(r => ({ ...r, source: 'vector' as const }));
  }

  /**
   * Full-text search using FTS5
   */
  searchFTS(query: string, options: SearchOptions = {}): SearchResult[] {
    if (!this.db || !this.config.enableFTS) return [];

    const { limit = 10, source, pathPrefix } = options;

    try {
      let sql = `
        SELECT c.*, bm25(chunks_fts) as rank
        FROM chunks_fts f
        JOIN chunks c ON f.id = c.id
        WHERE chunks_fts MATCH ?
      `;
      const params: unknown[] = [query];

      if (source) {
        sql += ' AND c.source = ?';
        params.push(source);
      }

      if (pathPrefix) {
        sql += ' AND c.path LIKE ?';
        params.push(`${pathPrefix}%`);
      }

      sql += ' ORDER BY rank LIMIT ?';
      params.push(limit);

      const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown> & { rank: number }>;

      return rows.map(row => ({
        chunk: this.rowToChunk(row),
        // Normalize BM25 score to 0-1 range (BM25 scores are negative, closer to 0 is better)
        score: Math.max(0, 1 / (1 - row.rank)),
        source: 'fts' as const,
      }));
    } catch (error) {
      console.warn('[VectorMemory] FTS search failed:', (error as Error).message);
      return [];
    }
  }

  /**
   * Hybrid search combining vector and FTS
   */
  searchHybrid(
    query: string,
    queryEmbedding: number[],
    options: SearchOptions = {}
  ): SearchResult[] {
    const { limit = 10, vectorWeight = 0.6, ftsWeight = 0.4 } = options;

    // Get results from both searches
    const vectorResults = this.searchVector(queryEmbedding, { ...options, limit: limit * 2 });
    const ftsResults = this.searchFTS(query, { ...options, limit: limit * 2 });

    // Merge and rerank results
    const scoreMap = new Map<string, { chunk: MemoryChunk; vectorScore: number; ftsScore: number }>();

    for (const result of vectorResults) {
      scoreMap.set(result.chunk.id, {
        chunk: result.chunk,
        vectorScore: result.score,
        ftsScore: 0,
      });
    }

    for (const result of ftsResults) {
      const existing = scoreMap.get(result.chunk.id);
      if (existing) {
        existing.ftsScore = result.score;
      } else {
        scoreMap.set(result.chunk.id, {
          chunk: result.chunk,
          vectorScore: 0,
          ftsScore: result.score,
        });
      }
    }

    // Calculate combined scores
    const combined: SearchResult[] = [];
    for (const { chunk, vectorScore, ftsScore } of scoreMap.values()) {
      const score = vectorScore * vectorWeight + ftsScore * ftsWeight;
      combined.push({ chunk, score, source: 'hybrid' });
    }

    // Sort by combined score
    combined.sort((a, b) => b.score - a.score);

    return combined.slice(0, limit);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  // ============ Cache Operations ============

  getCachedEmbedding(provider: string, model: string, textHash: string): number[] | null {
    if (!this.db) return null;

    const row = this.db.prepare(`
      SELECT embedding FROM embedding_cache
      WHERE provider = ? AND model = ? AND hash = ?
    `).get(provider, model, textHash) as { embedding: Buffer } | undefined;

    if (!row) return null;

    const floatArray = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.length / 4);
    return Array.from(floatArray);
  }

  saveCachedEmbedding(entry: EmbeddingCacheEntry): void {
    if (!this.db) return;

    const embeddingBlob = Buffer.from(new Float32Array(entry.embedding).buffer);

    this.db.prepare(`
      INSERT OR REPLACE INTO embedding_cache
      (provider, model, hash, embedding, dimensions, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      entry.provider,
      entry.model,
      entry.hash,
      embeddingBlob,
      entry.dimensions,
      entry.updatedAt
    );
  }

  // ============ File Tracking ============

  getFileMetadata(path: string): FileMetadata | null {
    if (!this.db) return null;

    const row = this.db.prepare('SELECT * FROM files WHERE path = ?').get(path) as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      path: row.path as string,
      source: row.source as string,
      hash: row.hash as string,
      mtime: row.mtime as number,
      size: row.size as number,
    };
  }

  saveFileMetadata(metadata: FileMetadata): void {
    if (!this.db) return;

    this.db.prepare(`
      INSERT OR REPLACE INTO files (path, source, hash, mtime, size)
      VALUES (?, ?, ?, ?, ?)
    `).run(metadata.path, metadata.source, metadata.hash, metadata.mtime, metadata.size);
  }

  deleteFileMetadata(path: string): void {
    if (!this.db) return;

    this.db.prepare('DELETE FROM files WHERE path = ?').run(path);
  }

  // ============ Stats ============

  getStats(): { chunks: number; files: number; cache: number } {
    if (!this.db) return { chunks: 0, files: 0, cache: 0 };

    const chunks = (this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number }).count;
    const files = (this.db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number }).count;
    const cache = (this.db.prepare('SELECT COUNT(*) as count FROM embedding_cache').get() as { count: number }).count;

    return { chunks, files, cache };
  }

  // ============ Cleanup ============

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}
