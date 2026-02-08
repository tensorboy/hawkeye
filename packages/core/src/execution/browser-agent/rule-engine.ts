/**
 * Rule Engine
 *
 * Fallback automation layer in the 90/8/2 priority chain:
 * 1. State Machine (90%) - Deterministic site-specific automation
 * 2. Rule Engine (8%) - Generic heuristic rules
 * 3. LLM Fallback (2%) - AI-powered decision making
 *
 * The rule engine provides domain-agnostic automation rules that handle
 * common patterns across all websites (search, navigation, form filling, etc.)
 */

import {
  AutomationRule,
  StateAction,
  DOMSnapshot,
  AgentContext,
} from './types';

/** Result of rule matching */
export interface RuleMatchResult {
  /** Whether any rule matched */
  matched: boolean;
  /** The matched rule */
  rule?: AutomationRule;
  /** Resolved action to execute */
  action?: StateAction;
  /** Match confidence 0-1 */
  confidence: number;
}

// ============================================================================
// Built-in Generic Rules
// ============================================================================

export const BUILTIN_RULES: AutomationRule[] = [
  // --- Search Rules ---
  {
    id: 'generic-search-submit',
    name: 'Submit search form',
    conditionSelector: 'input[type="search"], input[name="q"], input[name="query"], input[name="search"], [role="searchbox"]',
    action: {
      type: 'press_key',
      key: 'Enter',
      description: 'Submit search query',
    },
    priority: 10,
  },
  {
    id: 'generic-search-button',
    name: 'Click search button',
    conditionSelector: 'button[type="submit"][aria-label*="search" i], button[type="submit"][aria-label*="Search"], button.search-btn, [data-testid="search-button"]',
    action: {
      type: 'click',
      selector: 'button[type="submit"][aria-label*="search" i], button[type="submit"][aria-label*="Search"], button.search-btn, [data-testid="search-button"]',
      description: 'Click search button',
    },
    priority: 20,
  },

  // --- Navigation Rules ---
  {
    id: 'click-first-result',
    name: 'Click first search result',
    conditionSelector: '.search-results a, [data-testid="result"] a, .g a[href], .result a, main .item a, [class*="result"] a[href]',
    action: {
      type: 'click',
      selector: '.search-results a:first-of-type, [data-testid="result"]:first-of-type a, .g:first-of-type a[href], .result:first-of-type a',
      description: 'Click first search result',
    },
    priority: 30,
  },
  {
    id: 'click-next-page',
    name: 'Click next page button',
    conditionSelector: 'a[rel="next"], [aria-label="Next"], .pagination .next, a.next, button.next',
    action: {
      type: 'click',
      selector: 'a[rel="next"], [aria-label="Next"], .pagination .next, a.next, button.next',
      description: 'Navigate to next page',
    },
    priority: 40,
  },

  // --- Form Rules ---
  {
    id: 'submit-form',
    name: 'Submit form',
    conditionSelector: 'form button[type="submit"], form input[type="submit"]',
    action: {
      type: 'click',
      selector: 'form button[type="submit"], form input[type="submit"]',
      description: 'Submit form',
    },
    priority: 50,
  },

  // --- Scroll Rules ---
  {
    id: 'scroll-to-load-more',
    name: 'Scroll to load more content',
    conditionSelector: '[class*="load-more"], [class*="show-more"], button[class*="more"]',
    action: {
      type: 'scroll',
      direction: 'down',
      scrollAmount: 500,
      description: 'Scroll down to load more',
    },
    priority: 60,
  },

  // --- Add to Cart ---
  {
    id: 'add-to-cart',
    name: 'Click add to cart button',
    conditionSelector: '[id*="add-to-cart" i], [class*="add-to-cart" i], button[data-action="add-to-cart"], [aria-label*="add to cart" i], [aria-label*="Add to Cart" i]',
    action: {
      type: 'click',
      selector: '[id*="add-to-cart" i], [class*="add-to-cart" i], button[data-action="add-to-cart"], [aria-label*="add to cart" i]',
      description: 'Add item to cart',
    },
    priority: 25,
    domains: [], // Generic - all sites
  },

  // --- Close overlay ---
  {
    id: 'close-overlay',
    name: 'Close modal/popup overlay',
    conditionSelector: '[role="dialog"] button[aria-label="Close"], .modal .close, .popup .close-btn, [class*="overlay"] [class*="close"]',
    action: {
      type: 'click',
      selector: '[role="dialog"] button[aria-label="Close"], .modal .close, .popup .close-btn, [class*="overlay"] [class*="close"]',
      description: 'Close overlay',
    },
    priority: 15,
  },

  // --- Play video ---
  {
    id: 'play-video',
    name: 'Play video',
    conditionSelector: 'video, [class*="player"] button[aria-label*="play" i], .ytp-play-button',
    action: {
      type: 'click',
      selector: '[class*="player"] button[aria-label*="play" i], .ytp-play-button, video',
      description: 'Play video',
    },
    priority: 30,
    domains: ['youtube.com', 'vimeo.com', 'bilibili.com'],
  },
];

// ============================================================================
// RuleEngine Class
// ============================================================================

export class RuleEngine {
  private rules: AutomationRule[];

  constructor(customRules?: AutomationRule[]) {
    this.rules = [...BUILTIN_RULES, ...(customRules || [])];
  }

  /**
   * Find the best matching rule for the current page state
   */
  match(snapshot: DOMSnapshot, context: AgentContext): RuleMatchResult {
    // Filter rules by domain
    const domain = this.extractDomain(context.currentUrl);
    const applicableRules = this.rules
      .filter(rule => {
        if (!rule.domains || rule.domains.length === 0) return true;
        return rule.domains.some(d => domain.includes(d));
      })
      .sort((a, b) => a.priority - b.priority);

    for (const rule of applicableRules) {
      if (this.evaluateRule(rule, snapshot, context)) {
        // Resolve template variables in action
        const resolvedAction = this.resolveAction(rule.action, context.variables);

        return {
          matched: true,
          rule,
          action: resolvedAction,
          confidence: this.calculateConfidence(rule, snapshot),
        };
      }
    }

    return { matched: false, confidence: 0 };
  }

  /**
   * Match all applicable rules (not just the first)
   */
  matchAll(snapshot: DOMSnapshot, context: AgentContext): RuleMatchResult[] {
    const domain = this.extractDomain(context.currentUrl);
    const results: RuleMatchResult[] = [];

    const applicableRules = this.rules
      .filter(rule => {
        if (!rule.domains || rule.domains.length === 0) return true;
        return rule.domains.some(d => domain.includes(d));
      })
      .sort((a, b) => a.priority - b.priority);

    for (const rule of applicableRules) {
      if (this.evaluateRule(rule, snapshot, context)) {
        results.push({
          matched: true,
          rule,
          action: this.resolveAction(rule.action, context.variables),
          confidence: this.calculateConfidence(rule, snapshot),
        });
      }
    }

    return results;
  }

  /**
   * Add custom rules
   */
  addRules(rules: AutomationRule[]): void {
    this.rules.push(...rules);
  }

  /**
   * Remove rules by ID
   */
  removeRules(ids: string[]): void {
    this.rules = this.rules.filter(r => !ids.includes(r.id));
  }

  /**
   * Get all registered rules
   */
  getRules(): AutomationRule[] {
    return [...this.rules];
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private evaluateRule(rule: AutomationRule, snapshot: DOMSnapshot, context: AgentContext): boolean {
    // Check selector condition
    if (rule.conditionSelector) {
      // The selector might be a comma-separated list; check each one
      const selectors = rule.conditionSelector.split(',').map(s => s.trim());
      const selectorMatch = selectors.some(selector => {
        const state = snapshot.elementStates[selector];
        return state?.exists === true;
      });

      if (!selectorMatch) return false;
    }

    // Check URL pattern
    if (rule.conditionUrlPattern) {
      if (!this.matchPattern(context.currentUrl, rule.conditionUrlPattern)) {
        return false;
      }
    }

    // Check text content
    if (rule.conditionTextContains) {
      const pageText = Object.values(snapshot.elementStates)
        .map(s => (s.text || '').toLowerCase())
        .join(' ');

      if (!pageText.includes(rule.conditionTextContains.toLowerCase())) {
        return false;
      }
    }

    return true;
  }

  private calculateConfidence(rule: AutomationRule, snapshot: DOMSnapshot): number {
    // Base confidence from specificity
    let confidence = 0.5;

    // More specific selectors get higher confidence
    if (rule.conditionSelector) {
      const parts = rule.conditionSelector.split(',');
      // More specific (fewer alternatives) = higher confidence
      confidence += 0.1 * Math.min(3, 4 - parts.length);
    }

    // Domain-specific rules get higher confidence
    if (rule.domains && rule.domains.length > 0) {
      confidence += 0.2;
    }

    // URL pattern adds confidence
    if (rule.conditionUrlPattern) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  private resolveAction(action: StateAction, variables: Record<string, string>): StateAction {
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
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    try {
      return new RegExp(regexStr, 'i').test(url);
    } catch {
      return url.includes(pattern);
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return '';
    }
  }
}
