/**
 * TimelineTreeNode - Card-style node in the Timeline
 * Modern, elegant design with smooth animations
 */

import React from 'react';
import type { TimelineNode } from './useTimelineLayout';
import { formatTimeLabel } from './useTimelineLayout';

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  career: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', text: '#60a5fa' },
  learning: { bg: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.4)', text: '#a78bfa' },
  health: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', text: '#34d399' },
  relationships: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#fbbf24' },
  creativity: { bg: 'rgba(236, 72, 153, 0.15)', border: 'rgba(236, 72, 153, 0.4)', text: '#f472b6' },
  finance: { bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.4)', text: '#22d3ee' },
  entertainment: { bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)', text: '#fb923c' },
  general: { bg: 'rgba(107, 114, 128, 0.15)', border: 'rgba(107, 114, 128, 0.4)', text: '#9ca3af' },
};

const STAGE_ICONS: Record<string, string> = {
  career: '💼',
  learning: '📚',
  health: '💪',
  relationships: '👥',
  creativity: '🎨',
  finance: '💰',
  entertainment: '🎮',
  general: '📌',
};

interface TimelineTreeNodeProps {
  node: TimelineNode;
  isSelected: boolean;
  onClick: (id: string) => void;
  isAnimating: boolean;
}

export const TimelineTreeNode: React.FC<TimelineTreeNodeProps> = ({
  node,
  isSelected,
  onClick,
  isAnimating,
}) => {
  const stage = node.dominantStage || 'general';
  const colors = STAGE_COLORS[stage] || STAGE_COLORS.general;
  const icon = STAGE_ICONS[stage] || STAGE_ICONS.general;

  // Truncate label for display
  const displayLabel = node.label.length > 40
    ? node.label.slice(0, 40) + '...'
    : node.label;

  const handleClick = () => onClick(node.id);

  // Card dimensions
  const cardWidth = 160;
  const cardHeight = 80;
  const cardX = node.x - cardWidth / 2;
  const cardY = node.y - cardHeight / 2;

  return (
    <g
      onClick={handleClick}
      style={{
        cursor: 'pointer',
        opacity: isAnimating ? 0 : 1,
        animation: isAnimating ? 'none' : `nodeGrow 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
        animationDelay: `${node.animationDelay}ms`,
      }}
    >
      {/* Connection dot to timeline */}
      <circle
        cx={node.x}
        cy={200}
        r={6}
        fill={colors.text}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={2}
      />

      {/* Vertical connector line */}
      <line
        x1={node.x}
        y1={200}
        x2={node.x}
        y2={cardY + cardHeight}
        stroke={colors.border}
        strokeWidth={2}
        strokeDasharray="4,4"
      />

      {/* Selected glow effect */}
      {isSelected && (
        <rect
          x={cardX - 4}
          y={cardY - 4}
          width={cardWidth + 8}
          height={cardHeight + 8}
          rx={16}
          fill="none"
          stroke={colors.text}
          strokeWidth={2}
          opacity={0.5}
          style={{
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* Card background */}
      <rect
        x={cardX}
        y={cardY}
        width={cardWidth}
        height={cardHeight}
        rx={12}
        fill={colors.bg}
        stroke={isSelected ? colors.text : colors.border}
        strokeWidth={isSelected ? 2 : 1}
      />

      {/* Icon circle */}
      <circle
        cx={cardX + 24}
        cy={cardY + 24}
        r={16}
        fill={colors.border}
      />
      <text
        x={cardX + 24}
        y={cardY + 29}
        textAnchor="middle"
        fontSize={14}
      >
        {icon}
      </text>

      {/* Time label */}
      <text
        x={cardX + 50}
        y={cardY + 20}
        fill={colors.text}
        fontSize={11}
        fontWeight={600}
      >
        {formatTimeLabel(node.timestamp)}
      </text>

      {/* Stage badge */}
      {node.dominantStage && (
        <text
          x={cardX + 50}
          y={cardY + 34}
          fill="rgba(148, 163, 184, 0.6)"
          fontSize={9}
          textTransform="uppercase"
        >
          {node.dominantStage}
        </text>
      )}

      {/* Summary text - line 1 */}
      <text
        x={cardX + 12}
        y={cardY + 54}
        fill="rgba(255, 255, 255, 0.85)"
        fontSize={11}
        fontWeight={500}
      >
        {displayLabel.slice(0, 20)}
      </text>

      {/* Summary text - line 2 */}
      {displayLabel.length > 20 && (
        <text
          x={cardX + 12}
          y={cardY + 68}
          fill="rgba(255, 255, 255, 0.85)"
          fontSize={11}
          fontWeight={500}
        >
          {displayLabel.slice(20, 40)}
        </text>
      )}

      {/* Confidence bar */}
      <rect
        x={cardX + cardWidth - 50}
        y={cardY + 60}
        width={38}
        height={4}
        rx={2}
        fill="rgba(148, 163, 184, 0.2)"
      />
      <rect
        x={cardX + cardWidth - 50}
        y={cardY + 60}
        width={38 * node.confidence}
        height={4}
        rx={2}
        fill={colors.text}
        opacity={0.8}
      />
    </g>
  );
};
