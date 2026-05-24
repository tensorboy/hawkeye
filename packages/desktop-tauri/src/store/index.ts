import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  AppConfig,
  GazedEntity,
  OcrRegion,
  OcrResult,
  ScreenshotResult,
  WindowInfo,
} from '../hooks/useTauri';
import type { GazeMode } from '../hooks/useWebGazer';

interface HawkeyeState {
  // App state
  isRunning: boolean;
  status: string;

  // Config
  config: AppConfig | null;

  // Perception data
  lastScreenshot: ScreenshotResult | null;
  lastOcr: OcrResult | null;
  activeWindow: WindowInfo | null;
  clipboard: string;

  // Gaze↔entity coupling
  /** Latest OCR regions with bbox; fed to GazeOverlay for hit-testing. */
  ocrRegions: OcrRegion[];
  /** Native screenshot dimensions, needed to scale bboxes to window coords. */
  screenshotDims: { width: number; height: number } | null;
  /** Entity the user is currently dwelling on — mirrored from Rust + emitted locally. */
  gazedEntity: GazedEntity | null;
  /** Toast text shown when a chip returns a result. */
  gazeChipResult: { action: string; text: string } | null;

  // Gaze ANE state
  gazeModelReady: boolean;
  gazeModelMode: GazeMode;
  gazeSampleCount: number;
  gazeTrainLoss: number | null;
  gazeIsTraining: boolean;

  // UI state
  showSettings: boolean;
  showScreenshotPreview: boolean;

  // Actions
  setIsRunning: (running: boolean) => void;
  setStatus: (status: string) => void;
  setConfig: (config: AppConfig) => void;
  setLastScreenshot: (screenshot: ScreenshotResult) => void;
  setLastOcr: (ocr: OcrResult) => void;
  setActiveWindow: (window: WindowInfo) => void;
  setClipboard: (text: string) => void;
  setOcrRegions: (regions: OcrRegion[]) => void;
  setScreenshotDims: (dims: { width: number; height: number } | null) => void;
  setGazedEntity: (entity: GazedEntity | null) => void;
  setGazeChipResult: (result: { action: string; text: string } | null) => void;
  setGazeModelReady: (ready: boolean) => void;
  setGazeModelMode: (mode: GazeMode) => void;
  setGazeSampleCount: (count: number) => void;
  setGazeTrainLoss: (loss: number | null) => void;
  setGazeIsTraining: (training: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setShowScreenshotPreview: (show: boolean) => void;
}

export const useHawkeyeStore = create<HawkeyeState>()(
  subscribeWithSelector((set) => ({
    // Initial state
    isRunning: false,
    status: 'Initializing...',
    config: null,
    lastScreenshot: null,
    lastOcr: null,
    activeWindow: null,
    clipboard: '',
    ocrRegions: [],
    screenshotDims: null,
    gazedEntity: null,
    gazeChipResult: null,
    gazeModelReady: false,
    gazeModelMode: 'webgazer' as GazeMode,
    gazeSampleCount: 0,
    gazeTrainLoss: null,
    gazeIsTraining: false,
    showSettings: false,
    showScreenshotPreview: false,

    // Actions
    setIsRunning: (running) => set({ isRunning: running }),
    setStatus: (status) => set({ status }),
    setConfig: (config) => set({ config }),
    setLastScreenshot: (screenshot) => set({ lastScreenshot: screenshot }),
    setLastOcr: (ocr) => set({ lastOcr: ocr }),
    setActiveWindow: (window) => set({ activeWindow: window }),
    setClipboard: (text) => set({ clipboard: text }),
    setOcrRegions: (regions) => set({ ocrRegions: regions }),
    setScreenshotDims: (dims) => set({ screenshotDims: dims }),
    setGazedEntity: (entity) => set({ gazedEntity: entity }),
    setGazeChipResult: (result) => set({ gazeChipResult: result }),
    setGazeModelReady: (ready) => set({ gazeModelReady: ready }),
    setGazeModelMode: (mode) => set({ gazeModelMode: mode }),
    setGazeSampleCount: (count) => set({ gazeSampleCount: count }),
    setGazeTrainLoss: (loss) => set({ gazeTrainLoss: loss }),
    setGazeIsTraining: (training) => set({ gazeIsTraining: training }),
    setShowSettings: (show) => set({ showSettings: show }),
    setShowScreenshotPreview: (show) => set({ showScreenshotPreview: show }),
  }))
);
