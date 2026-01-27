/**
 * Life Tree — Tree Builder
 *
 * Constructs and updates the Life Tree from perception data and behavior patterns.
 */

import type {
  LifeTree,
  LifeTreeNode,
  LifeTreeNodeType,
  LifeStage,
  LifeTreeConfig,
  LifeTreeStats,
  LifeTreeNodeRecord,
  StageClassification,
  GoalInference,
  DataSource,
} from './types';
import { LIFE_STAGES, LIFE_STAGE_LABELS, APP_STAGE_HEURISTICS, DEFAULT_LIFE_TREE_CONFIG } from './types';
import {
  LIFE_TREE_SYSTEM_PROMPT,
  buildClassificationPrompt,
  buildGoalInferencePrompt,
  buildTreeSummaryPrompt,
} from './ai-prompts';
import type { ContextRecord } from '../storage/database';

// ============ ID Generation ============

let _counter = 0;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++_counter}`;
}

// ============ LifeTreeBuilder ============

export class LifeTreeBuilder {
  private config: LifeTreeConfig;
  private aiChat: ((system: string, user: string) => Promise<string>) | null = null;

  constructor(config: Partial<LifeTreeConfig> = {}) {
    this.config = { ...DEFAULT_LIFE_TREE_CONFIG, ...config };
  }

  /**
   * Set the AI chat function for LLM-based classification.
   * Signature: (systemPrompt, userPrompt) => responseText
   */
  setAIChat(fn: (system: string, user: string) => Promise<string>): void {
    this.aiChat = fn;
  }

  // ============ Build Full Tree ============

  /**
   * Build a full LifeTree from flat node records (e.g. from database).
   */
  buildFromRecords(records: LifeTreeNodeRecord[]): LifeTree {
    const now = Date.now();
    const root = this.createRootNode();

    // Group by parent
    const childrenMap = new Map<string | null, LifeTreeNodeRecord[]>();
    for (const rec of records) {
      const pid = rec.parentId;
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid)!.push(rec);
    }

    // Attach stage nodes to root
    const stageRecords = childrenMap.get(root.id) ?? [];
    for (const sr of stageRecords) {
      const stageNode = this.recordToNode(sr);
      this.attachChildren(stageNode, childrenMap);
      root.children.push(stageNode);
    }

    // Ensure all 6 stages exist
    for (const stage of LIFE_STAGES) {
      if (!root.children.find(c => c.stage === stage)) {
        root.children.push(this.createStageNode(stage, root.id));
      }
    }

    const stats = this.computeStats(root);
    return {
      id: generateId('tree'),
      root,
      version: records.length > 0 ? (records[0].treeVersion ?? 1) : 1,
      createdAt: now,
      updatedAt: now,
      stats,
    };
  }

  /**
   * Build an empty tree with all 6 stages.
   */
  buildEmpty(): LifeTree {
    const now = Date.now();
    const root = this.createRootNode();
    for (const stage of LIFE_STAGES) {
      root.children.push(this.createStageNode(stage, root.id));
    }
    return {
      id: generateId('tree'),
      root,
      version: 1,
      createdAt: now,
      updatedAt: now,
      stats: this.computeStats(root),
    };
  }

  // ============ Incremental Update ============

  /**
   * Process a new context record and update the tree.
   * Returns the updated tree and any new/modified node IDs.
   */
  async updateFromContext(
    tree: LifeTree,
    context: ContextRecord,
  ): Promise<{ tree: LifeTree; updatedNodeIds: string[] }> {
    const updatedIds: string[] = [];

    // 1. Classify activity into a life stage
    const classification = await this.classifyStage(context);
    if (classification.confidence < this.config.minConfidence) {
      return { tree, updatedNodeIds: [] };
    }

    // 2. Find or create stage node
    const stageNode = tree.root.children.find(c => c.stage === classification.stage);
    if (!stageNode) return { tree, updatedNodeIds: [] };

    // 3. Find or create task node under the stage
    const taskLabel = this.extractTaskLabel(context);
    let taskNode = stageNode.children
      .flatMap(g => g.children)
      .find(t => t.type === 'task' && t.label === taskLabel);

    if (taskNode) {
      // Update existing task
      taskNode.metadata.lastSeen = Date.now();
      taskNode.metadata.frequency += 1;
      taskNode.confidence = Math.min(1, taskNode.confidence + 0.02);
      updatedIds.push(taskNode.id);
    } else {
      // Create new task — attach to first goal or directly to stage
      const parentNode = stageNode.children.length > 0 ? stageNode.children[0] : stageNode;
      taskNode = this.createTaskNode(taskLabel, parentNode.id, classification.stage, this.inferSource(context));
      parentNode.children.push(taskNode);
      updatedIds.push(taskNode.id);
    }

    // Update stage lastSeen
    stageNode.metadata.lastSeen = Date.now();
    stageNode.metadata.frequency += 1;

    tree.updatedAt = Date.now();
    tree.stats = this.computeStats(tree.root);
    return { tree, updatedNodeIds: updatedIds };
  }

  // ============ Stage Classification ============

  /**
   * Classify a context record into a life stage.
   * Uses heuristics first, falls back to AI if available.
   */
  async classifyStage(context: ContextRecord): Promise<StageClassification> {
    // Heuristic: check app name against known mappings
    const heuristicResult = this.classifyByHeuristic(context);
    if (heuristicResult && heuristicResult.confidence >= 0.7) {
      return heuristicResult;
    }

    // AI classification
    if (this.aiChat) {
      try {
        const prompt = buildClassificationPrompt(context);
        const response = await this.aiChat(LIFE_TREE_SYSTEM_PROMPT, prompt);
        const parsed = JSON.parse(response) as StageClassification;
        if (parsed.stage && parsed.confidence != null) {
          return parsed;
        }
      } catch {
        // Fall through to heuristic
      }
    }

    // Return heuristic result or default
    return heuristicResult ?? { stage: 'career', confidence: 0.3, reasoning: 'default fallback' };
  }

  /**
   * Infer goals from observed tasks using AI.
   */
  async inferGoals(
    stage: LifeStage,
    tasks: Array<{ label: string; frequency: number; id: string }>,
    timeWindowDays: number = 7,
  ): Promise<GoalInference[]> {
    if (!this.aiChat || tasks.length === 0) return [];

    try {
      const prompt = buildGoalInferencePrompt(stage, tasks, timeWindowDays);
      const response = await this.aiChat(LIFE_TREE_SYSTEM_PROMPT, prompt);
      return JSON.parse(response) as GoalInference[];
    } catch {
      return [];
    }
  }

  /**
   * Generate a summary of the current tree state.
   */
  async summarizeTree(tree: LifeTree): Promise<{ summary: string; focusAreas: string[]; neglectedAreas: string[] }> {
    const labels = this.collectNodeLabels(tree.root);
    if (!this.aiChat || labels.length === 0) {
      return { summary: '', focusAreas: [], neglectedAreas: [] };
    }

    try {
      const prompt = buildTreeSummaryPrompt(labels);
      const response = await this.aiChat(LIFE_TREE_SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(response);
      return {
        summary: parsed.summary ?? '',
        focusAreas: parsed.focus_areas ?? [],
        neglectedAreas: parsed.neglected_areas ?? [],
      };
    } catch {
      return { summary: '', focusAreas: [], neglectedAreas: [] };
    }
  }

  // ============ Serialization ============

  /**
   * Flatten a tree into records suitable for database storage.
   */
  flattenTree(tree: LifeTree): LifeTreeNodeRecord[] {
    const records: LifeTreeNodeRecord[] = [];
    const now = Date.now();

    const walk = (node: LifeTreeNode): void => {
      records.push({
        id: node.id,
        parentId: node.parentId,
        label: node.label,
        type: node.type,
        status: node.status,
        stage: node.stage,
        confidence: node.confidence,
        firstSeen: node.metadata.firstSeen,
        lastSeen: node.metadata.lastSeen,
        frequency: node.metadata.frequency,
        source: node.metadata.source,
        description: node.metadata.description,
        tags: JSON.stringify(node.metadata.tags),
        experimentStatus: node.metadata.experimentStatus,
        experimentPhase: node.metadata.experimentPhase,
        experimentConfig: node.metadata.experimentConfig ? JSON.stringify(node.metadata.experimentConfig) : undefined,
        experimentResults: node.metadata.experimentResults ? JSON.stringify(node.metadata.experimentResults) : undefined,
        treeVersion: tree.version,
        createdAt: node.metadata.firstSeen,
        updatedAt: now,
      });
      for (const child of node.children) walk(child);
    };

    walk(tree.root);
    return records;
  }

  /**
   * Hydrate a tree from a JSON snapshot string.
   */
  hydrateFromSnapshot(snapshotJson: string): LifeTree {
    return JSON.parse(snapshotJson) as LifeTree;
  }

  /**
   * Serialize a tree to a JSON snapshot string.
   */
  serializeToSnapshot(tree: LifeTree): string {
    return JSON.stringify(tree);
  }

  // ============ Private Helpers ============

  private createRootNode(): LifeTreeNode {
    const now = Date.now();
    return {
      id: 'root',
      parentId: null,
      label: 'Life Tree',
      type: 'root',
      status: 'active',
      confidence: 1,
      children: [],
      metadata: {
        firstSeen: now,
        lastSeen: now,
        frequency: 0,
        source: 'inferred',
        tags: [],
      },
    };
  }

  private createStageNode(stage: LifeStage, parentId: string): LifeTreeNode {
    const now = Date.now();
    return {
      id: generateId('stage'),
      parentId,
      label: LIFE_STAGE_LABELS[stage],
      type: 'stage',
      status: 'active',
      stage,
      confidence: 1,
      children: [],
      metadata: {
        firstSeen: now,
        lastSeen: now,
        frequency: 0,
        source: 'inferred',
        tags: [stage],
      },
    };
  }

  private createTaskNode(label: string, parentId: string, stage: LifeStage, source: DataSource): LifeTreeNode {
    const now = Date.now();
    return {
      id: generateId('task'),
      parentId,
      label,
      type: 'task',
      status: 'active',
      stage,
      confidence: 0.6,
      children: [],
      metadata: {
        firstSeen: now,
        lastSeen: now,
        frequency: 1,
        source,
        tags: [stage],
      },
    };
  }

  private recordToNode(rec: LifeTreeNodeRecord): LifeTreeNode {
    return {
      id: rec.id,
      parentId: rec.parentId,
      label: rec.label,
      type: rec.type as LifeTreeNodeType,
      status: rec.status as LifeTreeNode['status'],
      stage: rec.stage as LifeStage | undefined,
      confidence: rec.confidence,
      children: [],
      metadata: {
        firstSeen: rec.firstSeen,
        lastSeen: rec.lastSeen,
        frequency: rec.frequency,
        source: rec.source as DataSource,
        description: rec.description,
        tags: rec.tags ? JSON.parse(rec.tags) : [],
        experimentStatus: rec.experimentStatus as LifeTreeNode['metadata']['experimentStatus'],
        experimentPhase: rec.experimentPhase as LifeTreeNode['metadata']['experimentPhase'],
        experimentConfig: rec.experimentConfig ? JSON.parse(rec.experimentConfig) : undefined,
        experimentResults: rec.experimentResults ? JSON.parse(rec.experimentResults) : undefined,
      },
    };
  }

  private attachChildren(node: LifeTreeNode, childrenMap: Map<string | null, LifeTreeNodeRecord[]>): void {
    const childRecords = childrenMap.get(node.id) ?? [];
    for (const cr of childRecords) {
      const child = this.recordToNode(cr);
      this.attachChildren(child, childrenMap);
      node.children.push(child);
    }
  }

  private classifyByHeuristic(context: ContextRecord): StageClassification | null {
    const appName = (context.appName ?? '').toLowerCase().trim();
    if (!appName) return null;

    for (const [key, stage] of Object.entries(APP_STAGE_HEURISTICS)) {
      if (appName.includes(key)) {
        return { stage, confidence: 0.8, reasoning: `App "${context.appName}" matched heuristic for ${stage}` };
      }
    }
    return null;
  }

  private extractTaskLabel(context: ContextRecord): string {
    // Prefer window title, then app name, then a truncated OCR excerpt
    if (context.windowTitle) {
      // Trim common suffixes like "— Visual Studio Code"
      const parts = context.windowTitle.split(/\s[—\-|]\s/);
      return parts[0].trim().slice(0, 80);
    }
    if (context.appName) return context.appName;
    if (context.ocrText) return context.ocrText.slice(0, 60).trim();
    return 'Unknown Activity';
  }

  private inferSource(context: ContextRecord): DataSource {
    if (context.ocrText) return 'ocr';
    if (context.clipboard) return 'clipboard';
    if (context.windowTitle) return 'window';
    return 'inferred';
  }

  private computeStats(root: LifeTreeNode): LifeTreeStats {
    let totalNodes = 0;
    let activeExperiments = 0;
    let succeededExperiments = 0;
    let failedExperiments = 0;
    let goalsCount = 0;
    let tasksCount = 0;

    const walk = (node: LifeTreeNode): void => {
      totalNodes++;
      if (node.type === 'goal') goalsCount++;
      if (node.type === 'task') tasksCount++;
      if (node.type === 'experiment') {
        if (node.metadata.experimentStatus === 'running') activeExperiments++;
        if (node.metadata.experimentStatus === 'succeeded') succeededExperiments++;
        if (node.metadata.experimentStatus === 'failed') failedExperiments++;
      }
      for (const child of node.children) walk(child);
    };

    walk(root);

    return {
      totalNodes,
      activeExperiments,
      succeededExperiments,
      failedExperiments,
      stagesCount: root.children.filter(c => c.type === 'stage').length,
      goalsCount,
      tasksCount,
      lastAIUpdate: Date.now(),
    };
  }

  private collectNodeLabels(node: LifeTreeNode, depth = 0): string[] {
    if (depth > this.config.maxTreeDepth) return [];
    const labels: string[] = [];
    if (node.type !== 'root') {
      labels.push(`[${node.type}] ${node.label}`);
    }
    for (const child of node.children) {
      labels.push(...this.collectNodeLabels(child, depth + 1));
    }
    return labels;
  }
}
