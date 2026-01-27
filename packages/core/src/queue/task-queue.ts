/**
 * 优先级任务队列
 * 参考 steipete/poltergeist 的智能队列模式
 *
 * 核心特性：
 * 1. 优先级排序 - 高优先级任务先执行
 * 2. 并发控制 - 限制同时执行的任务数
 * 3. 去重 - 防止相同任务重复入队
 * 4. 重试 - 失败任务自动重试（指数退避）
 * 5. 依赖管理 - 任务可依赖其他任务完成
 * 6. 超时控制 - 任务超时自动取消
 * 7. 取消支持 - 支持取消运行中的任务
 */

import { EventEmitter } from 'events';
import {
  type QueuedTask,
  type RunningTask,
  type TaskResult,
  type TaskQueueConfig,
  type TaskExecutor,
  type TaskExecutionContext,
  type TaskType,
  type TaskQueueEvents,
  TaskPriority,
  TaskStatus,
  DEFAULT_QUEUE_CONFIG,
} from './types';

let taskIdCounter = 0;

function generateTaskId(): string {
  return `task_${Date.now()}_${++taskIdCounter}`;
}

/**
 * 优先级任务队列
 */
export class TaskQueue extends EventEmitter {
  private config: TaskQueueConfig;
  private pendingQueue: QueuedTask[] = [];
  private runningTasks: Map<string, RunningTask> = new Map();
  private completedResults: Map<string, TaskResult> = new Map();
  private dedupSet: Map<string, { taskId: string; timestamp: number }> = new Map();
  private executors: Map<TaskType, TaskExecutor> = new Map();
  private isPaused = false;
  private isProcessing = false;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<TaskQueueConfig> = {}) {
    super();
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  // ============ 公开 API ============

  /**
   * 注册任务执行器
   */
  registerExecutor<T = unknown, R = unknown>(
    type: TaskType,
    executor: TaskExecutor<T, R>
  ): void {
    this.executors.set(type, executor as TaskExecutor);
  }

  /**
   * 入队任务
   * @returns 任务 ID 或 null（如果被去重）
   */
  enqueue<T = unknown>(
    type: TaskType,
    data: T,
    options: Partial<{
      priority: TaskPriority;
      dedupKey: string;
      timeout: number;
      maxRetries: number;
      dependencies: string[];
      tags: string[];
      metadata: Record<string, unknown>;
    }> = {}
  ): string | null {
    // 去重检查
    if (this.config.enableDedup && options.dedupKey) {
      const existing = this.dedupSet.get(options.dedupKey);
      if (existing && Date.now() - existing.timestamp < this.config.dedupWindow) {
        this.emit('task:deduped', { dedupKey: options.dedupKey } as any, existing.taskId);
        return null;
      }
    }

    const task: QueuedTask<T> = {
      id: generateTaskId(),
      type,
      priority: options.priority ?? TaskPriority.NORMAL,
      createdAt: Date.now(),
      dedupKey: options.dedupKey,
      data,
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.config.defaultMaxRetries,
      timeout: options.timeout ?? this.config.defaultTimeout,
      dependencies: options.dependencies,
      tags: options.tags,
      metadata: options.metadata,
    };

    // 记录去重
    if (task.dedupKey) {
      this.dedupSet.set(task.dedupKey, {
        taskId: task.id,
        timestamp: Date.now(),
      });
    }

    // 按优先级插入队列
    this.insertByPriority(task as QueuedTask);

    this.emit('task:enqueued', task);
    this.clearIdleTimer();

    // 触发处理
    this.processNext();

    return task.id;
  }

  /**
   * 取消任务
   */
  cancel(taskId: string): boolean {
    // 从等待队列中移除
    const pendingIndex = this.pendingQueue.findIndex(t => t.id === taskId);
    if (pendingIndex !== -1) {
      this.pendingQueue.splice(pendingIndex, 1);
      return true;
    }

    // 取消运行中的任务
    const running = this.runningTasks.get(taskId);
    if (running) {
      running.status = TaskStatus.CANCELLED;
      running.completedAt = Date.now();
      running.cancel?.();
      this.runningTasks.delete(taskId);
      this.emit('task:cancelled', running);
      this.processNext();
      return true;
    }

    return false;
  }

  /**
   * 暂停队列
   */
  pause(): void {
    this.isPaused = true;
    this.emit('queue:paused');
  }

  /**
   * 恢复队列
   */
  resume(): void {
    this.isPaused = false;
    this.emit('queue:resumed');
    this.processNext();
  }

  /**
   * 清空等待队列
   */
  clear(): void {
    const count = this.pendingQueue.length;
    this.pendingQueue = [];
    this.dedupSet.clear();
    if (count > 0) {
      console.log(`[TaskQueue] Cleared ${count} pending tasks`);
    }
  }

  /**
   * 获取队列状态
   */
  getStatus(): {
    pending: number;
    running: number;
    completed: number;
    paused: boolean;
    tasks: {
      pending: QueuedTask[];
      running: RunningTask[];
    };
  } {
    return {
      pending: this.pendingQueue.length,
      running: this.runningTasks.size,
      completed: this.completedResults.size,
      paused: this.isPaused,
      tasks: {
        pending: [...this.pendingQueue],
        running: [...this.runningTasks.values()],
      },
    };
  }

  /**
   * 获取任务结果
   */
  getResult(taskId: string): TaskResult | undefined {
    return this.completedResults.get(taskId);
  }

  /**
   * 等待任务完成
   */
  waitForTask(taskId: string, timeout?: number): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      // 已完成
      const existing = this.completedResults.get(taskId);
      if (existing) {
        resolve(existing);
        return;
      }

      const timer = timeout ? setTimeout(() => {
        cleanup();
        reject(new Error(`Task ${taskId} timed out`));
      }, timeout) : null;

      const onComplete = (task: RunningTask, result: TaskResult) => {
        if (task.id === taskId) {
          cleanup();
          resolve(result);
        }
      };

      const onFailed = (task: RunningTask, error: string) => {
        if (task.id === taskId) {
          cleanup();
          resolve({
            taskId,
            success: false,
            error,
            duration: Date.now() - task.startedAt,
            retries: task.retryCount,
          });
        }
      };

      const onCancelled = (task: RunningTask) => {
        if (task.id === taskId) {
          cleanup();
          reject(new Error(`Task ${taskId} was cancelled`));
        }
      };

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.off('task:completed', onComplete);
        this.off('task:failed', onFailed);
        this.off('task:cancelled', onCancelled);
      };

      this.on('task:completed', onComplete);
      this.on('task:failed', onFailed);
      this.on('task:cancelled', onCancelled);
    });
  }

  /**
   * 销毁队列
   */
  destroy(): void {
    this.clear();
    this.clearIdleTimer();

    // 取消所有运行中的任务
    for (const [, task] of this.runningTasks) {
      task.cancel?.();
    }
    this.runningTasks.clear();
    this.completedResults.clear();
    this.executors.clear();
    this.removeAllListeners();
  }

  // ============ 私有方法 ============

  /**
   * 按优先级插入队列
   */
  private insertByPriority(task: QueuedTask): void {
    if (!this.config.enablePriorityScheduling) {
      this.pendingQueue.push(task);
      return;
    }

    // 找到正确的位置插入（优先级数字越小越优先）
    const index = this.pendingQueue.findIndex(t => t.priority > task.priority);
    if (index === -1) {
      this.pendingQueue.push(task);
    } else {
      this.pendingQueue.splice(index, 0, task);
    }
  }

  /**
   * 处理下一个任务
   */
  private processNext(): void {
    if (this.isPaused || this.isProcessing) return;
    if (this.runningTasks.size >= this.config.maxConcurrent) return;
    if (this.pendingQueue.length === 0) {
      if (this.runningTasks.size === 0) {
        this.startIdleTimer();
      }
      return;
    }

    // 找到可执行的任务（满足依赖条件）
    const taskIndex = this.findNextExecutableTask();
    if (taskIndex === -1) return;

    const task = this.pendingQueue.splice(taskIndex, 1)[0];
    this.executeTask(task);
  }

  /**
   * 找到下一个可执行的任务
   */
  private findNextExecutableTask(): number {
    for (let i = 0; i < this.pendingQueue.length; i++) {
      const task = this.pendingQueue[i];

      // 检查依赖是否都已完成
      if (task.dependencies && task.dependencies.length > 0) {
        const allDepsComplete = task.dependencies.every(
          depId => this.completedResults.has(depId)
        );
        if (!allDepsComplete) continue;
      }

      return i;
    }
    return this.pendingQueue.length > 0 ? 0 : -1;
  }

  /**
   * 执行任务
   */
  private async executeTask(task: QueuedTask): Promise<void> {
    const executor = this.executors.get(task.type);
    if (!executor) {
      console.error(`[TaskQueue] No executor registered for type: ${task.type}`);
      this.handleTaskFailure(task, `No executor for type: ${task.type}`);
      return;
    }

    // 创建运行中的任务
    const abortController = new AbortController();
    const runningTask: RunningTask = {
      ...task,
      status: TaskStatus.RUNNING,
      startedAt: Date.now(),
      progress: 0,
      cancel: () => abortController.abort(),
    };

    this.runningTasks.set(task.id, runningTask);
    this.emit('task:started', runningTask);

    // 设置超时
    const timeoutId = task.timeout
      ? setTimeout(() => {
          abortController.abort();
          this.handleTaskFailure(task, `Task timed out after ${task.timeout}ms`);
        }, task.timeout)
      : null;

    // 创建执行上下文
    const context: TaskExecutionContext = {
      updateProgress: (progress: number) => {
        runningTask.progress = progress;
        this.emit('task:progress', runningTask, progress);
      },
      signal: abortController.signal,
      log: (message: string) => {
        console.log(`[TaskQueue:${task.type}:${task.id}] ${message}`);
      },
      getDependencyResult: (taskId: string) => {
        return this.completedResults.get(taskId);
      },
    };

    try {
      const result = await executor(task, context);

      if (timeoutId) clearTimeout(timeoutId);

      // 任务可能已被取消
      if (!this.runningTasks.has(task.id)) return;

      // 完成任务
      runningTask.status = TaskStatus.COMPLETED;
      runningTask.completedAt = Date.now();
      runningTask.result = result;
      runningTask.progress = 100;

      const taskResult: TaskResult = {
        taskId: task.id,
        success: true,
        data: result,
        duration: runningTask.completedAt - runningTask.startedAt,
        retries: task.retryCount,
      };

      this.runningTasks.delete(task.id);
      this.completedResults.set(task.id, taskResult);

      // 限制已完成结果数量
      if (this.completedResults.size > 1000) {
        const oldest = this.completedResults.keys().next().value;
        if (oldest) this.completedResults.delete(oldest);
      }

      this.emit('task:completed', runningTask, taskResult);
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);

      // 任务可能已被取消
      if (!this.runningTasks.has(task.id)) return;

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.handleTaskFailure(task, errorMessage);
    }

    // 继续处理
    this.processNext();
  }

  /**
   * 处理任务失败
   */
  private handleTaskFailure(task: QueuedTask, error: string): void {
    const running = this.runningTasks.get(task.id);
    if (running) {
      this.runningTasks.delete(task.id);
    }

    // 检查是否可以重试
    if (task.retryCount < task.maxRetries) {
      task.retryCount++;
      this.emit('task:retry', task, task.retryCount);

      // 指数退避重试
      const delay = Math.min(
        this.config.retryDelayBase * Math.pow(2, task.retryCount - 1),
        this.config.maxRetryDelay
      );

      setTimeout(() => {
        task.priority = Math.min(task.priority, TaskPriority.NORMAL); // 重试不低于正常优先级
        this.insertByPriority(task);
        this.processNext();
      }, delay);
    } else {
      // 最终失败
      const failedTask: RunningTask = {
        ...task,
        status: TaskStatus.FAILED,
        startedAt: running?.startedAt ?? Date.now(),
        completedAt: Date.now(),
        error,
      };

      const taskResult: TaskResult = {
        taskId: task.id,
        success: false,
        error,
        duration: failedTask.completedAt! - failedTask.startedAt,
        retries: task.retryCount,
      };

      this.completedResults.set(task.id, taskResult);
      this.emit('task:failed', failedTask, error);
      this.processNext();
    }
  }

  /**
   * 清除去重记录（过期的）
   */
  private cleanupDedup(): void {
    const now = Date.now();
    for (const [key, value] of this.dedupSet) {
      if (now - value.timestamp > this.config.dedupWindow) {
        this.dedupSet.delete(key);
      }
    }
  }

  /**
   * 空闲定时器
   */
  private startIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.cleanupDedup();
      this.emit('queue:idle');
    }, this.config.idleTimeout);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}

// ============ 工厂函数 ============

let queueInstance: TaskQueue | null = null;

export function getTaskQueue(): TaskQueue {
  if (!queueInstance) {
    queueInstance = new TaskQueue();
  }
  return queueInstance;
}

export function createTaskQueue(config?: Partial<TaskQueueConfig>): TaskQueue {
  queueInstance = new TaskQueue(config);
  return queueInstance;
}
