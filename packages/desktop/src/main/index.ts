/**
 * Hawkeye Desktop - Main Process
 * 模块化重构版本
 */

import { app, BrowserWindow, Tray, Menu, globalShortcut, dialog, systemPreferences, shell, nativeImage } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { ConfigService } from './services/config-service';
import { HawkeyeService } from './services/hawkeye-service';
import { OllamaService } from './services/ollama-service';
import { EnvCheckService } from './services/env-check-service';
import { registerAllHandlers } from './ipc';
import { initI18n, t } from './i18n';

// Debug logging
const debugLogPath = path.join(os.homedir(), 'hawkeye_debug.log');
function debugLog(msg: string) {
  const timestamp = new Date().toISOString();
  try {
    fs.appendFileSync(debugLogPath, `[${timestamp}] ${msg}\n`);
  } catch (e) {
    // Ignore
  }
}

debugLog('Main process started (Modular Architecture)');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isAppQuitting = false;

// Services
const configService = new ConfigService(debugLog);
const hawkeyeService = new HawkeyeService(() => mainWindow, debugLog);
const ollamaService = new OllamaService(() => mainWindow, debugLog);
const envCheckService = new EnvCheckService(debugLog);

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  debugLog('Another instance running, quitting');
  app.quit();
} else {
  app.on('second-instance', () => {
    debugLog('Second instance detected');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Register IPC
registerAllHandlers({
  configService,
  hawkeyeService,
  ollamaService,
  envCheckService,
  mainWindowGetter: () => mainWindow,
});

async function checkScreenRecordingPermission(): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('screen');
  if (status === 'granted') return true;

  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Hawkeye 需要屏幕录制权限',
    message: '为了正常工作，Hawkeye 需要屏幕录制权限来捕获屏幕内容。',
    detail: '请在系统偏好设置中:\n\n1. 找到「Hawkeye」\n2. 勾选复选框授予权限\n\n授权后可能需要重启应用。',
    buttons: ['打开系统设置', '稍后再说'],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
  return false;
}

function setupAutoUpdater() {
  const config = configService.getConfig();
  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    debugLog(`Update available: ${info.version}`);
    mainWindow?.webContents.send('update-available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-progress', progress.percent);
  });

  autoUpdater.on('update-downloaded', (info) => {
    debugLog(`Update downloaded: ${info.version}`);
    mainWindow?.webContents.send('update-downloaded', { version: info.version });
    if (tray) tray.setToolTip(`Hawkeye - Update Ready (v${info.version})`);
  });

  if (!process.env.NODE_ENV && config.autoUpdate) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
    setInterval(() => configService.getConfig().autoUpdate && autoUpdater.checkForUpdates().catch(() => {}), 4 * 3600 * 1000);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 480,
    minWidth: 320,
    minHeight: 400,
    frame: true,
    transparent: false,
    skipTaskbar: false,
    resizable: true,
    show: false,
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!isAppQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  let icon: Electron.NativeImage;
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const iconPath = isDev
    ? path.join(__dirname, '../../resources/icon.png')
    : path.join(process.resourcesPath, 'resources/icon.png');

  try {
    icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      icon = icon.resize({ width: 18, height: 18 });
      icon.setTemplateImage(true);
    }
  } catch (e) {
    icon = nativeImage.createEmpty();
  }

  if (icon.isEmpty()) {
    // Fallback icon
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
      click: () => {
        mainWindow?.webContents.send('loading', true);
        hawkeyeService.perceiveAndRecognize()
          .catch(e => mainWindow?.webContents.send('error', e.message))
          .finally(() => {
            mainWindow?.webContents.send('loading', false);
            mainWindow?.show();
          });
      },
    },
    {
      label: t('tray.showSuggestions'),
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: t('tray.settings'),
      click: () => {
        mainWindow?.webContents.send('show-settings');
        mainWindow?.show();
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
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

// App lifecycle
app.on('window-all-closed', (e) => {
  if (process.platform === 'darwin') {
    e.preventDefault();
  }
});

app.whenReady().then(async () => {
  try {
    initI18n();
    await checkScreenRecordingPermission();
    createWindow();
    createTray();

    globalShortcut.register('CommandOrControl+Shift+H', () => {
      mainWindow?.webContents.send('loading', true);
      hawkeyeService.perceiveAndRecognize()
        .catch(e => mainWindow?.webContents.send('error', e.message))
        .finally(() => {
          mainWindow?.webContents.send('loading', false);
          mainWindow?.show();
        });
    });

    // Init Hawkeye
    await hawkeyeService.initialize(configService.getConfig());

    // Check Python Environment
    const pythonEnv = await envCheckService.detectEnvironment();
    if (pythonEnv) {
        debugLog(`Python environment detected: ${pythonEnv.path} (${pythonEnv.version})`);
        // Check for WebSearch dependencies
        const { missing } = envCheckService.checkPackages(['tavily-python', 'requests']);
        if (missing.length > 0) {
            debugLog(`Missing WebSearch dependencies: ${missing.join(', ')}`);
            // In a real app, we might prompt the user to install these
        }
    } else {
        debugLog('Python 3 not found. WebSearch skill may not work.');
    }

    setupAutoUpdater();

    // Auto-start smart observe if enabled
    if (configService.getConfig().smartObserve) {
      // @ts-ignore - function injected by smart-observe-handlers
      if (global.startSmartObserve) global.startSmartObserve();
    }

  } catch (error) {
    debugLog(`Init error: ${error}`);
  }
});

app.on('before-quit', () => {
  isAppQuitting = true;
});

app.on('will-quit', async () => {
  globalShortcut.unregisterAll();
  // @ts-ignore
  if (global.stopSmartObserve) global.stopSmartObserve();
  await hawkeyeService.shutdown();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
