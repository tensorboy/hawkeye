import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LifeTreeRenderer } from './life-tree-renderer';
import { useLifeTree, ALL_STAGES } from '../hooks/useLifeTree';
import type { LifeTreeNode, LifeStage } from '../hooks/useLifeTree';
import './LifeTreePanel.css';

const STAGE_COLORS: Record<LifeStage, string> = {
  career:        '#4A9EFF',
  learning:      '#50C878',
  health:        '#FF6B6B',
  relationships: '#FFB347',
  creativity:    '#CB6CE6',
  finance:       '#FFD700',
  safety:        '#5BC0DE',
};

const STAGE_LABELS: Record<LifeStage, string> = {
  career:        'Career',
  learning:      'Learning',
  health:        'Health',
  relationships: 'Relations',
  creativity:    'Creative',
  finance:       'Finance',
  safety:        'Safety',
};

const slideRight = {
  initial: { x: 280, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: 280, opacity: 0 },
};

export function LifeTreePanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LifeTreeRenderer | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const {
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
  } = useLifeTree();

  const [hoveredNode, setHoveredNode] = useState<LifeTreeNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Init renderer
  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new LifeTreeRenderer(canvasRef.current);

    renderer.onNodeClick((node) => {
      setSelectedNodeId(node.id);
    });

    renderer.onNodeHover((node) => {
      setHoveredNode(node);
    });

    renderer.start();
    rendererRef.current = renderer;

    // Fit view after first data load
    requestAnimationFrame(() => renderer.fitToView());

    return () => renderer.destroy();
  }, [setSelectedNodeId]);

  // Update data when snapshot or filters change
  useEffect(() => {
    rendererRef.current?.setData(snapshot, visibleStages);
  }, [snapshot, visibleStages]);

  // Pan to selected node
  useEffect(() => {
    rendererRef.current?.setSelectedNode(selectedNodeId);
  }, [selectedNodeId]);

  // Fit view when first loaded
  useEffect(() => {
    if (snapshot && rendererRef.current) {
      rendererRef.current.fitToView();
    }
  }, [snapshot?.rootId]); // Only on initial load

  // Track mouse for tooltip positioning
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX + 14, y: e.clientY + 14 });
  }, []);

  // Resolve children of the selected node
  const childNodes = selectedNode
    ? snapshot?.nodes.filter((n) => selectedNode.children.includes(n.id)) ?? []
    : [];

  return (
    <div className="life-tree-panel" onMouseMove={handleMouseMove}>
      {/* Loading */}
      {loading && (
        <div className="life-tree-loading">
          <span className="life-tree-loading-text">Loading tree...</span>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="life-tree-error" onClick={clearError}>
          {error} (click to dismiss)
        </div>
      )}

      {/* Stats HUD */}
      {snapshot && (
        <div className="life-tree-hud">
          <div className="life-tree-hud-stats">
            <span className="life-tree-hud-stat">
              <span className="value">{snapshot.stats.totalNodes}</span> nodes
            </span>
            <span className="life-tree-hud-stat">
              <span className="value">{snapshot.stats.activeTasks}</span> tasks
            </span>
            <span className="life-tree-hud-stat">
              <span className="value">{snapshot.stats.experimentsCompleted}</span> experiments
            </span>
            {snapshot.stats.mostActiveStage && (
              <span className="life-tree-hud-stat">
                most active: <span className="value">{STAGE_LABELS[snapshot.stats.mostActiveStage]}</span>
              </span>
            )}
          </div>
          <div className="life-tree-hud-actions">
            <button
              className="life-tree-hud-btn"
              onClick={() => rendererRef.current?.fitToView()}
              title="Fit to view"
            >
              Fit
            </button>
            <button
              className="life-tree-hud-btn"
              onClick={handleRebuild}
              title="Rebuild tree"
            >
              Rebuild
            </button>
          </div>
        </div>
      )}

      {/* Canvas */}
      <canvas ref={canvasRef} className="life-tree-canvas" />

      {/* Stage filter chips */}
      <div className="life-tree-filters">
        {ALL_STAGES.map((stage) => (
          <button
            key={stage}
            className={`life-tree-filter-chip ${visibleStages.has(stage) ? 'active' : 'inactive'}`}
            style={{ '--chip-color': STAGE_COLORS[stage] } as React.CSSProperties}
            onClick={() => toggleStage(stage)}
          >
            <span
              className="life-tree-filter-dot"
              style={{ background: STAGE_COLORS[stage], opacity: visibleStages.has(stage) ? 1 : 0.3 }}
            />
            {STAGE_LABELS[stage]}
          </button>
        ))}
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={`life-tree-tooltip ${hoveredNode ? 'show' : ''}`}
        style={{ left: tooltipPos.x, top: tooltipPos.y }}
      >
        {hoveredNode && (
          <>
            <div className="life-tree-tooltip-label">{hoveredNode.label}</div>
            <div className="life-tree-tooltip-meta">
              {hoveredNode.nodeType} · {hoveredNode.status}
              {hoveredNode.observationCount > 0 && ` · ${hoveredNode.observationCount} obs`}
              {hoveredNode.confidence < 1 && ` · ${Math.round(hoveredNode.confidence * 100)}% conf`}
            </div>
            {hoveredNode.relatedApps.length > 0 && (
              <div className="life-tree-tooltip-apps">
                {hoveredNode.relatedApps.slice(0, 5).map((app) => (
                  <span key={app} className="life-tree-tooltip-app">{app}</span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Node Detail Panel */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            className="life-tree-detail"
            {...slideRight}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="life-tree-detail-header">
              <span className="life-tree-detail-title">{selectedNode.label}</span>
              <button
                className="life-tree-detail-close"
                onClick={() => setSelectedNodeId(null)}
              >
                x
              </button>
            </div>

            <div className="life-tree-detail-body">
              {/* Type & Status */}
              <div className="life-tree-detail-section">
                <div className="life-tree-detail-label">Status</div>
                <div>
                  <span className={`life-tree-detail-badge ${selectedNode.status}`}>
                    {selectedNode.status}
                  </span>
                  <span style={{ marginLeft: 8, fontSize: 10, color: 'rgba(200,200,216,0.5)' }}>
                    {selectedNode.nodeType}
                  </span>
                </div>
              </div>

              {/* Stage */}
              {selectedNode.stage && (
                <div className="life-tree-detail-section">
                  <div className="life-tree-detail-label">Stage</div>
                  <div className="life-tree-detail-value" style={{ color: STAGE_COLORS[selectedNode.stage] }}>
                    {STAGE_LABELS[selectedNode.stage]}
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedNode.description && (
                <div className="life-tree-detail-section">
                  <div className="life-tree-detail-label">Description</div>
                  <div className="life-tree-detail-value">{selectedNode.description}</div>
                </div>
              )}

              {/* Stats */}
              <div className="life-tree-detail-section">
                <div className="life-tree-detail-label">Observations</div>
                <div className="life-tree-detail-value">{selectedNode.observationCount}</div>
              </div>

              <div className="life-tree-detail-section">
                <div className="life-tree-detail-label">Confidence</div>
                <div className="life-tree-detail-value">{Math.round(selectedNode.confidence * 100)}%</div>
              </div>

              {/* Related Apps */}
              {selectedNode.relatedApps.length > 0 && (
                <div className="life-tree-detail-section">
                  <div className="life-tree-detail-label">Related Apps</div>
                  <div className="life-tree-detail-apps-list">
                    {selectedNode.relatedApps.map((app) => (
                      <span key={app} className="life-tree-detail-app-tag">{app}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Children */}
              {childNodes.length > 0 && (
                <div className="life-tree-detail-section">
                  <div className="life-tree-detail-label">Children ({childNodes.length})</div>
                  <ul className="life-tree-detail-children">
                    {childNodes.map((child) => (
                      <li key={child.id} onClick={() => setSelectedNodeId(child.id)}>
                        {child.label}
                        <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.5 }}>
                          {child.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Experiment controls */}
              {selectedNode.nodeType === 'experiment' && selectedNode.status === 'active' && (
                <div className="life-tree-detail-section">
                  <div className="life-tree-detail-label">Conclude Experiment</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button
                      className="life-tree-proposal-accept"
                      onClick={() => handleConcludeExperiment(selectedNode.id, true)}
                    >
                      Succeeded
                    </button>
                    <button
                      className="life-tree-proposal-dismiss"
                      onClick={() => handleConcludeExperiment(selectedNode.id, false)}
                    >
                      Failed
                    </button>
                  </div>
                </div>
              )}

              {/* Proposal card */}
              {proposal && (
                <div className="life-tree-proposal">
                  <div className="life-tree-proposal-title">{proposal.title}</div>
                  <div className="life-tree-proposal-desc">
                    {proposal.description}
                    <br />
                    <span style={{ fontSize: 9, opacity: 0.5 }}>{proposal.durationDays} day(s)</span>
                  </div>
                  <div className="life-tree-proposal-actions">
                    <button
                      className="life-tree-proposal-accept"
                      onClick={() => {
                        handleStartExperiment(
                          selectedNode.id,
                          proposal.title,
                          proposal.description,
                          unlockedPhase,
                        );
                      }}
                    >
                      Start Experiment
                    </button>
                    <button
                      className="life-tree-proposal-dismiss"
                      onClick={() => setProposal(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Action bar */}
            {(selectedNode.nodeType === 'task' || selectedNode.nodeType === 'stage') && (
              <div className="life-tree-detail-actions">
                <button
                  className="life-tree-propose-btn"
                  onClick={() => handleProposeExperiment(selectedNode.id)}
                  disabled={proposing}
                >
                  {proposing ? 'Thinking...' : 'Propose Experiment'}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
