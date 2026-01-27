import type { StateCreator } from 'zustand';
import type { HawkeyeStore, AppSlice } from '../types';

export const createAppSlice: StateCreator<HawkeyeStore, [], [], AppSlice> = (set) => ({
  // Initial UI State
  showSettings: false,
  showModelSelector: false,
  showChatDialog: false,
  showDebugTimeline: false,
  showOnboarding: false,
  showScreenshotPreview: false,
  isLoading: false,
  modelTesting: false,
  chatLoading: false,
  screenshotZoomed: false,
  autoScroll: true,

  // Initial App Status
  status: null,
  smartObserveWatching: false,
  screenshotPreview: null,
  ocrTextPreview: null,

  // Onboarding State
  onboardingLoading: true,
  selectedOnboardingModel: '',
  onboardingError: null,
  onboardingMode: 'choose',

  // Model State
  installedModels: [],
  modelPullProgress: null,

  // Actions
  setShowSettings: (show) => set({ showSettings: show }),
  setShowModelSelector: (show) => set({ showModelSelector: show }),
  setShowChatDialog: (show) => set({ showChatDialog: show }),
  setShowDebugTimeline: (show) => set({ showDebugTimeline: show }),
  setShowOnboarding: (show) => set({ showOnboarding: show }),
  setShowScreenshotPreview: (show) => set({ showScreenshotPreview: show }),
  setScreenshotZoomed: (zoomed) => set({ screenshotZoomed: zoomed }),
  setModelTesting: (testing) => set({ modelTesting: testing }),
  setChatLoading: (loading) => set({ chatLoading: loading }),
  setStatus: (status) => set({ status }),
  setSmartObserveWatching: (watching) => set({ smartObserveWatching: watching }),
  setScreenshotPreview: (preview) => set({ screenshotPreview: preview }),
  setOcrTextPreview: (text) => set({ ocrTextPreview: text }),
  setOnboardingLoading: (loading) => set({ onboardingLoading: loading }),
  setSelectedOnboardingModel: (model) => set({ selectedOnboardingModel: model }),
  setOnboardingError: (error) => set({ onboardingError: error }),
  setOnboardingMode: (mode) => set({ onboardingMode: mode }),
  setInstalledModels: (models) => set({ installedModels: models }),
  setModelPullProgress: (progress) => set({ modelPullProgress: progress }),
});
