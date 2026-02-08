/**
 * Ikigai Diagram
 *
 * Visualizes the Japanese concept of life purpose
 * as four overlapping circles.
 */

import React from 'react';
import type { Ikigai } from '@hawkeye/core';

interface IkigaiDiagramProps {
  ikigai: Ikigai;
  size?: number;
  interactive?: boolean;
  onQuadrantClick?: (quadrant: keyof Pick<Ikigai, 'whatYouLove' | 'whatYoureGoodAt' | 'whatWorldNeeds' | 'whatYouCanBePaidFor'>) => void;
}

interface CircleConfig {
  id: keyof Pick<Ikigai, 'whatYouLove' | 'whatYoureGoodAt' | 'whatWorldNeeds' | 'whatYouCanBePaidFor'>;
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  cx: number;
  cy: number;
}

export const IkigaiDiagram: React.FC<IkigaiDiagramProps> = ({
  ikigai,
  size = 280,
  interactive = false,
  onQuadrantClick,
}) => {
  const center = size / 2;
  const circleRadius = size * 0.28;
  const offset = size * 0.15;

  const circles: CircleConfig[] = [
    {
      id: 'whatYouLove',
      label: 'What you LOVE',
      shortLabel: 'Love',
      color: '#f472b6',
      icon: '❤️',
      cx: center,
      cy: center - offset,
    },
    {
      id: 'whatYoureGoodAt',
      label: 'What you\'re GOOD AT',
      shortLabel: 'Skill',
      color: '#60a5fa',
      icon: '💪',
      cx: center + offset,
      cy: center,
    },
    {
      id: 'whatWorldNeeds',
      label: 'What the world NEEDS',
      shortLabel: 'Mission',
      color: '#34d399',
      icon: '🌍',
      cx: center,
      cy: center + offset,
    },
    {
      id: 'whatYouCanBePaidFor',
      label: 'What you can be PAID FOR',
      shortLabel: 'Vocation',
      color: '#fbbf24',
      icon: '💰',
      cx: center - offset,
      cy: center,
    },
  ];

  // Intersection labels
  const intersections = [
    { name: 'Passion', x: center + offset * 0.5, y: center - offset * 0.5 },
    { name: 'Mission', x: center + offset * 0.5, y: center + offset * 0.5 },
    { name: 'Profession', x: center - offset * 0.5, y: center + offset * 0.5 },
    { name: 'Vocation', x: center - offset * 0.5, y: center - offset * 0.5 },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          {/* Circle gradients */}
          {circles.map((c) => (
            <radialGradient key={`grad-${c.id}`} id={`ikigai-${c.id}`}>
              <stop offset="0%" stopColor={c.color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={c.color} stopOpacity="0.1" />
            </radialGradient>
          ))}

          {/* Center glow */}
          <radialGradient id="ikigai-center">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </radialGradient>

          {/* Styles */}
          <style>
            {`
              .ikigai-circle {
                transition: all 0.3s ease;
              }
              .ikigai-circle:hover {
                filter: brightness(1.2);
              }
              @keyframes ikigaiPulse {
                0%, 100% { transform: scale(1); opacity: 0.8; }
                50% { transform: scale(1.05); opacity: 1; }
              }
              .ikigai-center-glow {
                animation: ikigaiPulse 2s ease-in-out infinite;
              }
            `}
          </style>
        </defs>

        {/* Background circles */}
        {circles.map((c) => (
          <g key={c.id}>
            <circle
              className="ikigai-circle"
              cx={c.cx}
              cy={c.cy}
              r={circleRadius}
              fill={`url(#ikigai-${c.id})`}
              stroke={c.color}
              strokeWidth="2"
              strokeOpacity="0.5"
              style={{ cursor: interactive ? 'pointer' : 'default' }}
              onClick={() => interactive && onQuadrantClick?.(c.id)}
            />
          </g>
        ))}

        {/* Center IKIGAI glow */}
        <circle
          className="ikigai-center-glow"
          cx={center}
          cy={center}
          r={circleRadius * 0.3}
          fill="url(#ikigai-center)"
        />

        {/* IKIGAI text */}
        <text
          x={center}
          y={center - 6}
          textAnchor="middle"
          fill="white"
          fontSize="14"
          fontWeight="700"
        >
          IKIGAI
        </text>
        <text
          x={center}
          y={center + 10}
          textAnchor="middle"
          fill="rgba(148, 163, 184, 0.7)"
          fontSize="9"
        >
          {ikigai.discoveryProgress}% discovered
        </text>

        {/* Intersection labels */}
        {intersections.map((int, i) => (
          <text
            key={i}
            x={int.x}
            y={int.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(148, 163, 184, 0.5)"
            fontSize="8"
          >
            {int.name}
          </text>
        ))}

        {/* Circle labels (outside) */}
        {circles.map((c) => {
          const labelOffset = circleRadius + 20;
          let labelX = c.cx;
          let labelY = c.cy;

          if (c.cy < center) labelY = c.cy - labelOffset;
          else if (c.cy > center) labelY = c.cy + labelOffset;
          else if (c.cx < center) labelX = c.cx - labelOffset;
          else labelX = c.cx + labelOffset;

          return (
            <g key={`label-${c.id}`}>
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={c.color}
                fontSize="10"
                fontWeight="600"
              >
                {c.icon} {c.shortLabel}
              </text>
              <text
                x={labelX}
                y={labelY + 12}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgba(148, 163, 184, 0.6)"
                fontSize="9"
              >
                {ikigai[c.id].length} items
              </text>
            </g>
          );
        })}
      </svg>

      {/* Progress bar */}
      <div style={{
        marginTop: '12px',
        padding: '0 16px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '4px',
        }}>
          <span style={{ fontSize: '10px', color: 'rgba(148, 163, 184, 0.7)' }}>
            Discovery Progress
          </span>
          <span style={{ fontSize: '10px', fontWeight: '600', color: '#fbbf24' }}>
            {ikigai.discoveryProgress}%
          </span>
        </div>
        <div style={{
          height: '6px',
          background: 'rgba(30, 41, 59, 0.8)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${ikigai.discoveryProgress}%`,
            background: 'linear-gradient(90deg, #f472b6, #fbbf24)',
            borderRadius: '3px',
            transition: 'width 0.5s ease-out',
          }} />
        </div>
      </div>

      {/* Quadrant items preview */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        marginTop: '12px',
        padding: '0 8px',
      }}>
        {circles.map((c) => {
          const items = ikigai[c.id];
          const displayItems = items.slice(0, 2);
          return (
            <div
              key={c.id}
              style={{
                padding: '8px',
                background: 'rgba(30, 41, 59, 0.5)',
                borderRadius: '6px',
                borderLeft: `2px solid ${c.color}`,
              }}
            >
              <div style={{
                fontSize: '9px',
                color: c.color,
                marginBottom: '4px',
              }}>
                {c.icon} {c.shortLabel}
              </div>
              {displayItems.length > 0 ? (
                displayItems.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: '10px',
                      color: 'rgba(148, 163, 184, 0.8)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    • {item}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '10px', color: 'rgba(148, 163, 184, 0.4)', fontStyle: 'italic' }}>
                  Not yet discovered
                </div>
              )}
              {items.length > 2 && (
                <div style={{ fontSize: '9px', color: 'rgba(148, 163, 184, 0.5)', marginTop: '2px' }}>
                  +{items.length - 2} more
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default IkigaiDiagram;
