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

interface HawkeyeStatus {
  initialized: boolean;
  aiReady: boolean;
  aiProvider: string | null;
  syncRunning: boolean;
  syncPort: number | null;
  connectedClients: number;
}

interface AppConfig {
  aiProvider: 'ollama' | 'gemini';
  ollamaHost?: string;
  ollamaModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  syncPort: number;
  autoStartSync: boolean;
  autoUpdate: boolean;
  hasOllama: boolean;
  hasGemini: boolean;
}

declare global {
  interface Window {
    hawkeye: {
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
    };
  }
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

  // 初始化
  useEffect(() => {
    initializeApp();
    setupEventListeners();
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

      // 如果没有配置 AI，显示设置
      if (!configData.hasOllama && !configData.hasGemini) {
        setShowSettings(true);
      }
    } catch (err) {
      addErrorCard((err as Error).message);
    }
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

      case 'screenshot':
        await window.hawkeye.observe();
        break;

      case 'clipboard':
        // 分析剪贴板
        await window.hawkeye.observe();
        break;

      case 'history':
        // TODO: 显示历史记录
        const infoCard: A2UICard = {
          id: generateId(),
          type: 'info',
          title: '历史记录',
          description: '历史记录功能即将推出',
          icon: 'info',
          timestamp: Date.now(),
          actions: [{ id: 'dismiss', label: '关闭', type: 'dismiss' }],
        };
        addCard(infoCard);
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

  // 语言切换
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    i18n.changeLanguage(e.target.value);
  };

  // 准备快捷操作
  const quickActions: QuickAction[] = defaultQuickActions.map((action) => ({
    ...action,
    disabled: !status?.aiReady && action.id !== 'settings',
  }));

  // 设置页面
  if (showSettings) {
    return (
      <div className="container settings">
        <header className="header">
          <h2>⚙️ {t('settings.title')}</h2>
        </header>

        <div className="content settings-content">
          {/* AI Provider */}
          <div className="form-group">
            <label>{t('settings.aiProvider')}</label>
            <select
              value={tempConfig.aiProvider || 'ollama'}
              onChange={(e) =>
                setTempConfig({ ...tempConfig, aiProvider: e.target.value as any })
              }
            >
              <option value="ollama">Ollama (本地)</option>
              <option value="gemini">Gemini (云端)</option>
            </select>
          </div>

          {/* Ollama 配置 */}
          {tempConfig.aiProvider === 'ollama' && (
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
                <input
                  type="text"
                  value={tempConfig.ollamaModel || 'qwen2.5vl:7b'}
                  onChange={(e) =>
                    setTempConfig({ ...tempConfig, ollamaModel: e.target.value })
                  }
                  placeholder="qwen2.5vl:7b"
                />
              </div>
            </>
          )}

          {/* Gemini 配置 */}
          {tempConfig.aiProvider === 'gemini' && (
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
        <div className="header-brand">
          <span className="brand-icon">🦅</span>
          <h1>Hawkeye</h1>
        </div>
        <div className="header-actions">
          {/* 状态指示器 */}
          <div className="a2ui-status-indicator">
            <span
              className={`status-dot ${
                status?.aiReady ? 'active' : status?.initialized ? 'processing' : 'error'
              }`}
            />
            <span className="status-text">
              {status?.aiReady
                ? '感知中'
                : status?.initialized
                ? '初始化中'
                : '未连接'}
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
    </div>
  );
}
