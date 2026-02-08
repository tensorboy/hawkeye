/**
 * Preload script - 暴露安全的 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  UserIntent,
  ExecutionPlan,
  PlanExecution,
  HawkeyeStatus,
  AppConfig,
  LocalModel,
  ModelDownloadProgress,
  RecommendedModel,
} from '../shared/types';

export type {
  UserIntent,
  ExecutionPlan,
  PlanExecution,
  HawkeyeStatus,
  AppConfig,
  LocalModel,
  ModelDownloadProgress,
  RecommendedModel,
} from '../shared/types';

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
  switchAIProvider: (provider: 'llama-cpp' | 'openai' | 'gemini') =>
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

  // 获取执行历史
  getExecutionHistory: (limit?: number) => ipcRenderer.invoke('get-execution-history', limit),

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
    const handler = (_event: Electron.IpcRendererEvent, intents: UserIntent[]) => callback(intents);
    ipcRenderer.on('intents', handler);
    return () => ipcRenderer.removeListener('intents', handler);
  },

  // 监听计划生成
  onPlan: (callback: (plan: ExecutionPlan) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, plan: ExecutionPlan) => callback(plan);
    ipcRenderer.on('plan', handler);
    return () => ipcRenderer.removeListener('plan', handler);
  },

  // 监听执行进度
  onExecutionProgress: (callback: (data: { planId: string; step: any }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { planId: string; step: any }) => callback(data);
    ipcRenderer.on('execution-progress', handler);
    return () => ipcRenderer.removeListener('execution-progress', handler);
  },

  // 监听执行完成
  onExecutionCompleted: (callback: (execution: PlanExecution) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, execution: PlanExecution) => callback(execution);
    ipcRenderer.on('execution-completed', handler);
    return () => ipcRenderer.removeListener('execution-completed', handler);
  },

  // 监听 Hawkeye 就绪
  onHawkeyeReady: (callback: (status: HawkeyeStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: HawkeyeStatus) => callback(status);
    ipcRenderer.on('hawkeye-ready', handler);
    return () => ipcRenderer.removeListener('hawkeye-ready', handler);
  },

  // 监听模块就绪
  onModuleReady: (callback: (module: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, module: string) => callback(module);
    ipcRenderer.on('module-ready', handler);
    return () => ipcRenderer.removeListener('module-ready', handler);
  },

  // 监听 AI Provider 就绪
  onAIProviderReady: (callback: (type: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, type: string) => callback(type);
    ipcRenderer.on('ai-provider-ready', handler);
    return () => ipcRenderer.removeListener('ai-provider-ready', handler);
  },

  // 监听 AI Provider 错误
  onAIProviderError: (callback: (info: { type: string; error: any }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { type: string; error: any }) => callback(info);
    ipcRenderer.on('ai-provider-error', handler);
    return () => ipcRenderer.removeListener('ai-provider-error', handler);
  },

  // 监听显示设置
  onShowSettings: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('show-settings', handler);
    return () => ipcRenderer.removeListener('show-settings', handler);
  },

  // 监听加载状态 (兼容)
  onLoading: (callback: (loading: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, loading: boolean) => callback(loading);
    ipcRenderer.on('loading', handler);
    return () => ipcRenderer.removeListener('loading', handler);
  },

  // 监听错误 (兼容)
  onError: (callback: (error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
    ipcRenderer.on('error', handler);
    return () => ipcRenderer.removeListener('error', handler);
  },

  // 监听建议 (兼容)
  onSuggestions: (callback: (suggestions: unknown[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, suggestions: unknown[]) => callback(suggestions);
    ipcRenderer.on('suggestions', handler);
    return () => ipcRenderer.removeListener('suggestions', handler);
  },

  // ============ 应用更新 ============

  // 检查更新
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // ============ 智能观察 ============

  // 启动智能观察
  startSmartObserve: () => ipcRenderer.invoke('start-smart-observe'),

  // 停止智能观察
  stopSmartObserve: () => ipcRenderer.invoke('stop-smart-observe'),

  // 获取智能观察状态
  getSmartObserveStatus: () => ipcRenderer.invoke('get-smart-observe-status'),

  // 切换智能观察
  toggleSmartObserve: () => ipcRenderer.invoke('toggle-smart-observe'),

  // 监听智能观察状态变化
  onSmartObserveStatus: (callback: (data: { watching: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { watching: boolean }) => callback(data);
    ipcRenderer.on('smart-observe-status', handler);
    return () => ipcRenderer.removeListener('smart-observe-status', handler);
  },

  // 监听屏幕变化检测
  onSmartObserveChangeDetected: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('smart-observe-change-detected', handler);
    return () => ipcRenderer.removeListener('smart-observe-change-detected', handler);
  },

  // 获取当前截屏
  getScreenshot: () => ipcRenderer.invoke('get-screenshot'),

  // 获取最后的感知上下文（截图 + OCR）
  getLastContext: () => ipcRenderer.invoke('get-last-context'),

  // ============ 自适应刷新率 API ============

  // 获取自适应刷新状态
  getAdaptiveRefreshStatus: () => ipcRenderer.invoke('get-adaptive-refresh-status'),

  // 记录用户活动（提升刷新率）
  recordUserActivity: (type: 'user_interaction' | 'window_switch' | 'clipboard_change' | 'ai_request' | 'plan_execution') =>
    ipcRenderer.invoke('record-user-activity', type),

  // 监听智能观察间隔变化
  onSmartObserveIntervalChanged: (callback: (data: {
    interval: number;
    level: string;
    activityScore: number;
  }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: {
      interval: number;
      level: string;
      activityScore: number;
    }) => callback(data);
    ipcRenderer.on('smart-observe-interval-changed', handler);
    return () => ipcRenderer.removeListener('smart-observe-interval-changed', handler);
  },

  // 监听截屏预览
  onScreenshotPreview: (callback: (data: { dataUrl: string; timestamp: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { dataUrl: string; timestamp: number }) => callback(data);
    ipcRenderer.on('screenshot-preview', handler);
    return () => ipcRenderer.removeListener('screenshot-preview', handler);
  },

  // ============ 本地模型管理 API ============

  // 获取模型存储目录
  modelGetDirectory: () => ipcRenderer.invoke('model-get-directory'),

  // 列出已下载的模型
  modelList: () => ipcRenderer.invoke('model-list'),

  // 从 HuggingFace 下载模型
  modelDownloadHF: (modelId: string, fileName?: string) =>
    ipcRenderer.invoke('model-download-hf', modelId, fileName),

  // 取消模型下载
  modelCancelDownload: (modelId: string, fileName?: string) =>
    ipcRenderer.invoke('model-cancel-download', modelId, fileName),

  // 删除模型
  modelDelete: (modelPath: string) => ipcRenderer.invoke('model-delete', modelPath),

  // 获取推荐模型列表
  modelGetRecommended: () => ipcRenderer.invoke('model-get-recommended'),

  // 检查模型是否存在
  modelExists: (modelPath: string) => ipcRenderer.invoke('model-exists', modelPath),

  // 监听模型下载进度
  onModelDownloadProgress: (callback: (progress: ModelDownloadProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ModelDownloadProgress) => callback(progress);
    ipcRenderer.on('model-download-progress', handler);
    // 返回清理函数
    return () => {
      ipcRenderer.removeListener('model-download-progress', handler);
    };
  },

  // ============ Whisper 语音识别 ============

  whisperTranscribe: (audioBuffer: Buffer) =>
    ipcRenderer.invoke('whisper-transcribe', audioBuffer),

  whisperStatus: () => ipcRenderer.invoke('whisper-status'),

  whisperCheckMic: () => ipcRenderer.invoke('whisper-check-mic'),

  whisperRequestMic: () => ipcRenderer.invoke('whisper-request-mic'),

  // Reset whisper model (delete and prepare for re-download)
  whisperResetModel: () => ipcRenderer.invoke('whisper-reset-model'),

  // Download whisper model
  whisperDownloadModel: () => ipcRenderer.invoke('whisper-download-model'),

  // Get whisper model info
  whisperModelInfo: () => ipcRenderer.invoke('whisper-model-info'),

  onWhisperSegment: (callback: (data: { text: string; timestamp: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { text: string; timestamp: number }) => callback(data);
    ipcRenderer.on('whisper-segment', handler);
    return () => ipcRenderer.removeListener('whisper-segment', handler);
  },

  onWhisperDownloadProgress: (callback: (data: {
    status: 'downloading' | 'completed' | 'error';
    progress: number;
    downloadedBytes: number;
    totalBytes: number;
    error?: string;
  }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: {
      status: 'downloading' | 'completed' | 'error';
      progress: number;
      downloadedBytes: number;
      totalBytes: number;
      error?: string;
    }) => callback(data);
    ipcRenderer.on('whisper-download-progress', handler);
    return () => ipcRenderer.removeListener('whisper-download-progress', handler);
  },

  // ============ 调试时间线 API ============

  debug: {
    // 获取所有调试事件（可选过滤）
    getEvents: (filter?: {
      types?: string[];
      startTime?: number;
      endTime?: number;
      search?: string;
    }) => ipcRenderer.invoke('debug-get-events', filter),

    // 获取最近的调试事件
    getRecent: (count?: number) => ipcRenderer.invoke('debug-get-recent', count),

    // 获取自某个时间戳以来的事件
    getSince: (timestamp: number) => ipcRenderer.invoke('debug-get-since', timestamp),

    // 清空调试事件
    clearEvents: () => ipcRenderer.invoke('debug-clear-events'),

    // 暂停事件收集
    pause: () => ipcRenderer.invoke('debug-pause'),

    // 恢复事件收集
    resume: () => ipcRenderer.invoke('debug-resume'),

    // 获取收集状态
    getStatus: () => ipcRenderer.invoke('debug-get-status'),

    // 导出调试事件为 JSON
    export: () => ipcRenderer.invoke('debug-export'),

    // 更新收集器配置
    updateConfig: (config: {
      maxEvents?: number;
      enableScreenshots?: boolean;
      screenshotThumbnailSize?: number;
      truncateTextAt?: number;
    }) => ipcRenderer.invoke('debug-update-config', config),
  },

  // ============ Life Tree API ============

  lifeTree: {
    getTree: () => ipcRenderer.invoke('life-tree:get'),
    rebuild: () => ipcRenderer.invoke('life-tree:rebuild'),
    proposeExperiment: (nodeId: string, phase?: string) =>
      ipcRenderer.invoke('life-tree:propose-experiment', nodeId, phase),
    startExperiment: (nodeId: string, proposal: any, phase: string) =>
      ipcRenderer.invoke('life-tree:start-experiment', nodeId, proposal, phase),
    concludeExperiment: (experimentNodeId: string, status: string) =>
      ipcRenderer.invoke('life-tree:conclude-experiment', experimentNodeId, status),
    getUnlockedPhase: () => ipcRenderer.invoke('life-tree:get-unlocked-phase'),
    getExperiments: () => ipcRenderer.invoke('life-tree:get-experiments'),
    onTreeUpdated: (callback: (data: { updatedNodeIds: string[] }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { updatedNodeIds: string[] }) => callback(data);
      ipcRenderer.on('life-tree:updated', handler);
      return () => ipcRenderer.removeListener('life-tree:updated', handler);
    },
  },

  // ============ Activity Summary API (10分钟活动总结) ============

  activitySummary: {
    // 获取最近的活动总结
    getRecent: (limit?: number) => ipcRenderer.invoke('activity-summary:get-recent', limit),

    // 获取时间范围内的总结
    getRange: (startTime: number, endTime: number) =>
      ipcRenderer.invoke('activity-summary:get-range', startTime, endTime),

    // 立即生成一次总结
    generateNow: () => ipcRenderer.invoke('activity-summary:generate-now'),

    // 获取待更新生命树的总结
    getPendingUpdates: () => ipcRenderer.invoke('activity-summary:get-pending-updates'),

    // 标记总结已更新生命树
    markUpdated: (summaryId: string) => ipcRenderer.invoke('activity-summary:mark-updated', summaryId),

    // 检查是否正在运行
    isRunning: () => ipcRenderer.invoke('activity-summary:is-running'),

    // 启动总结器
    start: () => ipcRenderer.invoke('activity-summary:start'),

    // 停止总结器
    stop: () => ipcRenderer.invoke('activity-summary:stop'),

    // 获取配置
    getConfig: () => ipcRenderer.invoke('activity-summary:get-config'),

    // 更新配置
    updateConfig: (config: any) => ipcRenderer.invoke('activity-summary:update-config', config),
  },

  // ============ Menu Bar Panel API ============

  menuBarPanel: {
    // 获取面板状态
    getState: () => ipcRenderer.invoke('menu-bar-panel:get-state'),

    // 执行快捷操作
    executeAction: (actionId: string) => ipcRenderer.invoke('menu-bar-panel:execute-action', actionId),

    // 清空最近活动
    clearActivities: () => ipcRenderer.invoke('menu-bar-panel:clear-activities'),

    // 监听面板状态推送
    onStateUpdate: (callback: (state: any) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: any) => callback(state);
      ipcRenderer.on('menu-bar-panel:state', handler);
      return () => ipcRenderer.removeListener('menu-bar-panel:state', handler);
    },
  },

  // ============ Gesture Control API ============

  gestureControl: (event: {
    action: string;
    gesture: string;
    confidence: number;
    position?: { x: number; y: number };
    handedness?: string;
  }) => ipcRenderer.invoke('gesture-control', event),

  gestureControlStatus: () => ipcRenderer.invoke('gesture-control:status'),

  gestureControlSetEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('gesture-control:set-enabled', enabled),

  gestureControlUpdateConfig: (config: {
    cursorSensitivity?: number;
    clickHoldTime?: number;
    scrollSpeed?: number;
  }) => ipcRenderer.invoke('gesture-control:update-config', config),

  onGestureControlScreenshot: (callback: (data: { dataUrl: string; timestamp: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { dataUrl: string; timestamp: number }) => callback(data);
    ipcRenderer.on('gesture-control:screenshot', handler);
    return () => ipcRenderer.removeListener('gesture-control:screenshot', handler);
  },

  onGestureControlToggleRecording: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('gesture-control:toggle-recording', handler);
    return () => ipcRenderer.removeListener('gesture-control:toggle-recording', handler);
  },

  onGestureControlPause: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('gesture-control:pause', handler);
    return () => ipcRenderer.removeListener('gesture-control:pause', handler);
  },

  onGestureControlQuickMenu: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('gesture-control:quick-menu', handler);
    return () => ipcRenderer.removeListener('gesture-control:quick-menu', handler);
  },

  // ============ Global Click API (WebGazer Calibration) ============

  globalClick: {
    // 启动全局点击监听
    start: () => ipcRenderer.invoke('global-click:start'),

    // 停止全局点击监听
    stop: () => ipcRenderer.invoke('global-click:stop'),

    // 获取全局点击状态
    status: () => ipcRenderer.invoke('global-click:status'),

    // 监听全局点击事件
    onEvent: (callback: (event: {
      x: number;
      y: number;
      button: number;
      timestamp: number;
      isInsideApp: boolean;
    }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: {
        x: number;
        y: number;
        button: number;
        timestamp: number;
        isInsideApp: boolean;
      }) => callback(data);
      ipcRenderer.on('global-click:event', handler);
      return () => ipcRenderer.removeListener('global-click:event', handler);
    },
  },

  // ============ Audio Processor API (Core Audio VPIO / AEC) ============

  audioProcessor: {
    // 启动音频处理 (带 AEC)
    start: () => ipcRenderer.invoke('audio-processor:start'),

    // 停止音频处理
    stop: () => ipcRenderer.invoke('audio-processor:stop'),

    // 获取处理器状态
    status: () => ipcRenderer.invoke('audio-processor:status'),

    // 手动处理音频数据 (用于 fallback 模式)
    process: (audioData: ArrayBuffer) => ipcRenderer.invoke('audio-processor:process', audioData),

    // 监听处理器状态变化
    onStatusChange: (callback: (status: {
      isRunning: boolean;
      aecEnabled: boolean;
      sampleRate: number;
      bufferSize: number;
      processedFrames: number;
    }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: {
        isRunning: boolean;
        aecEnabled: boolean;
        sampleRate: number;
        bufferSize: number;
        processedFrames: number;
      }) => callback(status);
      ipcRenderer.on('audio-processor-status', handler);
      return () => ipcRenderer.removeListener('audio-processor-status', handler);
    },

    // 监听处理后的音频
    onProcessed: (callback: (data: {
      size: number;
      energy: number;
      timestamp: number;
    }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: {
        size: number;
        energy: number;
        timestamp: number;
      }) => callback(data);
      ipcRenderer.on('audio-processed', handler);
      return () => ipcRenderer.removeListener('audio-processed', handler);
    },
  },

  // ============ Sherpa-ONNX Voice Engine API ============

  sherpaOnnx: {
    // Get status of all Sherpa components
    getStatus: () => ipcRenderer.invoke('sherpa:get-status'),

    // Initialize Sherpa engine
    initialize: (options?: {
      asrModel?: string;
      ttsModel?: string;
      vadModel?: string;
    }) => ipcRenderer.invoke('sherpa:initialize', options),

    // Shutdown Sherpa engine
    shutdown: () => ipcRenderer.invoke('sherpa:shutdown'),

    // Download a specific model
    downloadModel: (modelId: string) => ipcRenderer.invoke('sherpa:download-model', modelId),

    // Get available models
    getModels: () => ipcRenderer.invoke('sherpa:get-models'),

    // --- Streaming ASR ---
    startStreaming: () => ipcRenderer.invoke('sherpa:start-streaming'),
    stopStreaming: () => ipcRenderer.invoke('sherpa:stop-streaming'),
    feedAudio: (audioData: ArrayBuffer) => ipcRenderer.invoke('sherpa:feed-audio', audioData),

    // Listen for transcription events
    onTranscript: (callback: (data: {
      text: string;
      isFinal: boolean;
      timestamp: number;
      language?: string;
    }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: {
        text: string;
        isFinal: boolean;
        timestamp: number;
        language?: string;
      }) => callback(data);
      ipcRenderer.on('sherpa-transcript', handler);
      return () => ipcRenderer.removeListener('sherpa-transcript', handler);
    },

    // Listen for speech start/end
    onSpeechStart: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('sherpa-speech-start', handler);
      return () => ipcRenderer.removeListener('sherpa-speech-start', handler);
    },

    onSpeechEnd: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('sherpa-speech-end', handler);
      return () => ipcRenderer.removeListener('sherpa-speech-end', handler);
    },

    // Listen for model download progress
    onDownloadProgress: (callback: (data: {
      modelId: string;
      status: string;
      progress: number;
      downloadedBytes: number;
      totalBytes: number;
      error?: string;
    }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: {
        modelId: string;
        status: string;
        progress: number;
        downloadedBytes: number;
        totalBytes: number;
        error?: string;
      }) => callback(data);
      ipcRenderer.on('sherpa-download-progress', handler);
      return () => ipcRenderer.removeListener('sherpa-download-progress', handler);
    },

    // --- Wake Word ---
    wakeWord: {
      start: () => ipcRenderer.invoke('sherpa:wake-word-start'),
      stop: () => ipcRenderer.invoke('sherpa:wake-word-stop'),
      configure: (config: {
        keywords?: string[];
        sensitivity?: number;
        cooldownMs?: number;
      }) => ipcRenderer.invoke('sherpa:wake-word-configure', config),
      status: () => ipcRenderer.invoke('sherpa:wake-word-status'),

      onDetected: (callback: (data: { keyword: string; confidence: number; timestamp: number }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, data: { keyword: string; confidence: number; timestamp: number }) => callback(data);
        ipcRenderer.on('sherpa-wake-word-detected', handler);
        return () => ipcRenderer.removeListener('sherpa-wake-word-detected', handler);
      },
    },

    // --- TTS Playback ---
    tts: {
      speak: (text: string, options?: {
        voice?: string;
        speed?: number;
        priority?: 'normal' | 'high' | 'system';
        interrupt?: boolean;
      }) => ipcRenderer.invoke('sherpa:tts-speak', text, options),
      stop: () => ipcRenderer.invoke('sherpa:tts-stop'),
      skip: () => ipcRenderer.invoke('sherpa:tts-skip'),
      pause: () => ipcRenderer.invoke('sherpa:tts-pause'),
      resume: () => ipcRenderer.invoke('sherpa:tts-resume'),
      configure: (config: {
        defaultVoice?: string;
        defaultSpeed?: number;
        maxQueueSize?: number;
      }) => ipcRenderer.invoke('sherpa:tts-configure', config),

      onPlaybackDone: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('sherpa-tts-done', handler);
        return () => ipcRenderer.removeListener('sherpa-tts-done', handler);
      },
    },

    // --- Speaker ID ---
    speaker: {
      register: (name: string, audioData: ArrayBuffer) =>
        ipcRenderer.invoke('sherpa:register-speaker', name, audioData),
      identify: (audioData: ArrayBuffer) =>
        ipcRenderer.invoke('sherpa:identify-speaker', audioData),
    },
  },
});
