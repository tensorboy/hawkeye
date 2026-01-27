import React from 'react';
import type { LayoutEdge } from './useTreeLayout';

interface LifeTreeEdgeProps {
  edge: LayoutEdge;
}

export const LifeTreeEdge: React.FC<LifeTreeEdgeProps> = ({ edge }) => {
  const { from, to } = edge;
  const midY = (from.y + to.y) / 2;

  const d = `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;

  return (
    <path
      d={d}
      fill="none"
      stroke="rgba(148, 163, 184, 0.4)"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  );
};
