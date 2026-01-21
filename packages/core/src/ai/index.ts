/**
 * AI 模块 - Provider 管理和 AI 能力
 */

// 类型导出
export type {
  AIProviderType,
  AIProviderConfig,
  AIMessage,
  AIMessageContent,
  AIResponse,
  IAIProvider,
  UserIntent,
  IntentType,
  IntentEntity,
  IntentContext,
  ExecutionPlan,
  PlanStep,
  ActionType,
  AlternativePlan,
  PlanImpact,
} from './types';

// Provider 导出
export { OllamaProvider, type OllamaConfig } from './providers/ollama';
export { GeminiProvider, type GeminiConfig } from './providers/gemini';

// Manager 导出
export {
  AIManager,
  type AIManagerConfig,
  getAIManager,
  createAIManager,
} from './manager';
