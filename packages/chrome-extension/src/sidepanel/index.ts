import { SidePanelHeartbeat } from '../background/heartbeat';
import { ChatDB } from '../storage/chat-db';
import type {
  AgentEvent,
  AgentRole,
  AgentEventType,
  AgentMessageType,
  ChatSession,
  AgentMessage,
} from '../agents/types';
import { generateId, getRoleInfo } from '../agents/types';

// === State ===
let heartbeat: SidePanelHeartbeat;
let chatDB: ChatDB;
let currentSessionId: string | null = null;
let isTaskRunning = false;

// === DOM References ===
const chatInput = document.getElementById('chatInput') as HTMLTextAreaElement;
const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
const chatMessages = document.getElementById('chatMessages') as HTMLDivElement;
const voiceBtn = document.getElementById('voiceBtn') as HTMLButtonElement;
const confirmPlanBtn = document.getElementById('confirmPlanBtn') as HTMLButtonElement;
const rejectPlanBtn = document.getElementById('rejectPlanBtn') as HTMLButtonElement;
const cancelTaskBtn = document.getElementById('cancelTaskBtn') as HTMLButtonElement;
const sessionsBtn = document.getElementById('sessionsBtn') as HTMLButtonElement;
const backFromSessions = document.getElementById('backFromSessions') as HTMLButtonElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const welcomeMessage = document.getElementById('welcomeMessage');

// === Initialize ===
async function initialize(): Promise<void> {
  chatDB = new ChatDB();
  await chatDB.open();

  // Connect heartbeat to background
  heartbeat = new SidePanelHeartbeat();
  heartbeat.onStatus(updateConnectionStatus);
  heartbeat.onMessageReceived(handleBackgroundMessage);
  heartbeat.connect();

  // Create or load session
  const sessions = await chatDB.listSessions({ limit: 1 });
  if (sessions.length > 0 && Date.now() - sessions[0].updatedAt < 30 * 60 * 1000) {
    // Resume recent session (< 30 min old)
    currentSessionId = sessions[0].id;
    await loadSessionMessages(sessions[0].id);
  } else {
    // Create new session
    const tab = await getActiveTab();
    const session = await chatDB.createSession(tab?.title, tab?.url);
    currentSessionId = session.id;
  }

  setupEventListeners();
  updateUI();
}

// === Event Listeners ===
let listenersAttached = false;
function setupEventListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  // Send button
  sendBtn.addEventListener('click', handleSend);

  // Enter to send (Shift+Enter for newline)
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
    sendBtn.disabled = !chatInput.value.trim();
  });

  // Suggestion chips
  document.querySelectorAll('.suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const task = (chip as HTMLElement).dataset.task;
      if (task) {
        chatInput.value = task;
        handleSend();
      }
    });
  });

  // Confirm/reject plan
  if (confirmPlanBtn) {
    confirmPlanBtn.addEventListener('click', () => sendToBackground('confirm-plan'));
  }
  if (rejectPlanBtn) {
    rejectPlanBtn.addEventListener('click', () => sendToBackground('reject-plan'));
  }

  // Cancel task
  if (cancelTaskBtn) {
    cancelTaskBtn.addEventListener('click', () => sendToBackground('cancel-task'));
  }

  // Voice button
  if (voiceBtn) {
    voiceBtn.addEventListener('click', toggleVoice);
  }

  // Sessions list
  if (sessionsBtn) {
    sessionsBtn.addEventListener('click', showSessionsList);
  }
  if (backFromSessions) {
    backFromSessions.addEventListener('click', hideSessionsList);
  }

  // Settings (open popup settings)
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage?.();
    });
  }
}

// === Send Message ===
async function handleSend(): Promise<void> {
  const text = chatInput.value.trim();
  if (!text || isTaskRunning) return;

  // Hide welcome message
  welcomeMessage?.classList.add('hidden');

  // Add user message
  const userEvent: AgentEvent = {
    id: generateId(),
    sessionId: currentSessionId!,
    role: 'user',
    type: 'user_input',
    content: text,
    timestamp: Date.now(),
  };

  appendMessage(userEvent);
  await chatDB.addEvent(userEvent);

  // Clear input
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;

  // Send to background for task execution
  isTaskRunning = true;
  updateUI();

  sendToBackground('start-task', { description: text, sessionId: currentSessionId });
}

// === Message Rendering ===
function appendMessage(event: AgentEvent): void {
  const msgEl = document.createElement('div');
  msgEl.className = `chat-message ${event.role}`;
  msgEl.dataset.eventId = event.id;

  // Add role header (except for user messages)
  if (event.role !== 'user') {
    const info = getRoleInfo(event.role);
    const header = document.createElement('div');
    header.className = 'msg-header';
    header.innerHTML = `
      <span class="msg-role" style="color: ${info.color}">${info.label}</span>
      <span class="msg-time">${formatTime(event.timestamp)}</span>
    `;
    msgEl.appendChild(header);
  }

  // Content
  const content = document.createElement('div');
  content.className = 'msg-content';

  if (event.type === 'thinking') {
    content.innerHTML = `
      <div class="thinking-indicator">
        <span>${escapeHtml(event.content)}</span>
        <span class="thinking-dot"></span>
        <span class="thinking-dot"></span>
        <span class="thinking-dot"></span>
      </div>
    `;
  } else if (event.type === 'plan' && event.metadata?.stepCount) {
    // Render plan with step list
    content.innerHTML = renderPlanContent(event.content);
  } else {
    content.textContent = event.content;
  }

  msgEl.appendChild(content);
  chatMessages.appendChild(msgEl);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderPlanContent(content: string): string {
  const lines = content.split('\n');
  let html = `<div>${escapeHtml(lines[0])}</div><div class="plan-steps">`;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      html += `<div class="plan-step">
        <span class="step-status-icon pending">○</span>
        <span>${escapeHtml(line)}</span>
      </div>`;
    }
  }
  html += '</div>';
  return html;
}

// === Background Communication ===
function sendToBackground(type: AgentMessageType, payload: Record<string, unknown> = {}): void {
  const message: AgentMessage = {
    type,
    payload,
    sessionId: currentSessionId || undefined,
    timestamp: Date.now(),
  };
  heartbeat.send(message);
}

function handleBackgroundMessage(message: unknown): void {
  const msg = message as AgentMessage;
  if (!msg?.type) return;

  switch (msg.type) {
    case 'agent-event': {
      const event = msg.payload as unknown as AgentEvent;
      appendMessage(event);
      chatDB.addEvent(event);
      updateAgentIndicator(event.role, event.type);

      // Handle special events
      if (event.type === 'confirmation') {
        showConfirmBanner();
      } else if (event.type === 'completion') {
        isTaskRunning = false;
        hideConfirmBanner();
        updateUI();
      } else if (event.type === 'error' && event.role === 'system') {
        isTaskRunning = false;
        updateUI();
      }
      break;
    }
    case 'page-snapshot':
      // Could update page context display
      break;
    case 'task-progress': {
      const { completed, total } = msg.payload as { completed: number; total: number };
      if (typeof completed === 'number' && typeof total === 'number') {
        updateTaskProgress(completed, total);
      }
      break;
    }
  }
}

// === UI Updates ===
function updateConnectionStatus(status: string): void {
  const dot = document.getElementById('connectionDot');
  if (dot) {
    dot.className = `connection-dot ${status}`;
  }
}

function updateAgentIndicator(role: AgentRole, eventType: AgentEventType): void {
  // Reset all indicators
  document.querySelectorAll('.agent-indicator').forEach((el) => el.classList.remove('active'));

  // Activate current agent
  if (role !== 'user' && role !== 'system') {
    const indicator = document.querySelector(`.agent-indicator[data-agent="${role}"]`);
    if (indicator && eventType !== 'step_complete' && eventType !== 'completion') {
      indicator.classList.add('active');
    }
  }
}

function updateUI(): void {
  // Toggle cancel button visibility
  cancelTaskBtn?.classList.toggle('hidden', !isTaskRunning);
  // Disable input during task
  chatInput.disabled = isTaskRunning;
}

function showConfirmBanner(): void {
  document.getElementById('confirmBanner')?.classList.remove('hidden');
}

function hideConfirmBanner(): void {
  document.getElementById('confirmBanner')?.classList.add('hidden');
}

// === Session Management ===
async function loadSessionMessages(sessionId: string): Promise<void> {
  const events = await chatDB.getEventsForSession(sessionId);
  // Hide welcome if there are events
  if (events.length > 0) {
    welcomeMessage?.classList.add('hidden');
  }
  events.forEach((event) => appendMessage(event));
}

async function showSessionsList(): Promise<void> {
  const sessions = await chatDB.listSessions({ limit: 50 });
  const container = document.getElementById('sessionsContent');
  if (!container) return;

  container.innerHTML = '';

  for (const session of sessions) {
    const item = document.createElement('div');
    item.className = 'session-item';
    item.innerHTML = `
      <div class="session-item-title">${escapeHtml(session.title)}</div>
      <div class="session-item-time">${new Date(session.updatedAt).toLocaleString()}</div>
      ${session.originUrl ? `<div class="session-item-url">${escapeHtml(session.originUrl)}</div>` : ''}
    `;
    item.addEventListener('click', () => switchSession(session.id));
    container.appendChild(item);
  }

  document.getElementById('sessionsList')?.classList.remove('hidden');
}

function hideSessionsList(): void {
  document.getElementById('sessionsList')?.classList.add('hidden');
}

async function switchSession(sessionId: string): Promise<void> {
  currentSessionId = sessionId;
  // Clear messages
  chatMessages.innerHTML = '';
  await loadSessionMessages(sessionId);
  hideSessionsList();
}

// === Helpers ===
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function toggleVoice(): void {
  // Toggle voice recording state
  voiceBtn.classList.toggle('recording');
  sendToBackground(voiceBtn.classList.contains('recording') ? 'voice-start' : 'voice-stop');
}

function updateTaskProgress(completed: number, total: number): void {
  const progressEl = document.getElementById('taskProgress');
  const fillEl = document.getElementById('progressFill');
  const textEl = document.getElementById('progressText');

  if (progressEl && fillEl && textEl) {
    progressEl.classList.remove('hidden');
    const pct = total > 0 ? (completed / total) * 100 : 0;
    fillEl.style.width = `${pct}%`;
    textEl.textContent = `${completed}/${total}`;
  }
}

// === Start ===
initialize().catch(console.error);
