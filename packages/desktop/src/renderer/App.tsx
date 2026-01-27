/**
 * Hawkeye Desktop - A2UI Main App Component
 * Thin router that delegates to page components
 */

import React, { useEffect } from 'react';
import type { A2UICard } from '@hawkeye/core';
import { useHawkeyeStore } from './stores';
import type {
  UserIntent,
  ExecutionPlan,
  PlanExecution,
  ExecutionHistoryItem,
  HawkeyeStatus,
  AppConfig,
} from './stores/types';

import { OnboardingPage } from './pages/OnboardingPage';
import { SettingsPage } from './pages/SettingsPage';
import { MainView } from './pages/MainView';

// ============ Global Type Declarations ============

declare global {
  interface Window {
    hawkeye: {
      // Debug API
      debug: {
        getEvents: (filter?: {
          types?: string[];
          startTime?: number;
          endTime?: number;
          search?: string;
        }) => Promise<Array<{
          id: string;
          timestamp: number;
          type: string;
          data: Record<string, unknown>;
          duration?: number;
          parentId?: string;
        }>>;
        getRecent: (count?: number) => Promise<Array<{
          id: string;
          timestamp: number;
          type: string;
          data: Record<string, unknown>;
          duration?: number;
          parentId?: string;
        }>>;
        getSince: (timestamp: number) => Promise<Array<{
          id: string;
          timestamp: number;
          type: string;
          data: Record<string, unknown>;
          duration?: number;
          parentId?: string;
        }>>;
        clearEvents: () => Promise<boolean>;
        pause: () => Promise<boolean>;
        resume: () => Promise<boolean>;
        getStatus: () => Promise<{
          paused: boolean;
          count: number;
          totalCount: number;
          config?: {
            maxEvents: number;
            enableScreenshots: boolean;
            screenshotThumbnailSize: number;
            truncateTextAt: number;
          };
        }>;
        export: () => Promise<string | null>;
        updateConfig: (config: {
          maxEvents?: number;
          enableScreenshots?: boolean;
          screenshotThumbnailSize?: number;
          truncateTextAt?: number;
        }) => Promise<boolean>;
      };

      // Core API
      observe: () => Promise<void>;
      generatePlan: (intentId: string) => Promise<ExecutionPlan>;
      executePlan: (planId?: string) => Promise<PlanExecution>;
      pauseExecution: (planId: string) => Promise<boolean>;
      resumeExecution: (planId: string) => Promise<PlanExecution | null>;
      cancelExecution: (planId: string) => Promise<boolean>;
      intentFeedback: (intentId: string, feedback: 'accept' | 'reject' | 'irrelevant') => Promise<void>;

      // Status API
      getIntents: () => Promise<UserIntent[]>;
      getPlan: () => Promise<ExecutionPlan | null>;
      getStatus: () => Promise<HawkeyeStatus>;
      getAvailableProviders: () => Promise<string[]>;
      switchAIProvider: (provider: 'llama-cpp' | 'gemini' | 'openai') => Promise<boolean>;

      // Config API
      getConfig: () => Promise<AppConfig>;
      saveConfig: (config: Partial<AppConfig>) => Promise<AppConfig>;

      // AI Chat
      chat: (messages: Array<{ role: string; content: string }>) => Promise<string>;

      // Data management
      getStats: () => Promise<any>;
      cleanup: (days: number) => Promise<number>;
      getExecutionHistory: (limit?: number) => Promise<ExecutionHistoryItem[]>;

      // Legacy compat
      execute: (id: string) => Promise<unknown>;
      getSuggestions: () => Promise<any[]>;
      setApiKey: (key: string) => Promise<void>;

      // Event listeners (all return cleanup functions)
      onIntents: (callback: (intents: UserIntent[]) => void) => (() => void);
      onPlan: (callback: (plan: ExecutionPlan) => void) => (() => void);
      onExecutionProgress: (callback: (data: { planId: string; step: any }) => void) => (() => void);
      onExecutionCompleted: (callback: (execution: PlanExecution) => void) => (() => void);
      onHawkeyeReady: (callback: (status: HawkeyeStatus) => void) => (() => void);
      onModuleReady: (callback: (module: string) => void) => (() => void);
      onAIProviderReady: (callback: (type: string) => void) => (() => void);
      onAIProviderError: (callback: (info: { type: string; error: any }) => void) => (() => void);
      onShowSettings: (callback: () => void) => (() => void);
      onLoading: (callback: (loading: boolean) => void) => (() => void);
      onError: (callback: (error: string) => void) => (() => void);
      onSuggestions: (callback: (suggestions: any[]) => void) => (() => void);

      // App updates
      checkForUpdates: () => Promise<{ success: boolean; version?: string; error?: string }>;
      getAppVersion: () => Promise<string>;

      // Smart observe
      startSmartObserve: () => Promise<{ success: boolean; watching: boolean }>;
      stopSmartObserve: () => Promise<{ success: boolean; watching: boolean }>;
      getSmartObserveStatus: () => Promise<{
        watching: boolean;
        interval: number;
        threshold: number;
        enabled: boolean;
      }>;
      toggleSmartObserve: () => Promise<{ watching: boolean }>;
      onSmartObserveStatus: (callback: (data: { watching: boolean }) => void) => (() => void);
      onSmartObserveChangeDetected: (callback: () => void) => (() => void);

      // Screenshot preview
      getScreenshot: () => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
      getLastContext: () => Promise<{
        success: boolean;
        screenshot?: string;
        ocrText?: string;
        timestamp?: number;
        error?: string;
      }>;
      onScreenshotPreview: (callback: (data: { dataUrl: string; timestamp: number }) => void) => (() => void);

      // Local model management API
      modelGetDirectory: () => Promise<string>;
      modelList: () => Promise<Array<{
        name: string;
        path: string;
        size: number;
        sizeFormatted: string;
        modifiedAt: Date;
        quantization?: string;
      }>>;
      modelDownloadHF: (modelId: string, fileName?: string) => Promise<{ success: boolean; error?: string }>;
      modelCancelDownload: (modelId: string, fileName?: string) => Promise<{ success: boolean }>;
      modelDelete: (modelPath: string) => Promise<{ success: boolean; error?: string }>;
      modelGetRecommended: () => Promise<Array<{
        id: string;
        name: string;
        description: string;
        type: 'text' | 'vision';
        size: string;
        quantization: string;
        fileName: string;
      }>>;
      modelExists: (modelPath: string) => Promise<boolean>;
      onModelDownloadProgress: (callback: (progress: {
        modelId: string;
        fileName: string;
        progress: number;
        downloadedBytes: number;
        totalBytes: number;
        speed?: string;
        eta?: string;
        status: 'downloading' | 'completed' | 'error' | 'cancelled';
        error?: string;
      }) => void) => (() => void);
    };
  }
}

// ============ Card Factory Helpers ============

const generateId = () => `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

function getIntentIcon(type: string): string {
  const icons: Record<string, string> = {
    file_organize: 'folder',
    code_assist: 'terminal',
    search: 'search',
    communication: 'info',
    automation: 'lightning',
    data_process: 'clipboard',
  };
  return icons[type] || 'magic';
}

function getIntentImpact(type: string): 'low' | 'medium' | 'high' {
  const highImpact = ['automation', 'file_organize'];
  const mediumImpact = ['code_assist', 'data_process'];
  if (highImpact.includes(type)) return 'high';
  if (mediumImpact.includes(type)) return 'medium';
  return 'low';
}

const intentToSuggestionCard = (intent: UserIntent): A2UICard => ({
  id: `suggestion_${intent.id}`,
  type: 'suggestion',
  title: intent.description,
  description: intent.context?.reason,
  icon: getIntentIcon(intent.type) as A2UICard['icon'],
  confidence: intent.confidence,
  suggestionType: (intent.type === 'file_organize' ? 'file_organize'
    : intent.type === 'automation' ? 'automation'
    : 'custom') as 'file_organize' | 'error_fix' | 'automation' | 'shortcut' | 'custom',
  timestamp: Date.now(),
  metadata: {
    intentId: intent.id,
    intentType: intent.type,
    impact: getIntentImpact(intent.type),
  },
  actions: [
    { id: 'generate_plan', label: '生成计划', type: 'primary', icon: 'clipboard', shortcut: '⏎' },
    { id: 'dismiss', label: '忽略', type: 'dismiss' },
  ],
});

const planToPreviewCard = (plan: ExecutionPlan): A2UICard => ({
  id: `preview_${plan.id}`,
  type: 'preview',
  title: plan.title,
  description: plan.description,
  icon: 'eye',
  previewType: 'plan',
  content: {
    steps: plan.steps.map((s) => ({
      order: s.order,
      description: s.description,
      actionType: s.actionType,
      riskLevel: (s.riskLevel || 'low') as 'low' | 'medium' | 'high',
    })),
  },
  timestamp: Date.now(),
  metadata: {
    planId: plan.id,
    steps: plan.steps.map((s) => s.description),
    pros: plan.pros,
    cons: plan.cons,
    impact: plan.impact,
    reversible: plan.impact.fullyReversible,
  },
  actions: [
    { id: 'execute', label: '执行计划', type: 'primary', icon: 'arrow-right', shortcut: '⏎' },
    { id: 'reject', label: '放弃', type: 'secondary' },
  ],
});

const createProgressCard = (plan: ExecutionPlan, execution: PlanExecution): A2UICard => ({
  id: `progress_${execution.planId}`,
  type: 'progress',
  title: `执行中: ${plan.title}`,
  description: plan.steps[execution.currentStep - 1]?.description || '准备中...',
  icon: 'refresh',
  currentStep: execution.currentStep,
  totalSteps: plan.steps.length,
  stepDescription: plan.steps[execution.currentStep - 1]?.description || '准备中...',
  progress: (execution.currentStep / plan.steps.length) * 100,
  pausable: true,
  cancellable: true,
  status: 'running',
  timestamp: Date.now(),
  metadata: {
    planId: execution.planId,
    progress: (execution.currentStep / plan.steps.length) * 100,
    currentStep: execution.currentStep,
    totalSteps: plan.steps.length,
  },
  actions: [
    { id: 'pause', label: '暂停', type: 'secondary', icon: 'clock' },
    { id: 'cancel', label: '取消', type: 'danger', icon: 'x' },
  ],
});

const createResultCard = (plan: ExecutionPlan, execution: PlanExecution): A2UICard => {
  const success = execution.status === 'completed';
  const completedSteps = execution.results?.filter((r: any) => r.status === 'completed').length ?? 0;
  const failedSteps = execution.results?.filter((r: any) => r.status === 'failed').length ?? 0;
  return {
    id: `result_${execution.planId}`,
    type: 'result',
    title: success ? '执行完成' : '执行失败',
    description: plan.title,
    icon: success ? 'success' : 'error',
    status: success ? 'success' : 'failed',
    summary: {
      totalSteps: plan.steps.length,
      completedSteps,
      failedSteps,
      duration: execution.completedAt
        ? execution.completedAt - execution.startedAt
        : 0,
    },
    timestamp: Date.now(),
    metadata: {
      planId: execution.planId,
      success,
      results: execution.results,
      duration: execution.completedAt
        ? execution.completedAt - execution.startedAt
        : undefined,
    },
    actions: [
      { id: 'done', label: '完成', type: 'primary' },
      ...(success
        ? []
        : [{ id: 'retry', label: '重试', type: 'secondary' as const }]),
    ],
  };
};

// ============ App Component ============

export default function App() {
  const {
    showOnboarding, setShowOnboarding,
    showSettings,
    setConfig, setTempConfig, setStatus,
    setOnboardingMode, setOnboardingLoading,
    setSmartObserveWatching,
    setScreenshotPreview,
    setShowSettings,
    addCard,
  } = useHawkeyeStore();

  // Initialize app and set up event listeners
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const [configData, statusData] = await Promise.all([
          window.hawkeye.getConfig(),
          window.hawkeye.getStatus(),
        ]);

        setConfig(configData);
        setTempConfig(configData);
        setStatus(statusData);

        if (!configData.onboardingCompleted) {
          setOnboardingMode('choose');
          setShowOnboarding(true);
          setOnboardingLoading(false);
        }
      } catch (err) {
        const card: A2UICard = {
          id: generateId(),
          type: 'error',
          title: '发生错误',
          description: (err as Error).message,
          icon: 'error',
          retryable: false,
          timestamp: Date.now(),
          actions: [{ id: 'dismiss', label: '关闭', type: 'dismiss' }],
        };
        addCard(card);
      }
    };

    initializeApp();

    // Set up event listeners
    const cleanups: Array<() => void> = [];

    cleanups.push(window.hawkeye.onIntents((intents) => {
      const store = useHawkeyeStore.getState();
      const filtered = store.cards.filter((c) => c.type !== 'suggestion');
      const suggestionCards = intents.map(intentToSuggestionCard);
      store.setCards([...filtered, ...suggestionCards]);
    }));

    cleanups.push(window.hawkeye.onPlan((plan) => {
      const store = useHawkeyeStore.getState();
      store.setCurrentPlan(plan);
      const filtered = store.cards.filter((c) => c.type !== 'suggestion');
      store.setCards([...filtered, planToPreviewCard(plan)]);
    }));

    cleanups.push(window.hawkeye.onExecutionProgress((data) => {
      const store = useHawkeyeStore.getState();
      const plan = store.currentPlan;
      const execution = store.currentExecution;
      if (plan && execution) {
        const updatedExecution = { ...execution, currentStep: data.step.order };
        store.setCurrentExecution(updatedExecution);
        const progressCard = createProgressCard(plan, updatedExecution);
        const filtered = store.cards.filter((c) => c.type !== 'progress');
        store.setCards([...filtered, progressCard]);
      }
    }));

    cleanups.push(window.hawkeye.onExecutionCompleted((execution) => {
      const store = useHawkeyeStore.getState();
      store.setCurrentExecution(execution);
      const plan = store.currentPlan;
      if (plan) {
        const resultCard = createResultCard(plan, execution);
        const filtered = store.cards.filter((c) => c.type !== 'progress');
        store.setCards([...filtered, resultCard]);
      }
    }));

    cleanups.push(window.hawkeye.onHawkeyeReady((newStatus) => {
      useHawkeyeStore.getState().setStatus(newStatus);
    }));

    cleanups.push(window.hawkeye.onShowSettings(() => {
      useHawkeyeStore.getState().setShowSettings(true);
    }));

    cleanups.push(window.hawkeye.onError((error) => {
      const store = useHawkeyeStore.getState();
      store.addCard({
        id: generateId(),
        type: 'error',
        title: '发生错误',
        description: error,
        icon: 'error',
        retryable: false,
        timestamp: Date.now(),
        actions: [{ id: 'dismiss', label: '关闭', type: 'dismiss' }],
      });
    }));

    cleanups.push(window.hawkeye.onSmartObserveStatus((data) => {
      useHawkeyeStore.getState().setSmartObserveWatching(data.watching);
    }));

    cleanups.push(window.hawkeye.onSmartObserveChangeDetected(() => {
      // Event received; observation handled by the backend
    }));

    cleanups.push(window.hawkeye.onScreenshotPreview((data) => {
      useHawkeyeStore.getState().setScreenshotPreview(data.dataUrl);
    }));

    window.hawkeye.getSmartObserveStatus().then((status) => {
      setSmartObserveWatching(status.watching);
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  // Route to the appropriate page
  if (showOnboarding) return <OnboardingPage />;
  if (showSettings) return <SettingsPage />;
  return <MainView />;
}
