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

export interface UseWebGazerOptions {
  enabled?: boolean;
  showPredictionPoint?: boolean;
  saveAcrossSessions?: boolean;
  useKalmanFilter?: boolean;
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
}

export function useWebGazer(options: UseWebGazerOptions = {}): UseWebGazerReturn {
  const {
    enabled = true,
    showPredictionPoint = false,
    saveAcrossSessions = true,
    useKalmanFilter = true,
    onGaze,
  } = options;

  const [gazePoint, setGazePoint] = useState<GazePoint | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleCount, setSampleCount] = useState(0);

  const webgazerRef = useRef<WebGazerInstance | null>(null);
  const onGazeRef = useRef(onGaze);
  const isPausedRef = useRef(false);

  useEffect(() => {
    onGazeRef.current = onGaze;
  }, [onGaze]);

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

        // Track clicks for calibration
        const handleClick = () => {
          setSampleCount(prev => prev + 1);
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
  };
}

export default useWebGazer;
