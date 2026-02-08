/**
 * Planner Agent — Decomposes tasks into executable browser action steps
 *
 * Takes a natural language task description + page context and produces
 * a structured plan with ordered steps for the Navigator to execute.
 */

import type {
  AgentPlan,
  PlanStep,
  PageSnapshot,
  AgentConfig,
  AgentEvent,
  StepActionType,
} from './types';
import { generateId } from './types';

export interface PlannerInput {
  taskDescription: string;
  pageSnapshot: PageSnapshot;
  config: AgentConfig;
  sessionId: string;
}

export interface PlannerOutput {
  plan: AgentPlan;
  events: AgentEvent[];
}

export class PlannerAgent {
  /** Generate a plan from natural language task + page context */
  async plan(input: PlannerInput): Promise<PlannerOutput> {
    const events: AgentEvent[] = [];
    const now = Date.now();

    // Emit thinking event
    events.push({
      id: generateId(),
      sessionId: input.sessionId,
      role: 'planner',
      type: 'thinking',
      content: `Analyzing task: "${input.taskDescription}"`,
      timestamp: now,
    });

    try {
      let plan: AgentPlan;

      if (input.config.aiProvider === 'desktop-proxy') {
        // Send to desktop for planning via sync client
        plan = await this.planViaDesktop(input);
      } else {
        // Use heuristic planning for common patterns
        plan = this.heuristicPlan(input);
      }

      // Emit plan event
      events.push({
        id: generateId(),
        sessionId: input.sessionId,
        role: 'planner',
        type: 'plan',
        content: this.formatPlanSummary(plan),
        timestamp: Date.now(),
        metadata: { planId: plan.id, stepCount: plan.steps.length },
      });

      return { plan, events };
    } catch (err) {
      events.push({
        id: generateId(),
        sessionId: input.sessionId,
        role: 'planner',
        type: 'error',
        content: `Planning failed: ${(err as Error).message}`,
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  /** Heuristic-based planning for common browser tasks */
  private heuristicPlan(input: PlannerInput): AgentPlan {
    const steps: PlanStep[] = [];
    const task = input.taskDescription.toLowerCase();
    const planId = generateId();

    // Pattern: Search for something
    if (task.includes('search') || task.includes('find') || task.includes('look for')) {
      const query = this.extractSearchQuery(input.taskDescription);

      // Check if already on a search engine
      const isOnSearchEngine = input.pageSnapshot.url.includes('google.com')
        || input.pageSnapshot.url.includes('bing.com');

      if (!isOnSearchEngine) {
        steps.push(this.createStep(steps.length + 1, 'Navigate to Google', 'navigate', {
          url: 'https://www.google.com',
        }));
      }

      steps.push(this.createStep(steps.length + 1, 'Click search box', 'click', {
        selector: 'textarea[name="q"], input[name="q"]',
      }));

      steps.push(this.createStep(steps.length + 1, `Type search query: "${query}"`, 'type', {
        selector: 'textarea[name="q"], input[name="q"]',
        value: query,
      }));

      steps.push(this.createStep(steps.length + 1, 'Submit search', 'click', {
        selector: 'input[type="submit"], button[type="submit"]',
        expectedOutcome: 'Search results page loaded',
      }));

      steps.push(this.createStep(steps.length + 1, 'Wait for results', 'wait', {
        expectedOutcome: 'Search results visible',
      }));

      steps.push(this.createStep(steps.length + 1, 'Extract top results', 'extract', {
        selector: '#rso .g, .yuRUbf a',
        expectedOutcome: 'Search results extracted',
      }));
    }
    // Pattern: Navigate to URL
    else if (task.includes('go to') || task.includes('navigate to') || task.includes('open')) {
      const url = this.extractUrl(input.taskDescription);

      steps.push(this.createStep(1, `Navigate to ${url}`, 'navigate', {
        url,
        expectedOutcome: 'Page loaded',
      }));

      steps.push(this.createStep(2, 'Wait for page load', 'wait', {
        expectedOutcome: 'Page fully loaded',
      }));
    }
    // Pattern: Click something
    else if (task.includes('click')) {
      const target = this.extractTarget(input.taskDescription, input.pageSnapshot);

      steps.push(this.createStep(1, `Click "${target.text}"`, 'click', {
        selector: target.selector,
        expectedOutcome: `"${target.text}" clicked`,
      }));

      steps.push(this.createStep(2, 'Verify action result', 'verify', {
        expectedOutcome: 'Expected change occurred',
      }));
    }
    // Pattern: Fill form / type text
    else if (task.includes('type') || task.includes('fill') || task.includes('enter')) {
      const { target, value } = this.extractTypeAction(input.taskDescription, input.pageSnapshot);

      steps.push(this.createStep(1, `Click input field`, 'click', {
        selector: target,
      }));

      steps.push(this.createStep(2, `Type "${value}"`, 'type', {
        selector: target,
        value,
      }));
    }
    // Default: Generic task
    else {
      steps.push(this.createStep(1, 'Analyze current page', 'verify', {
        expectedOutcome: 'Page context understood',
      }));

      steps.push(this.createStep(2, input.taskDescription, 'custom', {
        expectedOutcome: 'Task completed',
      }));
    }

    return {
      id: planId,
      taskId: '', // Set by caller
      steps,
      estimatedDurationMs: steps.length * 3000,
      confidence: steps.length <= 3 ? 0.8 : 0.6,
      createdAt: Date.now(),
    };
  }

  /** Plan via desktop proxy (send to Hawkeye Desktop for AI-powered planning) */
  private async planViaDesktop(input: PlannerInput): Promise<AgentPlan> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'agent-plan-request',
        taskDescription: input.taskDescription,
        pageSnapshot: input.pageSnapshot,
      });

      if (response?.plan) {
        return response.plan as AgentPlan;
      }
    } catch {
      // Fall through to heuristic
    }

    // Fallback to heuristic planning
    return this.heuristicPlan(input);
  }

  // === Helpers ===

  private createStep(
    order: number,
    description: string,
    actionType: StepActionType,
    options: {
      selector?: string;
      value?: string;
      url?: string;
      expectedOutcome?: string;
    } = {}
  ): PlanStep {
    return {
      id: generateId(),
      order,
      description,
      actionType,
      selector: options.selector,
      value: options.value,
      url: options.url,
      expectedOutcome: options.expectedOutcome,
      status: 'pending',
    };
  }

  private extractSearchQuery(task: string): string {
    // Remove common prefixes
    const cleaned = task
      .replace(/^(search\s+(for|about)?|find|look\s+for|google)\s*/i, '')
      .replace(/\s+(on|in|at)\s+(google|bing|the web).*$/i, '')
      .trim();
    return cleaned || task;
  }

  private extractUrl(task: string): string {
    // Try to find URL in task
    const urlMatch = task.match(/https?:\/\/[^\s]+/);
    if (urlMatch) return urlMatch[0];

    // Try to find domain-like text
    const domainMatch = task.match(/(?:go to|navigate to|open)\s+(\S+\.\S+)/i);
    if (domainMatch) {
      const domain = domainMatch[1];
      return domain.startsWith('http') ? domain : `https://${domain}`;
    }

    return 'https://www.google.com';
  }

  private extractTarget(
    task: string,
    snapshot: PageSnapshot
  ): { text: string; selector: string } {
    // Try to match against interactive elements
    const clickTarget = task.replace(/^click\s+(on\s+)?/i, '').trim();

    if (snapshot.interactiveElements) {
      for (const el of snapshot.interactiveElements) {
        if (el.text && el.text.toLowerCase().includes(clickTarget.toLowerCase())) {
          return { text: el.text, selector: el.selector };
        }
      }
    }

    return { text: clickTarget, selector: `[aria-label*="${clickTarget}" i], button` };
  }

  private extractTypeAction(
    task: string,
    snapshot: PageSnapshot
  ): { target: string; value: string } {
    // Simple extraction: "type X into Y" or "fill Y with X"
    const typeMatch = task.match(/type\s+"?([^"]+)"?\s+(?:into|in)\s+(.+)/i);
    if (typeMatch) {
      return { value: typeMatch[1], target: typeMatch[2] };
    }

    const fillMatch = task.match(/fill\s+(.+)\s+with\s+"?([^"]+)"?/i);
    if (fillMatch) {
      return { target: fillMatch[1], value: fillMatch[2] };
    }

    // Default: use first input on page
    const firstInput = snapshot.interactiveElements?.find(
      (el) => el.tag === 'input' || el.tag === 'textarea'
    );

    return {
      target: firstInput?.selector || 'input:first-of-type',
      value: task.replace(/^(type|fill|enter)\s*/i, '').trim(),
    };
  }

  private formatPlanSummary(plan: AgentPlan): string {
    const lines = plan.steps.map((s) => `${s.order}. ${s.description}`);
    return `Plan (${plan.steps.length} steps, ~${Math.round(plan.estimatedDurationMs / 1000)}s):\n${lines.join('\n')}`;
  }
}
