import React from 'react';
import type { LayoutEdge } from './useTreeLayout';

interface LifeTreeEdgeProps {
  edge: LayoutEdge;
  stageColor?: string;
}

export const LifeTreeEdge: React.FC<LifeTreeEdgeProps> = ({ edge, stageColor }) => {
  const { from, to } = edge;

  // Create a more organic curved path
  const deltaY = to.y - from.y;
  const controlOffset = deltaY * 0.6;

  const d = `M ${from.x} ${from.y}
             C ${from.x} ${from.y + controlOffset},
               ${to.x} ${to.y - controlOffset},
               ${to.x} ${to.y}`;

  // Calculate a unique ID for gradient
  const gradientId = `edge-gradient-${from.x}-${from.y}-${to.x}-${to.y}`.replace(/\./g, '-');

  const baseColor = stageColor ?? 'rgba(148, 163, 184, 0.6)';

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={baseColor} stopOpacity={0.8} />
          <stop offset="100%" stopColor={baseColor} stopOpacity={0.3} />
        </linearGradient>
      </defs>
      {/* Glow effect */}
      <path
        d={d}
        fill="none"
        stroke={baseColor}
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.15}
      />
      {/* Main line */}
      <path
        d={d}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={2}
        strokeLinecap="round"
        style={{
          transition: 'stroke-width 0.2s ease',
        }}
      />
    </g>
  );
};
