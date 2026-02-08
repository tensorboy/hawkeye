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
  type GeminiConfig,
  type OpenAICompatibleConfig,
  type AIManagerConfig,
  type AIRetryConfig,
  type ContextCompressorConfig,
  type ContextChunk,
  type ContextPriority,
  type CompressedContext,
} from './ai';

// 工具模块 (参考 steipete 项目模式)
export {
  DEFAULT_RETRY_CONFIG,
  calculateBackoffDelay,
  executeWithBackoff,
  executeWithBackoffAndAbort,
  withTimeout,
  RetryStrategy,
  type RetryConfig,
} from './utils';

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

// Browser Agent (状态机浏览器自动化)
export {
  type AgentState as BrowserAgentState,
  type StateMachineDefinition,
  type ObstacleDefinition,
  type BrowserAgentConfig,
  DEFAULT_BROWSER_AGENT_CONFIG,
  SiteRouter,
  StateMachineExecutor,
  ChangeObserver,
  ObstacleDetector,
  RuleEngine,
  AMAZON_MACHINE,
  YOUTUBE_MACHINE,
  GOOGLE_SEARCH_MACHINE,
  TAOBAO_MACHINE,
} from './execution/browser-agent';

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
  type SuggestionType,
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

// 调试模块
export {
  EventCollector,
  type DebugEvent,
  type DebugEventType,
  type DebugEventData,
  type ScreenshotEventData,
  type OCREventData,
  type ClipboardEventData,
  type WindowEventData,
  type FileEventData,
  type LLMInputEventData,
  type LLMOutputEventData,
  type IntentEventData,
  type PlanEventData,
  type ExecutionStartEventData,
  type ExecutionStepEventData,
  type ExecutionCompleteEventData,
  type ErrorEventData,
  type EventCollectorConfig,
  type EventFilter,
} from './debug';

// 优先级任务队列 (参考 steipete/poltergeist)
export {
  TaskQueue,
  getTaskQueue,
  createTaskQueue,
  TaskPriority,
  TaskStatus as QueueTaskStatus,
  DEFAULT_QUEUE_CONFIG,
  type QueuedTask,
  type RunningTask,
  type TaskResult as QueueTaskResult,
  type TaskQueueConfig,
  type TaskExecutor,
  type TaskExecutionContext,
  type TaskType as QueueTaskType,
  type TaskQueueEvents,
  type PlanExecutionTaskData,
  type StepExecutionTaskData,
  type AIRequestTaskData,
  type PerceptionTaskData,
} from './queue';

// 新版统一引擎
export {
  Hawkeye,
  type HawkeyeConfig,
  type HawkeyeStatus,
  getHawkeye,
  createHawkeye,
} from './hawkeye';

// MCP 工具类型
export {
  type MCPTool,
  type ToolResult,
  type MCPResource,
  type MCPPrompt,
  type JSONSchema,
  type ToolPermission,
} from './mcp/tool-types';

// MCP 内置工具集
export {
  ALL_BUILTIN_TOOLS,
  TOOL_CATEGORIES,
  registerBuiltinTools,
} from './mcp/builtin-tools';

// 内置技能/工具
export {
  WebSearchTool,
  type WebSearchConfig,
} from './skills/builtin/web-search';

export {
  SafetyCheckTool,
  QuickUrlCheckTool,
  type SafetyCheckConfig,
} from './skills/builtin/safety-check';

// 安全助手模块 (Safety Assistant)
export {
  SafetyAnalyzer,
  getSafetyAnalyzer,
  setSafetyAnalyzer,
  createSafetyAnalyzer,
  getAllThreatPatterns,
  getThreatPatternsByCategory,
  getThreatPatternsByType,
  THREAT_TYPE_DESCRIPTIONS,
  RISK_LEVEL_DESCRIPTIONS,
  URL_THREAT_PATTERNS,
  TEXT_THREAT_PATTERNS,
  EMAIL_THREAT_PATTERNS,
  GENERAL_THREAT_PATTERNS,
  type ThreatType,
  type SafetyRiskLevel,
  type ThreatIndicator,
  type SafetyAnalysisResult,
  type GroundingInfo,
  type GroundingResult,
  type SafetyCheckInput,
  type SafetyAnalyzerConfig,
  type ThreatPattern,
  type A2UISafetyAlertCard,
  type KnownScamEntry,
  type SafetyHistoryEntry,
} from './safety';

// 人生树模块 (Life Tree)
export {
  LifeTreeBuilder,
  ExperimentEngine,
  LIFE_STAGES,
  LIFE_STAGE_LABELS,
  APP_STAGE_HEURISTICS,
  DEFAULT_LIFE_TREE_CONFIG,
  LIFE_TREE_SYSTEM_PROMPT,
  buildClassificationPrompt,
  buildGoalInferencePrompt,
  buildExperimentProposalPrompt,
  buildTreeSummaryPrompt,
  type LifeTreeNodeType,
  type NodeStatus,
  type ExperimentStatus,
  type ExperimentPhase,
  type DataSource,
  type LifeStage,
  type LifeTreeNode,
  type LifeTreeNodeMetadata,
  type ExperimentConfig,
  type AutomationStep,
  type ExperimentResult,
  type LifeTree,
  type LifeTreeStats,
  type LifeTreeNodeRecord,
  type LifeTreeSnapshotRecord,
  type ExperimentRecord,
  type LifeTreeConfig,
  type StageClassification,
  type GoalInference,
  type ExperimentProposal,
} from './life-tree';

// 存储模块
export {
  type ContextRecord,
  type DatabaseConfig,
  type HawkeyeDatabase,
  type ActivitySummaryRecord,
} from './storage/database';

// 调度器模块 (基于 nanobot 设计模式)
export {
  // CronService
  CronService,
  createCronService,
  // HeartbeatService
  HeartbeatService,
  createHeartbeatService,
  // Builtin handlers
  registerBuiltinHandlers,
  BuiltinHandlerNames,
  // Cron utilities
  parseCronExpression,
  getNextCronTime,
  computeNextRunTime,
  validateCronExpression,
  describeCronExpression,
  generateJobId,
  // Constants
  DEFAULT_CRON_SERVICE_CONFIG,
  DEFAULT_HEARTBEAT_CONFIG,
  // Types
  type ScheduleKind,
  type CronSchedule,
  type CronPayloadKind,
  type CronPayload,
  type JobStatus,
  type CronJobState,
  type CronJob,
  type CreateJobInput,
  type UpdateJobInput,
  type CronServiceConfig,
  type HeartbeatConfig,
  type HeartbeatResult,
  type CronServiceEvents,
  type HeartbeatServiceEvents,
  type JobHandler,
  type JobExecutionContext,
  type LifeTreeGoal,
} from './scheduler';

// DailyNotes from memory (基于 nanobot 设计模式)
export {
  DailyNotesManager,
  createDailyNotesManager,
  DEFAULT_DAILY_NOTES_CONFIG,
  DEFAULT_DAILY_NOTE_TEMPLATE,
  type DailyNote,
  type DailyNoteMetadata,
  type DailyNoteSections,
  type DailyNotesConfig,
  type DailyNotesEvents,
  type DailyNotesSearchOptions,
  type DailyNotesSearchResult,
  type DailyNoteSectionId,
  type TemplateVariables,
} from './memory';

// Life Template (Dynamic Personal Development System)
export {
  LifeTemplateManager,
  getLifeTemplateManager,
  setLifeTemplateManager,
  createLifeTemplateManager,
  DEFAULT_LIFE_TEMPLATE_CONFIG,
  ERIKSON_STAGES,
  WHEEL_CATEGORIES,
  type LifeTemplate,
  type LifeTemplateConfig,
  type LifeTemplateEvents,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type TemplateSummary,
  type TemplateSnapshot,
  type DailyActivitySummary,
  type BigFivePersonality,
  type PsychodynamicProfile,
  type DefenseMechanism,
  type WheelOfLife,
  type WheelOfLifeCategory,
  type WheelCategoryMeta,
  type Ikigai,
  type IkigaiIntersection,
  type IkigaiIntersectionType,
  type EriksonStage,
  type EriksonStageNumber,
  type EriksonProgress,
  type LifeNarrative,
  type LifeChapter,
  type TurningPoint,
  type NarrativeTheme,
  type SelfDefiningMemory,
  type AppUsageEntry,
  type AppCategory,
  type CompletedGoal,
  type MoodEntry,
} from './memory';

// Knowledge Graph Memory (three-layer architecture)
export {
  KnowledgeGraphStore,
  ExtractionPipeline,
  StalenessQueue,
  ContextAssembler,
  SelfImprovementManager,
  calculateCost,
  estimateTokens,
  formatCost,
  LLM_PRICING,
  DEFAULT_STALENESS_CONFIG,
  DEFAULT_CONTEXT_BUDGET,
  DEFAULT_EXTRACTION_CONFIG,
  DEFAULT_ASSEMBLER_CONFIG,
  DEFAULT_SELF_IMPROVEMENT_CONFIG,
  type KGEntity,
  type KGEntityType,
  type KGEdge,
  type KGRelationType,
  type KGFact,
  type KGFactType,
  type HierarchicalSummary,
  type SummaryNodeType,
  type StalenessConfig,
  type ContextBudget,
  type AssembledContext,
  type ExtractionEvent,
  type ExtractionResult,
  type ExtractedTopic,
  type ExtractionConfig,
  type LearningRecord,
  type LearningType,
  type CostEntry,
  type CostSource,
  type CostReport,
  type KnowledgeGraphStoreConfig,
  type ContextAssemblerConfig,
  type SelfImprovementConfig,
  type LLMCallFunction,
  type SummaryRefreshFunction,
} from './memory';
