/**
 * Hawkeye VS Code Extension - Intents View Provider
 * Webview for displaying intents, plans, and execution status
 */

import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import type { UserIntent, ExecutionPlan, ExecutionProgress } from '../types';

type ViewState = 'intents' | 'plan' | 'execution' | 'result';

export class IntentsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hawkeye.intents';

  private _view?: vscode.WebviewView;
  private _intents: UserIntent[] = [];
  private _currentPlan: ExecutionPlan | null = null;
  private _executionProgress: ExecutionProgress | null = null;
  private _viewState: ViewState = 'intents';
  private _executionResult: { success: boolean; error?: string } | null = null;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview();

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case 'observe':
          vscode.commands.executeCommand('hawkeye.observe');
          break;
        case 'generatePlan':
          vscode.commands.executeCommand('hawkeye.generatePlan', data.intentId);
          break;
        case 'markIrrelevant':
          this._intents = this._intents.filter(i => i.id !== data.intentId);
          this._refresh();
          break;
        case 'executePlan':
          vscode.commands.executeCommand('hawkeye.executePlan');
          break;
        case 'rejectPlan':
          vscode.commands.executeCommand('hawkeye.rejectPlan');
          break;
        case 'backToIntents':
          this._viewState = 'intents';
          this._currentPlan = null;
          this._executionResult = null;
          this._refresh();
          break;
        case 'configure':
          vscode.commands.executeCommand('hawkeye.configure');
          break;
      }
    });
  }

  /**
   * Update intents list
   */
  public updateIntents(intents: UserIntent[]) {
    this._intents = intents;
    this._viewState = 'intents';
    this._refresh();
  }

  /**
   * Show plan view
   */
  public showPlan(plan: ExecutionPlan) {
    this._currentPlan = plan;
    this._viewState = 'plan';
    this._refresh();
  }

  /**
   * Show execution view
   */
  public showExecution() {
    this._viewState = 'execution';
    this._executionProgress = null;
    this._refresh();
  }

  /**
   * Update execution progress
   */
  public updateExecutionProgress(progress: ExecutionProgress) {
    this._executionProgress = progress;
    this._refresh();
  }

  /**
   * Show execution result
   */
  public showExecutionResult(success: boolean, error?: string) {
    this._viewState = 'result';
    this._executionResult = { success, error };
    this._refresh();
  }

  /**
   * Show intents view
   */
  public showIntents() {
    this._viewState = 'intents';
    this._currentPlan = null;
    this._executionProgress = null;
    this._executionResult = null;
    this._refresh();
  }

  private _refresh() {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'update',
        viewState: this._viewState,
        intents: this._intents,
        plan: this._currentPlan,
        progress: this._executionProgress,
        result: this._executionResult,
      });
    }
  }

  private _getHtmlForWebview(): string {
    const i18n = {
      intents: l10n.t('Intents'),
      observe: l10n.t('Observe'),
      noIntents: l10n.t('No intents detected'),
      clickObserve: l10n.t('Click "Observe" to analyze your context'),
      generatePlan: l10n.t('Generate Plan'),
      markIrrelevant: l10n.t('Irrelevant'),
      confidence: l10n.t('Confidence'),
      plan: l10n.t('Execution Plan'),
      steps: l10n.t('Steps'),
      pros: l10n.t('Pros'),
      cons: l10n.t('Considerations'),
      impact: l10n.t('Impact'),
      filesAffected: l10n.t('Files affected'),
      reversible: l10n.t('Reversible'),
      systemChanges: l10n.t('System changes'),
      requiresNetwork: l10n.t('Requires network'),
      execute: l10n.t('Execute'),
      reject: l10n.t('Reject'),
      back: l10n.t('Back'),
      executing: l10n.t('Executing...'),
      step: l10n.t('Step'),
      completed: l10n.t('Completed!'),
      failed: l10n.t('Failed'),
      done: l10n.t('Done'),
      settings: l10n.t('Settings'),
      yes: l10n.t('Yes'),
      no: l10n.t('No'),
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hawkeye Intents</title>
  <style>
    :root {
      --primary: #667eea;
      --primary-dark: #764ba2;
      --success: #00d9a5;
      --warning: #ffc107;
      --danger: #e94560;
    }

    * {
      box-sizing: border-box;
    }

    body {
      padding: 12px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      margin: 0;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .header h3 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .header-actions {
      display: flex;
      gap: 6px;
    }

    .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .btn-success {
      background: var(--success);
      color: #fff;
    }

    .btn-danger {
      background: var(--danger);
      color: #fff;
    }

    .btn-small {
      padding: 2px 8px;
      font-size: 10px;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Intent List */
    .intent-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .intent-item {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
    }

    .intent-item:hover {
      border-color: var(--vscode-focusBorder);
    }

    .intent-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }

    .intent-type {
      font-size: 10px;
      text-transform: uppercase;
      color: var(--primary);
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .intent-confidence {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-badge-background);
      padding: 2px 6px;
      border-radius: 10px;
    }

    .intent-description {
      font-size: 12px;
      margin-bottom: 10px;
      line-height: 1.4;
    }

    .intent-actions {
      display: flex;
      gap: 6px;
    }

    /* Plan View */
    .plan-section {
      margin-bottom: 16px;
    }

    .plan-section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }

    .plan-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .plan-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.4;
    }

    .step-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .step-item {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 10px;
    }

    .step-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .step-number {
      font-size: 10px;
      font-weight: 600;
      color: var(--primary);
    }

    .step-risk {
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 8px;
      text-transform: uppercase;
    }

    .step-risk.low {
      background: rgba(0, 217, 165, 0.15);
      color: var(--success);
    }

    .step-risk.medium {
      background: rgba(255, 193, 7, 0.15);
      color: var(--warning);
    }

    .step-risk.high {
      background: rgba(233, 69, 96, 0.15);
      color: var(--danger);
    }

    .step-description {
      font-size: 11px;
    }

    .pros-cons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .pros-list, .cons-list {
      font-size: 11px;
    }

    .pros-list li {
      color: var(--success);
    }

    .cons-list li {
      color: var(--warning);
    }

    .pros-list, .cons-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .pros-list li::before {
      content: '+ ';
    }

    .cons-list li::before {
      content: '- ';
    }

    .impact-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      font-size: 11px;
    }

    .impact-item {
      display: flex;
      justify-content: space-between;
      padding: 6px 8px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
    }

    .impact-label {
      color: var(--vscode-descriptionForeground);
    }

    .impact-value {
      font-weight: 500;
    }

    .plan-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .plan-actions .btn {
      flex: 1;
      justify-content: center;
      padding: 8px;
    }

    /* Execution View */
    .execution-status {
      text-align: center;
      padding: 20px;
    }

    .execution-icon {
      font-size: 32px;
      margin-bottom: 12px;
    }

    .execution-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .progress-container {
      margin: 16px 0;
    }

    .progress-bar {
      height: 6px;
      background: var(--vscode-panel-border);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--primary), var(--primary-dark));
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 6px;
      text-align: center;
    }

    .current-step {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 12px;
      padding: 10px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
    }

    /* Result View */
    .result-success .execution-icon {
      color: var(--success);
    }

    .result-failed .execution-icon {
      color: var(--danger);
    }

    .error-message {
      font-size: 11px;
      color: var(--danger);
      margin-top: 8px;
      padding: 8px;
      background: rgba(233, 69, 96, 0.1);
      border-radius: 4px;
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 30px 16px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state .icon {
      font-size: 36px;
      margin-bottom: 12px;
      opacity: 0.6;
    }

    .empty-state p {
      margin: 0 0 6px;
      font-size: 12px;
    }

    .empty-state .hint {
      font-size: 11px;
      opacity: 0.8;
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 3px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground);
    }
  </style>
</head>
<body>
  <div id="app"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const i18n = ${JSON.stringify(i18n)};

    let state = {
      viewState: 'intents',
      intents: [],
      plan: null,
      progress: null,
      result: null
    };

    function observe() {
      vscode.postMessage({ type: 'observe' });
    }

    function generatePlan(intentId) {
      vscode.postMessage({ type: 'generatePlan', intentId });
    }

    function markIrrelevant(intentId) {
      vscode.postMessage({ type: 'markIrrelevant', intentId });
    }

    function executePlan() {
      vscode.postMessage({ type: 'executePlan' });
    }

    function rejectPlan() {
      vscode.postMessage({ type: 'rejectPlan' });
    }

    function backToIntents() {
      vscode.postMessage({ type: 'backToIntents' });
    }

    function openSettings() {
      vscode.postMessage({ type: 'configure' });
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text || '';
      return div.innerHTML;
    }

    function renderIntentsView() {
      if (state.intents.length === 0) {
        return \`
          <div class="header">
            <h3>🦅 \${i18n.intents}</h3>
            <div class="header-actions">
              <button class="btn" onclick="observe()">👁️ \${i18n.observe}</button>
            </div>
          </div>
          <div class="empty-state">
            <div class="icon">👁️</div>
            <p>\${i18n.noIntents}</p>
            <p class="hint">\${i18n.clickObserve}</p>
          </div>
        \`;
      }

      return \`
        <div class="header">
          <h3>🦅 \${i18n.intents}</h3>
          <div class="header-actions">
            <button class="btn" onclick="observe()">👁️ \${i18n.observe}</button>
          </div>
        </div>
        <div class="intent-list">
          \${state.intents.map(intent => \`
            <div class="intent-item">
              <div class="intent-header">
                <span class="intent-type">\${escapeHtml(intent.type)}</span>
                <span class="intent-confidence">\${Math.round(intent.confidence * 100)}%</span>
              </div>
              <div class="intent-description">\${escapeHtml(intent.description)}</div>
              <div class="intent-actions">
                <button class="btn btn-small" onclick="generatePlan('\${intent.id}')">
                  ✨ \${i18n.generatePlan}
                </button>
                <button class="btn btn-small btn-secondary" onclick="markIrrelevant('\${intent.id}')">
                  \${i18n.markIrrelevant}
                </button>
              </div>
            </div>
          \`).join('')}
        </div>
      \`;
    }

    function renderPlanView() {
      const plan = state.plan;
      if (!plan) return '';

      return \`
        <div class="header">
          <h3>📋 \${i18n.plan}</h3>
          <button class="btn btn-secondary btn-small" onclick="backToIntents()">← \${i18n.back}</button>
        </div>

        <div class="plan-section">
          <div class="plan-title">\${escapeHtml(plan.title)}</div>
          <div class="plan-description">\${escapeHtml(plan.description)}</div>
        </div>

        <div class="plan-section">
          <div class="plan-section-title">\${i18n.steps}</div>
          <div class="step-list">
            \${plan.steps.map((step, index) => \`
              <div class="step-item">
                <div class="step-header">
                  <span class="step-number">\${i18n.step} \${index + 1}</span>
                  <span class="step-risk \${step.risk || 'low'}">\${step.risk || 'low'}</span>
                </div>
                <div class="step-description">\${escapeHtml(step.description)}</div>
              </div>
            \`).join('')}
          </div>
        </div>

        <div class="plan-section">
          <div class="pros-cons">
            <div>
              <div class="plan-section-title">\${i18n.pros}</div>
              <ul class="pros-list">
                \${(plan.pros || []).map(p => \`<li>\${escapeHtml(p)}</li>\`).join('')}
              </ul>
            </div>
            <div>
              <div class="plan-section-title">\${i18n.cons}</div>
              <ul class="cons-list">
                \${(plan.cons || []).map(c => \`<li>\${escapeHtml(c)}</li>\`).join('')}
              </ul>
            </div>
          </div>
        </div>

        \${plan.impact ? \`
          <div class="plan-section">
            <div class="plan-section-title">\${i18n.impact}</div>
            <div class="impact-grid">
              <div class="impact-item">
                <span class="impact-label">\${i18n.filesAffected}</span>
                <span class="impact-value">\${plan.impact.filesAffected || 0}</span>
              </div>
              <div class="impact-item">
                <span class="impact-label">\${i18n.reversible}</span>
                <span class="impact-value">\${plan.impact.reversible ? i18n.yes : i18n.no}</span>
              </div>
              <div class="impact-item">
                <span class="impact-label">\${i18n.systemChanges}</span>
                <span class="impact-value">\${plan.impact.systemChanges ? i18n.yes : i18n.no}</span>
              </div>
              <div class="impact-item">
                <span class="impact-label">\${i18n.requiresNetwork}</span>
                <span class="impact-value">\${plan.impact.requiresNetwork ? i18n.yes : i18n.no}</span>
              </div>
            </div>
          </div>
        \` : ''}

        <div class="plan-actions">
          <button class="btn btn-success" onclick="executePlan()">▶️ \${i18n.execute}</button>
          <button class="btn btn-danger" onclick="rejectPlan()">✕ \${i18n.reject}</button>
        </div>
      \`;
    }

    function renderExecutionView() {
      const progress = state.progress;
      const percentage = progress
        ? Math.round((progress.completedSteps / progress.totalSteps) * 100)
        : 0;

      return \`
        <div class="header">
          <h3>⚡ \${i18n.executing}</h3>
        </div>
        <div class="execution-status">
          <div class="execution-icon">⏳</div>
          <div class="execution-title">\${i18n.executing}</div>
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" style="width: \${percentage}%"></div>
            </div>
            <div class="progress-text">\${i18n.step} \${progress?.completedSteps || 0} / \${progress?.totalSteps || 0}</div>
          </div>
          \${progress?.currentStep ? \`
            <div class="current-step">\${escapeHtml(progress.currentStep)}</div>
          \` : ''}
        </div>
      \`;
    }

    function renderResultView() {
      const result = state.result;
      const isSuccess = result?.success;

      return \`
        <div class="header">
          <h3>\${isSuccess ? '✅' : '❌'} \${isSuccess ? i18n.completed : i18n.failed}</h3>
        </div>
        <div class="execution-status \${isSuccess ? 'result-success' : 'result-failed'}">
          <div class="execution-icon">\${isSuccess ? '✅' : '❌'}</div>
          <div class="execution-title">\${isSuccess ? i18n.completed : i18n.failed}</div>
          \${result?.error ? \`
            <div class="error-message">\${escapeHtml(result.error)}</div>
          \` : ''}
          <div class="plan-actions">
            <button class="btn" onclick="backToIntents()">\${i18n.done}</button>
          </div>
        </div>
      \`;
    }

    function render() {
      const app = document.getElementById('app');

      switch (state.viewState) {
        case 'plan':
          app.innerHTML = renderPlanView();
          break;
        case 'execution':
          app.innerHTML = renderExecutionView();
          break;
        case 'result':
          app.innerHTML = renderResultView();
          break;
        default:
          app.innerHTML = renderIntentsView();
      }
    }

    // Receive messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'update') {
        state = {
          viewState: message.viewState || 'intents',
          intents: message.intents || [],
          plan: message.plan || null,
          progress: message.progress || null,
          result: message.result || null
        };
        render();
      }
    });

    // Initial render
    render();
  </script>
</body>
</html>`;
  }
}
