/**
 * Hawkeye Chrome Extension - Popup Script
 * A2UI Card-based interface (zero text input)
 */

// ============ Types ============

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

// A2UI Card Types
type CardType = 'suggestion' | 'preview' | 'result' | 'progress' | 'confirmation' | 'info' | 'error' | 'choice';

interface A2UICard {
  id: string;
  type: CardType;
  title: string;
  description?: string;
  icon?: string;
  timestamp?: number;
  data?: Record<string, unknown>;
  actions?: Array<{
    id: string;
    label: string;
    type: 'primary' | 'secondary' | 'danger' | 'dismiss';
  }>;
  progress?: {
    current: number;
    total: number;
    percentage: number;
    stepDescription?: string;
  };
  metadata?: {
    confidence?: number;
    source?: string;
    tags?: string[];
  };
}

// ============ State ============

let isConnected = false;
let cards: A2UICard[] = [];
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

// WebGazer State
interface WebGazerState {
  isActive: boolean;
  isLoading: boolean;
  sampleCount: number;
  gazeX: number | null;
  gazeY: number | null;
  error: string | null;
}

let webgazerState: WebGazerState = {
  isActive: false,
  isLoading: false,
  sampleCount: 0,
  gazeX: null,
  gazeY: null,
  error: null,
};

// ============ i18n Helper ============

function getMessage(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

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

// ============ DOM Elements ============

const statusDot = document.getElementById('statusDot') as HTMLSpanElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const settingsPanel = document.getElementById('settingsPanel') as HTMLDivElement;
const backFromSettings = document.getElementById('backFromSettings') as HTMLButtonElement;
const hostInput = document.getElementById('hostInput') as HTMLInputElement;
const portInput = document.getElementById('portInput') as HTMLInputElement;
const floatingBtnCheck = document.getElementById('floatingBtnCheck') as HTMLInputElement;
const notificationsCheck = document.getElementById('notificationsCheck') as HTMLInputElement;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn') as HTMLButtonElement;
const cardContainer = document.getElementById('cardContainer') as HTMLDivElement;
const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;
const analyzeBtn = document.getElementById('analyzeBtn') as HTMLButtonElement;
const clipboardBtn = document.getElementById('clipboardBtn') as HTMLButtonElement;
const sidePanelBtn = document.getElementById('sidePanelBtn') as HTMLButtonElement;

// WebGazer DOM Elements
const webgazerBtn = document.getElementById('webgazerBtn') as HTMLButtonElement;
const webgazerPanel = document.getElementById('webgazerPanel') as HTMLDivElement;
const webgazerCloseBtn = document.getElementById('webgazerCloseBtn') as HTMLButtonElement;
const webgazerSamples = document.getElementById('webgazerSamples') as HTMLSpanElement;
const webgazerPosition = document.getElementById('webgazerPosition') as HTMLSpanElement;
const webgazerToggleBtn = document.getElementById('webgazerToggleBtn') as HTMLButtonElement;
const webgazerToggleIcon = document.getElementById('webgazerToggleIcon') as HTMLSpanElement;
const webgazerToggleText = document.getElementById('webgazerToggleText') as HTMLSpanElement;
const webgazerSyncBtn = document.getElementById('webgazerSyncBtn') as HTMLButtonElement;
const webgazerDebugBtn = document.getElementById('webgazerDebugBtn') as HTMLButtonElement;
const webgazerClearBtn = document.getElementById('webgazerClearBtn') as HTMLButtonElement;

// ============ Card Management ============

function addCard(card: A2UICard): void {
  // Remove existing card with same ID if present
  cards = cards.filter((c) => c.id !== card.id);
  cards.push(card);
  renderCards();
}

function removeCard(cardId: string): void {
  cards = cards.filter((c) => c.id !== cardId);
  renderCards();
}

function updateCard(cardId: string, updates: Partial<A2UICard>): void {
  cards = cards.map((c) => (c.id === cardId ? { ...c, ...updates } : c));
  renderCards();
}

function clearCards(): void {
  cards = [];
  renderCards();
}

// ============ Card Rendering ============

function renderCards(): void {
  if (cards.length === 0) {
    cardContainer.innerHTML = `
      <div class="a2ui-empty-state">
        <div class="empty-icon">🦅</div>
        <p>${getMessage('emptyStateIntents') || 'Click "Analyze" to observe the current page'}</p>
      </div>
    `;
    return;
  }

  cardContainer.innerHTML = cards.map((card) => renderCard(card)).join('');
  attachCardEventListeners();
  scrollToBottom();
}

function renderCard(card: A2UICard): string {
  switch (card.type) {
    case 'suggestion':
      return renderSuggestionCard(card);
    case 'preview':
      return renderPreviewCard(card);
    case 'progress':
      return renderProgressCard(card);
    case 'result':
      return renderResultCard(card);
    case 'confirmation':
      return renderConfirmationCard(card);
    case 'info':
      return renderInfoCard(card);
    case 'error':
      return renderErrorCard(card);
    case 'choice':
      return renderChoiceCard(card);
    default:
      return renderInfoCard(card);
  }
}

function renderSuggestionCard(card: A2UICard): string {
  const confidenceClass = getConfidenceClass(card.metadata?.confidence || 0);
  const confidencePercent = Math.round((card.metadata?.confidence || 0) * 100);

  return `
    <div class="a2ui-card suggestion" data-card-id="${card.id}">
      <div class="a2ui-card-header">
        <span class="a2ui-card-icon">${card.icon || '💡'}</span>
        <span class="a2ui-card-title">${escapeHtml(card.title)}</span>
        ${card.metadata?.confidence ? `
          <span class="a2ui-card-badge ${confidenceClass}">${confidencePercent}%</span>
        ` : ''}
        <button class="a2ui-card-dismiss" data-action="dismiss" data-card-id="${card.id}">×</button>
      </div>
      ${card.description ? `
        <div class="a2ui-card-body">
          <p class="a2ui-card-desc">${escapeHtml(card.description)}</p>
        </div>
      ` : ''}
      ${card.actions?.length ? `
        <div class="a2ui-card-actions">
          ${card.actions.map((action) => `
            <button class="a2ui-action-btn ${action.type}" data-action="${action.id}" data-card-id="${card.id}">
              ${escapeHtml(action.label)}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderPreviewCard(card: A2UICard): string {
  const plan = card.data as ExecutionPlan | undefined;

  let stepsHtml = '';
  if (plan?.steps) {
    stepsHtml = `
      <div class="a2ui-preview-steps">
        ${plan.steps.map((step) => `
          <div class="a2ui-preview-step">
            <span class="step-number">${step.order}</span>
            <span class="step-desc">${escapeHtml(step.description)}</span>
            <span class="step-risk ${step.riskLevel}">${step.riskLevel}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  let impactHtml = '';
  if (plan?.impact) {
    impactHtml = `
      <div class="a2ui-preview-impact">
        <span class="impact-item">📁 ${plan.impact.filesAffected} files</span>
        <span class="impact-item ${plan.impact.fullyReversible ? 'positive' : 'warning'}">
          ${plan.impact.fullyReversible ? '↩️ Reversible' : '⚠️ Not reversible'}
        </span>
        ${plan.impact.requiresNetwork ? '<span class="impact-item">🌐 Network</span>' : ''}
      </div>
    `;
  }

  return `
    <div class="a2ui-card preview" data-card-id="${card.id}">
      <div class="a2ui-card-header">
        <span class="a2ui-card-icon">${card.icon || '📋'}</span>
        <span class="a2ui-card-title">${escapeHtml(card.title)}</span>
        <button class="a2ui-card-dismiss" data-action="dismiss" data-card-id="${card.id}">×</button>
      </div>
      <div class="a2ui-card-body">
        ${card.description ? `<p class="a2ui-card-desc">${escapeHtml(card.description)}</p>` : ''}
        ${stepsHtml}
        ${impactHtml}
      </div>
      ${card.actions?.length ? `
        <div class="a2ui-card-actions">
          ${card.actions.map((action) => `
            <button class="a2ui-action-btn ${action.type}" data-action="${action.id}" data-card-id="${card.id}">
              ${escapeHtml(action.label)}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderProgressCard(card: A2UICard): string {
  const progress = card.progress || { current: 0, total: 1, percentage: 0 };

  return `
    <div class="a2ui-card progress" data-card-id="${card.id}">
      <div class="a2ui-card-header">
        <span class="a2ui-card-icon">${card.icon || '⏳'}</span>
        <span class="a2ui-card-title">${escapeHtml(card.title)}</span>
      </div>
      <div class="a2ui-card-body">
        <div class="a2ui-progress-bar">
          <div class="a2ui-progress-fill" style="width: ${progress.percentage}%"></div>
        </div>
        <div class="a2ui-progress-info">
          <span class="progress-step">Step ${progress.current}/${progress.total}</span>
          <span class="progress-percent">${Math.round(progress.percentage)}%</span>
        </div>
        ${progress.stepDescription ? `
          <p class="a2ui-progress-desc">${escapeHtml(progress.stepDescription)}</p>
        ` : ''}
      </div>
      ${card.actions?.length ? `
        <div class="a2ui-card-actions">
          ${card.actions.map((action) => `
            <button class="a2ui-action-btn ${action.type}" data-action="${action.id}" data-card-id="${card.id}">
              ${escapeHtml(action.label)}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderResultCard(card: A2UICard): string {
  const isSuccess = card.data?.success !== false;

  return `
    <div class="a2ui-card result ${isSuccess ? 'success' : 'error'}" data-card-id="${card.id}">
      <div class="a2ui-card-header">
        <span class="a2ui-card-icon">${card.icon || (isSuccess ? '✓' : '✕')}</span>
        <span class="a2ui-card-title">${escapeHtml(card.title)}</span>
        <button class="a2ui-card-dismiss" data-action="dismiss" data-card-id="${card.id}">×</button>
      </div>
      ${card.description ? `
        <div class="a2ui-card-body">
          <p class="a2ui-card-desc">${escapeHtml(card.description)}</p>
        </div>
      ` : ''}
      ${card.actions?.length ? `
        <div class="a2ui-card-actions">
          ${card.actions.map((action) => `
            <button class="a2ui-action-btn ${action.type}" data-action="${action.id}" data-card-id="${card.id}">
              ${escapeHtml(action.label)}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderConfirmationCard(card: A2UICard): string {
  return `
    <div class="a2ui-card confirmation" data-card-id="${card.id}">
      <div class="a2ui-card-header">
        <span class="a2ui-card-icon">${card.icon || '⚠️'}</span>
        <span class="a2ui-card-title">${escapeHtml(card.title)}</span>
      </div>
      ${card.description ? `
        <div class="a2ui-card-body">
          <p class="a2ui-card-desc">${escapeHtml(card.description)}</p>
        </div>
      ` : ''}
      ${card.actions?.length ? `
        <div class="a2ui-card-actions">
          ${card.actions.map((action) => `
            <button class="a2ui-action-btn ${action.type}" data-action="${action.id}" data-card-id="${card.id}">
              ${escapeHtml(action.label)}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderInfoCard(card: A2UICard): string {
  return `
    <div class="a2ui-card info" data-card-id="${card.id}">
      <div class="a2ui-card-header">
        <span class="a2ui-card-icon">${card.icon || 'ℹ️'}</span>
        <span class="a2ui-card-title">${escapeHtml(card.title)}</span>
        <button class="a2ui-card-dismiss" data-action="dismiss" data-card-id="${card.id}">×</button>
      </div>
      ${card.description ? `
        <div class="a2ui-card-body">
          <p class="a2ui-card-desc">${escapeHtml(card.description)}</p>
        </div>
      ` : ''}
    </div>
  `;
}

function renderErrorCard(card: A2UICard): string {
  return `
    <div class="a2ui-card error" data-card-id="${card.id}">
      <div class="a2ui-card-header">
        <span class="a2ui-card-icon">${card.icon || '❌'}</span>
        <span class="a2ui-card-title">${escapeHtml(card.title)}</span>
        <button class="a2ui-card-dismiss" data-action="dismiss" data-card-id="${card.id}">×</button>
      </div>
      ${card.description ? `
        <div class="a2ui-card-body">
          <p class="a2ui-card-desc">${escapeHtml(card.description)}</p>
        </div>
      ` : ''}
      ${card.actions?.length ? `
        <div class="a2ui-card-actions">
          ${card.actions.map((action) => `
            <button class="a2ui-action-btn ${action.type}" data-action="${action.id}" data-card-id="${card.id}">
              ${escapeHtml(action.label)}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderChoiceCard(card: A2UICard): string {
  return `
    <div class="a2ui-card choice" data-card-id="${card.id}">
      <div class="a2ui-card-header">
        <span class="a2ui-card-icon">${card.icon || '🔀'}</span>
        <span class="a2ui-card-title">${escapeHtml(card.title)}</span>
      </div>
      ${card.description ? `
        <div class="a2ui-card-body">
          <p class="a2ui-card-desc">${escapeHtml(card.description)}</p>
        </div>
      ` : ''}
      ${card.actions?.length ? `
        <div class="a2ui-card-actions vertical">
          ${card.actions.map((action) => `
            <button class="a2ui-action-btn ${action.type}" data-action="${action.id}" data-card-id="${card.id}">
              ${escapeHtml(action.label)}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function attachCardEventListeners(): void {
  // Action buttons
  cardContainer.querySelectorAll('.a2ui-action-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const action = target.dataset.action;
      const cardId = target.dataset.cardId;
      if (action && cardId) {
        handleCardAction(cardId, action);
      }
    });
  });

  // Dismiss buttons
  cardContainer.querySelectorAll('.a2ui-card-dismiss').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const cardId = target.dataset.cardId;
      if (cardId) {
        removeCard(cardId);
      }
    });
  });
}

function scrollToBottom(): void {
  cardContainer.scrollTop = cardContainer.scrollHeight;
}

// ============ Card Action Handlers ============

async function handleCardAction(cardId: string, action: string): Promise<void> {
  const card = cards.find((c) => c.id === cardId);
  if (!card) return;

  switch (action) {
    case 'generate_plan':
      await handleGeneratePlan(card);
      break;
    case 'reject':
      handleRejectIntent(card);
      break;
    case 'execute':
      await handleExecutePlan();
      break;
    case 'reject_plan':
      await handleRejectPlan();
      break;
    case 'pause':
      await handlePauseExecution();
      break;
    case 'cancel':
      await handleCancelExecution();
      break;
    case 'done':
      handleDone(cardId);
      break;
    case 'retry':
      handleRetry();
      break;
    case 'dismiss':
      removeCard(cardId);
      break;
    default:
      console.log('Unknown action:', action);
  }
}

async function handleGeneratePlan(card: A2UICard): Promise<void> {
  const intentId = card.data?.intentId as string;
  if (!intentId) return;

  // Remove the suggestion card
  removeCard(card.id);

  // Show loading card
  addCard({
    id: 'loading-plan',
    type: 'progress',
    title: 'Generating Plan',
    icon: '🔄',
    progress: { current: 0, total: 1, percentage: 0, stepDescription: 'Analyzing intent...' },
  });

  // Send feedback to accept this intent
  await chrome.runtime.sendMessage({
    type: 'intent-feedback',
    intentId,
    feedback: 'accept',
  });
}

function handleRejectIntent(card: A2UICard): void {
  const intentId = card.data?.intentId as string;
  if (!intentId) return;

  chrome.runtime.sendMessage({
    type: 'intent-feedback',
    intentId,
    feedback: 'irrelevant',
  });

  removeCard(card.id);
}

async function handleExecutePlan(): Promise<void> {
  if (!currentPlan) return;

  // Remove preview card, show progress card
  removeCard('plan-preview');

  addCard({
    id: 'execution-progress',
    type: 'progress',
    title: 'Executing Plan',
    icon: '⚙️',
    progress: { current: 0, total: currentPlan.steps.length, percentage: 0, stepDescription: 'Starting...' },
    actions: [
      { id: 'pause', label: 'Pause', type: 'secondary' },
      { id: 'cancel', label: 'Cancel', type: 'danger' },
    ],
  });

  const response = await chrome.runtime.sendMessage({ type: 'confirm-plan' });
  if (!response.success) {
    removeCard('execution-progress');
    addCard({
      id: 'execution-error',
      type: 'error',
      title: 'Execution Failed',
      description: response.error || 'Failed to start execution',
      icon: '❌',
      actions: [{ id: 'dismiss', label: 'Dismiss', type: 'secondary' }],
    });
  }
}

async function handleRejectPlan(): Promise<void> {
  await chrome.runtime.sendMessage({
    type: 'reject-plan',
    reason: 'User rejected',
  });
  currentPlan = null;
  removeCard('plan-preview');
}

async function handlePauseExecution(): Promise<void> {
  if (!currentExecutionId) return;
  await chrome.runtime.sendMessage({
    type: 'pause-execution',
    executionId: currentExecutionId,
  });
}

async function handleCancelExecution(): Promise<void> {
  if (!currentExecutionId) return;
  await chrome.runtime.sendMessage({
    type: 'cancel-execution',
    executionId: currentExecutionId,
  });
  removeCard('execution-progress');
  currentPlan = null;
  currentExecutionId = null;
}

function handleDone(cardId: string): void {
  removeCard(cardId);
  currentPlan = null;
  currentExecutionId = null;
}

function handleRetry(): void {
  removeCard('execution-error');
  if (currentPlan) {
    addCard(planToPreviewCard(currentPlan));
  }
}

// ============ Intent/Plan to Card Converters ============

function intentToSuggestionCard(intent: UserIntent): A2UICard {
  const typeIcons: Record<string, string> = {
    code_explanation: '💭',
    file_operation: '📁',
    search: '🔍',
    navigation: '🧭',
    editing: '✏️',
    default: '💡',
  };

  return {
    id: `intent-${intent.id}`,
    type: 'suggestion',
    title: intent.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: intent.description,
    icon: typeIcons[intent.type] || typeIcons.default,
    metadata: {
      confidence: intent.confidence,
      source: 'page_analysis',
    },
    data: { intentId: intent.id },
    actions: [
      { id: 'generate_plan', label: 'Generate Plan', type: 'primary' },
      { id: 'reject', label: 'Not Relevant', type: 'secondary' },
    ],
  };
}

function planToPreviewCard(plan: ExecutionPlan): A2UICard {
  return {
    id: 'plan-preview',
    type: 'preview',
    title: plan.title,
    description: plan.description,
    icon: '📋',
    data: plan as unknown as Record<string, unknown>,
    actions: [
      { id: 'execute', label: 'Execute', type: 'primary' },
      { id: 'reject_plan', label: 'Cancel', type: 'secondary' },
    ],
  };
}

// ============ Connection Status ============

function updateConnectionStatus(connected: boolean): void {
  isConnected = connected;
  statusDot.classList.toggle('connected', connected);
  statusDot.classList.toggle('disconnected', !connected);
  statusText.textContent = getMessage(connected ? 'connected' : 'disconnected');
}

// ============ Settings ============

function showSettings(): void {
  settingsPanel.classList.remove('hidden');
  loadSettingsToForm();
}

function hideSettings(): void {
  settingsPanel.classList.add('hidden');
}

function loadSettingsToForm(): void {
  hostInput.value = config.desktopHost;
  portInput.value = config.desktopPort.toString();
  floatingBtnCheck.checked = config.showFloatingButton;
  notificationsCheck.checked = config.enableNotifications;
}

async function saveSettings(): Promise<void> {
  config.desktopHost = hostInput.value || 'localhost';
  config.desktopPort = parseInt(portInput.value) || 9527;
  config.showFloatingButton = floatingBtnCheck.checked;
  config.enableNotifications = notificationsCheck.checked;

  await chrome.runtime.sendMessage({
    type: 'save-config',
    config,
  });

  hideSettings();
}

// ============ Quick Actions ============

async function handleRefresh(): Promise<void> {
  clearCards();
  currentIntents = [];
  currentPlan = null;

  addCard({
    id: 'refreshing',
    type: 'info',
    title: 'Refreshing',
    description: 'Checking for new suggestions...',
    icon: '🔄',
  });

  // Request new intents
  const response = await chrome.runtime.sendMessage({ type: 'get-intents' });
  removeCard('refreshing');

  if (response.intents?.length > 0) {
    currentIntents = response.intents;
    currentIntents.forEach((intent) => {
      addCard(intentToSuggestionCard(intent));
    });
  }
}

async function handleAnalyze(): Promise<void> {
  if (!isConnected) {
    addCard({
      id: 'not-connected',
      type: 'error',
      title: 'Not Connected',
      description: 'Please connect to Hawkeye Desktop first',
      icon: '🔌',
      actions: [{ id: 'dismiss', label: 'Dismiss', type: 'secondary' }],
    });
    return;
  }

  clearCards();
  addCard({
    id: 'analyzing',
    type: 'progress',
    title: 'Analyzing Page',
    icon: '👁️',
    progress: { current: 0, total: 1, percentage: 0, stepDescription: 'Observing page content...' },
  });

  try {
    const response = await chrome.runtime.sendMessage({ type: 'analyze-page' });
    removeCard('analyzing');

    if (!response.success) {
      throw new Error(response.error);
    }

    if (response.intents?.length > 0) {
      currentIntents = response.intents;
      currentIntents.forEach((intent) => {
        addCard(intentToSuggestionCard(intent));
      });
    } else {
      addCard({
        id: 'no-intents',
        type: 'info',
        title: 'No Suggestions',
        description: 'No actionable items found on this page',
        icon: '🤷',
      });
    }
  } catch (error) {
    removeCard('analyzing');
    addCard({
      id: 'analyze-error',
      type: 'error',
      title: 'Analysis Failed',
      description: (error as Error).message,
      icon: '❌',
      actions: [{ id: 'dismiss', label: 'Dismiss', type: 'secondary' }],
    });
  }
}

async function handleClipboard(): Promise<void> {
  if (!isConnected) {
    addCard({
      id: 'not-connected',
      type: 'error',
      title: 'Not Connected',
      description: 'Please connect to Hawkeye Desktop first',
      icon: '🔌',
      actions: [{ id: 'dismiss', label: 'Dismiss', type: 'secondary' }],
    });
    return;
  }

  addCard({
    id: 'clipboard-analyzing',
    type: 'progress',
    title: 'Analyzing Clipboard',
    icon: '📋',
    progress: { current: 0, total: 1, percentage: 0, stepDescription: 'Reading clipboard...' },
  });

  try {
    const response = await chrome.runtime.sendMessage({ type: 'analyze-clipboard' });
    removeCard('clipboard-analyzing');

    if (!response.success) {
      throw new Error(response.error);
    }

    if (response.intents?.length > 0) {
      response.intents.forEach((intent: UserIntent) => {
        addCard(intentToSuggestionCard(intent));
      });
    } else {
      addCard({
        id: 'clipboard-empty',
        type: 'info',
        title: 'No Clipboard Data',
        description: 'Clipboard is empty or contains no actionable content',
        icon: '📋',
      });
    }
  } catch (error) {
    removeCard('clipboard-analyzing');
    addCard({
      id: 'clipboard-error',
      type: 'error',
      title: 'Clipboard Analysis Failed',
      description: (error as Error).message,
      icon: '❌',
      actions: [{ id: 'dismiss', label: 'Dismiss', type: 'secondary' }],
    });
  }
}

// ============ WebGazer Controls ============

function showWebGazerPanel(): void {
  webgazerPanel.classList.remove('hidden');
  refreshWebGazerStatus();
}

function hideWebGazerPanel(): void {
  webgazerPanel.classList.add('hidden');
}

function updateWebGazerUI(): void {
  // Update status text
  const statusEl = document.getElementById('webgazerStatus') as HTMLSpanElement;
  if (statusEl) {
    if (webgazerState.isLoading) {
      statusEl.textContent = getMessage('loading') || 'Loading...';
      statusEl.className = 'webgazer-status-value loading';
    } else if (webgazerState.error) {
      statusEl.textContent = getMessage('error') || 'Error';
      statusEl.className = 'webgazer-status-value error';
    } else if (webgazerState.isActive) {
      statusEl.textContent = getMessage('active') || 'Active';
      statusEl.className = 'webgazer-status-value active';
    } else {
      statusEl.textContent = getMessage('inactive') || 'Inactive';
      statusEl.className = 'webgazer-status-value';
    }
  }

  // Update sample count
  if (webgazerSamples) {
    webgazerSamples.textContent = webgazerState.sampleCount.toString();
  }

  // Update gaze position
  if (webgazerPosition) {
    if (webgazerState.gazeX !== null && webgazerState.gazeY !== null) {
      webgazerPosition.textContent = `${Math.round(webgazerState.gazeX)}, ${Math.round(webgazerState.gazeY)}`;
    } else {
      webgazerPosition.textContent = '--';
    }
  }

  // Update toggle button
  if (webgazerToggleBtn && webgazerToggleIcon && webgazerToggleText) {
    if (webgazerState.isActive) {
      webgazerToggleIcon.textContent = '⏹';
      webgazerToggleText.textContent = getMessage('stop') || 'Stop';
      webgazerToggleBtn.classList.add('active');
    } else {
      webgazerToggleIcon.textContent = '▶';
      webgazerToggleText.textContent = getMessage('start') || 'Start';
      webgazerToggleBtn.classList.remove('active');
    }
  }

  // Update quick action button state
  if (webgazerBtn) {
    if (webgazerState.isActive) {
      webgazerBtn.classList.add('webgazer-active');
    } else {
      webgazerBtn.classList.remove('webgazer-active');
    }
  }
}

async function refreshWebGazerStatus(): Promise<void> {
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Request status from content script
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'webgazer-status' });
    if (response) {
      webgazerState = {
        isActive: response.isActive || false,
        isLoading: response.isLoading || false,
        sampleCount: response.sampleCount || 0,
        gazeX: response.gazeX ?? null,
        gazeY: response.gazeY ?? null,
        error: response.error || null,
      };
      updateWebGazerUI();
    }
  } catch (error) {
    console.warn('Failed to get WebGazer status:', error);
    webgazerState = {
      isActive: false,
      isLoading: false,
      sampleCount: 0,
      gazeX: null,
      gazeY: null,
      error: 'Not available on this page',
    };
    updateWebGazerUI();
  }
}

async function toggleWebGazer(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      addCard({
        id: 'webgazer-error',
        type: 'error',
        title: 'WebGazer Error',
        description: 'No active tab found',
        icon: '❌',
      });
      return;
    }

    const messageType = webgazerState.isActive ? 'webgazer-stop' : 'webgazer-start';
    const response = await chrome.tabs.sendMessage(tab.id, { type: messageType });

    if (response?.success) {
      webgazerState.isActive = !webgazerState.isActive;
      webgazerState.isLoading = messageType === 'webgazer-start';
      updateWebGazerUI();

      // Refresh status after a short delay
      setTimeout(refreshWebGazerStatus, 1000);
    } else {
      addCard({
        id: 'webgazer-error',
        type: 'error',
        title: 'WebGazer Error',
        description: response?.error || 'Failed to toggle WebGazer',
        icon: '❌',
      });
    }
  } catch (error) {
    console.error('Failed to toggle WebGazer:', error);
    addCard({
      id: 'webgazer-error',
      type: 'error',
      title: 'WebGazer Error',
      description: 'WebGazer is not available on this page. Try refreshing the page.',
      icon: '❌',
    });
  }
}

async function syncWebGazerWithDesktop(): Promise<void> {
  if (!isConnected) {
    addCard({
      id: 'webgazer-sync-error',
      type: 'error',
      title: 'Sync Failed',
      description: 'Not connected to Hawkeye Desktop',
      icon: '🔌',
    });
    return;
  }

  try {
    // Request sync from background script
    const response = await chrome.runtime.sendMessage({ type: 'webgazer-sync-request' });

    if (response?.success) {
      addCard({
        id: 'webgazer-sync-success',
        type: 'info',
        title: 'Sync Started',
        description: 'Syncing calibration data with desktop...',
        icon: '🔄',
      });

      // Also export extension data to desktop
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const exportResponse = await chrome.tabs.sendMessage(tab.id, { type: 'webgazer-export' });
        if (exportResponse?.samples?.length > 0) {
          await chrome.runtime.sendMessage({
            type: 'webgazer-sync-to-desktop',
            samples: exportResponse.samples,
          });
        }
      }

      // Refresh status
      setTimeout(refreshWebGazerStatus, 1000);
    } else {
      addCard({
        id: 'webgazer-sync-error',
        type: 'error',
        title: 'Sync Failed',
        description: response?.error || 'Failed to sync with desktop',
        icon: '❌',
      });
    }
  } catch (error) {
    console.error('Failed to sync WebGazer:', error);
    addCard({
      id: 'webgazer-sync-error',
      type: 'error',
      title: 'Sync Failed',
      description: 'Failed to sync calibration data',
      icon: '❌',
    });
  }
}

async function toggleWebGazerDebug(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    await chrome.tabs.sendMessage(tab.id, { type: 'webgazer-toggle-debug' });
  } catch (error) {
    console.warn('Failed to toggle WebGazer debug:', error);
  }
}

async function clearWebGazerData(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'webgazer-clear' });

    if (response?.success) {
      webgazerState.sampleCount = 0;
      updateWebGazerUI();
      addCard({
        id: 'webgazer-clear-success',
        type: 'info',
        title: 'Data Cleared',
        description: 'Calibration data has been cleared',
        icon: '🗑️',
      });
    }
  } catch (error) {
    console.warn('Failed to clear WebGazer data:', error);
  }
}

// ============ Event Handlers ============

settingsBtn.addEventListener('click', showSettings);
backFromSettings.addEventListener('click', hideSettings);
saveSettingsBtn.addEventListener('click', saveSettings);
cancelSettingsBtn.addEventListener('click', hideSettings);
refreshBtn.addEventListener('click', handleRefresh);
analyzeBtn.addEventListener('click', handleAnalyze);
clipboardBtn.addEventListener('click', handleClipboard);

// Side Panel button — opens the side panel
sidePanelBtn?.addEventListener('click', async () => {
  try {
    // chrome.sidePanel.open requires a windowId
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) {
      await (chrome as any).sidePanel.open({ windowId: tab.windowId });
      window.close(); // Close popup after opening side panel
    }
  } catch (err) {
    console.warn('Could not open side panel:', err);
  }
});

// WebGazer event handlers
webgazerBtn.addEventListener('click', showWebGazerPanel);
webgazerCloseBtn.addEventListener('click', hideWebGazerPanel);
webgazerToggleBtn.addEventListener('click', toggleWebGazer);
webgazerSyncBtn.addEventListener('click', syncWebGazerWithDesktop);
webgazerDebugBtn.addEventListener('click', toggleWebGazerDebug);
webgazerClearBtn.addEventListener('click', clearWebGazerData);

// ============ Message Handlers ============

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'connection_status':
      updateConnectionStatus(message.connected);
      break;

    case 'intents_updated':
      removeCard('loading-plan');
      removeCard('analyzing');
      currentIntents = message.intents;
      currentIntents.forEach((intent) => {
        addCard(intentToSuggestionCard(intent));
      });
      break;

    case 'plan_updated':
      removeCard('loading-plan');
      currentPlan = message.plan;
      if (currentPlan) {
        addCard(planToPreviewCard(currentPlan));
      }
      break;

    case 'execution_progress':
      currentExecutionId = message.executionId;
      updateCard('execution-progress', {
        progress: {
          current: message.currentStep,
          total: message.totalSteps,
          percentage: message.progress,
          stepDescription: message.stepDescription,
        },
      });
      break;

    case 'execution_completed':
      removeCard('execution-progress');
      addCard({
        id: 'execution-result',
        type: 'result',
        title: 'Execution Completed',
        description: 'All steps completed successfully',
        icon: '✓',
        data: { success: true },
        actions: [{ id: 'done', label: 'Done', type: 'primary' }],
      });
      break;

    case 'execution_failed':
      removeCard('execution-progress');
      addCard({
        id: 'execution-result',
        type: 'result',
        title: 'Execution Failed',
        description: message.error || 'An error occurred during execution',
        icon: '✕',
        data: { success: false },
        actions: [
          { id: 'retry', label: 'Retry', type: 'primary' },
          { id: 'done', label: 'Dismiss', type: 'secondary' },
        ],
      });
      break;

    // WebGazer status updates
    case 'webgazer_status':
      webgazerState = {
        isActive: message.isActive || false,
        isLoading: message.isLoading || false,
        sampleCount: message.sampleCount || 0,
        gazeX: message.gazeX ?? null,
        gazeY: message.gazeY ?? null,
        error: message.error || null,
      };
      updateWebGazerUI();
      break;

    case 'webgazer_ready':
      webgazerState.isActive = true;
      webgazerState.isLoading = false;
      updateWebGazerUI();
      addCard({
        id: 'webgazer-ready',
        type: 'info',
        title: 'Eye Tracking Ready',
        description: 'WebGazer initialized. Click anywhere to calibrate.',
        icon: '👁️',
      });
      break;

    case 'webgazer_calibration_sample':
      webgazerState.sampleCount = message.sampleCount || webgazerState.sampleCount + 1;
      updateWebGazerUI();
      break;

    case 'webgazer_sync_complete':
      removeCard('webgazer-sync-success');
      addCard({
        id: 'webgazer-sync-done',
        type: 'result',
        title: 'Sync Complete',
        description: `Synced ${message.syncedCount || 0} calibration samples`,
        icon: '✓',
        data: { success: true },
      });
      refreshWebGazerStatus();
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

async function init(): Promise<void> {
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
    currentIntents.forEach((intent) => {
      addCard(intentToSuggestionCard(intent));
    });
  }

  // Check for existing plan
  const planResponse = await chrome.runtime.sendMessage({ type: 'get-plan' });
  if (planResponse.plan) {
    currentPlan = planResponse.plan;
    if (currentPlan) {
      addCard(planToPreviewCard(currentPlan));
    }
  }

  // Render initial state
  renderCards();

  // Initialize WebGazer status
  refreshWebGazerStatus();

  // Periodically update WebGazer status while panel is open
  const webgazerStatusInterval = setInterval(() => {
    if (!webgazerPanel.classList.contains('hidden')) {
      refreshWebGazerStatus();
    }
  }, 2000);

  // Clean up interval when popup closes
  window.addEventListener('unload', () => {
    clearInterval(webgazerStatusInterval);
  });
}

init();
