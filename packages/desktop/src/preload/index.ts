/**
 * Preload script - 暴露安全的 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';

// 类型定义
export interface UserIntent {
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

export interface ExecutionPlan {
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

export interface PlanExecution {
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

export interface HawkeyeStatus {
  initialized: boolean;
  aiReady: boolean;
  aiProvider: string | null;
  syncRunning: boolean;
  syncPort: number | null;
  connectedClients: number;
}

export interface AppConfig {
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

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('hawkeye', {
  // ============ 核心 API ============

  // 观察屏幕并识别意图
  observe: () => ipcRenderer.invoke('observe'),

  // 为意图生成执行计划
  generatePlan: (intentId: string) => ipcRenderer.invoke('generate-plan', intentId),

  // 执行计划
  executePlan: (planId?: string) => ipcRenderer.invoke('execute-plan', planId),

  // 暂停执行
  pauseExecution: (planId: string) => ipcRenderer.invoke('pause-execution', planId),

  // 恢复执行
  resumeExecution: (planId: string) => ipcRenderer.invoke('resume-execution', planId),

  // 取消执行
  cancelExecution: (planId: string) => ipcRenderer.invoke('cancel-execution', planId),

  // 提供意图反馈
  intentFeedback: (intentId: string, feedback: 'accept' | 'reject' | 'irrelevant') =>
    ipcRenderer.invoke('intent-feedback', intentId, feedback),

  // ============ 状态 API ============

  // 获取当前识别的意图
  getIntents: () => ipcRenderer.invoke('get-intents'),

  // 获取当前计划
  getPlan: () => ipcRenderer.invoke('get-plan'),

  // 获取 Hawkeye 状态
  getStatus: () => ipcRenderer.invoke('get-status'),

  // 获取可用的 AI Provider
  getAvailableProviders: () => ipcRenderer.invoke('get-available-providers'),

  // 切换 AI Provider
  switchAIProvider: (provider: 'ollama' | 'gemini') =>
    ipcRenderer.invoke('switch-ai-provider', provider),

  // ============ 配置 API ============

  // 获取配置
  getConfig: () => ipcRenderer.invoke('get-config'),

  // 保存配置
  saveConfig: (config: Partial<AppConfig>) => ipcRenderer.invoke('save-config', config),

  // ============ AI 对话 ============

  // 与 AI 对话
  chat: (messages: Array<{ role: string; content: string }>) =>
    ipcRenderer.invoke('chat', messages),

  // ============ 数据管理 ============

  // 获取数据库统计
  getStats: () => ipcRenderer.invoke('get-stats'),

  // 清理旧数据
  cleanup: (days: number) => ipcRenderer.invoke('cleanup', days),

  // ============ 旧版兼容 API ============

  // 执行建议 (兼容)
  execute: (suggestionId: string) => ipcRenderer.invoke('execute', suggestionId),

  // 获取建议列表 (兼容)
  getSuggestions: () => ipcRenderer.invoke('getSuggestions'),

  // 配置 API Key (兼容)
  setApiKey: (apiKey: string) => ipcRenderer.invoke('setApiKey', apiKey),

  // ============ 事件监听 ============

  // 监听意图识别
  onIntents: (callback: (intents: UserIntent[]) => void) => {
    ipcRenderer.on('intents', (_event, intents) => callback(intents));
  },

  // 监听计划生成
  onPlan: (callback: (plan: ExecutionPlan) => void) => {
    ipcRenderer.on('plan', (_event, plan) => callback(plan));
  },

  // 监听执行进度
  onExecutionProgress: (callback: (data: { planId: string; step: any }) => void) => {
    ipcRenderer.on('execution-progress', (_event, data) => callback(data));
  },

  // 监听执行完成
  onExecutionCompleted: (callback: (execution: PlanExecution) => void) => {
    ipcRenderer.on('execution-completed', (_event, execution) => callback(execution));
  },

  // 监听 Hawkeye 就绪
  onHawkeyeReady: (callback: (status: HawkeyeStatus) => void) => {
    ipcRenderer.on('hawkeye-ready', (_event, status) => callback(status));
  },

  // 监听模块就绪
  onModuleReady: (callback: (module: string) => void) => {
    ipcRenderer.on('module-ready', (_event, module) => callback(module));
  },

  // 监听 AI Provider 就绪
  onAIProviderReady: (callback: (type: string) => void) => {
    ipcRenderer.on('ai-provider-ready', (_event, type) => callback(type));
  },

  // 监听 AI Provider 错误
  onAIProviderError: (callback: (info: { type: string; error: any }) => void) => {
    ipcRenderer.on('ai-provider-error', (_event, info) => callback(info));
  },

  // 监听显示设置
  onShowSettings: (callback: () => void) => {
    ipcRenderer.on('show-settings', () => callback());
  },

  // 监听加载状态 (兼容)
  onLoading: (callback: (loading: boolean) => void) => {
    ipcRenderer.on('loading', (_event, loading) => callback(loading));
  },

  // 监听错误 (兼容)
  onError: (callback: (error: string) => void) => {
    ipcRenderer.on('error', (_event, error) => callback(error));
  },

  // 监听建议 (兼容)
  onSuggestions: (callback: (suggestions: unknown[]) => void) => {
    ipcRenderer.on('suggestions', (_event, suggestions) => callback(suggestions));
  },
});
