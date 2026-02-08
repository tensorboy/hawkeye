/**
 * Orchestrator — Main coordinator for multi-agent task execution
 *
 * Routes flow: User → Planner → Navigator → Validator → User
 * Manages task lifecycle, event emission, and step-by-step execution with retries.
 */

import type {
  AgentEvent,
  AgentTask,
  AgentPlan,
  AgentConfig,
  PageSnapshot,
  PlanStep,
  StepResult,
  TaskResult,
} from './types';
import { generateId } from './types';
import { PlannerAgent, type PlannerInput } from './planner';
import { NavigatorAgent } from './navigator';
import { ValidatorAgent } from './validator';
import { ChatDB } from '../storage/chat-db';

export interface OrchestratorConfig {
  agentConfig: AgentConfig;
  onEvent: (event: AgentEvent) => void;
  onTaskUpdate: (task: AgentTask) => void;
}

/** Internal timing constants */
const MAX_STEP_RETRIES = 2;
const PAUSE_POLL_MS = 500;
const RETRY_DELAY_MS = 1_000;
const STEP_DELAY_MS = 1_000;

export class Orchestrator {
  private planner: PlannerAgent;
  private navigator: NavigatorAgent;
  private validator: ValidatorAgent;
  private chatDB: ChatDB;
  private config: OrchestratorConfig;
  private currentTask: AgentTask | null = null;
  private isPaused = false;
  private isCancelled = false;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.planner = new PlannerAgent();
    this.navigator = new NavigatorAgent();
    this.validator = new ValidatorAgent();
    this.chatDB = new ChatDB(config.agentConfig.historyRetentionDays);
  }

  /** Main entry: start a new task from natural language */
  async startTask(description: string, sessionId: string): Promise<AgentTask> {
    // Reject if a task is already in progress
    if (this.currentTask && (this.currentTask.status === 'planning' || this.currentTask.status === 'executing' || this.currentTask.status === 'planned')) {
      throw new Error(`A task is already in progress (id=${this.currentTask.id}, status=${this.currentTask.status}). Cancel it first.`);
    }

    try {
      // Reset state
      this.isPaused = false;
      this.isCancelled = false;

      // Create task
      const task: AgentTask = {
        id: generateId(),
        sessionId,
        description,
        createdAt: Date.now(),
        status: 'planning',
      };
      this.currentTask = task;
      this.config.onTaskUpdate(task);

      // Emit system message
      this.emitEvent({
        id: generateId(),
        sessionId,
        role: 'system',
        type: 'status',
        content: `Starting task: "${description}"`,
        timestamp: Date.now(),
      });

      // Get active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id) {
        throw new Error('No active tab found');
      }
      const tabId = activeTab.id;
      task.url = activeTab.url;

      // Capture page snapshot
      const pageSnapshot = await this.navigator.captureSnapshot(tabId);

      // Plan the task
      const plannerInput: PlannerInput = {
        taskDescription: description,
        pageSnapshot,
        config: this.config.agentConfig,
        sessionId,
      };

      const { plan, events: plannerEvents } = await this.planner.plan(plannerInput);

      // Emit planner events
      for (const event of plannerEvents) {
        this.emitEvent(event);
      }

      // Set plan to task
      plan.taskId = task.id;
      task.plan = plan;
      task.status = 'planned';
      this.config.onTaskUpdate(task);

      // Check if confirmation required
      if (this.config.agentConfig.requireConfirmation) {
        this.emitEvent({
          id: generateId(),
          sessionId,
          role: 'system',
          type: 'confirmation',
          content: `Plan ready. Please review and confirm to execute.`,
          timestamp: Date.now(),
          metadata: { planId: plan.id, stepCount: plan.steps.length },
        });
        return task;
      }

      // Auto-execute
      await this.executePlan(task, sessionId, tabId);
      return task;
    } catch (err) {
      const error = err as Error;
      this.emitEvent({
        id: generateId(),
        sessionId,
        role: 'system',
        type: 'error',
        content: `Failed to start task: ${error.message}`,
        timestamp: Date.now(),
      });

      if (this.currentTask) {
        this.currentTask.status = 'failed';
        this.currentTask.result = {
          success: false,
          data: {},
          summary: error.message,
          completedSteps: 0,
          totalSteps: 0,
          durationMs: 0,
        };
        this.config.onTaskUpdate(this.currentTask);
      }

      throw error;
    }
  }

  /** Confirm and execute a plan */
  async confirmPlan(sessionId: string): Promise<void> {
    if (!this.currentTask || !this.currentTask.plan) {
      throw new Error('No plan to confirm');
    }

    try {
      this.currentTask.status = 'executing';
      this.config.onTaskUpdate(this.currentTask);

      // Get active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id) {
        throw new Error('No active tab found');
      }

      await this.executePlan(this.currentTask, sessionId, activeTab.id);
    } catch (err) {
      const error = err as Error;
      this.emitEvent({
        id: generateId(),
        sessionId,
        role: 'system',
        type: 'error',
        content: `Execution failed: ${error.message}`,
        timestamp: Date.now(),
      });

      if (this.currentTask) {
        this.currentTask.status = 'failed';
        this.config.onTaskUpdate(this.currentTask);
      }

      throw error;
    }
  }

  /** Reject a plan */
  async rejectPlan(sessionId: string, reason?: string): Promise<void> {
    if (!this.currentTask) {
      throw new Error('No plan to reject');
    }

    this.emitEvent({
      id: generateId(),
      sessionId,
      role: 'system',
      type: 'status',
      content: reason ? `Plan rejected: ${reason}` : 'Plan rejected by user',
      timestamp: Date.now(),
    });

    this.currentTask.status = 'cancelled';
    this.config.onTaskUpdate(this.currentTask);
    this.currentTask = null;
  }

  /** Pause execution */
  pause(): void {
    this.isPaused = true;
    if (this.currentTask) {
      this.currentTask.status = 'paused';
      this.config.onTaskUpdate(this.currentTask);
    }
  }

  /** Resume execution */
  resume(): void {
    this.isPaused = false;
    if (this.currentTask) {
      this.currentTask.status = 'executing';
      this.config.onTaskUpdate(this.currentTask);
    }
  }

  /** Cancel execution */
  cancel(): void {
    this.isCancelled = true;
    if (this.currentTask) {
      this.currentTask.status = 'cancelled';
      this.config.onTaskUpdate(this.currentTask);
    }
  }

  /** Get current task */
  getTask(): AgentTask | null {
    return this.currentTask;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async executePlan(task: AgentTask, sessionId: string, tabId: number): Promise<void> {
    if (!task.plan) {
      throw new Error('No plan to execute');
    }

    const startTime = Date.now();
    task.status = 'executing';
    this.config.onTaskUpdate(task);

    const plan = task.plan;
    try {
      for (let i = 0; i < plan.steps.length; i++) {
        // Check for pause
        while (this.isPaused && !this.isCancelled) {
          await this.sleep(PAUSE_POLL_MS);
        }

        // Check for cancellation
        if (this.isCancelled) {
          this.emitEvent({
            id: generateId(),
            sessionId,
            role: 'system',
            type: 'status',
            content: 'Task cancelled by user',
            timestamp: Date.now(),
          });
          break;
        }

        const step = plan.steps[i];
        let retryCount = 0;
        let stepSuccessful = false;

        // Retry loop
        while (retryCount <= MAX_STEP_RETRIES && !stepSuccessful && !this.isCancelled) {
          try {
            // Update step status
            step.status = 'running';
            this.config.onTaskUpdate(task);

            // Capture before snapshot
            const beforeSnapshot = await this.navigator.captureSnapshot(tabId);

            // Execute step
            const { result, events: navEvents } = await this.navigator.execute({
              step,
              tabId,
              config: this.config.agentConfig,
              sessionId,
            });

            // Emit navigator events
            for (const event of navEvents) {
              this.emitEvent(event);
            }

            // Capture after snapshot
            const afterSnapshot = await this.navigator.captureSnapshot(tabId);

            // Validate step
            const { valid, events: valEvents } = await this.validator.validate({
              step,
              stepResult: result,
              beforeSnapshot,
              afterSnapshot,
              sessionId,
            });

            // Emit validator events
            for (const event of valEvents) {
              this.emitEvent(event);
            }

            // Check if valid
            if (valid) {
              step.status = 'completed';
              step.result = result;
              stepSuccessful = true;
            } else {
              // Not valid, check retries
              if (retryCount < MAX_STEP_RETRIES) {
                retryCount++;
                this.emitEvent({
                  id: generateId(),
                  sessionId,
                  role: 'system',
                  type: 'status',
                  content: `Step ${step.order} validation failed. Retrying (${retryCount}/${MAX_STEP_RETRIES})...`,
                  timestamp: Date.now(),
                });
                await this.sleep(RETRY_DELAY_MS);
              } else {
                // Max retries reached
                step.status = 'failed';
                step.result = result;
                task.status = 'failed';
                this.emitEvent({
                  id: generateId(),
                  sessionId,
                  role: 'system',
                  type: 'error',
                  content: `Step ${step.order} failed after ${MAX_STEP_RETRIES} retries`,
                  timestamp: Date.now(),
                });
                break;
              }
            }
          } catch (stepError) {
            const error = stepError as Error;
            this.emitEvent({
              id: generateId(),
              sessionId,
              role: 'system',
              type: 'error',
              content: `Step ${step.order} error: ${error.message}`,
              timestamp: Date.now(),
            });

            if (retryCount < MAX_STEP_RETRIES) {
              retryCount++;
              await this.sleep(RETRY_DELAY_MS);
            } else {
              step.status = 'failed';
              step.result = {
                success: false,
                error: error.message,
                durationMs: 0,
              };
              task.status = 'failed';
              break;
            }
          }
        }

        // Update task
        this.config.onTaskUpdate(task);

        // If step failed after retries, stop execution
        if (step.status === 'failed') {
          break;
        }

        // Wait between steps (actionDelay)
        if (i < plan.steps.length - 1) {
          await this.sleep(STEP_DELAY_MS);
        }
      }

      // Compute task result
      const completedSteps = plan.steps.filter((s) => s.status === 'completed').length;
      const allPassed = completedSteps === plan.steps.length;
      const durationMs = Date.now() - startTime;

      const taskResult: TaskResult = {
        success: allPassed && !this.isCancelled,
        data: {},
        summary: allPassed
          ? `Task completed successfully (${completedSteps}/${plan.steps.length} steps)`
          : this.isCancelled
            ? `Task cancelled (${completedSteps}/${plan.steps.length} steps completed)`
            : `Task failed (${completedSteps}/${plan.steps.length} steps completed)`,
        completedSteps,
        totalSteps: plan.steps.length,
        durationMs,
      };

      task.result = taskResult;
      task.status = this.isCancelled ? 'cancelled' : allPassed ? 'completed' : 'failed';
      this.config.onTaskUpdate(task);

      // Emit completion event
      this.emitEvent({
        id: generateId(),
        sessionId,
        role: 'system',
        type: 'completion',
        content: taskResult.summary,
        timestamp: Date.now(),
        metadata: {
          taskId: task.id,
          success: taskResult.success,
          completedSteps: taskResult.completedSteps,
          totalSteps: taskResult.totalSteps,
          durationMs: taskResult.durationMs,
        },
      });
    } catch (err) {
      const error = err as Error;
      task.status = 'failed';
      task.result = {
        success: false,
        data: {},
        summary: `Execution failed: ${error.message}`,
        completedSteps: plan.steps.filter((s) => s.status === 'completed').length,
        totalSteps: plan.steps.length,
        durationMs: Date.now() - startTime,
      };
      this.config.onTaskUpdate(task);

      this.emitEvent({
        id: generateId(),
        sessionId,
        role: 'system',
        type: 'error',
        content: `Task execution failed: ${error.message}`,
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  private emitEvent(event: AgentEvent): void {
    // Emit to callback
    this.config.onEvent(event);

    // Store in database (fire and forget)
    this.chatDB.addEvent(event).catch((err) => {
      console.error('Failed to store event:', err);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
