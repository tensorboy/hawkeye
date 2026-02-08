/**
 * Validator Agent — Verifies step outcomes against expectations
 *
 * After each Navigator step, validates that the expected outcome
 * was achieved by inspecting page state changes.
 */

import type {
  PlanStep,
  StepResult,
  AgentEvent,
  PageSnapshot,
} from './types';
import { generateId } from './types';

export interface ValidationInput {
  step: PlanStep;
  stepResult: StepResult;
  beforeSnapshot: PageSnapshot;
  afterSnapshot: PageSnapshot;
  sessionId: string;
}

export interface ValidationOutput {
  valid: boolean;
  confidence: number;
  reason: string;
  events: AgentEvent[];
}

export class ValidatorAgent {
  /** Validate a step's outcome */
  async validate(input: ValidationInput): Promise<ValidationOutput> {
    const events: AgentEvent[] = [];
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

    // 1. Check if step itself reported success
    checks.push({
      name: 'step_success',
      passed: input.stepResult.success,
      detail: input.stepResult.success
        ? 'Step reported success'
        : `Step failed: ${input.stepResult.error}`,
    });

    // 2. Check URL change (for navigation actions)
    if (input.step.actionType === 'navigate') {
      const urlChanged = input.beforeSnapshot.url !== input.afterSnapshot.url;
      checks.push({
        name: 'url_changed',
        passed: urlChanged,
        detail: urlChanged
          ? `URL changed to: ${input.afterSnapshot.url}`
          : 'URL did not change',
      });
    }

    // 3. Check page title change
    const titleChanged = input.beforeSnapshot.title !== input.afterSnapshot.title;
    if (input.step.actionType === 'navigate' || input.step.actionType === 'click') {
      checks.push({
        name: 'title_check',
        passed: true, // Informational
        detail: titleChanged
          ? `Title changed: "${input.afterSnapshot.title}"`
          : 'Title unchanged',
      });
    }

    // 4. Check expected outcome text (if specified)
    if (input.step.expectedOutcome) {
      const outcomeMatch = this.checkExpectedOutcome(
        input.step.expectedOutcome,
        input.afterSnapshot,
        input.stepResult
      );
      checks.push({
        name: 'expected_outcome',
        passed: outcomeMatch.passed,
        detail: outcomeMatch.detail,
      });
    }

    // 5. Check for error indicators on page
    const errorCheck = this.checkForPageErrors(input.afterSnapshot);
    if (errorCheck) {
      checks.push({
        name: 'page_errors',
        passed: !errorCheck.hasErrors,
        detail: errorCheck.detail,
      });
    }

    // 6. Check element existence (for click/type actions)
    if (input.step.selector && (input.step.actionType === 'click' || input.step.actionType === 'type')) {
      const elementExists = input.afterSnapshot.interactiveElements?.some(
        (el) => el.selector === input.step.selector
      );
      // For click: element may have been removed (navigation happened)
      // For type: element should still exist
      if (input.step.actionType === 'type') {
        checks.push({
          name: 'element_exists',
          passed: elementExists ?? true,
          detail: elementExists ? 'Target element still present' : 'Target element not found after action',
        });
      }
    }

    // Calculate overall validation result
    const passedChecks = checks.filter((c) => c.passed);
    const criticalFailed = checks.filter(
      (c) => !c.passed && ['step_success', 'url_changed', 'expected_outcome'].includes(c.name)
    );

    const valid = criticalFailed.length === 0 && passedChecks.length > 0;
    const confidence = checks.length > 0
      ? passedChecks.length / checks.length
      : 0.5;

    const reason = valid
      ? `Validated: ${passedChecks.map((c) => c.detail).join('; ')}`
      : `Failed: ${criticalFailed.map((c) => c.detail).join('; ')}`;

    // Emit validation event
    events.push({
      id: generateId(),
      sessionId: input.sessionId,
      role: 'validator',
      type: 'validation',
      content: `${valid ? 'PASS' : 'FAIL'} (${Math.round(confidence * 100)}%): ${reason}`,
      timestamp: Date.now(),
      metadata: {
        valid,
        confidence,
        checks,
        stepId: input.step.id,
      },
    });

    return { valid, confidence, reason, events };
  }

  /** Quick validation without full snapshot comparison */
  async quickValidate(
    step: PlanStep,
    result: StepResult,
    sessionId: string
  ): Promise<ValidationOutput> {
    const events: AgentEvent[] = [];

    const valid = result.success;
    const confidence = valid ? 0.7 : 0.2;
    const reason = valid
      ? `Step completed in ${result.durationMs}ms`
      : `Step failed: ${result.error}`;

    events.push({
      id: generateId(),
      sessionId,
      role: 'validator',
      type: 'validation',
      content: `${valid ? 'PASS' : 'FAIL'} (quick): ${reason}`,
      timestamp: Date.now(),
      metadata: { valid, confidence, stepId: step.id },
    });

    return { valid, confidence, reason, events };
  }

  // === Helpers ===

  private checkExpectedOutcome(
    expected: string,
    snapshot: PageSnapshot,
    result: StepResult
  ): { passed: boolean; detail: string } {
    const expectedLower = expected.toLowerCase();

    // Check against page text
    if (snapshot.textExcerpt) {
      const pageText = snapshot.textExcerpt.toLowerCase();

      // Check common patterns
      if (expectedLower.includes('loaded') || expectedLower.includes('visible')) {
        // Page has content → likely loaded
        if (pageText.length > 100) {
          return { passed: true, detail: 'Page content loaded' };
        }
      }

      if (expectedLower.includes('results')) {
        // Check for result-like content
        if (pageText.includes('result') || pageText.includes('found') || snapshot.interactiveElements?.length) {
          return { passed: true, detail: 'Results appear present on page' };
        }
      }
    }

    // Check against extracted data
    if (result.data) {
      const dataStr = JSON.stringify(result.data).toLowerCase();
      if (expectedLower.includes('extract') && dataStr.length > 10) {
        return { passed: true, detail: 'Data extracted successfully' };
      }
    }

    // Check URL for expected patterns
    if (expectedLower.includes('search') && snapshot.url.includes('search')) {
      return { passed: true, detail: 'Search page detected in URL' };
    }

    // Default: trust step result
    return {
      passed: result.success,
      detail: result.success ? 'Step reported success' : 'Could not verify expected outcome',
    };
  }

  private checkForPageErrors(snapshot: PageSnapshot): { hasErrors: boolean; detail: string } | null {
    if (!snapshot.textExcerpt) return null;

    const text = snapshot.textExcerpt.toLowerCase();
    const errorPatterns = [
      '404 not found',
      '500 internal server error',
      '403 forbidden',
      'access denied',
      'page not found',
      'something went wrong',
      'error occurred',
    ];

    for (const pattern of errorPatterns) {
      if (text.includes(pattern)) {
        return { hasErrors: true, detail: `Page error detected: "${pattern}"` };
      }
    }

    return { hasErrors: false, detail: 'No page errors detected' };
  }
}
