/**
 * WebGazer Content Script - Injects eye tracking into web pages
 *
 * This script runs in the context of web pages and provides:
 * - Eye gaze tracking via WebGazer.js
 * - Implicit calibration through clicks
 * - Sync with desktop app
 * - Visual gaze indicator overlay
 */

import {
  webGazerController,
  GazePoint,
  CalibrationSample,
  WebGazerState,
} from '../webgazer/useWebGazer';

// State
let gazeIndicator: HTMLDivElement | null = null;
let debugPanel: HTMLDivElement | null = null;
let isEnabled = false;
let showIndicator = true;
let showDebug = false;

// Create gaze indicator element
function createGazeIndicator(): HTMLDivElement {
  const indicator = document.createElement('div');
  indicator.id = 'hawkeye-gaze-indicator';
  indicator.innerHTML = `
    <div class="hawkeye-gaze-inner"></div>
    <div class="hawkeye-gaze-ring"></div>
  `;
  indicator.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 999999;
    width: 30px;
    height: 30px;
    display: none;
    align-items: center;
    justify-content: center;
    transform: translate(-50%, -50%);
  `;

  const style = document.createElement('style');
  style.textContent = `
    #hawkeye-gaze-indicator .hawkeye-gaze-inner {
      width: 40%;
      height: 40%;
      background: radial-gradient(circle, #3b82f6 0%, #1d4ed8 100%);
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);
    }
    #hawkeye-gaze-indicator .hawkeye-gaze-ring {
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
      width: 220px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.85);
      border-radius: 10px;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      z-index: 999998;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    #hawkeye-debug-panel .title {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      color: #3b82f6;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #hawkeye-debug-panel .row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    #hawkeye-debug-panel .label {
      color: rgba(255, 255, 255, 0.6);
    }
    #hawkeye-debug-panel .value {
      font-family: 'SF Mono', Monaco, monospace;
      color: #22c55e;
    }
    #hawkeye-debug-panel .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    #hawkeye-debug-panel button {
      flex: 1;
      min-width: calc(50% - 2px);
      padding: 5px 8px;
      background: rgba(59, 130, 246, 0.2);
      border: 1px solid rgba(59, 130, 246, 0.4);
      border-radius: 5px;
      color: white;
      font-size: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }
    #hawkeye-debug-panel button:hover {
      background: rgba(59, 130, 246, 0.4);
    }
    #hawkeye-debug-panel button.active {
      background: rgba(34, 197, 94, 0.3);
      border-color: rgba(34, 197, 94, 0.5);
    }
    #hawkeye-debug-panel .samples {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    #hawkeye-debug-panel .samples-title {
      font-size: 11px;
      font-weight: 600;
      color: #22c55e;
      margin-bottom: 6px;
    }
    #hawkeye-debug-panel .samples-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px;
      max-height: 150px;
      overflow-y: auto;
    }
    #hawkeye-debug-panel .sample-item {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
      padding: 4px;
      font-size: 9px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    #hawkeye-debug-panel .sample-item.desktop {
      border-color: rgba(168, 85, 247, 0.5);
    }
    #hawkeye-debug-panel .sample-coords {
      font-family: 'SF Mono', Monaco, monospace;
      color: #3b82f6;
    }
    #hawkeye-debug-panel .sample-badge {
      display: inline-block;
      padding: 1px 4px;
      background: rgba(168, 85, 247, 0.2);
      border-radius: 3px;
      font-size: 8px;
      color: #a855f7;
      margin-top: 2px;
    }
  `;
  document.head.appendChild(style);

  return indicator;
}

// Create debug panel element
function createDebugPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.id = 'hawkeye-debug-panel';
  panel.innerHTML = `
    <div class="title"><span>👁️</span> Hawkeye WebGazer</div>
    <div class="row">
      <span class="label">Status:</span>
      <span class="value" id="hawkeye-status">Loading...</span>
    </div>
    <div class="row">
      <span class="label">Samples:</span>
      <span class="value" id="hawkeye-samples">0</span>
    </div>
    <div class="row">
      <span class="label">X:</span>
      <span class="value" id="hawkeye-x">-</span>
    </div>
    <div class="row">
      <span class="label">Y:</span>
      <span class="value" id="hawkeye-y">-</span>
    </div>
    <div class="actions">
      <button id="hawkeye-toggle-indicator">Hide Indicator</button>
      <button id="hawkeye-clear-data">Clear Data</button>
      <button id="hawkeye-pause">Pause</button>
      <button id="hawkeye-sync">Sync Desktop</button>
    </div>
    <div class="samples">
      <div class="samples-title">Recent Samples</div>
      <div class="samples-grid" id="hawkeye-samples-grid"></div>
    </div>
  `;
  return panel;
}

// Update gaze indicator position
function updateGazeIndicator(point: GazePoint | null) {
  if (!gazeIndicator || !showIndicator || !point) {
    if (gazeIndicator) gazeIndicator.style.display = 'none';
    return;
  }

  gazeIndicator.style.display = 'flex';
  gazeIndicator.style.left = `${point.x}px`;
  gazeIndicator.style.top = `${point.y}px`;
}

// Update debug panel
function updateDebugPanel(state: WebGazerState) {
  if (!debugPanel || !showDebug) return;

  const statusEl = debugPanel.querySelector('#hawkeye-status') as HTMLElement;
  const samplesEl = debugPanel.querySelector('#hawkeye-samples') as HTMLElement;
  const xEl = debugPanel.querySelector('#hawkeye-x') as HTMLElement;
  const yEl = debugPanel.querySelector('#hawkeye-y') as HTMLElement;
  const gridEl = debugPanel.querySelector('#hawkeye-samples-grid') as HTMLElement;

  if (statusEl) {
    statusEl.textContent = state.isReady ? 'Ready' : state.isLoading ? 'Loading...' : 'Not Started';
  }
  if (samplesEl) {
    samplesEl.textContent = state.sampleCount.toString();
  }
  if (xEl && state.gazePoint) {
    xEl.textContent = `${state.gazePoint.x.toFixed(0)}px`;
  }
  if (yEl && state.gazePoint) {
    yEl.textContent = `${state.gazePoint.y.toFixed(0)}px`;
  }

  // Update samples grid
  if (gridEl) {
    gridEl.innerHTML = state.calibrationSamples
      .slice()
      .reverse()
      .slice(0, 10)
      .map(sample => `
        <div class="sample-item ${sample.source === 'desktop' ? 'desktop' : ''}">
          <div class="sample-coords">(${sample.x}, ${sample.y})</div>
          ${sample.source === 'desktop' ? '<div class="sample-badge">Desktop</div>' : ''}
        </div>
      `)
      .join('');
  }
}

// Setup debug panel event listeners
function setupDebugPanelEvents() {
  if (!debugPanel) return;

  const toggleBtn = debugPanel.querySelector('#hawkeye-toggle-indicator') as HTMLButtonElement;
  const clearBtn = debugPanel.querySelector('#hawkeye-clear-data') as HTMLButtonElement;
  const pauseBtn = debugPanel.querySelector('#hawkeye-pause') as HTMLButtonElement;
  const syncBtn = debugPanel.querySelector('#hawkeye-sync') as HTMLButtonElement;

  let isPaused = false;

  toggleBtn?.addEventListener('click', () => {
    showIndicator = !showIndicator;
    toggleBtn.textContent = showIndicator ? 'Hide Indicator' : 'Show Indicator';
    if (!showIndicator && gazeIndicator) {
      gazeIndicator.style.display = 'none';
    }
  });

  clearBtn?.addEventListener('click', () => {
    webGazerController.clearCalibrationData();
  });

  pauseBtn?.addEventListener('click', () => {
    if (isPaused) {
      webGazerController.resume();
      pauseBtn.textContent = 'Pause';
      pauseBtn.classList.remove('active');
    } else {
      webGazerController.pause();
      pauseBtn.textContent = 'Resume';
      pauseBtn.classList.add('active');
    }
    isPaused = !isPaused;
  });

  syncBtn?.addEventListener('click', () => {
    // Request sync from desktop via background script
    chrome.runtime.sendMessage({ type: 'webgazer-sync-request' });
  });
}

// Initialize WebGazer overlay
async function initializeWebGazerOverlay() {
  if (isEnabled) return;

  // Create UI elements
  gazeIndicator = createGazeIndicator();
  debugPanel = createDebugPanel();
  document.body.appendChild(gazeIndicator);
  document.body.appendChild(debugPanel);

  // Setup event listeners
  setupDebugPanelEvents();

  // Subscribe to state changes
  webGazerController.subscribe((state) => {
    updateDebugPanel(state);
    updateGazeIndicator(state.gazePoint);
  });

  // Initialize WebGazer
  await webGazerController.initialize();
  isEnabled = true;

  console.log('[Hawkeye WebGazer] Overlay initialized');
}

// Cleanup
function destroyWebGazerOverlay() {
  if (!isEnabled) return;

  webGazerController.destroy();

  gazeIndicator?.remove();
  debugPanel?.remove();
  gazeIndicator = null;
  debugPanel = null;
  isEnabled = false;

  console.log('[Hawkeye WebGazer] Overlay destroyed');
}

// Toggle debug panel visibility
function toggleDebugPanel() {
  showDebug = !showDebug;
  if (debugPanel) {
    debugPanel.style.display = showDebug ? 'block' : 'none';
  }
}

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'webgazer-start':
      initializeWebGazerOverlay().then(() => sendResponse({ success: true }));
      return true;

    case 'webgazer-stop':
      destroyWebGazerOverlay();
      sendResponse({ success: true });
      break;

    case 'webgazer-toggle-debug':
      toggleDebugPanel();
      sendResponse({ success: true, showDebug });
      break;

    case 'webgazer-status':
      sendResponse({
        enabled: isEnabled,
        state: webGazerController.getState(),
      });
      break;

    case 'webgazer-sync-from-desktop':
      if (message.samples && Array.isArray(message.samples)) {
        webGazerController.syncFromDesktop(message.samples);
        sendResponse({ success: true, synced: message.samples.length });
      } else {
        sendResponse({ success: false, error: 'Invalid samples data' });
      }
      break;

    case 'webgazer-export':
      sendResponse({
        success: true,
        samples: webGazerController.exportCalibrationData(),
      });
      break;
  }
});

// Auto-initialize if setting is enabled
chrome.storage.local.get(['webgazer_auto_start']).then((data) => {
  if (data.webgazer_auto_start) {
    initializeWebGazerOverlay();
  }
});

console.log('[Hawkeye WebGazer] Content script loaded');
