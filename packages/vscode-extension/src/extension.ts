/**
 * Hawkeye VS Code Extension
 * Intent → Plan → Execution flow with Desktop communication
 */

import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { IntentsViewProvider } from './views/intents';
import { SyncClient, createSyncClient } from './sync-client';
import type { UserIntent, ExecutionPlan, ExecutionProgress, ExtensionConfig, SyncMessage } from './types';

let syncClient: SyncClient | null = null;
let intentsProvider: IntentsViewProvider | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;

// State
let currentIntents: UserIntent[] = [];
let currentPlan: ExecutionPlan | null = null;
let currentExecutionId: string | null = null;
let config: ExtensionConfig = {
  connectionMode: 'desktop',
  desktopHost: 'localhost',
  desktopPort: 9527,
  enableNotifications: true,
};

export function activate(context: vscode.ExtensionContext) {
  console.log('[Hawkeye] Extension activating...');

  // Load configuration
  loadConfig();

  // Initialize sync client
  initSyncClient(context);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'hawkeye.showStatus';
  statusBarItem.show();
  updateStatusBar(false);
  context.subscriptions.push(statusBarItem);

  // Register views
  intentsProvider = new IntentsViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'hawkeye.intents',
      intentsProvider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('hawkeye.observe', observeContext),
    vscode.commands.registerCommand('hawkeye.showStatus', showConnectionStatus),
    vscode.commands.registerCommand('hawkeye.generatePlan', generatePlan),
    vscode.commands.registerCommand('hawkeye.executePlan', executePlan),
    vscode.commands.registerCommand('hawkeye.rejectPlan', rejectPlan),
    vscode.commands.registerCommand('hawkeye.configure', openSettings),
    vscode.commands.registerCommand('hawkeye.reconnect', reconnect)
  );

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('hawkeye')) {
        loadConfig();
        reconnect();
      }
    })
  );

  console.log('[Hawkeye] Extension activated!');
}

export function deactivate() {
  if (syncClient) {
    syncClient.disconnect();
    syncClient = null;
  }
  intentsProvider = null;
  statusBarItem = null;
}

// ============ Configuration ============

function loadConfig() {
  const vsConfig = vscode.workspace.getConfiguration('hawkeye');
  config = {
    connectionMode: vsConfig.get<'desktop' | 'standalone'>('connectionMode', 'desktop'),
    desktopHost: vsConfig.get<string>('desktopHost', 'localhost'),
    desktopPort: vsConfig.get<number>('desktopPort', 9527),
    enableNotifications: vsConfig.get<boolean>('enableNotifications', true),
  };
}

// ============ Sync Client ============

function initSyncClient(context: vscode.ExtensionContext) {
  syncClient = createSyncClient({
    host: config.desktopHost,
    port: config.desktopPort,
  });

  // Connection events
  syncClient.on('connected', () => {
    updateStatusBar(true);
    if (config.enableNotifications) {
      vscode.window.showInformationMessage(l10n.t('Connected to Hawkeye Desktop'));
    }
  });

  syncClient.on('disconnected', () => {
    updateStatusBar(false);
  });

  syncClient.on('error', () => {
    updateStatusBar(false);
  });

  syncClient.on('max_reconnect_reached', () => {
    vscode.window.showWarningMessage(
      l10n.t('Cannot connect to Hawkeye Desktop. Is it running?'),
      l10n.t('Retry'),
      l10n.t('Settings')
    ).then((selection) => {
      if (selection === l10n.t('Retry')) {
        reconnect();
      } else if (selection === l10n.t('Settings')) {
        openSettings();
      }
    });
  });

  // Intent detected
  syncClient.on('intent_detected', (message: SyncMessage) => {
    const payload = message.payload as { intents: UserIntent[] };
    currentIntents = payload.intents;
    intentsProvider?.updateIntents(currentIntents);

    if (config.enableNotifications && currentIntents.length > 0) {
      vscode.window.showInformationMessage(
        l10n.t('Found {0} intent(s)', currentIntents.length),
        l10n.t('View')
      ).then((selection) => {
        if (selection === l10n.t('View')) {
          vscode.commands.executeCommand('hawkeye.intents.focus');
        }
      });
    }
  });

  // Plan generated
  syncClient.on('plan_generated', (message: SyncMessage) => {
    const payload = message.payload as { plan: ExecutionPlan };
    currentPlan = payload.plan;
    intentsProvider?.showPlan(currentPlan);
  });

  // Execution progress
  syncClient.on('execution_progress', (message: SyncMessage) => {
    const progress = message.payload as ExecutionProgress;
    currentExecutionId = progress.executionId;
    intentsProvider?.updateExecutionProgress(progress);
  });

  // Execution completed
  syncClient.on('execution_completed', () => {
    currentExecutionId = null;
    intentsProvider?.showExecutionResult(true);

    if (config.enableNotifications) {
      vscode.window.showInformationMessage(l10n.t('Execution completed successfully!'));
    }
  });

  // Execution failed
  syncClient.on('execution_failed', (message: SyncMessage) => {
    currentExecutionId = null;
    const payload = message.payload as { error?: string };
    intentsProvider?.showExecutionResult(false, payload.error);

    if (config.enableNotifications) {
      vscode.window.showErrorMessage(l10n.t('Execution failed: {0}', payload.error || 'Unknown error'));
    }
  });

  // Connect
  syncClient.connect().catch(() => {
    // Will retry automatically
  });
}

function reconnect() {
  if (syncClient) {
    syncClient.disconnect();
  }

  syncClient = createSyncClient({
    host: config.desktopHost,
    port: config.desktopPort,
  });

  // Re-register handlers...
  initSyncClient({} as vscode.ExtensionContext);
}

// ============ Status Bar ============

function updateStatusBar(connected: boolean) {
  if (!statusBarItem) return;

  if (connected) {
    statusBarItem.text = '$(eye) Hawkeye';
    statusBarItem.tooltip = l10n.t('Connected to Hawkeye Desktop');
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = '$(eye-closed) Hawkeye';
    statusBarItem.tooltip = l10n.t('Not connected to Desktop');
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
}

// ============ Commands ============

async function showConnectionStatus() {
  const connected = syncClient?.isConnected ?? false;
  const status = syncClient?.status;

  const message = connected
    ? l10n.t('Connected to Hawkeye Desktop\nAI Provider: {0} ({1})',
        status?.aiProvider || 'Unknown',
        status?.aiProviderStatus || 'unknown')
    : l10n.t('Not connected to Hawkeye Desktop');

  const action = await vscode.window.showInformationMessage(
    message,
    connected ? l10n.t('Observe') : l10n.t('Reconnect'),
    l10n.t('Settings')
  );

  if (action === l10n.t('Observe')) {
    observeContext();
  } else if (action === l10n.t('Reconnect')) {
    reconnect();
  } else if (action === l10n.t('Settings')) {
    openSettings();
  }
}

async function observeContext() {
  if (!syncClient?.isConnected) {
    vscode.window.showErrorMessage(
      l10n.t('Not connected to Desktop'),
      l10n.t('Reconnect')
    ).then((selection) => {
      if (selection === l10n.t('Reconnect')) {
        reconnect();
      }
    });
    return;
  }

  const editor = vscode.window.activeTextEditor;
  const context = editor ? {
    filePath: editor.document.uri.fsPath,
    selection: editor.document.getText(editor.selection),
    language: editor.document.languageId,
  } : undefined;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: l10n.t('Analyzing context...'),
      cancellable: false,
    },
    async () => {
      try {
        const intents = await syncClient!.requestObserve(context);
        currentIntents = intents;
        intentsProvider?.updateIntents(intents);

        if (intents.length === 0) {
          vscode.window.showInformationMessage(l10n.t('No intents detected'));
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          l10n.t('Error: {0}', (error as Error).message)
        );
      }
    }
  );
}

async function generatePlan(intentId: string) {
  if (!syncClient?.isConnected) {
    vscode.window.showErrorMessage(l10n.t('Not connected to Desktop'));
    return;
  }

  syncClient.sendIntentFeedback(intentId, 'accept');

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: l10n.t('Generating plan...'),
      cancellable: false,
    },
    () => {
      return new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          syncClient?.off('plan_generated', handler);
          resolve();
        }, 60000);

        const handler = () => {
          clearTimeout(timeout);
          syncClient?.off('plan_generated', handler);
          resolve();
        };

        syncClient?.on('plan_generated', handler);
      });
    }
  );
}

function executePlan() {
  if (!syncClient?.isConnected) {
    vscode.window.showErrorMessage(l10n.t('Not connected to Desktop'));
    return;
  }

  if (!currentPlan) {
    vscode.window.showErrorMessage(l10n.t('No plan to execute'));
    return;
  }

  syncClient.confirmPlan(currentPlan.id);
  intentsProvider?.showExecution();
}

function rejectPlan() {
  if (!syncClient?.isConnected || !currentPlan) {
    return;
  }

  syncClient.rejectPlan(currentPlan.id, 'User rejected');
  currentPlan = null;
  intentsProvider?.showIntents();
}

function openSettings() {
  vscode.commands.executeCommand('workbench.action.openSettings', 'hawkeye');
}
