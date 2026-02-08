/**
 * Hawkeye Chrome Extension - Content Script
 * Runs in the context of web pages
 * Includes WebGazer eye tracking support
 */

// Make this file a module to allow global scope augmentation
export {};

// ============ WebGazer Types ============
interface WebGazerAPI {
  setRegression: (type: string) => WebGazerAPI;
  showPredictionPoints: (show: boolean) => WebGazerAPI;
  showVideo: (show: boolean) => WebGazerAPI;
  showFaceOverlay: (show: boolean) => WebGazerAPI;
  showFaceFeedbackBox: (show: boolean) => WebGazerAPI;
  applyKalmanFilter: (apply: boolean) => WebGazerAPI;
  saveDataAcrossSessions: (save: boolean) => WebGazerAPI;
  setGazeListener: (callback: (data: { x: number; y: number } | null) => void) => WebGazerAPI;
  begin: () => Promise<WebGazerAPI>;
  isReady: () => boolean;
  recordScreenPosition: (x: number, y: number) => void;
  clearData: () => void;
  pause: () => void;
  resume: () => void;
  end: () => void;
}

interface CalibrationSample {
  id: string;
  x: number;
  y: number;
  timestamp: number;
  source: 'extension' | 'desktop';
}

declare global {
  interface Window {
    webgazer?: WebGazerAPI;
  }
}

// ============ WebGazer State ============
let webgazerInstance: WebGazerAPI | null = null;
let webgazerReady = false;
let webgazerLoading = false;
let gazeIndicator: HTMLDivElement | null = null;
let debugPanel: HTMLDivElement | null = null;
let showGazeIndicator = true;
let showDebugPanel = false;
let calibrationSamples: CalibrationSample[] = [];
let sampleCount = 0;

// ============ WebGazer UI Creation ============
function createWebGazerStyles() {
  if (document.getElementById('hawkeye-webgazer-styles')) return;

  const style = document.createElement('style');
  style.id = 'hawkeye-webgazer-styles';
  style.textContent = `
    #hawkeye-gaze-indicator {
      position: fixed;
      pointer-events: none;
      z-index: 999999;
      width: 30px;
      height: 30px;
      display: none;
      align-items: center;
      justify-content: center;
      transform: translate(-50%, -50%);
    }
    #hawkeye-gaze-indicator .inner {
      width: 40%;
      height: 40%;
      background: radial-gradient(circle, #3b82f6 0%, #1d4ed8 100%);
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);
    }
    #hawkeye-gaze-indicator .ring {
      position: absolute;
      inset: 0;
      border: 2px solid rgba(59, 130, 246, 0.6);
      border-radius: 50%;
      animation: hawkeye-pulse 2s ease-in-out infinite;
    }
    @keyframes hawkeye-pulse {
      0%, 100% { transform: scale(1); opacity: 0.6; }
      50% { transform: scale(1.2); opacity: 0.3; }
    }
    #hawkeye-debug-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 200px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.9);
      border-radius: 10px;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11px;
      z-index: 999998;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: none;
    }
    #hawkeye-debug-panel.visible { display: block; }
    #hawkeye-debug-panel .title {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      color: #3b82f6;
    }
    #hawkeye-debug-panel .row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    #hawkeye-debug-panel .label { color: rgba(255, 255, 255, 0.6); }
    #hawkeye-debug-panel .value {
      font-family: 'SF Mono', Monaco, monospace;
      color: #22c55e;
    }
    #hawkeye-debug-panel .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    #hawkeye-debug-panel button {
      flex: 1;
      min-width: calc(50% - 2px);
      padding: 4px 6px;
      background: rgba(59, 130, 246, 0.2);
      border: 1px solid rgba(59, 130, 246, 0.4);
      border-radius: 4px;
      color: white;
      font-size: 9px;
      cursor: pointer;
      transition: all 0.2s;
    }
    #hawkeye-debug-panel button:hover { background: rgba(59, 130, 246, 0.4); }
    #hawkeye-debug-panel .samples {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    #hawkeye-debug-panel .samples-title {
      font-size: 10px;
      color: #22c55e;
      margin-bottom: 4px;
    }
    #hawkeye-debug-panel .sample-item {
      font-size: 9px;
      padding: 2px 4px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 2px;
      margin-bottom: 2px;
    }
    #hawkeye-debug-panel .sample-item.desktop {
      border-left: 2px solid #a855f7;
    }
  `;
  document.head.appendChild(style);
}

function createGazeIndicator(): HTMLDivElement {
  const indicator = document.createElement('div');
  indicator.id = 'hawkeye-gaze-indicator';
  indicator.innerHTML = `<div class="inner"></div><div class="ring"></div>`;
  return indicator;
}

function createDebugPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.id = 'hawkeye-debug-panel';
  panel.innerHTML = `
    <div class="title">👁️ Hawkeye WebGazer</div>
    <div class="row"><span class="label">Status:</span><span class="value" id="wg-status">Off</span></div>
    <div class="row"><span class="label">Samples:</span><span class="value" id="wg-samples">0</span></div>
    <div class="row"><span class="label">Gaze X:</span><span class="value" id="wg-x">-</span></div>
    <div class="row"><span class="label">Gaze Y:</span><span class="value" id="wg-y">-</span></div>
    <div class="actions">
      <button id="wg-toggle">Hide Gaze</button>
      <button id="wg-clear">Clear Data</button>
      <button id="wg-sync">Sync Desktop</button>
    </div>
    <div class="samples">
      <div class="samples-title">Recent Samples</div>
      <div id="wg-samples-list"></div>
    </div>
  `;
  return panel;
}

function updateDebugPanel(x?: number, y?: number) {
  if (!debugPanel) return;
  const statusEl = debugPanel.querySelector('#wg-status');
  const samplesEl = debugPanel.querySelector('#wg-samples');
  const xEl = debugPanel.querySelector('#wg-x');
  const yEl = debugPanel.querySelector('#wg-y');
  const listEl = debugPanel.querySelector('#wg-samples-list');

  if (statusEl) statusEl.textContent = webgazerReady ? 'Ready' : webgazerLoading ? 'Loading...' : 'Off';
  if (samplesEl) samplesEl.textContent = sampleCount.toString();
  if (xEl && x !== undefined) xEl.textContent = `${x.toFixed(0)}px`;
  if (yEl && y !== undefined) yEl.textContent = `${y.toFixed(0)}px`;

  if (listEl) {
    // Use DOM API instead of innerHTML to prevent XSS
    listEl.textContent = '';
    for (const s of calibrationSamples.slice(-5).reverse()) {
      const div = document.createElement('div');
      div.className = `sample-item${s.source === 'desktop' ? ' desktop' : ''}`;
      div.textContent = `(${s.x}, ${s.y}) - ${s.source}`;
      listEl.appendChild(div);
    }
  }
}

// ============ WebGazer Initialization ============
function loadWebGazerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.webgazer) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    // Load from extension bundle instead of CDN (MV3 CSP blocks external scripts)
    script.src = chrome.runtime.getURL('vendor/webgazer.js');
    script.onload = () => {
      console.log('[Hawkeye] WebGazer script loaded');
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load WebGazer script. Ensure vendor/webgazer.js is included in the extension build.'));
    document.head.appendChild(script);
  });
}

async function initWebGazer(): Promise<{ success: boolean; error?: string }> {
  if (webgazerReady) {
    return { success: true };
  }

  if (webgazerLoading) {
    return { success: false, error: 'Already loading' };
  }

  webgazerLoading = true;

  try {
    // Load script
    await loadWebGazerScript();

    const wg = window.webgazer;
    if (!wg) {
      throw new Error('WebGazer not available');
    }

    // Configure WebGazer
    wg.setRegression('ridge')
      .showPredictionPoints(false)
      .showVideo(false)
      .showFaceOverlay(false)
      .showFaceFeedbackBox(false)
      .applyKalmanFilter(true)
      .saveDataAcrossSessions(true);

    // Set gaze listener
    wg.setGazeListener((data: { x: number; y: number } | null) => {
      if (!data) return;
      updateGazePosition(data.x, data.y);
    });

    // Create UI
    createWebGazerStyles();
    gazeIndicator = createGazeIndicator();
    debugPanel = createDebugPanel();
    document.body.appendChild(gazeIndicator);
    document.body.appendChild(debugPanel);
    setupDebugPanelEvents();

    // Start WebGazer
    await wg.begin();

    // Wait for ready
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (wg.isReady()) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 15000);
    });

    webgazerInstance = wg;
    webgazerReady = true;
    webgazerLoading = false;

    // Setup click calibration
    document.addEventListener('click', handleCalibrationClick);

    // Load saved samples
    await loadCalibrationData();

    // Show debug panel by default
    showDebugPanel = true;
    if (debugPanel) debugPanel.classList.add('visible');
    updateDebugPanel();

    // Cleanup on page unload to prevent memory leaks
    window.addEventListener('beforeunload', destroyWebGazer);

    console.log('[Hawkeye WebGazer] Initialized successfully');
    return { success: true };

  } catch (error) {
    webgazerLoading = false;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Hawkeye WebGazer] Init failed:', error);
    return { success: false, error: errorMsg };
  }
}

function updateGazePosition(x: number, y: number) {
  if (gazeIndicator && showGazeIndicator && webgazerReady) {
    gazeIndicator.style.display = 'flex';
    gazeIndicator.style.left = `${x}px`;
    gazeIndicator.style.top = `${y}px`;
  }
  updateDebugPanel(x, y);
}

function handleCalibrationClick(event: MouseEvent) {
  if (!webgazerReady || !webgazerInstance) return;

  webgazerInstance.recordScreenPosition(event.clientX, event.clientY);

  const sample: CalibrationSample = {
    id: `ext-${Date.now()}`,
    x: event.clientX,
    y: event.clientY,
    timestamp: Date.now(),
    source: 'extension',
  };

  calibrationSamples = [...calibrationSamples.slice(-39), sample];
  sampleCount++;
  saveCalibrationData();
  updateDebugPanel();
}

function setupDebugPanelEvents() {
  if (!debugPanel) return;

  const toggleBtn = debugPanel.querySelector('#wg-toggle');
  const clearBtn = debugPanel.querySelector('#wg-clear');
  const syncBtn = debugPanel.querySelector('#wg-sync');

  toggleBtn?.addEventListener('click', () => {
    showGazeIndicator = !showGazeIndicator;
    if (toggleBtn) toggleBtn.textContent = showGazeIndicator ? 'Hide Gaze' : 'Show Gaze';
    if (!showGazeIndicator && gazeIndicator) gazeIndicator.style.display = 'none';
  });

  clearBtn?.addEventListener('click', () => {
    webgazerInstance?.clearData();
    calibrationSamples = [];
    sampleCount = 0;
    chrome.storage.local.remove(['webgazer_samples', 'webgazer_count']);
    updateDebugPanel();
  });

  syncBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'webgazer-sync-request' });
  });
}

async function saveCalibrationData() {
  try {
    await chrome.storage.local.set({
      webgazer_samples: calibrationSamples,
      webgazer_count: sampleCount,
    });
  } catch (e) {
    console.warn('[Hawkeye] Failed to save calibration:', e);
  }
}

async function loadCalibrationData() {
  try {
    const data = await chrome.storage.local.get(['webgazer_samples', 'webgazer_count']);
    if (data.webgazer_samples) calibrationSamples = data.webgazer_samples;
    if (data.webgazer_count) sampleCount = data.webgazer_count;
    updateDebugPanel();
  } catch (e) {
    console.warn('[Hawkeye] Failed to load calibration:', e);
  }
}

function destroyWebGazer() {
  if (webgazerInstance) {
    webgazerInstance.end();
  }
  webgazerInstance = null;
  webgazerReady = false;
  webgazerLoading = false;

  document.removeEventListener('click', handleCalibrationClick);
  window.removeEventListener('beforeunload', destroyWebGazer);
  gazeIndicator?.remove();
  debugPanel?.remove();
  gazeIndicator = null;
  debugPanel = null;

  console.log('[Hawkeye WebGazer] Destroyed');
}

function syncFromDesktop(samples: Array<{ id: string; x: number; y: number; timestamp: number }>) {
  if (!webgazerReady || !webgazerInstance) return 0;

  let synced = 0;
  for (const sample of samples) {
    webgazerInstance.recordScreenPosition(sample.x, sample.y);
    synced++;
  }

  const existingIds = new Set(calibrationSamples.map(s => s.id));
  const newSamples: CalibrationSample[] = samples
    .filter(s => !existingIds.has(s.id))
    .map(s => ({ ...s, source: 'desktop' as const }));

  calibrationSamples = [...calibrationSamples, ...newSamples].slice(-40);
  sampleCount = calibrationSamples.length;
  saveCalibrationData();
  updateDebugPanel();

  console.log(`[Hawkeye] Synced ${synced} samples from desktop`);
  return synced;
}

function toggleDebugPanel() {
  showDebugPanel = !showDebugPanel;
  if (debugPanel) {
    debugPanel.classList.toggle('visible', showDebugPanel);
  }
  return showDebugPanel;
}

// ============ Message Handlers ============
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // WebGazer messages
  if (message.type === 'webgazer-start') {
    initWebGazer().then(sendResponse);
    return true;
  }

  if (message.type === 'webgazer-stop') {
    destroyWebGazer();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'webgazer-status') {
    sendResponse({
      enabled: webgazerReady,
      loading: webgazerLoading,
      sampleCount,
    });
    return true;
  }

  if (message.type === 'webgazer-toggle-debug') {
    const visible = toggleDebugPanel();
    sendResponse({ success: true, showDebug: visible });
    return true;
  }

  if (message.type === 'webgazer-sync-from-desktop') {
    if (message.samples && Array.isArray(message.samples)) {
      const synced = syncFromDesktop(message.samples);
      sendResponse({ success: true, synced });
    } else {
      sendResponse({ success: false, error: 'Invalid samples data' });
    }
    return true;
  }

  if (message.type === 'webgazer-export') {
    const extensionSamples = calibrationSamples.filter(s => s.source === 'extension');
    sendResponse({ success: true, samples: extensionSamples });
    return true;
  }

  // Original messages
  if (message.type === 'get-page-content') {
    const content = {
      url: window.location.href,
      title: document.title,
      content: document.body.innerText.substring(0, 20000),
      selection: window.getSelection()?.toString() || '',
      meta: extractMetadata(),
    };
    sendResponse(content);
    return true;
  }

  if (message.type === 'execute-action') {
    executeAction(message.action)
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// ============ Original Functions ============

// 提取页面元数据
function extractMetadata() {
  const meta: Record<string, string> = {};

  // Open Graph
  document.querySelectorAll('meta[property^="og:"]').forEach((el) => {
    const property = el.getAttribute('property');
    const content = el.getAttribute('content');
    if (property && content) {
      meta[property] = content;
    }
  });

  // Twitter Card
  document.querySelectorAll('meta[name^="twitter:"]').forEach((el) => {
    const name = el.getAttribute('name');
    const content = el.getAttribute('content');
    if (name && content) {
      meta[name] = content;
    }
  });

  // Description
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    meta['description'] = description.getAttribute('content') || '';
  }

  return meta;
}

// 执行动作
async function executeAction(action: { type: string; params: Record<string, string> }) {
  switch (action.type) {
    case 'click':
      const element = document.querySelector(action.params.selector);
      if (element) {
        (element as HTMLElement).click();
        return { clicked: true };
      }
      throw new Error('Element not found');

    case 'fill':
      const input = document.querySelector(action.params.selector) as HTMLInputElement;
      if (input) {
        input.value = action.params.value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return { filled: true };
      }
      throw new Error('Input not found');

    case 'extract':
      const elements = document.querySelectorAll(action.params.selector);
      return Array.from(elements).map((el) => ({
        text: el.textContent?.trim(),
        html: el.innerHTML,
      }));

    case 'scroll':
      if (action.params.direction === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (action.params.direction === 'bottom') {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      } else if (action.params.selector) {
        const target = document.querySelector(action.params.selector);
        target?.scrollIntoView({ behavior: 'smooth' });
      }
      return { scrolled: true };

    case 'copy':
      const textToCopy =
        action.params.text ||
        window.getSelection()?.toString() ||
        document.body.innerText.substring(0, 1000);
      await navigator.clipboard.writeText(textToCopy);
      return { copied: true, length: textToCopy.length };

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// 注入悬浮球（可选）
function injectFloatingButton() {
  const button = document.createElement('div');
  button.id = 'hawkeye-floating-btn';
  button.innerHTML = '🦅';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    z-index: 999999;
    transition: transform 0.2s, box-shadow 0.2s;
  `;

  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.1)';
    button.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
  });

  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'analyze', context: {
      url: window.location.href,
      title: document.title,
      content: document.body.innerText.substring(0, 10000),
      selection: window.getSelection()?.toString() || '',
    }});
  });

  document.body.appendChild(button);
}

// 检查设置是否启用悬浮球
chrome.storage.local.get(['showFloatingButton']).then((data) => {
  if (data.showFloatingButton) {
    injectFloatingButton();
  }
});

console.log('Hawkeye content script loaded');
