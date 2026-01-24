/**
 * Hawkeye Desktop - Zustand State Store
 * 统一状态管理，优化性能和代码组织
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { A2UICard } from '@hawkeye/core';

// Types
interface HawkeyeStatus {
  initialized: boolean;
  aiReady: boolean;
  aiProvider: string | null;
  syncRunning: boolean;
  syncPort: number | null;
  connectedClients: number;
}

interface AppConfig {
  aiProvider: 'ollama' | 'gemini' | 'openai';
  ollamaHost?: string;
  ollamaModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiBaseUrl?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  syncPort: number;
  autoStartSync: boolean;
  autoUpdate: boolean;
  localOnly: boolean;
  hasOllama: boolean;
  hasGemini: boolean;
  localOnlyRecommendedModel?: string;
  localOnlyAlternatives?: string[];
  onboardingCompleted?: boolean;
}

interface OllamaModel {
  name: string;
  id: string;
  size: string;
  modified: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// UI State
interface UIState {
  // Modal states
  showSettings: boolean;
  showModelSelector: boolean;
  showChatDialog: boolean;
  showDebugTimeline: boolean;
  showOnboarding: boolean;
  showScreenshotPreview: boolean;

  // Loading states
  isLoading: boolean;
  modelTesting: boolean;
  chatLoading: boolean;

  // Other UI states
  screenshotZoomed: boolean;
  autoScroll: boolean;
}

// App State
interface AppState {
  status: HawkeyeStatus | null;
  config: AppConfig | null;
  tempConfig: Partial<AppConfig>;
  cards: A2UICard[];

  // Ollama
  ollamaStatus: { installed: boolean; running: boolean } | null;
  installedModels: OllamaModel[];
  modelPullProgress: {
    model: string;
    progress: number;
    output: string;
    isDownloading: boolean;
  } | null;

  // Chat
  chatMessages: ChatMessage[];
  chatInput: string;

  // Screenshots
  screenshotPreview: string | null;
  ocrTextPreview: string | null;

  // Smart observe
  smartObserveWatching: boolean;

  // Model test
  modelTestResult: { success: boolean; error?: string } | null;
}

// Combined Store
interface HawkeyeStore extends UIState, AppState {
  // UI Actions
  setShowSettings: (show: boolean) => void;
  setShowModelSelector: (show: boolean) => void;
  setShowChatDialog: (show: boolean) => void;
  setShowDebugTimeline: (show: boolean) => void;
  setShowOnboarding: (show: boolean) => void;
  setShowScreenshotPreview: (show: boolean) => void;
  setScreenshotZoomed: (zoomed: boolean) => void;
  setModelTesting: (testing: boolean) => void;
  setChatLoading: (loading: boolean) => void;

  // App Actions
  setStatus: (status: HawkeyeStatus | null) => void;
  setConfig: (config: AppConfig | null) => void;
  setTempConfig: (config: Partial<AppConfig>) => void;
  updateTempConfig: (updates: Partial<AppConfig>) => void;

  // Cards
  setCards: (cards: A2UICard[]) => void;
  addCard: (card: A2UICard) => void;
  removeCard: (cardId: string) => void;
  updateCard: (cardId: string, updates: Partial<A2UICard>) => void;
  clearCardsByType: (type: string) => void;

  // Ollama
  setOllamaStatus: (status: { installed: boolean; running: boolean } | null) => void;
  setInstalledModels: (models: OllamaModel[]) => void;
  setModelPullProgress: (progress: AppState['modelPullProgress']) => void;

  // Chat
  addChatMessage: (message: ChatMessage) => void;
  setChatInput: (input: string) => void;
  clearChatMessages: () => void;

  // Screenshots
  setScreenshotPreview: (preview: string | null) => void;
  setOcrTextPreview: (text: string | null) => void;

  // Smart observe
  setSmartObserveWatching: (watching: boolean) => void;

  // Model test
  setModelTestResult: (result: AppState['modelTestResult']) => void;
}

export const useHawkeyeStore = create<HawkeyeStore>()(
  subscribeWithSelector((set, get) => ({
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

    // Initial App State
    status: null,
    config: null,
    tempConfig: {},
    cards: [],
    ollamaStatus: null,
    installedModels: [],
    modelPullProgress: null,
    chatMessages: [],
    chatInput: '',
    screenshotPreview: null,
    ocrTextPreview: null,
    smartObserveWatching: false,
    modelTestResult: null,

    // UI Actions
    setShowSettings: (show) => set({ showSettings: show }),
    setShowModelSelector: (show) => set({ showModelSelector: show }),
    setShowChatDialog: (show) => set({ showChatDialog: show }),
    setShowDebugTimeline: (show) => set({ showDebugTimeline: show }),
    setShowOnboarding: (show) => set({ showOnboarding: show }),
    setShowScreenshotPreview: (show) => set({ showScreenshotPreview: show }),
    setScreenshotZoomed: (zoomed) => set({ screenshotZoomed: zoomed }),
    setModelTesting: (testing) => set({ modelTesting: testing }),
    setChatLoading: (loading) => set({ chatLoading: loading }),

    // App Actions
    setStatus: (status) => set({ status }),
    setConfig: (config) => set({ config, tempConfig: config || {} }),
    setTempConfig: (config) => set({ tempConfig: config }),
    updateTempConfig: (updates) => set((state) => ({
      tempConfig: { ...state.tempConfig, ...updates }
    })),

    // Cards
    setCards: (cards) => set({ cards }),
    addCard: (card) => set((state) => ({ cards: [...state.cards, card] })),
    removeCard: (cardId) => set((state) => ({
      cards: state.cards.filter((c) => c.id !== cardId)
    })),
    updateCard: (cardId, updates) => set((state) => ({
      cards: state.cards.map((c) => c.id === cardId ? { ...c, ...updates } : c)
    })),
    clearCardsByType: (type) => set((state) => ({
      cards: state.cards.filter((c) => c.type !== type)
    })),

    // Ollama
    setOllamaStatus: (status) => set({ ollamaStatus: status }),
    setInstalledModels: (models) => set({ installedModels: models }),
    setModelPullProgress: (progress) => set({ modelPullProgress: progress }),

    // Chat
    addChatMessage: (message) => set((state) => ({
      chatMessages: [...state.chatMessages, message]
    })),
    setChatInput: (input) => set({ chatInput: input }),
    clearChatMessages: () => set({ chatMessages: [] }),

    // Screenshots
    setScreenshotPreview: (preview) => set({ screenshotPreview: preview }),
    setOcrTextPreview: (text) => set({ ocrTextPreview: text }),

    // Smart observe
    setSmartObserveWatching: (watching) => set({ smartObserveWatching: watching }),

    // Model test
    setModelTestResult: (result) => set({ modelTestResult: result }),
  }))
);

// Selectors for optimized re-renders
export const selectUIState = (state: HawkeyeStore) => ({
  showSettings: state.showSettings,
  showModelSelector: state.showModelSelector,
  showChatDialog: state.showChatDialog,
  showDebugTimeline: state.showDebugTimeline,
  showOnboarding: state.showOnboarding,
  showScreenshotPreview: state.showScreenshotPreview,
});

export const selectAppStatus = (state: HawkeyeStore) => ({
  status: state.status,
  config: state.config,
  smartObserveWatching: state.smartObserveWatching,
});

export const selectCards = (state: HawkeyeStore) => state.cards;

export const selectChat = (state: HawkeyeStore) => ({
  messages: state.chatMessages,
  input: state.chatInput,
  loading: state.chatLoading,
});
