/**
 * TimelineTree Panel - Activity Timeline Visualization
 *
 * Displays activity summaries as a horizontal timeline tree with:
 * - Time range selection (1h, 6h, 24h, 7d)
 * - Animated node growth
 * - Pan and zoom controls
 * - Node detail on click
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { TimelineTreeNode } from './TimelineTreeNode';
import { TimelineTreeEdge } from './TimelineTreeEdge';
import {
  computeTimelineLayout,
  formatTimeLabel,
  type ActivitySummaryData,
  type TimelineLayoutResult,
} from './useTimelineLayout';
import './TimelineTree.css';

// Time range options in milliseconds
const TIME_RANGES = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
} as const;

type TimeRangeKey = keyof typeof TIME_RANGES;

interface TimelineTreePanelProps {
  onClose: () => void;
}

export const TimelineTreePanel: React.FC<TimelineTreePanelProps> = ({ onClose }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // State
  const [summaries, setSummaries] = useState<ActivitySummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('6h');
  const [isAnimating, setIsAnimating] = useState(true);

  // Pan and zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Container dimensions
  const [containerWidth, setContainerWidth] = useState(1200);

  // Fetch summaries based on time range
  const fetchSummaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsAnimating(true);

    try {
      const now = Date.now();
      const start = now - TIME_RANGES[timeRange];

      const data = await window.hawkeye.activitySummary.getRange(start, now);
      setSummaries(data || []);

      // Start animation after data loads
      setTimeout(() => setIsAnimating(false), 100);
    } catch (err) {
      console.error('Failed to fetch activity summaries:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Compute layout
  const layout = useMemo<TimelineLayoutResult | null>(() => {
    if (summaries.length === 0) return null;
    return computeTimelineLayout(summaries, containerWidth);
  }, [summaries, containerWidth]);

  // Event handlers
  const handleNodeClick = useCallback((id: string) => {
    setSelectedNodeId(selectedNodeId === id ? null : id);
  }, [selectedNodeId]);

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

  const handleGenerateNow = async () => {
    try {
      setLoading(true);
      await window.hawkeye.activitySummary.generateNow();
      await fetchSummaries();
    } catch (err) {
      console.error('Failed to generate summary:', err);
      setError('Failed to generate summary');
    }
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Get selected node for detail panel
  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !layout) return null;
    return layout.nodes.find(n => n.id === selectedNodeId);
  }, [selectedNodeId, layout]);

  return (
    <div className="timeline-tree-panel">
      {/* Header */}
      <div className="timeline-tree-header">
        <div className="timeline-tree-title">
          <h2>活动时间线</h2>
          <span className="timeline-tree-stats">
            {summaries.length} 条记录
            {layout?.timeRange && (
              <>
                {' · '}
                {formatTimeLabel(layout.timeRange.start)} - {formatTimeLabel(layout.timeRange.end)}
              </>
            )}
          </span>
        </div>

        <div className="timeline-tree-controls">
          {/* Time range selector */}
          <div className="timeline-range-selector">
            {(Object.keys(TIME_RANGES) as TimeRangeKey[]).map(key => (
              <button
                key={key}
                className={`range-btn ${timeRange === key ? 'active' : ''}`}
                onClick={() => setTimeRange(key)}
              >
                {key}
              </button>
            ))}
          </div>

          <button
            className="timeline-btn"
            onClick={handleGenerateNow}
            disabled={loading}
          >
            {loading ? '生成中...' : '立即生成'}
          </button>

          <button className="timeline-btn" onClick={resetView}>
            重置视图
          </button>

          <button className="timeline-btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="timeline-tree-canvas" ref={containerRef}>
        {error && (
          <div className="timeline-tree-error">{error}</div>
        )}

        {layout && layout.nodes.length > 0 && (
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            className={`timeline-tree-svg ${dragging ? 'dragging' : ''}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <defs>
              {/* Gradient for timeline background */}
              <linearGradient id="timelineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(59, 130, 246, 0.1)" />
                <stop offset="50%" stopColor="rgba(139, 92, 246, 0.1)" />
                <stop offset="100%" stopColor="rgba(16, 185, 129, 0.1)" />
              </linearGradient>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Timeline axis line */}
              <line
                x1={60}
                y1={200}
                x2={layout.width}
                y2={200}
                stroke="rgba(148, 163, 184, 0.2)"
                strokeWidth={2}
                strokeDasharray="8,4"
              />

              {/* Edges */}
              {layout.edges.map((edge, i) => (
                <TimelineTreeEdge
                  key={`e-${i}`}
                  edge={edge}
                  isAnimating={isAnimating}
                />
              ))}

              {/* Nodes */}
              {layout.nodes.map(node => (
                <TimelineTreeNode
                  key={node.id}
                  node={node}
                  isSelected={selectedNodeId === node.id}
                  onClick={handleNodeClick}
                  isAnimating={isAnimating}
                />
              ))}
            </g>
          </svg>
        )}

        {!layout && !loading && (
          <div className="timeline-tree-empty">
            <div className="timeline-tree-empty-icon">🌳</div>
            <div>暂无活动数据</div>
            <div style={{ fontSize: 12 }}>
              活动将每10分钟自动记录一次，或点击"立即生成"
            </div>
          </div>
        )}

        {loading && (
          <div className="timeline-tree-loading">
            正在加载活动时间线...
          </div>
        )}

        {/* Time axis */}
        {layout && layout.nodes.length > 0 && (
          <div className="timeline-axis">
            <span className="timeline-axis-label">
              {formatTimeLabel(layout.timeRange.start)}
            </span>
            <span className="timeline-axis-label">现在</span>
          </div>
        )}
      </div>

      {/* Selected Node Detail */}
      {selectedNode && (
        <div className="timeline-node-detail">
          <div className="timeline-node-header">
            {selectedNode.dominantStage && (
              <span
                className="timeline-node-stage"
                style={{
                  background: `rgba(59, 130, 246, 0.2)`,
                }}
              >
                {selectedNode.dominantStage}
              </span>
            )}
            <span className="timeline-node-time">
              {formatTimeLabel(selectedNode.timestamp)}
            </span>
          </div>

          <div className="timeline-node-label">{selectedNode.label}</div>

          {selectedNode.appDistribution && Object.keys(selectedNode.appDistribution).length > 0 && (
            <div className="timeline-node-apps">
              {Object.entries(selectedNode.appDistribution)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([app, pct]) => (
                  <span key={app} className="timeline-app-chip">
                    {app}: {Math.round(pct * 100)}%
                  </span>
                ))}
            </div>
          )}

          {selectedNode.keywords && selectedNode.keywords.length > 0 && (
            <div className="timeline-node-keywords">
              {selectedNode.keywords.map((kw, i) => (
                <span key={i} className="timeline-keyword">{kw}</span>
              ))}
            </div>
          )}

          <div className="timeline-node-confidence">
            置信度: {(selectedNode.confidence * 100).toFixed(0)}%
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelineTreePanel;
