/**
 * Amazon Shopping State Machine Definition
 *
 * Defines the state machine for automating Amazon shopping tasks including
 * product search, navigation, and add-to-cart operations. Handles common
 * obstacles like CAPTCHA, login prompts, and cookie consent dialogs.
 */

import type { StateMachineDefinition, AgentState, StateTransition } from '../types';

export const AMAZON_MACHINE: StateMachineDefinition = {
  id: 'amazon-shopping',
  name: 'Amazon Shopping Automation',
  version: '1.0.0',
  description: 'Automated state machine for Amazon product search and purchase flow',

  domains: [
    'amazon.com',
    'amazon.co.uk',
    'amazon.de',
    'amazon.co.jp',
    'amazon.cn'
  ],

  urlPatterns: [
    '*://www.amazon.*/*',
    '*://smile.amazon.*/*'
  ],

  supportedTasks: [
    'search',
    'purchase',
    'add_to_cart',
    'compare_prices'
  ],

  requiredVariables: ['query'],

  optionalVariables: {
    maxPrice: '',
    sortBy: 'relevance'
  },

  states: [
    {
      id: 'NAVIGATE',
      label: 'Navigate to Amazon',
      isInitial: true,
      entryActions: [
        {
          type: 'navigate',
          url: 'https://www.amazon.com'
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
          selector: '#twotabsearchtextbox'
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
      validationSelector: 'div.s-main-slot',
      entryActions: [
        {
          type: 'wait',
          waitMs: 1000
        }
      ],
      timeoutMs: 15000
    },
    {
      id: 'PRODUCT',
      label: 'View Product Details',
      validationSelector: '#productTitle',
      entryActions: [
        {
          type: 'wait',
          waitMs: 500
        }
      ],
      timeoutMs: 15000
    },
    {
      id: 'CART',
      label: 'Add to Cart',
      entryActions: [
        {
          type: 'click',
          selector: '#add-to-cart-button'
        }
      ],
      timeoutMs: 10000
    },
    {
      id: 'VERIFY',
      label: 'Verify Cart Addition',
      isFinal: true,
      validationSelector: '#hlb-view-cart-announce, #NATC_SMART_WAGON_CONF_MSG_SUCCESS',
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
        pattern: 'amazon.com'
      },
      priority: 1
    },
    {
      id: 'search-to-results',
      from: 'SEARCH',
      to: 'RESULTS',
      trigger: {
        type: 'url_change',
        pattern: '*s?k=*'
      },
      priority: 1
    },
    {
      id: 'results-to-product',
      from: 'RESULTS',
      to: 'PRODUCT',
      trigger: {
        type: 'element_present',
        selector: '#productTitle'
      },
      priority: 1,
      actions: [
        {
          type: 'click',
          selector: '.s-main-slot .s-result-item h2 a'
        }
      ]
    },
    {
      id: 'product-to-cart',
      from: 'PRODUCT',
      to: 'CART',
      trigger: {
        type: 'auto'
      },
      priority: 1
    },
    {
      id: 'cart-to-verify',
      from: 'CART',
      to: 'VERIFY',
      trigger: {
        type: 'element_present',
        selector: '#hlb-view-cart-announce, #NATC_SMART_WAGON_CONF_MSG_SUCCESS'
      },
      priority: 1
    }
  ],

  obstacles: [
    {
      id: 'amazon-captcha',
      type: 'captcha',
      detectionSelectors: [
        '#captchacharacters',
        'form[action*="validateCaptcha"]'
      ],
      requiresUserAction: true,
      priority: 10,
      userMessage: 'Amazon CAPTCHA verification required'
    },
    {
      id: 'login-required',
      type: 'login_wall',
      detectionSelectors: [
        '#ap_email',
        '#ap_password',
        'form[name="signIn"]'
      ],
      requiresUserAction: true,
      priority: 9,
      userMessage: 'User login required to continue'
    },
    {
      id: 'cookie-consent',
      type: 'cookie_consent',
      detectionSelectors: [
        '#sp-cc-accept',
        '#sp-cc'
      ],
      requiresUserAction: false,
      dismissAction: {
        type: 'click',
        selector: '#sp-cc-accept'
      },
      priority: 5,
      userMessage: 'Cookie consent banner'
    },
    {
      id: 'address-popup',
      type: 'popup_overlay',
      detectionSelectors: [
        '.a-popover-modal .a-spacing-mini input[data-action="GLUXPostalInputAction"]'
      ],
      requiresUserAction: false,
      dismissAction: {
        type: 'click',
        selector: '[data-action="GLUXDismissAction"] input'
      },
      priority: 3,
      userMessage: 'Address/location selection popup'
    }
  ]
};
