/**
 * Navigator Agent — Executes browser actions step by step
 *
 * Takes plan steps from the Planner and executes them against
 * the active browser tab using Chrome extension APIs.
 */

import type {
  PlanStep,
  StepResult,
  AgentEvent,
  AgentConfig,
  PageSnapshot,
  InteractiveElement,
} from './types';
import { generateId } from './types';

export interface NavigatorInput {
  step: PlanStep;
  tabId: number;
  config: AgentConfig;
  sessionId: string;
}

export interface NavigatorOutput {
  result: StepResult;
  events: AgentEvent[];
}

export class NavigatorAgent {
  /** Execute a single plan step */
  async execute(input: NavigatorInput): Promise<NavigatorOutput> {
    const events: AgentEvent[] = [];
    const startTime = Date.now();

    // Emit step start
    events.push({
      id: generateId(),
      sessionId: input.sessionId,
      role: 'navigator',
      type: 'step_start',
      content: `Step ${input.step.order}: ${input.step.description}`,
      timestamp: startTime,
      metadata: { stepId: input.step.id, actionType: input.step.actionType },
    });

    try {
      let result: StepResult;

      switch (input.step.actionType) {
        case 'navigate':
          result = await this.executeNavigate(input);
          break;
        case 'click':
          result = await this.executeClick(input);
          break;
        case 'type':
          result = await this.executeType(input);
          break;
        case 'scroll':
          result = await this.executeScroll(input);
          break;
        case 'wait':
          result = await this.executeWait(input);
          break;
        case 'extract':
          result = await this.executeExtract(input);
          break;
        case 'verify':
          result = await this.executeVerify(input);
          break;
        case 'custom':
          result = await this.executeCustom(input);
          break;
        default:
          result = {
            success: false,
            error: `Unknown action type: ${input.step.actionType}`,
            durationMs: Date.now() - startTime,
          };
      }

      // Emit step complete/failed
      events.push({
        id: generateId(),
        sessionId: input.sessionId,
        role: 'navigator',
        type: result.success ? 'step_complete' : 'step_failed',
        content: result.success
          ? `Step ${input.step.order} completed`
          : `Step ${input.step.order} failed: ${result.error}`,
        timestamp: Date.now(),
        metadata: { stepId: input.step.id, result },
      });

      return { result, events };
    } catch (err) {
      const result: StepResult = {
        success: false,
        error: (err as Error).message,
        durationMs: Date.now() - startTime,
      };

      events.push({
        id: generateId(),
        sessionId: input.sessionId,
        role: 'navigator',
        type: 'step_failed',
        content: `Step ${input.step.order} error: ${result.error}`,
        timestamp: Date.now(),
        metadata: { stepId: input.step.id },
      });

      return { result, events };
    }
  }

  /** Capture a page snapshot from the active tab */
  async captureSnapshot(tabId: number): Promise<PageSnapshot> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Gather interactive elements
          const interactives: Array<{
            tag: string; role: string | null; text: string;
            selector: string; type: string | null; href: string | null; visible: boolean;
          }> = [];

          const elements = document.querySelectorAll(
            'a, button, input, textarea, select, [role="button"], [role="link"], [onclick]'
          );

          elements.forEach((el, i) => {
            const rect = el.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0;
            if (!visible) return;

            interactives.push({
              tag: el.tagName.toLowerCase(),
              role: el.getAttribute('role'),
              text: (el.textContent || '').trim().substring(0, 100),
              selector: generateSelector(el, i),
              type: el.getAttribute('type'),
              href: (el as HTMLAnchorElement).href || null,
              visible: true,
            });
          });

          function generateSelector(el: Element, index: number): string {
            if (el.id) return `#${el.id}`;
            const cls = el.className?.toString().trim();
            if (cls) {
              const firstClass = cls.split(/\s+/)[0];
              return `${el.tagName.toLowerCase()}.${firstClass}`;
            }
            return `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
          }

          return {
            url: location.href,
            title: document.title,
            textExcerpt: document.body.innerText.substring(0, 2000),
            interactiveElements: interactives.slice(0, 50),
          };
        },
      });

      const data = results[0]?.result;
      if (!data) throw new Error('Failed to capture page snapshot');

      return {
        url: data.url,
        title: data.title,
        textExcerpt: data.textExcerpt,
        interactiveElements: data.interactiveElements as InteractiveElement[],
        timestamp: Date.now(),
      };
    } catch (err) {
      const tab = await chrome.tabs.get(tabId);
      return {
        url: tab.url || '',
        title: tab.title || '',
        timestamp: Date.now(),
      };
    }
  }

  // === Action Executors ===

  private async executeNavigate(input: NavigatorInput): Promise<StepResult> {
    const startTime = Date.now();
    const url = input.step.url || input.step.value;

    if (!url) {
      return { success: false, error: 'No URL specified', durationMs: 0 };
    }

    await chrome.tabs.update(input.tabId, { url });

    // Wait for navigation to complete
    await this.waitForTabLoad(input.tabId, input.config.stepTimeoutMs);

    return {
      success: true,
      durationMs: Date.now() - startTime,
      data: { navigatedTo: url },
    };
  }

  private async executeClick(input: NavigatorInput): Promise<StepResult> {
    const startTime = Date.now();
    const selector = input.step.selector;

    if (!selector) {
      return { success: false, error: 'No selector specified', durationMs: 0 };
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: input.tabId },
      func: (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return { success: false, error: `Element not found: ${sel}` };

        (el as HTMLElement).click();
        return { success: true, text: (el as HTMLElement).innerText?.substring(0, 100) };
      },
      args: [selector],
    });

    const result = results[0]?.result;
    if (!result?.success) {
      return {
        success: false,
        error: result?.error || 'Click failed',
        durationMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      durationMs: Date.now() - startTime,
      data: { clicked: selector, text: result.text },
    };
  }

  private async executeType(input: NavigatorInput): Promise<StepResult> {
    const startTime = Date.now();
    const selector = input.step.selector;
    const value = input.step.value;

    if (!selector || !value) {
      return { success: false, error: 'Missing selector or value', durationMs: 0 };
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: input.tabId },
      func: (sel: string, val: string) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (!el) return { success: false, error: `Element not found: ${sel}` };

        el.focus();
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        return { success: true };
      },
      args: [selector, value],
    });

    const result = results[0]?.result;
    return {
      success: result?.success ?? false,
      error: result?.error,
      durationMs: Date.now() - startTime,
    };
  }

  private async executeScroll(input: NavigatorInput): Promise<StepResult> {
    const startTime = Date.now();
    const scrollAmount = parseInt(input.step.value || '500', 10) || 500;

    await chrome.scripting.executeScript({
      target: { tabId: input.tabId },
      func: (amount: number) => {
        window.scrollBy({ top: amount, behavior: 'smooth' });
      },
      args: [scrollAmount],
    });

    // Wait for scroll to settle
    await new Promise((r) => setTimeout(r, 500));

    return {
      success: true,
      durationMs: Date.now() - startTime,
    };
  }

  private async executeWait(input: NavigatorInput): Promise<StepResult> {
    const startTime = Date.now();
    const waitMs = parseInt(input.step.value || '2000', 10) || 2000;

    await new Promise((r) => setTimeout(r, waitMs));

    return {
      success: true,
      durationMs: Date.now() - startTime,
    };
  }

  private async executeExtract(input: NavigatorInput): Promise<StepResult> {
    const startTime = Date.now();
    const selector = input.step.selector || 'body';

    const results = await chrome.scripting.executeScript({
      target: { tabId: input.tabId },
      func: (sel: string) => {
        const elements = document.querySelectorAll(sel);
        const extracted: string[] = [];

        elements.forEach((el) => {
          const text = (el as HTMLElement).innerText?.trim();
          if (text) extracted.push(text.substring(0, 500));
        });

        return { items: extracted.slice(0, 20) };
      },
      args: [selector],
    });

    const data = results[0]?.result;

    return {
      success: true,
      durationMs: Date.now() - startTime,
      data: { extracted: data?.items || [] },
    };
  }

  private async executeVerify(input: NavigatorInput): Promise<StepResult> {
    const startTime = Date.now();

    // Capture current page state
    const snapshot = await this.captureSnapshot(input.tabId);

    return {
      success: true,
      durationMs: Date.now() - startTime,
      data: {
        url: snapshot.url,
        title: snapshot.title,
        elementCount: snapshot.interactiveElements?.length || 0,
      },
    };
  }

  private async executeCustom(input: NavigatorInput): Promise<StepResult> {
    // For custom steps, we attempt to send to desktop for AI-powered execution
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'agent-custom-step',
        step: input.step,
        tabId: input.tabId,
      });

      if (response?.result) {
        return response.result as StepResult;
      }
    } catch (error) {
      console.warn('[Navigator] executeCustom failed, falling back to verify:', error);
    }

    return this.executeVerify(input);
  }

  // === Helpers ===

  private waitForTabLoad(tabId: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const cleanup = () => {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(updateListener);
        chrome.tabs.onRemoved.removeListener(removeListener);
      };

      const timeout = setTimeout(() => {
        cleanup();
        resolve();
      }, timeoutMs);

      const updateListener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          cleanup();
          resolve();
        }
      };

      const removeListener = (removedTabId: number) => {
        if (removedTabId === tabId) {
          cleanup();
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(updateListener);
      chrome.tabs.onRemoved.addListener(removeListener);
    });
  }
}
