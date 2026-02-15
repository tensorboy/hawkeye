/**
 * GesturePanel — hand gesture recognition and control
 *
 * Uses MediaPipe GestureRecognizer via CDN for hand gesture detection.
 * Recognized gestures are sent to the Tauri backend for action dispatch.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { handleGesture, getGestureStatus, setGestureEnabled, type GestureAction } from '../hooks/useTauri';
import { listen } from '@tauri-apps/api/event';

// Gesture mapping
const GESTURE_MAP: Record<string, { icon: string; label: string; action: GestureAction }> = {
  Closed_Fist: { icon: '\u270a', label: 'Click', action: 'click' },
  Open_Palm: { icon: '\ud83d\udd90\ufe0f', label: 'Pause', action: 'pause' },
  Pointing_Up: { icon: '\u261d\ufe0f', label: 'Cursor', action: 'cursor_move' },
  Thumb_Down: { icon: '\ud83d\udc4e', label: 'Cancel', action: 'cancel' },
  Thumb_Up: { icon: '\ud83d\udc4d', label: 'Confirm', action: 'confirm' },
  Victory: { icon: '\u270c\ufe0f', label: 'Screenshot', action: 'screenshot' },
  ILoveYou: { icon: '\ud83e\udd1f', label: 'Menu', action: 'quick_menu' },
};

const GESTURE_HOLD_TIME = 500;
const GESTURE_COOLDOWN = 1000;

export const GesturePanel: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentGesture, setCurrentGesture] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [gestureLog, setGestureLog] = useState<Array<{ time: string; gesture: string; action: string }>>([]);

  const recognizerRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const lastGestureTimeRef = useRef(0);
  const gestureStartRef = useRef<{ gesture: string; time: number } | null>(null);

  // Load status on mount + cleanup camera on unmount
  useEffect(() => {
    getGestureStatus().then((config) => {
      setEnabled(config.enabled);
    }).catch(() => {});

    return () => {
      // Stop all camera tracks on unmount to prevent lingering camera access
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((t) => t.stop());
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Listen for gesture events from backend
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    listen<string>('gesture:screenshot', () => {
      addLog('System', 'Screenshot captured');
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenFn = fn;
      }
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);

  const addLog = useCallback((gesture: string, action: string) => {
    const time = new Date().toLocaleTimeString();
    setGestureLog((prev) => [{ time, gesture, action }, ...prev].slice(0, 20));
  }, []);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Load MediaPipe GestureRecognizer
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest' as string).catch(() => null);

      if (!vision) {
        // Fallback: load via script tag
        await loadMediaPipeScript();
      }

      setIsActive(true);
      setIsLoading(false);

      // Note: Full MediaPipe integration requires the tasks-vision WASM bundle.
      // For now, we provide the UI framework and gesture action dispatch.
      // The actual gesture recognition can be enabled once @mediapipe/tasks-vision is installed.

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera access failed');
      setIsLoading(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setIsActive(false);
    setCurrentGesture(null);
  }, []);

  const toggleEnabled = useCallback(async () => {
    const newEnabled = !enabled;
    await setGestureEnabled(newEnabled);
    setEnabled(newEnabled);
    if (!newEnabled && isActive) {
      stopCamera();
    }
  }, [enabled, isActive, stopCamera]);

  // Simulate gesture for testing
  const simulateGesture = useCallback(async (gestureName: string) => {
    const mapping = GESTURE_MAP[gestureName];
    if (!mapping) return;

    setCurrentGesture(gestureName);
    setLastAction(mapping.label);
    addLog(gestureName, mapping.label);

    await handleGesture({
      action: mapping.action,
      gesture: gestureName,
      confidence: 1.0,
      position: mapping.action === 'cursor_move' ? { x: 0.5, y: 0.5 } : undefined,
    });

    setTimeout(() => setCurrentGesture(null), 500);
  }, [addLog]);

  return (
    <div className="p-4 space-y-4">
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
                onClick={isActive ? stopCamera : startCamera}
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : isActive ? 'Stop Camera' : 'Start Camera'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-2 text-sm text-red-400">{error}</div>
        )}
      </div>

      {/* Camera preview */}
      {isActive && (
        <div className="card">
          <div className="card-title text-sm">Camera Preview</div>
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
              style={{ transform: 'scaleX(-1)' }}
            />
            {currentGesture && (
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 rounded text-white text-sm">
                {GESTURE_MAP[currentGesture]?.icon} {GESTURE_MAP[currentGesture]?.label}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gesture palette (test buttons) */}
      <div className="card">
        <div className="card-title text-sm">Gesture Palette</div>
        <div className="card-content text-xs text-hawkeye-text-muted mb-2">
          Tap to test gesture actions
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(GESTURE_MAP).map(([name, { icon, label }]) => (
            <button
              key={name}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                currentGesture === name
                  ? 'bg-hawkeye-primary/20 border border-hawkeye-primary'
                  : 'bg-hawkeye-surface hover:bg-hawkeye-surface-hover border border-hawkeye-border'
              }`}
              onClick={() => simulateGesture(name)}
            >
              <span className="text-lg">{icon}</span>
              <span className="text-[10px] text-hawkeye-text-muted">{label}</span>
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
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-hawkeye-text-muted"
              >
                <span className="text-[10px] opacity-60">{entry.time}</span>
                <span>{GESTURE_MAP[entry.gesture]?.icon || '\u2728'}</span>
                <span>{entry.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper to load MediaPipe via script tag fallback
async function loadMediaPipeScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-mediapipe-vision]')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest';
    script.setAttribute('data-mediapipe-vision', 'true');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load MediaPipe'));
    document.head.appendChild(script);
  });
}

export default GesturePanel;
