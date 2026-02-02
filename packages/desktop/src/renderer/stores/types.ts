import type { A2UICard, SafetyAnalysisResult, SafetyRiskLevel } from '@hawkeye/core';
import type { SafetyAlert } from './slices/safety-slice';
import type {
  UserIntent,
  ExecutionPlan,
  PlanExecution,
  ExecutionHistoryItem,
  HawkeyeStatus,
  AppConfig,
  ChatMessage,
  InstalledModel,
  ModelPullProgress,
} from '../../shared/types';

// Re-export shared types as the single source of truth
export type {
  UserIntent,
  ExecutionPlan,
  PlanExecution,
  ExecutionHistoryItem,
  HawkeyeStatus,
  AppConfig,
  ChatMessage,
  InstalledModel,
  ModelPullProgress,
};

export interface AppSlice {
  // UI State
  showSettings: boolean;
  showModelSelector: boolean;
  showChatDialog: boolean;
  showDebugTimeline: boolean;
  showOnboarding: boolean;
  showScreenshotPreview: boolean;
  showHistory: boolean;
  showTimelineTree: boolean;
  showCameraPreview: boolean;
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

  // Onboarding State
  onboardingLoading: boolean;
  selectedOnboardingModel: string;
  onboardingError: string | null;
  onboardingMode: 'choose' | 'local' | 'cloud';

  // Model State
  installedModels: InstalledModel[];
  modelPullProgress: ModelPullProgress | null;

  // Actions
  setShowSettings: (show: boolean) => void;
  setShowModelSelector: (show: boolean) => void;
  setShowChatDialog: (show: boolean) => void;
  setShowDebugTimeline: (show: boolean) => void;
  setShowOnboarding: (show: boolean) => void;
  setShowScreenshotPreview: (show: boolean) => void;
  setShowHistory: (show: boolean) => void;
  setShowTimelineTree: (show: boolean) => void;
  setShowCameraPreview: (show: boolean) => void;
  setScreenshotZoomed: (zoomed: boolean) => void;
  setModelTesting: (testing: boolean) => void;
  setChatLoading: (loading: boolean) => void;
  setStatus: (status: HawkeyeStatus | null) => void;
  setSmartObserveWatching: (watching: boolean) => void;
  setScreenshotPreview: (preview: string | null) => void;
  setOcrTextPreview: (text: string | null) => void;
  setOnboardingLoading: (loading: boolean) => void;
  setSelectedOnboardingModel: (model: string) => void;
  setOnboardingError: (error: string | null) => void;
  setOnboardingMode: (mode: 'choose' | 'local' | 'cloud') => void;
  setInstalledModels: (models: InstalledModel[]) => void;
  setModelPullProgress: (progress: ModelPullProgress | null) => void;
}

export interface ConfigSlice {
  config: AppConfig | null;
  tempConfig: Partial<AppConfig>;

  modelTestResult: { success: boolean; error?: string } | null;

  // Actions
  setConfig: (config: AppConfig | null) => void;
  setTempConfig: (config: Partial<AppConfig>) => void;
  updateTempConfig: (updates: Partial<AppConfig>) => void;
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

export interface ExecutionSlice {
  currentPlan: ExecutionPlan | null;
  currentExecution: PlanExecution | null;

  // Actions
  setCurrentPlan: (plan: ExecutionPlan | null) => void;
  setCurrentExecution: (execution: PlanExecution | null) => void;
}

export interface LifeTreeSlice {
  lifeTree: any | null;
  lifeTreeLoading: boolean;
  lifeTreeError: string | null;
  selectedNodeId: string | null;
  expandedNodeIds: Set<string>;
  showLifeTree: boolean;

  setShowLifeTree: (show: boolean) => void;
  setSelectedNodeId: (id: string | null) => void;
  toggleNodeExpanded: (id: string) => void;
  fetchLifeTree: () => Promise<void>;
  rebuildLifeTree: () => Promise<void>;
}

export interface SafetySlice {
  // State
  safetyAlerts: SafetyAlert[];
  safetyHistory: SafetyAlert[];
  safetyEnabled: boolean;
  autoCheckUrls: boolean;
  autoCheckClipboard: boolean;
  showSafetyPanel: boolean;
  lastCheckResult: SafetyAnalysisResult | null;

  // Actions
  setSafetyEnabled: (enabled: boolean) => void;
  setAutoCheckUrls: (enabled: boolean) => void;
  setAutoCheckClipboard: (enabled: boolean) => void;
  setShowSafetyPanel: (show: boolean) => void;
  addSafetyAlert: (alert: SafetyAlert) => void;
  removeSafetyAlert: (alertId: string) => void;
  clearSafetyAlerts: () => void;
  updateAlertAction: (alertId: string, action: SafetyAlert['userAction']) => void;
  getAlertsByRiskLevel: (riskLevel: SafetyRiskLevel) => SafetyAlert[];
  getRecentAlerts: (count: number) => SafetyAlert[];
  getHighRiskAlerts: () => SafetyAlert[];
  clearHistory: () => void;
  setLastCheckResult: (result: SafetyAnalysisResult | null) => void;
}

export type HawkeyeStore = AppSlice & ConfigSlice & IntentSlice & ExecutionSlice & LifeTreeSlice & SafetySlice;
