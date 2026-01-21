/**
 * Plan Executor - 执行 ExecutionPlan
 * 支持步骤执行、回滚、暂停/恢复
 */

import { EventEmitter } from 'events';
import type {
  ExecutionPlan,
  PlanStep,
  ActionType,
} from '../ai/types';
import { ShellExecutor } from './shell';
import { FileExecutor } from './file';
import { AutomationExecutor } from './automation';
import type { ExecutionResult } from '../types';

export interface PlanExecutorConfig {
  /** 是否自动继续下一步 */
  autoAdvance: boolean;
  /** 步骤间延迟 (ms) */
  stepDelay: number;
  /** 失败时是否自动回滚 */
  autoRollbackOnFailure: boolean;
  /** 是否在高风险步骤前暂停 */
  pauseOnHighRisk: boolean;
}

export type PlanExecutionStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rolling_back';

export interface StepExecutionResult {
  step: PlanStep;
  result: ExecutionResult;
  startedAt: number;
  completedAt: number;
}

export interface PlanExecution {
  planId: string;
  plan: ExecutionPlan;
  status: PlanExecutionStatus;
  currentStepIndex: number;
  stepResults: StepExecutionResult[];
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export class PlanExecutor extends EventEmitter {
  private config: PlanExecutorConfig;
  private shell: ShellExecutor;
  private file: FileExecutor;
  private automation: AutomationExecutor;

  private executions: Map<string, PlanExecution> = new Map();
  private pausedExecutions: Set<string> = new Set();

  constructor(config: Partial<PlanExecutorConfig> = {}) {
    super();
    this.config = {
      autoAdvance: true,
      stepDelay: 500,
      autoRollbackOnFailure: true,
      pauseOnHighRisk: true,
      ...config,
    };

    this.shell = new ShellExecutor({
      timeout: 60000,
      blockedCommands: [
        /rm\s+-rf\s+\//, // 禁止删除根目录
        /sudo\s+rm/,     // 禁止 sudo rm
        /mkfs/,          // 禁止格式化
        /dd\s+if=/,      // 禁止 dd
      ],
    });
    this.file = new FileExecutor();
    this.automation = new AutomationExecutor();
  }

  /**
   * 执行计划
   */
  async execute(plan: ExecutionPlan): Promise<PlanExecution> {
    const execution: PlanExecution = {
      planId: plan.id,
      plan,
      status: 'pending',
      currentStepIndex: 0,
      stepResults: [],
      startedAt: Date.now(),
    };

    this.executions.set(plan.id, execution);
    this.emit('execution:started', execution);

    execution.status = 'running';

    try {
      for (let i = 0; i < plan.steps.length; i++) {
        execution.currentStepIndex = i;
        const step = plan.steps[i];

        // 检查是否暂停
        if (this.pausedExecutions.has(plan.id)) {
          execution.status = 'paused';
          this.emit('execution:paused', execution);
          return execution;
        }

        // 高风险步骤暂停
        if (this.config.pauseOnHighRisk && step.riskLevel === 'high') {
          execution.status = 'paused';
          this.emit('execution:paused', { execution, reason: 'high_risk_step', step });
          return execution;
        }

        this.emit('step:started', { execution, step, index: i });

        // 执行步骤
        const stepResult = await this.executeStep(step);

        execution.stepResults.push({
          step,
          result: stepResult,
          startedAt: Date.now() - stepResult.duration,
          completedAt: Date.now(),
        });

        this.emit('step:completed', { execution, step, result: stepResult, index: i });

        // 步骤失败处理
        if (!stepResult.success) {
          execution.status = 'failed';
          execution.error = stepResult.error;

          if (this.config.autoRollbackOnFailure) {
            await this.rollback(execution);
          }

          this.emit('execution:failed', { execution, step, error: stepResult.error });
          break;
        }

        // 步骤间延迟
        if (this.config.stepDelay > 0 && i < plan.steps.length - 1) {
          await this.delay(this.config.stepDelay);
        }
      }

      if (execution.status === 'running') {
        execution.status = 'completed';
        this.emit('execution:completed', execution);
      }
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      this.emit('execution:failed', { execution, error: execution.error });
    }

    execution.completedAt = Date.now();
    return execution;
  }

  /**
   * 暂停执行
   */
  pause(planId: string): boolean {
    const execution = this.executions.get(planId);
    if (!execution || execution.status !== 'running') {
      return false;
    }

    this.pausedExecutions.add(planId);
    return true;
  }

  /**
   * 恢复执行
   */
  async resume(planId: string): Promise<PlanExecution | null> {
    const execution = this.executions.get(planId);
    if (!execution || execution.status !== 'paused') {
      return null;
    }

    this.pausedExecutions.delete(planId);
    execution.status = 'running';
    this.emit('execution:resumed', execution);

    // 从暂停的步骤继续
    const startIndex = execution.currentStepIndex;
    const plan = execution.plan;

    try {
      for (let i = startIndex; i < plan.steps.length; i++) {
        execution.currentStepIndex = i;
        const step = plan.steps[i];

        if (this.pausedExecutions.has(planId)) {
          execution.status = 'paused';
          this.emit('execution:paused', execution);
          return execution;
        }

        if (this.config.pauseOnHighRisk && step.riskLevel === 'high') {
          execution.status = 'paused';
          this.emit('execution:paused', { execution, reason: 'high_risk_step', step });
          return execution;
        }

        this.emit('step:started', { execution, step, index: i });

        const stepResult = await this.executeStep(step);

        execution.stepResults.push({
          step,
          result: stepResult,
          startedAt: Date.now() - stepResult.duration,
          completedAt: Date.now(),
        });

        this.emit('step:completed', { execution, step, result: stepResult, index: i });

        if (!stepResult.success) {
          execution.status = 'failed';
          execution.error = stepResult.error;

          if (this.config.autoRollbackOnFailure) {
            await this.rollback(execution);
          }

          this.emit('execution:failed', { execution, step, error: stepResult.error });
          break;
        }

        if (this.config.stepDelay > 0 && i < plan.steps.length - 1) {
          await this.delay(this.config.stepDelay);
        }
      }

      if (execution.status === 'running') {
        execution.status = 'completed';
        this.emit('execution:completed', execution);
      }
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      this.emit('execution:failed', { execution, error: execution.error });
    }

    execution.completedAt = Date.now();
    return execution;
  }

  /**
   * 取消执行
   */
  cancel(planId: string): boolean {
    const execution = this.executions.get(planId);
    if (!execution || ['completed', 'failed', 'cancelled'].includes(execution.status)) {
      return false;
    }

    execution.status = 'cancelled';
    execution.completedAt = Date.now();
    this.pausedExecutions.delete(planId);
    this.emit('execution:cancelled', execution);
    return true;
  }

  /**
   * 回滚执行
   */
  async rollback(execution: PlanExecution): Promise<void> {
    execution.status = 'rolling_back';
    this.emit('rollback:started', execution);

    // 按相反顺序回滚已完成的步骤
    const completedSteps = execution.stepResults
      .filter(sr => sr.result.success && sr.step.reversible && sr.step.rollback)
      .reverse();

    for (const stepResult of completedSteps) {
      const rollbackAction = stepResult.step.rollback!;

      try {
        this.emit('rollback:step', { execution, step: stepResult.step });
        await this.executeAction(rollbackAction.actionType, rollbackAction.params);
        this.emit('rollback:step:completed', { execution, step: stepResult.step });
      } catch (error) {
        this.emit('rollback:step:failed', {
          execution,
          step: stepResult.step,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.emit('rollback:completed', execution);
  }

  /**
   * 获取执行状态
   */
  getExecution(planId: string): PlanExecution | undefined {
    return this.executions.get(planId);
  }

  /**
   * 获取所有执行
   */
  getAllExecutions(): PlanExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * 清除已完成的执行
   */
  clearCompleted(): void {
    for (const [id, execution] of this.executions) {
      if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
        this.executions.delete(id);
      }
    }
  }

  // ============ 私有方法 ============

  private async executeStep(step: PlanStep): Promise<ExecutionResult> {
    return this.executeAction(step.actionType, step.params);
  }

  private async executeAction(
    actionType: ActionType,
    params: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      switch (actionType) {
        case 'shell':
          return this.shell.execute(
            params.command as string,
            {
              cwd: params.cwd as string | undefined,
              timeout: params.timeout as number | undefined,
            }
          );

        case 'file_read':
          return this.file.read(params.path as string);

        case 'file_write':
          return this.file.write(params.path as string, params.content as string);

        case 'file_move':
          return this.file.move(params.source as string, params.destination as string);

        case 'file_delete':
          return this.file.delete(params.path as string);

        case 'file_copy':
          return this.file.copy(params.source as string, params.destination as string);

        case 'folder_create':
          return this.file.createDir(params.path as string);

        case 'folder_delete':
          return this.file.deleteDir(params.path as string);

        case 'url_open':
          return this.automation.openUrl(params.url as string);

        case 'browser_action':
          return this.automation.browserAction(
            params.action as string,
            params.options as Record<string, unknown>
          );

        case 'app_open':
          return this.automation.openApp(params.app as string);

        case 'app_close':
          return this.automation.closeApp(params.app as string);

        case 'app_action':
          return this.automation.appAction(
            params.app as string,
            params.action as string,
            params.options as Record<string, unknown>
          );

        case 'clipboard_set':
          return this.automation.setClipboard(params.content as string);

        case 'clipboard_get':
          return this.automation.getClipboard();

        case 'notification':
          return this.automation.showNotification(
            params.title as string || 'Hawkeye',
            params.message as string
          );

        case 'api_call':
          return this.executeApiCall(params);

        case 'user_input':
          return this.requestUserInput(params);

        case 'wait':
          await this.delay((params.duration as number) || 1000);
          return {
            success: true,
            output: `等待 ${params.duration || 1000}ms`,
            duration: Date.now() - startTime,
          };

        case 'condition':
        case 'loop':
          // 条件和循环需要特殊处理
          return {
            success: true,
            output: `${actionType} 需要特殊处理`,
            duration: Date.now() - startTime,
          };

        default:
          return {
            success: false,
            error: `不支持的动作类型: ${actionType}`,
            duration: Date.now() - startTime,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 执行 API 调用
   */
  private async executeApiCall(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const url = params.url as string;
      const method = (params.method as string) || 'GET';
      const headers = (params.headers as Record<string, string>) || {};
      const body = params.body;

      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };

      if (body && method !== 'GET') {
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const contentType = response.headers.get('content-type');
      let data: string;

      if (contentType?.includes('application/json')) {
        const json = await response.json();
        data = JSON.stringify(json, null, 2);
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        return {
          success: false,
          error: `API 调用失败: ${response.status} ${response.statusText}`,
          output: data,
          duration: Date.now() - startTime,
        };
      }

      return {
        success: true,
        output: data,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 请求用户输入
   * 注意：需要在上层提供输入处理器
   */
  private async requestUserInput(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const prompt = (params.prompt as string) || '请输入:';
    const defaultValue = params.defaultValue as string | undefined;

    // 发出需要用户输入的事件
    this.emit('input:required', {
      prompt,
      defaultValue,
      inputType: params.inputType || 'text',
    });

    // 返回等待输入的结果
    return {
      success: true,
      output: `等待用户输入: ${prompt}`,
      duration: Date.now() - startTime,
    };
  }
}
