/**
 * Obstacle Detector
 *
 * Detects common browser automation obstacles:
 * - CAPTCHA challenges (reCAPTCHA, hCaptcha, Turnstile, etc.)
 * - Login walls and authentication gates
 * - Cookie consent dialogs
 * - Age verification gates
 * - Paywall overlays
 * - Bot detection pages
 * - Rate limiting pages
 * - Region/geo blocks
 *
 * Uses a combination of CSS selectors, text patterns, and URL patterns
 * to identify obstacles without LLM calls (pure heuristic).
 */

import {
  ObstacleDefinition,
  ObstacleType,
  DOMSnapshot,
  StateAction,
} from './types';

/** Result of obstacle detection scan */
export interface DetectionResult {
  /** Whether any obstacle was detected */
  hasObstacle: boolean;
  /** Detected obstacles sorted by priority */
  obstacles: DetectedObstacle[];
}

export interface DetectedObstacle {
  definition: ObstacleDefinition;
  /** What matched (selector, text pattern, or URL pattern) */
  matchedBy: 'selector' | 'text' | 'url';
  /** The specific match that triggered detection */
  matchValue: string;
}

// ============================================================================
// Built-in Obstacle Definitions
// ============================================================================

export const BUILTIN_OBSTACLES: ObstacleDefinition[] = [
  // --- CAPTCHA ---
  {
    id: 'recaptcha-v2',
    type: 'captcha',
    detectionSelectors: [
      'iframe[src*="recaptcha"]',
      '.g-recaptcha',
      '#recaptcha',
      '[data-sitekey]',
    ],
    textPatterns: ['verify you are human', 'not a robot', 'recaptcha'],
    requiresUserAction: true,
    userMessage: 'CAPTCHA detected (reCAPTCHA). Please solve the challenge to continue.',
    priority: 100,
  },
  {
    id: 'hcaptcha',
    type: 'captcha',
    detectionSelectors: [
      'iframe[src*="hcaptcha"]',
      '.h-captcha',
      '[data-hcaptcha-widget-id]',
    ],
    textPatterns: ['hcaptcha'],
    requiresUserAction: true,
    userMessage: 'CAPTCHA detected (hCaptcha). Please solve the challenge to continue.',
    priority: 100,
  },
  {
    id: 'cloudflare-turnstile',
    type: 'captcha',
    detectionSelectors: [
      'iframe[src*="challenges.cloudflare.com"]',
      '.cf-turnstile',
      '[data-turnstile-sitekey]',
    ],
    textPatterns: ['checking your browser', 'verify you are human'],
    urlPatterns: ['*/cdn-cgi/challenge-platform/*'],
    requiresUserAction: true,
    userMessage: 'Cloudflare verification detected. Please wait or solve the challenge.',
    priority: 100,
  },
  {
    id: 'generic-captcha',
    type: 'captcha',
    detectionSelectors: [
      '[class*="captcha"]',
      '[id*="captcha"]',
      'img[src*="captcha"]',
    ],
    textPatterns: ['enter the characters', 'type the text', 'security check'],
    requiresUserAction: true,
    userMessage: 'CAPTCHA detected. Please solve the challenge to continue.',
    priority: 90,
  },

  // --- Login Walls ---
  {
    id: 'login-wall',
    type: 'login_wall',
    detectionSelectors: [
      'form[action*="login"]',
      'form[action*="signin"]',
      'form[action*="sign-in"]',
      '#login-form',
      '.login-modal',
      '[data-testid="login-form"]',
    ],
    textPatterns: ['sign in to continue', 'log in to continue', 'please sign in', 'login required'],
    urlPatterns: ['*/login*', '*/signin*', '*/sign-in*', '*/auth*'],
    requiresUserAction: true,
    userMessage: 'Login required. Please sign in to continue.',
    priority: 80,
  },

  // --- Cookie Consent ---
  {
    id: 'cookie-consent',
    type: 'cookie_consent',
    detectionSelectors: [
      '[class*="cookie-consent"]',
      '[class*="cookie-banner"]',
      '[class*="cookie-notice"]',
      '[id*="cookie-consent"]',
      '[id*="cookie-banner"]',
      '#onetrust-consent-sdk',
      '.onetrust-pc-dark-filter',
      '#CybotCookiebotDialog',
      '.cc-window',
      '[class*="gdpr"]',
      '[id*="gdpr"]',
    ],
    textPatterns: ['accept cookies', 'cookie preferences', 'we use cookies', 'cookie policy'],
    requiresUserAction: false,
    dismissAction: {
      type: 'click',
      selector: '[class*="cookie"] button[class*="accept"], [class*="cookie"] button[class*="agree"], #onetrust-accept-btn-handler, .cc-btn.cc-dismiss, [id*="cookie"] button:first-of-type',
      description: 'Accept cookies',
    },
    userMessage: 'Cookie consent dialog detected. Attempting to dismiss automatically.',
    priority: 50,
  },

  // --- Age Gate ---
  {
    id: 'age-gate',
    type: 'age_gate',
    detectionSelectors: [
      '[class*="age-gate"]',
      '[class*="agegate"]',
      '[class*="age-verification"]',
      '[id*="age-gate"]',
      '#age-verification',
    ],
    textPatterns: ['verify your age', 'are you over 18', 'are you of legal age', 'date of birth'],
    requiresUserAction: true,
    userMessage: 'Age verification required. Please confirm your age.',
    priority: 70,
  },

  // --- Paywall ---
  {
    id: 'paywall',
    type: 'paywall',
    detectionSelectors: [
      '[class*="paywall"]',
      '[class*="subscription-wall"]',
      '[class*="subscribe-gate"]',
      '.tp-modal',
      '[class*="piano-"]',
    ],
    textPatterns: ['subscribe to continue', 'start your free trial', 'upgrade to read', 'premium content'],
    requiresUserAction: true,
    userMessage: 'Paywall detected. This content requires a subscription.',
    priority: 60,
  },

  // --- Popup Overlay ---
  {
    id: 'popup-overlay',
    type: 'popup_overlay',
    detectionSelectors: [
      '[class*="modal-overlay"]',
      '[class*="popup-overlay"]',
      '.modal-backdrop',
      '[role="dialog"]',
    ],
    requiresUserAction: false,
    dismissAction: {
      type: 'click',
      selector: '[class*="modal"] [class*="close"], [class*="popup"] [class*="close"], [role="dialog"] button[aria-label="Close"], .modal-close',
      description: 'Close popup overlay',
    },
    userMessage: 'Popup overlay detected. Attempting to dismiss.',
    priority: 40,
  },

  // --- Bot Detection ---
  {
    id: 'bot-detection',
    type: 'bot_detection',
    detectionSelectors: [],
    textPatterns: [
      'automated access',
      'bot detected',
      'unusual traffic',
      'access denied',
      'blocked',
      'please verify',
    ],
    urlPatterns: ['*/blocked*', '*/denied*'],
    requiresUserAction: true,
    userMessage: 'Bot detection triggered. Access may be restricted.',
    priority: 95,
  },

  // --- Rate Limit ---
  {
    id: 'rate-limit',
    type: 'rate_limit',
    detectionSelectors: [],
    textPatterns: ['rate limit', 'too many requests', 'try again later', 'slow down'],
    requiresUserAction: false,
    userMessage: 'Rate limit detected. Will retry after a delay.',
    priority: 85,
  },
];

// ============================================================================
// ObstacleDetector Class
// ============================================================================

export class ObstacleDetector {
  private obstacles: ObstacleDefinition[];

  constructor(customObstacles?: ObstacleDefinition[]) {
    this.obstacles = [...BUILTIN_OBSTACLES, ...(customObstacles || [])];
  }

  /**
   * Scan a DOM snapshot for obstacles
   */
  detect(snapshot: DOMSnapshot): DetectionResult {
    const detected: DetectedObstacle[] = [];

    for (const obstacle of this.obstacles) {
      // Check CSS selectors
      for (const selector of obstacle.detectionSelectors) {
        const state = snapshot.elementStates[selector];
        if (state?.exists) {
          detected.push({
            definition: obstacle,
            matchedBy: 'selector',
            matchValue: selector,
          });
          break; // One match per obstacle is enough
        }
      }

      // Check text patterns (if not already detected by selector)
      if (!detected.find(d => d.definition.id === obstacle.id) && obstacle.textPatterns) {
        // Check against snapshot text (we approximate by checking element text content)
        const pageText = Object.values(snapshot.elementStates)
          .map(s => s.text || '')
          .join(' ')
          .toLowerCase();

        for (const pattern of obstacle.textPatterns) {
          if (pageText.includes(pattern.toLowerCase())) {
            detected.push({
              definition: obstacle,
              matchedBy: 'text',
              matchValue: pattern,
            });
            break;
          }
        }
      }

      // Check URL patterns
      if (!detected.find(d => d.definition.id === obstacle.id) && obstacle.urlPatterns) {
        for (const pattern of obstacle.urlPatterns) {
          if (this.matchUrlPattern(snapshot.url, pattern)) {
            detected.push({
              definition: obstacle,
              matchedBy: 'url',
              matchValue: pattern,
            });
            break;
          }
        }
      }
    }

    // Sort by priority (highest first)
    detected.sort((a, b) => b.definition.priority - a.definition.priority);

    return {
      hasObstacle: detected.length > 0,
      obstacles: detected,
    };
  }

  /**
   * Add custom obstacle definitions
   */
  addObstacles(obstacles: ObstacleDefinition[]): void {
    this.obstacles.push(...obstacles);
  }

  /**
   * Remove obstacle definitions by ID
   */
  removeObstacles(ids: string[]): void {
    this.obstacles = this.obstacles.filter(o => !ids.includes(o.id));
  }

  /**
   * Get all registered obstacle definitions
   */
  getObstacles(): ObstacleDefinition[] {
    return [...this.obstacles];
  }

  /**
   * Quick check: does the snapshot have any high-priority obstacles?
   */
  hasBlockingObstacle(snapshot: DOMSnapshot): boolean {
    const result = this.detect(snapshot);
    return result.obstacles.some(o => o.definition.requiresUserAction);
  }

  private matchUrlPattern(url: string, pattern: string): boolean {
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    try {
      return new RegExp(regexStr, 'i').test(url);
    } catch {
      return url.includes(pattern);
    }
  }
}
