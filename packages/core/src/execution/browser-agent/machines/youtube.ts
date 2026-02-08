/**
 * YouTube automation state machine definition.
 * Handles video search, playback, and common obstacles like consent dialogs and ads.
 * @module youtube-machine
 * @version 1.0.0
 */

import type { StateMachineDefinition } from '../types';

export const YOUTUBE_MACHINE: StateMachineDefinition = {
  id: 'youtube-player',
  version: '1.0.0',

  states: [
    {
      id: 'NAVIGATE',
      label: 'Navigate to YouTube',
      isInitial: true,
      entryActions: [
        {
          type: 'navigate',
          url: 'https://www.youtube.com'
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
          selector: 'input#search'
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
      validationSelector: 'ytd-search, #contents ytd-video-renderer',
      entryActions: [
        {
          type: 'wait',
          waitMs: 1500
        }
      ],
      timeoutMs: 15000
    },
    {
      id: 'PLAYING',
      label: 'Playing Video',
      isFinal: true,
      validationSelector: 'video.html5-main-video, #movie_player video',
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
        pattern: 'youtube.com'
      },
      priority: 1
    },
    {
      id: 'search-to-results',
      from: 'SEARCH',
      to: 'RESULTS',
      trigger: {
        type: 'url_change',
        pattern: '*results?search_query=*'
      },
      priority: 1
    },
    {
      id: 'results-to-playing',
      from: 'RESULTS',
      to: 'PLAYING',
      trigger: {
        type: 'element_present',
        selector: 'video.html5-main-video, #movie_player video'
      },
      actions: [
        {
          type: 'click',
          selector: 'ytd-video-renderer #video-title'
        }
      ],
      priority: 1
    }
  ],

  obstacles: [
    {
      id: 'cookie-consent',
      type: 'cookie_consent',
      detectionSelectors: [
        'tp-yt-paper-dialog button[aria-label*="Accept"]',
        'button[aria-label*="accept"]',
        '.consent-bump-v2-lightbox'
      ],
      requiresUserAction: false,
      dismissAction: {
        type: 'click',
        selector: 'tp-yt-paper-dialog button[aria-label*="Accept"], button[aria-label*="Accept all"]'
      },
      priority: 5,
      userMessage: 'Cookie consent dialog detected'
    },
    {
      id: 'login-wall',
      type: 'login_wall',
      detectionSelectors: [
        'ytd-popup-container yt-upsell-dialog-renderer',
        '[id="dialog"] [id="sign-in-button"]'
      ],
      requiresUserAction: true,
      priority: 8,
      userMessage: 'YouTube login wall detected'
    },
    {
      id: 'age-gate',
      type: 'age_gate',
      detectionSelectors: [
        '#confirm-button yt-button-renderer',
        '.ytd-player-error-message-renderer'
      ],
      textPatterns: [
        'confirm your age',
        'age-restricted'
      ],
      requiresUserAction: true,
      priority: 9,
      userMessage: 'Age-restricted content requires verification'
    },
    {
      id: 'ad-overlay',
      type: 'popup_overlay',
      detectionSelectors: [
        '.ytp-ad-overlay-container .ytp-ad-overlay-close-button',
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern'
      ],
      requiresUserAction: false,
      dismissAction: {
        type: 'click',
        selector: '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-overlay-close-button'
      },
      priority: 3,
      userMessage: 'Ad overlay detected'
    }
  ],

  requiredVariables: ['query'],

  optionalVariables: {
    duration: '',
    uploadDate: ''
  },

  supportedTasks: ['search', 'play', 'watch'],

  domains: ['youtube.com', 'youtu.be', 'm.youtube.com'],

  urlPatterns: [
    '*://www.youtube.com/*',
    '*://m.youtube.com/*',
    '*://youtu.be/*'
  ],

  name: 'YouTube Player Automation',
  description: 'Automated state machine for YouTube video search and playback'
};
