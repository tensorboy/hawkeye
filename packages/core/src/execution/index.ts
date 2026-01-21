/**
 * 执行模块 - 任务执行能力
 */

export { ShellExecutor, type ShellExecutorConfig } from './shell';
export { FileExecutor } from './file';
export { AutomationExecutor } from './automation';
export { ExecutionEngine, type ExecutionEngineConfig } from './engine';

// 新增：计划执行器
export {
  PlanExecutor,
  type PlanExecutorConfig,
  type PlanExecutionStatus,
  type StepExecutionResult,
  type PlanExecution,
} from './plan-executor';
