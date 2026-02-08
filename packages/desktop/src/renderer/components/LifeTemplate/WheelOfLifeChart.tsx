/**
 * Wheel of Life Radar Chart
 *
 * Displays the 8 life dimensions as a radar/spider chart.
 * Inspired by life coaching Wheel of Life assessment.
 */

import React, { useMemo } from 'react';
import type { WheelOfLife, WheelCategoryMeta, WheelOfLifeCategory } from '@hawkeye/core';

// Default categories metadata if not provided
const DEFAULT_CATEGORIES: WheelCategoryMeta[] = [
  { id: 'career', label: 'Career', icon: '💼', color: '#60a5fa', description: 'Work and professional life' },
  { id: 'finance', label: 'Finance', icon: '💰', color: '#22d3ee', description: 'Money and financial security' },
  { id: 'health', label: 'Health', icon: '❤️', color: '#34d399', description: 'Physical and mental health' },
  { id: 'relationships', label: 'Relationships', icon: '💕', color: '#f472b6', description: 'Friendships and social connections' },
  { id: 'personalGrowth', label: 'Growth', icon: '🌱', color: '#a78bfa', description: 'Personal development' },
  { id: 'funRecreation', label: 'Fun', icon: '🎮', color: '#fbbf24', description: 'Fun and recreation' },
  { id: 'physicalEnvironment', label: 'Environment', icon: '🏠', color: '#fb923c', description: 'Living environment' },
  { id: 'family', label: 'Family', icon: '👨‍👩‍👧‍👦', color: '#f87171', description: 'Family and home life' },
];

interface WheelOfLifeChartProps {
  wheelOfLife: WheelOfLife;
  size?: number;
  showLabels?: boolean;
  animated?: boolean;
  interactive?: boolean;
  onCategoryClick?: (categoryId: WheelOfLifeCategory) => void;
}

export const WheelOfLifeChart: React.FC<WheelOfLifeChartProps> = ({
  wheelOfLife,
  size = 280,
  showLabels = true,
  animated = true,
  interactive = false,
  onCategoryClick,
}) => {
  const center = size / 2;
  const radius = (size / 2) - 40;
  const categories = DEFAULT_CATEGORIES;
  const numPoints = categories.length;
  const angleStep = (2 * Math.PI) / numPoints;

  // Calculate points for the data polygon
  const dataPoints = useMemo(() => {
    return categories.map((cat, i) => {
      const angle = angleStep * i - Math.PI / 2; // Start from top
      const score = wheelOfLife[cat.id] ?? 5;
      const value = score / 100; // Normalize to 0-1 range (scores are 0-100)
      const r = radius * value;
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle),
        value: score,
        category: cat,
        angle,
      };
    });
  }, [wheelOfLife, categories, center, radius, angleStep]);

  // Generate path for data polygon
  const dataPath = useMemo(() => {
    if (dataPoints.length === 0) return '';
    const points = dataPoints.map(p => `${p.x},${p.y}`).join(' ');
    return `M ${dataPoints[0].x},${dataPoints[0].y} L ${points} Z`;
  }, [dataPoints]);

  // Calculate grid circles
  const gridCircles = [0.25, 0.5, 0.75, 1];

  // Calculate balance score (inverse of variance)
  const balanceScore = useMemo(() => {
    const values = categories.map(cat => wheelOfLife[cat.id] ?? 0);
    if (values.length === 0) return 50;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    return Math.max(0, Math.round(100 - (Math.sqrt(variance))));
  }, [wheelOfLife, categories]);

  const handleCategoryClick = (categoryId: WheelOfLifeCategory) => {
    if (interactive && onCategoryClick) {
      onCategoryClick(categoryId);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          {/* Gradient for the data area */}
          <linearGradient id="wheelGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.8" />
          </linearGradient>

          {/* Glow effect */}
          <filter id="wheelGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Animation for the data path */}
          {animated && (
            <style>
              {`
                @keyframes wheelFadeIn {
                  from { opacity: 0; transform: scale(0.8); }
                  to { opacity: 1; transform: scale(1); }
                }
                .wheel-data-path {
                  animation: wheelFadeIn 0.6s ease-out forwards;
                  transform-origin: center;
                }
              `}
            </style>
          )}
        </defs>

        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="rgba(30, 41, 59, 0.5)"
          stroke="rgba(148, 163, 184, 0.2)"
          strokeWidth="1"
        />

        {/* Grid circles */}
        {gridCircles.map((scale, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius * scale}
            fill="none"
            stroke="rgba(148, 163, 184, 0.15)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}

        {/* Axis lines */}
        {categories.map((cat, i) => {
          const angle = angleStep * i - Math.PI / 2;
          const endX = center + radius * Math.cos(angle);
          const endY = center + radius * Math.sin(angle);
          return (
            <line
              key={cat.id}
              x1={center}
              y1={center}
              x2={endX}
              y2={endY}
              stroke="rgba(148, 163, 184, 0.2)"
              strokeWidth="1"
            />
          );
        })}

        {/* Data polygon */}
        <path
          className={animated ? 'wheel-data-path' : ''}
          d={dataPath}
          fill="url(#wheelGradient)"
          fillOpacity="0.3"
          stroke="url(#wheelGradient)"
          strokeWidth="2"
          filter="url(#wheelGlow)"
        />

        {/* Data points */}
        {dataPoints.map((point, i) => (
          <g key={i} onClick={() => handleCategoryClick(point.category.id)}>
            <circle
              cx={point.x}
              cy={point.y}
              r={6}
              fill={point.category.color}
              stroke="white"
              strokeWidth="2"
              style={{ cursor: interactive ? 'pointer' : 'default' }}
            />

            {/* Value label near point */}
            <text
              x={point.x + (Math.cos(point.angle) * 15)}
              y={point.y + (Math.sin(point.angle) * 15)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize="10"
              fontWeight="600"
            >
              {point.value}
            </text>
          </g>
        ))}

        {/* Category labels */}
        {showLabels && dataPoints.map((point, i) => {
          const labelRadius = radius + 25;
          const labelX = center + labelRadius * Math.cos(point.angle);
          const labelY = center + labelRadius * Math.sin(point.angle);
          return (
            <g key={`label-${i}`}>
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgba(148, 163, 184, 0.9)"
                fontSize="10"
              >
                {point.category.icon}
              </text>
            </g>
          );
        })}

        {/* Center score */}
        <text
          x={center}
          y={center - 8}
          textAnchor="middle"
          fill="white"
          fontSize="24"
          fontWeight="700"
        >
          {balanceScore}
        </text>
        <text
          x={center}
          y={center + 12}
          textAnchor="middle"
          fill="rgba(148, 163, 184, 0.7)"
          fontSize="10"
        >
          Balance
        </text>
      </svg>

      {/* Legend */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
        marginTop: '12px',
        padding: '0 8px',
      }}>
        {categories.map((cat) => {
          const score = wheelOfLife[cat.id] ?? 0;
          return (
            <div
              key={cat.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '10px',
                color: 'rgba(148, 163, 184, 0.8)',
                cursor: interactive ? 'pointer' : 'default',
              }}
              onClick={() => handleCategoryClick(cat.id)}
            >
              <span style={{ fontSize: '12px' }}>{cat.icon}</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {score}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WheelOfLifeChart;
