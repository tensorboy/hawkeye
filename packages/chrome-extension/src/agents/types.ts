/**
 * Agent Types — Multi-agent orchestration for browser automation
 *
 * Roles:
 * - System: Internal messages (status, errors)
 * - User: Human input (text, voice)
 * - Planner: Decomposes tasks into steps
 * - Navigator: Executes browser actions
 * - Validator: Verifies step outcomes
 */

// ============================================================================
// Agent Roles & Events
// ============================================================================

export type AgentRole = 'system' | 'user' | 'planner' | 'navigator' | 'validator';

export interface AgentEvent {
  id: string;
  sessionId: string;
  role: AgentRole;
  type: AgentEventType;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type AgentEventType =
  | 'message'        // Text message
  | 'plan'           // Plan created by planner
  | 'step_start'     // Navigator starting a step
  | 'step_complete'  // Navigator completed a step
  | 'step_failed'    // Navigator failed a step
  | 'validation'     // Validator result
  | 'action'         // Browser action being taken
  | 'thinking'       // Agent is processing
  | 'error'          // Error occurred
  | 'status'         // Status update
  | 'user_input'     // User provided input
  | 'confirmation'   // Needs user confirmation
  | 'completion';    // Task completed

// ============================================================================
// Task & Plan
// ============================================================================

export interface AgentTask {
  id: string;
  sessionId: string;
  description: string;
  url?: string;
  createdAt: number;
  status: TaskStatus;
  plan?: AgentPlan;
  result?: TaskResult;
}

export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'planned'
  | 'executing'
  | 'paused'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentPlan {
  id: string;
  taskId: string;
  steps: PlanStep[];
  estimatedDurationMs: number;
  confidence: number;
  createdAt: number;
}

export interface PlanStep {
  id: string;
  order: number;
  description: string;
  actionType: StepActionType;
  selector?: string;
  value?: string;
  url?: string;
  expectedOutcome?: string;
  status: StepStatus;
  result?: StepResult;
}

export type StepActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'scroll'
  | 'wait'
  | 'extract'
  | 'verify'
  | 'custom';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface StepResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
  screenshot?: string;
}

export interface TaskResult {
  success: boolean;
  data: Record<string, unknown>;
  summary: string;
  completedSteps: number;
  totalSteps: number;
  durationMs: number;
}

// ============================================================================
// Chat Session
// ============================================================================

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  events: AgentEvent[];
  activeTask?: AgentTask;
  /** URL where session was started */
  originUrl?: string;
  /** Whether session is archived */
  archived: boolean;
}

// ============================================================================
// Page Context
// ============================================================================

export interface PageSnapshot {
  url: string;
  title: string;
  /** Simplified DOM structure */
  domSummary?: string;
  /** Visible text excerpt */
  textExcerpt?: string;
  /** Interactive elements */
  interactiveElements?: InteractiveElement[];
  timestamp: number;
}

export interface InteractiveElement {
  tag: string;
  role?: string;
  text?: string;
  selector: string;
  type?: string;
  href?: string;
  visible: boolean;
}

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentConfig {
  /** AI provider to use for planning */
  aiProvider: 'gemini' | 'openai' | 'anthropic' | 'desktop-proxy';
  /** API key (if using direct provider) */
  apiKey?: string;
  /** Maximum steps per task */
  maxSteps: number;
  /** Timeout per step in ms */
  stepTimeoutMs: number;
  /** Whether to auto-execute plans or require confirmation */
  requireConfirmation: boolean;
  /** Whether to take screenshots at each step */
  screenshotOnStep: boolean;
  /** Chat history retention in days */
  historyRetentionDays: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  aiProvider: 'desktop-proxy',
  maxSteps: 20,
  stepTimeoutMs: 30_000,
  requireConfirmation: true,
  screenshotOnStep: false,
  historyRetentionDays: 30,
};

// ============================================================================
// Message Passing
// ============================================================================

/** Messages between side panel ↔ background */
export interface AgentMessage {
  type: AgentMessageType;
  payload: Record<string, unknown>;
  sessionId?: string;
  timestamp: number;
}

export type AgentMessageType =
  | 'start-task'
  | 'cancel-task'
  | 'pause-task'
  | 'resume-task'
  | 'confirm-plan'
  | 'reject-plan'
  | 'agent-event'
  | 'agent-custom-step'
  | 'get-sessions'
  | 'get-session'
  | 'delete-session'
  | 'get-config'
  | 'save-config'
  | 'page-snapshot'
  | 'task-progress'
  | 'voice-start'
  | 'voice-stop'
  | 'heartbeat'
  | 'heartbeat-ack';

// ============================================================================
// Helpers
// ============================================================================

/** Generate a unique ID */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/** Get role display info */
export function getRoleInfo(role: AgentRole): { label: string; icon: string; color: string } {
  const info: Record<AgentRole, { label: string; icon: string; color: string }> = {
    system: { label: 'System', icon: 'gear', color: '#6b7280' },
    user: { label: 'You', icon: 'user', color: '#3b82f6' },
    planner: { label: 'Planner', icon: 'map', color: '#8b5cf6' },
    navigator: { label: 'Navigator', icon: 'compass', color: '#10b981' },
    validator: { label: 'Validator', icon: 'check-circle', color: '#f59e0b' },
  };
  return info[role];
}
