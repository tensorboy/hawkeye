/**
 * Hawkeye Chrome Extension - Popup Script
 * New intent-plan-execution flow
 */

interface UserIntent {
  id: string;
  type: string;
  description: string;
  confidence: number;
  entities?: Array<{ type: string; value: string }>;
}

interface ExecutionPlan {
  id: string;
  title: string;
  description: string;
  steps: Array<{
    order: number;
    description: string;
    actionType: string;
    riskLevel: 'low' | 'medium' | 'high';
  }>;
  pros: string[];
  cons: string[];
  impact: {
    filesAffected: number;
    systemChanges: boolean;
    requiresNetwork: boolean;
    fullyReversible: boolean;
  };
}

interface ExecutionProgress {
  executionId: string;
  currentStep: number;
  totalSteps: number;
  stepDescription: string;
  progress: number;
}

interface ExtensionConfig {
  connectionMode: 'desktop' | 'standalone';
  desktopHost: string;
  desktopPort: number;
  showFloatingButton: boolean;
  enableNotifications: boolean;
}

// State
type ViewMode = 'main' | 'settings' | 'plan' | 'execution';
let currentView: ViewMode = 'main';
let isConnected = false;
let currentIntents: UserIntent[] = [];
let currentPlan: ExecutionPlan | null = null;
let currentExecutionId: string | null = null;
let config: ExtensionConfig = {
  connectionMode: 'desktop',
  desktopHost: 'localhost',
  desktopPort: 9527,
  showFloatingButton: false,
  enableNotifications: true,
};

// i18n helper
function getMessage(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

// Localize UI
function localizeUI(): void {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = getMessage(key);
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.setAttribute('title', getMessage(key));
  });
}

// DOM Elements
const connectionBanner = document.getElementById('connectionBanner') as HTMLDivElement;
const connectionText = document.getElementById('connectionText') as HTMLSpanElement;
const mainPanel = document.getElementById('mainPanel') as HTMLDivElement;
const settingsPanel = document.getElementById('settingsPanel') as HTMLDivElement;
const planPanel = document.getElementById('planPanel') as HTMLDivElement;
const executionPanel = document.getElementById('executionPanel') as HTMLDivElement;
const loading = document.getElementById('loading') as HTMLDivElement;
const intentsList = document.getElementById('intentsList') as HTMLDivElement;

// Settings elements
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const backFromSettings = document.getElementById('backFromSettings') as HTMLButtonElement;
const hostInput = document.getElementById('hostInput') as HTMLInputElement;
const portInput = document.getElementById('portInput') as HTMLInputElement;
const floatingBtnCheck = document.getElementById('floatingBtnCheck') as HTMLInputElement;
const notificationsCheck = document.getElementById('notificationsCheck') as HTMLInputElement;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn') as HTMLButtonElement;

// Main panel elements
const observeBtn = document.getElementById('observeBtn') as HTMLButtonElement;

// Plan panel elements
const backFromPlan = document.getElementById('backFromPlan') as HTMLButtonElement;
const planTitle = document.getElementById('planTitle') as HTMLHeadingElement;
const planDesc = document.getElementById('planDesc') as HTMLParagraphElement;
const planSteps = document.getElementById('planSteps') as HTMLOListElement;
const planPros = document.getElementById('planPros') as HTMLUListElement;
const planCons = document.getElementById('planCons') as HTMLUListElement;
const planImpact = document.getElementById('planImpact') as HTMLDivElement;
const executePlanBtn = document.getElementById('executePlanBtn') as HTMLButtonElement;
const rejectPlanBtn = document.getElementById('rejectPlanBtn') as HTMLButtonElement;

// Execution panel elements
const executionProgress = document.getElementById('executionProgress') as HTMLDivElement;
const executionResult = document.getElementById('executionResult') as HTMLDivElement;
const executionStep = document.getElementById('executionStep') as HTMLParagraphElement;
const progressFill = document.getElementById('progressFill') as HTMLDivElement;
const progressText = document.getElementById('progressText') as HTMLSpanElement;
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;
const resultIcon = document.getElementById('resultIcon') as HTMLDivElement;
const resultTitle = document.getElementById('resultTitle') as HTMLHeadingElement;
const resultDesc = document.getElementById('resultDesc') as HTMLParagraphElement;
const doneBtn = document.getElementById('doneBtn') as HTMLButtonElement;

// ============ View Management ============

function showView(view: ViewMode) {
  currentView = view;
  mainPanel.classList.add('hidden');
  settingsPanel.classList.add('hidden');
  planPanel.classList.add('hidden');
  executionPanel.classList.add('hidden');

  switch (view) {
    case 'main':
      mainPanel.classList.remove('hidden');
      break;
    case 'settings':
      settingsPanel.classList.remove('hidden');
      loadSettingsToForm();
      break;
    case 'plan':
      planPanel.classList.remove('hidden');
      renderPlan();
      break;
    case 'execution':
      executionPanel.classList.remove('hidden');
      break;
  }
}

function updateConnectionStatus(connected: boolean) {
  isConnected = connected;
  connectionBanner.classList.toggle('connected', connected);
  connectionBanner.classList.toggle('disconnected', !connected);
  connectionText.textContent = getMessage(connected ? 'connected' : 'disconnected');
}

// ============ Intents ============

function renderIntents(intents: UserIntent[]) {
  if (!intents || intents.length === 0) {
    intentsList.innerHTML = `
      <p class="empty-state">${getMessage('emptyStateIntents')}</p>
    `;
    return;
  }

  intentsList.innerHTML = intents.map((intent) => `
    <div class="intent-item" data-id="${intent.id}">
      <div class="intent-header">
        <span class="intent-type">${intent.type}</span>
        <span class="intent-confidence ${getConfidenceClass(intent.confidence)}">
          ${Math.round(intent.confidence * 100)}%
        </span>
      </div>
      <div class="intent-desc">${escapeHtml(intent.description)}</div>
      <div class="intent-actions">
        <button class="btn primary generate-plan-btn" data-id="${intent.id}">
          ${getMessage('generatePlan')}
        </button>
        <button class="btn secondary mark-irrelevant-btn" data-id="${intent.id}">
          ${getMessage('markIrrelevant')}
        </button>
      </div>
    </div>
  `).join('');

  // Add event listeners
  intentsList.querySelectorAll('.generate-plan-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.id;
      if (id) {
        await requestGeneratePlan(id);
      }
    });
  });

  intentsList.querySelectorAll('.mark-irrelevant-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.id;
      if (id) {
        sendIntentFeedback(id, 'irrelevant');
        // Remove from list
        currentIntents = currentIntents.filter((i) => i.id !== id);
        renderIntents(currentIntents);
      }
    });
  });
}

async function requestGeneratePlan(intentId: string) {
  loading.classList.remove('hidden');
  intentsList.innerHTML = '';

  // Send feedback to accept this intent
  await sendIntentFeedback(intentId, 'accept');

  // Wait for plan to be generated (will come through message)
  // The plan_updated message handler will call showView('plan')
}

async function sendIntentFeedback(intentId: string, feedback: 'accept' | 'reject' | 'irrelevant') {
  await chrome.runtime.sendMessage({
    type: 'intent-feedback',
    intentId,
    feedback,
  });
}

// ============ Plan ============

function renderPlan() {
  if (!currentPlan) return;

  planTitle.textContent = currentPlan.title;
  planDesc.textContent = currentPlan.description;

  // Steps
  planSteps.innerHTML = currentPlan.steps.map((step) => `
    <li class="step-item">
      <span class="step-number">${step.order}</span>
      <div class="step-content">
        <span class="step-desc">${escapeHtml(step.description)}</span>
        <div class="step-meta">
          <span class="step-action">${step.actionType}</span>
          <span class="step-risk ${step.riskLevel}">${step.riskLevel}</span>
        </div>
      </div>
    </li>
  `).join('');

  // Pros
  planPros.innerHTML = currentPlan.pros.map((pro) =>
    `<li>${escapeHtml(pro)}</li>`
  ).join('');

  // Cons
  planCons.innerHTML = currentPlan.cons.map((con) =>
    `<li>${escapeHtml(con)}</li>`
  ).join('');

  // Impact
  const impact = currentPlan.impact;
  planImpact.innerHTML = `
    <div class="impact-item">
      <span class="impact-icon">📁</span>
      <span>${getMessage('filesAffected')}: ${impact.filesAffected}</span>
    </div>
    <div class="impact-item">
      <span class="impact-icon">${impact.fullyReversible ? '✓' : '⚠️'}</span>
      <span class="impact-value ${impact.fullyReversible ? 'positive' : 'warning'}">
        ${getMessage('reversible')}: ${impact.fullyReversible ? 'Yes' : 'No'}
      </span>
    </div>
    ${impact.systemChanges ? `
    <div class="impact-item">
      <span class="impact-icon">⚙️</span>
      <span class="impact-value warning">${getMessage('systemChanges')}</span>
    </div>
    ` : ''}
    ${impact.requiresNetwork ? `
    <div class="impact-item">
      <span class="impact-icon">🌐</span>
      <span>${getMessage('requiresNetwork')}</span>
    </div>
    ` : ''}
  `;
}

// ============ Execution ============

function updateExecutionProgress(progress: ExecutionProgress) {
  currentExecutionId = progress.executionId;
  executionStep.textContent = `${getMessage('step')} ${progress.currentStep}/${progress.totalSteps}: ${progress.stepDescription}`;
  progressFill.style.width = `${progress.progress}%`;
  progressText.textContent = `${Math.round(progress.progress)}%`;
}

function showExecutionResult(success: boolean, message?: string) {
  executionProgress.classList.add('hidden');
  executionResult.classList.remove('hidden');

  if (success) {
    resultIcon.textContent = '✓';
    resultIcon.classList.add('success');
    resultIcon.classList.remove('error');
    resultTitle.textContent = getMessage('executionCompleted');
  } else {
    resultIcon.textContent = '✕';
    resultIcon.classList.add('error');
    resultIcon.classList.remove('success');
    resultTitle.textContent = getMessage('executionFailed');
  }

  resultDesc.textContent = message || '';
}

function resetExecution() {
  executionProgress.classList.remove('hidden');
  executionResult.classList.add('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
  executionStep.textContent = '';
  currentExecutionId = null;
}

// ============ Settings ============

function loadSettingsToForm() {
  hostInput.value = config.desktopHost;
  portInput.value = config.desktopPort.toString();
  floatingBtnCheck.checked = config.showFloatingButton;
  notificationsCheck.checked = config.enableNotifications;
}

async function saveSettings() {
  config.desktopHost = hostInput.value || 'localhost';
  config.desktopPort = parseInt(portInput.value) || 9527;
  config.showFloatingButton = floatingBtnCheck.checked;
  config.enableNotifications = notificationsCheck.checked;

  await chrome.runtime.sendMessage({
    type: 'save-config',
    config,
  });

  showView('main');
}

// ============ Event Handlers ============

// Settings
settingsBtn.addEventListener('click', () => showView('settings'));
backFromSettings.addEventListener('click', () => showView('main'));
saveSettingsBtn.addEventListener('click', saveSettings);
cancelSettingsBtn.addEventListener('click', () => showView('main'));

// Observe
observeBtn.addEventListener('click', async () => {
  if (!isConnected) {
    alert(getMessage('desktopNotConnected'));
    return;
  }

  loading.classList.remove('hidden');
  intentsList.innerHTML = '';
  observeBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'analyze-page' });

    if (!response.success) {
      throw new Error(response.error);
    }

    if (response.intents) {
      currentIntents = response.intents;
      renderIntents(currentIntents);
    }
  } catch (error) {
    intentsList.innerHTML = `
      <div class="error-state">
        ${getMessage('errorPrefix', (error as Error).message)}
      </div>
    `;
  } finally {
    loading.classList.add('hidden');
    observeBtn.disabled = false;
  }
});

// Plan
backFromPlan.addEventListener('click', () => {
  currentPlan = null;
  showView('main');
});

executePlanBtn.addEventListener('click', async () => {
  if (!currentPlan) return;

  const response = await chrome.runtime.sendMessage({ type: 'confirm-plan' });
  if (response.success) {
    resetExecution();
    showView('execution');
  }
});

rejectPlanBtn.addEventListener('click', async () => {
  if (!currentPlan) return;

  await chrome.runtime.sendMessage({
    type: 'reject-plan',
    reason: 'User rejected',
  });
  currentPlan = null;
  showView('main');
});

// Execution
pauseBtn.addEventListener('click', async () => {
  if (!currentExecutionId) return;
  await chrome.runtime.sendMessage({
    type: 'pause-execution',
    executionId: currentExecutionId,
  });
});

cancelBtn.addEventListener('click', async () => {
  if (!currentExecutionId) return;
  await chrome.runtime.sendMessage({
    type: 'cancel-execution',
    executionId: currentExecutionId,
  });
});

doneBtn.addEventListener('click', () => {
  currentPlan = null;
  currentExecutionId = null;
  showView('main');
});

// ============ Message Handlers ============

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'connection_status':
      updateConnectionStatus(message.connected);
      break;

    case 'intents_updated':
      currentIntents = message.intents;
      loading.classList.add('hidden');
      renderIntents(currentIntents);
      break;

    case 'plan_updated':
      currentPlan = message.plan;
      loading.classList.add('hidden');
      showView('plan');
      break;

    case 'execution_progress':
      updateExecutionProgress(message);
      break;

    case 'execution_completed':
      showExecutionResult(true);
      break;

    case 'execution_failed':
      showExecutionResult(false, message.error);
      break;
  }
});

// ============ Helpers ============

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

// ============ Initialization ============

async function init() {
  localizeUI();

  // Load config
  const configResponse = await chrome.runtime.sendMessage({ type: 'get-config' });
  if (configResponse.config) {
    config = configResponse.config;
  }

  // Check connection status
  const statusResponse = await chrome.runtime.sendMessage({ type: 'get-connection-status' });
  updateConnectionStatus(statusResponse.connected);

  // Load existing intents
  const intentsResponse = await chrome.runtime.sendMessage({ type: 'get-intents' });
  if (intentsResponse.intents?.length > 0) {
    currentIntents = intentsResponse.intents;
    renderIntents(currentIntents);
  }

  // Check for existing plan
  const planResponse = await chrome.runtime.sendMessage({ type: 'get-plan' });
  if (planResponse.plan) {
    currentPlan = planResponse.plan;
    showView('plan');
  } else {
    showView('main');
  }
}

init();
