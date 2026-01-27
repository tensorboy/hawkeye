/**
 * Life Tree — 人生树类型定义
 *
 * Hierarchical visualization of life stages, goals, tasks, and AI experiments.
 * Tree depth: root → stage → goal → task/experiment (4 levels max)
 */

// ============ Node Types ============

export type LifeTreeNodeType = 'root' | 'stage' | 'goal' | 'task' | 'experiment';
export type NodeStatus = 'active' | 'completed' | 'paused' | 'archived';
export type ExperimentStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type ExperimentPhase = 'task' | 'goal' | 'automation';
export type DataSource = 'ocr' | 'clipboard' | 'file' | 'window' | 'inferred' | 'manual';

// ============ Life Stages ============

export const LIFE_STAGES = [
  'career',
  'learning',
  'health',
  'relationships',
  'creativity',
  'finance',
] as const;

export type LifeStage = typeof LIFE_STAGES[number];

export const LIFE_STAGE_LABELS: Record<LifeStage, string> = {
  career: 'Career',
  learning: 'Learning',
  health: 'Health',
  relationships: 'Relationships',
  creativity: 'Creativity',
  finance: 'Finance',
};

// ============ Core Data Model ============

export interface LifeTreeNode {
  id: string;
  parentId: string | null;
  label: string;
  type: LifeTreeNodeType;
  status: NodeStatus;
  stage?: LifeStage;
  confidence: number;
  children: LifeTreeNode[];
  metadata: LifeTreeNodeMetadata;
}

export interface LifeTreeNodeMetadata {
  firstSeen: number;
  lastSeen: number;
  frequency: number;
  source: DataSource;
  description?: string;
  tags: string[];
  // Experiment-specific
  experimentStatus?: ExperimentStatus;
  experimentPhase?: ExperimentPhase;
  experimentConfig?: ExperimentConfig;
  experimentResults?: ExperimentResult[];
}

// ============ Experiments ============

export interface ExperimentConfig {
  phase: ExperimentPhase;
  hypothesis: string;
  description: string;
  durationDays: number;
  startedAt?: number;
  completedAt?: number;
  metrics: string[];
  automationSteps?: AutomationStep[];
}

export interface AutomationStep {
  action: string;
  params: Record<string, unknown>;
  order: number;
}

export interface ExperimentResult {
  metricName: string;
  baseline: number;
  measured: number;
  improvement: number;
  timestamp: number;
}

// ============ Full Tree Snapshot ============

export interface LifeTree {
  id: string;
  root: LifeTreeNode;
  version: number;
  createdAt: number;
  updatedAt: number;
  stats: LifeTreeStats;
}

export interface LifeTreeStats {
  totalNodes: number;
  activeExperiments: number;
  succeededExperiments: number;
  failedExperiments: number;
  stagesCount: number;
  goalsCount: number;
  tasksCount: number;
  lastAIUpdate: number;
}

// ============ Flat Record (for DB storage) ============

export interface LifeTreeNodeRecord {
  id: string;
  parentId: string | null;
  label: string;
  type: LifeTreeNodeType;
  status: NodeStatus;
  stage?: LifeStage;
  confidence: number;
  firstSeen: number;
  lastSeen: number;
  frequency: number;
  source: DataSource;
  description?: string;
  tags: string;           // JSON array
  experimentStatus?: ExperimentStatus;
  experimentPhase?: ExperimentPhase;
  experimentConfig?: string;  // JSON
  experimentResults?: string; // JSON array
  treeVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface LifeTreeSnapshotRecord {
  id: string;
  version: number;
  treeData: string;  // JSON serialized LifeTree
  totalNodes: number;
  activeExperiments: number;
  createdAt: number;
}

export interface ExperimentRecord {
  id: string;
  nodeId: string;
  phase: ExperimentPhase;
  hypothesis: string;
  status: ExperimentStatus;
  startedAt?: number;
  completedAt?: number;
  config: string;    // JSON
  results?: string;  // JSON array
  createdAt: number;
}

// ============ Configuration ============

export interface LifeTreeConfig {
  /** Minimum AI confidence to include a node (0-1) */
  minConfidence: number;
  /** Maximum tree depth (default 4) */
  maxTreeDepth: number;
  /** Cooldown between experiment proposals (ms) */
  experimentCooldownMs: number;
  /** How often to re-infer stages (ms) */
  stageInferenceIntervalMs: number;
  /** Collapse failed experiments by default */
  collapseFailedExperiments: boolean;
  /** Phase 2 unlock threshold: completed Phase 1 experiments */
  phase2UnlockThreshold: number;
  /** Phase 3 unlock threshold: successful Phase 2 experiments */
  phase3UnlockThreshold: number;
}

export const DEFAULT_LIFE_TREE_CONFIG: LifeTreeConfig = {
  minConfidence: 0.5,
  maxTreeDepth: 4,
  experimentCooldownMs: 24 * 60 * 60 * 1000, // 24 hours
  stageInferenceIntervalMs: 6 * 60 * 60 * 1000, // 6 hours
  collapseFailedExperiments: true,
  phase2UnlockThreshold: 3,
  phase3UnlockThreshold: 2,
};

// ============ AI Classification Types ============

export interface StageClassification {
  stage: LifeStage;
  confidence: number;
  reasoning: string;
}

export interface GoalInference {
  label: string;
  description: string;
  confidence: number;
  supportingTaskIds: string[];
}

export interface ExperimentProposal {
  hypothesis: string;
  description: string;
  durationDays: number;
  metrics: string[];
  steps?: string[];
}

// ============ App-to-Stage Heuristic Mapping ============

export const APP_STAGE_HEURISTICS: Record<string, LifeStage> = {
  // Career
  'visual studio code': 'career',
  'vscode': 'career',
  'intellij': 'career',
  'xcode': 'career',
  'terminal': 'career',
  'iterm': 'career',
  'slack': 'career',
  'teams': 'career',
  'zoom': 'career',
  'jira': 'career',
  'linear': 'career',
  'figma': 'career',
  'postman': 'career',
  'docker': 'career',
  // Learning
  'duolingo': 'learning',
  'anki': 'learning',
  'coursera': 'learning',
  'udemy': 'learning',
  'kindle': 'learning',
  'notion': 'learning',
  'obsidian': 'learning',
  // Health
  'strava': 'health',
  'headspace': 'health',
  'calm': 'health',
  'myfitnesspal': 'health',
  // Relationships
  'messages': 'relationships',
  'whatsapp': 'relationships',
  'telegram': 'relationships',
  'discord': 'relationships',
  'wechat': 'relationships',
  // Creativity
  'photoshop': 'creativity',
  'illustrator': 'creativity',
  'garageband': 'creativity',
  'logic pro': 'creativity',
  'blender': 'creativity',
  'procreate': 'creativity',
  // Finance
  'mint': 'finance',
  'robinhood': 'finance',
  'coinbase': 'finance',
  'excel': 'finance',
  'numbers': 'finance',
};
