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

  // 回调处理
  private inputHandler?: (prompt: string, options?: unknown) => Promise<unknown>;
  private notificationHandler?: (title: string, message: string, type: string) => void;

  constructor(config?: Partial<WorkflowManagerConfig>) {
    super();
    this.config = { ...DEFAULT_WORKFLOW_CONFIG, ...config };
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
    // TODO: 集成执行引擎
    console.log(`Executing action: ${step.action.type}`);
    return { success: true };
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
    if (step.duration) {
      await new Promise(resolve => setTimeout(resolve, step.duration));
    }
    // TODO: 支持事件等待和条件等待
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
      // TODO: 执行 shell 脚本
      throw new Error('Shell script execution not yet implemented');
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
    if (trigger.type === 'schedule') {
      this.scheduleWorkflow(workflow, trigger);
    }
    // TODO: 支持其他触发器类型
  }

  /**
   * 调度工作流
   */
  private scheduleWorkflow(
    workflow: Workflow,
    trigger: WorkflowTrigger & { type: 'schedule' }
  ): void {
    if (trigger.interval) {
      const jobId = `${workflow.metadata.id}:${Math.random()}`;
      const job = setInterval(() => {
        this.executeWorkflow(workflow.metadata.id).catch(console.error);
      }, trigger.interval);
      this.scheduledJobs.set(jobId, job);
    }
    // TODO: 支持 cron 表达式
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
