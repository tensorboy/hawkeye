/**
 * Shared type definitions for the Hawkeye desktop package.
 * Single source of truth for types used across main, preload, and renderer processes.
 */

// ============ Domain Types ============

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

export interface ExecutionHistoryItem {
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

export interface HawkeyeStatus {
  initialized: boolean;
  aiReady: boolean;
  aiProvider: string | null;
  syncRunning: boolean;
  syncPort: number | null;
  connectedClients: number;
}

// ============ Config Types ============

export interface AppConfig {
  aiProvider: 'llama-cpp' | 'gemini' | 'openai';
  // LlamaCpp config
  llamaCppModelPath?: string;
  llamaCppContextSize?: number;
  llamaCppGpuLayers?: number;
  llamaCppGpuAcceleration?: 'metal' | 'cuda' | 'auto' | 'disabled';
  // Gemini config
  geminiApiKey?: string;
  geminiModel?: string;
  geminiBaseUrl?: string;
  // OpenAI config
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  // General config
  syncPort: number;
  autoStartSync: boolean;
  autoUpdate: boolean;
  localOnly: boolean;
  hasGemini: boolean;
  smartObserve: boolean;
  smartObserveInterval: number;
  smartObserveThreshold: number;
  onboardingCompleted?: boolean;
  // Whisper config
  whisperEnabled?: boolean;
  whisperModelPath?: string;
  whisperLanguage?: string;
  // Skill configs
  tavilyApiKey?: string;
}

// ============ Chat Types ============

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ============ Model Types ============

export interface LocalModel {
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  modifiedAt: Date;
  quantization?: string;
}

export interface ModelDownloadProgress {
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

export interface RecommendedModel {
  id: string;
  name: string;
  description: string;
  type: 'text' | 'vision';
  size: string;
  quantization: string;
  fileName: string;
}

/** Simplified model info used in the renderer UI */
export interface InstalledModel {
  name: string;
  id: string;
  size: string;
  modified: string;
}

/** Simplified download progress used in the renderer UI */
export interface ModelPullProgress {
  model: string;
  progress: number;
  output: string;
  isDownloading: boolean;
}
