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
}

declare global {
  interface Window {
    hawkeye: HawkeyeAPI;
  }
}
