/**
 * Type declarations for Hawkeye Desktop
 * More permissive types to match runtime behavior
 */

// Declare @hawkeye/core module types
declare module '@hawkeye/core' {
  // AI Provider configuration
  interface AIProviderConfig {
    type: string;
    host?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    [key: string]: any;
  }

  // Main Hawkeye config
  export interface HawkeyeConfig {
    aiProvider?: string;
    ai?: {
      providers?: AIProviderConfig[];
      preferredProvider?: string;
      enableFailover?: boolean;
      [key: string]: any;
    };
    geminiApiKey?: string;
    geminiModel?: string;
    openaiBaseUrl?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    localOnly?: boolean;
    storageDir?: string;
    sync?: {
      port?: number;
      [key: string]: any;
    };
    autoStartSync?: boolean;
    [key: string]: any;
  }

  export interface HawkeyeStatus {
    initialized: boolean;
    aiReady: boolean;
    aiProvider: string | null;
    syncRunning: boolean;
    syncPort: number | null;
    connectedClients: number;
    behaviorTracking: boolean;
    memoryEnabled: boolean;
    dashboardEnabled: boolean;
    workflowEnabled: boolean;
    pluginsEnabled: boolean;
    loadedPlugins: number;
    autonomousEnabled: boolean;
    activeSuggestions: number;
    [key: string]: any;
  }

  export interface UserIntent {
    id: string;
    type: string;
    description: string;
    confidence: number;
    originalText?: string;
    summary?: string;
    entities?: Array<{
      type: string;
      value: string;
      confidence: number;
    }>;
    context?: {
      reason?: string;
      [key: string]: any;
    };
  }

  export interface ExecutionPlan {
    id: string;
    steps: Array<{
      id: string;
      description: string;
      action: string;
      params?: Record<string, any>;
    }>;
    [key: string]: any;
  }

  // EventCollector interface for debug events
  export interface EventCollector {
    addScreenshot(data: any): any;
    addOCR(data: any): any;
    addClipboard(data: any): any;
    addWindow(data: any): any;
    addFile(data: any): any;
    addLLMInput(data: any): any;
    addLLMOutput(data: any, parentId?: string): any;
    addIntent(data: any): any;
    addPlan(data: any): any;
    addExecutionStart(data: any): any;
    addExecutionStep(data: any): any;
    addExecutionComplete(data: any): any;
    addError(data: any): any;
    getAll(): any[];
    getFiltered(filter?: any): any[];
    getRecent(count?: number): any[];
    getSince(timestamp: number): any[];
    getTotalCount(): number;
    getCount(): number;
    clear(): void;
    isPaused(): boolean;
    pause(): void;
    resume(): void;
    getConfig(): any;
    exportJSON(): string;
    updateConfig(config: any): void;
  }

  // MCP Tool types
  export interface MCPTool {
    name: string;
    description: string;
    inputSchema?: Record<string, any>;
    outputSchema?: Record<string, any>;
    permissions?: Array<{
      scope: 'global' | 'project' | 'session';
      level: 'read' | 'write' | 'execute';
      domains?: string[];
    }>;
    execute: (input: any, context?: any) => Promise<ToolResult>;
  }

  export interface ToolResult {
    content: Array<{
      type: 'text' | 'image' | 'resource';
      text?: string;
      data?: string;
      mimeType?: string;
      uri?: string;
    }>;
    isError?: boolean;
  }

  export class ToolRegistry {
    registerTool(tool: MCPTool): void;
    getTool(name: string): MCPTool | undefined;
    getAllTools(): MCPTool[];
    removeTool(name: string): boolean;
    executeTool(name: string, input: any): Promise<ToolResult>;
  }

  export class Hawkeye {
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    getStatus(): HawkeyeStatus;
    isInitialized: boolean;
    setScreenCaptureCallback(callback: () => Promise<string>): void;
    analyzeScreen(screenshot: string): Promise<any>;
    perceiveAndRecognize(): Promise<any>;
    processNaturalLanguage(text: string, context?: Record<string, any>): Promise<{
      intents: UserIntent[];
      plan: ExecutionPlan | null;
    }>;
    getCurrentIntents(): UserIntent[];
    getCurrentPlan(): ExecutionPlan | null;
    generatePlan(intent: UserIntent): Promise<ExecutionPlan>;
    executePlan(plan: ExecutionPlan): Promise<any>;
    pauseExecution(planId?: string): boolean;
    resumeExecution(planId?: string): void;
    cancelExecution(planId?: string): boolean;
    provideIntentFeedback(intentId: string, feedback: any): void;
    switchAIProvider(provider: string): Promise<void>;
    getAvailableProviders(): string[];
    chat(message: string): Promise<any>;
    getDatabaseStats(): Promise<any>;
    cleanupOldData(days: number): Promise<void>;
    getExecutionHistory(limit?: number): Promise<any[]>;
    getEventCollector(): EventCollector;
    getToolRegistry(): ToolRegistry;
    on(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
  }

  export function createHawkeye(config: HawkeyeConfig): Hawkeye;
  export function getHawkeye(): Hawkeye | null;

  // Built-in tools
  export const WebSearchTool: MCPTool;

  // A2UI types - using 'any' for flexible card content
  export type A2UIIcon = string;

  export interface A2UIAction {
    id: string;
    label: string;
    type?: string;
    icon?: string;
    tooltip?: string;
    disabled?: boolean;
    loading?: boolean;
    shortcut?: string;
    [key: string]: any;
  }

  export interface A2UIInputConfig {
    type?: 'text' | 'checkbox';
    label?: string;
    placeholder?: string;
    expectedValue?: string;
  }

  // Base card with flexible content
  export interface A2UICard {
    id: string;
    type: string;
    title?: string;
    description?: string;
    content?: any;
    icon?: string;
    confidence?: number;
    status?: string;
    warningLevel?: string;
    progress?: number;
    currentStep?: string;
    actions: A2UIAction[];
    details?: string[];
    requiresInput?: A2UIInputConfig | boolean;
    requiresCheckbox?: boolean;
    metadata?: Record<string, any>;
    [key: string]: any;
  }

  // Specific card types - extending base with 'any' for flexibility
  export interface A2UISuggestionCard extends A2UICard {
    type: 'suggestion';
  }

  export interface A2UIPreviewCard extends A2UICard {
    type: 'preview';
  }

  export interface A2UIResultCard extends A2UICard {
    type: 'result';
    status: 'success' | 'partial' | 'failed' | 'cancelled';
  }

  export interface A2UIConfirmationCard extends A2UICard {
    type: 'confirmation';
    warningLevel: 'info' | 'warning' | 'danger';
  }

  export interface A2UIProgressCard extends A2UICard {
    type: 'progress';
  }

  export interface QuickAction {
    id: string;
    icon: string;
    label: string;
    description?: string;
    shortcut?: string;
    category?: string;
    onClick?: () => void;
    [key: string]: any;
  }

  export interface SuggestedAction {
    id: string;
    type: string;
    title: string;
    description?: string;
    confidence?: number;
    icon?: string;
    category?: string;
    parameters?: Record<string, any>;
    [key: string]: any;
  }

  export type SuggestionType =
    | 'file_operation'
    | 'command'
    | 'workflow'
    | 'automation'
    | 'info'
    | 'custom'
    | string;

  export interface A2UIEngine {
    getCards(): A2UICard[];
    addCard(card: A2UICard): void;
    removeCard(id: string): void;
    clearCards(): void;
    on(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
  }

  export function createA2UIEngine(config?: Record<string, any>): A2UIEngine;
  export function getA2UIEngine(): A2UIEngine | null;
}

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
