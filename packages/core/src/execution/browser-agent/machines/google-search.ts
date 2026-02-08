/**
 * Google Search State Machine
 *
 * Automates Google search workflow: navigation, search execution, and result extraction.
 * Handles common obstacles like cookie consent dialogs and CAPTCHA challenges.
 *
 * @module google-search
 * @version 1.0.0
 */

import type { StateMachineDefinition } from '../types';

export const GOOGLE_SEARCH_MACHINE: StateMachineDefinition = {
  id: 'google-search',
  version: '1.0.0',
  name: 'Google Search Automation',
  description: 'Automated state machine for Google search and result extraction',

  states: [
    {
      id: 'NAVIGATE',
      label: 'Navigate to Google',
      isInitial: true,
      entryActions: [
        {
          type: 'navigate',
          url: 'https://www.google.com'
        }
      ],
      timeoutMs: 15000
    },
    {
      id: 'SEARCH',
      label: 'Perform Search',
      entryActions: [
        {
          type: 'click',
          selector: 'textarea[name="q"], input[name="q"]'
        },
        {
          type: 'type',
          value: '{{query}}'
        },
        {
          type: 'press_key',
          key: 'Enter'
        }
      ],
      timeoutMs: 10000
    },
    {
      id: 'RESULTS',
      label: 'View Search Results',
      validationSelector: '#search, #rso',
      entryActions: [
        {
          type: 'wait',
          waitMs: 1000
        }
      ],
      timeoutMs: 15000
    },
    {
      id: 'EXTRACT',
      label: 'Extract Results',
      isFinal: true,
      entryActions: [
        {
          type: 'extract_text',
          selector: '#rso .g',
          description: 'Extract search result snippets'
        }
      ],
      timeoutMs: 5000
    }
  ],

  transitions: [
    {
      id: 'navigate-to-search',
      from: 'NAVIGATE',
      to: 'SEARCH',
      trigger: {
        type: 'url_change',
        pattern: 'google.com'
      },
      priority: 1
    },
    {
      id: 'search-to-results',
      from: 'SEARCH',
      to: 'RESULTS',
      trigger: {
        type: 'url_change',
        pattern: '*search?*q=*'
      },
      priority: 1
    },
    {
      id: 'results-to-extract',
      from: 'RESULTS',
      to: 'EXTRACT',
      trigger: {
        type: 'auto'
      },
      priority: 1
    }
  ],

  obstacles: [
    {
      id: 'cookie-consent',
      type: 'cookie_consent',
      detectionSelectors: [
        '#CXQnmb button',
        'div[id="CXQnmb"]',
        'button[id="L2AGLb"]'
      ],
      requiresUserAction: false,
      dismissAction: {
        type: 'click',
        selector: 'button#L2AGLb, #CXQnmb button:last-child'
      },
      priority: 5,
      userMessage: 'Cookie consent dialog detected'
    },
    {
      id: 'captcha-recaptcha',
      type: 'captcha',
      detectionSelectors: [
        '#captcha-form',
        '.g-recaptcha',
        '#recaptcha',
        'iframe[src*="recaptcha"]'
      ],
      requiresUserAction: true,
      priority: 10,
      userMessage: 'CAPTCHA/reCAPTCHA verification required'
    },
    {
      id: 'before-you-continue',
      type: 'cookie_consent',
      detectionSelectors: [
        'form[action*="consent.google"]'
      ],
      requiresUserAction: false,
      dismissAction: {
        type: 'click',
        selector: 'button[aria-label*="Accept"], form[action*="consent"] button:nth-child(2)'
      },
      priority: 6,
      userMessage: 'Before you continue consent dialog'
    }
  ],

  requiredVariables: ['query'],

  optionalVariables: {
    numResults: '10',
    language: '',
    region: ''
  },

  supportedTasks: ['search', 'extract', 'research'],

  domains: [
    'google.com',
    'google.co.uk',
    'google.de',
    'google.fr',
    'google.co.jp',
    'google.com.hk'
  ],

  urlPatterns: [
    '*://www.google.*/*',
    '*://google.*/*'
  ]
};
