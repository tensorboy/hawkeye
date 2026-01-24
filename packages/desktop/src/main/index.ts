/**
 * Hawkeye Desktop - Main Process
 * 使用新版 Hawkeye 统一引擎
 */

import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, dialog, desktopCapturer, systemPreferences, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
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

// Smart screen observation state
let screenWatcherInterval: NodeJS.Timeout | null = null;
let lastScreenHash: string | null = null;
let isWatching = false;
let isSmartObserveRunning = false; // 防止 smartObserveCheck 重叠执行

/**
 * 安全地向渲染进程发送 IPC 消息
 * 会检查窗口是否存在且未被销毁，避免 "Object has been destroyed" 错误
 */
function safeSend(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// ============= 屏幕录制权限检查 =============

/**
 * 检查并引导用户授予屏幕录制权限（仅 macOS）
 * @returns true 如果权限已授予，false 如果权限被拒绝
 */
async function checkScreenRecordingPermission(): Promise<boolean> {
  // 仅在 macOS 上检查
  if (process.platform !== 'darwin') {
    return true;
  }

  debugLog('Checking screen recording permission on macOS...');

  // 检查当前权限状态
  const status = systemPreferences.getMediaAccessStatus('screen');
  debugLog(`Screen recording permission status: ${status}`);

  if (status === 'granted') {
    debugLog('Screen recording permission already granted');
    return true;
  }

  // 权限未授予，显示引导对话框
  debugLog('Screen recording permission not granted, showing guidance dialog');

  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Hawkeye 需要屏幕录制权限',
    message: '为了正常工作，Hawkeye 需要屏幕录制权限来捕获屏幕内容。',
    detail: '请在系统偏好设置中:\n\n1. 找到「Hawkeye」或「Electron」\n2. 勾选复选框授予权限\n3. 如果找不到，点击 + 按钮添加应用\n\n授权后可能需要重启应用。',
    buttons: ['打开系统设置', '稍后再说'],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    // 用户选择打开系统设置
    debugLog('User chose to open system settings');
    // 打开 macOS 隐私设置 - 屏幕录制
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  } else {
    debugLog('User chose to skip permission setup');
  }

  return false;
}

// ============= 配置持久化 =============
const CONFIG_DIR = path.join(os.homedir(), '.hawkeye');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * 从文件加载配置
 * 如果文件不存在或解析失败，返回默认配置
 */
function loadConfigFromFile(): Partial<AppConfig> {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const config = JSON.parse(data);
      debugLog(`Config loaded from ${CONFIG_FILE}`);
      return config;
    }
  } catch (error) {
    debugLog(`Failed to load config: ${error}`);
  }
  return {};
}

/**
 * 保存配置到文件
 */
function saveConfigToFile(config: AppConfig): void {
  try {
    // 确保配置目录存在
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    debugLog(`Config saved to ${CONFIG_FILE}`);
  } catch (error) {
    debugLog(`Failed to save config: ${error}`);
  }
}

// ============= 自动更新配置 =============
function setupAutoUpdater() {
  // 配置自动更新日志
  autoUpdater.logger = console;

  // 后台静默下载更新
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // 检测到新版本 - 静默处理，只记录日志
  autoUpdater.on('update-available', (info) => {
    debugLog(`Update available: ${info.version}, downloading in background...`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', { version: info.version });
    }
  });

  // 没有新版本
  autoUpdater.on('update-not-available', () => {
    debugLog('No update available');
  });

  // 下载进度 - 静默记录
  autoUpdater.on('download-progress', (progress) => {
    debugLog(`Download progress: ${progress.percent.toFixed(1)}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', progress.percent);
    }
  });

  // 下载完成 - 只在托盘显示小提示，不弹窗打扰用户
  autoUpdater.on('update-downloaded', (info) => {
    debugLog(`Update downloaded: ${info.version}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', { version: info.version });
    }

    // 通知用户更新已就绪（非模态提示）
    if (tray) {
      tray.setToolTip(`Hawkeye - ${t('updater.updateReady')} (v${info.version})`);
    }

    // 可选：显示系统通知而不是弹窗
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: t('updater.updateReady'),
        body: t('updater.restartMessage'),
        silent: true,
      });
      notification.on('click', () => {
        autoUpdater.quitAndInstall();
      });
      notification.show();
    }
  });

  // 更新错误 - 静默处理
  autoUpdater.on('error', (error) => {
    debugLog(`Update error: ${error.message}`);
    console.error('Auto-update error:', error);
  });

  // 检查更新（非开发模式 且 用户开启了自动更新）
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'development') {
    if (appConfig.autoUpdate) {
      // 启动后延迟 5 秒检查更新
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
          debugLog(`Check for updates failed: ${err.message}`);
        });
      }, 5000);

      // 每 4 小时自动检查一次更新
      setInterval(() => {
        if (appConfig.autoUpdate) {
          autoUpdater.checkForUpdates().catch((err) => {
            debugLog(`Periodic update check failed: ${err.message}`);
          });
        }
      }, 4 * 60 * 60 * 1000);
    } else {
      debugLog('Auto-update disabled by user settings');
    }
  }
}

// 应用退出标志（避免使用 isAppQuitting 导致的类型问题）
let isAppQuitting = false;

// 配置存储
interface AppConfig {
  aiProvider: 'ollama' | 'gemini' | 'openai';
  ollamaHost?: string;
  ollamaModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiBaseUrl?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  syncPort: number;
  autoStartSync: boolean;
  autoUpdate: boolean;  // 自动更新开关
  localOnly: boolean;   // 完全本地模式（无网络访问）
  smartObserve: boolean;  // 智能观察模式（检测屏幕变化）
  smartObserveInterval: number;  // 检测间隔（毫秒）
  smartObserveThreshold: number;  // 变化阈值（0-1，越小越敏感）
  onboardingCompleted: boolean;  // 是否完成了初始设置
}

const defaultConfig: AppConfig = {
  aiProvider: 'openai',
  ollamaHost: 'http://localhost:11434',
  ollamaModel: 'qwen2.5vl:7b',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash-preview-05-20',
  geminiBaseUrl: '',
  // Antigravity API configuration
  openaiBaseUrl: 'http://74.48.133.20:8045',
  openaiApiKey: 'sk-antigravity-pickfrom2026',
  openaiModel: 'gemini-3-flash-preview',
  syncPort: 23789,
  autoStartSync: true,
  autoUpdate: true,  // 默认开启自动更新
  localOnly: false,  // 默认关闭完全本地模式
  smartObserve: true,  // 默认开启智能观察
  smartObserveInterval: 3000,  // 默认每3秒检测一次
  smartObserveThreshold: 0.05,  // 默认5%变化阈值
  onboardingCompleted: false,  // 默认未完成初始设置
};

// 推荐的完全本地模型配置
const localOnlyConfig = {
  model: 'qwen3-vl:2b-q4_k_m',  // Qwen3-VL-2B-Instruct Q4_K_M 量化
  alternativeModels: [
    'qwen3-vl:2b',
    'qwen2.5vl:7b',
    'llava:7b',
  ],
};

// 从文件加载配置并与默认配置合并（保证新字段有默认值）
let appConfig: AppConfig = { ...defaultConfig, ...loadConfigFromFile() };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 480,
    minWidth: 320,
    minHeight: 400,
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
    if (!isAppQuitting) {
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
        safeSend('show-settings');
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

  // 直接显示窗口，保持原有位置（不再跟随鼠标移动）
  mainWindow.show();
  mainWindow.focus();
}

async function observeScreen(autoPopup: boolean = true) {
  if (!hawkeye?.isInitialized) {
    safeSend('error', t('error.notInitialized'));
    if (autoPopup) showWindow();
    return;
  }

  safeSend('loading', true);

  try {
    const intents = await hawkeye.perceiveAndRecognize();
    safeSend('intents', intents);
    // 只有手动触发时才弹出窗口，智能观察检测到变化时不弹窗
    if (autoPopup) showWindow();
  } catch (error) {
    safeSend('error', (error as Error).message);
  } finally {
    safeSend('loading', false);
  }
}

// ============= 智能屏幕观察 =============

/**
 * 简单的图片哈希计算 - 使用平均哈希算法
 * 将图片缩小到 8x8，转为灰度，然后计算平均值，生成 64 位哈希
 */
function computeImageHash(imageData: Buffer): string {
  try {
    // 使用 nativeImage 处理图片
    const image = nativeImage.createFromBuffer(imageData);
    if (image.isEmpty()) {
      return '';
    }

    // 获取图片的像素数据（缩小到一个合理大小进行比较）
    const resized = image.resize({ width: 16, height: 16, quality: 'good' });
    const bitmap = resized.toBitmap();

    // 计算简单的像素哈希（将所有像素值相加取模）
    let hash = 0n;
    const step = Math.max(1, Math.floor(bitmap.length / 64));

    for (let i = 0; i < 64 && i * step < bitmap.length; i++) {
      const idx = i * step;
      // BGRA 格式，取灰度值
      const gray = Math.floor((bitmap[idx] + bitmap[idx + 1] + bitmap[idx + 2]) / 3);
      if (gray > 127) {
        hash |= (1n << BigInt(i));
      }
    }

    return hash.toString(16);
  } catch (error) {
    debugLog(`Image hash error: ${error}`);
    return '';
  }
}

/**
 * 计算两个哈希之间的汉明距离（不同的位数）
 */
function hammingDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2) return 64; // 最大距离

  const h1 = BigInt('0x' + hash1);
  const h2 = BigInt('0x' + hash2);
  let xor = h1 ^ h2;
  let count = 0;

  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }

  return count;
}

/**
 * 执行智能屏幕观察检测
 */
async function smartObserveCheck() {
  // 防止重叠执行（如果上一次检测还在运行中，跳过本次）
  if (isSmartObserveRunning) {
    debugLog('Smart observe: Previous check still running, skipping');
    return;
  }

  if (!hawkeye?.isInitialized || !isWatching) {
    return;
  }

  isSmartObserveRunning = true;

  try {
    // 获取当前屏幕截图
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 }, // 较小尺寸用于比较
    });

    if (sources.length === 0) {
      return;
    }

    const thumbnail = sources[0].thumbnail;
    const imageData = thumbnail.toPNG();
    const currentHash = computeImageHash(imageData);

    if (!currentHash) {
      return;
    }

    // 如果是第一次截图，保存并返回
    if (!lastScreenHash) {
      lastScreenHash = currentHash;
      debugLog('Smart observe: Initial screenshot captured');
      return;
    }

    // 计算变化程度
    const distance = hammingDistance(lastScreenHash, currentHash);
    const changeRatio = distance / 64; // 64 位哈希

    debugLog(`Smart observe: Hash distance=${distance}, change=${(changeRatio * 100).toFixed(1)}%`);

    // 发送截屏预览到渲染进程
    const dataUrl = thumbnail.toDataURL();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('screenshot-preview', { dataUrl, timestamp: Date.now() });
    }

    // 如果变化超过阈值，触发分析
    if (changeRatio >= appConfig.smartObserveThreshold) {
      debugLog('Smart observe: Screen change detected, triggering analysis');
      lastScreenHash = currentHash;

      // 通知渲染进程正在检测变化
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('smart-observe-change-detected');
      }

      // 执行完整的屏幕分析（智能观察不自动弹窗，只更新数据）
      await observeScreen(false);
    } else {
      // 更新哈希（即使变化小也要更新，避免渐变累积）
      lastScreenHash = currentHash;
    }
  } catch (error) {
    debugLog(`Smart observe error: ${error}`);
  } finally {
    isSmartObserveRunning = false;
  }
}

/**
 * 启动智能屏幕观察
 */
function startSmartObserve() {
  if (isWatching) {
    debugLog('Smart observe: Already watching');
    return;
  }

  if (!appConfig.smartObserve) {
    debugLog('Smart observe: Disabled in config');
    return;
  }

  isWatching = true;
  lastScreenHash = null;

  // 设置定时检测
  screenWatcherInterval = setInterval(() => {
    smartObserveCheck();
  }, appConfig.smartObserveInterval);

  debugLog(`Smart observe: Started with interval=${appConfig.smartObserveInterval}ms, threshold=${appConfig.smartObserveThreshold}`);
  // Only send IPC if window exists and is not destroyed
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('smart-observe-status', { watching: true });
  }
}

/**
 * 停止智能屏幕观察
 */
function stopSmartObserve() {
  if (screenWatcherInterval) {
    clearInterval(screenWatcherInterval);
    screenWatcherInterval = null;
  }

  isWatching = false;
  isSmartObserveRunning = false; // 重置运行状态
  lastScreenHash = null;

  debugLog('Smart observe: Stopped');
  // Only send IPC if window exists and is not destroyed
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('smart-observe-status', { watching: false });
  }
}

async function initializeHawkeye(): Promise<void> {
  // 构建配置
  const config: HawkeyeConfig = {
    ai: {
      providers: [],
      preferredProvider: appConfig.localOnly ? 'ollama' : appConfig.aiProvider,
      enableFailover: !appConfig.localOnly,  // 完全本地模式禁用故障转移
    },
    sync: {
      port: appConfig.syncPort,
    },
    autoStartSync: appConfig.autoStartSync,
  };

  // 完全本地模式：只使用 Ollama，不添加任何云端 provider
  if (appConfig.localOnly) {
    debugLog('Local-only mode enabled, using Ollama only');
    config.ai!.providers!.push({
      type: 'ollama',
      baseUrl: appConfig.ollamaHost || 'http://localhost:11434',
      model: appConfig.ollamaModel || localOnlyConfig.model,
    } as any);
  } else {
    // 正常模式：根据配置添加 provider

    // 添加 Ollama Provider (只有当明确选择 ollama 时才添加)
    if (appConfig.aiProvider === 'ollama' && appConfig.ollamaHost) {
      config.ai!.providers!.push({
        type: 'ollama',
        baseUrl: appConfig.ollamaHost,
        model: appConfig.ollamaModel || 'qwen2.5vl:7b',
      } as any);
    }

    // 添加 Gemini Provider (只有当明确选择 gemini 时才添加)
    if (appConfig.aiProvider === 'gemini' && appConfig.geminiApiKey) {
      config.ai!.providers!.push({
        type: 'gemini',
        apiKey: appConfig.geminiApiKey,
        model: appConfig.geminiModel || 'gemini-2.5-flash-preview-05-20',
        ...(appConfig.geminiBaseUrl ? { baseUrl: appConfig.geminiBaseUrl } : {}),
      } as any);
    }

    // 添加 OpenAI Compatible Provider (e.g., antigravity)
    if (appConfig.aiProvider === 'openai' && appConfig.openaiBaseUrl && appConfig.openaiApiKey) {
      config.ai!.providers!.push({
        type: 'openai',
        baseUrl: appConfig.openaiBaseUrl,
        apiKey: appConfig.openaiApiKey,
        model: appConfig.openaiModel || 'gemini-3-flash-preview',
      } as any);
    }

    // 如果没有配置任何 provider，默认添加 openai (antigravity)
    if (config.ai!.providers!.length === 0) {
      config.ai!.providers!.push({
        type: 'openai',
        baseUrl: 'http://74.48.133.20:8045',
        apiKey: 'sk-antigravity-pickfrom2026',
        model: 'gemini-3-flash-preview',
      } as any);
    }
  }

  hawkeye = createHawkeye(config);

  // 监听事件 - 所有事件处理器都需要检查窗口是否已销毁
  hawkeye.on('module:ready', (module: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('module-ready', module);
    }
  });

  hawkeye.on('ai:provider:ready', (type: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ai-provider-ready', type);
    }
  });

  hawkeye.on('ai:provider:error', (info: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ai-provider-error', info);
    }
  });

  hawkeye.on('intents:detected', (intents: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('intents', intents);
    }
  });

  hawkeye.on('plan:generated', (plan: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('plan', plan);
    }
  });

  hawkeye.on('execution:step:start', (data: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('execution-progress', data);
    }
  });

  hawkeye.on('execution:completed', (execution: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('execution-completed', execution);
    }
  });

  hawkeye.on('error', (error: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('error', (error as Error).message);
    }
  });

  try {
    await hawkeye.initialize();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hawkeye-ready', hawkeye.getStatus());
    }

    // 自动启动智能观察（如果启用）
    if (appConfig.smartObserve) {
      startSmartObserve();
    }
  } catch (error) {
    console.error('Hawkeye 初始化失败:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('error', (error as Error).message);
    }
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
    localOnlyRecommendedModel: localOnlyConfig.model,
    localOnlyAlternatives: localOnlyConfig.alternativeModels,
  };
});

// 保存配置
ipcMain.handle('save-config', async (_event, newConfig: Partial<AppConfig>) => {
  appConfig = { ...appConfig, ...newConfig };

  // 持久化到文件
  saveConfigToFile(appConfig);

  // 如果 hawkeye 已初始化，需要在后台重新初始化（不阻塞 UI）
  if (hawkeye) {
    // 使用 setImmediate 让重新初始化在后台进行，不阻塞 IPC 响应
    setImmediate(async () => {
      try {
        await hawkeye!.shutdown();
        await initializeHawkeye();
        console.log('[Config] Hawkeye 重新初始化完成');
      } catch (err) {
        console.error('[Config] Hawkeye 重新初始化失败:', err);
      }
    });
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

// 获取执行历史
ipcMain.handle('get-execution-history', (_event, limit: number = 20) => {
  return hawkeye?.getExecutionHistory(limit) ?? [];
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

// 手动检查更新
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, version: result?.updateInfo?.version };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// ============= 智能观察 IPC =============

// 启动智能观察
ipcMain.handle('start-smart-observe', () => {
  startSmartObserve();
  return { success: true, watching: isWatching };
});

// 停止智能观察
ipcMain.handle('stop-smart-observe', () => {
  stopSmartObserve();
  return { success: true, watching: false };
});

// 获取智能观察状态
ipcMain.handle('get-smart-observe-status', () => {
  return {
    watching: isWatching,
    interval: appConfig.smartObserveInterval,
    threshold: appConfig.smartObserveThreshold,
    enabled: appConfig.smartObserve,
  };
});

// 切换智能观察
ipcMain.handle('toggle-smart-observe', () => {
  if (isWatching) {
    stopSmartObserve();
  } else {
    startSmartObserve();
  }
  return { watching: isWatching };
});

// 获取当前截屏（用于预览）
ipcMain.handle('get-screenshot', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 800, height: 600 },
    });

    if (sources.length === 0) {
      return { success: false, error: 'No screen source available' };
    }

    const thumbnail = sources[0].thumbnail;
    const dataUrl = thumbnail.toDataURL();
    return { success: true, dataUrl };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// 获取最后的感知上下文（截图 + OCR）
ipcMain.handle('get-last-context', async () => {
  try {
    if (!hawkeye?.isInitialized) {
      return { success: false, error: 'Hawkeye not initialized' };
    }

    // Type assertion workaround - getLastContext exists in Hawkeye class but tsup declaration generation has issues
    const context = (hawkeye as unknown as { getLastContext: () => { screenshot?: string; ocrText?: string; timestamp: number } | null }).getLastContext();
    if (!context) {
      return { success: false, error: 'No context available' };
    }

    return {
      success: true,
      screenshot: context.screenshot,
      ocrText: context.ocrText,
      timestamp: context.timestamp,
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// 获取当前版本
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ============= 调试时间线 IPC =============

// 获取所有调试事件
ipcMain.handle('debug-get-events', (_event, filter?: {
  types?: string[];
  startTime?: number;
  endTime?: number;
  search?: string;
}) => {
  if (!hawkeye) return [];
  const collector = hawkeye.getEventCollector();
  if (filter) {
    return collector.getFiltered(filter as any);
  }
  return collector.getAll();
});

// 获取最近的调试事件
ipcMain.handle('debug-get-recent', (_event, count: number = 50) => {
  if (!hawkeye) return [];
  return hawkeye.getEventCollector().getRecent(count);
});

// 获取自某个时间戳以来的事件
ipcMain.handle('debug-get-since', (_event, timestamp: number) => {
  if (!hawkeye) return [];
  return hawkeye.getEventCollector().getSince(timestamp);
});

// 清空调试事件
ipcMain.handle('debug-clear-events', () => {
  if (!hawkeye) return false;
  hawkeye.getEventCollector().clear();
  return true;
});

// 暂停事件收集
ipcMain.handle('debug-pause', () => {
  if (!hawkeye) return false;
  hawkeye.getEventCollector().pause();
  return true;
});

// 恢复事件收集
ipcMain.handle('debug-resume', () => {
  if (!hawkeye) return false;
  hawkeye.getEventCollector().resume();
  return true;
});

// 获取收集状态
ipcMain.handle('debug-get-status', () => {
  if (!hawkeye) return { paused: false, count: 0, totalCount: 0 };
  const collector = hawkeye.getEventCollector();
  return {
    paused: collector.isPaused(),
    count: collector.getCount(),
    totalCount: collector.getTotalCount(),
    config: collector.getConfig(),
  };
});

// 导出调试事件为 JSON
ipcMain.handle('debug-export', () => {
  if (!hawkeye) return null;
  return hawkeye.getEventCollector().exportJSON();
});

// 更新收集器配置
ipcMain.handle('debug-update-config', (_event, config: {
  maxEvents?: number;
  enableScreenshots?: boolean;
  screenshotThumbnailSize?: number;
  truncateTextAt?: number;
}) => {
  if (!hawkeye) return false;
  hawkeye.getEventCollector().updateConfig(config);
  return true;
});

// ============= Ollama 模型管理 =============

// 获取已安装的 Ollama 模型列表
ipcMain.handle('ollama-list-models', async () => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync('ollama list', { timeout: 10000 });
    const lines = stdout.trim().split('\n').slice(1); // 跳过标题行
    const models = lines.map(line => {
      const parts = line.split(/\s+/);
      return {
        name: parts[0],
        id: parts[1] || '',
        size: parts[2] || '',
        modified: parts.slice(3).join(' ') || '',
      };
    }).filter(m => m.name);
    return { success: true, models };
  } catch (error) {
    return { success: false, error: (error as Error).message, models: [] };
  }
});

// 下载/拉取 Ollama 模型（带进度）
ipcMain.handle('ollama-pull-model', async (_event, modelName: string) => {
  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    try {
      console.log(`[Ollama] 开始下载模型: ${modelName}`);
      safeSend('ollama-pull-start', modelName);

      // 使用 shell 模式确保命令可以在 macOS/Linux 上正确找到
      const isWin = process.platform === 'win32';

      let proc;
      try {
        proc = spawn(isWin ? 'ollama' : 'ollama', ['pull', modelName], {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,  // 使用 shell 模式来解析 PATH
          env: {
            ...process.env,
            // 确保包含常见的 PATH 路径
            PATH: process.env.PATH + (isWin ? '' : ':/usr/local/bin:/opt/homebrew/bin'),
          },
        });
      } catch (spawnError) {
        console.error(`[Ollama] spawn 失败:`, spawnError);
        const errorMsg = `无法启动 Ollama: ${(spawnError as Error).message}。请确保 Ollama 已安装。`;
        safeSend('ollama-pull-progress', {
          model: modelName,
          output: errorMsg,
          isError: true,
        });
        safeSend('ollama-pull-complete', {
          model: modelName,
          success: false,
          error: errorMsg,
        });
        resolve({ success: false, model: modelName, error: errorMsg });
        return;
      }

      console.log(`[Ollama] 子进程已启动，PID: ${proc.pid}`);

      let lastProgress = '';

      proc.stdout?.on('data', (data) => {
        try {
          const output = data.toString();
          console.log(`[Ollama] ${output.trim()}`);

          // 解析进度信息
          // Ollama pull 输出格式: pulling manifest, pulling sha256:xxx, 100% ▕██████████▏ 1.5 GB
          const progressMatch = output.match(/(\d+)%/);
          const sizeMatch = output.match(/(\d+\.?\d*)\s*(GB|MB|KB|B)/i);

          if (progressMatch || output !== lastProgress) {
            lastProgress = output;
            safeSend('ollama-pull-progress', {
              model: modelName,
              output: output.trim(),
              progress: progressMatch ? parseInt(progressMatch[1]) : null,
              size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : null,
            });
          }
        } catch (err) {
          console.error(`[Ollama] stdout 处理错误:`, err);
        }
      });

      proc.stderr?.on('data', (data) => {
        try {
          const output = data.toString();
          console.log(`[Ollama] stderr: ${output.trim()}`);
          safeSend('ollama-pull-progress', {
            model: modelName,
            output: output.trim(),
            isError: true,
          });
        } catch (err) {
          console.error(`[Ollama] stderr 处理错误:`, err);
        }
      });

      proc.on('close', (code) => {
        try {
          console.log(`[Ollama] 模型下载完成，退出码: ${code}`);
          const errorMsg = code !== 0 ? `下载失败 (退出码: ${code})。请确保 Ollama 已安装并运行。` : undefined;

          // 如果失败，发送错误进度
          if (code !== 0) {
            safeSend('ollama-pull-progress', {
              model: modelName,
              output: errorMsg,
              isError: true,
            });
          }

          safeSend('ollama-pull-complete', {
            model: modelName,
            success: code === 0,
            error: errorMsg,
          });
          resolve({ success: code === 0, model: modelName, error: errorMsg });
        } catch (err) {
          console.error(`[Ollama] close 处理错误:`, err);
          resolve({ success: false, model: modelName, error: (err as Error).message });
        }
      });

      proc.on('error', (error) => {
        try {
          console.error(`[Ollama] 下载失败:`, error);
          // 发送进度更新显示错误
          safeSend('ollama-pull-progress', {
            model: modelName,
            output: `错误: ${error.message}`,
            isError: true,
          });
          safeSend('ollama-pull-complete', {
            model: modelName,
            success: false,
            error: error.message,
          });
          resolve({ success: false, model: modelName, error: error.message });
        } catch (err) {
          console.error(`[Ollama] error 处理错误:`, err);
          resolve({ success: false, model: modelName, error: (err as Error).message });
        }
      });
    } catch (outerError) {
      console.error(`[Ollama] 外层错误:`, outerError);
      const errorMsg = `下载出错: ${(outerError as Error).message}`;
      safeSend('ollama-pull-complete', {
        model: modelName,
        success: false,
        error: errorMsg,
      });
      resolve({ success: false, model: modelName, error: errorMsg });
    }
  });
});

// 检查 Ollama 是否运行
ipcMain.handle('ollama-check', async () => {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const http = await import('http');
  const execAsync = promisify(exec);

  debugLog('[Ollama Check] Starting check...');

  // 检查 ollama 命令是否可用
  let installed = false;
  try {
    const result = await execAsync('ollama --version', { timeout: 5000 });
    debugLog(`[Ollama Check] Version: ${result.stdout.trim()}`);
    installed = true;
  } catch (err) {
    debugLog(`[Ollama Check] Not installed: ${err}`);
    return { installed: false, running: false };
  }

  // 检查服务是否运行 - 使用 Node.js http 模块
  const running = await new Promise<boolean>((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 11434,
        path: '/api/tags',
        method: 'GET',
        timeout: 5000,
      },
      (res) => {
        debugLog(`[Ollama Check] Service status: ${res.statusCode}`);
        resolve(res.statusCode === 200);
      }
    );

    req.on('error', (err) => {
      debugLog(`[Ollama Check] Service not responding: ${err.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      debugLog('[Ollama Check] Service timeout');
      req.destroy();
      resolve(false);
    });

    req.end();
  });

  return { installed, running };
});

// 启动 Ollama 服务
ipcMain.handle('ollama-start', async () => {
  const { spawn } = await import('child_process');

  try {
    // macOS/Linux: ollama serve
    const proc = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();

    // 等待服务启动
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// ============= Ollama 下载安装 =============

// 获取 Ollama 下载 URL
function getOllamaDownloadUrl(): { url: string; filename: string; type: 'dmg' | 'exe' | 'script' } {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    // macOS - 下载 DMG 安装包
    return {
      url: 'https://ollama.com/download/Ollama-darwin.zip',
      filename: 'Ollama-darwin.zip',
      type: 'dmg',
    };
  } else if (platform === 'win32') {
    // Windows - 下载 exe 安装包
    return {
      url: 'https://ollama.com/download/OllamaSetup.exe',
      filename: 'OllamaSetup.exe',
      type: 'exe',
    };
  } else {
    // Linux - 使用安装脚本
    return {
      url: 'https://ollama.com/install.sh',
      filename: 'install.sh',
      type: 'script',
    };
  }
}

// 下载 Ollama 安装包
ipcMain.handle('download-ollama', async () => {
  const https = await import('https');
  const http = await import('http');
  const { pipeline } = await import('stream/promises');
  const { createWriteStream } = await import('fs');

  const downloadInfo = getOllamaDownloadUrl();
  const downloadPath = path.join(os.tmpdir(), downloadInfo.filename);

  debugLog(`[Ollama Download] Starting download: ${downloadInfo.url}`);
  debugLog(`[Ollama Download] Save to: ${downloadPath}`);

  safeSend('ollama-download-start', {
    url: downloadInfo.url,
    filename: downloadInfo.filename,
  });

  return new Promise((resolve) => {
    const downloadWithRedirect = (url: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        const error = '重定向次数过多';
        safeSend('ollama-download-error', error);
        resolve({ success: false, error });
        return;
      }

      const protocol = url.startsWith('https') ? https : http;

      const request = protocol.get(url, (response) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            debugLog(`[Ollama Download] Redirecting to: ${redirectUrl}`);
            downloadWithRedirect(redirectUrl, redirectCount + 1);
            return;
          }
        }

        if (response.statusCode !== 200) {
          const error = `下载失败: HTTP ${response.statusCode}`;
          safeSend('ollama-download-error', error);
          resolve({ success: false, error });
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedSize = 0;
        let lastProgress = 0;

        debugLog(`[Ollama Download] Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

        const file = createWriteStream(downloadPath);

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;

          // 每 5% 更新一次进度，避免过于频繁
          if (progress >= lastProgress + 5 || progress === 100) {
            lastProgress = progress;
            safeSend('ollama-download-progress', {
              progress,
              downloaded: downloadedSize,
              total: totalSize,
              downloadedMB: (downloadedSize / 1024 / 1024).toFixed(1),
              totalMB: (totalSize / 1024 / 1024).toFixed(1),
            });
          }
        });

        response.pipe(file);

        file.on('finish', async () => {
          file.close();
          debugLog(`[Ollama Download] Download complete: ${downloadPath}`);

          safeSend('ollama-download-complete', {
            path: downloadPath,
            type: downloadInfo.type,
          });

          // 根据平台处理安装
          try {
            if (downloadInfo.type === 'dmg') {
              // macOS: 解压 zip 并打开 app
              const { exec } = await import('child_process');
              const { promisify } = await import('util');
              const execAsync = promisify(exec);

              // 解压到 /Applications
              const extractPath = path.join(os.tmpdir(), 'Ollama-extract');
              await execAsync(`unzip -o "${downloadPath}" -d "${extractPath}"`);
              debugLog(`[Ollama Download] Extracted to: ${extractPath}`);

              // 移动到 Applications
              try {
                await execAsync(`cp -R "${extractPath}/Ollama.app" /Applications/`);
                debugLog(`[Ollama Download] Moved to /Applications`);
              } catch (e) {
                // 可能需要管理员权限，打开 Finder 让用户手动拖拽
                await execAsync(`open "${extractPath}"`);
                debugLog(`[Ollama Download] Opened extract folder for manual installation`);
              }

              // 启动 Ollama
              setTimeout(async () => {
                try {
                  await execAsync('open -a Ollama');
                  debugLog(`[Ollama Download] Launched Ollama.app`);
                } catch (e) {
                  debugLog(`[Ollama Download] Failed to launch: ${e}`);
                }
              }, 1000);

              resolve({ success: true, path: downloadPath, type: downloadInfo.type });

            } else if (downloadInfo.type === 'exe') {
              // Windows: 运行安装程序
              const { exec } = await import('child_process');
              exec(`start "" "${downloadPath}"`, (error) => {
                if (error) {
                  debugLog(`[Ollama Download] Failed to run installer: ${error}`);
                }
              });
              resolve({ success: true, path: downloadPath, type: downloadInfo.type });

            } else if (downloadInfo.type === 'script') {
              // Linux: 显示安装指令
              const { exec } = await import('child_process');
              const { chmod } = await import('fs/promises');

              // 设置执行权限
              await chmod(downloadPath, 0o755);

              // 打开终端运行脚本（需要用户确认）
              // 不同的桌面环境有不同的终端
              exec(`x-terminal-emulator -e "sudo ${downloadPath}"`, (error) => {
                if (error) {
                  // 尝试其他终端
                  exec(`gnome-terminal -- sudo ${downloadPath}`, () => {});
                }
              });
              resolve({ success: true, path: downloadPath, type: downloadInfo.type });
            }
          } catch (installError) {
            debugLog(`[Ollama Download] Install error: ${installError}`);
            resolve({ success: true, path: downloadPath, type: downloadInfo.type, installError: (installError as Error).message });
          }
        });

        file.on('error', (err) => {
          fs.unlink(downloadPath, () => {}); // 删除部分下载的文件
          const error = `写入文件失败: ${err.message}`;
          safeSend('ollama-download-error', error);
          resolve({ success: false, error });
        });
      });

      request.on('error', (err) => {
        const error = `网络错误: ${err.message}`;
        safeSend('ollama-download-error', error);
        resolve({ success: false, error });
      });

      request.on('timeout', () => {
        request.destroy();
        const error = '下载超时';
        safeSend('ollama-download-error', error);
        resolve({ success: false, error });
      });
    };

    downloadWithRedirect(downloadInfo.url);
  });
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

    // 检查屏幕录制权限（仅 macOS）
    await checkScreenRecordingPermission();
    debugLog('Screen recording permission check completed');

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

    // 设置自动更新
    setupAutoUpdater();
    debugLog('Auto-updater setup complete');
  } catch (error) {
    debugLog(`Error during initialization: ${error}`);
    throw error;
  }
});

// 退出前设置标志
app.on('before-quit', () => {
  isAppQuitting = true;
});

// 退出时清理
app.on('will-quit', async () => {
  globalShortcut.unregisterAll();

  // 停止智能观察
  stopSmartObserve();

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
