/**
 * Suggestions Webview Provider
 */

import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import type { TaskSuggestion } from '@hawkeye/core';

export class SuggestionsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hawkeye.suggestions';

  private _view?: vscode.WebviewView;
  private _suggestions: TaskSuggestion[] = [];
  private _selectedId?: string;

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

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case 'select':
          this._selectedId = data.id;
          break;
        case 'execute':
          vscode.commands.executeCommand('hawkeye.execute');
          break;
        case 'observe':
          vscode.commands.executeCommand('hawkeye.observe');
          break;
      }
    });
  }

  /**
   * Update suggestions list
   */
  public updateSuggestions(suggestions: TaskSuggestion[]) {
    this._suggestions = suggestions;
    this._selectedId = suggestions[0]?.id;
    this.refresh();
  }

  /**
   * Refresh view
   */
  public refresh() {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'update',
        suggestions: this._suggestions,
        selectedId: this._selectedId,
      });
    }
  }

  /**
   * Get selected suggestion ID
   */
  public getSelectedSuggestionId(): string | undefined {
    return this._selectedId;
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get localized strings for webview
    const i18n = {
      suggestions: l10n.t('Suggestions'),
      observe: l10n.t('Observe'),
      noSuggestions: l10n.t('No suggestions yet'),
      clickObserve: l10n.t('Click "Observe" to analyze your screen'),
      typeLabel: l10n.t('Type: {0}', ''),
      executeSelected: l10n.t('Execute Selected'),
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hawkeye Suggestions</title>
  <style>
    body {
      padding: 10px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }

    .header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 12px;
      border-radius: 2px;
      cursor: pointer;
      font-size: 12px;
    }

    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .suggestion-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .suggestion-item {
      padding: 10px;
      margin-bottom: 8px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .suggestion-item:hover {
      border-color: var(--vscode-focusBorder);
    }

    .suggestion-item.selected {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-activeSelectionBackground);
    }

    .suggestion-title {
      font-weight: 600;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .suggestion-confidence {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-badge-background);
      padding: 2px 6px;
      border-radius: 10px;
    }

    .suggestion-desc {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }

    .suggestion-type {
      font-size: 11px;
      color: var(--vscode-textLink-foreground);
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state .icon {
      font-size: 48px;
      margin-bottom: 10px;
      opacity: 0.5;
    }

    .actions {
      display: flex;
      gap: 8px;
      margin-top: 15px;
    }

    .btn-execute {
      flex: 1;
      background: var(--vscode-button-background);
    }
  </style>
</head>
<body>
  <div class="header">
    <h3>🦅 ${i18n.suggestions}</h3>
    <button class="btn" onclick="observe()">${i18n.observe}</button>
  </div>

  <div id="content">
    <div class="empty-state">
      <div class="icon">👁️</div>
      <p>${i18n.noSuggestions}</p>
      <p style="font-size: 12px;">${i18n.clickObserve}</p>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const i18n = ${JSON.stringify(i18n)};

    let suggestions = [];
    let selectedId = null;

    function observe() {
      vscode.postMessage({ type: 'observe' });
    }

    function selectSuggestion(id) {
      selectedId = id;
      vscode.postMessage({ type: 'select', id });
      render();
    }

    function executeSuggestion() {
      if (selectedId) {
        vscode.postMessage({ type: 'execute' });
      }
    }

    function render() {
      const content = document.getElementById('content');

      if (suggestions.length === 0) {
        content.innerHTML = \`
          <div class="empty-state">
            <div class="icon">👁️</div>
            <p>\${i18n.noSuggestions}</p>
            <p style="font-size: 12px;">\${i18n.clickObserve}</p>
          </div>
        \`;
        return;
      }

      content.innerHTML = \`
        <ul class="suggestion-list">
          \${suggestions.map(s => \`
            <li class="suggestion-item \${s.id === selectedId ? 'selected' : ''}"
                onclick="selectSuggestion('\${s.id}')">
              <div class="suggestion-title">
                <span>💡 \${escapeHtml(s.title)}</span>
                <span class="suggestion-confidence">\${Math.round(s.confidence * 100)}%</span>
              </div>
              <div class="suggestion-desc">\${escapeHtml(s.description)}</div>
              <div class="suggestion-type">\${i18n.typeLabel.replace('{0}', '')}\${s.type}</div>
            </li>
          \`).join('')}
        </ul>
        <div class="actions">
          <button class="btn btn-execute" onclick="executeSuggestion()" \${!selectedId ? 'disabled' : ''}>
            ▶️ \${i18n.executeSelected}
          </button>
        </div>
      \`;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Receive messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'update':
          suggestions = message.suggestions || [];
          selectedId = message.selectedId || (suggestions[0]?.id);
          render();
          break;
      }
    });

    // Initial render
    render();
  </script>
</body>
</html>`;
  }
}
