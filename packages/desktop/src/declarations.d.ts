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
    ollamaHost?: string;
    ollamaModel?: string;
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
    aiProviderConnected: boolean;
    [key: string]: any;
  }

  export interface UserIntent {
    id: string;
    type: string;
    description: string;
    confidence: number;
    originalText?: string;
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
    on(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
  }

  export function createHawkeye(config: HawkeyeConfig): Hawkeye;
  export function getHawkeye(): Hawkeye | null;

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
