/**
 * Hawkeye VS Code Extension - Types
 */

export interface UserIntent {
  id: string;
  type: string;
  description: string;
  confidence: number;
  entities?: Array<{ type: string; value: string }>;
  source?: 'screen' | 'clipboard' | 'file' | 'manual';
}

export interface PlanStep {
  order: number;
  description: string;
  actionType: string;
  parameters?: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high';
  estimatedDuration?: number;
}

export interface PlanImpact {
  filesAffected: number;
  systemChanges: boolean;
  requiresNetwork: boolean;
  fullyReversible: boolean;
}

export interface ExecutionPlan {
  id: string;
  title: string;
  description: string;
  steps: PlanStep[];
  pros: string[];
  cons: string[];
  impact: PlanImpact;
}

export interface ExecutionProgress {
  executionId: string;
  currentStep: number;
  totalSteps: number;
  stepDescription: string;
  progress: number;
}

export interface SyncMessage {
  type: string;
  payload: unknown;
  timestamp: number;
  source: 'desktop' | 'extension';
}

export interface ExtensionConfig {
  connectionMode: 'desktop' | 'standalone';
  desktopHost: string;
  desktopPort: number;
  enableNotifications: boolean;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  connectionMode: 'desktop',
  desktopHost: 'localhost',
  desktopPort: 9527,
  enableNotifications: true,
};
