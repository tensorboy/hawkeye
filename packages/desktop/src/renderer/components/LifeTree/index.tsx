import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useHawkeyeStore } from '../../stores';
import { computeTreeLayout } from './useTreeLayout';
import { LifeTreeNode } from './LifeTreeNode';
import { LifeTreeEdge } from './LifeTreeEdge';

// CSS for animations
const LIFE_TREE_STYLES = `
  @keyframes pulse {
    0%, 100% { opacity: 0.5; transform: scale(1); }
    50% { opacity: 0.8; transform: scale(1.05); }
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes treeGrow {
    from { stroke-dashoffset: 1000; }
    to { stroke-dashoffset: 0; }
  }

  .life-tree-panel {
    animation: fadeInUp 0.4s ease-out;
  }

  .life-tree-svg path {
    stroke-dasharray: 1000;
    animation: treeGrow 1.5s ease-out forwards;
  }
`;

export const LifeTreePanel: React.FC = () => {
  const {
    lifeTree,
    lifeTreeLoading,
    lifeTreeError,
    selectedNodeId,
    showLifeTree,
    setShowLifeTree,
    setSelectedNodeId,
    fetchLifeTree,
    rebuildLifeTree,
  } = useHawkeyeStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (showLifeTree && !lifeTree) {
      fetchLifeTree();
    }
  }, [showLifeTree]);

  const layout = useMemo(() => {
    if (!lifeTree?.root) return null;
    return computeTreeLayout(lifeTree.root);
  }, [lifeTree]);

  const handleNodeClick = useCallback((id: string) => {
    setSelectedNodeId(selectedNodeId === id ? null : id);
  }, [selectedNodeId, setSelectedNodeId]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.3, Math.min(3, z + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  if (!showLifeTree) return null;

  return (
    <>
      <style>{LIFE_TREE_STYLES}</style>
      <div
        className="life-tree-panel"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)',
          display: 'flex',
          flexDirection: 'column',
          backdropFilter: 'blur(8px)',
        }}
      >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>Life Tree</span>
          {lifeTree?.stats && (
            <span style={{ fontSize: 12, color: 'rgba(148, 163, 184, 0.7)' }}>
              {lifeTree.stats.totalNodes} nodes &middot; {lifeTree.stats.activeExperiments} active experiments
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => rebuildLifeTree()}
            disabled={lifeTreeLoading}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid rgba(148, 163, 184, 0.3)',
              background: 'transparent',
              color: 'white',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {lifeTreeLoading ? 'Rebuilding...' : 'Rebuild'}
          </button>
          <button
            onClick={() => setZoom(1)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid rgba(148, 163, 184, 0.3)',
              background: 'transparent',
              color: 'white',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Reset Zoom
          </button>
          <button
            onClick={() => setShowLifeTree(false)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid rgba(148, 163, 184, 0.3)',
              background: 'transparent',
              color: 'white',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {lifeTreeError && (
          <div style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: 'rgba(239, 68, 68, 0.2)',
            borderRadius: 8,
            color: '#fca5a5',
            fontSize: 12,
          }}>
            {lifeTreeError}
          </div>
        )}

        {layout && (
          <svg
            ref={svgRef}
            className="life-tree-svg"
            width="100%"
            height="100%"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
          >
            <defs>
              <radialGradient id="rootGradient">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#f59e0b" />
              </radialGradient>
              {/* Stage gradients */}
              <radialGradient id="careerGradient">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#3b82f6" />
              </radialGradient>
              <radialGradient id="learningGradient">
                <stop offset="0%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </radialGradient>
              <radialGradient id="healthGradient">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#10b981" />
              </radialGradient>
              <radialGradient id="relationshipsGradient">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#f59e0b" />
              </radialGradient>
              <radialGradient id="creativityGradient">
                <stop offset="0%" stopColor="#f472b6" />
                <stop offset="100%" stopColor="#ec4899" />
              </radialGradient>
              <radialGradient id="financeGradient">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#06b6d4" />
              </radialGradient>
              <radialGradient id="safetyGradient">
                <stop offset="0%" stopColor="#f87171" />
                <stop offset="100%" stopColor="#ef4444" />
              </radialGradient>
              {/* Glow filters */}
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <filter id="glowStrong" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {layout.edges.map((edge, i) => (
                <LifeTreeEdge key={`e-${i}`} edge={edge} />
              ))}

              {/* Nodes */}
              {layout.nodes.map(node => (
                <LifeTreeNode
                  key={node.id}
                  node={node}
                  isSelected={selectedNodeId === node.id}
                  onClick={handleNodeClick}
                />
              ))}
            </g>
          </svg>
        )}

        {!layout && !lifeTreeLoading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'rgba(148, 163, 184, 0.5)',
          }}>
            No tree data. Click "Rebuild" to generate.
          </div>
        )}

        {lifeTreeLoading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'rgba(148, 163, 184, 0.7)',
          }}>
            Building tree...
          </div>
        )}
      </div>

      {/* Selected Node Detail */}
      {selectedNodeId && layout && (() => {
        const selected = layout.nodes.find(n => n.id === selectedNodeId);
        if (!selected) return null;
        return (
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(148, 163, 184, 0.15)',
            background: 'rgba(30, 41, 59, 0.8)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(148, 163, 184, 0.15)',
                color: 'rgba(148, 163, 184, 0.8)',
                textTransform: 'uppercase',
              }}>
                {selected.type}
              </span>
              {selected.stage && (
                <span style={{ fontSize: 10, color: 'rgba(148, 163, 184, 0.6)' }}>
                  {selected.stage}
                </span>
              )}
              {selected.experimentStatus && (
                <span style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: selected.experimentStatus === 'running' ? 'rgba(245, 158, 11, 0.2)' :
                    selected.experimentStatus === 'succeeded' ? 'rgba(16, 185, 129, 0.2)' :
                    'rgba(239, 68, 68, 0.2)',
                  color: selected.experimentStatus === 'running' ? '#fbbf24' :
                    selected.experimentStatus === 'succeeded' ? '#6ee7b7' : '#fca5a5',
                }}>
                  {selected.experimentStatus}
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
              {selected.label}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(148, 163, 184, 0.5)', marginTop: 2 }}>
              Confidence: {(selected.confidence * 100).toFixed(0)}%
            </div>
          </div>
        );
      })()}
      </div>
    </>
  );
};
