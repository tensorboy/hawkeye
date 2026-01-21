/**
 * Hawkeye Desktop - Main Process
 * 使用新版 Hawkeye 统一引擎
 */

import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  Hawkeye,
  createHawkeye,
  type HawkeyeConfig,
  type UserIntent,
  type ExecutionPlan,
} from '@hawkeye/core';

// Debug logging helper (log file is managed by bootstrap)
const debugLogPath = path.join(os.homedir(), 'hawkeye_debug.log');
function debugLog(msg: string) {
  const timestamp = new Date().toISOString();
  try {
    fs.appendFileSync(debugLogPath, `[${timestamp}] ${msg}\n`);
  } catch (e) {
    // Ignore write errors
  }
}

debugLog('index.ts loaded, @hawkeye/core imported successfully');

import { initI18n, t } from './i18n';
debugLog('i18n module imported');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let hawkeye: Hawkeye | null = null;

// 扩展 app 类型以添加 isQuitting 标志
declare module 'electron' {
  interface App {
    isQuitting?: boolean;
  }
}

// 配置存储
interface AppConfig {
  aiProvider: 'ollama' | 'gemini' | 'openai';
  ollamaHost?: string;
  ollamaModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  syncPort: number;
  autoStartSync: boolean;
}

const defaultConfig: AppConfig = {
  aiProvider: 'openai',
  ollamaHost: 'http://localhost:11434',
  ollamaModel: 'qwen2.5vl:7b',
  geminiApiKey: '',
  geminiModel: 'gemini-2.0-flash-exp',
  // Antigravity API configuration
  openaiBaseUrl: 'http://74.48.133.20:8045',
  openaiApiKey: 'sk-antigravity-pickfrom2026',
  openaiModel: 'gemini-2.5-flash',
  syncPort: 23789,
  autoStartSync: true,
};

let appConfig: AppConfig = { ...defaultConfig };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 400,
    minHeight: 300,
    frame: true,  // 启用标准窗口边框（包含关闭、最小化、最大化按钮）
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,  // 在任务栏/Dock 显示
    resizable: true,  // 允许调整窗口大小
    show: false,
    titleBarStyle: 'default',  // macOS 标准标题栏样式
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 开发模式下加载本地服务器
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    // DevTools 可通过 Cmd+Option+I 手动打开
    // mainWindow.webContents.openDevTools({ mode: 'detach' });

    // 开发模式下自动显示窗口
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // 窗口关闭时隐藏到托盘（而不是退出应用）
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  // Create tray icon - use a proper icon for macOS menu bar
  let icon: Electron.NativeImage;

  // Determine icon path based on environment
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const iconPath = isDev
    ? path.join(__dirname, '../../resources/icon.png')
    : path.join(process.resourcesPath, 'resources/icon.png');

  console.log('Loading tray icon from:', iconPath);

  try {
    icon = nativeImage.createFromPath(iconPath);
    console.log('Icon loaded, isEmpty:', icon.isEmpty(), 'size:', icon.getSize());
    if (!icon.isEmpty()) {
      // Resize for menu bar (macOS recommends 16x16 or 22x22)
      icon = icon.resize({ width: 18, height: 18 });
      // Set as template image for proper dark/light mode support on macOS
      icon.setTemplateImage(true);
    }
  } catch (e) {
    console.error('Failed to load icon:', e);
    icon = nativeImage.createEmpty();
  }

  // If icon is still empty, create a simple fallback icon (a small colored square)
  if (icon.isEmpty()) {
    console.warn('Failed to load tray icon, using fallback');
    // Create a simple 16x16 PNG with a colored circle (base64 encoded)
    // This is a simple 16x16 gray circle PNG
    const fallbackIconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
      'BHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3' +
      'Lmlua3NjYXBlLm9yZ5vuPBoAAABfSURBVDiNY2CgNmBkZPzPQCbABOWMJFcIBv9JdAETI4' +
      'GA8v8Z/jMwMv5n/M/AwAAGUEEGRgYGCE2KARjNDAyU+4CRkZERbgAy+E9FAwbIgEEZhANN' +
      'AEACP8JAHLQAAAAASUVORK5CYII=';
    icon = nativeImage.createFromDataURL(`data:image/png;base64,${fallbackIconBase64}`);
  }

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

  // 添加 Ollama Provider (只有当明确选择 ollama 时才添加)
  if (appConfig.aiProvider === 'ollama' && appConfig.ollamaHost) {
    config.ai.providers.push({
      type: 'ollama',
      baseUrl: appConfig.ollamaHost,
      model: appConfig.ollamaModel || 'qwen2.5vl:7b',
    } as any);
  }

  // 添加 Gemini Provider (只有当明确选择 gemini 时才添加)
  if (appConfig.aiProvider === 'gemini' && appConfig.geminiApiKey) {
    config.ai.providers.push({
      type: 'gemini',
      apiKey: appConfig.geminiApiKey,
      model: appConfig.geminiModel || 'gemini-2.0-flash-exp',
    } as any);
  }

  // 添加 OpenAI Compatible Provider (e.g., antigravity)
  if (appConfig.aiProvider === 'openai' && appConfig.openaiBaseUrl && appConfig.openaiApiKey) {
    config.ai.providers.push({
      type: 'openai',
      baseUrl: appConfig.openaiBaseUrl,
      apiKey: appConfig.openaiApiKey,
      model: appConfig.openaiModel || 'gemini-2.5-flash',
    } as any);
  }

  // 如果没有配置任何 provider，默认添加 openai (antigravity)
  if (config.ai.providers.length === 0) {
    config.ai.providers.push({
      type: 'openai',
      baseUrl: 'http://74.48.133.20:8045',
      apiKey: 'sk-antigravity-pickfrom2026',
      model: 'gemini-2.5-flash',
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
ipcMain.handle('switch-ai-provider', async (_event, provider: 'ollama' | 'gemini' | 'openai') => {
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

// Prevent app from quitting when all windows are closed (since we're a tray app)
app.on('window-all-closed', (e: Event) => {
  debugLog('window-all-closed event received');
  // Don't quit on macOS - we're a tray app
  if (process.platform === 'darwin') {
    e.preventDefault();
    debugLog('Prevented app quit on macOS');
  }
});

// Application startup
debugLog('Setting up app.whenReady...');

app.whenReady().then(async () => {
  debugLog('App is ready, initializing...');

  try {
    initI18n();
    debugLog('i18n initialized');

    createWindow();
    debugLog('Window created');

    createTray();
    debugLog('Tray created');

    // 注册全局快捷键
    globalShortcut.register('CommandOrControl+Shift+H', () => {
      observeScreen();
    });
    debugLog('Global shortcut registered');

    // 初始化 Hawkeye
    debugLog('Initializing Hawkeye...');
    await initializeHawkeye();
    debugLog('Hawkeye initialized successfully');
  } catch (error) {
    debugLog(`Error during initialization: ${error}`);
    throw error;
  }
});

// 退出前设置标志
app.on('before-quit', () => {
  app.isQuitting = true;
});

// 退出时清理
app.on('will-quit', async () => {
  globalShortcut.unregisterAll();

  if (hawkeye) {
    await hawkeye.shutdown();
  }
});

// Note: window-all-closed is handled earlier to prevent quit on macOS

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
