/**
 * 执行引擎 - 统一管理所有执行能力
 */

import { ShellExecutor, type ShellExecutorConfig } from './shell';
import { FileExecutor } from './file';
import { AutomationExecutor } from './automation';
import type {
  TaskSuggestion,
  TaskAction,
  ExecutionResult,
  TaskExecution,
  TaskStatus,
} from '../types';

export interface ExecutionEngineConfig {
  shell?: ShellExecutorConfig;
  /** 是否需要用户确认才能执行 */
  requireConfirmation?: boolean;
  /** 确认回调 */
  onConfirmRequired?: (suggestion: TaskSuggestion) => Promise<boolean>;
  /** 执行前回调 */
  onBeforeExecute?: (action: TaskAction) => void;
  /** 执行后回调 */
  onAfterExecute?: (action: TaskAction, result: ExecutionResult) => void;
}

export class ExecutionEngine {
  private shell: ShellExecutor;
  private file: FileExecutor;
  private automation: AutomationExecutor;
  private config: ExecutionEngineConfig;
  private executions: Map<string, TaskExecution> = new Map();

  constructor(config: ExecutionEngineConfig = {}) {
    this.config = config;
    this.shell = new ShellExecutor(config.shell);
    this.file = new FileExecutor();
    this.automation = new AutomationExecutor();
  }

  /**
   * 执行任务建议
   */
  async execute(suggestion: TaskSuggestion): Promise<TaskExecution> {
    const execution: TaskExecution = {
      taskId: suggestion.id,
      suggestion,
      status: 'pending',
      startedAt: Date.now(),
    };

    this.executions.set(suggestion.id, execution);

    // 需要确认
    if (this.config.requireConfirmation && this.config.onConfirmRequired) {
      const confirmed = await this.config.onConfirmRequired(suggestion);
      if (!confirmed) {
        execution.status = 'cancelled';
        execution.completedAt = Date.now();
        return execution;
      }
    }

    execution.status = 'running';

    try {
      // 依次执行所有动作
      for (const action of suggestion.actions) {
        this.config.onBeforeExecute?.(action);

        const result = await this.executeAction(action);

        this.config.onAfterExecute?.(action, result);

        if (!result.success) {
          execution.status = 'failed';
          execution.result = result;
          execution.completedAt = Date.now();
          return execution;
        }

        // 保存最后一个结果
        execution.result = result;
      }

      execution.status = 'completed';
    } catch (error: unknown) {
      execution.status = 'failed';
      execution.result = {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - (execution.startedAt || 0),
      };
    }

    execution.completedAt = Date.now();
    return execution;
  }

  /**
   * 执行单个动作
   */
  async executeAction(action: TaskAction): Promise<ExecutionResult> {
    const params = action.params as Record<string, string>;

    switch (action.type) {
      case 'run_shell':
        return this.shell.execute(params.command, {
          cwd: params.cwd,
          timeout: params.timeout ? parseInt(params.timeout) : undefined,
        });

      case 'read_file':
        return this.file.read(params.path);

      case 'write_file':
        return this.file.write(params.path, params.content);

      case 'edit_file':
        // 简单替换实现
        const readResult = await this.file.read(params.path);
        if (!readResult.success || !readResult.output) {
          return readResult;
        }
        const newContent = readResult.output.replace(params.search, params.replace);
        return this.file.write(params.path, newContent);

      case 'open_url':
        return this.automation.openUrl(params.url);

      case 'open_app':
        return this.automation.openApp(params.app);

      default:
        return {
          success: false,
          error: `未知的动作类型: ${action.type}`,
          duration: 0,
        };
    }
  }

  /**
   * 获取执行记录
   */
  getExecution(taskId: string): TaskExecution | undefined {
    return this.executions.get(taskId);
  }

  /**
   * 获取所有执行记录
   */
  getAllExecutions(): TaskExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * 获取指定状态的执行记录
   */
  getExecutionsByStatus(status: TaskStatus): TaskExecution[] {
    return this.getAllExecutions().filter((e) => e.status === status);
  }

  /**
   * 清除执行记录
   */
  clearExecutions(): void {
    this.executions.clear();
  }

  /**
   * 获取 Shell 执行器（用于直接访问）
   */
  getShellExecutor(): ShellExecutor {
    return this.shell;
  }

  /**
   * 获取文件执行器
   */
  getFileExecutor(): FileExecutor {
    return this.file;
  }

  /**
   * 获取自动化执行器
   */
  getAutomationExecutor(): AutomationExecutor {
    return this.automation;
  }
}
