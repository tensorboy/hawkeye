/**
 * Change Observer
 *
 * Captures DOM snapshots and compares them to verify that browser actions
 * succeeded. Uses hash comparison and element state tracking instead of
 * LLM calls for action verification.
 *
 * Typical usage:
 * 1. Take snapshot before action
 * 2. Execute action
 * 3. Take snapshot after action
 * 4. Compare snapshots to verify success
 */

import {
  DOMSnapshot,
  ElementState,
  ChangeResult,
  ObstacleType,
} from './types';
import { ObstacleDetector } from './obstacle-detector';

/** Function to get page HTML/text for hashing */
export type PageContentGetter = () => Promise<{ html: string; text: string; url: string; title: string }>;

/** Function to check if a CSS selector exists on page */
export type SelectorChecker = (selector: string) => Promise<ElementState>;

/** Simple hash function for content comparison */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

export class ChangeObserver {
  private lastSnapshot: DOMSnapshot | null = null;
  private snapshotHistory: DOMSnapshot[] = [];
  private maxHistory = 20;
  private obstacleDetector: ObstacleDetector;

  constructor(
    private getPageContent: PageContentGetter,
    private checkSelector: SelectorChecker,
    obstacleDetector?: ObstacleDetector
  ) {
    this.obstacleDetector = obstacleDetector || new ObstacleDetector();
  }

  /**
   * Capture a DOM snapshot of the current page
   */
  async capture(additionalSelectors?: string[]): Promise<DOMSnapshot> {
    const content = await this.getPageContent();

    // Check key selectors for element states
    const elementStates: Record<string, ElementState> = {};

    // Always check common structural selectors
    const defaultSelectors = [
      'body',
      'main',
      'form',
      'input[type="search"]',
      'input[type="text"]',
      'button[type="submit"]',
      '[role="search"]',
      '[role="main"]',
      '[role="dialog"]',
      '[role="alert"]',
      // Common obstacle selectors
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      '[class*="captcha"]',
      '[class*="cookie"]',
      '[class*="login"]',
      '[class*="modal"]',
    ];

    const allSelectors = [...defaultSelectors, ...(additionalSelectors || [])];

    for (const selector of allSelectors) {
      try {
        elementStates[selector] = await this.checkSelector(selector);
      } catch {
        elementStates[selector] = { exists: false };
      }
    }

    // Detect obstacles from element states
    const snapshot: DOMSnapshot = {
      url: content.url,
      title: content.title,
      contentHash: simpleHash(content.html),
      textHash: simpleHash(content.text),
      elementStates,
      obstacles: [],
      timestamp: Date.now(),
    };

    // Run obstacle detection
    const detection = this.obstacleDetector.detect(snapshot);
    snapshot.obstacles = detection.obstacles.map(o => o.definition.type);

    // Store in history
    this.snapshotHistory.push(snapshot);
    if (this.snapshotHistory.length > this.maxHistory) {
      this.snapshotHistory.shift();
    }

    this.lastSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Compare two snapshots to determine what changed
   */
  compare(before: DOMSnapshot, after: DOMSnapshot): ChangeResult {
    const changedElements: string[] = [];

    // Check which elements changed state
    const allSelectors = new Set([
      ...Object.keys(before.elementStates),
      ...Object.keys(after.elementStates),
    ]);

    for (const selector of allSelectors) {
      const beforeState = before.elementStates[selector];
      const afterState = after.elementStates[selector];

      if (!beforeState && afterState?.exists) {
        changedElements.push(selector); // New element appeared
      } else if (beforeState?.exists && !afterState?.exists) {
        changedElements.push(selector); // Element disappeared
      } else if (beforeState && afterState) {
        if (
          beforeState.text !== afterState.text ||
          beforeState.value !== afterState.value ||
          beforeState.visible !== afterState.visible ||
          beforeState.checked !== afterState.checked
        ) {
          changedElements.push(selector);
        }
      }
    }

    // Determine new and resolved obstacles
    const beforeObstacles = new Set(before.obstacles);
    const afterObstacles = new Set(after.obstacles);

    const newObstacles = after.obstacles.filter(o => !beforeObstacles.has(o));
    const resolvedObstacles = before.obstacles.filter(o => !afterObstacles.has(o));

    return {
      urlChanged: before.url !== after.url,
      contentChanged: before.contentHash !== after.contentHash,
      textChanged: before.textHash !== after.textHash,
      changedElements,
      newObstacles,
      resolvedObstacles,
    };
  }

  /**
   * Verify that an action had the expected effect
   *
   * Takes snapshot, compares with last snapshot, and checks expectations.
   */
  async verifyAction(expectations: {
    urlShouldChange?: boolean;
    urlShouldContain?: string;
    contentShouldChange?: boolean;
    selectorShouldExist?: string;
    selectorShouldNotExist?: string;
    textShouldContain?: string;
  }): Promise<{ verified: boolean; reason?: string; change: ChangeResult }> {
    const before = this.lastSnapshot;
    const after = await this.capture();

    if (!before) {
      return {
        verified: true,
        reason: 'No previous snapshot to compare',
        change: {
          urlChanged: false,
          contentChanged: false,
          textChanged: false,
          changedElements: [],
          newObstacles: [],
          resolvedObstacles: [],
        },
      };
    }

    const change = this.compare(before, after);

    // Check URL change expectation
    if (expectations.urlShouldChange === true && !change.urlChanged) {
      return { verified: false, reason: 'URL did not change as expected', change };
    }

    // Check URL contains
    if (expectations.urlShouldContain && !after.url.includes(expectations.urlShouldContain)) {
      return { verified: false, reason: `URL does not contain "${expectations.urlShouldContain}"`, change };
    }

    // Check content change
    if (expectations.contentShouldChange === true && !change.contentChanged) {
      return { verified: false, reason: 'Page content did not change', change };
    }

    // Check selector exists
    if (expectations.selectorShouldExist) {
      const state = after.elementStates[expectations.selectorShouldExist];
      if (!state?.exists) {
        return { verified: false, reason: `Expected element "${expectations.selectorShouldExist}" not found`, change };
      }
    }

    // Check selector does not exist
    if (expectations.selectorShouldNotExist) {
      const state = after.elementStates[expectations.selectorShouldNotExist];
      if (state?.exists) {
        return { verified: false, reason: `Element "${expectations.selectorShouldNotExist}" should not exist`, change };
      }
    }

    return { verified: true, change };
  }

  /**
   * Wait for a change to occur (polling)
   */
  async waitForChange(options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    urlShouldChange?: boolean;
    selectorShouldExist?: string;
    selectorShouldNotExist?: string;
  } = {}): Promise<{ changed: boolean; snapshot: DOMSnapshot }> {
    const timeout = options.timeoutMs ?? 10000;
    const interval = options.pollIntervalMs ?? 500;
    const startTime = Date.now();
    const baseSnapshot = this.lastSnapshot || await this.capture();

    while (Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, interval));

      const current = await this.capture();
      const change = this.compare(baseSnapshot, current);

      // Check if desired change occurred
      if (options.urlShouldChange && change.urlChanged) {
        return { changed: true, snapshot: current };
      }

      if (options.selectorShouldExist) {
        const state = current.elementStates[options.selectorShouldExist];
        if (state?.exists) return { changed: true, snapshot: current };
      }

      if (options.selectorShouldNotExist) {
        const state = current.elementStates[options.selectorShouldNotExist];
        if (!state || !state.exists) return { changed: true, snapshot: current };
      }

      // Default: any content change counts
      if (!options.urlShouldChange && !options.selectorShouldExist && !options.selectorShouldNotExist) {
        if (change.contentChanged || change.urlChanged) {
          return { changed: true, snapshot: current };
        }
      }
    }

    return { changed: false, snapshot: this.lastSnapshot! };
  }

  /**
   * Get last captured snapshot
   */
  getLastSnapshot(): DOMSnapshot | null {
    return this.lastSnapshot;
  }

  /**
   * Get snapshot history
   */
  getHistory(): DOMSnapshot[] {
    return [...this.snapshotHistory];
  }

  /**
   * Clear snapshot history
   */
  clearHistory(): void {
    this.snapshotHistory = [];
    this.lastSnapshot = null;
  }
}
