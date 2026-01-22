/**
 * 工作流管理器
 * Workflow Manager
 *
 * 管理自定义工作流的创建、执行和调度
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ShellExecutor } from '../execution/shell';
import { FileExecutor } from '../execution/file';
import {
  Workflow,
  WorkflowMetadata,
  WorkflowState,
  WorkflowStep,
  WorkflowTrigger,
  WorkflowExecution,
  ExecutionStatus,
  StepExecutionResult,
  WorkflowManagerConfig,
  DEFAULT_WORKFLOW_CONFIG,
  WorkflowCondition,
  ConditionOperator,
  ActionStep,
  ConditionStep,
  LoopStep,
  ParallelStep,
  WaitStep,
  InputStep,
  NotificationStep,
  ScriptStep,
  SubworkflowStep,
} from './types';

/**
 * 工作流管理器事件
 */
export interface WorkflowManagerEvents {
  'workflow:created': (workflow: Workflow) => void;
  'workflow:updated': (workflow: Workflow) => void;
  'workflow:deleted': (workflowId: string) => void;
  'execution:started': (execution: WorkflowExecution) => void;
  'execution:step:started': (executionId: string, stepId: string) => void;
  'execution:step:completed': (executionId: string, result: StepExecutionResult) => void;
  'execution:completed': (execution: WorkflowExecution) => void;
  'execution:failed': (execution: WorkflowExecution, error: Error) => void;
  'execution:cancelled': (executionId: string) => void;
}

/**
 * 工作流管理器
 */
export class WorkflowManager extends EventEmitter {
  private config: WorkflowManagerConfig;
  private workflows: Map<string, Workflow> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private scheduledJobs: Map<string, NodeJS.Timeout> = new Map();

  // 执行器
  private shellExecutor: ShellExecutor;
  private fileExecutor: FileExecutor;

  // 事件触发器映射
  private eventTriggers: Map<string, Set<string>> = new Map(); // eventName -> workflowIds

  // 回调处理
  private inputHandler?: (prompt: string, options?: unknown) => Promise<unknown>;
  private notificationHandler?: (title: string, message: string, type: string) => void;

  constructor(config?: Partial<WorkflowManagerConfig>) {
    super();
    this.config = { ...DEFAULT_WORKFLOW_CONFIG, ...config };
    this.shellExecutor = new ShellExecutor();
    this.fileExecutor = new FileExecutor();
    this.ensureWorkflowDir();
  }

  /**
   * 确保工作流目录存在
   */
  private ensureWorkflowDir(): void {
    const dir = this.resolveWorkflowDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 解析工作流目录
   */
  private resolveWorkflowDir(): string {
    if (this.config.workflowDir.startsWith('~')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      return path.join(homeDir, this.config.workflowDir.slice(1));
    }
    return this.config.workflowDir;
  }

  // ============================================================================
  // 工作流 CRUD (Workflow CRUD)
  // ============================================================================

  /**
   * 创建工作流
   */
  createWorkflow(
    name: string,
    description?: string,
    options?: Partial<WorkflowMetadata>
  ): Workflow {
    const now = Date.now();
    const workflow: Workflow = {
      metadata: {
        id: uuidv4(),
        name,
        description,
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        ...options,
      },
      triggers: [{ type: 'manual', enabled: true }],
      steps: [],
    };

    this.workflows.set(workflow.metadata.id, workflow);
    this.saveWorkflow(workflow);
    this.emit('workflow:created', workflow);

    return workflow;
  }

  /**
   * 获取工作流
   */
  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * 获取所有工作流
   */
  getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * 更新工作流
   */
  updateWorkflow(workflowId: string, updates: Partial<Workflow>): Workflow {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // 更新工作流
    const updatedWorkflow: Workflow = {
      ...workflow,
      ...updates,
      metadata: {
        ...workflow.metadata,
        ...updates.metadata,
        id: workflow.metadata.id, // 保持 ID 不变
        updatedAt: Date.now(),
      },
    };

    this.workflows.set(workflowId, updatedWorkflow);
    this.saveWorkflow(updatedWorkflow);
    this.emit('workflow:updated', updatedWorkflow);

    // 重新调度触发器
    this.rescheduleWorkflow(updatedWorkflow);

    return updatedWorkflow;
  }

  /**
   * 删除工作流
   */
  deleteWorkflow(workflowId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // 取消所有定时任务
    this.cancelScheduledJobs(workflowId);

    // 删除工作流
    this.workflows.delete(workflowId);

    // 删除文件
    const filePath = path.join(this.resolveWorkflowDir(), `${workflowId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    this.emit('workflow:deleted', workflowId);
  }

  /**
   * 复制工作流
   */
  duplicateWorkflow(workflowId: string, newName?: string): Workflow {
    const original = this.workflows.get(workflowId);
    if (!original) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const now = Date.now();
    const workflow: Workflow = {
      ...JSON.parse(JSON.stringify(original)),
      metadata: {
        ...original.metadata,
        id: uuidv4(),
        name: newName || `${original.metadata.name} (Copy)`,
        createdAt: now,
        updatedAt: now,
        isSystem: false,
        isTemplate: false,
      },
    };

    this.workflows.set(workflow.metadata.id, workflow);
    this.saveWorkflow(workflow);
    this.emit('workflow:created', workflow);

    return workflow;
  }

  // ============================================================================
  // 步骤管理 (Step Management)
  // ============================================================================

  /**
   * 添加步骤
   */
  addStep(workflowId: string, step: WorkflowStep, index?: number): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (index !== undefined) {
      workflow.steps.splice(index, 0, step);
    } else {
      workflow.steps.push(step);
    }

    workflow.metadata.updatedAt = Date.now();
    this.saveWorkflow(workflow);
    this.emit('workflow:updated', workflow);
  }

  /**
   * 移除步骤
   */
  removeStep(workflowId: string, stepId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const index = workflow.steps.findIndex(s => s.id === stepId);
    if (index === -1) {
      throw new Error(`Step ${stepId} not found`);
    }

    workflow.steps.splice(index, 1);
    workflow.metadata.updatedAt = Date.now();
    this.saveWorkflow(workflow);
    this.emit('workflow:updated', workflow);
  }

  /**
   * 更新步骤
   */
  updateStep(workflowId: string, stepId: string, updates: Partial<WorkflowStep>): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const index = workflow.steps.findIndex(s => s.id === stepId);
    if (index === -1) {
      throw new Error(`Step ${stepId} not found`);
    }

    workflow.steps[index] = {
      ...workflow.steps[index],
      ...updates,
      id: stepId, // 保持 ID 不变
    } as WorkflowStep;

    workflow.metadata.updatedAt = Date.now();
    this.saveWorkflow(workflow);
    this.emit('workflow:updated', workflow);
  }

  /**
   * 移动步骤
   */
  moveStep(workflowId: string, stepId: string, newIndex: number): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const currentIndex = workflow.steps.findIndex(s => s.id === stepId);
    if (currentIndex === -1) {
      throw new Error(`Step ${stepId} not found`);
    }

    const [step] = workflow.steps.splice(currentIndex, 1);
    workflow.steps.splice(newIndex, 0, step);

    workflow.metadata.updatedAt = Date.now();
    this.saveWorkflow(workflow);
    this.emit('workflow:updated', workflow);
  }

  // ============================================================================
  // 触发器管理 (Trigger Management)
  // ============================================================================

  /**
   * 添加触发器
   */
  addTrigger(workflowId: string, trigger: WorkflowTrigger): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    workflow.triggers.push(trigger);
    workflow.metadata.updatedAt = Date.now();
    this.saveWorkflow(workflow);
    this.emit('workflow:updated', workflow);

    // 激活触发器
    this.activateTrigger(workflow, trigger);
  }

  /**
   * 移除触发器
   */
  removeTrigger(workflowId: string, index: number): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    workflow.triggers.splice(index, 1);
    workflow.metadata.updatedAt = Date.now();
    this.saveWorkflow(workflow);
    this.emit('workflow:updated', workflow);

    // 重新调度
    this.rescheduleWorkflow(workflow);
  }

  // ============================================================================
  // 工作流执行 (Workflow Execution)
  // ============================================================================

  /**
   * 执行工作流
   */
  async executeWorkflow(
    workflowId: string,
    inputs?: Record<string, unknown>
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // 检查并发执行数
    const runningCount = Array.from(this.executions.values())
      .filter(e => e.status === 'running').length;
    if (runningCount >= this.config.maxConcurrentExecutions) {
      throw new Error('Maximum concurrent executions reached');
    }

    // 创建执行记录
    const execution: WorkflowExecution = {
      id: uuidv4(),
      workflowId,
      workflowVersion: workflow.metadata.version,
      triggerType: 'manual',
      triggeredAt: Date.now(),
      status: 'pending',
      inputs: inputs || {},
      stepResults: [],
      variables: { ...inputs },
    };

    this.executions.set(execution.id, execution);

    // 开始执行
    execution.status = 'running';
    execution.startTime = Date.now();
    this.emit('execution:started', execution);

    try {
      // 执行所有步骤
      await this.executeSteps(execution, workflow.steps);

      // 标记完成
      execution.status = 'completed';
      execution.endTime = Date.now();
      this.emit('execution:completed', execution);
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.error = error instanceof Error ? error.message : String(error);
      this.emit('execution:failed', execution, error as Error);
    }

    return execution;
  }

  /**
   * 取消执行
   */
  cancelExecution(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status !== 'running' && execution.status !== 'paused') {
      throw new Error('Cannot cancel non-running execution');
    }

    execution.status = 'cancelled';
    execution.endTime = Date.now();
    this.emit('execution:cancelled', executionId);
  }

  /**
   * 暂停执行
   */
  pauseExecution(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status !== 'running') {
      throw new Error('Cannot pause non-running execution');
    }

    execution.status = 'paused';
  }

  /**
   * 恢复执行
   */
  resumeExecution(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status !== 'paused') {
      throw new Error('Cannot resume non-paused execution');
    }

    execution.status = 'running';
  }

  /**
   * 获取执行记录
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * 获取工作流的执行历史
   */
  getExecutionHistory(workflowId: string): WorkflowExecution[] {
    return Array.from(this.executions.values())
      .filter(e => e.workflowId === workflowId)
      .sort((a, b) => b.triggeredAt - a.triggeredAt);
  }

  // ============================================================================
  // 步骤执行 (Step Execution)
  // ============================================================================

  /**
   * 执行步骤列表
   */
  private async executeSteps(
    execution: WorkflowExecution,
    steps: WorkflowStep[]
  ): Promise<void> {
    for (const step of steps) {
      if (execution.status !== 'running') {
        break;
      }

      if (!step.enabled) {
        continue;
      }

      await this.executeStep(execution, step);
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(
    execution: WorkflowExecution,
    step: WorkflowStep
  ): Promise<StepExecutionResult> {
    const result: StepExecutionResult = {
      stepId: step.id,
      status: 'running',
      startTime: Date.now(),
    };

    execution.stepResults.push(result);
    this.emit('execution:step:started', execution.id, step.id);

    try {
      // 设置超时
      const timeout = step.timeout || this.config.defaultTimeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Step timeout')), timeout);
      });

      // 执行步骤
      const executePromise = this.executeStepByType(execution, step);
      const output = await Promise.race([executePromise, timeoutPromise]);

      result.status = 'completed';
      result.output = output;
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);

      // 错误处理
      const errorStrategy = step.onError || 'stop';
      if (errorStrategy === 'stop') {
        throw error;
      } else if (errorStrategy === 'retry' && step.retry) {
        // 重试逻辑
        const retried = await this.retryStep(execution, step, result);
        if (!retried) {
          throw error;
        }
      }
      // continue: 继续执行下一步
    }

    result.endTime = Date.now();
    this.emit('execution:step:completed', execution.id, result);

    return result;
  }

  /**
   * 按类型执行步骤
   */
  private async executeStepByType(
    execution: WorkflowExecution,
    step: WorkflowStep
  ): Promise<unknown> {
    switch (step.type) {
      case 'action':
        return this.executeActionStep(execution, step as ActionStep);
      case 'condition':
        return this.executeConditionStep(execution, step as ConditionStep);
      case 'loop':
        return this.executeLoopStep(execution, step as LoopStep);
      case 'parallel':
        return this.executeParallelStep(execution, step as ParallelStep);
      case 'wait':
        return this.executeWaitStep(execution, step as WaitStep);
      case 'input':
        return this.executeInputStep(execution, step as InputStep);
      case 'notification':
        return this.executeNotificationStep(execution, step as NotificationStep);
      case 'script':
        return this.executeScriptStep(execution, step as ScriptStep);
      case 'subworkflow':
        return this.executeSubworkflowStep(execution, step as SubworkflowStep);
      default:
        throw new Error(`Unknown step type: ${(step as WorkflowStep).type}`);
    }
  }

  /**
   * 执行操作步骤
   */
  private async executeActionStep(
    execution: WorkflowExecution,
    step: ActionStep
  ): Promise<unknown> {
    const { actionType, params } = step.action;

    switch (actionType) {
      case 'shell':
        // 执行 Shell 命令
        const shellResult = await this.shellExecutor.execute(
          params.command as string,
          {
            cwd: params.cwd as string | undefined,
            timeout: params.timeout as number | undefined,
          }
        );
        return shellResult;

      case 'file_read':
        return await this.fileExecutor.read(params.path as string);

      case 'file_write':
        return await this.fileExecutor.write(
          params.path as string,
          params.content as string
        );

      case 'file_move':
        return await this.fileExecutor.move(
          params.source as string,
          params.destination as string
        );

      case 'file_copy':
        return await this.fileExecutor.copy(
          params.source as string,
          params.destination as string
        );

      case 'file_delete':
        return await this.fileExecutor.delete(params.path as string);

      case 'folder_create':
        return await this.fileExecutor.createDir(params.path as string);

      default:
        console.log(`Executing action: ${actionType}`, params);
        return { success: true, actionType, params };
    }
  }

  /**
   * 执行条件步骤
   */
  private async executeConditionStep(
    execution: WorkflowExecution,
    step: ConditionStep
  ): Promise<void> {
    const result = this.evaluateConditions(
      step.conditions,
      step.logic,
      execution.variables
    );

    if (result) {
      await this.executeSteps(execution, step.thenSteps);
    } else if (step.elseSteps) {
      await this.executeSteps(execution, step.elseSteps);
    }
  }

  /**
   * 执行循环步骤
   */
  private async executeLoopStep(
    execution: WorkflowExecution,
    step: LoopStep
  ): Promise<void> {
    const maxIterations = step.maxIterations || 1000;
    let iterations = 0;

    if (step.loopType === 'count' && step.count) {
      for (let i = 0; i < step.count && iterations < maxIterations; i++) {
        execution.variables['$index'] = i;
        await this.executeSteps(execution, step.steps);
        iterations++;
      }
    } else if (step.loopType === 'while' && step.whileCondition) {
      while (
        this.evaluateCondition(step.whileCondition, execution.variables) &&
        iterations < maxIterations
      ) {
        await this.executeSteps(execution, step.steps);
        iterations++;
      }
    } else if (step.loopType === 'for_each' && step.items) {
      for (const item of step.items) {
        if (iterations >= maxIterations) break;
        if (step.itemVariable) {
          execution.variables[step.itemVariable] = item;
        }
        await this.executeSteps(execution, step.steps);
        iterations++;
      }
    }
  }

  /**
   * 执行并行步骤
   */
  private async executeParallelStep(
    execution: WorkflowExecution,
    step: ParallelStep
  ): Promise<unknown[]> {
    const promises = step.branches.map(branch =>
      this.executeSteps(execution, branch.steps)
    );

    if (step.waitStrategy === 'all') {
      await Promise.all(promises);
    } else if (step.waitStrategy === 'any') {
      await Promise.race(promises);
    }
    // 'none': 不等待

    return [];
  }

  /**
   * 执行等待步骤
   */
  private async executeWaitStep(
    execution: WorkflowExecution,
    step: WaitStep
  ): Promise<void> {
    // 等待固定时长
    if (step.duration) {
      await new Promise(resolve => setTimeout(resolve, step.duration));
    }

    // 等待事件
    if (step.event) {
      await new Promise<void>(resolve => {
        const handler = () => {
          this.removeListener(step.event!, handler);
          resolve();
        };
        this.on(step.event!, handler);

        // 设置超时 (默认 5 分钟)
        const timeout = setTimeout(() => {
          this.removeListener(step.event!, handler);
          resolve();
        }, 5 * 60 * 1000);

        // 清理
        this.once(`execution:${execution.id}:cancelled`, () => {
          clearTimeout(timeout);
          this.removeListener(step.event!, handler);
          resolve();
        });
      });
    }

    // 等待条件满足
    if (step.condition) {
      const maxWait = 5 * 60 * 1000; // 5 分钟超时
      const checkInterval = 500; // 每 500ms 检查一次
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const conditionMet = this.evaluateConditions(
          [step.condition],
          'and',
          execution.variables
        );

        if (conditionMet) {
          break;
        }

        // 检查是否被取消
        if (execution.status === 'cancelled') {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }
  }

  /**
   * 执行输入步骤
   */
  private async executeInputStep(
    execution: WorkflowExecution,
    step: InputStep
  ): Promise<unknown> {
    if (!this.inputHandler) {
      throw new Error('Input handler not configured');
    }

    const value = await this.inputHandler(step.prompt, {
      type: step.inputType,
      options: step.options,
      defaultValue: step.defaultValue,
    });

    execution.variables[step.resultVariable] = value;
    return value;
  }

  /**
   * 执行通知步骤
   */
  private async executeNotificationStep(
    execution: WorkflowExecution,
    step: NotificationStep
  ): Promise<void> {
    if (this.notificationHandler) {
      // 替换变量
      const title = this.interpolateString(step.title, execution.variables);
      const message = this.interpolateString(step.message, execution.variables);
      this.notificationHandler(title, message, step.notificationType);
    }
  }

  /**
   * 执行脚本步骤
   */
  private async executeScriptStep(
    execution: WorkflowExecution,
    step: ScriptStep
  ): Promise<unknown> {
    if (!this.config.enableScriptExecution) {
      throw new Error('Script execution is disabled');
    }

    if (step.language === 'javascript') {
      // 准备输入
      const inputs: Record<string, unknown> = {};
      if (step.inputs) {
        for (const [key, varName] of Object.entries(step.inputs)) {
          inputs[key] = execution.variables[varName];
        }
      }

      // 执行脚本 (使用 Function 构造器)
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function('inputs', 'variables', step.code);
      const result = await Promise.resolve(fn(inputs, execution.variables));

      // 设置输出
      if (step.outputs && typeof result === 'object') {
        for (const outputKey of step.outputs) {
          execution.variables[outputKey] = (result as Record<string, unknown>)[outputKey];
        }
      }

      return result;
    } else if (step.language === 'shell') {
      // 执行 shell 脚本
      const execPromise = promisify(exec);

      // 准备环境变量 (filter out undefined values)
      const env: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
      );
      if (step.inputs) {
        for (const [key, varName] of Object.entries(step.inputs)) {
          const value = execution.variables[varName];
          if (value !== undefined && value !== null) {
            env[key] = String(value);
          }
        }
      }

      try {
        const { stdout, stderr } = await execPromise(step.code, {
          env,
          timeout: 30000, // 30 秒超时
        });

        const result = {
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          success: true,
        };

        // 设置输出
        if (step.outputs) {
          for (const outputKey of step.outputs) {
            if (outputKey === 'stdout') {
              execution.variables[outputKey] = result.stdout;
            } else if (outputKey === 'stderr') {
              execution.variables[outputKey] = result.stderr;
            }
          }
        }

        return result;
      } catch (error: unknown) {
        const execError = error as { stdout?: string; stderr?: string; message: string };
        return {
          stdout: execError.stdout || '',
          stderr: execError.stderr || execError.message,
          success: false,
          error: execError.message,
        };
      }
    }

    throw new Error(`Unsupported script language: ${step.language}`);
  }

  /**
   * 执行子工作流步骤
   */
  private async executeSubworkflowStep(
    execution: WorkflowExecution,
    step: SubworkflowStep
  ): Promise<unknown> {
    // 准备输入
    const inputs: Record<string, unknown> = {};
    if (step.inputMapping) {
      for (const [inputKey, varName] of Object.entries(step.inputMapping)) {
        inputs[inputKey] = execution.variables[varName];
      }
    }

    // 执行子工作流
    const subExecution = await this.executeWorkflow(step.workflowId, inputs);

    // 映射输出
    if (step.outputMapping && subExecution.outputs) {
      for (const [outputKey, varName] of Object.entries(step.outputMapping)) {
        execution.variables[varName] = subExecution.outputs[outputKey];
      }
    }

    return subExecution.outputs;
  }

  // ============================================================================
  // 条件评估 (Condition Evaluation)
  // ============================================================================

  /**
   * 评估条件列表
   */
  private evaluateConditions(
    conditions: WorkflowCondition[],
    logic: 'and' | 'or',
    variables: Record<string, unknown>
  ): boolean {
    if (logic === 'and') {
      return conditions.every(c => this.evaluateCondition(c, variables));
    } else {
      return conditions.some(c => this.evaluateCondition(c, variables));
    }
  }

  /**
   * 评估单个条件
   */
  private evaluateCondition(
    condition: WorkflowCondition,
    variables: Record<string, unknown>
  ): boolean {
    const fieldValue = this.getFieldValue(condition.field, variables);
    let result = this.compare(fieldValue, condition.operator, condition.value);

    if (condition.negate) {
      result = !result;
    }

    return result;
  }

  /**
   * 获取字段值
   */
  private getFieldValue(field: string, variables: Record<string, unknown>): unknown {
    const parts = field.split('.');
    let value: unknown = variables;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = (value as Record<string, unknown>)[part];
    }

    return value;
  }

  /**
   * 比较值
   */
  private compare(
    left: unknown,
    operator: ConditionOperator,
    right: unknown
  ): boolean {
    switch (operator) {
      case 'equals':
        return left === right;
      case 'not_equals':
        return left !== right;
      case 'contains':
        return String(left).includes(String(right));
      case 'not_contains':
        return !String(left).includes(String(right));
      case 'starts_with':
        return String(left).startsWith(String(right));
      case 'ends_with':
        return String(left).endsWith(String(right));
      case 'greater_than':
        return Number(left) > Number(right);
      case 'less_than':
        return Number(left) < Number(right);
      case 'greater_or_equal':
        return Number(left) >= Number(right);
      case 'less_or_equal':
        return Number(left) <= Number(right);
      case 'is_empty':
        return left === null || left === undefined || left === '';
      case 'is_not_empty':
        return left !== null && left !== undefined && left !== '';
      case 'matches_regex':
        return new RegExp(String(right)).test(String(left));
      default:
        return false;
    }
  }

  // ============================================================================
  // 辅助方法 (Helper Methods)
  // ============================================================================

  /**
   * 重试步骤
   */
  private async retryStep(
    execution: WorkflowExecution,
    step: WorkflowStep,
    result: StepExecutionResult
  ): Promise<boolean> {
    if (!step.retry) return false;

    const { maxRetries, retryInterval, exponentialBackoff, maxInterval } = step.retry;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      result.retryCount = attempt;

      // 计算等待时间
      let waitTime = retryInterval;
      if (exponentialBackoff) {
        waitTime = Math.min(
          retryInterval * Math.pow(2, attempt - 1),
          maxInterval || 60000
        );
      }

      await new Promise(resolve => setTimeout(resolve, waitTime));

      try {
        const output = await this.executeStepByType(execution, step);
        result.status = 'completed';
        result.output = output;
        result.error = undefined;
        return true;
      } catch {
        // 继续重试
      }
    }

    return false;
  }

  /**
   * 插值字符串
   */
  private interpolateString(
    template: string,
    variables: Record<string, unknown>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return String(variables[key] ?? '');
    });
  }

  /**
   * 保存工作流
   */
  private saveWorkflow(workflow: Workflow): void {
    const filePath = path.join(
      this.resolveWorkflowDir(),
      `${workflow.metadata.id}.json`
    );
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
  }

  /**
   * 加载所有工作流
   */
  loadAllWorkflows(): void {
    const dir = this.resolveWorkflowDir();
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const workflow = JSON.parse(content) as Workflow;
        this.workflows.set(workflow.metadata.id, workflow);

        // 激活触发器
        for (const trigger of workflow.triggers) {
          if (trigger.enabled) {
            this.activateTrigger(workflow, trigger);
          }
        }
      } catch (error) {
        console.error(`Failed to load workflow from ${file}:`, error);
      }
    }
  }

  /**
   * 激活触发器
   */
  private activateTrigger(workflow: Workflow, trigger: WorkflowTrigger): void {
    switch (trigger.type) {
      case 'schedule':
        this.scheduleWorkflow(workflow, trigger);
        break;

      case 'event':
        // 注册事件触发器
        const eventTrigger = trigger as { type: 'event'; eventName: string };
        if (!this.eventTriggers.has(eventTrigger.eventName)) {
          this.eventTriggers.set(eventTrigger.eventName, new Set());
        }
        this.eventTriggers.get(eventTrigger.eventName)!.add(workflow.metadata.id);
        break;

      case 'webhook':
        // Webhook 触发器由外部 HTTP 服务器处理，这里只记录注册
        console.log(`Webhook trigger registered for workflow: ${workflow.metadata.id}`);
        break;

      case 'hotkey':
        // 快捷键触发器由外部处理（例如 Electron 的 globalShortcut）
        console.log(`Hotkey trigger registered for workflow: ${workflow.metadata.id}`);
        break;

      case 'manual':
        // 手动触发器不需要特殊处理
        break;

      case 'condition':
        // 条件触发器：定期检查条件
        this.setupConditionTrigger(workflow, trigger);
        break;
    }
  }

  /**
   * 设置条件触发器
   */
  private setupConditionTrigger(
    workflow: Workflow,
    trigger: WorkflowTrigger & { type: 'condition' }
  ): void {
    const jobId = `${workflow.metadata.id}:condition:${Math.random()}`;
    const checkInterval = 10000; // 每 10 秒检查一次

    const job = setInterval(async () => {
      try {
        // 创建临时变量上下文
        const variables: Record<string, unknown> = {};

        const conditionMet = this.evaluateConditions(
          trigger.conditions,
          trigger.logic,
          variables
        );

        if (conditionMet) {
          await this.executeWorkflow(workflow.metadata.id);
        }
      } catch (error) {
        console.error(`Condition trigger error for workflow ${workflow.metadata.id}:`, error);
      }
    }, checkInterval);

    this.scheduledJobs.set(jobId, job);
  }

  /**
   * 触发事件（供外部调用）
   */
  triggerEvent(eventName: string, data?: Record<string, unknown>): void {
    const workflowIds = this.eventTriggers.get(eventName);
    if (workflowIds) {
      for (const workflowId of workflowIds) {
        this.executeWorkflow(workflowId, data).catch(console.error);
      }
    }
    // 同时触发内部事件（用于 wait 步骤）
    this.emit(eventName, data);
  }

  /**
   * 触发 Webhook（供外部 HTTP 服务器调用）
   */
  async triggerWebhook(
    path: string,
    method: string,
    data?: Record<string, unknown>
  ): Promise<{ workflowId: string; executed: boolean }[]> {
    const results: { workflowId: string; executed: boolean }[] = [];

    for (const workflow of this.workflows.values()) {
      for (const trigger of workflow.triggers) {
        if (
          trigger.type === 'webhook' &&
          trigger.enabled &&
          trigger.path === path &&
          (!trigger.methods || trigger.methods.includes(method as 'GET' | 'POST' | 'PUT' | 'DELETE'))
        ) {
          try {
            await this.executeWorkflow(workflow.metadata.id, data);
            results.push({ workflowId: workflow.metadata.id, executed: true });
          } catch {
            results.push({ workflowId: workflow.metadata.id, executed: false });
          }
        }
      }
    }

    return results;
  }

  /**
   * 调度工作流
   */
  private scheduleWorkflow(
    workflow: Workflow,
    trigger: WorkflowTrigger & { type: 'schedule' }
  ): void {
    if (trigger.interval) {
      const jobId = `${workflow.metadata.id}:interval:${Math.random()}`;
      const job = setInterval(() => {
        this.executeWorkflow(workflow.metadata.id).catch(console.error);
      }, trigger.interval);
      this.scheduledJobs.set(jobId, job);
    }

    if (trigger.cron) {
      // 解析 cron 表达式并设置定时任务
      this.scheduleCronJob(workflow, trigger.cron);
    }
  }

  /**
   * 设置 cron 定时任务
   * 支持简化的 cron 表达式: minute hour dayOfMonth month dayOfWeek
   */
  private scheduleCronJob(workflow: Workflow, cronExpr: string): void {
    const jobId = `${workflow.metadata.id}:cron:${Math.random()}`;

    // 每分钟检查一次是否匹配 cron 表达式
    const job = setInterval(() => {
      const now = new Date();
      if (this.matchesCron(now, cronExpr)) {
        this.executeWorkflow(workflow.metadata.id).catch(console.error);
      }
    }, 60000); // 每分钟检查

    this.scheduledJobs.set(jobId, job);
  }

  /**
   * 检查时间是否匹配 cron 表达式
   * 简化版本支持: minute hour dayOfMonth month dayOfWeek
   * 支持 * (任意), 数字, 逗号分隔, 范围(-)
   */
  private matchesCron(date: Date, cronExpr: string): boolean {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) {
      console.warn(`Invalid cron expression: ${cronExpr}`);
      return false;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const matchField = (field: string, value: number): boolean => {
      if (field === '*') return true;

      // 处理逗号分隔的多个值
      if (field.includes(',')) {
        return field.split(',').some(f => matchField(f.trim(), value));
      }

      // 处理范围
      if (field.includes('-')) {
        const [start, end] = field.split('-').map(Number);
        return value >= start && value <= end;
      }

      // 处理步长 (*/n)
      if (field.startsWith('*/')) {
        const step = parseInt(field.substring(2), 10);
        return value % step === 0;
      }

      // 直接数字比较
      return parseInt(field, 10) === value;
    };

    return (
      matchField(minute, date.getMinutes()) &&
      matchField(hour, date.getHours()) &&
      matchField(dayOfMonth, date.getDate()) &&
      matchField(month, date.getMonth() + 1) &&
      matchField(dayOfWeek, date.getDay())
    );
  }

  /**
   * 重新调度工作流
   */
  private rescheduleWorkflow(workflow: Workflow): void {
    this.cancelScheduledJobs(workflow.metadata.id);

    for (const trigger of workflow.triggers) {
      if (trigger.enabled) {
        this.activateTrigger(workflow, trigger);
      }
    }
  }

  /**
   * 取消定时任务
   */
  private cancelScheduledJobs(workflowId: string): void {
    for (const [jobId, job] of this.scheduledJobs) {
      if (jobId.startsWith(`${workflowId}:`)) {
        clearInterval(job);
        this.scheduledJobs.delete(jobId);
      }
    }
  }

  /**
   * 设置输入处理器
   */
  setInputHandler(
    handler: (prompt: string, options?: unknown) => Promise<unknown>
  ): void {
    this.inputHandler = handler;
  }

  /**
   * 设置通知处理器
   */
  setNotificationHandler(
    handler: (title: string, message: string, type: string) => void
  ): void {
    this.notificationHandler = handler;
  }

  /**
   * 销毁
   */
  destroy(): void {
    // 取消所有定时任务
    for (const job of this.scheduledJobs.values()) {
      clearInterval(job);
    }
    this.scheduledJobs.clear();

    this.removeAllListeners();
  }
}

// ============================================================================
// 单例管理 (Singleton Management)
// ============================================================================

let workflowManagerInstance: WorkflowManager | null = null;

/**
 * 获取工作流管理器实例
 */
export function getWorkflowManager(): WorkflowManager {
  if (!workflowManagerInstance) {
    workflowManagerInstance = new WorkflowManager();
  }
  return workflowManagerInstance;
}

/**
 * 创建工作流管理器
 */
export function createWorkflowManager(
  config?: Partial<WorkflowManagerConfig>
): WorkflowManager {
  workflowManagerInstance = new WorkflowManager(config);
  return workflowManagerInstance;
}

/**
 * 设置工作流管理器实例
 */
export function setWorkflowManager(manager: WorkflowManager): void {
  workflowManagerInstance = manager;
}
