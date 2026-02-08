/**
 * 执行模块 - 任务执行能力
 */

export { ShellExecutor, type ShellExecutorConfig } from './shell';
export { FileExecutor } from './file';
export { AutomationExecutor } from './automation';
export { ExecutionEngine, type ExecutionEngineConfig } from './engine';

// 统一动作类型系统
export {
  type Point,
  type MouseButton,
  type ScrollDirection,
  type ModifierKey,
  type GUIAction,
  type ClickAction,
  type DoubleClickAction,
  type RightClickAction,
  type DragAction,
  type MoveAction,
  type ScrollAction,
  type TypeAction,
  type HotkeyAction,
  type KeyPressAction,
  type WaitAction,
  type ScreenshotAction,
  type FocusAction,
  type HoverAction,
  type ActionResult,
  type ActionSequence,
  type SequenceResult,
  type CoordinateSystem,
  type CoordinateConfig,
  normalizedToAbsolute,
  absoluteToNormalized,
  relativeToAbsolute,
  createClickAction,
  createTypeAction,
  createHotkeyAction,
  createScrollAction,
  createWaitAction,
  createActionSequence,
  COMMON_HOTKEYS,
  getPlatformHotkey,
} from './action-types';

// NutJS GUI 执行器
export {
  NutJSExecutor,
  createNutJSExecutor,
  getNutJSExecutor,
  setNutJSExecutor,
  type NutJSExecutorConfig,
} from './nutjs-executor';

// 动作解析器
export {
  ActionParser,
  createActionParser,
  getActionParser,
  setActionParser,
  type ParseContext,
  type ParseResult,
} from './action-parser';

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

// Vision Direct 执行器 (参考 UI-TARS 端到端 Vision→Action)
export {
  VisionDirectExecutor,
  createVisionDirectExecutor,
  getVisionDirectExecutor,
  setVisionDirectExecutor,
  type VisionActionType,
  type VisionAction,
  type VisionExecutionResult,
  type VisionDirectConfig,
} from './vision-direct-executor';

// Agent Browser 执行器 (基于 vercel-labs/agent-browser)
export {
  AgentBrowserExecutor,
  createAgentBrowserExecutor,
  type AgentBrowserConfig,
  type AgentBrowserResult,
  type SnapshotResult as AgentBrowserSnapshot,
  type AccessibilityElement,
  type FindOptions,
  type WaitOptions,
  type FormField,
  type SessionInfo,
  type AgentBrowserPlan,
  type AgentBrowserPlanStatus,
  type AgentBrowserStep,
  type AgentBrowserAction,
  type AgentBrowserCommand,
} from './agent-browser';

// Claude Computer Use 执行器 (参考 ShowUI-Aloha)
export {
  ClaudeComputerUseExecutor,
  createClaudeComputerUseExecutor,
  getClaudeComputerUseExecutor,
  initializeClaudeComputerUseExecutor,
  type ComputerUseAction,
  type ComputerUseInput,
  type ClaudeComputerUseConfig,
} from './claude-computer-use';

// 状态机浏览器代理 (基于 on-device-browser-agent)
export {
  // Types
  type AgentState,
  type StateTransition,
  type TransitionTrigger,
  type StateAction,
  type StateActionType,
  type StateMachineDefinition,
  type ObstacleDefinition,
  type ObstacleType,
  type DOMSnapshot,
  type ElementState,
  type ChangeResult,
  type AgentContext,
  type ExecutionResult,
  type ExecutionMetrics,
  type AutomationRule,
  type BrowserAgentEvents,
  type BrowserAgentConfig,
  DEFAULT_BROWSER_AGENT_CONFIG,
  // Core
  SiteRouter,
  StateMachineExecutor,
  ChangeObserver,
  ObstacleDetector,
  RuleEngine,
  // Site machines
  AMAZON_MACHINE,
  YOUTUBE_MACHINE,
  GOOGLE_SEARCH_MACHINE,
  TAOBAO_MACHINE,
} from './browser-agent';
