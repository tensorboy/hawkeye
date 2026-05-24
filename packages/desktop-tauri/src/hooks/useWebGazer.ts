/**
 * useWebGazer - WebGazer.js eye tracking hook for Tauri
 *
 * Features:
 * - Implicit calibration via click events
 * - Ridge regression model with Kalman filtering
 * - Auto-seed calibration after face detection
 * - MediaPipe WASM for face mesh (offline, no network)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { submitGazeSample, predictGaze, type GazeSample } from './useTauri';

interface WebGazerData {
  x: number;
  y: number;
}

interface WebGazerInstance {
  setRegression: (type: string) => WebGazerInstance;
  setTracker: (type: string) => WebGazerInstance;
  setGazeListener: (callback: (data: WebGazerData | null, clock: number) => void) => WebGazerInstance;
  begin: () => WebGazerInstance;
  end: () => void;
  pause: () => void;
  resume: () => void;
  isReady: () => boolean;
  showPredictionPoints: (show: boolean) => WebGazerInstance;
  showVideo: (show: boolean) => WebGazerInstance;
  showFaceOverlay: (show: boolean) => WebGazerInstance;
  showFaceFeedbackBox: (show: boolean) => WebGazerInstance;
  saveDataAcrossSessions: (save: boolean) => WebGazerInstance;
  applyKalmanFilter: (apply: boolean) => WebGazerInstance;
  clearData: () => void;
  recordScreenPosition: (x: number, y: number, type?: string) => void;
  getTracker: () => { getPositions: () => any[] | null };
  getCurrentPrediction: () => Promise<WebGazerData | null>;
  params: {
    imgWidth: number;
    imgHeight: number;
    showVideo: boolean;
    showFaceOverlay: boolean;
    showFaceFeedbackBox: boolean;
    faceMeshSolutionPath: string;
  };
}

declare global {
  interface Window {
    webgazer: WebGazerInstance;
  }
}

export interface GazePoint {
  x: number;
  y: number;
  normalizedX: number;
  normalizedY: number;
  timestamp: number;
}

export type GazeMode = 'webgazer' | 'ane';

export interface UseWebGazerOptions {
  enabled?: boolean;
  showPredictionPoint?: boolean;
  saveAcrossSessions?: boolean;
  useKalmanFilter?: boolean;
  gazeMode?: GazeMode;
  onGaze?: (point: GazePoint) => void;
}

export interface UseWebGazerReturn {
  gazePoint: GazePoint | null;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  pause: () => void;
  resume: () => void;
  clearCalibrationData: () => void;
  addCalibrationPoint: (x: number, y: number) => void;
  sampleCount: number;
  gazeMode: GazeMode;
}

// MediaPipe Face Mesh landmark indices for eye features
// Left eye: 10 landmarks, Right eye: 10 landmarks → 20 points × 2 (x,y) = 40 floats
const LEFT_EYE_INDICES = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173];
const RIGHT_EYE_INDICES = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466];

/**
 * Extract 40 eye feature floats from WebGazer's face mesh positions.
 * Landmarks are normalized relative to the face bounding box.
 */
function extractEyeFeatures(positions: any[]): number[] | null {
  if (!positions || positions.length < 468) return null;

  // Compute face bounding box for normalization
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const p of positions) {
    if (!p || typeof p[0] !== 'number') continue;
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }

  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  if (rangeX < 1 || rangeY < 1) return null;

  const features: number[] = [];

  for (const idx of LEFT_EYE_INDICES) {
    const p = positions[idx];
    if (!p || typeof p[0] !== 'number') return null;
    features.push((p[0] - minX) / rangeX);
    features.push((p[1] - minY) / rangeY);
  }

  for (const idx of RIGHT_EYE_INDICES) {
    const p = positions[idx];
    if (!p || typeof p[0] !== 'number') return null;
    features.push((p[0] - minX) / rangeX);
    features.push((p[1] - minY) / rangeY);
  }

  return features.length === 40 ? features : null;
}

export function useWebGazer(options: UseWebGazerOptions = {}): UseWebGazerReturn {
  const {
    enabled = true,
    showPredictionPoint = false,
    saveAcrossSessions = true,
    useKalmanFilter = true,
    gazeMode: requestedMode = 'webgazer',
    onGaze,
  } = options;

  const [gazePoint, setGazePoint] = useState<GazePoint | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [gazeMode, setGazeMode] = useState<GazeMode>(requestedMode);

  const webgazerRef = useRef<WebGazerInstance | null>(null);
  const onGazeRef = useRef(onGaze);
  const isPausedRef = useRef(false);
  const gazeModeRef = useRef(gazeMode);

  useEffect(() => {
    onGazeRef.current = onGaze;
  }, [onGaze]);

  useEffect(() => {
    gazeModeRef.current = requestedMode;
    setGazeMode(requestedMode);
  }, [requestedMode]);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;
    let checkReadyInterval: ReturnType<typeof setInterval> | null = null;

    const initWebGazer = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const webgazerModule = await import('webgazer');

        if (!mounted) return;

        const wg = (webgazerModule.default || webgazerModule || window.webgazer) as WebGazerInstance;

        if (!wg || typeof wg.begin !== 'function') {
          throw new Error('WebGazer failed to load');
        }

        if (!window.webgazer) {
          window.webgazer = wg;
        }

        webgazerRef.current = wg;

        // Set MediaPipe WASM path (offline)
        wg.params.faceMeshSolutionPath = '/mediapipe/face_mesh';

        // Configure
        let gazeStarted = false;
        wg.setRegression('ridge')
          .setGazeListener((data: WebGazerData | null, clock: number) => {
            if (!mounted || isPausedRef.current) return;

            // In ANE mode, try backend prediction using eye features
            if (gazeModeRef.current === 'ane') {
              try {
                const tracker = wg.getTracker();
                const positions = tracker?.getPositions?.();
                const features = positions ? extractEyeFeatures(positions) : null;
                if (features) {
                  predictGaze(features).then((pred) => {
                    if (!mounted || isPausedRef.current) return;
                    const point: GazePoint = {
                      x: pred.x * window.innerWidth,
                      y: pred.y * window.innerHeight,
                      normalizedX: pred.x,
                      normalizedY: pred.y,
                      timestamp: clock,
                    };
                    setGazePoint(point);
                    onGazeRef.current?.(point);
                  }).catch(() => {
                    // Fallback to WebGazer data on ANE error
                    if (data) {
                      const point: GazePoint = {
                        x: data.x, y: data.y,
                        normalizedX: data.x / window.innerWidth,
                        normalizedY: data.y / window.innerHeight,
                        timestamp: clock,
                      };
                      setGazePoint(point);
                      onGazeRef.current?.(point);
                    }
                  });
                  return;
                }
              } catch {
                // Fall through to WebGazer
              }
            }

            if (data) {
              if (!gazeStarted) {
                gazeStarted = true;
                console.log(`[WebGazer] First gaze: (${data.x.toFixed(0)}, ${data.y.toFixed(0)})`);
              }
              const point: GazePoint = {
                x: data.x,
                y: data.y,
                normalizedX: data.x / window.innerWidth,
                normalizedY: data.y / window.innerHeight,
                timestamp: clock,
              };

              setGazePoint(point);
              onGazeRef.current?.(point);
            }
          })
          .saveDataAcrossSessions(saveAcrossSessions)
          .applyKalmanFilter(useKalmanFilter)
          .showPredictionPoints(showPredictionPoint)
          .showVideo(false)
          .showFaceOverlay(false)
          .showFaceFeedbackBox(false);

        wg.begin();

        // Check ready state
        let readyCheckCount = 0;
        checkReadyInterval = setInterval(() => {
          readyCheckCount++;
          if (readyCheckCount > 300) {
            if (checkReadyInterval) clearInterval(checkReadyInterval);
            if (mounted) {
              setError('WebGazer timed out');
              setIsLoading(false);
            }
            return;
          }
          if (wg.isReady()) {
            if (mounted) {
              setIsReady(true);
              setIsLoading(false);
              console.log('[WebGazer] Ready');

              // Hide built-in UI
              wg.showVideo(false);
              wg.showFaceOverlay(false);
              wg.showFaceFeedbackBox(false);
              wg.showPredictionPoints(false);

              const videoContainer = document.getElementById('webgazerVideoContainer');
              if (videoContainer) {
                videoContainer.style.opacity = '0';
                videoContainer.style.position = 'fixed';
                videoContainer.style.top = '-9999px';
                videoContainer.style.left = '-9999px';
                videoContainer.style.pointerEvents = 'none';
              }
              const faceOverlay = document.getElementById('webgazerFaceOverlay');
              if (faceOverlay) faceOverlay.style.display = 'none';
              const feedbackBox = document.getElementById('webgazerFaceFeedbackBox');
              if (feedbackBox) feedbackBox.style.display = 'none';
              const gazeDot = document.getElementById('webgazerGazeDot');
              if (gazeDot) gazeDot.style.display = 'none';

              // Auto-seed calibration after face detection
              let seedAttempts = 0;
              const seedInterval = setInterval(() => {
                if (!mounted || seedAttempts >= 15) {
                  clearInterval(seedInterval);
                  return;
                }
                seedAttempts++;

                try {
                  const tracker = wg.getTracker();
                  const positions = tracker?.getPositions?.();
                  if (!positions || positions.length === 0) return;

                  const w = window.innerWidth;
                  const h = window.innerHeight;
                  const seedPoints = [
                    { x: w * 0.5, y: h * 0.5 },
                    { x: w * 0.2, y: h * 0.2 },
                    { x: w * 0.8, y: h * 0.2 },
                    { x: w * 0.2, y: h * 0.8 },
                    { x: w * 0.8, y: h * 0.8 },
                  ];

                  for (const point of seedPoints) {
                    wg.recordScreenPosition(Math.round(point.x), Math.round(point.y), 'click');
                  }

                  console.log(`[WebGazer] Auto-seeded ${seedPoints.length} calibration points`);
                  clearInterval(seedInterval);
                } catch (e) {
                  // Retry
                }
              }, 500);
            }
            if (checkReadyInterval) clearInterval(checkReadyInterval);
          }
        }, 100);

        // Track clicks for calibration + submit samples for ANE training
        const handleClick = (e: MouseEvent) => {
          setSampleCount(prev => prev + 1);

          // Extract eye features and submit to backend for ANE training
          if (wg && wg.isReady()) {
            try {
              const tracker = wg.getTracker();
              const positions = tracker?.getPositions?.();
              const features = positions ? extractEyeFeatures(positions) : null;
              if (features) {
                const sample: GazeSample = {
                  features,
                  targetX: e.clientX / window.innerWidth,
                  targetY: e.clientY / window.innerHeight,
                  timestamp: Date.now(),
                };
                submitGazeSample(sample).catch((err: unknown) => {
                  console.warn('[WebGazer] Failed to submit gaze sample:', err);
                });
              }
            } catch {
              // Ignore feature extraction errors
            }
          }
        };
        window.addEventListener('click', handleClick);

        return () => {
          window.removeEventListener('click', handleClick);
        };
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize WebGazer');
          setIsLoading(false);
        }
      }
    };

    initWebGazer();

    return () => {
      mounted = false;
      if (checkReadyInterval) clearInterval(checkReadyInterval);
      if (webgazerRef.current) {
        try {
          webgazerRef.current.end();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [enabled, showPredictionPoint, saveAcrossSessions, useKalmanFilter]);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    webgazerRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    webgazerRef.current?.resume();
  }, []);

  const clearCalibrationData = useCallback(() => {
    webgazerRef.current?.clearData();
    setSampleCount(0);
  }, []);

  const addCalibrationPoint = useCallback((x: number, y: number) => {
    webgazerRef.current?.recordScreenPosition(x, y);
    setSampleCount(prev => prev + 1);
  }, []);

  return {
    gazePoint,
    isReady,
    isLoading,
    error,
    pause,
    resume,
    clearCalibrationData,
    addCalibrationPoint,
    sampleCount,
    gazeMode,
  };
}

export default useWebGazer;
