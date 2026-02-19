import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLifeTree,
  rebuildLifeTree,
  proposeExperiment,
  startExperiment,
  concludeExperiment,
  getUnlockedPhase,
  type LifeTreeSnapshot,
  type LifeTreeNode,
  type LifeStage,
  type ExperimentPhase,
  type ExperimentProposal,
} from './useTauri';
import { useTauriEvent } from './useEvents';

const ALL_STAGES: LifeStage[] = [
  'career', 'learning', 'health', 'relationships', 'creativity', 'finance', 'safety',
];

export function useLifeTree() {
  const [snapshot, setSnapshot] = useState<LifeTreeSnapshot | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleStages, setVisibleStages] = useState<Set<LifeStage>>(new Set(ALL_STAGES));
  const [unlockedPhase, setUnlockedPhase] = useState<ExperimentPhase>('task_level');
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<ExperimentProposal | null>(null);

  // Ref to avoid re-creating callbacks
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  // Load tree on mount
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [tree, phase] = await Promise.all([getLifeTree(), getUnlockedPhase()]);
        setSnapshot(tree);
        setUnlockedPhase(phase);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Refresh tree when observe loop emits updates
  const refreshTree = useCallback(async () => {
    try {
      const tree = await getLifeTree();
      setSnapshot(tree);
    } catch {
      // Silently ignore refresh errors
    }
  }, []);

  useTauriEvent('observe:update', refreshTree);

  // Get the selected node object
  const selectedNode = snapshot?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  // Actions
  const handleProposeExperiment = useCallback(async (nodeId: string) => {
    setProposing(true);
    setProposal(null);
    try {
      const result = await proposeExperiment(nodeId);
      setProposal(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProposing(false);
    }
  }, []);

  const handleStartExperiment = useCallback(async (
    nodeId: string,
    title: string,
    description: string,
    phase: ExperimentPhase,
  ) => {
    try {
      await startExperiment(nodeId, title, description, phase);
      setProposal(null);
      await refreshTree();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [refreshTree]);

  const handleConcludeExperiment = useCallback(async (expId: string, succeeded: boolean) => {
    try {
      await concludeExperiment(expId, succeeded);
      const phase = await getUnlockedPhase();
      setUnlockedPhase(phase);
      await refreshTree();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [refreshTree]);

  const toggleStage = useCallback((stage: LifeStage) => {
    setVisibleStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) {
        next.delete(stage);
      } else {
        next.add(stage);
      }
      return next;
    });
  }, []);

  const handleRebuild = useCallback(async () => {
    try {
      setLoading(true);
      const tree = await rebuildLifeTree();
      setSnapshot(tree);
      setSelectedNodeId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    snapshot,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,
    loading,
    error,
    clearError,
    visibleStages,
    toggleStage,
    unlockedPhase,
    proposing,
    proposal,
    setProposal,
    handleProposeExperiment,
    handleStartExperiment,
    handleConcludeExperiment,
    handleRebuild,
    refreshTree,
  };
}

export { ALL_STAGES };
export type { LifeTreeNode, LifeTreeSnapshot, LifeStage, ExperimentPhase, ExperimentProposal };
