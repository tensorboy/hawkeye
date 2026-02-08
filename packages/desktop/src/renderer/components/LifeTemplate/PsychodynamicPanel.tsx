/**
 * Psychodynamic Panel
 *
 * Visualizes Freud's structural model (Id, Ego, Superego)
 * based on user behavior analysis.
 */

import React from 'react';
import type { PsychodynamicProfile } from '@hawkeye/core';

interface PsychodynamicPanelProps {
  profile: PsychodynamicProfile;
  compact?: boolean;
  showDetails?: boolean;
}

export const PsychodynamicPanel: React.FC<PsychodynamicPanelProps> = ({
  profile,
  compact = false,
  showDetails = false,
}) => {
  const { idDriveRatio, egoBalanceScore, superegoPressure, defenseMechanisms } = profile;

  // Calculate the visual proportions
  const total = idDriveRatio + (100 - egoBalanceScore) / 2 + superegoPressure;
  const idHeight = total > 0 ? (idDriveRatio / total) * 100 : 33;
  const superegoHeight = total > 0 ? (superegoPressure / total) * 100 : 33;
  const egoHeight = 100 - idHeight - superegoHeight;

  // Determine overall balance status
  const getBalanceStatus = () => {
    if (egoBalanceScore >= 70) return { status: 'Balanced', color: '#34d399', icon: '✓' };
    if (egoBalanceScore >= 40) return { status: 'Moderate', color: '#fbbf24', icon: '~' };
    return { status: 'Imbalanced', color: '#f87171', icon: '!' };
  };

  const balanceStatus = getBalanceStatus();

  return (
    <div style={{ width: '100%' }}>
      {/* Iceberg visualization */}
      <div style={{
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
      }}>
        {/* Freud Iceberg diagram */}
        <div style={{
          width: compact ? '80px' : '100px',
          height: compact ? '120px' : '160px',
          position: 'relative',
          borderRadius: '50% 50% 40% 40%',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.1) 0%, rgba(30, 41, 59, 0.8) 100%)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
        }}>
          {/* Superego (top) */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: `${superegoHeight * 0.8}%`,
            background: 'linear-gradient(180deg, #a78bfa40, #a78bfa20)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: '10px', color: '#a78bfa' }}>Superego</span>
          </div>

          {/* Water line */}
          <div style={{
            position: 'absolute',
            top: '35%',
            left: 0,
            right: 0,
            height: '2px',
            background: 'linear-gradient(90deg, transparent, rgba(96, 165, 250, 0.6), transparent)',
          }} />

          {/* Ego (middle) */}
          <div style={{
            position: 'absolute',
            top: `${superegoHeight * 0.8}%`,
            left: 0,
            right: 0,
            height: `${egoHeight * 0.8}%`,
            background: 'linear-gradient(180deg, #60a5fa30, #60a5fa10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: '10px', color: '#60a5fa' }}>Ego</span>
          </div>

          {/* Id (bottom) */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${idHeight * 0.8}%`,
            background: 'linear-gradient(180deg, #f4727140, #f4727120)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: '10px', color: '#f47271' }}>Id</span>
          </div>
        </div>

        {/* Metrics */}
        <div style={{ flex: 1 }}>
          {/* Balance status */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: `${balanceStatus.color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: balanceStatus.color,
              fontSize: '12px',
              fontWeight: '700',
            }}>
              {balanceStatus.icon}
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'rgba(148, 163, 184, 0.6)' }}>
                Ego Balance
              </div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: balanceStatus.color }}>
                {balanceStatus.status}
              </div>
            </div>
          </div>

          {/* Metric bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Id Drive */}
            <MetricBar
              label="Id Drive"
              value={idDriveRatio}
              color="#f47271"
              tooltip="Pleasure-seeking behavior ratio"
            />

            {/* Ego Balance */}
            <MetricBar
              label="Ego Strength"
              value={egoBalanceScore}
              color="#60a5fa"
              tooltip="Reality-based decision making"
            />

            {/* Superego Pressure */}
            <MetricBar
              label="Superego"
              value={superegoPressure}
              color="#a78bfa"
              tooltip="Self-imposed moral pressure"
            />
          </div>
        </div>
      </div>

      {/* Defense mechanisms */}
      {defenseMechanisms && defenseMechanisms.length > 0 && !compact && (
        <div style={{ marginTop: '16px' }}>
          <div style={{
            fontSize: '10px',
            color: 'rgba(148, 163, 184, 0.6)',
            marginBottom: '6px',
          }}>
            Observed Defense Mechanisms
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {defenseMechanisms.map((mechanism, i) => (
              <span
                key={i}
                style={{
                  padding: '2px 8px',
                  background: 'rgba(148, 163, 184, 0.1)',
                  borderRadius: '10px',
                  fontSize: '10px',
                  color: 'rgba(148, 163, 184, 0.8)',
                  textTransform: 'capitalize',
                }}
              >
                {mechanism}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Insights */}
      {!compact && (
        <div style={{
          marginTop: '12px',
          padding: '8px 12px',
          background: 'rgba(30, 41, 59, 0.5)',
          borderRadius: '8px',
          borderLeft: `3px solid ${balanceStatus.color}`,
        }}>
          <div style={{ fontSize: '10px', color: 'rgba(148, 163, 184, 0.8)' }}>
            {idDriveRatio > superegoPressure + 20 && (
              <>Behavior leans toward instant gratification. Consider setting structured goals.</>
            )}
            {superegoPressure > idDriveRatio + 20 && (
              <>High self-imposed pressure detected. Balance work with relaxation.</>
            )}
            {Math.abs(idDriveRatio - superegoPressure) <= 20 && egoBalanceScore >= 60 && (
              <>Good balance between pleasure and responsibility. Ego is mediating well.</>
            )}
            {egoBalanceScore < 40 && (
              <>Internal conflict detected. Consider mindfulness or self-reflection practices.</>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Metric bar sub-component
const MetricBar: React.FC<{
  label: string;
  value: number;
  color: string;
  tooltip?: string;
}> = ({ label, value, color, tooltip }) => (
  <div title={tooltip}>
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '2px',
    }}>
      <span style={{ fontSize: '10px', color: 'rgba(148, 163, 184, 0.7)' }}>{label}</span>
      <span style={{ fontSize: '10px', fontWeight: '600', color }}>{value}%</span>
    </div>
    <div style={{
      height: '4px',
      background: 'rgba(30, 41, 59, 0.8)',
      borderRadius: '2px',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%',
        width: `${value}%`,
        background: color,
        borderRadius: '2px',
        transition: 'width 0.5s ease-out',
      }} />
    </div>
  </div>
);

export default PsychodynamicPanel;
