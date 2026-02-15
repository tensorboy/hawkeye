/**
 * GazeOverlay — eye tracking visualization for Tauri
 *
 * Renders a gaze indicator dot and optional debug panel.
 * Uses useWebGazer hook for ridge regression gaze prediction.
 */

import React, { useState, useCallback } from 'react';
import { useWebGazer, type GazePoint } from '../hooks/useWebGazer';
import './GazeOverlay.css';

interface GazeOverlayProps {
  enabled?: boolean;
  showIndicator?: boolean;
  indicatorSize?: number;
  showDebug?: boolean;
  onGaze?: (point: GazePoint) => void;
}

export const GazeOverlay: React.FC<GazeOverlayProps> = ({
  enabled = true,
  showIndicator = true,
  indicatorSize = 30,
  showDebug = false,
  onGaze,
}) => {
  const [indicatorVisible, setIndicatorVisible] = useState(true);

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
    clearCalibrationData,
    pause,
    resume,
  } = useWebGazer({
    enabled,
    onGaze: handleGaze,
    showPredictionPoint: false,
    saveAcrossSessions: true,
    useKalmanFilter: true,
  });

  if (!enabled) return null;

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

      {/* Gaze indicator (blue dot) */}
      {isReady && showIndicator && indicatorVisible && gazePoint && (
        <div
          className="gaze-indicator"
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
