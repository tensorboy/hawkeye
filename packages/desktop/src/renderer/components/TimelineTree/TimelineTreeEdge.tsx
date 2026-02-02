/**
 * TimelineTreeEdge - Connection line between timeline nodes
 * Features animation for "growing" effect
 */

import React from 'react';
import type { TimelineEdge } from './useTimelineLayout';

interface TimelineTreeEdgeProps {
  edge: TimelineEdge;
  isAnimating: boolean;
}

export const TimelineTreeEdge: React.FC<TimelineTreeEdgeProps> = ({ edge, isAnimating }) => {
  const { from, to } = edge;

  // Calculate control points for smooth curve
  const dx = to.x - from.x;
  const midX = from.x + dx / 2;

  // If same Y level, use straight horizontal with slight curve
  // If different Y levels, use S-curve
  const isSameLevel = Math.abs(from.y - to.y) < 5;

  let d: string;
  if (isSameLevel) {
    // Slight curve for horizontal connection
    const curveHeight = 10;
    d = `M ${from.x} ${from.y}
         C ${midX} ${from.y - curveHeight},
           ${midX} ${to.y - curveHeight},
           ${to.x} ${to.y}`;
  } else {
    // S-curve for level transitions
    d = `M ${from.x} ${from.y}
         C ${midX} ${from.y},
           ${midX} ${to.y},
           ${to.x} ${to.y}`;
  }

  // Calculate path length for animation
  const pathLength = Math.sqrt(dx * dx + Math.pow(to.y - from.y, 2)) * 1.2;

  return (
    <path
      d={d}
      fill="none"
      stroke="rgba(148, 163, 184, 0.4)"
      strokeWidth={2}
      strokeLinecap="round"
      style={{
        strokeDasharray: pathLength,
        strokeDashoffset: isAnimating ? pathLength : 0,
        transition: `stroke-dashoffset 0.3s ease-out`,
        transitionDelay: `${edge.animationDelay}ms`,
      }}
    />
  );
};
