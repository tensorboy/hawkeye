import type { A2UICard } from '@hawkeye/core';

export interface HawkeyeStatus {
  initialized: boolean;
  aiReady: boolean;
  aiProvider: string | null;
  syncRunning: boolean;
  syncPort: number | null;
  connectedClients: number;
}

export interface AppConfig {
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
  smartObserve: boolean;
  smartObserveInterval: number;
  smartObserveThreshold: number;
  onboardingCompleted?: boolean;

  // Skill Configs
  tavilyApiKey?: string;
}

export interface OllamaModel {
  name: string;
  id: string;
  size: string;
  modified: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AppSlice {
  // UI State
  showSettings: boolean;
  showModelSelector: boolean;
  showChatDialog: boolean;
  showDebugTimeline: boolean;
  showOnboarding: boolean;
  showScreenshotPreview: boolean;
  isLoading: boolean;
  modelTesting: boolean;
  chatLoading: boolean;
  screenshotZoomed: boolean;
  autoScroll: boolean;

  // App Status
  status: HawkeyeStatus | null;
  smartObserveWatching: boolean;
  screenshotPreview: string | null;
  ocrTextPreview: string | null;

  // Actions
  setShowSettings: (show: boolean) => void;
  setShowModelSelector: (show: boolean) => void;
  setShowChatDialog: (show: boolean) => void;
  setShowDebugTimeline: (show: boolean) => void;
  setShowOnboarding: (show: boolean) => void;
  setShowScreenshotPreview: (show: boolean) => void;
  setScreenshotZoomed: (zoomed: boolean) => void;
  setModelTesting: (testing: boolean) => void;
  setChatLoading: (loading: boolean) => void;
  setStatus: (status: HawkeyeStatus | null) => void;
  setSmartObserveWatching: (watching: boolean) => void;
  setScreenshotPreview: (preview: string | null) => void;
  setOcrTextPreview: (text: string | null) => void;
}

export interface ConfigSlice {
  config: AppConfig | null;
  tempConfig: Partial<AppConfig>;

  // Ollama
  ollamaStatus: { installed: boolean; running: boolean } | null;
  installedModels: OllamaModel[];
  modelPullProgress: {
    model: string;
    progress: number;
    output: string;
    isDownloading: boolean;
  } | null;
  modelTestResult: { success: boolean; error?: string } | null;

  // Actions
  setConfig: (config: AppConfig | null) => void;
  setTempConfig: (config: Partial<AppConfig>) => void;
  updateTempConfig: (updates: Partial<AppConfig>) => void;
  setOllamaStatus: (status: { installed: boolean; running: boolean } | null) => void;
  setInstalledModels: (models: OllamaModel[]) => void;
  setModelPullProgress: (progress: ConfigSlice['modelPullProgress']) => void;
  setModelTestResult: (result: ConfigSlice['modelTestResult']) => void;
}

export interface IntentSlice {
  chatMessages: ChatMessage[];
  chatInput: string;
  cards: A2UICard[];

  // Actions
  addChatMessage: (message: ChatMessage) => void;
  setChatInput: (input: string) => void;
  clearChatMessages: () => void;
  setCards: (cards: A2UICard[]) => void;
  addCard: (card: A2UICard) => void;
  removeCard: (cardId: string) => void;
  updateCard: (cardId: string, updates: Partial<A2UICard>) => void;
  clearCardsByType: (type: string) => void;
}

export type HawkeyeStore = AppSlice & ConfigSlice & IntentSlice;
