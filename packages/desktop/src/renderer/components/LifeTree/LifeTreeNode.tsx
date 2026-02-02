import React, { useState } from 'react';
import type { LayoutNode } from './useTreeLayout';

const STAGE_COLORS: Record<string, string> = {
  career: '#3b82f6',      // blue
  learning: '#8b5cf6',    // violet
  health: '#10b981',      // emerald
  relationships: '#f59e0b', // amber
  creativity: '#ec4899',  // pink
  finance: '#06b6d4',     // cyan
  safety: '#ef4444',      // red - for security/safety
};

const STAGE_GRADIENTS: Record<string, string> = {
  career: 'url(#careerGradient)',
  learning: 'url(#learningGradient)',
  health: 'url(#healthGradient)',
  relationships: 'url(#relationshipsGradient)',
  creativity: 'url(#creativityGradient)',
  finance: 'url(#financeGradient)',
  safety: 'url(#safetyGradient)',
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
  const [isHovered, setIsHovered] = useState(false);
  const isExperiment = node.type === 'experiment';
  const isRoot = node.type === 'root';
  const isStage = node.type === 'stage';

  const color = node.stage ? STAGE_COLORS[node.stage] ?? '#6b7280' : '#6b7280';
  const gradient = node.stage ? STAGE_GRADIENTS[node.stage] : undefined;
  const expColor = node.experimentStatus ? STATUS_COLORS[node.experimentStatus] ?? '#6b7280' : undefined;

  const handleClick = () => onClick(node.id);

  // Root node — clean hexagon design
  if (isRoot) {
    const size = 28;
    const hexPoints = Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      return `${node.x + size * Math.cos(angle)},${node.y + size * Math.sin(angle)}`;
    }).join(' ');

    return (
      <g
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ cursor: 'pointer' }}
      >
        {/* Outer ring */}
        <polygon
          points={Array.from({ length: 6 }, (_, i) => {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            return `${node.x + (size + 6) * Math.cos(angle)},${node.y + (size + 6) * Math.sin(angle)}`;
          }).join(' ')}
          fill="none"
          stroke="rgba(251, 191, 36, 0.3)"
          strokeWidth={2}
          style={{
            opacity: isHovered || isSelected ? 1 : 0.5,
            transition: 'opacity 0.3s ease',
          }}
        />
        <polygon
          points={hexPoints}
          fill="url(#rootGradient)"
          stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.4)'}
          strokeWidth={isSelected ? 3 : 2}
          filter={isHovered || isSelected ? 'url(#glowStrong)' : 'url(#glow)'}
          style={{ transition: 'all 0.3s ease' }}
        />
        {/* Inner decoration - small dot */}
        <circle
          cx={node.x}
          cy={node.y}
          r={6}
          fill="rgba(255,255,255,0.3)"
        />
        <text
          x={node.x}
          y={node.y + 46}
          textAnchor="middle"
          fill="white"
          fontSize={13}
          fontWeight={600}
        >
          {node.label}
        </text>
      </g>
    );
  }

  // Experiment node — diamond shape with pulse animation
  if (isExperiment) {
    const size = 14;
    const points = `${node.x},${node.y - size} ${node.x + size},${node.y} ${node.x},${node.y + size} ${node.x - size},${node.y}`;
    const isRunning = node.experimentStatus === 'running';
    return (
      <g
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ cursor: 'pointer' }}
      >
        {isRunning && (
          <polygon
            points={`${node.x},${node.y - size - 4} ${node.x + size + 4},${node.y} ${node.x},${node.y + size + 4} ${node.x - size - 4},${node.y}`}
            fill="none"
            stroke={expColor}
            strokeWidth={1}
            opacity={0.5}
            style={{
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
        )}
        <polygon
          points={points}
          fill={expColor ?? '#6b7280'}
          stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.3)'}
          strokeWidth={isSelected ? 2.5 : 1.5}
          filter={isHovered ? 'url(#glow)' : undefined}
          style={{ transition: 'all 0.2s ease' }}
        />
        <text
          x={node.x}
          y={node.y + 26}
          textAnchor="middle"
          fill="rgba(255,255,255,0.85)"
          fontSize={10}
          fontWeight={500}
        >
          {node.label.slice(0, 20)}
        </text>
      </g>
    );
  }

  // Stage node — clean circle with inner ring
  if (isStage) {
    return (
      <g
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ cursor: 'pointer' }}
      >
        {/* Outer decorative ring */}
        <circle
          cx={node.x}
          cy={node.y}
          r={24}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4 2"
          opacity={isHovered || isSelected ? 0.6 : 0.3}
          style={{ transition: 'opacity 0.3s ease' }}
        />
        {/* Main circle */}
        <circle
          cx={node.x}
          cy={node.y}
          r={18}
          fill={gradient ?? color}
          stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.3)'}
          strokeWidth={isSelected ? 2.5 : 1.5}
          filter={isHovered || isSelected ? 'url(#glow)' : undefined}
          style={{ transition: 'all 0.3s ease' }}
        />
        {/* Inner highlight */}
        <circle
          cx={node.x}
          cy={node.y}
          r={8}
          fill="rgba(255,255,255,0.15)"
        />
        <text
          x={node.x}
          y={node.y + 34}
          textAnchor="middle"
          fill="white"
          fontSize={11}
          fontWeight={600}
        >
          {node.label}
        </text>
      </g>
    );
  }

  // Goal — clean outlined circle
  if (node.type === 'goal') {
    return (
      <g
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ cursor: 'pointer' }}
      >
        <circle
          cx={node.x}
          cy={node.y}
          r={14}
          fill={isHovered ? `${color}22` : 'transparent'}
          stroke={color}
          strokeWidth={isSelected ? 2.5 : 2}
          filter={isHovered ? 'url(#glow)' : undefined}
          style={{ transition: 'all 0.2s ease' }}
        />
        {/* Small center dot */}
        <circle
          cx={node.x}
          cy={node.y}
          r={3}
          fill={color}
          opacity={0.6}
        />
        <text
          x={node.x}
          y={node.y + 26}
          textAnchor="middle"
          fill="rgba(255,255,255,0.8)"
          fontSize={10}
        >
          {node.label.slice(0, 18)}
        </text>
      </g>
    );
  }

  // Task — small filled circle
  return (
    <g
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      <circle
        cx={node.x}
        cy={node.y}
        r={isHovered ? 9 : 8}
        fill={color}
        stroke={isSelected ? '#fbbf24' : isHovered ? 'rgba(255,255,255,0.5)' : 'none'}
        strokeWidth={isSelected ? 2 : 1}
        opacity={Math.max(0.5, node.confidence)}
        filter={isHovered ? 'url(#glow)' : undefined}
        style={{ transition: 'all 0.2s ease' }}
      />
      <text
        x={node.x}
        y={node.y + 18}
        textAnchor="middle"
        fill={isHovered ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.6)'}
        fontSize={9}
        style={{ transition: 'fill 0.2s ease' }}
      >
        {node.label.slice(0, 16)}
      </text>
    </g>
  );
};
