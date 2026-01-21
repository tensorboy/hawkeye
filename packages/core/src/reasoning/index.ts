/**
 * 推理模块 - AI 分析和建议生成
 */

export { ClaudeClient } from './claude';
export { SuggestionGenerator } from './suggestions';
export { ReasoningEngine } from './engine';

// 新增：意图识别和计划生成
export { IntentEngine, type IntentEngineConfig } from './intent-engine';
export { PlanGenerator, type PlanGeneratorConfig } from './plan-generator';
