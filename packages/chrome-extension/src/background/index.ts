/**
 * Hawkeye Chrome Extension - Background Service Worker
 * Communicates with Desktop app via WebSocket
 */

import { SyncClient, getSyncClient, createSyncClient } from './sync-client';
import type {
  UserIntent,
  ExecutionPlan,
  ExecutionProgress,
  PageContext,
  ExtensionConfig,
  DEFAULT_CONFIG,
} from './types';

// State
let syncClient: SyncClient | null = null;
let currentIntents: UserIntent[] = [];
let currentPlan: ExecutionPlan | null = null;
let config: ExtensionConfig = {
  connectionMode: 'desktop',
  desktopHost: 'localhost',
  desktopPort: 9527,
  aiProvider: 'gemini',
  showFloatingButton: false,
  enableNotifications: true,
};

// i18n helper
function getMessage(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

// ============ Initialization ============

// Load config and initialize
async function initialize() {
  // Load saved config
  const saved = await chrome.storage.local.get(['config']);
  if (saved.config) {
    config = { ...config, ...saved.config };
  }

  // Create context menus
  setupContextMenus();

  // Initialize sync client
  await initSyncClient();

  console.log('Hawkeye extension initialized');
}

// Setup context menus
function setupContextMenus() {
  chrome.contextMenus.create({
    id: 'hawkeye-observe',
    title: getMessage('contextMenuAnalyzeSelection'),
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'hawkeye-observe-page',
    title: getMessage('contextMenuAnalyzePage'),
    contexts: ['page'],
  });
}

// Initialize sync client connection to Desktop
async function initSyncClient() {
  if (config.connectionMode !== 'desktop') {
    return;
  }

  syncClient = createSyncClient({
    host: config.desktopHost,
    port: config.desktopPort,
  });

  // Setup event handlers
  syncClient.on('connected', () => {
    console.log('Connected to Hawkeye Desktop');
    notifyPopup('connection_status', { connected: true });
  });

  syncClient.on('disconnected', () => {
    console.log('Disconnected from Hawkeye Desktop');
    notifyPopup('connection_status', { connected: false });
  });

  syncClient.on('intent_detected', (message) => {
    const payload = message.payload as { intents: UserIntent[] };
    currentIntents = payload.intents;
    notifyPopup('intents_updated', { intents: currentIntents });

    // Show notification
    if (config.enableNotifications && currentIntents.length > 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Hawkeye',
        message: getMessage('foundIntents', currentIntents.length.toString()),
      });
    }
  });

  syncClient.on('plan_generated', (message) => {
    const payload = message.payload as { plan: ExecutionPlan };
    currentPlan = payload.plan;
    notifyPopup('plan_updated', { plan: currentPlan });
  });

  syncClient.on('execution_progress', (message) => {
    const payload = message.payload as ExecutionProgress;
    notifyPopup('execution_progress', payload);
  });

  syncClient.on('execution_completed', (message) => {
    notifyPopup('execution_completed', message.payload);

    if (config.enableNotifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Hawkeye',
        message: getMessage('executionCompleted'),
      });
    }
  });

  syncClient.on('execution_failed', (message) => {
    notifyPopup('execution_failed', message.payload);

    if (config.enableNotifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: getMessage('notificationError'),
        message: getMessage('executionFailed'),
      });
    }
  });

  syncClient.on('status', (message) => {
    notifyPopup('desktop_status', message.payload);
  });

  syncClient.on('error', (message) => {
    console.error('Sync error:', message.payload);
  });

  // Connect
  try {
    await syncClient.connect();
  } catch (error) {
    console.warn('Could not connect to Desktop:', error);
  }
}

// Notify popup of updates
function notifyPopup(type: string, payload: unknown) {
  chrome.runtime.sendMessage({ type, ...payload as object }).catch(() => {
    // Popup may not be open
  });
}

// ============ Page Analysis ============

// Analyze page content
async function analyzePage(tabId: number, selection?: string) {
  try {
    // Get page content
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        content: document.body.innerText.substring(0, 10000),
        selection: window.getSelection()?.toString() || '',
      }),
    });

    const pageData = results[0]?.result;
    if (!pageData) {
      throw new Error('Could not read page content');
    }

    const tab = await chrome.tabs.get(tabId);

    const context: PageContext = {
      url: tab.url || '',
      title: tab.title || '',
      content: pageData.content,
      selection: selection || pageData.selection,
    };

    // If connected to Desktop, send context for analysis
    if (syncClient?.isConnected) {
      syncClient.sendPageContext(context);
      // Request intents recognition
      const intents = await syncClient.requestObserve();
      return { success: true, intents };
    }

    // Standalone mode - show message
    return {
      success: false,
      error: getMessage('desktopNotConnected'),
    };
  } catch (error) {
    console.error('Analysis error:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ============ Event Handlers ============

// Context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'hawkeye-observe' || info.menuItemId === 'hawkeye-observe-page') {
    const result = await analyzePage(tab.id, info.selectionText);

    if (!result.success) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: getMessage('notificationError'),
        message: result.error || 'Unknown error',
      });
    }
  }
});

// Keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'observe-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await analyzePage(tab.id);
    }
  }
});

// Messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message, sendResponse);
  return true; // Keep channel open for async response
});

// ============ Auto Update Check (GitHub Releases) ============

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  name: string;
  prerelease: boolean;
  draft: boolean;
}

async function checkForUpdates(): Promise<{ hasUpdate: boolean; latestVersion?: string; downloadUrl?: string }> {
  try {
    const response = await fetch(
      'https://api.github.com/repos/tensorboy/hawkeye/releases/latest',
      { headers: { 'Accept': 'application/vnd.github.v3+json' } }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch release info');
    }

    const release: GitHubRelease = await response.json();
    const latestVersion = release.tag_name.replace(/^v/, '');
    const currentVersion = chrome.runtime.getManifest().version;

    // Compare versions (simple comparison)
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    return {
      hasUpdate,
      latestVersion,
      downloadUrl: release.html_url,
    };
  } catch (error) {
    console.warn('Update check failed:', error);
    return { hasUpdate: false };
  }
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;
    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }
  return 0;
}

async function handleMessage(
  message: { type: string; [key: string]: unknown },
  sendResponse: (response: unknown) => void
) {
  switch (message.type) {
    // Connection
    case 'get-connection-status':
      sendResponse({
        connected: syncClient?.isConnected || false,
        status: syncClient?.status,
      });
      break;

    case 'connect-desktop':
      try {
        if (!syncClient) {
          await initSyncClient();
        } else {
          await syncClient.connect();
        }
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: (error as Error).message });
      }
      break;

    // Intents
    case 'get-intents':
      sendResponse({ intents: currentIntents });
      break;

    case 'analyze-page':
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const result = await analyzePage(tab.id);
        sendResponse(result);
      } else {
        sendResponse({ success: false, error: 'No active tab' });
      }
      break;

    case 'intent-feedback':
      if (syncClient?.isConnected) {
        syncClient.sendIntentFeedback(
          message.intentId as string,
          message.feedback as 'accept' | 'reject' | 'irrelevant'
        );
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Not connected' });
      }
      break;

    // Plans
    case 'get-plan':
      sendResponse({ plan: currentPlan });
      break;

    case 'confirm-plan':
      if (syncClient?.isConnected && currentPlan) {
        syncClient.confirmPlan(currentPlan.id);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Not connected or no plan' });
      }
      break;

    case 'reject-plan':
      if (syncClient?.isConnected && currentPlan) {
        syncClient.rejectPlan(currentPlan.id, message.reason as string);
        currentPlan = null;
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Not connected or no plan' });
      }
      break;

    // Execution control
    case 'pause-execution':
      if (syncClient?.isConnected) {
        syncClient.pauseExecution(message.executionId as string);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Not connected' });
      }
      break;

    case 'resume-execution':
      if (syncClient?.isConnected) {
        syncClient.resumeExecution(message.executionId as string);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Not connected' });
      }
      break;

    case 'cancel-execution':
      if (syncClient?.isConnected) {
        syncClient.cancelExecution(message.executionId as string);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Not connected' });
      }
      break;

    // Config
    case 'get-config':
      sendResponse({ config });
      break;

    case 'save-config':
      config = { ...config, ...message.config as Partial<ExtensionConfig> };
      await chrome.storage.local.set({ config });

      // Reconnect if needed
      if (syncClient) {
        syncClient.disconnect();
        await initSyncClient();
      }

      sendResponse({ success: true });
      break;

    // Version and updates
    case 'get-version':
      sendResponse({
        version: chrome.runtime.getManifest().version,
        name: chrome.runtime.getManifest().name,
      });
      break;

    case 'check-for-updates':
      const updateInfo = await checkForUpdates();
      sendResponse(updateInfo);

      // Show notification if update available
      if (updateInfo.hasUpdate && config.enableNotifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Hawkeye Update Available',
          message: `New version ${updateInfo.latestVersion} is available!`,
        });
      }
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
}

// ============ Lifecycle ============

chrome.runtime.onInstalled.addListener(() => {
  console.log('Hawkeye extension installed');
  initialize();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Hawkeye extension starting');
  initialize();
});

// Initialize on load
initialize();
