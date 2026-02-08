/**
 * Big Five Personality Profile
 *
 * Displays the OCEAN personality traits as horizontal bar charts.
 * Based on the scientifically validated Big Five model.
 */

import React from 'react';
import type { BigFivePersonality } from '@hawkeye/core';

interface PersonalityProfileProps {
  personality: BigFivePersonality;
  showDescriptions?: boolean;
  compact?: boolean;
}

interface TraitInfo {
  key: keyof BigFivePersonality;
  label: string;
  icon: string;
  color: string;
  lowLabel: string;
  highLabel: string;
  description: string;
}

const TRAIT_INFO: TraitInfo[] = [
  {
    key: 'openness',
    label: 'Openness',
    icon: '🎨',
    color: '#a78bfa',
    lowLabel: 'Practical',
    highLabel: 'Creative',
    description: 'Curiosity, creativity, and willingness to explore new ideas',
  },
  {
    key: 'conscientiousness',
    label: 'Conscientiousness',
    icon: '🎯',
    color: '#60a5fa',
    lowLabel: 'Flexible',
    highLabel: 'Disciplined',
    description: 'Organization, discipline, and goal-oriented behavior',
  },
  {
    key: 'extraversion',
    label: 'Extraversion',
    icon: '⚡',
    color: '#fbbf24',
    lowLabel: 'Reserved',
    highLabel: 'Outgoing',
    description: 'Social energy, assertiveness, and positive emotions',
  },
  {
    key: 'agreeableness',
    label: 'Agreeableness',
    icon: '💚',
    color: '#34d399',
    lowLabel: 'Competitive',
    highLabel: 'Cooperative',
    description: 'Trust, cooperation, and consideration for others',
  },
  {
    key: 'neuroticism',
    label: 'Neuroticism',
    icon: '🌊',
    color: '#f472b6',
    lowLabel: 'Stable',
    highLabel: 'Sensitive',
    description: 'Emotional reactivity and vulnerability to stress',
  },
];

export const PersonalityProfile: React.FC<PersonalityProfileProps> = ({
  personality,
  showDescriptions = false,
  compact = false,
}) => {
  // Find dominant trait
  const dominantTrait = TRAIT_INFO.reduce((max, trait) =>
    personality[trait.key] > personality[max.key] ? trait : max
  , TRAIT_INFO[0]);

  return (
    <div style={{ width: '100%' }}>
      {/* Header with dominant trait */}
      {!compact && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px',
          padding: '8px 12px',
          background: 'rgba(30, 41, 59, 0.5)',
          borderRadius: '8px',
        }}>
          <span style={{ fontSize: '20px' }}>{dominantTrait.icon}</span>
          <div>
            <div style={{ fontSize: '12px', color: 'rgba(148, 163, 184, 0.7)' }}>
              Dominant Trait
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'white' }}>
              {dominantTrait.label}
            </div>
          </div>
          <div style={{
            marginLeft: 'auto',
            padding: '4px 10px',
            background: `${dominantTrait.color}30`,
            borderRadius: '12px',
            color: dominantTrait.color,
            fontSize: '12px',
            fontWeight: '600',
          }}>
            {personality[dominantTrait.key]}%
          </div>
        </div>
      )}

      {/* Trait bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '8px' : '12px' }}>
        {TRAIT_INFO.map((trait) => {
          const value = personality[trait.key];
          return (
            <div key={trait.key}>
              {/* Label row */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <span style={{ fontSize: compact ? '12px' : '14px' }}>{trait.icon}</span>
                  <span style={{
                    fontSize: compact ? '11px' : '12px',
                    color: 'rgba(148, 163, 184, 0.9)',
                  }}>
                    {trait.label}
                  </span>
                </div>
                <span style={{
                  fontSize: compact ? '11px' : '12px',
                  fontWeight: '600',
                  color: trait.color,
                }}>
                  {value}%
                </span>
              </div>

              {/* Progress bar */}
              <div style={{
                position: 'relative',
                height: compact ? '6px' : '8px',
                background: 'rgba(30, 41, 59, 0.8)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${value}%`,
                    background: `linear-gradient(90deg, ${trait.color}80, ${trait.color})`,
                    borderRadius: '4px',
                    transition: 'width 0.5s ease-out',
                  }}
                />

                {/* Midpoint marker */}
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  height: '100%',
                  width: '1px',
                  background: 'rgba(148, 163, 184, 0.3)',
                }} />
              </div>

              {/* Low/High labels */}
              {!compact && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '2px',
                }}>
                  <span style={{ fontSize: '9px', color: 'rgba(148, 163, 184, 0.5)' }}>
                    {trait.lowLabel}
                  </span>
                  <span style={{ fontSize: '9px', color: 'rgba(148, 163, 184, 0.5)' }}>
                    {trait.highLabel}
                  </span>
                </div>
              )}

              {/* Description */}
              {showDescriptions && (
                <div style={{
                  fontSize: '10px',
                  color: 'rgba(148, 163, 184, 0.6)',
                  marginTop: '4px',
                }}>
                  {trait.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PersonalityProfile;
