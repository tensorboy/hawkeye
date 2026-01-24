import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AppConfig, ScreenshotResult, OcrResult, WindowInfo } from '../hooks/useTauri';

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

  // UI state
  showSettings: boolean;
  showDebugTimeline: boolean;
  showScreenshotPreview: boolean;

  // Actions
  setIsRunning: (running: boolean) => void;
  setStatus: (status: string) => void;
  setConfig: (config: AppConfig) => void;
  setLastScreenshot: (screenshot: ScreenshotResult) => void;
  setLastOcr: (ocr: OcrResult) => void;
  setActiveWindow: (window: WindowInfo) => void;
  setClipboard: (text: string) => void;
  setShowSettings: (show: boolean) => void;
  setShowDebugTimeline: (show: boolean) => void;
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
    showSettings: false,
    showDebugTimeline: false,
    showScreenshotPreview: false,

    // Actions
    setIsRunning: (running) => set({ isRunning: running }),
    setStatus: (status) => set({ status }),
    setConfig: (config) => set({ config }),
    setLastScreenshot: (screenshot) => set({ lastScreenshot: screenshot }),
    setLastOcr: (ocr) => set({ lastOcr: ocr }),
    setActiveWindow: (window) => set({ activeWindow: window }),
    setClipboard: (text) => set({ clipboard: text }),
    setShowSettings: (show) => set({ showSettings: show }),
    setShowDebugTimeline: (show) => set({ showDebugTimeline: show }),
    setShowScreenshotPreview: (show) => set({ showScreenshotPreview: show }),
  }))
);
