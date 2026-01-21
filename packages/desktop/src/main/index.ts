/**
 * Hawkeye Desktop - Main Process
 * 使用新版 Hawkeye 统一引擎
 */

import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import {
  Hawkeye,
  createHawkeye,
  type HawkeyeConfig,
  type UserIntent,
  type ExecutionPlan,
} from '@hawkeye/core';
import { initI18n, t } from './i18n';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let hawkeye: Hawkeye | null = null;

// 配置存储
interface AppConfig {
  aiProvider: 'ollama' | 'gemini';
  ollamaHost?: string;
  ollamaModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  syncPort: number;
  autoStartSync: boolean;
}

const defaultConfig: AppConfig = {
  aiProvider: 'ollama',
  ollamaHost: 'http://localhost:11434',
  ollamaModel: 'llama3.2-vision',
  geminiApiKey: '',
  geminiModel: 'gemini-2.0-flash-exp',
  syncPort: 23789,
  autoStartSync: true,
};

let appConfig: AppConfig = { ...defaultConfig };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 680,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 开发模式下加载本地服务器
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // 失去焦点时隐藏窗口
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Create tray icon (using empty icon as placeholder)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: t('tray.observeScreen'),
      accelerator: 'CmdOrCtrl+Shift+H',
      click: () => observeScreen(),
    },
    {
      label: t('tray.showSuggestions'),
      click: () => showWindow(),
    },
    { type: 'separator' },
    {
      label: t('tray.settings'),
      click: () => {
        mainWindow?.webContents.send('show-settings');
        showWindow();
      },
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip(t('tray.tooltip'));
  tray.setContextMenu(contextMenu);

  // 点击托盘图标显示/隐藏窗口
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      showWindow();
    }
  });
}

function showWindow() {
  if (!mainWindow) return;

  // 获取鼠标位置，将窗口显示在附近
  const { screen } = require('electron');
  const mousePoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(mousePoint);
  const { width, height } = mainWindow.getBounds();

  // 计算窗口位置（在鼠标位置附近，但不超出屏幕）
  let x = mousePoint.x - width / 2;
  let y = mousePoint.y - height - 10;

  // 确保窗口在屏幕内
  x = Math.max(display.bounds.x, Math.min(x, display.bounds.x + display.bounds.width - width));
  y = Math.max(display.bounds.y, Math.min(y, display.bounds.y + display.bounds.height - height));

  mainWindow.setPosition(Math.round(x), Math.round(y));
  mainWindow.show();
  mainWindow.focus();
}

async function observeScreen() {
  if (!hawkeye?.isInitialized) {
    mainWindow?.webContents.send('error', t('error.notInitialized'));
    showWindow();
    return;
  }

  mainWindow?.webContents.send('loading', true);

  try {
    const intents = await hawkeye.perceiveAndRecognize();
    mainWindow?.webContents.send('intents', intents);
    showWindow();
  } catch (error) {
    mainWindow?.webContents.send('error', (error as Error).message);
  } finally {
    mainWindow?.webContents.send('loading', false);
  }
}

async function initializeHawkeye(): Promise<void> {
  // 构建配置
  const config: HawkeyeConfig = {
    ai: {
      providers: [],
      preferredProvider: appConfig.aiProvider,
      enableFailover: true,
    },
    sync: {
      port: appConfig.syncPort,
    },
    autoStartSync: appConfig.autoStartSync,
  };

  // 添加 Ollama Provider
  if (appConfig.ollamaHost) {
    config.ai.providers.push({
      type: 'ollama',
      baseUrl: appConfig.ollamaHost,
      model: appConfig.ollamaModel || 'llama3.2-vision',
    } as any);
  }

  // 添加 Gemini Provider
  if (appConfig.geminiApiKey) {
    config.ai.providers.push({
      type: 'gemini',
      apiKey: appConfig.geminiApiKey,
      model: appConfig.geminiModel || 'gemini-2.0-flash-exp',
    } as any);
  }

  // 如果没有配置任何 provider，默认添加 ollama
  if (config.ai.providers.length === 0) {
    config.ai.providers.push({
      type: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2-vision',
    } as any);
  }

  hawkeye = createHawkeye(config);

  // 监听事件
  hawkeye.on('module:ready', (module) => {
    mainWindow?.webContents.send('module-ready', module);
  });

  hawkeye.on('ai:provider:ready', (type) => {
    mainWindow?.webContents.send('ai-provider-ready', type);
  });

  hawkeye.on('ai:provider:error', (info) => {
    mainWindow?.webContents.send('ai-provider-error', info);
  });

  hawkeye.on('intents:detected', (intents) => {
    mainWindow?.webContents.send('intents', intents);
  });

  hawkeye.on('plan:generated', (plan) => {
    mainWindow?.webContents.send('plan', plan);
  });

  hawkeye.on('execution:step:start', (data) => {
    mainWindow?.webContents.send('execution-progress', data);
  });

  hawkeye.on('execution:completed', (execution) => {
    mainWindow?.webContents.send('execution-completed', execution);
  });

  hawkeye.on('error', (error) => {
    mainWindow?.webContents.send('error', (error as Error).message);
  });

  try {
    await hawkeye.initialize();
    mainWindow?.webContents.send('hawkeye-ready', hawkeye.getStatus());
  } catch (error) {
    console.error('Hawkeye 初始化失败:', error);
    mainWindow?.webContents.send('error', (error as Error).message);
  }
}

// IPC 处理

// 观察屏幕
ipcMain.handle('observe', async () => {
  await observeScreen();
});

// 为意图生成计划
ipcMain.handle('generate-plan', async (_event, intentId: string) => {
  if (!hawkeye) {
    throw new Error(t('error.notInitialized'));
  }

  const intents = hawkeye.getCurrentIntents();
  const intent = intents.find(i => i.id === intentId);

  if (!intent) {
    throw new Error(t('error.intentNotFound'));
  }

  return hawkeye.generatePlan(intent);
});

// 执行计划
ipcMain.handle('execute-plan', async (_event, planId?: string) => {
  if (!hawkeye) {
    throw new Error(t('error.notInitialized'));
  }

  const plan = hawkeye.getCurrentPlan();
  if (!plan) {
    throw new Error(t('error.planNotFound'));
  }

  return hawkeye.executePlan(plan);
});

// 暂停执行
ipcMain.handle('pause-execution', async (_event, planId: string) => {
  return hawkeye?.pauseExecution(planId) ?? false;
});

// 恢复执行
ipcMain.handle('resume-execution', async (_event, planId: string) => {
  return hawkeye?.resumeExecution(planId);
});

// 取消执行
ipcMain.handle('cancel-execution', async (_event, planId: string) => {
  return hawkeye?.cancelExecution(planId) ?? false;
});

// 提供意图反馈
ipcMain.handle('intent-feedback', async (_event, intentId: string, feedback: 'accept' | 'reject' | 'irrelevant') => {
  await hawkeye?.provideIntentFeedback(intentId, feedback);
});

// 获取当前意图
ipcMain.handle('get-intents', () => {
  return hawkeye?.getCurrentIntents() || [];
});

// 获取当前计划
ipcMain.handle('get-plan', () => {
  return hawkeye?.getCurrentPlan();
});

// 获取状态
ipcMain.handle('get-status', () => {
  return hawkeye?.getStatus() || {
    initialized: false,
    aiReady: false,
    aiProvider: null,
    syncRunning: false,
    syncPort: null,
    connectedClients: 0,
  };
});

// 获取配置
ipcMain.handle('get-config', () => {
  return {
    ...appConfig,
    hasOllama: !!appConfig.ollamaHost,
    hasGemini: !!appConfig.geminiApiKey,
  };
});

// 保存配置
ipcMain.handle('save-config', async (_event, newConfig: Partial<AppConfig>) => {
  appConfig = { ...appConfig, ...newConfig };

  // 如果 hawkeye 已初始化，需要重新初始化
  if (hawkeye) {
    await hawkeye.shutdown();
    await initializeHawkeye();
  }

  return appConfig;
});

// 切换 AI Provider
ipcMain.handle('switch-ai-provider', async (_event, provider: 'ollama' | 'gemini') => {
  return hawkeye?.switchAIProvider(provider) ?? false;
});

// 获取可用的 AI Provider
ipcMain.handle('get-available-providers', () => {
  return hawkeye?.getAvailableProviders() || [];
});

// AI 对话
ipcMain.handle('chat', async (_event, messages: Array<{ role: string; content: string }>) => {
  if (!hawkeye) {
    throw new Error(t('error.notInitialized'));
  }

  return hawkeye.chat(messages as any);
});

// 获取数据库统计
ipcMain.handle('get-stats', () => {
  return hawkeye?.getDatabaseStats();
});

// 清理旧数据
ipcMain.handle('cleanup', async (_event, days: number) => {
  return hawkeye?.cleanupOldData(days) ?? 0;
});

// 旧版兼容 API
ipcMain.handle('execute', async (_event, suggestionId: string) => {
  // 兼容旧版 execute API
  const intents = hawkeye?.getCurrentIntents() || [];
  const intent = intents.find(i => i.id === suggestionId);

  if (intent && hawkeye) {
    const plan = await hawkeye.generatePlan(intent);
    return hawkeye.executePlan(plan);
  }

  return null;
});

ipcMain.handle('getSuggestions', () => {
  // 兼容旧版：将 intents 转换为 suggestions 格式
  const intents = hawkeye?.getCurrentIntents() || [];
  return intents.map(intent => ({
    id: intent.id,
    title: intent.description,
    description: intent.context?.reason || '',
    type: intent.type,
    confidence: intent.confidence,
  }));
});

ipcMain.handle('setApiKey', async (_event, apiKey: string) => {
  // 兼容旧版：假设是 Gemini API Key
  appConfig.geminiApiKey = apiKey;
  if (hawkeye) {
    await hawkeye.shutdown();
    await initializeHawkeye();
  }
});

// Application startup
app.whenReady().then(async () => {
  initI18n();
  createWindow();
  createTray();

  // 注册全局快捷键
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    observeScreen();
  });

  // 初始化 Hawkeye
  await initializeHawkeye();
});

// 退出时清理
app.on('will-quit', async () => {
  globalShortcut.unregisterAll();

  if (hawkeye) {
    await hawkeye.shutdown();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
