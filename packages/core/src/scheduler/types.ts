/**
 * Scheduler Types
 *
 * Type definitions for CronService and HeartbeatService.
 * Inspired by nanobot's cron system.
 */

// ============================================================================
// Schedule Types
// ============================================================================

/**
 * Type of schedule
 */
export type ScheduleKind = 'cron' | 'interval' | 'once';

/**
 * Schedule configuration
 */
export interface CronSchedule {
  kind: ScheduleKind;

  /**
   * Cron expression (when kind === 'cron')
   * @example "0 9 * * 1-5" - Weekdays at 9 AM
   * @example "0 0 * * *" - Daily at midnight
   */
  cronExpr?: string;

  /**
   * Timezone for cron expression
   * @default System timezone
   * @example "Asia/Shanghai"
   */
  timezone?: string;

  /**
   * Interval in milliseconds (when kind === 'interval')
   * @example 30 * 60 * 1000 - Every 30 minutes
   */
  intervalMs?: number;

  /**
   * Unix timestamp in ms for one-time execution (when kind === 'once')
   */
  runAtMs?: number;
}

// ============================================================================
// Payload Types
// ============================================================================

/**
 * Type of task payload
 */
export type CronPayloadKind =
  | 'agent_prompt' // Send prompt to AI agent
  | 'life_tree_check' // Check Life Tree goals
  | 'behavior_analysis' // Analyze user behavior
  | 'notification' // Send notification
  | 'daily_summary' // Generate daily summary
  | 'memory_cleanup' // Clean up old memories
  | 'custom'; // Custom handler

/**
 * Notification action
 */
export interface NotificationAction {
  label: string;
  action: string;
}

/**
 * Notification payload
 */
export interface NotificationPayload {
  title: string;
  body: string;
  actions?: NotificationAction[];
}

/**
 * Task payload configuration
 */
export interface CronPayload {
  kind: CronPayloadKind;

  /**
   * Prompt to send to agent (when kind === 'agent_prompt')
   */
  prompt?: string;

  /**
   * Notification content (when kind === 'notification')
   */
  notification?: NotificationPayload;

  /**
   * Custom handler name (when kind === 'custom')
   */
  handler?: string;

  /**
   * Custom data for the handler
   */
  data?: Record<string, unknown>;
}

// ============================================================================
// Job State Types
// ============================================================================

/**
 * Job execution status
 */
export type JobStatus = 'ok' | 'error' | 'skipped' | null;

/**
 * Job state tracking
 */
export interface CronJobState {
  /**
   * Next scheduled run time in ms
   */
  nextRunAtMs: number | null;

  /**
   * Last execution time in ms
   */
  lastRunAtMs: number | null;

  /**
   * Status of last execution
   */
  lastStatus: JobStatus;

  /**
   * Error message from last execution
   */
  lastError: string | null;

  /**
   * Total number of runs
   */
  runCount: number;

  /**
   * Number of consecutive failures
   */
  consecutiveFailures: number;
}

// ============================================================================
// Job Types
// ============================================================================

/**
 * Cron job definition
 */
export interface CronJob {
  /**
   * Unique job ID
   */
  id: string;

  /**
   * Human-readable job name
   */
  name: string;

  /**
   * Job description
   */
  description?: string;

  /**
   * Whether the job is enabled
   */
  enabled: boolean;

  /**
   * Schedule configuration
   */
  schedule: CronSchedule;

  /**
   * Task payload
   */
  payload: CronPayload;

  /**
   * Current job state
   */
  state: CronJobState;

  /**
   * Maximum retry attempts
   * @default 3
   */
  maxRetries: number;

  /**
   * Delay between retries in ms
   * @default 1000
   */
  retryDelayMs: number;

  /**
   * Job timeout in ms
   * @default 60000
   */
  timeoutMs: number;

  /**
   * Delete job after successful execution (for one-time jobs)
   * @default false
   */
  deleteAfterRun: boolean;

  /**
   * Job creation timestamp
   */
  createdAt: number;

  /**
   * Last update timestamp
   */
  updatedAt: number;

  /**
   * Job tags for filtering
   */
  tags: string[];
}

/**
 * Input for creating a new job (without auto-generated fields)
 */
export type CreateJobInput = Omit<CronJob, 'id' | 'state' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

/**
 * Input for updating a job
 */
export type UpdateJobInput = Partial<Omit<CronJob, 'id' | 'createdAt'>>;

// ============================================================================
// Service Configuration
// ============================================================================

/**
 * CronService configuration
 */
export interface CronServiceConfig {
  /**
   * Whether the service is enabled
   * @default true
   */
  enabled: boolean;

  /**
   * SQLite database path
   * @default ~/.hawkeye/hawkeye.db
   */
  dbPath: string;

  /**
   * Interval to check for due jobs in ms
   * @default 10000 (10 seconds)
   */
  checkIntervalMs: number;

  /**
   * Maximum concurrent job executions
   * @default 3
   */
  maxConcurrentJobs: number;

  /**
   * Default job timeout in ms
   * @default 60000 (1 minute)
   */
  defaultTimeoutMs: number;

  /**
   * Default max retries
   * @default 3
   */
  defaultMaxRetries: number;

  /**
   * Default retry delay in ms
   * @default 1000
   */
  defaultRetryDelayMs: number;
}

/**
 * Default CronService configuration
 */
export const DEFAULT_CRON_SERVICE_CONFIG: CronServiceConfig = {
  enabled: true,
  dbPath: '',
  checkIntervalMs: 10_000,
  maxConcurrentJobs: 3,
  defaultTimeoutMs: 60_000,
  defaultMaxRetries: 3,
  defaultRetryDelayMs: 1000,
};

// ============================================================================
// Heartbeat Types
// ============================================================================

/**
 * HeartbeatService configuration
 */
export interface HeartbeatConfig {
  /**
   * Whether the service is enabled
   * @default true
   */
  enabled: boolean;

  /**
   * Heartbeat interval in ms
   * @default 1800000 (30 minutes)
   */
  intervalMs: number;

  /**
   * Only run heartbeat when user is idle
   * @default false
   */
  idleOnly: boolean;

  /**
   * Idle threshold in ms (how long without activity = idle)
   * @default 300000 (5 minutes)
   */
  idleThresholdMs: number;

  /**
   * Check Life Tree goals
   * @default true
   */
  checkLifeTree: boolean;

  /**
   * Check HEARTBEAT.md file
   * @default true
   */
  checkHeartbeatFile: boolean;

  /**
   * Path to HEARTBEAT.md file
   * @default ~/.hawkeye/HEARTBEAT.md
   */
  heartbeatFilePath: string;
}

/**
 * Default HeartbeatService configuration
 */
export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  enabled: true,
  intervalMs: 30 * 60 * 1000, // 30 minutes
  idleOnly: false,
  idleThresholdMs: 5 * 60 * 1000, // 5 minutes
  checkLifeTree: true,
  checkHeartbeatFile: true,
  heartbeatFilePath: '',
};

/**
 * Result of a heartbeat check
 */
export interface HeartbeatResult {
  /**
   * Timestamp of the heartbeat
   */
  timestamp: number;

  /**
   * Whether any tasks were found
   */
  hadTasks: boolean;

  /**
   * Number of tasks found
   */
  tasksFound: number;

  /**
   * Tasks descriptions
   */
  tasks: string[];

  /**
   * Agent response (if tasks were processed)
   */
  response?: string;

  /**
   * Whether the heartbeat was skipped
   */
  skipped?: boolean;

  /**
   * Reason for skipping
   */
  skipReason?: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * CronService events
 */
export interface CronServiceEvents {
  'job:scheduled': (job: CronJob) => void;
  'job:started': (job: CronJob) => void;
  'job:completed': (job: CronJob, result: unknown) => void;
  'job:failed': (job: CronJob, error: Error) => void;
  'job:skipped': (job: CronJob, reason: string) => void;
  'job:removed': (jobId: string) => void;
  'service:started': () => void;
  'service:stopped': () => void;
  'service:error': (error: Error) => void;
}

/**
 * HeartbeatService events
 */
export interface HeartbeatServiceEvents {
  'heartbeat:started': () => void;
  'heartbeat:completed': (result: HeartbeatResult) => void;
  'heartbeat:skipped': (reason: string) => void;
  'heartbeat:error': (error: Error) => void;
  'service:started': () => void;
  'service:stopped': () => void;
}

// ============================================================================
// Handler Types
// ============================================================================

/**
 * Job handler function
 */
export type JobHandler = (job: CronJob) => Promise<unknown>;

/**
 * Execution context for handlers
 */
export interface JobExecutionContext {
  job: CronJob;
  attempt: number;
  startedAt: number;
  signal: AbortSignal;
}

// ============================================================================
// Life Tree Types (used by Heartbeat and Builtin Handlers)
// ============================================================================

/**
 * Life Tree goal status
 */
export type LifeTreeGoalStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Life Tree goal (simplified for scheduler use)
 */
export interface LifeTreeGoal {
  id: string;
  name: string;
  status: LifeTreeGoalStatus;
  dueDate?: number;
  lastActivity?: number;
}
