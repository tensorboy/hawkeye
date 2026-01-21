/**
 * 执行模块 - 任务执行能力
 */

export { ShellExecutor, type ShellExecutorConfig } from './shell';
export { FileExecutor } from './file';
export { AutomationExecutor } from './automation';
export { ExecutionEngine, type ExecutionEngineConfig } from './engine';

// 计划执行器
export {
  PlanExecutor,
  type PlanExecutorConfig,
  type PlanExecutionStatus,
  type StepExecutionResult,
  type PlanExecution,
} from './plan-executor';

// MCP (Model Context Protocol) - 浏览器自动化
export {
  // 类型
  type MCPConfig,
  type MCPConnectionStatus,
  type MCPResult,
  type BrowserAction,
  type BrowserActionType,
  type BrowserNavigateParams,
  type BrowserClickParams,
  type BrowserTypeParams,
  type BrowserFillFormParams,
  type BrowserScreenshotParams,
  type BrowserSnapshotParams,
  type BrowserExecutionPlan,
  type BrowserExecutionStep,
  type BrowserPlanExecutionStatus,
  type SnapshotResult,
  type ScreenshotResult,
  type ConsoleMessage,
  type NetworkRequest,
  type TabInfo,
  // 客户端
  ChromeDevToolsMCP,
  // 高级 API
  BrowserActionsExecutor,
  createBrowserActionsExecutor,
  type BrowserActionsConfig,
} from './mcp';
