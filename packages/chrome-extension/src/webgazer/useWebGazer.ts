/**
 * WebGazer Hook for Chrome Extension
 *
 * Features:
 * - Implicit calibration via clicks
 * - Cross-session data persistence via chrome.storage
 * - Sync with desktop app for collaborative calibration
 */

// Import WebGazer types
import type webgazer from 'webgazer';

// Type alias for WebGazer instance
type WebGazerInstance = typeof webgazer;

export interface GazePoint {
  x: number;
  y: number;
  normalizedX: number;
  normalizedY: number;
  timestamp: number;
}

export interface CalibrationSample {
  id: string;
  x: number;
  y: number;
  timestamp: number;
  faceSnapshot: string | null;
  source: 'extension' | 'desktop'; // Track where the sample came from
}

export interface WebGazerState {
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  gazePoint: GazePoint | null;
  sampleCount: number;
  calibrationSamples: CalibrationSample[];
}

export interface WebGazerCallbacks {
  onGaze?: (point: GazePoint) => void;
  onReady?: () => void;
  onError?: (error: string) => void;
  onCalibrationSample?: (sample: CalibrationSample) => void;
}

class WebGazerController {
  private state: WebGazerState = {
    isReady: false,
    isLoading: false,
    error: null,
    gazePoint: null,
    sampleCount: 0,
    calibrationSamples: [],
  };

  private callbacks: WebGazerCallbacks = {};
  private webgazerInstance: WebGazerInstance | null = null;
  private listeners: Set<(state: WebGazerState) => void> = new Set();
  private videoElement: HTMLVideoElement | null = null;
  private checkReadyInterval: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;

  subscribe(listener: (state: WebGazerState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener({ ...this.state }));
  }

  setCallbacks(callbacks: WebGazerCallbacks) {
    this.callbacks = callbacks;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized || this.state.isLoading) return;

    this.state.isLoading = true;
    this.state.error = null;
    this.notifyListeners();

    try {
      // Dynamically import webgazer
      const webgazer = await import('webgazer');
      this.webgazerInstance = (webgazer.default || webgazer) as unknown as WebGazerInstance;

      // Configure WebGazer
      this.webgazerInstance
        .setRegression('ridge')
        .showPredictionPoints(false)
        .showVideo(false)
        .showFaceOverlay(false)
        .showFaceFeedbackBox(false)
        .applyKalmanFilter(true)
        .saveDataAcrossSessions(true);

      // Set gaze listener
      this.webgazerInstance.setGazeListener((data, _elapsedTime) => {
        if (!data) return;

        const gazePoint: GazePoint = {
          x: data.x,
          y: data.y,
          normalizedX: data.x / window.innerWidth,
          normalizedY: data.y / window.innerHeight,
          timestamp: Date.now(),
        };

        this.state.gazePoint = gazePoint;
        this.notifyListeners();
        this.callbacks.onGaze?.(gazePoint);
      });

      // Start WebGazer
      await this.webgazerInstance.begin();

      // Check ready status
      this.checkReadyInterval = setInterval(() => {
        if (this.webgazerInstance?.isReady()) {
          this.state.isReady = true;
          this.state.isLoading = false;
          this.notifyListeners();
          this.callbacks.onReady?.();

          // Get video element reference
          this.videoElement = document.getElementById('webgazerVideoFeed') as HTMLVideoElement;

          if (this.checkReadyInterval) {
            clearInterval(this.checkReadyInterval);
            this.checkReadyInterval = null;
          }
        }
      }, 100);

      // Set up click listener for calibration
      this.setupClickCalibration();

      // Load saved calibration data
      await this.loadCalibrationData();

      this.isInitialized = true;
      console.log('[WebGazer Extension] Initialized successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.state.error = errorMessage;
      this.state.isLoading = false;
      this.notifyListeners();
      this.callbacks.onError?.(errorMessage);
      console.error('[WebGazer Extension] Initialization failed:', error);
    }
  }

  private setupClickCalibration() {
    document.addEventListener('click', (event) => {
      if (!this.state.isReady || !this.webgazerInstance) return;

      // Record calibration point
      this.webgazerInstance.recordScreenPosition(event.clientX, event.clientY);

      // Capture face snapshot
      const snapshot = this.captureFaceSnapshot();

      // Create calibration sample
      const sample: CalibrationSample = {
        id: `ext-${Date.now()}`,
        x: event.clientX,
        y: event.clientY,
        timestamp: Date.now(),
        faceSnapshot: snapshot,
        source: 'extension',
      };

      // Update state
      this.state.sampleCount++;
      this.state.calibrationSamples = [...this.state.calibrationSamples.slice(-19), sample];
      this.notifyListeners();

      // Save to storage
      this.saveCalibrationData();

      // Notify callback
      this.callbacks.onCalibrationSample?.(sample);
    });
  }

  captureFaceSnapshot(): string | null {
    const videoEl = this.videoElement || document.getElementById('webgazerVideoFeed') as HTMLVideoElement;
    if (!videoEl || videoEl.readyState < 2) return null;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 320;
      canvas.height = videoEl.videoHeight || 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      console.warn('[WebGazer Extension] Failed to capture face snapshot:', e);
      return null;
    }
  }

  addCalibrationPoint(x: number, y: number, source: 'extension' | 'desktop' = 'extension') {
    if (!this.state.isReady || !this.webgazerInstance) return;

    this.webgazerInstance.recordScreenPosition(x, y);

    const sample: CalibrationSample = {
      id: `${source}-${Date.now()}`,
      x,
      y,
      timestamp: Date.now(),
      faceSnapshot: source === 'extension' ? this.captureFaceSnapshot() : null,
      source,
    };

    this.state.sampleCount++;
    this.state.calibrationSamples = [...this.state.calibrationSamples.slice(-19), sample];
    this.notifyListeners();

    this.saveCalibrationData();
  }

  pause() {
    this.webgazerInstance?.pause();
  }

  resume() {
    this.webgazerInstance?.resume();
  }

  clearCalibrationData() {
    this.webgazerInstance?.clearData();
    this.state.sampleCount = 0;
    this.state.calibrationSamples = [];
    this.notifyListeners();

    chrome.storage.local.remove(['webgazer_samples', 'webgazer_count']);
    console.log('[WebGazer Extension] Calibration data cleared');
  }

  private async saveCalibrationData() {
    try {
      await chrome.storage.local.set({
        webgazer_samples: this.state.calibrationSamples,
        webgazer_count: this.state.sampleCount,
      });
    } catch (e) {
      console.warn('[WebGazer Extension] Failed to save calibration data:', e);
    }
  }

  private async loadCalibrationData() {
    try {
      const data = await chrome.storage.local.get(['webgazer_samples', 'webgazer_count']);
      if (data.webgazer_samples) {
        this.state.calibrationSamples = data.webgazer_samples;
      }
      if (data.webgazer_count) {
        this.state.sampleCount = data.webgazer_count;
      }
      this.notifyListeners();
    } catch (e) {
      console.warn('[WebGazer Extension] Failed to load calibration data:', e);
    }
  }

  // Sync calibration data from desktop app
  async syncFromDesktop(samples: CalibrationSample[]) {
    if (!this.state.isReady || !this.webgazerInstance) return;

    for (const sample of samples) {
      // Add calibration points from desktop
      this.webgazerInstance.recordScreenPosition(sample.x, sample.y);
    }

    // Merge samples, keeping track of source
    const existingIds = new Set(this.state.calibrationSamples.map(s => s.id));
    const newSamples = samples.filter(s => !existingIds.has(s.id));

    this.state.calibrationSamples = [
      ...this.state.calibrationSamples,
      ...newSamples.map(s => ({ ...s, source: 'desktop' as const }))
    ].slice(-40); // Keep last 40 samples

    this.state.sampleCount = this.state.calibrationSamples.length;
    this.notifyListeners();
    this.saveCalibrationData();

    console.log(`[WebGazer Extension] Synced ${newSamples.length} samples from desktop`);
  }

  // Export calibration data for desktop sync
  exportCalibrationData(): CalibrationSample[] {
    return this.state.calibrationSamples.filter(s => s.source === 'extension');
  }

  destroy() {
    if (this.checkReadyInterval) {
      clearInterval(this.checkReadyInterval);
    }
    this.webgazerInstance?.end();
    this.isInitialized = false;
    this.state = {
      isReady: false,
      isLoading: false,
      error: null,
      gazePoint: null,
      sampleCount: 0,
      calibrationSamples: [],
    };
    this.notifyListeners();
  }

  getState(): WebGazerState {
    return { ...this.state };
  }
}

// Singleton instance
export const webGazerController = new WebGazerController();

// Export functions for easy use
export const initializeWebGazer = () => webGazerController.initialize();
export const pauseWebGazer = () => webGazerController.pause();
export const resumeWebGazer = () => webGazerController.resume();
export const clearWebGazerData = () => webGazerController.clearCalibrationData();
export const addCalibrationPoint = (x: number, y: number, source?: 'extension' | 'desktop') =>
  webGazerController.addCalibrationPoint(x, y, source);
export const syncFromDesktop = (samples: CalibrationSample[]) =>
  webGazerController.syncFromDesktop(samples);
export const exportCalibrationData = () => webGazerController.exportCalibrationData();
export const getWebGazerState = () => webGazerController.getState();
export const subscribeToWebGazer = (listener: (state: WebGazerState) => void) =>
  webGazerController.subscribe(listener);
