/**
 * Life Tree — Experiment Engine
 *
 * Manages AI-driven micro-experiments across three phases:
 * Phase 1 (task): Small productivity tweaks (1–3 days)
 * Phase 2 (goal): Strategy changes (requires 3+ completed Phase 1)
 * Phase 3 (automation): Workflow automation (requires 2+ successful Phase 2)
 */

import type {
  LifeTree,
  LifeTreeNode,
  ExperimentConfig,
  ExperimentResult,
  ExperimentPhase,
  ExperimentStatus,
  ExperimentProposal,
  ExperimentRecord,
  LifeTreeConfig,
} from './types';
import { DEFAULT_LIFE_TREE_CONFIG } from './types';
import { LIFE_TREE_SYSTEM_PROMPT, buildExperimentProposalPrompt } from './ai-prompts';

// ============ ID Generation ============

let _expCounter = 0;
function generateExpId(): string {
  return `exp_${Date.now()}_${++_expCounter}`;
}

// ============ ExperimentEngine ============

export class ExperimentEngine {
  private config: LifeTreeConfig;
  private aiChat: ((system: string, user: string) => Promise<string>) | null = null;

  constructor(config: Partial<LifeTreeConfig> = {}) {
    this.config = { ...DEFAULT_LIFE_TREE_CONFIG, ...config };
  }

  /**
   * Set the AI chat function for experiment proposals.
   */
  setAIChat(fn: (system: string, user: string) => Promise<string>): void {
    this.aiChat = fn;
  }

  // ============ Phase Gating ============

  /**
   * Get the highest unlocked experiment phase for the tree.
   */
  getUnlockedPhase(tree: LifeTree): ExperimentPhase {
    const stats = tree.stats;

    // Phase 3 requires N successful Phase 2 experiments
    if (this.countExperimentsByPhaseAndStatus(tree, 'goal', 'succeeded') >= this.config.phase3UnlockThreshold) {
      return 'automation';
    }

    // Phase 2 requires N completed Phase 1 experiments
    const completedPhase1 =
      this.countExperimentsByPhaseAndStatus(tree, 'task', 'succeeded') +
      this.countExperimentsByPhaseAndStatus(tree, 'task', 'failed');
    if (completedPhase1 >= this.config.phase2UnlockThreshold) {
      return 'goal';
    }

    return 'task';
  }

  /**
   * Check if a given phase is unlocked.
   */
  isPhaseUnlocked(tree: LifeTree, phase: ExperimentPhase): boolean {
    const unlocked = this.getUnlockedPhase(tree);
    const order: ExperimentPhase[] = ['task', 'goal', 'automation'];
    return order.indexOf(phase) <= order.indexOf(unlocked);
  }

  // ============ Propose Experiments ============

  /**
   * Propose a new experiment for a target node.
   */
  async proposeExperiment(
    tree: LifeTree,
    targetNodeId: string,
    phase?: ExperimentPhase,
  ): Promise<ExperimentProposal | null> {
    const targetNode = this.findNode(tree.root, targetNodeId);
    if (!targetNode) return null;

    // Determine phase
    const effectivePhase = phase ?? this.getUnlockedPhase(tree);
    if (!this.isPhaseUnlocked(tree, effectivePhase)) return null;

    // Check cooldown: don't propose if a recent experiment exists on this node
    if (this.isOnCooldown(targetNode)) return null;

    // Build task summary from node's children
    const taskSummary = targetNode.children
      .filter(c => c.type === 'task')
      .map(c => `"${c.label}" (${c.metadata.frequency}x)`)
      .join(', ') || targetNode.label;

    if (!this.aiChat) {
      // Return a default proposal without AI
      return {
        hypothesis: `Improve efficiency of "${targetNode.label}"`,
        description: `Try a new approach to "${targetNode.label}" tasks`,
        durationDays: effectivePhase === 'task' ? 2 : effectivePhase === 'goal' ? 7 : 14,
        metrics: ['time_spent', 'completion_rate'],
      };
    }

    try {
      const prompt = buildExperimentProposalPrompt(effectivePhase, targetNode, taskSummary);
      const response = await this.aiChat(LIFE_TREE_SYSTEM_PROMPT, prompt);
      return JSON.parse(response) as ExperimentProposal;
    } catch {
      return null;
    }
  }

  // ============ Lifecycle ============

  /**
   * Start an experiment — attach it as a child node of the target.
   * Returns the new experiment node.
   */
  startExperiment(
    tree: LifeTree,
    targetNodeId: string,
    proposal: ExperimentProposal,
    phase: ExperimentPhase,
  ): LifeTreeNode | null {
    const targetNode = this.findNode(tree.root, targetNodeId);
    if (!targetNode) return null;

    const now = Date.now();
    const expNode: LifeTreeNode = {
      id: generateExpId(),
      parentId: targetNodeId,
      label: proposal.hypothesis,
      type: 'experiment',
      status: 'active',
      stage: targetNode.stage,
      confidence: 0.5,
      children: [],
      metadata: {
        firstSeen: now,
        lastSeen: now,
        frequency: 0,
        source: 'inferred',
        tags: ['experiment', phase],
        experimentStatus: 'running',
        experimentPhase: phase,
        experimentConfig: {
          phase,
          hypothesis: proposal.hypothesis,
          description: proposal.description,
          durationDays: proposal.durationDays,
          startedAt: now,
          metrics: proposal.metrics,
          automationSteps: proposal.steps?.map((s, i) => ({
            action: s,
            params: {},
            order: i,
          })),
        },
        experimentResults: [],
      },
    };

    targetNode.children.push(expNode);
    tree.updatedAt = now;
    return expNode;
  }

  /**
   * Record a metric measurement for a running experiment.
   */
  recordMetric(
    tree: LifeTree,
    experimentNodeId: string,
    metricName: string,
    baseline: number,
    measured: number,
  ): boolean {
    const expNode = this.findNode(tree.root, experimentNodeId);
    if (!expNode || expNode.type !== 'experiment') return false;
    if (expNode.metadata.experimentStatus !== 'running') return false;

    const result: ExperimentResult = {
      metricName,
      baseline,
      measured,
      improvement: baseline > 0 ? ((measured - baseline) / baseline) * 100 : 0,
      timestamp: Date.now(),
    };

    if (!expNode.metadata.experimentResults) {
      expNode.metadata.experimentResults = [];
    }
    expNode.metadata.experimentResults.push(result);
    expNode.metadata.lastSeen = Date.now();
    tree.updatedAt = Date.now();
    return true;
  }

  /**
   * Conclude an experiment with a final status.
   */
  concludeExperiment(
    tree: LifeTree,
    experimentNodeId: string,
    status: 'succeeded' | 'failed' | 'cancelled',
  ): boolean {
    const expNode = this.findNode(tree.root, experimentNodeId);
    if (!expNode || expNode.type !== 'experiment') return false;
    if (expNode.metadata.experimentStatus !== 'running') return false;

    expNode.metadata.experimentStatus = status;
    expNode.status = status === 'succeeded' ? 'completed' : 'archived';
    if (expNode.metadata.experimentConfig) {
      expNode.metadata.experimentConfig.completedAt = Date.now();
    }
    expNode.metadata.lastSeen = Date.now();
    tree.updatedAt = Date.now();
    return true;
  }

  /**
   * Auto-evaluate: check if running experiments have exceeded their duration.
   * Returns IDs of experiments that should be evaluated.
   */
  getExpiredExperiments(tree: LifeTree): string[] {
    const expired: string[] = [];
    const now = Date.now();

    const walk = (node: LifeTreeNode): void => {
      if (
        node.type === 'experiment' &&
        node.metadata.experimentStatus === 'running' &&
        node.metadata.experimentConfig?.startedAt
      ) {
        const durationMs = (node.metadata.experimentConfig.durationDays ?? 3) * 24 * 60 * 60 * 1000;
        if (now - node.metadata.experimentConfig.startedAt > durationMs) {
          expired.push(node.id);
        }
      }
      for (const child of node.children) walk(child);
    };

    walk(tree.root);
    return expired;
  }

  // ============ Query Helpers ============

  /**
   * Get all experiment nodes from the tree.
   */
  getAllExperiments(tree: LifeTree): LifeTreeNode[] {
    const experiments: LifeTreeNode[] = [];
    const walk = (node: LifeTreeNode): void => {
      if (node.type === 'experiment') experiments.push(node);
      for (const child of node.children) walk(child);
    };
    walk(tree.root);
    return experiments;
  }

  /**
   * Convert an experiment node to a flat record for database storage.
   */
  toExperimentRecord(node: LifeTreeNode): ExperimentRecord | null {
    if (node.type !== 'experiment' || !node.metadata.experimentConfig) return null;
    const cfg = node.metadata.experimentConfig;
    return {
      id: node.id,
      nodeId: node.parentId ?? '',
      phase: cfg.phase,
      hypothesis: cfg.hypothesis,
      status: node.metadata.experimentStatus ?? 'pending',
      startedAt: cfg.startedAt,
      completedAt: cfg.completedAt,
      config: JSON.stringify(cfg),
      results: node.metadata.experimentResults ? JSON.stringify(node.metadata.experimentResults) : undefined,
      createdAt: node.metadata.firstSeen,
    };
  }

  // ============ Private Helpers ============

  private findNode(node: LifeTreeNode, id: string): LifeTreeNode | null {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = this.findNode(child, id);
      if (found) return found;
    }
    return null;
  }

  private countExperimentsByPhaseAndStatus(
    tree: LifeTree,
    phase: ExperimentPhase,
    status: ExperimentStatus,
  ): number {
    let count = 0;
    const walk = (node: LifeTreeNode): void => {
      if (
        node.type === 'experiment' &&
        node.metadata.experimentPhase === phase &&
        node.metadata.experimentStatus === status
      ) {
        count++;
      }
      for (const child of node.children) walk(child);
    };
    walk(tree.root);
    return count;
  }

  private isOnCooldown(node: LifeTreeNode): boolean {
    const now = Date.now();
    // Check if any child experiment was created recently
    for (const child of node.children) {
      if (child.type === 'experiment' && child.metadata.experimentConfig?.startedAt) {
        if (now - child.metadata.experimentConfig.startedAt < this.config.experimentCooldownMs) {
          return true;
        }
      }
    }
    return false;
  }
}
