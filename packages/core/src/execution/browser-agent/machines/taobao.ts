/**
 * Taobao/Tmall Shopping State Machine
 *
 * State machine definition for automating Taobao and Tmall e-commerce interactions.
 * Handles product search, navigation, and cart operations for Chinese shopping platforms.
 *
 * @module taobao-shopping
 * @version 1.0.0
 */

import type { StateMachineDefinition } from '../types';

export const TAOBAO_MACHINE: StateMachineDefinition = {
  id: 'taobao-shopping',
  version: '1.0.0',
  name: 'Taobao/Tmall Shopping Automation',
  description: 'Automated state machine for Taobao and Tmall product search and purchase flow',

  states: [
    {
      id: 'NAVIGATE',
      label: 'Navigate to Taobao',
      isInitial: true,
      entryActions: [
        {
          type: 'navigate',
          url: 'https://www.taobao.com'
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
          selector: '#q'
        },
        {
          type: 'type',
          value: '{{query}}'
        },
        {
          type: 'click',
          selector: 'button.btn-search, .search-button'
        }
      ],
      timeoutMs: 10000
    },
    {
      id: 'RESULTS',
      label: 'View Search Results',
      validationSelector: '.m-itemlist, .items, #mainsrp-itemlist',
      entryActions: [
        {
          type: 'wait',
          waitMs: 2000
        }
      ],
      timeoutMs: 20000
    },
    {
      id: 'PRODUCT',
      label: 'View Product Details',
      validationSelector: '.tb-main-title, .ItemHeader--mainTitle, [class*="ItemHeader"]',
      entryActions: [
        {
          type: 'wait',
          waitMs: 1000
        }
      ],
      timeoutMs: 15000
    },
    {
      id: 'CART',
      label: 'Add to Cart',
      isFinal: true,
      validationSelector: '#J_LinkCart, .cart-page, [class*="CartPage"]',
      timeoutMs: 10000
    }
  ],

  transitions: [
    {
      id: 'navigate-to-search',
      from: 'NAVIGATE',
      to: 'SEARCH',
      trigger: {
        type: 'url_change',
        pattern: 'taobao.com'
      },
      priority: 1
    },
    {
      id: 'search-to-results',
      from: 'SEARCH',
      to: 'RESULTS',
      trigger: {
        type: 'url_change',
        pattern: '*s.taobao.com*'
      },
      priority: 1
    },
    {
      id: 'results-to-product',
      from: 'RESULTS',
      to: 'PRODUCT',
      trigger: {
        type: 'element_present',
        selector: '.tb-main-title, .ItemHeader--mainTitle'
      },
      priority: 1,
      actions: [
        {
          type: 'click',
          selector: '.m-itemlist .items .item a, .Content--contentInner a[class*="Card"]'
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
      priority: 1,
      actions: [
        {
          type: 'click',
          selector: '#J_LinkAdd, .tb-btn-add, a[id="J_LinkBasket"], button[class*="addCart"]'
        }
      ]
    }
  ],

  obstacles: [
    {
      id: 'login-required',
      type: 'login_wall',
      detectionSelectors: [
        '#J_LoginBox, .login-box, iframe[id*="login"], #login-form'
      ],
      urlPatterns: [
        '*login.taobao.com*',
        '*login.tmall.com*'
      ],
      requiresUserAction: true,
      userMessage: '请先登录淘宝账号 (Please log in to your Taobao account)',
      priority: 10
    },
    {
      id: 'slider-captcha',
      type: 'captcha',
      detectionSelectors: [
        '#nc_1_wrapper, .nc-container, #nocaptcha, .baxia-dialog',
        'iframe[src*="captcha"]'
      ],
      requiresUserAction: true,
      userMessage: '请完成滑块验证 (Please complete the slider verification)',
      priority: 9
    },
    {
      id: 'region-redirect',
      type: 'region_block',
      detectionSelectors: [
        '.region-select, [class*="regionSelect"]'
      ],
      requiresUserAction: false,
      dismissAction: {
        type: 'click',
        selector: '.region-select .confirm, [class*="regionConfirm"]'
      },
      priority: 5,
      userMessage: 'Region/redirect dialog detected'
    },
    {
      id: 'price-protection-popup',
      type: 'popup_overlay',
      detectionSelectors: [
        '.J_Module.sufei-dialog, .sufei-dialog'
      ],
      requiresUserAction: false,
      dismissAction: {
        type: 'click',
        selector: '.sufei-dialog .close-btn'
      },
      priority: 3,
      userMessage: 'Price protection popup detected'
    }
  ],

  requiredVariables: ['query'],

  optionalVariables: {
    maxPrice: '',
    sortBy: 'default',
    freeShipping: 'false'
  },

  supportedTasks: ['search', 'purchase', 'add_to_cart', 'compare_prices'],

  domains: [
    'taobao.com',
    'tmall.com',
    's.taobao.com',
    'item.taobao.com',
    'detail.tmall.com'
  ],

  urlPatterns: [
    '*://www.taobao.com/*',
    '*://s.taobao.com/*',
    '*://item.taobao.com/*',
    '*://www.tmall.com/*',
    '*://detail.tmall.com/*'
  ]
};
