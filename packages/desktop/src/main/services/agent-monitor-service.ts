/**
 * Agent Monitor Service
 * Tracks agent execution, detects interruptions, and enforces safety limits
 * Inspired by Anthropic Computer Use safety patterns and CodeLooper
 */

import { EventEmitter } from 'events';
import { globalShortcut } from 'electron';

export interface AgentTask {
  id: string;
  name: string;
  startTime: number;
  estimatedDuration?: number;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
  error?: string;
  actions: AgentAction[];
}

export interface AgentAction {
  id: string;
  type: 'click' | 'type' | 'scroll' | 'key' | 'screenshot' | 'analyze' | 'other';
  timestamp: number;
  details: string;
  success: boolean;
  duration?: number;
}

export interface SafetyLimits {
  /** Maximum execution time in milliseconds */
  maxExecutionTime: number;
  /** Maximum number of actions per task */
  maxActionsPerTask: number;
  /** Maximum consecutive failures before stopping */
  maxConsecutiveFailures: number;
  /** Minimum delay between actions in milliseconds */
  minActionDelay: number;
  /** Enable user interruption detection */
  enableInterruptionDetection: boolean;
  /** Maximum cost (AI tokens/API calls) per task. 0 = unlimited */
  maxCostPerTask: number;
  /** Maximum actions per minute (rate limiting). 0 = unlimited */
  maxActionsPerMinute: number;
  /** Sandbox mode - blocks destructive system operations */
  sandboxMode: boolean;
  /** Actions that require user confirmation before executing */
  requireConfirmation: string[];
  /** Actions that are completely blocked */
  blockedActions: string[];
}

/** Risk level classification for actions */
export type ActionRiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

/** Dangerous action patterns */
export interface DangerousActionPattern {
  pattern: string | RegExp;
  riskLevel: ActionRiskLevel;
  description: string;
}

/** Cost tracking for a task */
export interface TaskCostTracker {
  apiCalls: number;
  tokensUsed: number;
  estimatedCost: number;
}

export interface MonitorConfig {
  safetyLimits?: Partial<SafetyLimits>;
  debugLog?: (msg: string) => void;
}

const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxExecutionTime: 5 * 60 * 1000, // 5 minutes
  maxActionsPerTask: 100,
  maxConsecutiveFailures: 3,
  minActionDelay: 100, // 100ms
  enableInterruptionDetection: true,
  maxCostPerTask: 0,        // unlimited by default
  maxActionsPerMinute: 60,  // 1 action per second avg
  sandboxMode: false,
  requireConfirmation: [
    'delete_file', 'format_disk', 'sudo', 'admin',
    'install_software', 'system_settings', 'send_email',
  ],
  blockedActions: [
    'format_disk', 'rm_rf_root', 'drop_database',
  ],
};

/**
 * Default dangerous action patterns for risk classification
 * Referenced from agent-scripts safety patterns
 */
const DANGEROUS_PATTERNS: DangerousActionPattern[] = [
  { pattern: /rm\s+-rf\s+\//, riskLevel: 'critical', description: 'Recursive delete from root' },
  { pattern: /rm\s+-rf/, riskLevel: 'high', description: 'Recursive force delete' },
  { pattern: /sudo\s+/, riskLevel: 'high', description: 'Superuser command' },
  { pattern: /mkfs|format\s+/, riskLevel: 'critical', description: 'Disk format' },
  { pattern: /DROP\s+(DATABASE|TABLE)/i, riskLevel: 'critical', description: 'Database drop' },
  { pattern: /DELETE\s+FROM\s+\w+\s*(;|$)/i, riskLevel: 'high', description: 'DELETE without WHERE clause' },
  { pattern: /chmod\s+777/, riskLevel: 'medium', description: 'Open permissions' },
  { pattern: /curl.*\|\s*(sh|bash)/, riskLevel: 'high', description: 'Pipe download to shell' },
  { pattern: /eval\s*\(/, riskLevel: 'medium', description: 'Dynamic code execution' },
  { pattern: /shutdown|reboot|halt/, riskLevel: 'high', description: 'System shutdown/reboot' },
  { pattern: /kill\s+-9/, riskLevel: 'medium', description: 'Force kill process' },
  { pattern: /npm\s+publish/, riskLevel: 'medium', description: 'Package publish' },
  { pattern: /git\s+push\s+.*--force/, riskLevel: 'high', description: 'Force push' },
];

/**
 * Monitors agent execution and enforces safety constraints
 */
export class AgentMonitorService extends EventEmitter {
  private currentTask: AgentTask | null = null;
  private taskHistory: AgentTask[] = [];
  private safetyLimits: SafetyLimits;
  private debugLog: (msg: string) => void;
  private executionTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private isPaused = false;
  private interruptionShortcut = 'Escape';
  private costTracker: TaskCostTracker = { apiCalls: 0, tokensUsed: 0, estimatedCost: 0 };
  private actionTimestamps: number[] = []; // for rate limiting
  private dangerousPatterns: DangerousActionPattern[] = [...DANGEROUS_PATTERNS];

  constructor(config: MonitorConfig = {}) {
    super();
    this.safetyLimits = { ...DEFAULT_SAFETY_LIMITS, ...config.safetyLimits };
    this.debugLog = config.debugLog || (() => {});
  }

  /**
   * Initialize the monitor
   */
  initialize(): void {
    // Register interruption shortcut
    if (this.safetyLimits.enableInterruptionDetection) {
      this.registerInterruptionShortcut();
    }
    this.debugLog('Agent monitor initialized');
  }

  /**
   * Register global shortcut for interruption
   */
  private registerInterruptionShortcut(): void {
    try {
      // Use Escape key for interruption during execution
      globalShortcut.register(this.interruptionShortcut, () => {
        if (this.currentTask && this.currentTask.status === 'running') {
          this.debugLog('User interruption detected (Escape key)');
          this.cancelCurrentTask('User interruption');
        }
      });
    } catch (error) {
      this.debugLog(`Failed to register interruption shortcut: ${error}`);
    }
  }

  /**
   * Start monitoring a new task
   */
  startTask(name: string, estimatedDuration?: number): AgentTask {
    // Complete any existing task first
    if (this.currentTask && this.currentTask.status === 'running') {
      this.completeTask(false, 'New task started');
    }

    const task: AgentTask = {
      id: this.generateId(),
      name,
      startTime: Date.now(),
      estimatedDuration,
      status: 'running',
      actions: [],
    };

    this.currentTask = task;
    this.consecutiveFailures = 0;
    this.isPaused = false;
    this.resetCostTracker();

    // Set up execution timeout
    this.executionTimer = setTimeout(() => {
      if (this.currentTask?.status === 'running') {
        this.debugLog(`Task ${task.id} exceeded max execution time`);
        this.cancelCurrentTask('Execution timeout');
      }
    }, this.safetyLimits.maxExecutionTime);

    this.emit('taskStarted', task);
    this.debugLog(`Task started: ${name} (${task.id})`);

    return task;
  }

  /**
   * Record an action within the current task
   */
  recordAction(
    type: AgentAction['type'],
    details: string,
    success: boolean,
    duration?: number
  ): AgentAction | null {
    if (!this.currentTask || this.currentTask.status !== 'running') {
      this.debugLog('Cannot record action: no running task');
      return null;
    }

    // Safety check before recording
    const safetyCheck = this.checkAction(type, details);
    if (!safetyCheck.allowed) {
      this.debugLog(`Action blocked: ${safetyCheck.reason} (${details})`);
      this.emit('actionBlocked', { type, details, reason: safetyCheck.reason, riskLevel: safetyCheck.riskLevel });
      return null;
    }

    if (safetyCheck.requiresConfirmation) {
      this.emit('actionNeedsConfirmation', { type, details, riskLevel: safetyCheck.riskLevel });
    }

    const action: AgentAction = {
      id: this.generateId(),
      type,
      timestamp: Date.now(),
      details,
      success,
      duration,
    };

    this.currentTask.actions.push(action);

    // Track consecutive failures
    if (!success) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.safetyLimits.maxConsecutiveFailures) {
        this.debugLog('Max consecutive failures reached');
        this.cancelCurrentTask('Too many consecutive failures');
        return action;
      }
    } else {
      this.consecutiveFailures = 0;
    }

    // Check action limit
    if (this.currentTask.actions.length >= this.safetyLimits.maxActionsPerTask) {
      this.debugLog('Max actions per task reached');
      this.cancelCurrentTask('Action limit reached');
      return action;
    }

    this.emit('actionRecorded', action, this.currentTask);
    return action;
  }

  /**
   * Complete the current task
   */
  completeTask(success: boolean = true, message?: string): void {
    if (!this.currentTask) return;

    this.currentTask.status = success ? 'completed' : 'failed';
    if (!success && message) {
      this.currentTask.error = message;
    }

    this.clearExecutionTimer();
    this.taskHistory.push(this.currentTask);

    // Keep history limited
    if (this.taskHistory.length > 100) {
      this.taskHistory = this.taskHistory.slice(-50);
    }

    this.emit('taskCompleted', this.currentTask, success);
    this.debugLog(
      `Task ${this.currentTask.status}: ${this.currentTask.name} (${this.currentTask.actions.length} actions)`
    );

    this.currentTask = null;
  }

  /**
   * Cancel the current task
   */
  cancelCurrentTask(reason: string): void {
    if (!this.currentTask || this.currentTask.status !== 'running') return;

    this.currentTask.status = 'cancelled';
    this.currentTask.error = reason;
    this.clearExecutionTimer();

    this.taskHistory.push(this.currentTask);
    this.emit('taskCancelled', this.currentTask, reason);
    this.debugLog(`Task cancelled: ${reason}`);

    this.currentTask = null;
  }

  /**
   * Pause execution
   */
  pause(): void {
    if (this.currentTask?.status === 'running') {
      this.isPaused = true;
      this.emit('executionPaused', this.currentTask);
      this.debugLog('Execution paused');
    }
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      this.emit('executionResumed', this.currentTask);
      this.debugLog('Execution resumed');
    }
  }

  /**
   * Check if execution should continue
   */
  shouldContinue(): boolean {
    if (!this.currentTask) return false;
    if (this.currentTask.status !== 'running') return false;
    if (this.isPaused) return false;
    return true;
  }

  /**
   * Get minimum delay before next action
   */
  getMinActionDelay(): number {
    return this.safetyLimits.minActionDelay;
  }

  /**
   * Get current task info
   */
  getCurrentTask(): AgentTask | null {
    return this.currentTask ? { ...this.currentTask } : null;
  }

  /**
   * Get task history
   */
  getTaskHistory(): AgentTask[] {
    return [...this.taskHistory];
  }

  /**
   * Get execution statistics
   */
  getStatistics(): {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    cancelledTasks: number;
    totalActions: number;
    averageActionsPerTask: number;
    averageExecutionTime: number;
  } {
    const completed = this.taskHistory.filter((t) => t.status === 'completed');
    const failed = this.taskHistory.filter((t) => t.status === 'failed');
    const cancelled = this.taskHistory.filter((t) => t.status === 'cancelled');
    const totalActions = this.taskHistory.reduce((sum, t) => sum + t.actions.length, 0);

    const executionTimes = this.taskHistory.map((t) => {
      const lastAction = t.actions[t.actions.length - 1];
      return lastAction ? lastAction.timestamp - t.startTime : 0;
    });
    const averageExecutionTime =
      executionTimes.length > 0
        ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
        : 0;

    return {
      totalTasks: this.taskHistory.length,
      completedTasks: completed.length,
      failedTasks: failed.length,
      cancelledTasks: cancelled.length,
      totalActions,
      averageActionsPerTask: this.taskHistory.length > 0 ? totalActions / this.taskHistory.length : 0,
      averageExecutionTime,
    };
  }

  /**
   * Update safety limits
   */
  updateSafetyLimits(limits: Partial<SafetyLimits>): void {
    this.safetyLimits = { ...this.safetyLimits, ...limits };
    this.debugLog(`Safety limits updated: ${JSON.stringify(limits)}`);
  }

  /**
   * Get current safety limits
   */
  getSafetyLimits(): SafetyLimits {
    return { ...this.safetyLimits };
  }

  // ============ Enhanced Safety Guardrails ============

  /**
   * Classify the risk level of an action
   */
  classifyActionRisk(actionDetails: string): ActionRiskLevel {
    for (const pattern of this.dangerousPatterns) {
      const regex = pattern.pattern instanceof RegExp
        ? pattern.pattern
        : new RegExp(pattern.pattern, 'i');
      if (regex.test(actionDetails)) {
        return pattern.riskLevel;
      }
    }
    return 'safe';
  }

  /**
   * Check if an action is allowed under current safety config
   * Returns { allowed, reason, requiresConfirmation, riskLevel }
   */
  checkAction(actionType: string, actionDetails: string): {
    allowed: boolean;
    reason?: string;
    requiresConfirmation: boolean;
    riskLevel: ActionRiskLevel;
  } {
    const riskLevel = this.classifyActionRisk(actionDetails);

    // Blocked actions are never allowed
    if (this.safetyLimits.blockedActions.some(b =>
      actionType.includes(b) || actionDetails.toLowerCase().includes(b)
    )) {
      return { allowed: false, reason: 'Action is blocked by safety policy', requiresConfirmation: false, riskLevel: 'critical' };
    }

    // Sandbox mode blocks high-risk actions
    if (this.safetyLimits.sandboxMode && (riskLevel === 'high' || riskLevel === 'critical')) {
      return { allowed: false, reason: `Sandbox mode blocks ${riskLevel}-risk actions`, requiresConfirmation: false, riskLevel };
    }

    // Rate limit check
    if (!this.checkRateLimit()) {
      return { allowed: false, reason: 'Rate limit exceeded', requiresConfirmation: false, riskLevel };
    }

    // Cost limit check
    if (this.safetyLimits.maxCostPerTask > 0 && this.costTracker.estimatedCost >= this.safetyLimits.maxCostPerTask) {
      return { allowed: false, reason: 'Cost limit exceeded', requiresConfirmation: false, riskLevel };
    }

    // Confirmation required?
    const needsConfirmation = riskLevel === 'high' || riskLevel === 'critical' ||
      this.safetyLimits.requireConfirmation.some(rc =>
        actionType.includes(rc) || actionDetails.toLowerCase().includes(rc)
      );

    return { allowed: true, requiresConfirmation: needsConfirmation, riskLevel };
  }

  /**
   * Record cost for an AI API call
   */
  recordCost(apiCalls: number = 1, tokensUsed: number = 0, estimatedCost: number = 0): void {
    this.costTracker.apiCalls += apiCalls;
    this.costTracker.tokensUsed += tokensUsed;
    this.costTracker.estimatedCost += estimatedCost;
    this.emit('costUpdated', { ...this.costTracker });
  }

  /**
   * Get current cost tracker
   */
  getCostTracker(): TaskCostTracker {
    return { ...this.costTracker };
  }

  /**
   * Add a custom dangerous pattern
   */
  addDangerousPattern(pattern: DangerousActionPattern): void {
    this.dangerousPatterns.push(pattern);
  }

  /**
   * Check rate limit (actions per minute)
   */
  private checkRateLimit(): boolean {
    if (this.safetyLimits.maxActionsPerMinute <= 0) return true;

    const now = Date.now();
    const oneMinuteAgo = now - 60_000;

    // Clean old timestamps
    this.actionTimestamps = this.actionTimestamps.filter(t => t > oneMinuteAgo);

    if (this.actionTimestamps.length >= this.safetyLimits.maxActionsPerMinute) {
      return false;
    }

    this.actionTimestamps.push(now);
    return true;
  }

  /**
   * Toggle sandbox mode
   */
  setSandboxMode(enabled: boolean): void {
    this.safetyLimits.sandboxMode = enabled;
    this.emit('sandboxModeChanged', enabled);
    this.debugLog(`Sandbox mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get sandbox mode status
   */
  isSandboxMode(): boolean {
    return this.safetyLimits.sandboxMode;
  }

  /**
   * Reset cost tracker (called when starting new task)
   */
  private resetCostTracker(): void {
    this.costTracker = { apiCalls: 0, tokensUsed: 0, estimatedCost: 0 };
    this.actionTimestamps = [];
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.clearExecutionTimer();
    if (this.safetyLimits.enableInterruptionDetection) {
      try {
        globalShortcut.unregister(this.interruptionShortcut);
      } catch {
        // Ignore
      }
    }
    this.removeAllListeners();
    this.debugLog('Agent monitor destroyed');
  }

  private clearExecutionTimer(): void {
    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
      this.executionTimer = null;
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default AgentMonitorService;
