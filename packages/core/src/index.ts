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
  AIManager,
  getAIManager,
  createAIManager,
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
  type AIManagerConfig,
} from './ai';

// ActionType from AI module (renamed to avoid conflict)
export type { ActionType as AIActionType } from './ai';

// 执行模块
export * from './execution';

// 存储模块
export * from './storage';

// 文件监控模块
export * from './watcher';

// 同步模块
export * from './sync';

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

// 新版统一引擎
export {
  Hawkeye,
  type HawkeyeConfig,
  type HawkeyeStatus,
  getHawkeye,
  createHawkeye,
} from './hawkeye';
