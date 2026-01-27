import React from 'react';
import type { LayoutNode } from './useTreeLayout';

const STAGE_COLORS: Record<string, string> = {
  career: '#3b82f6',      // blue
  learning: '#8b5cf6',    // violet
  health: '#10b981',      // emerald
  relationships: '#f59e0b', // amber
  creativity: '#ec4899',  // pink
  finance: '#06b6d4',     // cyan
};

const STATUS_COLORS: Record<string, string> = {
  running: '#f59e0b',
  succeeded: '#10b981',
  failed: '#ef4444',
  pending: '#6b7280',
  cancelled: '#9ca3af',
};

interface LifeTreeNodeProps {
  node: LayoutNode;
  isSelected: boolean;
  onClick: (id: string) => void;
}

export const LifeTreeNode: React.FC<LifeTreeNodeProps> = ({ node, isSelected, onClick }) => {
  const isExperiment = node.type === 'experiment';
  const isRoot = node.type === 'root';
  const isStage = node.type === 'stage';

  const color = node.stage ? STAGE_COLORS[node.stage] ?? '#6b7280' : '#6b7280';
  const expColor = node.experimentStatus ? STATUS_COLORS[node.experimentStatus] ?? '#6b7280' : undefined;

  const handleClick = () => onClick(node.id);

  // Root node — large gradient circle
  if (isRoot) {
    return (
      <g onClick={handleClick} style={{ cursor: 'pointer' }}>
        <circle
          cx={node.x}
          cy={node.y}
          r={24}
          fill="url(#rootGradient)"
          stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.3)'}
          strokeWidth={isSelected ? 2.5 : 1.5}
        />
        <text
          x={node.x}
          y={node.y + 36}
          textAnchor="middle"
          fill="white"
          fontSize={12}
          fontWeight={600}
        >
          {node.label}
        </text>
      </g>
    );
  }

  // Experiment node — diamond shape
  if (isExperiment) {
    const size = 14;
    const points = `${node.x},${node.y - size} ${node.x + size},${node.y} ${node.x},${node.y + size} ${node.x - size},${node.y}`;
    return (
      <g onClick={handleClick} style={{ cursor: 'pointer' }}>
        <polygon
          points={points}
          fill={expColor ?? '#6b7280'}
          stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.2)'}
          strokeWidth={isSelected ? 2 : 1}
          opacity={0.9}
        />
        <text
          x={node.x}
          y={node.y + 24}
          textAnchor="middle"
          fill="rgba(255,255,255,0.8)"
          fontSize={9}
        >
          {node.label.slice(0, 25)}
        </text>
      </g>
    );
  }

  // Stage node — colored circle
  if (isStage) {
    return (
      <g onClick={handleClick} style={{ cursor: 'pointer' }}>
        <circle
          cx={node.x}
          cy={node.y}
          r={18}
          fill={color}
          stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.2)'}
          strokeWidth={isSelected ? 2.5 : 1.5}
          opacity={0.85}
        />
        <text
          x={node.x}
          y={node.y + 30}
          textAnchor="middle"
          fill="white"
          fontSize={10}
          fontWeight={500}
        >
          {node.label}
        </text>
      </g>
    );
  }

  // Goal — outlined circle
  if (node.type === 'goal') {
    return (
      <g onClick={handleClick} style={{ cursor: 'pointer' }}>
        <circle
          cx={node.x}
          cy={node.y}
          r={14}
          fill="transparent"
          stroke={color}
          strokeWidth={isSelected ? 2.5 : 1.5}
          opacity={0.8}
        />
        <text
          x={node.x}
          y={node.y + 24}
          textAnchor="middle"
          fill="rgba(255,255,255,0.7)"
          fontSize={9}
        >
          {node.label.slice(0, 20)}
        </text>
      </g>
    );
  }

  // Task — small filled circle
  return (
    <g onClick={handleClick} style={{ cursor: 'pointer' }}>
      <circle
        cx={node.x}
        cy={node.y}
        r={8}
        fill={color}
        stroke={isSelected ? '#fbbf24' : 'none'}
        strokeWidth={isSelected ? 2 : 0}
        opacity={Math.max(0.4, node.confidence)}
      />
      <text
        x={node.x}
        y={node.y + 18}
        textAnchor="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize={8}
      >
        {node.label.slice(0, 18)}
      </text>
    </g>
  );
};
