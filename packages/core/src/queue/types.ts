/**
 * 优先级任务队列类型定义
 * 参考 steipete/poltergeist 的智能队列模式
 */

import type { ExecutionPlan, PlanStep, ActionType } from '../ai/types';

// ============ 任务类型 ============

/**
 * 任务优先级
 */
export enum TaskPriority {
  /** 关键 - 立即执行 */
  CRITICAL = 0,
  /** 高 - 优先执行 */
  HIGH = 1,
  /** 正常 - 默认优先级 */
  NORMAL = 2,
  /** 低 - 空闲时执行 */
  LOW = 3,
  /** 后台 - 最低优先级 */
  BACKGROUND = 4,
}

/**
 * 任务状态
 */
export enum TaskStatus {
  /** 等待中 */
  PENDING = 'pending',
  /** 运行中 */
  RUNNING = 'running',
  /** 已完成 */
  COMPLETED = 'completed',
  /** 失败 */
  FAILED = 'failed',
  /** 已取消 */
  CANCELLED = 'cancelled',
  /** 已重试 */
  RETRYING = 'retrying',
}

/**
 * 任务类型
 */
export type TaskType =
  | 'plan_execution'    // 计划执行
  | 'step_execution'    // 步骤执行
  | 'perception'        // 感知任务
  | 'ai_request'        // AI 请求
  | 'file_operation'    // 文件操作
  | 'browser_action'    // 浏览器动作
  | 'system_action'     // 系统动作
  | 'sync'              // 同步任务
  | 'maintenance';      // 维护任务

/**
 * 排队任务
 */
export interface QueuedTask<T = unknown> {
  /** 任务 ID */
  id: string;
  /** 任务类型 */
  type: TaskType;
  /** 优先级 */
  priority: TaskPriority;
  /** 创建时间 */
  createdAt: number;
  /** 去重键 (用于防止重复任务) */
  dedupKey?: string;
  /** 任务数据 */
  data: T;
  /** 重试次数 */
  retryCount: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 超时时间 (ms) */
  timeout?: number;
  /** 依赖任务 ID 列表 */
  dependencies?: string[];
  /** 任务标签 (用于分组) */
  tags?: string[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 运行中的任务
 */
export interface RunningTask<T = unknown> extends QueuedTask<T> {
  /** 状态 */
  status: TaskStatus;
  /** 开始时间 */
  startedAt: number;
  /** 完成时间 */
  completedAt?: number;
  /** 进度 (0-100) */
  progress?: number;
  /** 结果 */
  result?: unknown;
  /** 错误 */
  error?: string;
  /** 取消函数 */
  cancel?: () => void;
}

/**
 * 任务结果
 */
export interface TaskResult<T = unknown> {
  /** 任务 ID */
  taskId: string;
  /** 是否成功 */
  success: boolean;
  /** 结果数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
  /** 耗时 (ms) */
  duration: number;
  /** 重试次数 */
  retries: number;
}

// ============ 队列配置 ============

/**
 * 任务队列配置
 */
export interface TaskQueueConfig {
  /** 最大并发任务数 */
  maxConcurrent: number;
  /** 默认任务超时 (ms) */
  defaultTimeout: number;
  /** 默认最大重试次数 */
  defaultMaxRetries: number;
  /** 重试延迟基数 (ms) - 用于指数退避 */
  retryDelayBase: number;
  /** 最大重试延迟 (ms) */
  maxRetryDelay: number;
  /** 是否启用去重 */
  enableDedup: boolean;
  /** 去重窗口时间 (ms) */
  dedupWindow: number;
  /** 是否启用优先级调度 */
  enablePriorityScheduling: boolean;
  /** 是否启用任务持久化 */
  enablePersistence: boolean;
  /** 持久化路径 */
  persistencePath?: string;
  /** 空闲超时 (ms) - 队列空闲后的清理延迟 */
  idleTimeout: number;
}

/**
 * 默认队列配置
 */
export const DEFAULT_QUEUE_CONFIG: TaskQueueConfig = {
  maxConcurrent: 3,
  defaultTimeout: 60000,        // 1 分钟
  defaultMaxRetries: 3,
  retryDelayBase: 1000,         // 1 秒
  maxRetryDelay: 30000,         // 30 秒
  enableDedup: true,
  dedupWindow: 5000,            // 5 秒
  enablePriorityScheduling: true,
  enablePersistence: false,
  idleTimeout: 30000,           // 30 秒
};

// ============ 事件类型 ============

/**
 * 队列事件
 */
export interface TaskQueueEvents {
  /** 任务入队 */
  'task:enqueued': (task: QueuedTask) => void;
  /** 任务开始 */
  'task:started': (task: RunningTask) => void;
  /** 任务进度 */
  'task:progress': (task: RunningTask, progress: number) => void;
  /** 任务完成 */
  'task:completed': (task: RunningTask, result: TaskResult) => void;
  /** 任务失败 */
  'task:failed': (task: RunningTask, error: string) => void;
  /** 任务重试 */
  'task:retry': (task: QueuedTask, attempt: number) => void;
  /** 任务取消 */
  'task:cancelled': (task: RunningTask) => void;
  /** 任务去重 */
  'task:deduped': (task: QueuedTask, existingTaskId: string) => void;
  /** 队列空闲 */
  'queue:idle': () => void;
  /** 队列繁忙 */
  'queue:busy': () => void;
  /** 队列暂停 */
  'queue:paused': () => void;
  /** 队列恢复 */
  'queue:resumed': () => void;
}

// ============ 任务执行器类型 ============

/**
 * 任务执行器函数类型
 */
export type TaskExecutor<T = unknown, R = unknown> = (
  task: QueuedTask<T>,
  context: TaskExecutionContext
) => Promise<R>;

/**
 * 任务执行上下文
 */
export interface TaskExecutionContext {
  /** 更新进度 */
  updateProgress: (progress: number) => void;
  /** 获取取消信号 */
  signal: AbortSignal;
  /** 日志函数 */
  log: (message: string) => void;
  /** 获取依赖任务结果 */
  getDependencyResult: (taskId: string) => TaskResult | undefined;
}

// ============ 特定任务数据类型 ============

/**
 * 计划执行任务数据
 */
export interface PlanExecutionTaskData {
  plan: ExecutionPlan;
  startFromStep?: number;
  autoRollback?: boolean;
}

/**
 * 步骤执行任务数据
 */
export interface StepExecutionTaskData {
  planId: string;
  step: PlanStep;
  stepIndex: number;
}

/**
 * AI 请求任务数据
 */
export interface AIRequestTaskData {
  messages: Array<{ role: string; content: string }>;
  images?: string[];
  provider?: string;
}

/**
 * 感知任务数据
 */
export interface PerceptionTaskData {
  includeScreenshot?: boolean;
  includeClipboard?: boolean;
  includeWindow?: boolean;
  includeOCR?: boolean;
}
