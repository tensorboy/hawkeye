/**
 * 会话恢复与断点续传
 * Session Recovery & Checkpoint Resume
 *
 * 支持任务中断后的恢复、状态回滚、自动保存点等功能
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 任务状态
 */
export enum TaskState {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * 恢复策略
 */
export enum RecoveryStrategy {
  RETRY_LAST = 'retry_last',        // 重试最后一步
  SKIP_FAILED = 'skip_failed',      // 跳过失败步骤
  ROLLBACK = 'rollback',            // 回滚到上一个成功点
  FULL_RESTART = 'full_restart',    // 完全重新开始
}

/**
 * 执行步骤
 */
export interface ExecutionStep {
  id: string;
  name: string;
  index: number;
  state: TaskState;
  startTime?: number;
  endTime?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  retryCount: number;
  metadata: Record<string, unknown>;
}

/**
 * 任务执行上下文
 */
export interface TaskExecutionContext {
  taskId: string;
  taskName: string;
  state: TaskState;
  currentStepIndex: number;
  steps: ExecutionStep[];
  startTime: number;
  lastUpdateTime: number;
  totalRetries: number;
  context: Record<string, unknown>;
  checkpoints: string[];
}

/**
 * 保存点
 */
export interface SavePoint {
  id: string;
  taskId: string;
  timestamp: number;
  stepIndex: number;
  state: TaskExecutionContext;
  hash: string;
  description?: string;
  isAutoSave: boolean;
}

/**
 * 恢复结果
 */
export interface RecoveryResult {
  success: boolean;
  taskId: string;
  recoveredFromStep: number;
  strategy: RecoveryStrategy;
  message: string;
  restoredContext?: TaskExecutionContext;
}

/**
 * 会话恢复配置
 */
export interface SessionRecoveryConfig {
  storagePath: string;
  autoSaveEnabled: boolean;
  autoSaveInterval: number;       // ms
  maxAutoSaves: number;
  maxRetries: number;
  retryDelay: number;             // ms
  enableCrashRecovery: boolean;
  compressionEnabled: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: SessionRecoveryConfig = {
  storagePath: '~/.hawkeye/recovery',
  autoSaveEnabled: true,
  autoSaveInterval: 30000,        // 30 seconds
  maxAutoSaves: 10,
  maxRetries: 3,
  retryDelay: 1000,               // 1 second
  enableCrashRecovery: true,
  compressionEnabled: true,
};

// ============================================================================
// 会话恢复管理器
// ============================================================================

export class SessionRecoveryManager extends EventEmitter {
  private config: SessionRecoveryConfig;
  private activeTasks: Map<string, TaskExecutionContext> = new Map();
  private savePoints: Map<string, SavePoint[]> = new Map();
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();
  private recoveryLock: Set<string> = new Set();

  constructor(config?: Partial<SessionRecoveryConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeStorage();

    // 设置崩溃恢复
    if (this.config.enableCrashRecovery) {
      this.setupCrashRecovery();
    }
  }

  // ============================================================================
  // 任务生命周期管理
  // ============================================================================

  /**
   * 开始新任务
   */
  startTask(taskName: string, steps: Array<{ name: string; metadata?: Record<string, unknown> }>): TaskExecutionContext {
    const taskId = uuidv4();
    const now = Date.now();

    const context: TaskExecutionContext = {
      taskId,
      taskName,
      state: TaskState.RUNNING,
      currentStepIndex: 0,
      steps: steps.map((step, index) => ({
        id: uuidv4(),
        name: step.name,
        index,
        state: TaskState.PENDING,
        retryCount: 0,
        metadata: step.metadata ?? {},
      })),
      startTime: now,
      lastUpdateTime: now,
      totalRetries: 0,
      context: {},
      checkpoints: [],
    };

    this.activeTasks.set(taskId, context);
    this.savePoints.set(taskId, []);

    // 创建初始保存点
    this.createSavePoint(taskId, '任务开始', true);

    // 启动自动保存
    if (this.config.autoSaveEnabled) {
      this.startAutoSave(taskId);
    }

    this.emit('task:started', context);
    return context;
  }

  /**
   * 更新步骤状态
   */
  updateStep(
    taskId: string,
    stepIndex: number,
    update: Partial<Pick<ExecutionStep, 'state' | 'output' | 'error'>>
  ): void {
    const context = this.activeTasks.get(taskId);
    if (!context || stepIndex >= context.steps.length) return;

    const step = context.steps[stepIndex];
    const now = Date.now();

    if (update.state === TaskState.RUNNING && !step.startTime) {
      step.startTime = now;
    }

    if (update.state === TaskState.COMPLETED || update.state === TaskState.FAILED) {
      step.endTime = now;
    }

    Object.assign(step, update);
    context.lastUpdateTime = now;

    // 如果步骤完成，创建保存点
    if (update.state === TaskState.COMPLETED) {
      context.currentStepIndex = stepIndex + 1;
      this.createSavePoint(taskId, `步骤 ${stepIndex + 1} 完成`, true);
    }

    // 如果步骤失败，处理重试逻辑
    if (update.state === TaskState.FAILED) {
      this.handleStepFailure(taskId, stepIndex);
    }

    this.emit('step:updated', taskId, step);
  }

  /**
   * 暂停任务
   */
  pauseTask(taskId: string, reason?: string): void {
    const context = this.activeTasks.get(taskId);
    if (!context) return;

    context.state = TaskState.PAUSED;
    context.lastUpdateTime = Date.now();

    // 创建暂停保存点
    this.createSavePoint(taskId, reason ?? '用户暂停', false);

    // 停止自动保存
    this.stopAutoSave(taskId);

    this.emit('task:paused', taskId, reason);
  }

  /**
   * 恢复任务
   */
  resumeTask(taskId: string): TaskExecutionContext | null {
    const context = this.activeTasks.get(taskId);
    if (!context || context.state !== TaskState.PAUSED) return null;

    context.state = TaskState.RUNNING;
    context.lastUpdateTime = Date.now();

    // 重启自动保存
    if (this.config.autoSaveEnabled) {
      this.startAutoSave(taskId);
    }

    this.emit('task:resumed', taskId);
    return context;
  }

  /**
   * 完成任务
   */
  completeTask(taskId: string): void {
    const context = this.activeTasks.get(taskId);
    if (!context) return;

    context.state = TaskState.COMPLETED;
    context.lastUpdateTime = Date.now();

    // 创建最终保存点
    this.createSavePoint(taskId, '任务完成', false);

    // 停止自动保存
    this.stopAutoSave(taskId);

    // 清理旧的自动保存点
    this.cleanupAutoSavePoints(taskId);

    this.emit('task:completed', taskId);
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string, reason?: string): void {
    const context = this.activeTasks.get(taskId);
    if (!context) return;

    context.state = TaskState.CANCELLED;
    context.lastUpdateTime = Date.now();

    // 创建取消保存点
    this.createSavePoint(taskId, reason ?? '任务取消', false);

    // 停止自动保存
    this.stopAutoSave(taskId);

    this.emit('task:cancelled', taskId, reason);
  }

  // ============================================================================
  // 保存点管理
  // ============================================================================

  /**
   * 创建保存点
   */
  createSavePoint(taskId: string, description?: string, isAutoSave: boolean = false): SavePoint {
    const context = this.activeTasks.get(taskId);
    if (!context) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const stateJson = JSON.stringify(context);
    const hash = crypto.createHash('sha256').update(stateJson).digest('hex');

    const savePoint: SavePoint = {
      id: uuidv4(),
      taskId,
      timestamp: Date.now(),
      stepIndex: context.currentStepIndex,
      state: JSON.parse(stateJson),
      hash,
      description,
      isAutoSave,
    };

    // 添加到保存点列表
    const taskSavePoints = this.savePoints.get(taskId) ?? [];
    taskSavePoints.push(savePoint);

    // 限制自动保存点数量
    if (isAutoSave) {
      const autoSaves = taskSavePoints.filter(sp => sp.isAutoSave);
      while (autoSaves.length > this.config.maxAutoSaves) {
        const oldest = autoSaves.shift();
        if (oldest) {
          const index = taskSavePoints.findIndex(sp => sp.id === oldest.id);
          if (index !== -1) {
            taskSavePoints.splice(index, 1);
          }
        }
      }
    }

    this.savePoints.set(taskId, taskSavePoints);
    context.checkpoints.push(savePoint.id);

    // 持久化
    if (this.config.enableCrashRecovery) {
      this.persistSavePoint(savePoint);
    }

    this.emit('savepoint:created', savePoint);
    return savePoint;
  }

  /**
   * 获取保存点列表
   */
  getSavePoints(taskId: string): SavePoint[] {
    return this.savePoints.get(taskId) ?? [];
  }

  /**
   * 获取最新保存点
   */
  getLatestSavePoint(taskId: string): SavePoint | null {
    const points = this.savePoints.get(taskId);
    return points && points.length > 0 ? points[points.length - 1] : null;
  }

  /**
   * 恢复到保存点
   */
  restoreToSavePoint(savePointId: string): RecoveryResult {
    // 查找保存点
    let targetSavePoint: SavePoint | null = null;
    let taskId: string | null = null;

    for (const [tid, points] of this.savePoints) {
      const found = points.find(sp => sp.id === savePointId);
      if (found) {
        targetSavePoint = found;
        taskId = tid;
        break;
      }
    }

    if (!targetSavePoint || !taskId) {
      return {
        success: false,
        taskId: '',
        recoveredFromStep: -1,
        strategy: RecoveryStrategy.ROLLBACK,
        message: `Save point not found: ${savePointId}`,
      };
    }

    // 恢复状态
    const restoredContext = JSON.parse(JSON.stringify(targetSavePoint.state));
    restoredContext.state = TaskState.RUNNING;
    restoredContext.lastUpdateTime = Date.now();

    // 重置失败步骤的状态
    for (let i = targetSavePoint.stepIndex; i < restoredContext.steps.length; i++) {
      const step = restoredContext.steps[i];
      step.state = TaskState.PENDING;
      step.startTime = undefined;
      step.endTime = undefined;
      step.output = undefined;
      step.error = undefined;
    }

    this.activeTasks.set(taskId, restoredContext);

    // 重启自动保存
    if (this.config.autoSaveEnabled) {
      this.startAutoSave(taskId);
    }

    this.emit('savepoint:restored', savePointId, restoredContext);

    return {
      success: true,
      taskId,
      recoveredFromStep: targetSavePoint.stepIndex,
      strategy: RecoveryStrategy.ROLLBACK,
      message: `Restored to step ${targetSavePoint.stepIndex}`,
      restoredContext,
    };
  }

  // ============================================================================
  // 恢复策略
  // ============================================================================

  /**
   * 从失败中恢复
   */
  async recover(taskId: string, strategy: RecoveryStrategy = RecoveryStrategy.RETRY_LAST): Promise<RecoveryResult> {
    // 防止并发恢复
    if (this.recoveryLock.has(taskId)) {
      return {
        success: false,
        taskId,
        recoveredFromStep: -1,
        strategy,
        message: 'Recovery already in progress',
      };
    }

    this.recoveryLock.add(taskId);

    try {
      switch (strategy) {
        case RecoveryStrategy.RETRY_LAST:
          return await this.retryLastStep(taskId);

        case RecoveryStrategy.SKIP_FAILED:
          return await this.skipFailedStep(taskId);

        case RecoveryStrategy.ROLLBACK:
          return await this.rollbackToLastSuccess(taskId);

        case RecoveryStrategy.FULL_RESTART:
          return await this.fullRestart(taskId);

        default:
          return {
            success: false,
            taskId,
            recoveredFromStep: -1,
            strategy,
            message: `Unknown strategy: ${strategy}`,
          };
      }
    } finally {
      this.recoveryLock.delete(taskId);
    }
  }

  /**
   * 重试最后一步
   */
  private async retryLastStep(taskId: string): Promise<RecoveryResult> {
    const context = this.activeTasks.get(taskId);
    if (!context) {
      // 尝试从持久化存储恢复
      const restored = await this.restoreFromPersistence(taskId);
      if (!restored) {
        return {
          success: false,
          taskId,
          recoveredFromStep: -1,
          strategy: RecoveryStrategy.RETRY_LAST,
          message: 'Task not found',
        };
      }
    }

    const ctx = this.activeTasks.get(taskId)!;
    const failedStep = ctx.steps.find(s => s.state === TaskState.FAILED);

    if (!failedStep) {
      return {
        success: false,
        taskId,
        recoveredFromStep: -1,
        strategy: RecoveryStrategy.RETRY_LAST,
        message: 'No failed step found',
      };
    }

    // 检查重试次数
    if (failedStep.retryCount >= this.config.maxRetries) {
      return {
        success: false,
        taskId,
        recoveredFromStep: failedStep.index,
        strategy: RecoveryStrategy.RETRY_LAST,
        message: `Max retries (${this.config.maxRetries}) exceeded for step ${failedStep.index}`,
      };
    }

    // 重置步骤状态
    failedStep.state = TaskState.PENDING;
    failedStep.retryCount++;
    failedStep.error = undefined;
    ctx.totalRetries++;
    ctx.state = TaskState.RUNNING;

    // 等待重试延迟
    await this.delay(this.config.retryDelay);

    this.emit('recovery:retry', taskId, failedStep.index, failedStep.retryCount);

    return {
      success: true,
      taskId,
      recoveredFromStep: failedStep.index,
      strategy: RecoveryStrategy.RETRY_LAST,
      message: `Retrying step ${failedStep.index} (attempt ${failedStep.retryCount})`,
      restoredContext: ctx,
    };
  }

  /**
   * 跳过失败步骤
   */
  private async skipFailedStep(taskId: string): Promise<RecoveryResult> {
    const context = this.activeTasks.get(taskId);
    if (!context) {
      return {
        success: false,
        taskId,
        recoveredFromStep: -1,
        strategy: RecoveryStrategy.SKIP_FAILED,
        message: 'Task not found',
      };
    }

    const failedStep = context.steps.find(s => s.state === TaskState.FAILED);
    if (!failedStep) {
      return {
        success: false,
        taskId,
        recoveredFromStep: -1,
        strategy: RecoveryStrategy.SKIP_FAILED,
        message: 'No failed step found',
      };
    }

    // 标记为跳过
    failedStep.state = TaskState.COMPLETED;
    failedStep.metadata.skipped = true;
    failedStep.metadata.skipReason = 'Skipped due to failure';
    failedStep.endTime = Date.now();

    // 移动到下一步
    context.currentStepIndex = failedStep.index + 1;
    context.state = TaskState.RUNNING;

    this.emit('recovery:skipped', taskId, failedStep.index);

    return {
      success: true,
      taskId,
      recoveredFromStep: failedStep.index + 1,
      strategy: RecoveryStrategy.SKIP_FAILED,
      message: `Skipped step ${failedStep.index}, continuing from step ${failedStep.index + 1}`,
      restoredContext: context,
    };
  }

  /**
   * 回滚到上一个成功点
   */
  private async rollbackToLastSuccess(taskId: string): Promise<RecoveryResult> {
    const savePoints = this.savePoints.get(taskId);
    if (!savePoints || savePoints.length === 0) {
      return {
        success: false,
        taskId,
        recoveredFromStep: -1,
        strategy: RecoveryStrategy.ROLLBACK,
        message: 'No save points available',
      };
    }

    // 找到最后一个非自动保存的成功保存点
    const validPoints = savePoints.filter(sp => {
      const ctx = sp.state;
      const currentStep = ctx.steps[sp.stepIndex - 1];
      return !currentStep || currentStep.state === TaskState.COMPLETED;
    });

    if (validPoints.length === 0) {
      return {
        success: false,
        taskId,
        recoveredFromStep: -1,
        strategy: RecoveryStrategy.ROLLBACK,
        message: 'No valid rollback point found',
      };
    }

    const targetPoint = validPoints[validPoints.length - 1];
    return this.restoreToSavePoint(targetPoint.id);
  }

  /**
   * 完全重启
   */
  private async fullRestart(taskId: string): Promise<RecoveryResult> {
    const context = this.activeTasks.get(taskId);
    if (!context) {
      return {
        success: false,
        taskId,
        recoveredFromStep: -1,
        strategy: RecoveryStrategy.FULL_RESTART,
        message: 'Task not found',
      };
    }

    // 重置所有步骤
    for (const step of context.steps) {
      step.state = TaskState.PENDING;
      step.startTime = undefined;
      step.endTime = undefined;
      step.output = undefined;
      step.error = undefined;
      step.retryCount = 0;
    }

    context.currentStepIndex = 0;
    context.state = TaskState.RUNNING;
    context.lastUpdateTime = Date.now();
    context.totalRetries++;

    // 创建新的保存点
    this.createSavePoint(taskId, '完全重启', false);

    this.emit('recovery:restart', taskId);

    return {
      success: true,
      taskId,
      recoveredFromStep: 0,
      strategy: RecoveryStrategy.FULL_RESTART,
      message: 'Task restarted from beginning',
      restoredContext: context,
    };
  }

  // ============================================================================
  // 崩溃恢复
  // ============================================================================

  /**
   * 设置崩溃恢复处理
   */
  private setupCrashRecovery(): void {
    // 捕获未处理的异常
    process.on('uncaughtException', (error) => {
      this.handleCrash(error);
    });

    process.on('unhandledRejection', (reason) => {
      this.handleCrash(reason as Error);
    });

    // 优雅退出
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    for (const signal of signals) {
      process.on(signal, () => {
        this.handleGracefulShutdown();
      });
    }
  }

  /**
   * 处理崩溃
   */
  private handleCrash(error: Error): void {
    console.error('Crash detected, saving state...', error);

    // 为所有活动任务创建紧急保存点
    for (const [taskId] of this.activeTasks) {
      try {
        this.createSavePoint(taskId, `崩溃保存: ${error.message}`, false);
      } catch (e) {
        console.error(`Failed to save state for task ${taskId}:`, e);
      }
    }

    this.emit('crash', error);
  }

  /**
   * 优雅关闭
   */
  private handleGracefulShutdown(): void {
    console.log('Graceful shutdown, saving state...');

    // 保存所有活动任务的状态
    for (const [taskId] of this.activeTasks) {
      try {
        this.pauseTask(taskId, '优雅关闭');
      } catch (e) {
        console.error(`Failed to pause task ${taskId}:`, e);
      }
    }

    this.emit('shutdown');
  }

  /**
   * 扫描可恢复的任务
   */
  async scanRecoverableTasks(): Promise<string[]> {
    const storagePath = this.config.storagePath.replace('~', process.env.HOME || '');
    const savepointsDir = path.join(storagePath, 'savepoints');

    if (!fs.existsSync(savepointsDir)) {
      return [];
    }

    const files = fs.readdirSync(savepointsDir);
    const taskIds = new Set<string>();

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(savepointsDir, file), 'utf-8');
          const savePoint: SavePoint = JSON.parse(content);

          // 检查任务状态
          if (savePoint.state.state !== TaskState.COMPLETED &&
              savePoint.state.state !== TaskState.CANCELLED) {
            taskIds.add(savePoint.taskId);
          }
        } catch (e) {
          console.error(`Failed to parse save point ${file}:`, e);
        }
      }
    }

    return Array.from(taskIds);
  }

  /**
   * 从持久化存储恢复
   */
  async restoreFromPersistence(taskId: string): Promise<boolean> {
    const storagePath = this.config.storagePath.replace('~', process.env.HOME || '');
    const savepointsDir = path.join(storagePath, 'savepoints');

    if (!fs.existsSync(savepointsDir)) {
      return false;
    }

    // 查找该任务的所有保存点
    const files = fs.readdirSync(savepointsDir);
    const taskSavePoints: SavePoint[] = [];

    for (const file of files) {
      if (file.startsWith(taskId) && file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(savepointsDir, file), 'utf-8');
          const savePoint: SavePoint = JSON.parse(content);
          if (savePoint.taskId === taskId) {
            taskSavePoints.push(savePoint);
          }
        } catch (e) {
          console.error(`Failed to parse save point ${file}:`, e);
        }
      }
    }

    if (taskSavePoints.length === 0) {
      return false;
    }

    // 按时间排序，取最新的
    taskSavePoints.sort((a, b) => b.timestamp - a.timestamp);
    const latestSavePoint = taskSavePoints[0];

    // 恢复状态
    this.activeTasks.set(taskId, JSON.parse(JSON.stringify(latestSavePoint.state)));
    this.savePoints.set(taskId, taskSavePoints);

    this.emit('task:restored', taskId, latestSavePoint);
    return true;
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 初始化存储
   */
  private initializeStorage(): void {
    const storagePath = this.config.storagePath.replace('~', process.env.HOME || '');

    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    const savepointsDir = path.join(storagePath, 'savepoints');
    if (!fs.existsSync(savepointsDir)) {
      fs.mkdirSync(savepointsDir, { recursive: true });
    }
  }

  /**
   * 持久化保存点
   */
  private persistSavePoint(savePoint: SavePoint): void {
    const storagePath = this.config.storagePath.replace('~', process.env.HOME || '');
    const savepointsDir = path.join(storagePath, 'savepoints');
    const filePath = path.join(savepointsDir, `${savePoint.taskId}_${savePoint.id}.json`);

    let content = JSON.stringify(savePoint, null, 2);

    if (this.config.compressionEnabled) {
      content = Buffer.from(content).toString('base64');
    }

    fs.writeFileSync(filePath, content);
  }

  /**
   * 处理步骤失败
   */
  private handleStepFailure(taskId: string, stepIndex: number): void {
    const context = this.activeTasks.get(taskId);
    if (!context) return;

    // 创建失败保存点
    this.createSavePoint(taskId, `步骤 ${stepIndex + 1} 失败`, true);

    this.emit('step:failed', taskId, stepIndex);
  }

  /**
   * 启动自动保存
   */
  private startAutoSave(taskId: string): void {
    this.stopAutoSave(taskId);

    const timer = setInterval(() => {
      const context = this.activeTasks.get(taskId);
      if (context && context.state === TaskState.RUNNING) {
        this.createSavePoint(taskId, '自动保存', true);
      }
    }, this.config.autoSaveInterval);

    this.autoSaveTimers.set(taskId, timer);
  }

  /**
   * 停止自动保存
   */
  private stopAutoSave(taskId: string): void {
    const timer = this.autoSaveTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(taskId);
    }
  }

  /**
   * 清理自动保存点
   */
  private cleanupAutoSavePoints(taskId: string): void {
    const points = this.savePoints.get(taskId);
    if (!points) return;

    // 只保留手动保存点和最后几个自动保存点
    const manualPoints = points.filter(sp => !sp.isAutoSave);
    const autoPoints = points.filter(sp => sp.isAutoSave);
    const keptAutoPoints = autoPoints.slice(-3);

    this.savePoints.set(taskId, [...manualPoints, ...keptAutoPoints]);

    // 清理持久化文件
    const storagePath = this.config.storagePath.replace('~', process.env.HOME || '');
    const savepointsDir = path.join(storagePath, 'savepoints');

    const keptIds = new Set([...manualPoints, ...keptAutoPoints].map(sp => sp.id));
    const files = fs.readdirSync(savepointsDir);

    for (const file of files) {
      if (file.startsWith(taskId)) {
        const savePointId = file.replace(`${taskId}_`, '').replace('.json', '');
        if (!keptIds.has(savePointId)) {
          fs.unlinkSync(path.join(savepointsDir, file));
        }
      }
    }
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取任务上下文
   */
  getTaskContext(taskId: string): TaskExecutionContext | null {
    return this.activeTasks.get(taskId) ?? null;
  }

  /**
   * 获取所有活动任务
   */
  getActiveTasks(): TaskExecutionContext[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * 获取统计信息
   */
  getStatistics(): {
    activeTasks: number;
    totalSavePoints: number;
    autoSaveTimers: number;
    recoveringTasks: number;
  } {
    let totalSavePoints = 0;
    for (const points of this.savePoints.values()) {
      totalSavePoints += points.length;
    }

    return {
      activeTasks: this.activeTasks.size,
      totalSavePoints,
      autoSaveTimers: this.autoSaveTimers.size,
      recoveringTasks: this.recoveryLock.size,
    };
  }

  /**
   * 销毁
   */
  destroy(): void {
    // 停止所有自动保存
    for (const [taskId] of this.autoSaveTimers) {
      this.stopAutoSave(taskId);
    }

    this.activeTasks.clear();
    this.savePoints.clear();
    this.recoveryLock.clear();
    this.removeAllListeners();
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建会话恢复管理器
 */
export function createSessionRecovery(config?: Partial<SessionRecoveryConfig>): SessionRecoveryManager {
  return new SessionRecoveryManager(config);
}

/**
 * 创建并自动恢复未完成任务
 */
export async function createAndRecover(
  config?: Partial<SessionRecoveryConfig>
): Promise<{ manager: SessionRecoveryManager; recoveredTasks: string[] }> {
  const manager = new SessionRecoveryManager(config);

  // 扫描可恢复任务
  const recoverableTaskIds = await manager.scanRecoverableTasks();
  const recoveredTasks: string[] = [];

  // 尝试恢复每个任务
  for (const taskId of recoverableTaskIds) {
    const restored = await manager.restoreFromPersistence(taskId);
    if (restored) {
      recoveredTasks.push(taskId);
    }
  }

  return { manager, recoveredTasks };
}
