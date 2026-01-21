/**
 * Hawkeye Desktop - Main App Component
 * 支持意图识别 → 计划生成 → 执行确认流程
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { languages } from './i18n';

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

type ViewMode = 'intents' | 'plan' | 'executing' | 'settings';

export default function App() {
  const { t, i18n } = useTranslation();

  // 状态
  const [viewMode, setViewMode] = useState<ViewMode>('intents');
  const [intents, setIntents] = useState<UserIntent[]>([]);
  const [selectedIntent, setSelectedIntent] = useState<UserIntent | null>(null);
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [execution, setExecution] = useState<PlanExecution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<HawkeyeStatus | null>(null);

  // 配置
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tempConfig, setTempConfig] = useState<Partial<AppConfig>>({});

  useEffect(() => {
    // 初始化
    initializeApp();

    // 监听事件
    window.hawkeye.onIntents((newIntents) => {
      setIntents(newIntents);
      if (newIntents.length > 0) {
        setSelectedIntent(newIntents[0]);
      }
      setError(null);
      setViewMode('intents');
    });

    window.hawkeye.onPlan((newPlan) => {
      setPlan(newPlan);
      setViewMode('plan');
    });

    window.hawkeye.onExecutionProgress((data) => {
      setExecution(prev => prev ? { ...prev, currentStep: data.step.order } : null);
    });

    window.hawkeye.onExecutionCompleted((result) => {
      setExecution(result);
      setLoading(false);
    });

    window.hawkeye.onHawkeyeReady((newStatus) => {
      setStatus(newStatus);
    });

    window.hawkeye.onShowSettings(() => {
      setViewMode('settings');
    });

    window.hawkeye.onLoading(setLoading);
    window.hawkeye.onError((err) => setError(err));
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
        setViewMode('settings');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleObserve = async () => {
    setLoading(true);
    setError(null);
    try {
      await window.hawkeye.observe();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectIntent = (intent: UserIntent) => {
    setSelectedIntent(intent);
  };

  const handleGeneratePlan = async () => {
    if (!selectedIntent) return;

    setLoading(true);
    setError(null);
    try {
      const newPlan = await window.hawkeye.generatePlan(selectedIntent.id);
      setPlan(newPlan);
      setViewMode('plan');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleExecutePlan = async () => {
    if (!plan) return;

    setLoading(true);
    setError(null);
    setViewMode('executing');
    try {
      const result = await window.hawkeye.executePlan(plan.id);
      setExecution(result);
    } catch (err) {
      setError((err as Error).message);
      setViewMode('plan');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectPlan = () => {
    setPlan(null);
    setViewMode('intents');
  };

  const handleIntentFeedback = async (intentId: string, feedback: 'accept' | 'reject' | 'irrelevant') => {
    try {
      await window.hawkeye.intentFeedback(intentId, feedback);
      if (feedback === 'reject' || feedback === 'irrelevant') {
        setIntents(prev => prev.filter(i => i.id !== intentId));
        if (selectedIntent?.id === intentId) {
          setSelectedIntent(intents.length > 1 ? intents[0] : null);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveConfig = async () => {
    try {
      const newConfig = await window.hawkeye.saveConfig(tempConfig);
      setConfig(newConfig);
      setViewMode('intents');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    i18n.changeLanguage(e.target.value);
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'low': return '#4caf50';
      case 'medium': return '#ff9800';
      case 'high': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getIntentTypeIcon = (type: string) => {
    switch (type) {
      case 'file_organize': return '📁';
      case 'code_assist': return '💻';
      case 'search': return '🔍';
      case 'communication': return '💬';
      case 'automation': return '⚡';
      case 'data_process': return '📊';
      default: return '💡';
    }
  };

  // 设置页面
  if (viewMode === 'settings') {
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
              onChange={(e) => setTempConfig({ ...tempConfig, aiProvider: e.target.value as any })}
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
                  onChange={(e) => setTempConfig({ ...tempConfig, ollamaHost: e.target.value })}
                  placeholder="http://localhost:11434"
                />
              </div>
              <div className="form-group">
                <label>{t('settings.ollamaModel')}</label>
                <input
                  type="text"
                  value={tempConfig.ollamaModel || 'llama3.2-vision'}
                  onChange={(e) => setTempConfig({ ...tempConfig, ollamaModel: e.target.value })}
                  placeholder="llama3.2-vision"
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
                  onChange={(e) => setTempConfig({ ...tempConfig, geminiApiKey: e.target.value })}
                  placeholder="AIza..."
                />
                <small>
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                    {t('settings.getApiKey')}
                  </a>
                </small>
              </div>
              <div className="form-group">
                <label>{t('settings.geminiModel')}</label>
                <input
                  type="text"
                  value={tempConfig.geminiModel || 'gemini-2.0-flash-exp'}
                  onChange={(e) => setTempConfig({ ...tempConfig, geminiModel: e.target.value })}
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

          {/* 状态显示 */}
          {status && (
            <div className="status-info">
              <p>AI: {status.aiReady ? `✅ ${status.aiProvider}` : '❌ 未就绪'}</p>
              <p>同步: {status.syncRunning ? `✅ 端口 ${status.syncPort}` : '❌ 未运行'}</p>
              <p>连接: {status.connectedClients} 个客户端</p>
            </div>
          )}
        </div>

        <div className="footer-actions">
          <button className="btn btn-primary" onClick={handleSaveConfig}>
            {t('settings.save')}
          </button>
          {config && (
            <button className="btn" onClick={() => setViewMode('intents')}>
              {t('settings.cancel')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // 执行中页面
  if (viewMode === 'executing' && execution) {
    return (
      <div className="container">
        <header className="header">
          <h1>🦅 Hawkeye</h1>
        </header>

        <div className="content">
          <div className="execution-view">
            <h3>⚡ {t('app.executing')}</h3>
            <p>{plan?.title}</p>

            <div className="execution-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(execution.currentStep / (plan?.steps.length || 1)) * 100}%` }}
                />
              </div>
              <p>{t('app.step')} {execution.currentStep} / {plan?.steps.length}</p>
            </div>

            {execution.status === 'completed' && (
              <div className="execution-result success">
                <p>✅ {t('app.executionCompleted')}</p>
                <button className="btn btn-primary" onClick={() => {
                  setExecution(null);
                  setPlan(null);
                  setViewMode('intents');
                }}>
                  {t('app.done')}
                </button>
              </div>
            )}

            {execution.status === 'failed' && (
              <div className="execution-result error">
                <p>❌ {t('app.executionFailed')}</p>
                <button className="btn" onClick={() => {
                  setExecution(null);
                  setViewMode('plan');
                }}>
                  {t('app.back')}
                </button>
              </div>
            )}

            {execution.status === 'running' && (
              <div className="execution-controls">
                <button className="btn" onClick={() => window.hawkeye.pauseExecution(execution.planId)}>
                  ⏸️ {t('app.pause')}
                </button>
                <button className="btn" onClick={() => window.hawkeye.cancelExecution(execution.planId)}>
                  ⏹️ {t('app.cancel')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 计划确认页面
  if (viewMode === 'plan' && plan) {
    return (
      <div className="container">
        <header className="header">
          <h1>🦅 Hawkeye</h1>
          <button className="btn-icon" onClick={() => setViewMode('settings')} title={t('settings.title')}>
            ⚙️
          </button>
        </header>

        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className="content plan-view">
          <h3>📋 {plan.title}</h3>
          <p className="plan-description">{plan.description}</p>

          {/* 步骤列表 */}
          <div className="plan-steps">
            <h4>{t('app.steps')}</h4>
            <ul>
              {plan.steps.map((step) => (
                <li key={step.order} className="plan-step">
                  <span className="step-number">{step.order}</span>
                  <span className="step-description">{step.description}</span>
                  <span
                    className="step-risk"
                    style={{ backgroundColor: getRiskLevelColor(step.riskLevel) }}
                  >
                    {step.riskLevel}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* 优缺点 */}
          <div className="plan-pros-cons">
            <div className="pros">
              <h4>✅ {t('app.pros')}</h4>
              <ul>
                {plan.pros.map((pro, i) => (
                  <li key={i}>{pro}</li>
                ))}
              </ul>
            </div>
            <div className="cons">
              <h4>⚠️ {t('app.cons')}</h4>
              <ul>
                {plan.cons.map((con, i) => (
                  <li key={i}>{con}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* 影响分析 */}
          <div className="plan-impact">
            <h4>{t('app.impact')}</h4>
            <p>📁 {t('app.filesAffected')}: {plan.impact.filesAffected}</p>
            <p>🔄 {t('app.reversible')}: {plan.impact.fullyReversible ? '✅' : '⚠️'}</p>
            {plan.impact.systemChanges && <p>⚠️ {t('app.systemChanges')}</p>}
            {plan.impact.requiresNetwork && <p>🌐 {t('app.requiresNetwork')}</p>}
          </div>
        </div>

        <div className="footer-actions">
          <button
            className="btn btn-primary"
            onClick={handleExecutePlan}
            disabled={loading}
          >
            ▶️ {t('app.execute')}
          </button>
          <button className="btn" onClick={handleRejectPlan}>
            ❌ {t('app.reject')}
          </button>
        </div>
      </div>
    );
  }

  // 意图列表页面（默认）
  return (
    <div className="container">
      <header className="header">
        <h1>🦅 Hawkeye</h1>
        <div className="header-actions">
          {status && (
            <span className={`status-dot ${status.aiReady ? 'online' : 'offline'}`} title={status.aiProvider || ''} />
          )}
          <button className="btn-icon" onClick={() => setViewMode('settings')} title={t('settings.title')}>
            ⚙️
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="content">
        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>{t('app.loading')}</p>
          </div>
        ) : intents.length === 0 ? (
          <div className="empty-state">
            <div className="icon">👁️</div>
            <p>{t('app.empty')}</p>
            <button className="btn btn-primary" onClick={handleObserve}>
              {t('app.observeScreen')}
            </button>
            <p className="hint">{t('app.hint', { shortcut: '⌘+Shift+H' })}</p>
          </div>
        ) : (
          <>
            <ul className="intent-list">
              {intents.map((intent) => (
                <li
                  key={intent.id}
                  className={`intent-item ${selectedIntent?.id === intent.id ? 'selected' : ''}`}
                  onClick={() => handleSelectIntent(intent)}
                >
                  <div className="intent-header">
                    <span className="intent-icon">{getIntentTypeIcon(intent.type)}</span>
                    <span className="intent-type">{intent.type}</span>
                    <span className="intent-confidence">
                      {Math.round(intent.confidence * 100)}%
                    </span>
                  </div>
                  <p className="intent-description">{intent.description}</p>
                  {intent.context?.reason && (
                    <p className="intent-reason">{intent.context.reason}</p>
                  )}
                  <div className="intent-actions">
                    <button
                      className="btn-small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleIntentFeedback(intent.id, 'irrelevant');
                      }}
                      title={t('app.markIrrelevant')}
                    >
                      ❌
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="footer-actions">
              <button
                className="btn btn-primary"
                onClick={handleGeneratePlan}
                disabled={!selectedIntent || loading}
              >
                📋 {t('app.generatePlan')}
              </button>
              <button className="btn" onClick={handleObserve} disabled={loading}>
                🔄 {t('app.refresh')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
