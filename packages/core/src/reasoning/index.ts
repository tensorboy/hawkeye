/**
 * 推理模块 - AI 分析和建议生成
 */

export { ClaudeClient } from './claude';
export { SuggestionGenerator } from './suggestions';
export { ReasoningEngine } from './engine';

// 新增：意图识别和计划生成
export { IntentEngine, type IntentEngineConfig } from './intent-engine';
export { PlanGenerator, type PlanGeneratorConfig } from './plan-generator';

// 计划分析器 - 利弊分析、风险评估、习惯对齐
export {
  PlanAnalyzer,
  type ProPoint,
  type ConPoint,
  type RiskAssessment,
  type ImpactScope,
  type HabitAlignment,
  type EfficiencyMetrics,
  type PlanAnalysis,
  type PlanComparisonResult,
} from './plan-analyzer';
