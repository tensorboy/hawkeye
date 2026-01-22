/**
 * Hawkeye 核心引擎
 * Hawkeye Core - Perception, Reasoning, Execution
 */

// 感知模块 (contains ScreenCapture class)
export * from './perception';

// 推理模块
export * from './reasoning';

// AI 模块 (export with aliases to avoid conflicts)
export {
  OllamaProvider,
  GeminiProvider,
  OpenAICompatibleProvider,
  AIManager,
  getAIManager,
  createAIManager,
  ContextCompressor,
  getContextCompressor,
  createContextCompressor,
  setContextCompressor,
  type AIProviderType,
  type AIProviderConfig,
  type AIMessage,
  type AIMessageContent,
  type AIResponse,
  type IAIProvider,
  type UserIntent,
  type IntentType,
  type IntentEntity,
  type IntentContext,
  type ExecutionPlan,
  type PlanStep,
  type AlternativePlan,
  type PlanImpact,
  type OllamaConfig,
  type GeminiConfig,
  type OpenAICompatibleConfig,
  type AIManagerConfig,
  type ContextCompressorConfig,
  type ContextChunk,
  type ContextPriority,
  type CompressedContext,
} from './ai';

// ActionType from AI module (renamed to avoid conflict)
export type { ActionType as AIActionType } from './ai';

// 执行模块
export {
  PlanExecutor,
  ShellExecutor,
  FileExecutor,
  AutomationExecutor,
  ExecutionEngine,
  NutJSExecutor,
  ActionParser,
  ChromeDevToolsMCP,
  BrowserActionsExecutor,
  type PlanExecutorConfig,
  type StepExecutionResult as ExecutorStepResult,
  type PlanExecutionStatus,
  type PlanExecution,
  type ShellExecutorConfig,
  type ExecutionEngineConfig,
  type NutJSExecutorConfig,
  type ParseContext,
  type ParseResult,
  type GUIAction,
  type ActionResult,
  type MCPConfig,
  type BrowserAction,
} from './execution';

// 存储模块
export * from './storage';

// 文件监控模块
export * from './watcher';

// 同步模块
export * from './sync';

// 行为追踪模块
export * from './behavior';

// A2UI 零输入交互模块
export * from './a2ui';

// 认证与权限模块
export {
  PermissionManager,
  AuditLogManager,
  SessionManager,
  AuthManager,
  createPermissionManager,
  createAuditLogManager,
  createSessionManager,
  createAuthManager,
  getAuthManager,
  setAuthManager,
  BUILTIN_PERMISSIONS,
  BUILTIN_ROLES,
  type Permission,
  type PermissionScope,
  type PermissionCategory,
  type Role,
  type Session,
  type User,
  type AuditLogEntry,
  type AuditEventType,
  type RiskLevel as AuthRiskLevel,
  type AuthConfig,
  type PermissionManagerConfig,
  type SessionManagerConfig,
  type AuditLogConfig,
} from './auth';

// MemOS 记忆系统
export {
  MemOSManager,
  getMemOS,
  createMemOS,
  setMemOS,
  EpisodicMemoryManager,
  SemanticMemoryManager,
  ProceduralMemoryManager,
  WorkingMemoryManager,
  StateManager,
  createStateManager,
  SessionRecoveryManager,
  createSessionRecovery,
  type MemoryType,
  type EpisodicMemory,
  type SemanticMemory,
  type ProceduralMemory,
  type WorkingMemory,
  type TriggerType as MemoryTriggerType,
  type RecordedAction as MemoryRecordedAction,
  type MemOSConfig,
  type EpisodicMemoryConfig,
  type SemanticMemoryConfig,
  type ProceduralMemoryConfig,
  type WorkingMemoryConfig,
  type StateManagerConfig,
  type SessionRecoveryConfig,
} from './memory';

// 插件系统
export * from './plugin';

// 工作流系统
export {
  WorkflowManager,
  getWorkflowManager,
  createWorkflowManager,
  setWorkflowManager,
  type Workflow,
  type WorkflowStep,
  type WorkflowTrigger,
  type WorkflowManagerConfig,
  type WorkflowExecution,
  type StepExecutionResult as WorkflowStepResult,
  type WorkflowState,
  type WorkflowCategory,
  type ExecutionStatus,
} from './workflow';

// 主线任务 Dashboard
export * from './dashboard';

// 企业版功能
export * from './enterprise';

// 自主能力模块
export {
  PatternDetector,
  createPatternDetector,
  AutoSuggestEngine,
  createAutoSuggestEngine,
  ProactiveIntentDetector,
  createProactiveIntentDetector,
  AutonomousManager,
  createAutonomousManager,
  getAutonomousManager,
  setAutonomousManager,
  SkillLearner,
  getSkillLearner,
  createSkillLearner,
  setSkillLearner,
  SelfReflection,
  getSelfReflection,
  createSelfReflection,
  setSelfReflection,
  type AutonomousConfig,
  type SuggestedAction,
  type ProactiveIntent,
  type RecordedAction,
  type BehaviorPattern,
  type SuggestionFeedback,
  type AutonomousAnalysisResult,
  type RiskLevel as AutonomousRiskLevel,
  type LearnedSkill,
  type SkillLearnerConfig,
  type ReflectionEntry,
  type SelfReflectionConfig,
} from './autonomous';

// UI 定位模块 (UI Grounding) - 注意避免与 perception 模块的 OCRRegion/UIElement 冲突
export {
  // NMS 算法
  calculateIoU,
  calculateArea,
  getBoxCenter,
  calculateCenterDistance,
  containsBox,
  mergeBoxes,
  applyNMS,
  applySoftNMS,
  applyCategoryAwareNMS,
  applyHierarchicalNMS,
  removeDuplicates,
  filterByRegion,
  NMSProcessor,
  createNMSProcessor,
  // 元素检测器
  ElementDetector,
  createElementDetector,
  TesseractOCREngine,
  createTesseractOCREngine,
  type OCREngine,
  // UI Grounding Pipeline
  UIGroundingPipeline,
  createUIGroundingPipeline,
  getUIGroundingPipeline,
  setUIGroundingPipeline,
  // Grounding 类型 (使用别名避免冲突)
  type UIElement as GroundingUIElement,
  type UIElementType,
  type OCRRegion as GroundingOCRRegion,
  type BoundingBox,
  type Screenshot as GroundingScreenshot,
  type ElementDetectionResult,
  type LocateResult,
  type NMSConfig,
  type UIGroundingConfig,
} from './grounding';

// 安全模块
export {
  CommandChecker,
  getCommandChecker,
  createCommandChecker,
  setCommandChecker,
  FileSystemGuard,
  getFileSystemGuard,
  createFileSystemGuard,
  setFileSystemGuard,
  RollbackManager,
  getRollbackManager,
  createRollbackManager,
  setRollbackManager,
  type SecurityLevel,
  type RiskLevel as SecurityRiskLevel,
  type CommandType,
  type CommandCheckResult,
  type DangerousPattern,
  type CommandCheckerConfig,
  type FileSystemOperation,
  type FileSystemAccessResult,
  type FileSystemGuardConfig,
  type RollbackPoint,
  type RollbackOperation,
  type RollbackResult,
  type SecurityManagerConfig,
} from './security';

// 核心类型 (these take precedence)
export {
  type TaskType,
  type TaskStatus,
  type ActionType,
  type EngineConfig,
  type TaskSuggestion,
  type TaskAction,
  type ExecutionResult,
  type TaskExecution,
  type WindowInfo,
  type PerceptionContext,
} from './types';

// ScreenCapture interface from types (renamed to avoid conflict with class)
export type { ScreenCapture as ScreenCaptureResult } from './types';

// 主引擎（旧版兼容）
export { YanliqinEngine, YanliqinEngine as HawkeyeEngine } from './engine';

// 学习模块 (参考 OS-Copilot 轨迹学习)
export {
  TrajectoryLearning,
  createTrajectoryLearning,
  getTrajectoryLearning,
  setTrajectoryLearning,
  type TrajectoryActionType,
  type TrajectoryAction,
  type Trajectory,
  type TrajectoryPattern,
  type ActionPattern,
  type TrajectoryMatch,
  type TrajectoryAdaptation,
  type TrajectoryLearningConfig,
} from './learning';

// 新版统一引擎
export {
  Hawkeye,
  type HawkeyeConfig,
  type HawkeyeStatus,
  getHawkeye,
  createHawkeye,
} from './hawkeye';
