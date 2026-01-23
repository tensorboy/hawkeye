/**
 * Hawkeye Desktop - A2UI Main App Component
 * 零输入交互界面 - 卡片式用户交互
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { languages } from './i18n';
import type { A2UICard, A2UIAction } from '@hawkeye/core';
import { CardList, QuickActions, defaultQuickActions } from './components/A2UI';
import type { QuickAction } from './components/A2UI';
import { DebugTimeline } from './components/DebugTimeline';
import logoIcon from './assets/icon.png';

// 类型定义
interface UserIntent {
  id: string;
  type: string;
  description: string;
  confidence: number;
  entities?: Array<{
    type: string;
    value: string;
  }>;
  context?: {
    trigger: string;
    reason: string;
  };
}

interface ExecutionPlan {
  id: string;
  title: string;
  description: string;
  steps: Array<{
    order: number;
    description: string;
    actionType: string;
    riskLevel: 'low' | 'medium' | 'high';
  }>;
  pros: string[];
  cons: string[];
  alternatives?: Array<{
    description: string;
    difference: string;
  }>;
  impact: {
    filesAffected: number;
    systemChanges: boolean;
    requiresNetwork: boolean;
    fullyReversible: boolean;
  };
}

interface PlanExecution {
  planId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt?: number;
  currentStep: number;
  results: Array<{
    stepOrder: number;
    status: string;
    output?: string;
    error?: string;
  }>;
}

interface ExecutionHistoryItem {
  id: string;
  planId: string;
  status: string;
  stepResults: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
  plan?: {
    id: string;
    intentId: string;
    title: string;
    description: string;
    steps: string;
    pros: string;
    cons: string;
    status: string;
    createdAt: number;
    completedAt?: number;
  };
}

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
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  syncPort: number;
  autoStartSync: boolean;
  autoUpdate: boolean;
  localOnly: boolean;  // 完全本地模式
  hasOllama: boolean;
  hasGemini: boolean;
  localOnlyRecommendedModel?: string;
  localOnlyAlternatives?: string[];
  onboardingCompleted?: boolean;  // 是否完成初始引导
}

declare global {
  interface Window {
    hawkeye: {
      // 调试 API
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

      // 核心 API
      observe: () => Promise<void>;
      generatePlan: (intentId: string) => Promise<ExecutionPlan>;
      executePlan: (planId?: string) => Promise<PlanExecution>;
      pauseExecution: (planId: string) => Promise<boolean>;
      resumeExecution: (planId: string) => Promise<PlanExecution | null>;
      cancelExecution: (planId: string) => Promise<boolean>;
      intentFeedback: (intentId: string, feedback: 'accept' | 'reject' | 'irrelevant') => Promise<void>;

      // 状态 API
      getIntents: () => Promise<UserIntent[]>;
      getPlan: () => Promise<ExecutionPlan | null>;
      getStatus: () => Promise<HawkeyeStatus>;
      getAvailableProviders: () => Promise<string[]>;
      switchAIProvider: (provider: 'ollama' | 'gemini') => Promise<boolean>;

      // 配置 API
      getConfig: () => Promise<AppConfig>;
      saveConfig: (config: Partial<AppConfig>) => Promise<AppConfig>;

      // AI 对话
      chat: (messages: Array<{ role: string; content: string }>) => Promise<string>;

      // 数据管理
      getStats: () => Promise<any>;
      cleanup: (days: number) => Promise<number>;
      getExecutionHistory: (limit?: number) => Promise<ExecutionHistoryItem[]>;

      // 旧版兼容
      execute: (id: string) => Promise<unknown>;
      getSuggestions: () => Promise<any[]>;
      setApiKey: (key: string) => Promise<void>;

      // 事件监听
      onIntents: (callback: (intents: UserIntent[]) => void) => void;
      onPlan: (callback: (plan: ExecutionPlan) => void) => void;
      onExecutionProgress: (callback: (data: { planId: string; step: any }) => void) => void;
      onExecutionCompleted: (callback: (execution: PlanExecution) => void) => void;
      onHawkeyeReady: (callback: (status: HawkeyeStatus) => void) => void;
      onModuleReady: (callback: (module: string) => void) => void;
      onAIProviderReady: (callback: (type: string) => void) => void;
      onAIProviderError: (callback: (info: { type: string; error: any }) => void) => void;
      onShowSettings: (callback: () => void) => void;
      onLoading: (callback: (loading: boolean) => void) => void;
      onError: (callback: (error: string) => void) => void;
      onSuggestions: (callback: (suggestions: any[]) => void) => void;

      // Ollama 模型管理
      ollamaCheck: () => Promise<{ installed: boolean; running: boolean }>;
      ollamaStart: () => Promise<{ success: boolean; error?: string }>;
      ollamaListModels: () => Promise<{
        success: boolean;
        models: Array<{ name: string; id: string; size: string; modified: string }>;
        error?: string;
      }>;
      ollamaPullModel: (modelName: string) => Promise<{ success: boolean; model: string; error?: string }>;
      onOllamaPullStart: (callback: (model: string) => void) => void;
      onOllamaPullProgress: (callback: (data: {
        model: string;
        output: string;
        progress?: number;
        size?: string;
        isError?: boolean;
      }) => void) => void;
      onOllamaPullComplete: (callback: (data: {
        model: string;
        success: boolean;
        error?: string;
      }) => void) => void;

      // Ollama 安装
      downloadOllama: () => Promise<{ success: boolean; path?: string; type?: string; error?: string }>;
      onOllamaDownloadStart: (callback: (data: { url: string; filename: string }) => void) => void;
      onOllamaDownloadProgress: (callback: (data: {
        progress: number;
        downloaded: number;
        total: number;
        downloadedMB: string;
        totalMB: string;
      }) => void) => void;
      onOllamaDownloadComplete: (callback: (data: { path: string; type: string }) => void) => void;
      onOllamaDownloadError: (callback: (error: string) => void) => void;

      // 应用更新
      checkForUpdates: () => Promise<{ success: boolean; version?: string; error?: string }>;
      getAppVersion: () => Promise<string>;

      // 智能观察
      startSmartObserve: () => Promise<{ success: boolean; watching: boolean }>;
      stopSmartObserve: () => Promise<{ success: boolean; watching: boolean }>;
      getSmartObserveStatus: () => Promise<{
        watching: boolean;
        interval: number;
        threshold: number;
        enabled: boolean;
      }>;
      toggleSmartObserve: () => Promise<{ watching: boolean }>;
      onSmartObserveStatus: (callback: (data: { watching: boolean }) => void) => void;
      onSmartObserveChangeDetected: (callback: () => void) => void;

      // 截屏预览
      getScreenshot: () => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
      getLastContext: () => Promise<{
        success: boolean;
        screenshot?: string;
        ocrText?: string;
        timestamp?: number;
        error?: string;
      }>;
      onScreenshotPreview: (callback: (data: { dataUrl: string; timestamp: number }) => void) => void;
    };
  }
}

// 聊天消息接口
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// 生成唯一 ID
const generateId = () => `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 将意图转换为建议卡片
const intentToSuggestionCard = (intent: UserIntent): A2UICard => ({
  id: `suggestion_${intent.id}`,
  type: 'suggestion',
  title: intent.description,
  description: intent.context?.reason,
  icon: getIntentIcon(intent.type),
  confidence: intent.confidence,
  timestamp: Date.now(),
  metadata: {
    intentId: intent.id,
    intentType: intent.type,
    impact: getIntentImpact(intent.type),
  },
  actions: [
    {
      id: 'generate_plan',
      label: '生成计划',
      type: 'primary',
      icon: '📋',
      shortcut: '⏎',
    },
    {
      id: 'dismiss',
      label: '忽略',
      type: 'dismiss',
    },
  ],
});

// 将计划转换为预览卡片
const planToPreviewCard = (plan: ExecutionPlan): A2UICard => ({
  id: `preview_${plan.id}`,
  type: 'preview',
  title: plan.title,
  description: plan.description,
  icon: 'preview',
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
    {
      id: 'execute',
      label: '执行计划',
      type: 'primary',
      icon: '▶️',
      shortcut: '⏎',
    },
    {
      id: 'reject',
      label: '放弃',
      type: 'secondary',
    },
  ],
});

// 创建执行进度卡片
const createProgressCard = (plan: ExecutionPlan, execution: PlanExecution): A2UICard => ({
  id: `progress_${execution.planId}`,
  type: 'progress',
  title: `执行中: ${plan.title}`,
  description: plan.steps[execution.currentStep - 1]?.description || '准备中...',
  icon: 'progress',
  timestamp: Date.now(),
  metadata: {
    planId: execution.planId,
    progress: (execution.currentStep / plan.steps.length) * 100,
    currentStep: execution.currentStep,
    totalSteps: plan.steps.length,
  },
  actions: [
    {
      id: 'pause',
      label: '暂停',
      type: 'secondary',
      icon: '⏸️',
    },
    {
      id: 'cancel',
      label: '取消',
      type: 'danger',
      icon: '⏹️',
    },
  ],
});

// 创建执行结果卡片
const createResultCard = (plan: ExecutionPlan, execution: PlanExecution): A2UICard => {
  const success = execution.status === 'completed';
  return {
    id: `result_${execution.planId}`,
    type: 'result',
    title: success ? '执行完成' : '执行失败',
    description: plan.title,
    icon: success ? 'success' : 'error',
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
      {
        id: 'done',
        label: '完成',
        type: 'primary',
      },
      ...(success
        ? []
        : [
            {
              id: 'retry',
              label: '重试',
              type: 'secondary' as const,
            },
          ]),
    ],
  };
};

// 获取意图图标
function getIntentIcon(type: string): string {
  const icons: Record<string, string> = {
    file_organize: '📁',
    code_assist: '💻',
    search: '🔍',
    communication: '💬',
    automation: '⚡',
    data_process: '📊',
  };
  return icons[type] || '💡';
}

// 获取意图影响级别
function getIntentImpact(type: string): 'low' | 'medium' | 'high' {
  const highImpact = ['automation', 'file_organize'];
  const mediumImpact = ['code_assist', 'data_process'];
  if (highImpact.includes(type)) return 'high';
  if (mediumImpact.includes(type)) return 'medium';
  return 'low';
}

export default function App() {
  const { t, i18n } = useTranslation();

  // A2UI 卡片状态
  const [cards, setCards] = useState<A2UICard[]>([]);

  // 应用状态
  const [status, setStatus] = useState<HawkeyeStatus | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tempConfig, setTempConfig] = useState<Partial<AppConfig>>({});

  // 当前执行的计划
  const [currentPlan, setCurrentPlan] = useState<ExecutionPlan | null>(null);
  const [currentExecution, setCurrentExecution] = useState<PlanExecution | null>(null);

  // Ollama 模型管理状态
  const [ollamaStatus, setOllamaStatus] = useState<{ installed: boolean; running: boolean } | null>(null);
  const [installedModels, setInstalledModels] = useState<Array<{ name: string; id: string; size: string; modified: string }>>([]);
  const [modelPullProgress, setModelPullProgress] = useState<{
    model: string;
    progress: number;
    output: string;
    isDownloading: boolean;
  } | null>(null);

  // Onboarding 状态
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [selectedOnboardingModel, setSelectedOnboardingModel] = useState<string>('');
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingMode, setOnboardingMode] = useState<'choose' | 'local' | 'cloud'>('choose');

  // 智能观察状态
  const [smartObserveWatching, setSmartObserveWatching] = useState(false);

  // 聊天对话状态
  const [showChatDialog, setShowChatDialog] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // 截屏预览状态
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [showScreenshotPreview, setShowScreenshotPreview] = useState(false);
  const [ocrTextPreview, setOcrTextPreview] = useState<string | null>(null);
  const [screenshotZoomed, setScreenshotZoomed] = useState(false);

  // 模型选择器弹窗状态
  const [showModelSelector, setShowModelSelector] = useState(false);

  // 模型测试状态
  const [modelTesting, setModelTesting] = useState(false);
  const [modelTestResult, setModelTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // 调试时间线状态
  const [showDebugTimeline, setShowDebugTimeline] = useState(false);

  // Ollama 下载安装状态
  const [ollamaDownloadProgress, setOllamaDownloadProgress] = useState<{
    isDownloading: boolean;
    progress: number;
    downloadedMB: string;
    totalMB: string;
    status: 'downloading' | 'installing' | 'done' | 'error';
    error?: string;
  } | null>(null);

  // 添加卡片
  const addCard = useCallback((card: A2UICard) => {
    setCards((prev) => [...prev, card]);
  }, []);

  // 移除卡片
  const removeCard = useCallback((cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  }, []);

  // 更新卡片
  const updateCard = useCallback((cardId: string, updates: Partial<A2UICard>) => {
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, ...updates } : c))
    );
  }, []);

  // 添加错误卡片
  const addErrorCard = useCallback((message: string) => {
    const card: A2UICard = {
      id: generateId(),
      type: 'error',
      title: '发生错误',
      description: message,
      icon: 'error',
      timestamp: Date.now(),
      actions: [
        {
          id: 'dismiss',
          label: '关闭',
          type: 'dismiss',
        },
      ],
    };
    addCard(card);
  }, [addCard]);

  // 检查 Ollama 状态并获取模型列表
  const refreshOllamaStatus = useCallback(async () => {
    try {
      const status = await window.hawkeye.ollamaCheck();
      setOllamaStatus(status);

      if (status.running) {
        const result = await window.hawkeye.ollamaListModels();
        if (result.success) {
          setInstalledModels(result.models);
        }
      }
    } catch (err) {
      console.error('Failed to check Ollama status:', err);
    }
  }, []);

  // 下载模型
  const pullModel = useCallback(async (modelName: string) => {
    setModelPullProgress({
      model: modelName,
      progress: 0,
      output: '准备下载...',
      isDownloading: true,
    });
    await window.hawkeye.ollamaPullModel(modelName);
  }, []);

  // 初始化
  useEffect(() => {
    initializeApp();
    setupEventListeners();
    setupOllamaListeners();
  }, []);

  const initializeApp = async () => {
    try {
      const [configData, statusData] = await Promise.all([
        window.hawkeye.getConfig(),
        window.hawkeye.getStatus(),
      ]);

      setConfig(configData);
      setTempConfig(configData);
      setStatus(statusData);

      // 检查是否需要 onboarding - 首次启动或未完成初始设置
      const needsOnboarding = !configData.onboardingCompleted;

      if (needsOnboarding) {
        // 首次启动，显示选择界面：本地模型 vs 云端 API
        setOnboardingMode('choose');
        setShowOnboarding(true);
        setOnboardingLoading(false);
      } else if (configData.aiProvider === 'ollama' || configData.localOnly) {
        // 已配置本地模式，检查是否有可用模型
        await checkAndShowOnboarding(configData);
      }
    } catch (err) {
      addErrorCard((err as Error).message);
    }
  };

  // 检查并显示 onboarding
  const checkAndShowOnboarding = async (configData: AppConfig) => {
    setOnboardingLoading(true);
    try {
      // 检查 Ollama 状态
      const status = await window.hawkeye.ollamaCheck();
      setOllamaStatus(status);

      if (!status.installed) {
        // Ollama 未安装
        setOnboardingError('ollama_not_installed');
        setShowOnboarding(true);
        setOnboardingLoading(false);
        return;
      }

      if (!status.running) {
        // Ollama 未运行
        setOnboardingError('ollama_not_running');
        setShowOnboarding(true);
        setOnboardingLoading(false);
        return;
      }

      // 获取已安装的模型
      const modelsResult = await window.hawkeye.ollamaListModels();
      if (modelsResult.success) {
        setInstalledModels(modelsResult.models);

        // 如果有模型，检查当前选择的模型是否可用
        if (modelsResult.models.length > 0) {
          const currentModel = configData.ollamaModel || '';
          const modelExists = modelsResult.models.some(m => m.name === currentModel);

          if (!modelExists && !currentModel) {
            // 没有选择模型，显示 onboarding
            setShowOnboarding(true);
          }
          // 如果有模型且当前模型存在，不需要 onboarding
        } else {
          // 没有任何模型，显示 onboarding
          setShowOnboarding(true);
        }
      } else {
        // 获取模型列表失败
        setOnboardingError('failed_to_list_models');
        setShowOnboarding(true);
      }
    } catch (err) {
      console.error('Failed to check onboarding:', err);
      setOnboardingError('check_failed');
      setShowOnboarding(true);
    }
    setOnboardingLoading(false);
  };

  const setupEventListeners = () => {
    // 监听意图事件 - 转换为建议卡片
    window.hawkeye.onIntents((intents) => {
      // 清除旧的建议卡片
      setCards((prev) => prev.filter((c) => c.type !== 'suggestion'));

      // 添加新的建议卡片
      const suggestionCards = intents.map(intentToSuggestionCard);
      setCards((prev) => [...prev, ...suggestionCards]);
    });

    // 监听计划事件 - 转换为预览卡片
    window.hawkeye.onPlan((plan) => {
      setCurrentPlan(plan);
      // 清除建议卡片，添加预览卡片
      setCards((prev) => {
        const filtered = prev.filter((c) => c.type !== 'suggestion');
        return [...filtered, planToPreviewCard(plan)];
      });
    });

    // 监听执行进度
    window.hawkeye.onExecutionProgress((data) => {
      if (currentPlan && currentExecution) {
        const updatedExecution = { ...currentExecution, currentStep: data.step.order };
        setCurrentExecution(updatedExecution);

        // 更新进度卡片
        const progressCard = createProgressCard(currentPlan, updatedExecution);
        setCards((prev) => {
          const filtered = prev.filter((c) => c.type !== 'progress');
          return [...filtered, progressCard];
        });
      }
    });

    // 监听执行完成
    window.hawkeye.onExecutionCompleted((execution) => {
      setCurrentExecution(execution);
      if (currentPlan) {
        // 替换进度卡片为结果卡片
        const resultCard = createResultCard(currentPlan, execution);
        setCards((prev) => {
          const filtered = prev.filter((c) => c.type !== 'progress');
          return [...filtered, resultCard];
        });
      }
    });

    // 监听状态更新
    window.hawkeye.onHawkeyeReady((newStatus) => {
      setStatus(newStatus);
    });

    // 监听显示设置
    window.hawkeye.onShowSettings(() => {
      setShowSettings(true);
    });

    // 监听错误
    window.hawkeye.onError((error) => {
      addErrorCard(error);
    });

    // 监听智能观察状态
    window.hawkeye.onSmartObserveStatus((data) => {
      setSmartObserveWatching(data.watching);
    });

    // 监听屏幕变化检测（可以添加提示动画）
    window.hawkeye.onSmartObserveChangeDetected(() => {
      // 可以在这里添加闪烁动画等视觉反馈
      console.log('Screen change detected, analyzing...');
    });

    // 监听截屏预览
    window.hawkeye.onScreenshotPreview((data) => {
      setScreenshotPreview(data.dataUrl);
    });

    // 获取初始智能观察状态
    window.hawkeye.getSmartObserveStatus().then((status) => {
      setSmartObserveWatching(status.watching);
    });
  };

  // 设置 Ollama 事件监听
  const setupOllamaListeners = () => {
    // 监听模型下载开始
    window.hawkeye.onOllamaPullStart((model) => {
      console.log(`[UI] 开始下载模型: ${model}`);
      setModelPullProgress({
        model,
        progress: 0,
        output: '准备下载...',
        isDownloading: true,
      });
    });

    // 监听模型下载进度
    window.hawkeye.onOllamaPullProgress((data) => {
      console.log(`[UI] 下载进度: ${data.output}`);
      setModelPullProgress((prev) => ({
        model: data.model,
        progress: data.progress ?? prev?.progress ?? 0,
        output: data.output,
        isDownloading: true,
      }));
    });

    // 监听模型下载完成
    window.hawkeye.onOllamaPullComplete((data) => {
      console.log(`[UI] 下载完成: ${data.model}, 成功: ${data.success}`);
      setModelPullProgress(null);
      if (data.success) {
        // 刷新模型列表
        refreshOllamaStatus();
        // 如果在 onboarding 中，自动选择下载的模型
        setSelectedOnboardingModel(data.model);
      }
    });

    // 监听 Ollama 安装下载开始
    window.hawkeye.onOllamaDownloadStart((data) => {
      console.log(`[UI] 开始下载 Ollama: ${data.filename}`);
      setOllamaDownloadProgress({
        isDownloading: true,
        progress: 0,
        downloadedMB: '0',
        totalMB: '?',
        status: 'downloading',
      });
    });

    // 监听 Ollama 下载进度
    window.hawkeye.onOllamaDownloadProgress((data) => {
      console.log(`[UI] Ollama 下载进度: ${data.progress}%`);
      setOllamaDownloadProgress({
        isDownloading: true,
        progress: data.progress,
        downloadedMB: data.downloadedMB,
        totalMB: data.totalMB,
        status: 'downloading',
      });
    });

    // 监听 Ollama 下载完成
    window.hawkeye.onOllamaDownloadComplete((data) => {
      console.log(`[UI] Ollama 下载完成: ${data.path}`);
      setOllamaDownloadProgress({
        isDownloading: false,
        progress: 100,
        downloadedMB: '',
        totalMB: '',
        status: 'installing',
      });

      // 等待安装完成，然后重新检查状态
      setTimeout(async () => {
        setOllamaDownloadProgress({
          isDownloading: false,
          progress: 100,
          downloadedMB: '',
          totalMB: '',
          status: 'done',
        });
        // 重新检查 Ollama 状态
        const status = await window.hawkeye.ollamaCheck();
        setOllamaStatus(status);
        if (status.installed) {
          setOnboardingError(status.running ? null : 'ollama_not_running');
        }
      }, 3000);
    });

    // 监听 Ollama 下载错误
    window.hawkeye.onOllamaDownloadError((error) => {
      console.error(`[UI] Ollama 下载错误: ${error}`);
      setOllamaDownloadProgress({
        isDownloading: false,
        progress: 0,
        downloadedMB: '',
        totalMB: '',
        status: 'error',
        error: error,
      });
    });
  };

  // 处理卡片操作
  const handleCardAction = async (cardId: string, actionId: string, data?: unknown) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    try {
      switch (actionId) {
        case 'generate_plan': {
          const intentId = card.metadata?.intentId as string;
          if (intentId) {
            const plan = await window.hawkeye.generatePlan(intentId);
            setCurrentPlan(plan);
          }
          break;
        }

        case 'execute': {
          const planId = card.metadata?.planId as string;
          if (planId && currentPlan) {
            // 替换预览卡片为进度卡片
            removeCard(cardId);
            const execution = await window.hawkeye.executePlan(planId);
            setCurrentExecution(execution);
            const progressCard = createProgressCard(currentPlan, execution);
            addCard(progressCard);
          }
          break;
        }

        case 'reject': {
          removeCard(cardId);
          setCurrentPlan(null);
          break;
        }

        case 'pause': {
          const planId = card.metadata?.planId as string;
          if (planId) {
            await window.hawkeye.pauseExecution(planId);
          }
          break;
        }

        case 'cancel': {
          const planId = card.metadata?.planId as string;
          if (planId) {
            await window.hawkeye.cancelExecution(planId);
            removeCard(cardId);
            setCurrentPlan(null);
            setCurrentExecution(null);
          }
          break;
        }

        case 'done':
        case 'dismiss': {
          removeCard(cardId);
          if (card.type === 'result') {
            setCurrentPlan(null);
            setCurrentExecution(null);
          }
          break;
        }

        case 'open_settings': {
          removeCard(cardId);
          setShowSettings(true);
          break;
        }

        case 'retry': {
          if (currentPlan) {
            removeCard(cardId);
            const execution = await window.hawkeye.executePlan(currentPlan.id);
            setCurrentExecution(execution);
            const progressCard = createProgressCard(currentPlan, execution);
            addCard(progressCard);
          }
          break;
        }

        default:
          console.log('Unknown action:', actionId);
      }
    } catch (err) {
      addErrorCard((err as Error).message);
    }
  };

  // 处理卡片忽略
  const handleCardDismiss = (cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (card?.type === 'suggestion' && card.metadata?.intentId) {
      window.hawkeye.intentFeedback(card.metadata.intentId as string, 'irrelevant');
    }
    removeCard(cardId);
  };

  // 处理快捷操作
  const handleQuickAction = async (actionId: string) => {
    switch (actionId) {
      case 'refresh':
        await window.hawkeye.observe();
        break;

      case 'clipboard':
        // 分析剪贴板
        await window.hawkeye.observe();
        break;

      case 'history':
        // 获取并显示历史记录
        try {
          const historyItems = await window.hawkeye.getExecutionHistory(10);
          if (historyItems.length === 0) {
            const emptyCard: A2UICard = {
              id: generateId(),
              type: 'info',
              title: t('app.historyEmpty', '暂无执行记录'),
              description: t('app.historyEmptyDesc', '执行任务后会在这里显示历史记录'),
              icon: 'history',
              timestamp: Date.now(),
              actions: [{ id: 'dismiss', label: t('app.done'), type: 'dismiss' }],
            };
            addCard(emptyCard);
          } else {
            // 将历史记录转换为卡片
            const historyCards: A2UICard[] = historyItems.map((item) => {
              const statusIcon = item.status === 'completed' ? '✅' :
                                item.status === 'failed' ? '❌' :
                                item.status === 'cancelled' ? '⏹️' : '⏳';
              const statusText = item.status === 'completed' ? t('app.executionCompleted') :
                                item.status === 'failed' ? t('app.executionFailed') :
                                item.status === 'cancelled' ? t('app.cancel') : item.status;

              return {
                id: `history_${item.id}`,
                type: 'info' as const,
                title: item.plan?.title || t('app.unknownTask', '未知任务'),
                description: `${statusIcon} ${statusText}`,
                icon: 'history',
                timestamp: item.startedAt,
                metadata: {
                  executionId: item.id,
                  planId: item.planId,
                  status: item.status,
                  duration: item.completedAt ? item.completedAt - item.startedAt : undefined,
                },
                actions: [{ id: 'dismiss', label: t('app.done'), type: 'dismiss' }],
              };
            });

            // 添加历史标题卡片
            const headerCard: A2UICard = {
              id: generateId(),
              type: 'info',
              title: t('app.historyTitle', '执行历史'),
              description: t('app.historyCount', { count: historyItems.length, defaultValue: `共 ${historyItems.length} 条记录` }),
              icon: 'history',
              timestamp: Date.now(),
              actions: [{ id: 'dismiss', label: t('app.done'), type: 'dismiss' }],
            };
            addCard(headerCard);
            historyCards.forEach(card => addCard(card));
          }
        } catch (err) {
          addErrorCard((err as Error).message);
        }
        break;

      case 'settings':
        setShowSettings(true);
        break;
    }
  };

  // 保存配置
  const handleSaveConfig = async () => {
    try {
      const newConfig = await window.hawkeye.saveConfig(tempConfig);
      setConfig(newConfig);
      setShowSettings(false);
    } catch (err) {
      addErrorCard((err as Error).message);
    }
  };

  // 发送聊天消息
  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: chatInput.trim(),
      timestamp: Date.now(),
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      // 构建消息历史
      const messages = [...chatMessages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await window.hawkeye.chat(messages);

      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `错误: ${(err as Error).message}`,
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  // 切换截屏预览
  const toggleScreenshotPreview = async () => {
    if (!showScreenshotPreview) {
      // 获取最后的感知上下文（截图 + OCR）
      const result = await window.hawkeye.getLastContext();
      if (result.success) {
        if (result.screenshot) {
          // 如果是 base64 数据，转为 dataURL
          const dataUrl = result.screenshot.startsWith('data:')
            ? result.screenshot
            : `data:image/png;base64,${result.screenshot}`;
          setScreenshotPreview(dataUrl);
        }
        if (result.ocrText) {
          setOcrTextPreview(result.ocrText);
        }
      } else {
        // 回退到简单截图
        const screenshotResult = await window.hawkeye.getScreenshot();
        if (screenshotResult.success && screenshotResult.dataUrl) {
          setScreenshotPreview(screenshotResult.dataUrl);
        }
        setOcrTextPreview(null);
      }
    }
    setShowScreenshotPreview(!showScreenshotPreview);
    setScreenshotZoomed(false);
  };

  // 语言切换
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    i18n.changeLanguage(e.target.value);
  };

  // 准备快捷操作
  const quickActions: QuickAction[] = defaultQuickActions.map((action) => ({
    ...action,
    disabled: !status?.aiReady && action.id !== 'settings',
  }));

  // 处理 onboarding 完成
  const handleOnboardingComplete = async (modelName?: string) => {
    try {
      // 保存配置，标记 onboarding 已完成
      const configUpdate = {
        ...tempConfig,
        onboardingCompleted: true,
        ...(modelName ? { aiProvider: 'ollama' as const, ollamaModel: modelName } : {}),
      };
      const newConfig = await window.hawkeye.saveConfig(configUpdate);
      setConfig(newConfig);
      setTempConfig(newConfig);
    } catch (err) {
      addErrorCard((err as Error).message);
    }
    setShowOnboarding(false);
    setOnboardingError(null);
  };

  // 处理 onboarding 跳过
  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
    // 显示警告卡片
    const warningCard: A2UICard = {
      id: generateId(),
      type: 'warning',
      title: t('onboarding.noModelAvailable', '没有可用的模型'),
      description: t('onboarding.noModelDesc', '请先下载一个模型才能使用 Hawkeye 的全部功能'),
      icon: 'warning',
      timestamp: Date.now(),
      actions: [
        {
          id: 'open_settings',
          label: t('settings.title'),
          type: 'primary',
        },
        {
          id: 'dismiss',
          label: t('app.done'),
          type: 'dismiss',
        },
      ],
    };
    addCard(warningCard);
  };

  // 处理 onboarding 中启动 Ollama
  const handleStartOllama = async () => {
    setOnboardingLoading(true);
    try {
      const result = await window.hawkeye.ollamaStart();
      if (result.success) {
        // 等待一下让 Ollama 启动
        await new Promise(resolve => setTimeout(resolve, 2000));
        // 重新检查
        if (config) {
          await checkAndShowOnboarding(config);
        }
      } else {
        setOnboardingError('start_ollama_failed');
      }
    } catch (err) {
      setOnboardingError('start_ollama_failed');
    }
    setOnboardingLoading(false);
  };

  // 处理 onboarding 中下载模型
  const handleOnboardingDownload = async (modelName: string) => {
    setSelectedOnboardingModel(modelName);
    await pullModel(modelName);
  };

  // 测试模型连接
  const testModelConnection = async (): Promise<boolean> => {
    setModelTesting(true);
    setModelTestResult(null);

    try {
      // 先保存配置
      await window.hawkeye.saveConfig(tempConfig);

      // 尝试简单对话来测试模型
      const response = await window.hawkeye.chat([
        { role: 'user', content: 'Say "OK" if you can read this.' }
      ]);

      if (response && response.length > 0) {
        setModelTestResult({ success: true });
        return true;
      } else {
        setModelTestResult({ success: false, error: 'Empty response from model' });
        return false;
      }
    } catch (err) {
      const errorMsg = (err as Error).message;
      setModelTestResult({ success: false, error: errorMsg });
      return false;
    } finally {
      setModelTesting(false);
    }
  };

  // 处理选择本地模式
  const handleChooseLocal = async () => {
    setOnboardingMode('local');
    setOnboardingLoading(true);
    // 检查 Ollama 状态
    try {
      const status = await window.hawkeye.ollamaCheck();
      setOllamaStatus(status);

      if (!status.installed) {
        setOnboardingError('ollama_not_installed');
      } else if (!status.running) {
        setOnboardingError('ollama_not_running');
      } else {
        // 获取已安装的模型
        const modelsResult = await window.hawkeye.ollamaListModels();
        if (modelsResult.success) {
          setInstalledModels(modelsResult.models);
        }
        setOnboardingError(null);
      }
    } catch (err) {
      setOnboardingError('ollama_not_installed');
    }
    setOnboardingLoading(false);
  };

  // 处理选择云端模式
  const handleChooseCloud = () => {
    setOnboardingMode('cloud');
  };

  // Onboarding 页面
  if (showOnboarding) {
    const recommendedModels = [
      { name: 'qwen3-vl:2b', size: '~1.9GB', recommended: true, desc: t('settings.bestBalance') },
      { name: 'qwen2.5vl:3b', size: '~3.2GB', recommended: false, desc: '高质量' },
      { name: 'llava:7b', size: '~4.1GB', recommended: false, desc: '通用视觉' },
    ];

    return (
      <div className="container onboarding">
        <div className="onboarding-content">
          <div className="onboarding-header">
            <img src={logoIcon} alt="Hawkeye" className="onboarding-icon" />
            <h1>{t('onboarding.title', '欢迎使用 Hawkeye')}</h1>
            <p>{onboardingMode === 'choose'
              ? t('onboarding.chooseMode', '请选择 AI 运行方式')
              : t('onboarding.subtitle', '请选择一个 AI 模型来开始')}</p>
          </div>

          {/* 首次启动 - 选择模式 */}
          {onboardingMode === 'choose' && (
            <div className="onboarding-mode-choice">
              <div className="mode-card" onClick={handleChooseLocal}>
                <div className="mode-icon">💻</div>
                <div className="mode-content">
                  <h3>{t('onboarding.localMode', '本地模式')}</h3>
                  <p>{t('onboarding.localModeDesc', '下载 AI 模型到本地运行，完全离线，隐私安全')}</p>
                  <ul className="mode-features">
                    <li>✓ {t('onboarding.localFeature1', '完全离线运行')}</li>
                    <li>✓ {t('onboarding.localFeature2', '数据不离开本机')}</li>
                    <li>✓ {t('onboarding.localFeature3', '需要下载模型 (~1-5GB)')}</li>
                  </ul>
                </div>
                <span className="mode-badge recommended">{t('onboarding.recommended', '推荐')}</span>
              </div>

              <div className="mode-card" onClick={handleChooseCloud}>
                <div className="mode-icon">☁️</div>
                <div className="mode-content">
                  <h3>{t('onboarding.cloudMode', '云端模式')}</h3>
                  <p>{t('onboarding.cloudModeDesc', '使用云端 API，无需下载，即开即用')}</p>
                  <ul className="mode-features">
                    <li>✓ {t('onboarding.cloudFeature1', '无需下载模型')}</li>
                    <li>✓ {t('onboarding.cloudFeature2', '更强大的模型能力')}</li>
                    <li>✓ {t('onboarding.cloudFeature3', '需要 API 密钥')}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 云端模式配置 */}
          {onboardingMode === 'cloud' && (
            <div className="onboarding-cloud-config">
              <div className="cloud-provider-options">
                <h3>{t('onboarding.selectProvider', '选择 AI 服务商')}</h3>
                <div className="provider-grid">
                  <div
                    className={`provider-card ${tempConfig.aiProvider === 'openai' ? 'selected' : ''}`}
                    onClick={() => setTempConfig({ ...tempConfig, aiProvider: 'openai' })}
                  >
                    <span className="provider-name">OpenAI Compatible</span>
                    <span className="provider-desc">{t('onboarding.openaiDesc', '支持 OpenAI、Claude 等')}</span>
                  </div>
                  <div
                    className={`provider-card ${tempConfig.aiProvider === 'gemini' ? 'selected' : ''}`}
                    onClick={() => setTempConfig({ ...tempConfig, aiProvider: 'gemini' })}
                  >
                    <span className="provider-name">Google Gemini</span>
                    <span className="provider-desc">{t('onboarding.geminiDesc', '免费额度，功能强大')}</span>
                  </div>
                </div>

                {tempConfig.aiProvider === 'openai' && (
                  <div className="api-config">
                    <div className="form-group">
                      <label>{t('settings.apiKey.label', 'API 密钥')}</label>
                      <input
                        type="password"
                        value={tempConfig.openaiApiKey || ''}
                        onChange={(e) => setTempConfig({ ...tempConfig, openaiApiKey: e.target.value })}
                        placeholder={t('settings.apiKey.placeholder', 'sk-...')}
                      />
                    </div>
                    <div className="form-group">
                      <label>Base URL ({t('settings.optional', '可选')})</label>
                      <input
                        type="text"
                        value={tempConfig.openaiBaseUrl || ''}
                        onChange={(e) => setTempConfig({ ...tempConfig, openaiBaseUrl: e.target.value })}
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>
                  </div>
                )}

                {tempConfig.aiProvider === 'gemini' && (
                  <div className="api-config">
                    <div className="form-group">
                      <label>{t('settings.geminiApiKey', 'Gemini API 密钥')}</label>
                      <input
                        type="password"
                        value={tempConfig.geminiApiKey || ''}
                        onChange={(e) => setTempConfig({ ...tempConfig, geminiApiKey: e.target.value })}
                        placeholder="AIza..."
                      />
                      <small>
                        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                          {t('settings.getApiKey', '获取 API 密钥')}
                        </a>
                      </small>
                    </div>
                  </div>
                )}
              </div>

              <div className="onboarding-footer">
                {/* 测试结果显示 */}
                {modelTestResult && (
                  <div className={`model-test-result ${modelTestResult.success ? 'success' : 'error'}`}>
                    {modelTestResult.success ? (
                      <span>✅ {t('onboarding.testSuccess', '连接成功！')}</span>
                    ) : (
                      <span>❌ {t('onboarding.testFailed', '连接失败')}: {modelTestResult.error}</span>
                    )}
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  disabled={
                    modelTesting ||
                    (tempConfig.aiProvider === 'openai' && !tempConfig.openaiApiKey) ||
                    (tempConfig.aiProvider === 'gemini' && !tempConfig.geminiApiKey)
                  }
                  onClick={async () => {
                    // 先测试连接
                    const success = await testModelConnection();
                    if (success) {
                      // 测试成功，保存配置并进入主界面
                      try {
                        const newConfig = await window.hawkeye.saveConfig({
                          ...tempConfig,
                          onboardingCompleted: true,
                        });
                        setConfig(newConfig);
                        setShowOnboarding(false);
                      } catch (err) {
                        addErrorCard((err as Error).message);
                      }
                    }
                  }}
                >
                  {modelTesting ? (
                    <>{t('onboarding.testing', '测试连接中...')}</>
                  ) : modelTestResult?.success ? (
                    <>{t('onboarding.continue', '继续')} →</>
                  ) : (
                    <>{t('onboarding.testAndContinue', '测试连接并继续')} →</>
                  )}
                </button>
                <button className="btn btn-text" onClick={() => setOnboardingMode('choose')}>
                  ← {t('app.back', '返回')}
                </button>
              </div>
            </div>
          )}

          {/* 本地模式 - 加载中 */}
          {onboardingMode === 'local' && onboardingLoading && (
            <div className="onboarding-loading">
              <div className="spinner"></div>
              <p>{t('onboarding.checkingModels', '正在检查可用模型...')}</p>
            </div>
          )}

          {/* 本地模式 - Ollama 未安装 */}
          {onboardingMode === 'local' && !onboardingLoading && onboardingError === 'ollama_not_installed' && (
            <div className="onboarding-error">
              <div className="error-icon">📦</div>
              <h3>{t('onboarding.ollamaNotInstalled', 'Ollama 未安装')}</h3>
              <p>{t('onboarding.ollamaNotInstalledDesc', '使用本地模式需要先安装 Ollama')}</p>

              {/* 下载进度显示 */}
              {ollamaDownloadProgress && (
                <div className="ollama-download-progress">
                  {ollamaDownloadProgress.status === 'downloading' && (
                    <>
                      <div className="progress-header">
                        <span>📥 {t('onboarding.downloadingOllama', '正在下载 Ollama...')}</span>
                        <span>{ollamaDownloadProgress.progress}%</span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${ollamaDownloadProgress.progress}%` }}
                        />
                      </div>
                      <div className="progress-info">
                        {ollamaDownloadProgress.downloadedMB} MB / {ollamaDownloadProgress.totalMB} MB
                      </div>
                    </>
                  )}
                  {ollamaDownloadProgress.status === 'installing' && (
                    <div className="installing-status">
                      <div className="spinner"></div>
                      <span>🔧 {t('onboarding.installingOllama', '正在安装 Ollama...')}</span>
                    </div>
                  )}
                  {ollamaDownloadProgress.status === 'done' && (
                    <div className="install-done">
                      <span>✅ {t('onboarding.ollamaInstalled', '安装完成！')}</span>
                      <button
                        className="btn btn-primary"
                        onClick={async () => {
                          setOllamaDownloadProgress(null);
                          await handleStartOllama();
                        }}
                      >
                        🚀 {t('onboarding.startOllama', '启动 Ollama')}
                      </button>
                    </div>
                  )}
                  {ollamaDownloadProgress.status === 'error' && (
                    <div className="install-error">
                      <span>❌ {t('onboarding.downloadFailed', '下载失败')}: {ollamaDownloadProgress.error}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 操作按钮 - 未下载时显示 */}
              {!ollamaDownloadProgress && (
                <div className="onboarding-actions">
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      await window.hawkeye.downloadOllama();
                    }}
                  >
                    📥 {t('onboarding.installOllama', '一键安装 Ollama')}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setOnboardingMode('cloud')}>
                    ☁️ {t('onboarding.useCloud', '使用云端模式')}
                  </button>
                  <button className="btn btn-text" onClick={() => setOnboardingMode('choose')}>
                    ← {t('app.back', '返回')}
                  </button>
                </div>
              )}

              {/* 下载中/安装中时显示取消按钮 */}
              {ollamaDownloadProgress && ollamaDownloadProgress.status !== 'done' && ollamaDownloadProgress.status !== 'error' && (
                <div className="onboarding-actions">
                  <button className="btn btn-text" onClick={() => setOllamaDownloadProgress(null)}>
                    {t('app.cancel', '取消')}
                  </button>
                </div>
              )}

              {/* 错误时显示重试按钮 */}
              {ollamaDownloadProgress && ollamaDownloadProgress.status === 'error' && (
                <div className="onboarding-actions">
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      setOllamaDownloadProgress(null);
                      await window.hawkeye.downloadOllama();
                    }}
                  >
                    🔄 {t('onboarding.retry', '重试')}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setOnboardingMode('cloud')}>
                    ☁️ {t('onboarding.useCloud', '使用云端模式')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 本地模式 - Ollama 未运行 */}
          {onboardingMode === 'local' && !onboardingLoading && onboardingError === 'ollama_not_running' && (
            <div className="onboarding-error">
              <div className="error-icon">⚠️</div>
              <h3>{t('onboarding.ollamaNotRunning', 'Ollama 未运行')}</h3>
              <p>{t('onboarding.ollamaNotRunningDesc', '请先启动 Ollama 服务，或使用云端模式')}</p>
              <div className="onboarding-actions">
                <button className="btn btn-primary" onClick={handleStartOllama}>
                  🚀 {t('onboarding.startOllama', '启动 Ollama')}
                </button>
                <button className="btn btn-secondary" onClick={() => setOnboardingMode('cloud')}>
                  ☁️ {t('onboarding.useCloud', '使用云端模式')}
                </button>
                <button className="btn btn-text" onClick={() => setOnboardingMode('choose')}>
                  ← {t('app.back', '返回')}
                </button>
              </div>
            </div>
          )}

          {/* 本地模式 - 选择/下载模型 */}
          {onboardingMode === 'local' && !onboardingLoading && !onboardingError && (
            <>
              {/* 已安装的模型 */}
              {installedModels.length > 0 && (
                <div className="onboarding-section">
                  <h3>{t('onboarding.installedModels', '已安装模型')}</h3>
                  <div className="model-grid">
                    {installedModels.map((model) => (
                      <div
                        key={model.name}
                        className={`model-card ${selectedOnboardingModel === model.name ? 'selected' : ''}`}
                        onClick={() => setSelectedOnboardingModel(model.name)}
                      >
                        <div className="model-card-header">
                          <span className="model-name">{model.name}</span>
                          {selectedOnboardingModel === model.name && <span className="check-icon">✓</span>}
                        </div>
                        <div className="model-card-info">
                          <span className="model-size">{model.size}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 推荐模型下载 */}
              <div className="onboarding-section">
                <h3>
                  {installedModels.length > 0
                    ? t('onboarding.selectOrDownload', '选择已安装的模型或下载新模型')
                    : t('onboarding.downloadFirst', '请先下载模型')}
                </h3>
                <div className="model-grid">
                  {recommendedModels.map((model) => {
                    const isInstalled = installedModels.some(m => m.name === model.name);
                    const isDownloading = modelPullProgress?.isDownloading && modelPullProgress.model === model.name;

                    return (
                      <div
                        key={model.name}
                        className={`model-card downloadable ${isInstalled ? 'installed' : ''} ${isDownloading ? 'downloading' : ''}`}
                      >
                        <div className="model-card-header">
                          <span className="model-name">{model.name}</span>
                          {model.recommended && (
                            <span className="recommended-badge">{t('onboarding.recommended', '推荐')}</span>
                          )}
                        </div>
                        <div className="model-card-info">
                          <span className="model-size">{model.size}</span>
                          <span className="model-desc">{model.desc}</span>
                        </div>
                        {isDownloading ? (
                          <div className="model-download-progress-inline">
                            <div className="progress-bar">
                              <div
                                className="progress-fill"
                                style={{ width: `${modelPullProgress?.progress || 0}%` }}
                              />
                            </div>
                            <span>{modelPullProgress?.progress || 0}%</span>
                          </div>
                        ) : isInstalled ? (
                          <button
                            className="btn btn-small btn-selected"
                            onClick={() => setSelectedOnboardingModel(model.name)}
                          >
                            ✓ {selectedOnboardingModel === model.name ? '已选择' : '选择'}
                          </button>
                        ) : (
                          <button
                            className="btn btn-small btn-download"
                            onClick={() => handleOnboardingDownload(model.name)}
                            disabled={modelPullProgress?.isDownloading}
                          >
                            ⬇️ {t('settings.download', '下载')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 底部操作 */}
              <div className="onboarding-footer">
                {/* 测试结果显示 */}
                {modelTestResult && (
                  <div className={`model-test-result ${modelTestResult.success ? 'success' : 'error'}`}>
                    {modelTestResult.success ? (
                      <span>✅ {t('onboarding.testSuccess', '连接成功！')}</span>
                    ) : (
                      <span>❌ {t('onboarding.testFailed', '连接失败')}: {modelTestResult.error}</span>
                    )}
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  disabled={!selectedOnboardingModel || modelTesting}
                  onClick={async () => {
                    // 先设置配置
                    const localConfig = {
                      ...tempConfig,
                      aiProvider: 'ollama' as const,
                      ollamaModel: selectedOnboardingModel,
                    };
                    setTempConfig(localConfig);

                    // 测试连接
                    setModelTesting(true);
                    setModelTestResult(null);
                    try {
                      await window.hawkeye.saveConfig(localConfig);
                      const response = await window.hawkeye.chat([
                        { role: 'user', content: 'Say "OK" if you can read this.' }
                      ]);
                      if (response && response.length > 0) {
                        setModelTestResult({ success: true });
                        // 测试成功，进入主界面
                        handleOnboardingComplete(selectedOnboardingModel);
                      } else {
                        setModelTestResult({ success: false, error: 'Empty response' });
                      }
                    } catch (err) {
                      setModelTestResult({ success: false, error: (err as Error).message });
                    } finally {
                      setModelTesting(false);
                    }
                  }}
                >
                  {modelTesting ? (
                    <>{t('onboarding.testing', '测试连接中...')}</>
                  ) : modelTestResult?.success ? (
                    <>{t('onboarding.continue', '继续')} →</>
                  ) : (
                    <>{t('onboarding.testAndContinue', '测试连接并继续')} →</>
                  )}
                </button>
                <button className="btn btn-text" onClick={() => setOnboardingMode('choose')}>
                  ← {t('app.back', '返回')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // 设置页面
  if (showSettings) {
    // 获取当前模型信息
    const getCurrentModelInfo = () => {
      if (config?.localOnly || config?.aiProvider === 'ollama') {
        return {
          name: config?.ollamaModel || 'qwen3-vl:2b',
          type: 'local',
          icon: '💻',
          label: t('settings.local', '本地'),
        };
      } else if (config?.aiProvider === 'gemini') {
        return {
          name: config?.geminiModel || 'gemini-2.0-flash-exp',
          type: 'cloud',
          icon: '☁️',
          label: t('settings.cloud', '云端'),
        };
      } else if (config?.aiProvider === 'openai') {
        return {
          name: config?.openaiModel || 'gpt-4',
          type: 'cloud',
          icon: '☁️',
          label: t('settings.cloud', '云端'),
        };
      }
      return { name: '未配置', type: 'unknown', icon: '❓', label: '未知' };
    };

    const currentModel = getCurrentModelInfo();

    return (
      <div className="container settings">
        <header className="header">
          <h2>⚙️ {t('settings.title')}</h2>
        </header>

        <div className="content settings-content">
          {/* 当前模型信息 - 突出显示 */}
          <div className="current-model-banner">
            <div className="current-model-info">
              <span className="current-model-icon">{currentModel.icon}</span>
              <div className="current-model-details">
                <span className="current-model-label">{t('settings.currentModel', '当前模型')}</span>
                <span className="current-model-name">{currentModel.name}</span>
              </div>
            </div>
            <div className="current-model-actions">
              <span className={`current-model-badge ${currentModel.type}`}>
                {currentModel.label}
              </span>
              <button
                className="model-switch-btn"
                onClick={() => setShowModelSelector(true)}
                title={t('settings.switchModel', '切换模型')}
              >
                🔄
                <span className="switch-label">
                  {t('settings.switchModel', '切换')}
                </span>
              </button>
            </div>

            {/* 模型选择器弹窗 */}
            {showModelSelector && (
              <div className="model-selector-overlay" onClick={() => setShowModelSelector(false)}>
                <div className="model-selector-popup" onClick={(e) => e.stopPropagation()}>
                  <div className="model-selector-header">
                    <h3>{t('settings.selectModelType', '选择模型类型')}</h3>
                    <button className="close-btn" onClick={() => setShowModelSelector(false)}>×</button>
                  </div>
                  <div className="model-selector-options">
                    {/* 本地模型选项 */}
                    <div
                      className={`model-option ${currentModel.type === 'local' ? 'active' : ''} ${!config?.hasOllama ? 'disabled' : ''}`}
                      onClick={() => {
                        if (config?.hasOllama) {
                          setTempConfig({
                            ...tempConfig,
                            localOnly: true,
                            aiProvider: 'ollama',
                            ollamaModel: config?.localOnlyRecommendedModel || 'qwen3-vl:2b',
                          });
                          setShowModelSelector(false);
                        }
                      }}
                    >
                      <div className="model-option-icon">💻</div>
                      <div className="model-option-info">
                        <div className="model-option-title">{t('settings.localModel', '本地模型')}</div>
                        <div className="model-option-desc">
                          {config?.hasOllama
                            ? `Ollama - ${config?.ollamaModel || 'qwen3-vl:2b'}`
                            : t('settings.ollamaNotInstalled', '未安装 Ollama')}
                        </div>
                      </div>
                      {currentModel.type === 'local' && <span className="model-option-check">✓</span>}
                    </div>

                    {/* 云端模型选项 - Gemini */}
                    <div
                      className={`model-option ${currentModel.type === 'cloud' && tempConfig.aiProvider === 'gemini' ? 'active' : ''} ${!(config?.hasGemini || config?.geminiApiKey) ? 'disabled' : ''}`}
                      onClick={() => {
                        if (config?.hasGemini || config?.geminiApiKey) {
                          setTempConfig({
                            ...tempConfig,
                            localOnly: false,
                            aiProvider: 'gemini',
                          });
                          setShowModelSelector(false);
                        }
                      }}
                    >
                      <div className="model-option-icon">☁️</div>
                      <div className="model-option-info">
                        <div className="model-option-title">Gemini {t('settings.cloudModel', '云端')}</div>
                        <div className="model-option-desc">
                          {(config?.hasGemini || config?.geminiApiKey)
                            ? config?.geminiModel || 'gemini-2.0-flash-exp'
                            : t('settings.apiKeyNotConfigured', '未配置 API Key')}
                        </div>
                      </div>
                      {currentModel.type === 'cloud' && tempConfig.aiProvider === 'gemini' && <span className="model-option-check">✓</span>}
                    </div>

                    {/* 云端模型选项 - OpenAI */}
                    <div
                      className={`model-option ${currentModel.type === 'cloud' && tempConfig.aiProvider === 'openai' ? 'active' : ''} ${!config?.openaiApiKey ? 'disabled' : ''}`}
                      onClick={() => {
                        if (config?.openaiApiKey) {
                          setTempConfig({
                            ...tempConfig,
                            localOnly: false,
                            aiProvider: 'openai',
                          });
                          setShowModelSelector(false);
                        }
                      }}
                    >
                      <div className="model-option-icon">☁️</div>
                      <div className="model-option-info">
                        <div className="model-option-title">OpenAI {t('settings.cloudModel', '云端')}</div>
                        <div className="model-option-desc">
                          {config?.openaiApiKey
                            ? config?.openaiModel || 'gpt-4'
                            : t('settings.apiKeyNotConfigured', '未配置 API Key')}
                        </div>
                      </div>
                      {currentModel.type === 'cloud' && tempConfig.aiProvider === 'openai' && <span className="model-option-check">✓</span>}
                    </div>
                  </div>
                  <div className="model-selector-hint">
                    {t('settings.modelSelectorHint', '选择后需要点击「保存设置」按钮生效')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 完全本地模式 */}
          <div className="form-group local-only-section">
            <div className="local-only-header">
              <label className="checkbox-label large">
                <input
                  type="checkbox"
                  checked={tempConfig.localOnly === true}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setTempConfig({
                      ...tempConfig,
                      localOnly: checked,
                      // 启用本地模式时，自动切换到 Ollama 并设置推荐模型
                      ...(checked ? {
                        aiProvider: 'ollama',
                        ollamaModel: config?.localOnlyRecommendedModel || 'qwen3-vl:2b',
                      } : {}),
                    });
                  }}
                />
                <span className="local-only-title">🔒 {t('settings.localOnly', '完全本地模式')}</span>
              </label>
            </div>
            <small className="form-hint local-only-desc">
              {t('settings.localOnlyDesc', '启用后不会访问任何网络，所有 AI 推理在本地完成。需要先安装 Ollama 和对应模型。')}
            </small>
            {tempConfig.localOnly && (
              <div className="local-only-info">
                <div className="info-box">
                  <strong>{t('settings.recommendedModel', '推荐模型')}:</strong>
                  <code>{config?.localOnlyRecommendedModel || 'qwen3-vl:2b'}</code>
                  <small>~1.9GB, {t('settings.bestBalance', '速度与质量最佳平衡')}</small>
                </div>
              </div>
            )}
          </div>

          {/* AI Provider - 完全本地模式下隐藏 */}
          {!tempConfig.localOnly && (
            <div className="form-group">
              <label>{t('settings.aiProvider')}</label>
              <select
                value={tempConfig.aiProvider || 'openai'}
                onChange={(e) =>
                  setTempConfig({ ...tempConfig, aiProvider: e.target.value as any })
                }
              >
                <option value="openai">OpenAI Compatible ({t('settings.cloud', '云端')})</option>
                <option value="ollama">Ollama ({t('settings.local', '本地')})</option>
                <option value="gemini">Gemini ({t('settings.cloud', '云端')})</option>
              </select>
            </div>
          )}

          {/* Ollama 配置 - 完全本地模式或选择 Ollama 时显示 */}
          {(tempConfig.localOnly || tempConfig.aiProvider === 'ollama') && (
            <>
              <div className="form-group">
                <label>{t('settings.ollamaHost')}</label>
                <input
                  type="text"
                  value={tempConfig.ollamaHost || 'http://localhost:11434'}
                  onChange={(e) =>
                    setTempConfig({ ...tempConfig, ollamaHost: e.target.value })
                  }
                  placeholder="http://localhost:11434"
                />
              </div>
              <div className="form-group">
                <label>{t('settings.ollamaModel')}</label>
                <div className="model-input-group">
                  <input
                    type="text"
                    value={tempConfig.ollamaModel || (tempConfig.localOnly ? 'qwen3-vl:2b' : 'qwen2.5vl:3b')}
                    onChange={(e) =>
                      setTempConfig({ ...tempConfig, ollamaModel: e.target.value })
                    }
                    placeholder={tempConfig.localOnly ? 'qwen3-vl:2b' : 'qwen2.5vl:3b'}
                  />
                  <button
                    type="button"
                    className={`btn btn-download ${modelPullProgress?.isDownloading ? 'downloading' : ''}`}
                    onClick={() => pullModel(tempConfig.ollamaModel || (tempConfig.localOnly ? 'qwen3-vl:2b' : 'qwen2.5vl:3b'))}
                    disabled={modelPullProgress?.isDownloading}
                  >
                    {modelPullProgress?.isDownloading ? '⏳' : '⬇️'} {t('settings.download', '下载')}
                  </button>
                </div>
                {tempConfig.localOnly && config?.localOnlyAlternatives && (
                  <small className="model-alternatives">
                    {t('settings.alternatives', '备选')}: {config.localOnlyAlternatives.join(', ')}
                  </small>
                )}
              </div>

              {/* 模型下载进度 */}
              {modelPullProgress?.isDownloading && (
                <div className="form-group model-download-progress">
                  <div className="progress-header">
                    <span>📦 {t('settings.downloading', '正在下载')}: {modelPullProgress.model}</span>
                    <span>{modelPullProgress.progress}%</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${modelPullProgress.progress}%` }}
                    />
                  </div>
                  <div className="progress-output">
                    {modelPullProgress.output}
                  </div>
                </div>
              )}

              {/* 已安装的模型列表 */}
              {installedModels.length > 0 && (
                <div className="form-group installed-models">
                  <label>{t('settings.installedModels', '已安装模型')}</label>
                  <div className="model-list">
                    {installedModels.map((model) => (
                      <div
                        key={model.name}
                        className={`model-item ${tempConfig.ollamaModel === model.name ? 'selected' : ''}`}
                        onClick={() => setTempConfig({ ...tempConfig, ollamaModel: model.name })}
                      >
                        <span className="model-name">{model.name}</span>
                        <span className="model-size">{model.size}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 刷新模型列表按钮 */}
              <div className="form-group">
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={refreshOllamaStatus}
                >
                  🔄 {t('settings.refreshModels', '刷新模型列表')}
                </button>
                {ollamaStatus && (
                  <span className={`ollama-status ${ollamaStatus.running ? 'running' : 'stopped'}`}>
                    {ollamaStatus.running
                      ? `✅ Ollama ${t('settings.running', '运行中')}`
                      : `⚠️ Ollama ${t('settings.notRunning', '未运行')}`
                    }
                  </span>
                )}
              </div>
            </>
          )}

          {/* Gemini 配置 - 完全本地模式下隐藏 */}
          {!tempConfig.localOnly && tempConfig.aiProvider === 'gemini' && (
            <>
              <div className="form-group">
                <label>{t('settings.geminiApiKey')}</label>
                <input
                  type="password"
                  value={tempConfig.geminiApiKey || ''}
                  onChange={(e) =>
                    setTempConfig({ ...tempConfig, geminiApiKey: e.target.value })
                  }
                  placeholder="AIza..."
                />
                <small>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('settings.getApiKey')}
                  </a>
                </small>
              </div>
              <div className="form-group">
                <label>{t('settings.geminiModel')}</label>
                <input
                  type="text"
                  value={tempConfig.geminiModel || 'gemini-2.0-flash-exp'}
                  onChange={(e) =>
                    setTempConfig({ ...tempConfig, geminiModel: e.target.value })
                  }
                  placeholder="gemini-2.0-flash-exp"
                />
              </div>
            </>
          )}

          {/* 语言 */}
          <div className="form-group">
            <label>{t('settings.language.label')}</label>
            <select value={i18n.language} onChange={handleLanguageChange}>
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName}
                </option>
              ))}
            </select>
          </div>

          {/* 自动更新 */}
          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={tempConfig.autoUpdate !== false}
                onChange={(e) =>
                  setTempConfig({ ...tempConfig, autoUpdate: e.target.checked })
                }
              />
              <span>{t('settings.autoUpdate')}</span>
            </label>
            <small className="form-hint">{t('settings.autoUpdateDesc')}</small>
          </div>

          {/* 状态显示 */}
          {status && (
            <div className="status-info">
              {tempConfig.localOnly && (
                <p className="local-only-badge">🔒 {t('settings.localOnlyActive', '完全本地模式已启用')}</p>
              )}
              <p>AI: {status.aiReady ? `✅ ${status.aiProvider}` : '❌ 未就绪'}</p>
              <p>
                同步: {status.syncRunning ? `✅ 端口 ${status.syncPort}` : '❌ 未运行'}
              </p>
              <p>连接: {status.connectedClients} 个客户端</p>
            </div>
          )}
        </div>

        <div className="footer-actions">
          <button className="btn btn-primary" onClick={handleSaveConfig}>
            {t('settings.save')}
          </button>
          {config && (
            <button className="btn" onClick={() => setShowSettings(false)}>
              {t('settings.cancel')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // A2UI 主界面
  return (
    <div className="container a2ui-container">
      {/* Header */}
      <header className="header">
        <div className="header-brand" onClick={() => setShowChatDialog(true)} style={{ cursor: 'pointer' }}>
          <img src={logoIcon} alt="Hawkeye" className="brand-icon" />
          <h1>Hawkeye</h1>
        </div>
        <div className="header-actions">
          {/* 调试时间线按钮 */}
          <button
            className={`btn-icon ${showDebugTimeline ? 'active' : ''}`}
            onClick={() => setShowDebugTimeline(!showDebugTimeline)}
            title={t('app.debugTimeline', '调试时间线')}
          >
            🔧
          </button>
          {/* 截屏预览按钮 */}
          <button
            className={`btn-icon ${showScreenshotPreview ? 'active' : ''}`}
            onClick={toggleScreenshotPreview}
            title={t('app.screenshotPreview', '截屏预览')}
          >
            🖼️
          </button>
          {/* 智能观察状态 */}
          <button
            className={`btn-smart-observe ${smartObserveWatching ? 'watching' : ''}`}
            onClick={async () => {
              await window.hawkeye.toggleSmartObserve();
            }}
            title={smartObserveWatching ? t('app.smartObserveOn', '智能观察中') : t('app.smartObserveOff', '智能观察已关闭')}
          >
            {smartObserveWatching ? '👁️' : '👁️‍🗨️'}
          </button>
          {/* 状态指示器 */}
          <div className="a2ui-status-indicator">
            <span
              className={`status-dot ${
                smartObserveWatching ? 'watching' : status?.aiReady ? 'active' : status?.initialized ? 'processing' : 'error'
              }`}
            />
            <span className="status-text">
              {smartObserveWatching
                ? t('app.smartObserving', '酝酿中')
                : status?.aiReady
                ? t('app.ready', '就绪')
                : status?.initialized
                ? t('app.initializing', '初始化中')
                : t('app.notConnected', '未连接')}
            </span>
          </div>
          <button
            className="btn-icon"
            onClick={() => setShowSettings(true)}
            title={t('settings.title')}
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* 截屏预览面板 */}
      {showScreenshotPreview && screenshotPreview && (
        <div className={`screenshot-preview-panel ${screenshotZoomed ? 'zoomed' : ''}`}>
          <div className="screenshot-preview-header">
            <span>{t('app.currentScreen', '当前屏幕')}</span>
            <div className="screenshot-preview-actions">
              <button
                className="btn-icon-small"
                onClick={() => setScreenshotZoomed(!screenshotZoomed)}
                title={screenshotZoomed ? '缩小' : '放大'}
              >
                {screenshotZoomed ? '🔍-' : '🔍+'}
              </button>
              <button
                className="btn-icon-small"
                onClick={toggleScreenshotPreview}
                title="刷新"
              >
                🔄
              </button>
              <button className="btn-close" onClick={() => setShowScreenshotPreview(false)}>×</button>
            </div>
          </div>
          <div className="screenshot-preview-content">
            <div className="screenshot-image-container" onClick={() => setScreenshotZoomed(!screenshotZoomed)}>
              <img
                src={screenshotPreview}
                alt="Screen Preview"
                className={`screenshot-preview-image ${screenshotZoomed ? 'zoomed' : ''}`}
              />
            </div>
            {ocrTextPreview && (
              <div className="ocr-text-preview">
                <div className="ocr-text-header">
                  <span>📝 OCR 识别结果</span>
                  <span className="ocr-text-length">{ocrTextPreview.length} 字符</span>
                </div>
                <div className="ocr-text-content">
                  {ocrTextPreview}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 卡片列表 */}
      <div className="content a2ui-content">
        <CardList
          cards={cards}
          onAction={handleCardAction}
          onDismiss={handleCardDismiss}
          emptyMessage="暂无建议，Hawkeye 正在观察您的工作环境..."
        />
      </div>

      {/* 快捷操作栏 */}
      <QuickActions actions={quickActions} onAction={handleQuickAction} />

      {/* 调试时间线面板 */}
      {showDebugTimeline && (
        <div className="debug-timeline-overlay">
          <DebugTimeline onClose={() => setShowDebugTimeline(false)} />
        </div>
      )}

      {/* 聊天对话框 */}
      {showChatDialog && (
        <div className="chat-dialog-overlay" onClick={() => setShowChatDialog(false)}>
          <div className="chat-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="chat-dialog-header">
              <h3>{t('app.chatWithAI', '与 AI 对话')}</h3>
              <button className="btn-close" onClick={() => setShowChatDialog(false)}>×</button>
            </div>
            <div className="chat-messages">
              {chatMessages.length === 0 ? (
                <div className="chat-empty">
                  <p>{t('app.chatWelcome', '你好！我是 Hawkeye AI，有什么可以帮助你的？')}</p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className={`chat-message ${msg.role}`}>
                    <div className="chat-message-content">{msg.content}</div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="chat-message assistant loading">
                  <div className="chat-message-content">
                    <span className="typing-indicator">...</span>
                  </div>
                </div>
              )}
            </div>
            <div className="chat-input-area">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                  }
                }}
                placeholder={t('app.typeMessage', '输入消息...')}
                disabled={chatLoading}
              />
              <button
                className="btn btn-primary"
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || chatLoading}
              >
                {t('app.send', '发送')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
