/**
 * Chrome Extension Types
 */

// ============ Intent Types ============

export interface UserIntent {
  id: string;
  type: string;
  description: string;
  confidence: number;
  entities?: IntentEntity[];
  source?: 'screen' | 'clipboard' | 'file' | 'manual';
}

export interface IntentEntity {
  type: string;
  value: string;
  confidence?: number;
}

// ============ Plan Types ============

export interface ExecutionPlan {
  id: string;
  title: string;
  description: string;
  steps: PlanStep[];
  pros: string[];
  cons: string[];
  alternatives?: PlanAlternative[];
  impact: PlanImpact;
}

export interface PlanStep {
  order: number;
  description: string;
  actionType: string;
  params?: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high';
  reversible?: boolean;
}

export interface PlanAlternative {
  description: string;
  difference: string;
}

export interface PlanImpact {
  filesAffected: number;
  systemChanges: boolean;
  requiresNetwork: boolean;
  fullyReversible: boolean;
}

// ============ Execution Types ============

export interface ExecutionProgress {
  executionId: string;
  currentStep: number;
  totalSteps: number;
  stepDescription: string;
  progress: number;
}

export interface ExecutionResult {
  executionId: string;
  planId: string;
  status: 'completed' | 'failed' | 'cancelled';
  duration: number;
  results: StepResult[];
}

export interface StepResult {
  stepOrder: number;
  success: boolean;
  output?: string;
  error?: string;
}

// ============ Legacy Types (for backward compatibility) ============

export interface TaskSuggestion {
  id: string;
  title: string;
  description: string;
  type: 'navigate' | 'extract' | 'summarize' | 'search' | 'action';
  confidence: number;
  timestamp: number;
  actions?: TaskAction[];
}

export interface TaskAction {
  type: string;
  params: Record<string, unknown>;
}

export interface PageContext {
  url: string;
  title: string;
  content: string;
  selection?: string;
  meta?: Record<string, string>;
}

// ============ Sync Message Types ============

export type SyncMessageType =
  | 'auth'
  | 'auth_success'
  | 'auth_failed'
  | 'heartbeat'
  | 'pong'
  | 'context_update'
  | 'context_request'
  | 'intent_detected'
  | 'intent_feedback'
  | 'plan_generated'
  | 'plan_confirm'
  | 'plan_reject'
  | 'execution_start'
  | 'execution_progress'
  | 'execution_completed'
  | 'execution_failed'
  | 'execution_pause'
  | 'execution_resume'
  | 'execution_cancel'
  | 'status'
  | 'status_request'
  | 'error';

export interface SyncMessage<T = unknown> {
  type: SyncMessageType;
  payload: T;
  timestamp: number;
  source: 'desktop' | 'extension' | 'web' | 'vscode';
  id?: string;
}

// ============ Config Types ============

export interface ExtensionConfig {
  // Connection mode
  connectionMode: 'desktop' | 'standalone';

  // Desktop connection
  desktopHost: string;
  desktopPort: number;

  // Standalone mode (fallback when Desktop not available)
  aiProvider: 'gemini' | 'openai';
  geminiApiKey?: string;
  geminiModel?: string;

  // UI preferences
  showFloatingButton: boolean;
  enableNotifications: boolean;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  connectionMode: 'desktop',
  desktopHost: 'localhost',
  desktopPort: 9527,
  aiProvider: 'gemini',
  showFloatingButton: false,
  enableNotifications: true,
};
