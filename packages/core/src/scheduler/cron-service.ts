/**
 * CronService
 *
 * A TypeScript implementation of scheduled task execution service.
 * Inspired by nanobot's cron system.
 *
 * Features:
 * - Cron expressions (e.g., "0 9 * * 1-5")
 * - Fixed intervals (e.g., every 30 minutes)
 * - One-time tasks (at specific time)
 * - SQLite persistence
 * - Retry with exponential backoff
 * - Concurrent job execution control
 */

import { EventEmitter } from 'events';
import type BetterSqlite3 from 'better-sqlite3';
type Database = InstanceType<typeof BetterSqlite3>;
import { loguru } from '../debug';
import type {
  CronJob,
  CronJobState,
  CronSchedule,
  CronServiceConfig,
  CronServiceEvents,
  CreateJobInput,
  UpdateJobInput,
  JobHandler,
} from './types';
import { DEFAULT_CRON_SERVICE_CONFIG } from './types';
import { computeNextRunTime, generateJobId, formatTimestamp } from './cron-utils';

const logger = loguru.scope('CronService');

/**
 * CronService - Scheduled task execution service
 */
export class CronService extends EventEmitter {
  private config: CronServiceConfig;
  private db: Database | null = null;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private jobHandlers: Map<string, JobHandler> = new Map();
  private runningJobs: Set<string> = new Set();
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config: Partial<CronServiceConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CRON_SERVICE_CONFIG, ...config };
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Start the cron service
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('CronService is already running');
      return;
    }

    logger.info('Starting CronService...');

    try {
      // Initialize database
      await this.initDatabase();

      // Recompute next run times for all enabled jobs
      this.recomputeAllNextRuns();

      // Start the timer loop
      this.running = true;
      this.scheduleNextTick();

      this.emit('service:started');
      logger.info('CronService started successfully');
    } catch (error) {
      logger.error('Failed to start CronService:', error);
      this.emit('service:error', error as Error);
      throw error;
    }
  }

  /**
   * Stop the cron service
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info('Stopping CronService...');
    this.running = false;

    // Clear timer
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }

    // Cancel all running jobs
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();

    // Wait for running jobs to finish (with timeout)
    const timeout = 5000;
    const start = Date.now();
    while (this.runningJobs.size > 0 && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Close database
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.emit('service:stopped');
    this.removeAllListeners();
    logger.info('CronService stopped');
  }

  // ============================================================================
  // Job Management
  // ============================================================================

  /**
   * Add a new job
   */
  addJob(input: CreateJobInput): CronJob {
    const now = Date.now();

    const job: CronJob = {
      id: input.id || generateJobId(),
      name: input.name,
      description: input.description,
      enabled: input.enabled ?? true,
      schedule: input.schedule,
      payload: input.payload,
      state: {
        nextRunAtMs: null,
        lastRunAtMs: null,
        lastStatus: null,
        lastError: null,
        runCount: 0,
        consecutiveFailures: 0,
      },
      maxRetries: input.maxRetries ?? this.config.defaultMaxRetries,
      retryDelayMs: input.retryDelayMs ?? this.config.defaultRetryDelayMs,
      timeoutMs: input.timeoutMs ?? this.config.defaultTimeoutMs,
      deleteAfterRun: input.deleteAfterRun ?? false,
      createdAt: now,
      updatedAt: now,
      tags: input.tags ?? [],
    };

    // Compute next run time
    if (job.enabled) {
      job.state.nextRunAtMs = computeNextRunTime(job.schedule);
    }

    // Save to database
    this.saveJob(job);

    // Reschedule timer if needed
    if (this.running && job.enabled && job.state.nextRunAtMs) {
      this.scheduleNextTick();
    }

    this.emit('job:scheduled', job);
    logger.info(`Job added: ${job.name} (${job.id}), next run: ${job.state.nextRunAtMs ? formatTimestamp(job.state.nextRunAtMs) : 'never'}`);

    return job;
  }

  /**
   * Update an existing job
   */
  updateJob(id: string, updates: UpdateJobInput): CronJob | null {
    const job = this.getJob(id);
    if (!job) {
      logger.warn(`Job not found: ${id}`);
      return null;
    }

    // Apply updates
    const updatedJob: CronJob = {
      ...job,
      ...updates,
      updatedAt: Date.now(),
    };

    // Recompute next run if schedule or enabled changed
    if (updates.schedule !== undefined || updates.enabled !== undefined) {
      if (updatedJob.enabled) {
        updatedJob.state.nextRunAtMs = computeNextRunTime(updatedJob.schedule);
      } else {
        updatedJob.state.nextRunAtMs = null;
      }
    }

    // Save to database
    this.saveJob(updatedJob);

    // Reschedule timer
    if (this.running) {
      this.scheduleNextTick();
    }

    logger.info(`Job updated: ${updatedJob.name} (${id})`);
    return updatedJob;
  }

  /**
   * Remove a job
   */
  removeJob(id: string): boolean {
    if (!this.db) {
      return false;
    }

    const stmt = this.db.prepare('DELETE FROM cron_jobs WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes > 0) {
      // Cancel if running
      const controller = this.abortControllers.get(id);
      if (controller) {
        controller.abort();
        this.abortControllers.delete(id);
      }

      this.emit('job:removed', id);
      logger.info(`Job removed: ${id}`);
      return true;
    }

    return false;
  }

  /**
   * Enable or disable a job
   */
  enableJob(id: string, enabled = true): CronJob | null {
    return this.updateJob(id, { enabled });
  }

  // ============================================================================
  // Job Queries
  // ============================================================================

  /**
   * Get a job by ID
   */
  getJob(id: string): CronJob | null {
    if (!this.db) {
      return null;
    }

    const stmt = this.db.prepare('SELECT * FROM cron_jobs WHERE id = ?');
    const row = stmt.get(id) as CronJobRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToJob(row);
  }

  /**
   * List all jobs
   */
  listJobs(options?: { enabled?: boolean; tags?: string[] }): CronJob[] {
    if (!this.db) {
      return [];
    }

    let sql = 'SELECT * FROM cron_jobs';
    const params: unknown[] = [];

    if (options?.enabled !== undefined) {
      sql += ' WHERE enabled = ?';
      params.push(options.enabled ? 1 : 0);
    }

    sql += ' ORDER BY json_extract(state, "$.nextRunAtMs") ASC NULLS LAST';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as CronJobRow[];

    let jobs = rows.map((row) => this.rowToJob(row));

    // Filter by tags if specified
    if (options?.tags && options.tags.length > 0) {
      jobs = jobs.filter((job) => options.tags!.some((tag) => job.tags.includes(tag)));
    }

    return jobs;
  }

  /**
   * Get next jobs to run
   */
  getNextJobs(limit = 10): CronJob[] {
    if (!this.db) {
      return [];
    }

    const stmt = this.db.prepare(`
      SELECT * FROM cron_jobs
      WHERE enabled = 1
        AND json_extract(state, '$.nextRunAtMs') IS NOT NULL
      ORDER BY json_extract(state, '$.nextRunAtMs') ASC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as CronJobRow[];
    return rows.map((row) => this.rowToJob(row));
  }

  // ============================================================================
  // Manual Execution
  // ============================================================================

  /**
   * Manually run a job
   */
  async runJob(id: string, force = false): Promise<unknown> {
    const job = this.getJob(id);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }

    if (!force && !job.enabled) {
      throw new Error(`Job is disabled: ${id}`);
    }

    if (this.runningJobs.has(id)) {
      throw new Error(`Job is already running: ${id}`);
    }

    return this.executeJob(job);
  }

  // ============================================================================
  // Handler Registration
  // ============================================================================

  /**
   * Register a custom job handler
   */
  registerHandler(name: string, handler: JobHandler): void {
    this.jobHandlers.set(name, handler);
    logger.debug(`Handler registered: ${name}`);
  }

  /**
   * Unregister a job handler
   */
  unregisterHandler(name: string): void {
    this.jobHandlers.delete(name);
    logger.debug(`Handler unregistered: ${name}`);
  }

  // ============================================================================
  // Status
  // ============================================================================

  /**
   * Get service status
   */
  getStatus(): {
    running: boolean;
    totalJobs: number;
    enabledJobs: number;
    activeJobs: number;
    nextWakeAt: number | null;
  } {
    const jobs = this.listJobs();
    const enabledJobs = jobs.filter((j) => j.enabled);
    const nextJob = enabledJobs.find((j) => j.state.nextRunAtMs !== null);

    return {
      running: this.running,
      totalJobs: jobs.length,
      enabledJobs: enabledJobs.length,
      activeJobs: this.runningJobs.size,
      nextWakeAt: nextJob?.state.nextRunAtMs ?? null,
    };
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Initialize SQLite database
   */
  private async initDatabase(): Promise<void> {
    if (!this.config.dbPath) {
      throw new Error('Database path not configured');
    }

    // Dynamic import of better-sqlite3
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    this.db = new BetterSqlite3(this.config.dbPath);

    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');

    // Create table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        schedule TEXT NOT NULL,
        payload TEXT NOT NULL,
        state TEXT NOT NULL,
        max_retries INTEGER NOT NULL DEFAULT 3,
        retry_delay_ms INTEGER NOT NULL DEFAULT 1000,
        timeout_ms INTEGER NOT NULL DEFAULT 60000,
        delete_after_run INTEGER NOT NULL DEFAULT 0,
        tags TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled ON cron_jobs(enabled);
    `);

    logger.debug('Database initialized');
  }

  /**
   * Save a job to the database
   */
  private saveJob(job: CronJob): void {
    if (!this.db) {
      return;
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cron_jobs (
        id, name, description, enabled, schedule, payload, state,
        max_retries, retry_delay_ms, timeout_ms, delete_after_run,
        tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      job.id,
      job.name,
      job.description ?? null,
      job.enabled ? 1 : 0,
      JSON.stringify(job.schedule),
      JSON.stringify(job.payload),
      JSON.stringify(job.state),
      job.maxRetries,
      job.retryDelayMs,
      job.timeoutMs,
      job.deleteAfterRun ? 1 : 0,
      JSON.stringify(job.tags),
      job.createdAt,
      job.updatedAt
    );
  }

  /**
   * Convert database row to CronJob
   */
  private rowToJob(row: CronJobRow): CronJob {
    try {
      return {
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        enabled: row.enabled === 1,
        schedule: JSON.parse(row.schedule) as CronSchedule,
        payload: JSON.parse(row.payload),
        state: JSON.parse(row.state) as CronJobState,
        maxRetries: row.max_retries,
        retryDelayMs: row.retry_delay_ms,
        timeoutMs: row.timeout_ms,
        deleteAfterRun: row.delete_after_run === 1,
        tags: this.safeJsonParse(row.tags, []),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error(`Failed to parse job row ${row.id}:`, error);
      // Return a disabled job with safe defaults
      return {
        id: row.id,
        name: row.name || 'corrupted_job',
        description: 'Job data corrupted',
        enabled: false,
        schedule: { kind: 'once' },
        payload: { kind: 'custom' },
        state: {
          nextRunAtMs: null,
          lastRunAtMs: null,
          lastStatus: 'error',
          lastError: 'Job data corrupted',
          runCount: 0,
          consecutiveFailures: 0,
        },
        maxRetries: 0,
        retryDelayMs: 1000,
        timeoutMs: 60000,
        deleteAfterRun: false,
        tags: [],
        createdAt: row.created_at || Date.now(),
        updatedAt: row.updated_at || Date.now(),
      };
    }
  }

  /**
   * Safe JSON parse with fallback
   */
  private safeJsonParse<T>(json: string | null, fallback: T): T {
    if (!json) return fallback;
    try {
      return JSON.parse(json);
    } catch {
      return fallback;
    }
  }

  /**
   * Recompute next run times for all enabled jobs
   */
  private recomputeAllNextRuns(): void {
    const jobs = this.listJobs({ enabled: true });

    for (const job of jobs) {
      const nextRun = computeNextRunTime(job.schedule);
      if (nextRun !== job.state.nextRunAtMs) {
        job.state.nextRunAtMs = nextRun;
        this.saveJob(job);
      }
    }
  }

  /**
   * Schedule the next timer tick
   */
  private scheduleNextTick(): void {
    if (!this.running) {
      return;
    }

    // Clear existing timer
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
    }

    // Find next job to run
    const nextJobs = this.getNextJobs(1);
    const nextJob = nextJobs[0];

    let delay = this.config.checkIntervalMs;

    if (nextJob?.state.nextRunAtMs) {
      const timeUntilNext = nextJob.state.nextRunAtMs - Date.now();
      // Use the sooner of: next job time or check interval
      delay = Math.max(100, Math.min(delay, timeUntilNext));
    }

    this.timerHandle = setTimeout(() => this.tick(), delay);
  }

  /**
   * Timer tick - check and execute due jobs
   */
  private async tick(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      const now = Date.now();

      // Find due jobs
      const jobs = this.listJobs({ enabled: true });
      const dueJobs = jobs.filter((job) => job.state.nextRunAtMs && job.state.nextRunAtMs <= now && !this.runningJobs.has(job.id));

      // Check concurrent limit
      const availableSlots = this.config.maxConcurrentJobs - this.runningJobs.size;
      const jobsToRun = dueJobs.slice(0, Math.max(0, availableSlots));

      // Execute due jobs
      for (const job of jobsToRun) {
        // Don't await - run in background
        this.executeJob(job).catch((error) => {
          logger.error(`Error executing job ${job.id}:`, error);
        });
      }
    } catch (error) {
      logger.error('Error in tick:', error);
      this.emit('service:error', error as Error);
    } finally {
      // Schedule next tick
      this.scheduleNextTick();
    }
  }

  /**
   * Execute a single job
   */
  private async executeJob(job: CronJob): Promise<unknown> {
    if (this.runningJobs.has(job.id)) {
      logger.warn(`Job ${job.id} is already running`);
      return;
    }

    const startTime = Date.now();
    this.runningJobs.add(job.id);

    // Create abort controller for timeout
    const abortController = new AbortController();
    this.abortControllers.set(job.id, abortController);

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, job.timeoutMs);

    this.emit('job:started', job);
    logger.info(`Executing job: ${job.name} (${job.id})`);

    let result: unknown;
    let success = false;

    try {
      // Get handler
      const handler = this.getHandler(job);
      if (!handler) {
        throw new Error(`No handler found for job: ${job.payload.kind}`);
      }

      // Execute with retries
      result = await this.executeWithRetry(job, handler, abortController.signal);
      success = true;

      // Update state
      job.state.lastStatus = 'ok';
      job.state.lastError = null;
      job.state.consecutiveFailures = 0;
      job.state.runCount++;
      job.state.lastRunAtMs = startTime;

      this.emit('job:completed', job, result);
      logger.info(`Job completed: ${job.name} (${job.id})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      job.state.lastStatus = 'error';
      job.state.lastError = errorMessage;
      job.state.consecutiveFailures++;
      job.state.runCount++;
      job.state.lastRunAtMs = startTime;

      this.emit('job:failed', job, error as Error);
      logger.error(`Job failed: ${job.name} (${job.id}):`, errorMessage);
    } finally {
      clearTimeout(timeoutHandle);
      this.abortControllers.delete(job.id);
      this.runningJobs.delete(job.id);

      // Handle post-execution
      if (job.schedule.kind === 'once') {
        if (success && job.deleteAfterRun) {
          this.removeJob(job.id);
        } else {
          job.enabled = false;
          job.state.nextRunAtMs = null;
        }
      } else {
        // Compute next run time
        job.state.nextRunAtMs = computeNextRunTime(job.schedule);
      }

      job.updatedAt = Date.now();
      this.saveJob(job);
    }

    return result;
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry(job: CronJob, handler: JobHandler, signal: AbortSignal): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= job.maxRetries; attempt++) {
      if (signal.aborted) {
        throw new Error('Job execution aborted');
      }

      try {
        return await handler(job);
      } catch (error) {
        lastError = error as Error;

        if (attempt < job.maxRetries) {
          // Wait before retry with exponential backoff
          const delay = job.retryDelayMs * Math.pow(2, attempt);
          logger.warn(`Job ${job.id} attempt ${attempt + 1} failed, retrying in ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Get handler for a job
   */
  private getHandler(job: CronJob): JobHandler | null {
    const { kind, handler } = job.payload;

    // Check for custom handler
    if (kind === 'custom' && handler) {
      return this.jobHandlers.get(handler) ?? null;
    }

    // Check for built-in handler
    return this.jobHandlers.get(kind) ?? null;
  }
}

// ============================================================================
// Types
// ============================================================================

interface CronJobRow {
  id: string;
  name: string;
  description: string | null;
  enabled: number;
  schedule: string;
  payload: string;
  state: string;
  max_retries: number;
  retry_delay_ms: number;
  timeout_ms: number;
  delete_after_run: number;
  tags: string | null;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a CronService instance
 */
export function createCronService(config?: Partial<CronServiceConfig>): CronService {
  return new CronService(config);
}
