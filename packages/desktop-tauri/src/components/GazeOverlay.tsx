/**
 * GazeOverlay — eye-tracking visualization + gaze→entity coupling.
 *
 * Three visibility tiers (Google DeepMind "Maintain the flow" principle):
 *   • saccade     → indicator invisible (don't distract during motion)
 *   • fixation    → faint dot (user is settling on something)
 *   • dwell       → solid dot + bbox highlight + command chips
 *
 * When the gaze dwells on an OCR region for >500ms, the region promotes to
 * a `GazedEntity` and is pushed into Rust AppState so voice/agent/chat can
 * resolve "this/that" against it.
 */

import React, { useState, useCallback } from 'react';
import { useWebGazer, type GazePoint } from '../hooks/useWebGazer';
import { useGazedEntity } from '../hooks/useGazedEntity';
import { useHawkeyeStore } from '../store';
import { GazeCommandChips } from './GazeCommandChips';
import type { OcrRegion } from '../hooks/useTauri';
import './GazeOverlay.css';

interface GazeOverlayProps {
  enabled?: boolean;
  showIndicator?: boolean;
  indicatorSize?: number;
  showDebug?: boolean;
  /** OCR regions for the current screen (from observe loop or one-shot OCR). */
  regions?: OcrRegion[];
  /** Native screenshot dimensions (so bboxes scale correctly to window px). */
  screenshotWidth?: number;
  screenshotHeight?: number;
  /** Front-most app name (passed to GazedEntity for context). */
  activeAppName?: string;
  /** Show command chips next to the gazed entity (P5). */
  showChips?: boolean;
  /** Bubble chip results up so the host app can render a toast. */
  onChipResult?: (action: string, text: string) => void;
  onGaze?: (point: GazePoint) => void;
}

export const GazeOverlay: React.FC<GazeOverlayProps> = ({
  enabled = true,
  showIndicator = true,
  indicatorSize = 30,
  showDebug = false,
  regions = [],
  screenshotWidth,
  screenshotHeight,
  activeAppName,
  showChips = true,
  onChipResult,
  onGaze,
}) => {
  const [indicatorVisible, setIndicatorVisible] = useState(true);
  const gazeModelMode = useHawkeyeStore((s) => s.gazeModelMode);

  const handleGaze = useCallback(
    (point: GazePoint) => {
      onGaze?.(point);
    },
    [onGaze],
  );

  const {
    gazePoint,
    isReady,
    isLoading,
    error,
    sampleCount,
    gazeMode,
    clearCalibrationData,
    pause,
    resume,
  } = useWebGazer({
    enabled,
    onGaze: handleGaze,
    gazeMode: gazeModelMode,
    showPredictionPoint: false,
    saveAcrossSessions: true,
    useKalmanFilter: true,
  });

  // Couple gaze with screen entities. This drives the 3-tier visibility
  // AND emits the GazedEntity into Rust for deixis resolution.
  const { entity, state: gazeState, dwellMs } = useGazedEntity(gazePoint, {
    regions,
    screenshotWidth,
    screenshotHeight,
    appName: activeAppName,
  });

  if (!enabled) return null;

  // Indicator visibility tier — see Google's "Maintain the flow" principle.
  const indicatorClass =
    `gaze-indicator gaze-indicator--${gazeState}` +
    (gazeMode === 'ane' ? ' gaze-indicator--ane' : '');

  // Saccade: hide entirely (user is moving their eye, not pointing).
  const shouldRenderIndicator =
    isReady &&
    showIndicator &&
    indicatorVisible &&
    gazePoint &&
    gazeState !== 'saccade';

  return (
    <>
      {/* Loading */}
      {isLoading && (
        <div className="gaze-loading">
          <div className="gaze-loading-spinner" />
          <span>Initializing eye tracking...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="gaze-error">
          <span>Eye tracking error: {error}</span>
        </div>
      )}

      {/* Gaze indicator */}
      {shouldRenderIndicator && (
        <div
          className={indicatorClass}
          style={{
            left: gazePoint.x - indicatorSize / 2,
            top: gazePoint.y - indicatorSize / 2,
            width: indicatorSize,
            height: indicatorSize,
          }}
        >
          <div className="gaze-indicator-inner" />
          <div className="gaze-indicator-ring" />
        </div>
      )}

      {/* Entity bbox — only when dwell-on-entity */}
      {entity && gazeState === 'dwell' && (
        <div
          className="gaze-entity-bbox"
          style={{
            left: entity.bboxPx.xPx,
            top: entity.bboxPx.yPx,
            width: entity.bboxPx.widthPx,
            height: entity.bboxPx.heightPx,
          }}
          aria-label={`Looking at: ${entity.text}`}
        />
      )}

      {/* Voice command chips next to the entity */}
      {entity && gazeState === 'dwell' && showChips && (
        <GazeCommandChips entity={entity} onResult={onChipResult} />
      )}

      {/* Debug panel */}
      {showDebug && isReady && (
        <div className="gaze-debug">
          <div className="gaze-debug-title">Eye Tracking</div>
          <div className="gaze-debug-row">
            <span>Status:</span>
            <span className="gaze-debug-value">
              {isReady ? 'Ready' : isLoading ? 'Loading' : 'Off'}
            </span>
          </div>
          <div className="gaze-debug-row">
            <span>Mode:</span>
            <span className="gaze-debug-value" style={{ color: gazeMode === 'ane' ? '#22c55e' : '#3b82f6' }}>
              {gazeMode === 'ane' ? 'ANE' : 'Ridge'}
            </span>
          </div>
          <div className="gaze-debug-row">
            <span>State:</span>
            <span
              className="gaze-debug-value"
              style={{
                color:
                  gazeState === 'dwell'
                    ? '#f59e0b'
                    : gazeState === 'fixation'
                    ? '#22c55e'
                    : '#64748b',
              }}
            >
              {gazeState}
              {gazeState !== 'saccade' && ` (${dwellMs}ms)`}
            </span>
          </div>
          <div className="gaze-debug-row">
            <span>Regions:</span>
            <span className="gaze-debug-value">{regions.length}</span>
          </div>
          {entity && (
            <div className="gaze-debug-row" style={{ alignItems: 'flex-start' }}>
              <span>Entity:</span>
              <span
                className="gaze-debug-value"
                style={{ maxWidth: 130, textAlign: 'right', wordBreak: 'break-all' }}
                title={entity.text}
              >
                {entity.text.length > 24 ? `${entity.text.slice(0, 24)}…` : entity.text}
              </span>
            </div>
          )}
          <div className="gaze-debug-row">
            <span>Samples:</span>
            <span className="gaze-debug-value">{sampleCount}</span>
          </div>
          {gazePoint && (
            <>
              <div className="gaze-debug-row">
                <span>Gaze X:</span>
                <span className="gaze-debug-value">
                  {gazePoint.x.toFixed(0)}px
                </span>
              </div>
              <div className="gaze-debug-row">
                <span>Gaze Y:</span>
                <span className="gaze-debug-value">
                  {gazePoint.y.toFixed(0)}px
                </span>
              </div>
            </>
          )}
          <div className="gaze-debug-actions">
            <button onClick={() => setIndicatorVisible(!indicatorVisible)}>
              {indicatorVisible ? 'Hide Dot' : 'Show Dot'}
            </button>
            <button onClick={clearCalibrationData}>Clear Data</button>
            <button onClick={pause}>Pause</button>
            <button onClick={resume}>Resume</button>
          </div>
          <div className="gaze-debug-tip">
            Click anywhere to calibrate. More clicks = better accuracy.
          </div>
        </div>
      )}
    </>
  );
};

export default GazeOverlay;
