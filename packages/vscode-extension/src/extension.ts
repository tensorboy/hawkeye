/**
 * Hawkeye VS Code Extension
 */

import * as vscode from 'vscode';
import { HawkeyeEngine, type TaskSuggestion } from '@hawkeye/core';
import { SuggestionsViewProvider } from './views/suggestions';

let engine: HawkeyeEngine | null = null;
let suggestionsProvider: SuggestionsViewProvider | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('Hawkeye extension is activating...');

  // 初始化引擎
  initializeEngine(context);

  // 注册视图
  suggestionsProvider = new SuggestionsViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'hawkeye.suggestions',
      suggestionsProvider
    )
  );

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('hawkeye.observe', observeScreen),
    vscode.commands.registerCommand('hawkeye.showSuggestions', showSuggestions),
    vscode.commands.registerCommand('hawkeye.execute', executeSuggestion),
    vscode.commands.registerCommand('hawkeye.configure', configureApiKey)
  );

  // 监听配置变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('hawkeye')) {
        initializeEngine(context);
      }
    })
  );

  console.log('Hawkeye extension activated!');
}

export function deactivate() {
  engine = null;
  suggestionsProvider = null;
}

/**
 * 初始化 Hawkeye 引擎
 */
function initializeEngine(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('hawkeye');
  const apiKey = config.get<string>('apiKey');

  if (!apiKey) {
    vscode.window.showWarningMessage(
      'Hawkeye: Please configure your Anthropic API key',
      'Configure'
    ).then((selection) => {
      if (selection === 'Configure') {
        configureApiKey();
      }
    });
    return;
  }

  engine = new HawkeyeEngine({
    anthropicApiKey: apiKey,
    model: config.get<string>('model'),
    execution: {
      requireConfirmation: config.get<boolean>('requireConfirmation', true),
      onConfirmRequired: async (suggestion) => {
        const result = await vscode.window.showInformationMessage(
          `Execute: ${suggestion.title}?`,
          'Yes',
          'No'
        );
        return result === 'Yes';
      },
    },
  });
}

/**
 * 观察屏幕并生成建议
 */
async function observeScreen() {
  if (!engine) {
    vscode.window.showErrorMessage('Hawkeye: Engine not initialized. Please configure API key.');
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Hawkeye: Observing...',
      cancellable: false,
    },
    async () => {
      try {
        const suggestions = await engine!.observe();

        if (suggestions.length === 0) {
          vscode.window.showInformationMessage('Hawkeye: No suggestions at this time');
          return;
        }

        // 更新侧边栏
        suggestionsProvider?.updateSuggestions(suggestions);

        vscode.window.showInformationMessage(
          `Hawkeye: Found ${suggestions.length} suggestion(s)`,
          'View'
        ).then((selection) => {
          if (selection === 'View') {
            vscode.commands.executeCommand('hawkeye.suggestions.focus');
          }
        });
      } catch (error) {
        vscode.window.showErrorMessage(
          `Hawkeye: Error during observation - ${(error as Error).message}`
        );
      }
    }
  );
}

/**
 * 显示建议面板
 */
async function showSuggestions() {
  if (!engine) {
    vscode.window.showErrorMessage('Hawkeye: Engine not initialized');
    return;
  }

  const suggestions = engine.getSuggestions();

  if (suggestions.length === 0) {
    vscode.window.showInformationMessage(
      'Hawkeye: No suggestions. Run "Observe Screen" first.',
      'Observe'
    ).then((selection) => {
      if (selection === 'Observe') {
        observeScreen();
      }
    });
    return;
  }

  // 显示快速选择
  const items = suggestions.map((s) => ({
    label: `$(lightbulb) ${s.title}`,
    description: `${Math.round(s.confidence * 100)}% confidence`,
    detail: s.description,
    suggestion: s,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a suggestion to execute',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (selected) {
    await executeSuggestionById(selected.suggestion.id);
  }
}

/**
 * 执行选中的建议
 */
async function executeSuggestion() {
  // 从侧边栏获取选中的建议
  const selectedId = suggestionsProvider?.getSelectedSuggestionId();

  if (!selectedId) {
    vscode.window.showInformationMessage('Hawkeye: No suggestion selected');
    return;
  }

  await executeSuggestionById(selectedId);
}

/**
 * 根据 ID 执行建议
 */
async function executeSuggestionById(id: string) {
  if (!engine) {
    vscode.window.showErrorMessage('Hawkeye: Engine not initialized');
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Hawkeye: Executing...',
      cancellable: false,
    },
    async () => {
      try {
        const execution = await engine!.execute(id);

        if (!execution) {
          vscode.window.showErrorMessage('Hawkeye: Suggestion not found');
          return;
        }

        if (execution.status === 'completed') {
          vscode.window.showInformationMessage(
            `Hawkeye: Task completed - ${execution.suggestion.title}`
          );
        } else if (execution.status === 'cancelled') {
          vscode.window.showInformationMessage('Hawkeye: Task cancelled');
        } else {
          vscode.window.showErrorMessage(
            `Hawkeye: Task failed - ${execution.result?.error || 'Unknown error'}`
          );
        }

        // 刷新侧边栏
        suggestionsProvider?.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Hawkeye: Execution error - ${(error as Error).message}`
        );
      }
    }
  );
}

/**
 * 配置 API Key
 */
async function configureApiKey() {
  const apiKey = await vscode.window.showInputBox({
    prompt: 'Enter your Anthropic API Key',
    password: true,
    placeHolder: 'sk-ant-...',
  });

  if (apiKey) {
    await vscode.workspace
      .getConfiguration('hawkeye')
      .update('apiKey', apiKey, vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage('Hawkeye: API Key configured successfully');
  }
}
