/**
 * Life Tree Desktop Service
 *
 * Wraps LifeTreeBuilder + ExperimentEngine for the Electron main process.
 * Manages tree persistence, incremental updates, and experiment lifecycle.
 */

import { EventEmitter } from 'events';
import {
  LifeTreeBuilder,
  ExperimentEngine,
  type LifeTree,
  type LifeTreeNode,
  type ExperimentPhase,
  type ExperimentProposal,
  type ContextRecord,
  type HawkeyeDatabase,
} from '@hawkeye/core';

export interface LifeTreeServiceConfig {
  /** Re-inference interval in ms (default 6 hours) */
  inferenceIntervalMs?: number;
}

export class LifeTreeService extends EventEmitter {
  private builder: LifeTreeBuilder;
  private engine: ExperimentEngine;
  private tree: LifeTree | null = null;
  private db: HawkeyeDatabase | null = null;
  private inferenceTimer: ReturnType<typeof setInterval> | null = null;
  private debugLog: (msg: string) => void;

  constructor(debugLog: (msg: string) => void = console.log) {
    super();
    this.builder = new LifeTreeBuilder();
    this.engine = new ExperimentEngine();
    this.debugLog = debugLog;
  }

  /**
   * Initialize with database and optional AI chat function.
   */
  initialize(
    db: HawkeyeDatabase,
    aiChat?: (system: string, user: string) => Promise<string>,
    config?: LifeTreeServiceConfig,
  ): void {
    this.db = db;

    if (aiChat) {
      this.builder.setAIChat(aiChat);
      this.engine.setAIChat(aiChat);
    }

    // Load existing tree from snapshot or build empty
    this.loadTree();

    // Start periodic re-inference
    const interval = config?.inferenceIntervalMs ?? 6 * 60 * 60 * 1000;
    this.inferenceTimer = setInterval(() => {
      this.rebuildTree().catch(err => this.debugLog(`[LifeTree] Rebuild error: ${err}`));
    }, interval);

    this.debugLog('[LifeTree] Service initialized');
  }

  /**
   * Get the current tree (or build empty if none exists).
   */
  getTree(): LifeTree {
    if (!this.tree) {
      this.tree = this.builder.buildEmpty();
    }
    return this.tree;
  }

  /**
   * Process a new perception context and update the tree.
   */
  async processContext(context: ContextRecord): Promise<string[]> {
    const tree = this.getTree();
    try {
      const { tree: updated, updatedNodeIds } = await this.builder.updateFromContext(tree, context);
      this.tree = updated;

      if (updatedNodeIds.length > 0) {
        this.saveSnapshot();
        this.emit('tree-updated', { updatedNodeIds });
      }

      return updatedNodeIds;
    } catch (err) {
      this.debugLog(`[LifeTree] processContext error: ${err}`);
      return [];
    }
  }

  /**
   * Rebuild the full tree from database records.
   */
  async rebuildTree(): Promise<LifeTree> {
    if (!this.db) {
      this.tree = this.builder.buildEmpty();
      return this.tree;
    }

    try {
      const rows = this.db.getLifeTreeNodes();
      const records = rows.map(row => ({
        id: row.id as string,
        parentId: (row.parent_id as string) ?? null,
        label: row.label as string,
        type: row.type as string,
        status: row.status as string,
        stage: row.stage as string | undefined,
        confidence: row.confidence as number,
        firstSeen: row.first_seen as number,
        lastSeen: row.last_seen as number,
        frequency: row.frequency as number,
        source: row.source as string,
        description: row.description as string | undefined,
        tags: (row.tags as string) ?? '[]',
        experimentStatus: row.experiment_status as string | undefined,
        experimentPhase: row.experiment_phase as string | undefined,
        experimentConfig: row.experiment_config as string | undefined,
        experimentResults: row.experiment_results as string | undefined,
        treeVersion: row.tree_version as number,
        createdAt: row.created_at as number,
        updatedAt: row.updated_at as number,
      }));

      this.tree = this.builder.buildFromRecords(records as any);
      this.saveSnapshot();
      this.emit('tree-rebuilt');
      this.debugLog(`[LifeTree] Rebuilt tree with ${this.tree.stats.totalNodes} nodes`);
      return this.tree;
    } catch (err) {
      this.debugLog(`[LifeTree] rebuildTree error: ${err}`);
      this.tree = this.builder.buildEmpty();
      return this.tree;
    }
  }

  /**
   * Propose an experiment for a node.
   */
  async proposeExperiment(
    nodeId: string,
    phase?: ExperimentPhase,
  ): Promise<ExperimentProposal | null> {
    const tree = this.getTree();
    return this.engine.proposeExperiment(tree, nodeId, phase);
  }

  /**
   * Start an experiment from a proposal.
   */
  startExperiment(
    nodeId: string,
    proposal: ExperimentProposal,
    phase: ExperimentPhase,
  ): LifeTreeNode | null {
    const tree = this.getTree();
    const expNode = this.engine.startExperiment(tree, nodeId, proposal, phase);

    if (expNode && this.db) {
      const record = this.engine.toExperimentRecord(expNode);
      if (record) {
        this.db.saveLifeTreeExperiment(record);
      }
      this.saveSnapshot();
      this.emit('experiment-started', { experimentId: expNode.id, nodeId });
    }

    return expNode;
  }

  /**
   * Conclude an experiment.
   */
  concludeExperiment(
    experimentNodeId: string,
    status: 'succeeded' | 'failed' | 'cancelled',
  ): boolean {
    const tree = this.getTree();
    const result = this.engine.concludeExperiment(tree, experimentNodeId, status);

    if (result && this.db) {
      this.db.updateLifeTreeExperimentStatus(experimentNodeId, status, Date.now());
      this.saveSnapshot();
      this.emit('experiment-concluded', { experimentId: experimentNodeId, status });
    }

    return result;
  }

  /**
   * Get the highest unlocked experiment phase.
   */
  getUnlockedPhase(): ExperimentPhase {
    return this.engine.getUnlockedPhase(this.getTree());
  }

  /**
   * Get all experiments from the tree.
   */
  getAllExperiments(): LifeTreeNode[] {
    return this.engine.getAllExperiments(this.getTree());
  }

  /**
   * Cleanup.
   */
  destroy(): void {
    if (this.inferenceTimer) {
      clearInterval(this.inferenceTimer);
      this.inferenceTimer = null;
    }
    this.tree = null;
    this.db = null;
  }

  // ============ Private ============

  private loadTree(): void {
    if (!this.db) {
      this.tree = this.builder.buildEmpty();
      return;
    }

    try {
      const snapshot = this.db.getLatestLifeTreeSnapshot();
      if (snapshot && snapshot.tree_data) {
        this.tree = this.builder.hydrateFromSnapshot(snapshot.tree_data as string);
        this.debugLog(`[LifeTree] Loaded snapshot v${snapshot.version}`);
        return;
      }
    } catch (err) {
      this.debugLog(`[LifeTree] Failed to load snapshot: ${err}`);
    }

    this.tree = this.builder.buildEmpty();
  }

  private saveSnapshot(): void {
    if (!this.db || !this.tree) return;

    try {
      this.tree.version += 1;
      const snapshotData = this.builder.serializeToSnapshot(this.tree);
      this.db.saveLifeTreeSnapshot({
        id: `snap_${Date.now()}`,
        version: this.tree.version,
        treeData: snapshotData,
        totalNodes: this.tree.stats.totalNodes,
        activeExperiments: this.tree.stats.activeExperiments,
      });

      // Also persist individual nodes
      const records = this.builder.flattenTree(this.tree);
      for (const rec of records) {
        this.db.saveLifeTreeNode(rec);
      }
    } catch (err) {
      this.debugLog(`[LifeTree] saveSnapshot error: ${err}`);
    }
  }
}
