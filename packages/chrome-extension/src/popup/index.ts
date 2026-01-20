/**
 * Hawkeye Chrome Extension - Popup Script
 */

interface TaskSuggestion {
  id: string;
  title: string;
  description: string;
  type: string;
  confidence: number;
}

// DOM Elements
const setupPanel = document.getElementById('setupPanel') as HTMLDivElement;
const mainPanel = document.getElementById('mainPanel') as HTMLDivElement;
const apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const observeBtn = document.getElementById('observeBtn') as HTMLButtonElement;
const loading = document.getElementById('loading') as HTMLDivElement;
const suggestionsList = document.getElementById('suggestionsList') as HTMLDivElement;

let selectedId: string | null = null;

// Initialize
async function init() {
  const response = await chrome.runtime.sendMessage({ type: 'get-config' });

  if (!response.hasApiKey) {
    showSetupPanel();
  } else {
    showMainPanel();
    loadSuggestions();
  }
}

function showSetupPanel() {
  setupPanel.classList.remove('hidden');
  mainPanel.classList.add('hidden');
}

function showMainPanel() {
  setupPanel.classList.add('hidden');
  mainPanel.classList.remove('hidden');
}

// Save API Key
saveApiKeyBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    alert('Please enter a valid API key');
    return;
  }

  await chrome.runtime.sendMessage({ type: 'set-api-key', apiKey });
  showMainPanel();
});

// Settings button
settingsBtn.addEventListener('click', () => {
  showSetupPanel();
});

// Observe Page
observeBtn.addEventListener('click', async () => {
  loading.classList.remove('hidden');
  suggestionsList.innerHTML = '';
  observeBtn.disabled = true;

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) throw new Error('No active tab');

    // Get page content
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        content: document.body.innerText.substring(0, 10000),
        selection: window.getSelection()?.toString() || '',
      }),
    });

    const pageData = results[0]?.result;
    if (!pageData) throw new Error('Could not read page content');

    // Send to background for analysis
    const response = await chrome.runtime.sendMessage({
      type: 'analyze',
      context: {
        url: tab.url,
        title: tab.title,
        content: pageData.content,
        selection: pageData.selection,
      },
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    renderSuggestions(response.suggestions);
  } catch (error) {
    suggestionsList.innerHTML = `
      <div class="empty-state" style="color: #c62828;">
        Error: ${(error as Error).message}
      </div>
    `;
  } finally {
    loading.classList.add('hidden');
    observeBtn.disabled = false;
  }
});

// Load existing suggestions
async function loadSuggestions() {
  const response = await chrome.runtime.sendMessage({ type: 'get-suggestions' });
  if (response.suggestions?.length > 0) {
    renderSuggestions(response.suggestions);
  }
}

// Render suggestions
function renderSuggestions(suggestions: TaskSuggestion[]) {
  if (!suggestions || suggestions.length === 0) {
    suggestionsList.innerHTML = `
      <div class="empty-state">
        No suggestions found. Try selecting some text and clicking "Observe Page".
      </div>
    `;
    return;
  }

  suggestionsList.innerHTML = suggestions
    .map(
      (s) => `
    <div class="suggestion-item ${s.id === selectedId ? 'selected' : ''}" data-id="${s.id}">
      <div class="suggestion-header">
        <span class="suggestion-title">${escapeHtml(s.title)}</span>
        <span class="suggestion-confidence ${getConfidenceClass(s.confidence)}">
          ${Math.round(s.confidence * 100)}%
        </span>
      </div>
      <div class="suggestion-desc">${escapeHtml(s.description)}</div>
      <div class="suggestion-type">${s.type}</div>
      <div class="suggestion-execute">
        <button class="btn primary full-width execute-btn" data-id="${s.id}">
          Execute
        </button>
      </div>
    </div>
  `
    )
    .join('');

  // Add click handlers
  suggestionsList.querySelectorAll('.suggestion-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const id = target.dataset.id;

      // Deselect all
      suggestionsList.querySelectorAll('.suggestion-item').forEach((i) => {
        i.classList.remove('selected');
      });

      // Select this one
      target.classList.add('selected');
      selectedId = id || null;
    });
  });

  // Add execute button handlers
  suggestionsList.querySelectorAll('.execute-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = (e.currentTarget as HTMLElement).dataset.id;
      if (id) {
        // TODO: Implement execution logic
        console.log('Execute:', id);
        alert('Task execution coming soon!');
      }
    });
  });
}

function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'suggestions-updated') {
    renderSuggestions(message.suggestions);
  }
});

// Initialize
init();
