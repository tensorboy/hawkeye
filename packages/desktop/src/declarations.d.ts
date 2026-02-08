/**
 * Type declarations for Hawkeye Desktop
 */

// Declare image module imports
declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.gif' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

declare module '*.ico' {
  const value: string;
  export default value;
}

declare module '*.webp' {
  const value: string;
  export default value;
}

// ============ Window.hawkeye API Types ============

interface LocalModel {
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  modifiedAt: Date;
  quantization?: string;
}

interface ModelDownloadProgress {
  modelId: string;
  fileName: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed?: string;
  eta?: string;
  status: 'downloading' | 'completed' | 'error' | 'cancelled';
  error?: string;
}

interface RecommendedModel {
  id: string;
  name: string;
  description: string;
  type: 'text' | 'vision';
  size: string;
  quantization: string;
  fileName: string;
}

interface HawkeyeAPI {
  // Core API
  observe: () => Promise<any>;
  generatePlan: (intentId: string) => Promise<any>;
  executePlan: (planId?: string) => Promise<any>;
  pauseExecution: (planId: string) => Promise<any>;
  resumeExecution: (planId: string) => Promise<any>;
  cancelExecution: (planId: string) => Promise<any>;
  intentFeedback: (intentId: string, feedback: 'accept' | 'reject' | 'irrelevant') => Promise<any>;

  // Status API
  getIntents: () => Promise<any>;
  getPlan: () => Promise<any>;
  getStatus: () => Promise<any>;
  getAvailableProviders: () => Promise<string[]>;
  switchAIProvider: (provider: 'llama-cpp' | 'openai' | 'gemini') => Promise<any>;

  // Config API
  getConfig: () => Promise<any>;
  saveConfig: (config: Record<string, any>) => Promise<any>;

  // Chat API
  chat: (messages: Array<{ role: string; content: string }>) => Promise<any>;

  // Data API
  getStats: () => Promise<any>;
  cleanup: (days: number) => Promise<any>;
  getExecutionHistory: (limit?: number) => Promise<any>;

  // Legacy API
  execute: (suggestionId: string) => Promise<any>;
  getSuggestions: () => Promise<any>;
  setApiKey: (apiKey: string) => Promise<any>;

  // Event listeners (所有事件监听器返回清理函数)
  onIntents: (callback: (intents: any[]) => void) => (() => void);
  onPlan: (callback: (plan: any) => void) => (() => void);
  onExecutionProgress: (callback: (data: any) => void) => (() => void);
  onExecutionCompleted: (callback: (execution: any) => void) => (() => void);
  onHawkeyeReady: (callback: (status: any) => void) => (() => void);
  onModuleReady: (callback: (module: string) => void) => (() => void);
  onAIProviderReady: (callback: (type: string) => void) => (() => void);
  onAIProviderError: (callback: (info: any) => void) => (() => void);
  onShowSettings: (callback: () => void) => (() => void);
  onLoading: (callback: (loading: boolean) => void) => (() => void);
  onError: (callback: (error: string) => void) => (() => void);
  onSuggestions: (callback: (suggestions: any[]) => void) => (() => void);

  // App update API
  checkForUpdates: () => Promise<any>;
  getAppVersion: () => Promise<string>;

  // Smart observe API
  startSmartObserve: () => Promise<any>;
  stopSmartObserve: () => Promise<any>;
  getSmartObserveStatus: () => Promise<any>;
  toggleSmartObserve: () => Promise<any>;
  onSmartObserveStatus: (callback: (data: any) => void) => (() => void);
  onSmartObserveChangeDetected: (callback: () => void) => (() => void);
  getScreenshot: () => Promise<string>;
  getLastContext: () => Promise<any>;
  onScreenshotPreview: (callback: (data: any) => void) => (() => void);

  // Local Model Management API
  modelGetDirectory: () => Promise<string>;
  modelList: () => Promise<LocalModel[]>;
  modelDownloadHF: (modelId: string, fileName?: string) => Promise<any>;
  modelCancelDownload: (modelId: string, fileName?: string) => Promise<any>;
  modelDelete: (modelPath: string) => Promise<any>;
  modelGetRecommended: () => Promise<RecommendedModel[]>;
  modelExists: (modelPath: string) => Promise<boolean>;
  onModelDownloadProgress: (callback: (progress: ModelDownloadProgress) => void) => (() => void);

  // Debug API
  debug: {
    getEvents: (filter?: any) => Promise<any[]>;
    getRecent: (count?: number) => Promise<any[]>;
    getSince: (timestamp: number) => Promise<any[]>;
    clearEvents: () => Promise<void>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    getStatus: () => Promise<any>;
    export: () => Promise<string>;
    updateConfig: (config: any) => Promise<void>;
  };

  // Life Tree API
  lifeTree: {
    getTree: () => Promise<any>;
    rebuild: () => Promise<any>;
    proposeExperiment: (nodeId: string, phase?: string) => Promise<any>;
    startExperiment: (nodeId: string, proposal: any, phase: string) => Promise<any>;
    concludeExperiment: (experimentNodeId: string, status: string) => Promise<any>;
    getUnlockedPhase: () => Promise<any>;
    getExperiments: () => Promise<any>;
    onTreeUpdated: (callback: (data: { updatedNodeIds: string[] }) => void) => (() => void);
  };

  // Activity Summary API (10分钟活动总结)
  activitySummary: {
    getRecent: (limit?: number) => Promise<any[]>;
    getRange: (startTime: number, endTime: number) => Promise<any[]>;
    generateNow: () => Promise<any>;
    getPendingUpdates: () => Promise<any[]>;
    markUpdated: (summaryId: string) => Promise<void>;
    isRunning: () => Promise<boolean>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<void>;
  };

  // Menu Bar Panel API
  menuBarPanel: {
    getState: () => Promise<any>;
    executeAction: (actionId: string) => Promise<any>;
    clearActivities: () => Promise<void>;
    onStateUpdate: (callback: (state: any) => void) => (() => void);
  };

  // Gesture Control API
  gestureControl: (event: {
    action: string;
    gesture: string;
    confidence: number;
    position?: { x: number; y: number };
    handedness?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  gestureControlStatus: () => Promise<{
    enabled: boolean;
    robotAvailable: boolean;
    screenBounds?: { width: number; height: number };
  }>;
  gestureControlSetEnabled: (enabled: boolean) => Promise<{ enabled: boolean }>;
  gestureControlUpdateConfig: (config: {
    cursorSensitivity?: number;
    clickHoldTime?: number;
    scrollSpeed?: number;
  }) => Promise<any>;
  onGestureControlScreenshot?: (callback: (data: { dataUrl: string; timestamp: number }) => void) => (() => void);
  onGestureControlToggleRecording?: (callback: () => void) => (() => void);
  onGestureControlPause?: (callback: () => void) => (() => void);
  onGestureControlQuickMenu?: (callback: () => void) => (() => void);

  // Whisper API
  whisperTranscribe: (audioBuffer: any) => Promise<string>;
  whisperStatus: () => Promise<any>;
  whisperCheckMic: () => Promise<string>;
  whisperRequestMic: () => Promise<boolean>;
  whisperResetModel: () => Promise<any>;
  whisperDownloadModel: () => Promise<any>;
  whisperModelInfo: () => Promise<any>;
  onWhisperSegment: (callback: (data: { text: string; timestamp: number }) => void) => (() => void);
  onWhisperDownloadProgress: (callback: (data: any) => void) => (() => void);

  // Adaptive Refresh API
  getAdaptiveRefreshStatus: () => Promise<any>;
  recordUserActivity: (type: string) => Promise<any>;
  onSmartObserveIntervalChanged: (callback: (data: any) => void) => (() => void);

  // Global Click API (WebGazer Calibration)
  globalClick: {
    start: () => Promise<{ success: boolean }>;
    stop: () => Promise<any>;
    status: () => Promise<any>;
    onEvent: (callback: (event: {
      x: number;
      y: number;
      button: number;
      timestamp: number;
      isInsideApp: boolean;
    }) => void) => (() => void);
  };

  // Audio Processor API
  audioProcessor: {
    start: () => Promise<any>;
    stop: () => Promise<any>;
    status: () => Promise<any>;
    process: (audioData: ArrayBuffer) => Promise<any>;
    onStatusChange: (callback: (status: any) => void) => (() => void);
    onProcessed: (callback: (data: any) => void) => (() => void);
  };

  // Sherpa-ONNX Voice Engine API
  sherpaOnnx: {
    getStatus: () => Promise<any>;
    initialize: (options?: any) => Promise<any>;
    shutdown: () => Promise<any>;
    downloadModel: (modelId: string) => Promise<any>;
    getModels: () => Promise<any>;
    startStreaming: () => Promise<any>;
    stopStreaming: () => Promise<any>;
    feedAudio: (audioData: ArrayBuffer) => Promise<any>;
    onTranscript: (callback: (data: any) => void) => (() => void);
    onSpeechStart: (callback: () => void) => (() => void);
    onSpeechEnd: (callback: () => void) => (() => void);
    onDownloadProgress: (callback: (data: any) => void) => (() => void);
    wakeWord: {
      start: () => Promise<any>;
      stop: () => Promise<any>;
      configure: (config: any) => Promise<any>;
      status: () => Promise<any>;
      onDetected: (callback: (data: any) => void) => (() => void);
    };
    tts: {
      speak: (text: string, options?: any) => Promise<any>;
      stop: () => Promise<any>;
      skip: () => Promise<any>;
      pause: () => Promise<any>;
      resume: () => Promise<any>;
      configure: (config: any) => Promise<any>;
      onPlaybackDone: (callback: () => void) => (() => void);
    };
    speaker: {
      register: (name: string, audioData: ArrayBuffer) => Promise<any>;
      identify: (audioData: ArrayBuffer) => Promise<any>;
    };
  };
}

declare global {
  interface Window {
    hawkeye: HawkeyeAPI;
  }
}
