/**
 * Life Tree — Barrel Export
 *
 * Hierarchical visualization of life stages, goals, tasks, and AI experiments.
 */

// Types
export type {
  LifeTreeNodeType,
  NodeStatus,
  ExperimentStatus,
  ExperimentPhase,
  DataSource,
  LifeStage,
  LifeTreeNode,
  LifeTreeNodeMetadata,
  ExperimentConfig,
  AutomationStep,
  ExperimentResult,
  LifeTree,
  LifeTreeStats,
  LifeTreeNodeRecord,
  LifeTreeSnapshotRecord,
  ExperimentRecord,
  LifeTreeConfig,
  StageClassification,
  GoalInference,
  ExperimentProposal,
} from './types';

export {
  LIFE_STAGES,
  LIFE_STAGE_LABELS,
  APP_STAGE_HEURISTICS,
  DEFAULT_LIFE_TREE_CONFIG,
} from './types';

// AI Prompts
export {
  LIFE_TREE_SYSTEM_PROMPT,
  buildClassificationPrompt,
  buildGoalInferencePrompt,
  buildExperimentProposalPrompt,
  buildTreeSummaryPrompt,
} from './ai-prompts';

// Tree Builder
export { LifeTreeBuilder } from './tree-builder';

// Experiment Engine
export { ExperimentEngine } from './experiment-engine';
