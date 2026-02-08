/**
 * State Machine Executor
 *
 * Executes browser automation state machines with:
 * - Deterministic state transitions
 * - Action execution with retry
 * - Obstacle detection and pause/resume
 * - Event emission for UI updates
 * - Timeout handling per state and overall
 */

import { EventEmitter } from 'events';
import {
  StateMachineDefinition,
  AgentState,
  StateTransition,
  StateAction,
  AgentContext,
  ExecutionResult,
  ExecutionMetrics,
  DOMSnapshot,
  ChangeResult,
  ObstacleDefinition,
  ObstacleType,
  BrowserAgentConfig,
  DEFAULT_BROWSER_AGENT_CONFIG,
  BrowserAgentEvents,
} from './types';

/** Function to execute a browser action (injected dependency) */
export type BrowserActionExecutor = (action: StateAction, context: AgentContext) => Promise<boolean>;

/** Function to capture a DOM snapshot */
export type SnapshotCapture = (selectors?: string[]) => Promise<DOMSnapshot>;

/** Function to get current URL */
export type URLGetter = () => Promise<string>;

/** Function for LLM fallback (decide next action given page state) */
export type LLMFallbackFn = (pageContent: string, task: string, history: string[]) => Promise<StateAction | null>;

export class StateMachineExecutor extends EventEmitter {
  private config: BrowserAgentConfig;
  private isRunning = false;
  private isPaused = false;
  private currentContext: AgentContext | null = null;

  constructor(
    private browserAction: BrowserActionExecutor,
    private captureSnapshot: SnapshotCapture,
    private getUrl: URLGetter,
    private llmFallback?: LLMFallbackFn,
    config?: Partial<BrowserAgentConfig>
  ) {
    super();
    this.config = { ...DEFAULT_BROWSER_AGENT_CONFIG, ...config };
  }

  /**
   * Execute a state machine for a given task
   */
  async execute(
    machine: StateMachineDefinition,
    variables: Record<string, string>,
    taskDescription: string
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const metrics: ExecutionMetrics = {
      totalMs: 0,
      transitions: 0,
      llmFallbacks: 0,
      ruleMatches: 0,
      retries: 0,
      obstaclesEncountered: 0,
    };

    // Find initial state
    const initialState = machine.states.find(s => s.isInitial);
    if (!initialState) {
      return {
        success: false,
        finalState: 'none',
        data: {},
        metrics,
        error: `No initial state found in machine "${machine.id}"`,
        userActionRequired: false,
      };
    }

    // Build context
    const context: AgentContext = {
      taskDescription,
      taskType: machine.supportedTasks[0] || 'unknown',
      variables,
      currentUrl: await this.getUrl(),
      currentMachine: machine,
      currentStateId: initialState.id,
      stateHistory: [initialState.id],
      extractedData: {},
      llmFallbackCount: 0,
      transitionCount: 0,
      ruleMatchCount: 0,
      startedAt: startTime,
      maxExecutionMs: this.config.maxExecutionMs,
    };

    this.currentContext = context;
    this.isRunning = true;

    try {
      // Execute entry actions for initial state
      await this.executeEntryActions(initialState, context);

      // Main execution loop
      while (this.isRunning) {
        // Check timeout
        if (Date.now() - startTime > this.config.maxExecutionMs) {
          return this.buildResult(context, metrics, false, 'Execution timeout exceeded');
        }

        // Wait if paused (obstacle handling)
        while (this.isPaused) {
          await this.sleep(500);
          if (!this.isRunning) break;
        }

        if (!this.isRunning) break;

        const currentState = machine.states.find(s => s.id === context.currentStateId);
        if (!currentState) {
          return this.buildResult(context, metrics, false, `State "${context.currentStateId}" not found`);
        }

        // Check if we're in a final state
        if (currentState.isFinal) {
          return this.buildResult(context, metrics, true);
        }

        // Check for obstacles
        const snapshot = await this.captureSnapshot();
        const obstacle = this.detectObstacle(snapshot, machine.obstacles || []);
        if (obstacle) {
          metrics.obstaclesEncountered++;
          this.emit('obstacle-detected', {
            type: obstacle.type,
            message: obstacle.userMessage,
            requiresUser: obstacle.requiresUserAction,
          });

          if (obstacle.requiresUserAction) {
            this.emit('user-action-required', { obstacle, context });
            this.isPaused = true;
            continue;
          } else if (obstacle.dismissAction) {
            await this.executeAction(obstacle.dismissAction, context);
            this.emit('obstacle-resolved', { type: obstacle.type });
            await this.sleep(this.config.actionDelayMs);
            continue;
          }
        }

        // Find matching transition
        const transition = await this.findMatchingTransition(machine, currentState, snapshot, context);

        if (transition) {
          // Execute transition
          metrics.transitions++;
          context.transitionCount++;

          // Execute transition actions
          if (transition.actions) {
            for (const action of transition.actions) {
              await this.executeAction(action, context);
              await this.sleep(this.config.actionDelayMs);
            }
          }

          // Move to next state
          const prevStateId = context.currentStateId;
          context.currentStateId = transition.to;
          context.stateHistory.push(transition.to);
          context.currentUrl = await this.getUrl();

          this.emit('state-changed', {
            from: prevStateId!,
            to: transition.to,
            machineId: machine.id,
          });

          // Execute entry actions for new state
          const newState = machine.states.find(s => s.id === transition.to);
          if (newState) {
            await this.executeEntryActions(newState, context);
          }
        } else {
          // No matching transition — try LLM fallback
          if (this.config.enableLLMFallback && this.llmFallback && metrics.llmFallbacks < this.config.maxLLMFallbacks) {
            metrics.llmFallbacks++;
            context.llmFallbackCount++;

            this.emit('llm-fallback', {
              reason: 'No matching transition',
              stateId: context.currentStateId!,
            });

            const fallbackAction = await this.llmFallback(
              JSON.stringify(snapshot),
              context.taskDescription,
              context.stateHistory
            );

            if (fallbackAction) {
              await this.executeAction(fallbackAction, context);
              await this.sleep(this.config.actionDelayMs);
              context.currentUrl = await this.getUrl();
            } else {
              // LLM couldn't help either
              return this.buildResult(context, metrics, false, 'No transition found and LLM fallback returned null');
            }
          } else {
            // No fallback available
            return this.buildResult(context, metrics, false, `Stuck in state "${context.currentStateId}" — no matching transitions`);
          }
        }
      }

      return this.buildResult(context, metrics, false, 'Execution stopped');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emit('error', {
        message: errorMsg,
        stateId: context.currentStateId,
        recoverable: false,
      });
      return this.buildResult(context, metrics, false, errorMsg);
    } finally {
      this.isRunning = false;
      this.currentContext = null;
    }
  }

  /**
   * Stop execution
   */
  stop(): void {
    this.isRunning = false;
    this.isPaused = false;
  }

  /**
   * Resume execution after obstacle resolution
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Pause execution
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Get current context
   */
  getContext(): AgentContext | null {
    return this.currentContext;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private async executeEntryActions(state: AgentState, context: AgentContext): Promise<void> {
    if (!state.entryActions) return;

    for (const action of state.entryActions) {
      const success = await this.executeAction(action, context);
      if (!success) {
        this.emit('error', {
          message: `Entry action failed in state "${state.id}": ${action.description || action.type}`,
          stateId: state.id,
          recoverable: true,
        });
      }
      await this.sleep(this.config.actionDelayMs);
    }
  }

  private async executeAction(action: StateAction, context: AgentContext): Promise<boolean> {
    // Resolve template variables
    const resolvedAction = this.resolveTemplateVars(action, context.variables);

    let retries = 0;
    while (retries <= this.config.maxRetries) {
      try {
        const start = Date.now();
        const success = await this.browserAction(resolvedAction, context);
        const duration = Date.now() - start;

        this.emit('action-executed', { action: resolvedAction, success, duration });

        if (success) return true;
        retries++;
      } catch (error) {
        retries++;
        if (retries > this.config.maxRetries) {
          return false;
        }
        await this.sleep(this.config.actionDelayMs * retries); // Exponential backoff
      }
    }

    return false;
  }

  private async findMatchingTransition(
    machine: StateMachineDefinition,
    currentState: AgentState,
    snapshot: DOMSnapshot,
    context: AgentContext
  ): Promise<StateTransition | null> {
    // Get all transitions from current state, sorted by priority
    const outgoing = machine.transitions
      .filter(t => t.from === currentState.id)
      .sort((a, b) => a.priority - b.priority);

    for (const transition of outgoing) {
      if (await this.evaluateTransition(transition, snapshot, context)) {
        return transition;
      }
    }

    return null;
  }

  private async evaluateTransition(
    transition: StateTransition,
    snapshot: DOMSnapshot,
    context: AgentContext
  ): Promise<boolean> {
    // Check guard conditions first
    if (transition.guardUrlPattern) {
      if (!this.matchPattern(context.currentUrl, transition.guardUrlPattern)) {
        return false;
      }
    }

    if (transition.guardSelector) {
      const elementState = snapshot.elementStates[transition.guardSelector];
      if (!elementState || !elementState.exists) {
        return false;
      }
    }

    // Evaluate trigger
    const trigger = transition.trigger;

    switch (trigger.type) {
      case 'auto':
        return true;

      case 'url_change': {
        const pattern = typeof trigger.pattern === 'string' ? trigger.pattern : trigger.pattern.source;
        return this.matchPattern(context.currentUrl, pattern);
      }

      case 'element_present': {
        const state = snapshot.elementStates[trigger.selector];
        return state?.exists === true;
      }

      case 'element_absent': {
        const state = snapshot.elementStates[trigger.selector];
        return !state || state.exists === false;
      }

      case 'dom_change':
        // Always true if content hash changed from last check
        return snapshot.contentHash !== '';

      case 'timeout':
        // Handled externally
        return false;

      case 'event':
        // Events are triggered externally
        return false;

      default:
        return false;
    }
  }

  private detectObstacle(
    snapshot: DOMSnapshot,
    obstacles: ObstacleDefinition[]
  ): ObstacleDefinition | null {
    // Check known obstacles sorted by priority
    const sorted = [...obstacles].sort((a, b) => b.priority - a.priority);

    for (const obstacle of sorted) {
      // Check selectors
      const selectorMatch = obstacle.detectionSelectors.some(selector => {
        const state = snapshot.elementStates[selector];
        return state?.exists === true;
      });

      if (selectorMatch) return obstacle;

      // Check URL patterns
      if (obstacle.urlPatterns) {
        const urlMatch = obstacle.urlPatterns.some(pattern =>
          this.matchPattern(snapshot.url, pattern)
        );
        if (urlMatch) return obstacle;
      }
    }

    return null;
  }

  private resolveTemplateVars(action: StateAction, variables: Record<string, string>): StateAction {
    const resolved = { ...action };

    const replaceVars = (str?: string): string | undefined => {
      if (!str) return str;
      return str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
    };

    resolved.value = replaceVars(resolved.value);
    resolved.url = replaceVars(resolved.url);
    resolved.selector = replaceVars(resolved.selector);

    return resolved;
  }

  private matchPattern(url: string, pattern: string): boolean {
    // Regex pattern
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      try {
        return new RegExp(pattern.slice(1, -1)).test(url);
      } catch {
        return false;
      }
    }

    // Simple wildcard match
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');

    try {
      return new RegExp(regexStr).test(url);
    } catch {
      return url.includes(pattern);
    }
  }

  private buildResult(
    context: AgentContext,
    metrics: ExecutionMetrics,
    success: boolean,
    error?: string
  ): ExecutionResult {
    metrics.totalMs = Date.now() - context.startedAt;

    const result: ExecutionResult = {
      success,
      finalState: context.currentStateId || 'unknown',
      data: context.extractedData,
      metrics,
      error,
      userActionRequired: this.isPaused,
    };

    this.emit('execution-complete', result);
    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
