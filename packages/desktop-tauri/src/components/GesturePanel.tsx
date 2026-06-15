/**
 * GesturePanel — hand gesture control surface: camera preview, live 21-point
 * skeleton overlay, pinch meters, and an activity log.
 *
 * Recognition runs in the app-wide handTracker singleton (survives tab
 * switches); event → action dispatch lives in useGestureFusion. This panel
 * only starts/stops the tracker and visualizes what it sees. The palette
 * buttons inject simulated events straight into the backend for testing.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DrawingUtils, GestureRecognizer } from '@mediapipe/tasks-vision';
import { handleGesture, getGestureStatus, setGestureEnabled } from '../hooks/useTauri';
import { GESTURE_ACTIONS } from '../hooks/useGestureFusion';
import { handTracker, type HandFrame } from '../lib/handTracker';
import type { DiscreteGestureType, HandSignal } from '../lib/gestureSignals';
import { listen } from '@tauri-apps/api/event';

// Display metadata per gesture (dispatch mapping lives in useGestureFusion)
const GESTURE_DISPLAY: Record<DiscreteGestureType, { icon: string; label: string }> = {
  Pinch: { icon: '🤌', label: 'Explain' },
  Closed_Fist: { icon: '✊', label: 'Click' },
  Open_Palm: { icon: '🖐️', label: 'Pause' },
  Pointing_Up: { icon: '☝️', label: 'Cursor' },
  Thumb_Down: { icon: '👎', label: 'Cancel' },
  Thumb_Up: { icon: '👍', label: 'Confirm' },
  Victory: { icon: '✌️', label: 'Screenshot' },
  ILoveYou: { icon: '🤟', label: 'Menu' },
};

interface LogEntry {
  time: string;
  gesture: string;
  action: string;
}

export const GesturePanel: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<DrawingUtils | null>(null);

  const [isActive, setIsActive] = useState(handTracker.isRunning);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [sharedCamera, setSharedCamera] = useState(false);
  const [lastEvent, setLastEvent] = useState<DiscreteGestureType | null>(null);
  const [handSignals, setHandSignals] = useState<HandSignal[]>([]);
  const [gestureLog, setGestureLog] = useState<LogEntry[]>([]);

  const addLog = useCallback((gesture: string, action: string) => {
    const time = new Date().toLocaleTimeString();
    setGestureLog((prev) => [{ time, gesture, action }, ...prev].slice(0, 20));
  }, []);

  // Load backend config on mount
  useEffect(() => {
    getGestureStatus()
      .then((config) => setEnabled(config.enabled))
      .catch(() => {});
  }, []);

  // Backend feedback (e.g. screenshot taken) → log
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;
    listen<string>('gesture:screenshot', () => addLog('System', 'Screenshot captured')).then(
      (fn) => {
        if (cancelled) fn();
        else unlistenFn = fn;
      },
    );
    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [addLog]);

  // Draw skeleton + update meters on every tracker frame
  useEffect(() => {
    if (!isActive) return;

    const unFrame = handTracker.onFrame((frame: HandFrame) => {
      setHandSignals(frame.signals.hands);
      drawSkeleton(frame);
    });
    const unEvent = handTracker.onEvent((ev) => {
      setLastEvent(ev.type);
      const display = GESTURE_DISPLAY[ev.type];
      addLog(ev.type, `${display.label} (${ev.handedness})`);
      window.setTimeout(() => setLastEvent((cur) => (cur === ev.type ? null : cur)), 1200);
    });
    return () => {
      unFrame();
      unEvent();
    };
  }, [isActive, addLog]);

  const drawSkeleton = useCallback((frame: HandFrame) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if (canvas.width !== frame.videoWidth || canvas.height !== frame.videoHeight) {
      canvas.width = frame.videoWidth;
      canvas.height = frame.videoHeight;
      drawingRef.current = null; // context invalidated by resize
    }
    if (!drawingRef.current) drawingRef.current = new DrawingUtils(ctx);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Raw (unmirrored) coords; the canvas itself is CSS-mirrored like the video.
    for (const landmarks of frame.result.landmarks) {
      drawingRef.current.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
        color: '#22d3ee',
        lineWidth: 2,
      });
      drawingRef.current.drawLandmarks(landmarks, { color: '#f0abfc', radius: 3 });
    }
  }, []);

  const start = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await handTracker.start();
      setSharedCamera(handTracker.usingSharedCamera);
      if (videoRef.current) {
        videoRef.current.srcObject = handTracker.getStream();
        await videoRef.current.play().catch(() => {});
      }
      setIsActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start hand tracking');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stop = useCallback(() => {
    handTracker.stop();
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsActive(false);
    setHandSignals([]);
    setLastEvent(null);
  }, []);

  // Reattach preview if tracker was already running when this tab mounted
  useEffect(() => {
    if (handTracker.isRunning && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = handTracker.getStream();
      videoRef.current.play().catch(() => {});
      setSharedCamera(handTracker.usingSharedCamera);
    }
  }, [isActive]);

  const toggleEnabled = useCallback(async () => {
    const newEnabled = !enabled;
    await setGestureEnabled(newEnabled);
    setEnabled(newEnabled);
    if (!newEnabled && isActive) stop();
  }, [enabled, isActive, stop]);

  // Simulated event for testing the backend pipeline without a camera
  const simulateGesture = useCallback(
    async (type: DiscreteGestureType) => {
      const action = GESTURE_ACTIONS[type];
      const display = GESTURE_DISPLAY[type];
      setLastEvent(type);
      addLog(type, `${display.label} (simulated)`);
      if (action) {
        await handleGesture({ action, gesture: type, confidence: 1.0 });
      }
      window.setTimeout(() => setLastEvent((cur) => (cur === type ? null : cur)), 800);
    },
    [addLog],
  );

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Controls */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="card-title">Gesture Control</div>
          <div className="flex items-center gap-2">
            <button
              className={`btn text-xs ${enabled ? 'btn-primary' : ''}`}
              onClick={toggleEnabled}
            >
              {enabled ? 'Enabled' : 'Disabled'}
            </button>
            {enabled && (
              <button
                className={`btn text-xs ${isActive ? '' : 'btn-primary'}`}
                onClick={isActive ? stop : start}
                disabled={isLoading}
              >
                {isLoading ? 'Loading model...' : isActive ? 'Stop Tracking' : 'Start Tracking'}
              </button>
            )}
          </div>
        </div>

        {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
        {isActive && sharedCamera && (
          <div className="mt-2 text-xs text-hawkeye-text-muted">
            Sharing the eye-tracking camera — no second capture opened.
          </div>
        )}
      </div>

      {/* Camera preview + skeleton overlay */}
      {isActive && (
        <div className="card">
          <div className="card-title text-sm">Live Tracking</div>
          <div className="relative mt-2 rounded-lg overflow-hidden bg-black">
            <video
              ref={videoRef}
              className="w-full"
              style={{ maxHeight: '180px', objectFit: 'cover', transform: 'scaleX(-1)' }}
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ transform: 'scaleX(-1)', objectFit: 'cover' }}
            />
            {lastEvent && (
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 rounded text-white text-sm">
                {GESTURE_DISPLAY[lastEvent].icon} {GESTURE_DISPLAY[lastEvent].label}
              </div>
            )}
          </div>

          {/* Pinch meters */}
          {handSignals.length > 0 && (
            <div className="mt-2 space-y-1">
              {handSignals.map((h) => (
                <div key={h.handedness} className="flex items-center gap-2 text-xs">
                  <span className="w-10 text-hawkeye-text-muted">{h.handedness}</span>
                  <div className="flex-1 h-1.5 bg-hawkeye-surface rounded overflow-hidden">
                    <div
                      className={`h-full transition-all ${h.pinching ? 'bg-hawkeye-primary' : 'bg-cyan-600/60'}`}
                      style={{ width: `${Math.min(100, Math.max(0, (1 - h.pinch) * 100))}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-hawkeye-text-muted">
                    {h.pinching ? 'pinch' : h.pinch.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Gesture palette (simulated test events) */}
      <div className="card">
        <div className="card-title text-sm">Gesture Palette</div>
        <div className="card-content text-xs text-hawkeye-text-muted mb-2">
          Tap to test gesture actions without a camera
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(GESTURE_DISPLAY) as DiscreteGestureType[]).map((type) => (
            <button
              key={type}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                lastEvent === type
                  ? 'bg-hawkeye-primary/20 border border-hawkeye-primary'
                  : 'bg-hawkeye-surface hover:bg-hawkeye-surface-hover border border-hawkeye-border'
              }`}
              onClick={() => simulateGesture(type)}
            >
              <span className="text-lg">{GESTURE_DISPLAY[type].icon}</span>
              <span className="text-[10px] text-hawkeye-text-muted">
                {GESTURE_DISPLAY[type].label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Activity log */}
      {gestureLog.length > 0 && (
        <div className="card">
          <div className="card-title text-sm">Activity Log</div>
          <div className="mt-2 max-h-32 overflow-auto space-y-1">
            {gestureLog.map((entry, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-hawkeye-text-muted">
                <span className="text-[10px] opacity-60">{entry.time}</span>
                <span>
                  {GESTURE_DISPLAY[entry.gesture as DiscreteGestureType]?.icon || '✨'}
                </span>
                <span>{entry.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GesturePanel;
