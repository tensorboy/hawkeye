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
import { ModelManagerService } from './services/model-manager-service';
import { EnvCheckService } from './services/env-check-service';
import { WhisperService } from './services/whisper-service';
import { TrayStatusService } from './services/tray-status-service';
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
const modelManagerService = new ModelManagerService(() => mainWindow, debugLog);
const envCheckService = new EnvCheckService(debugLog);
const whisperService = new WhisperService(() => mainWindow, debugLog);
const trayStatusService = new TrayStatusService(() => mainWindow, debugLog);

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
  modelManagerService,
  envCheckService,
  whisperService,
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
    // Use trayStatusService for update status
    trayStatusService.setStatus('updating', { updateVersion: info.version });
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
  // Initialize tray via TrayStatusService for dynamic status management
  tray = trayStatusService.initialize();

  // Set up tray status event handlers
  trayStatusService.on('observeRequested', () => {
    trayStatusService.setStatus('observing');
    mainWindow?.webContents.send('loading', true);
    hawkeyeService.perceiveAndRecognize()
      .then(() => {
        trayStatusService.setStatus('idle');
      })
      .catch(e => {
        trayStatusService.setStatus('error', { errorMessage: e.message });
        mainWindow?.webContents.send('error', e.message);
      })
      .finally(() => {
        mainWindow?.webContents.send('loading', false);
        mainWindow?.show();
      });
  });

  trayStatusService.on('cancelRequested', () => {
    debugLog('Cancel requested from tray');
    // TODO: Implement cancellation logic when agent monitoring is added
    trayStatusService.setStatus('idle');
  });

  trayStatusService.on('installUpdateRequested', () => {
    debugLog('Install update requested from tray');
    autoUpdater.quitAndInstall();
  });

  // Handle tray click
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

/**
 * Update tray status from HawkeyeService events
 */
function setupTrayStatusSync() {
  // Connect hawkeyeService status changes to tray
  hawkeyeService.on('analyzing', () => {
    trayStatusService.setStatus('analyzing', { currentTask: 'Analyzing screen content...' });
  });

  hawkeyeService.on('executing', (task: string) => {
    trayStatusService.setStatus('executing', { currentTask: task });
  });

  hawkeyeService.on('idle', () => {
    trayStatusService.setStatus('idle');
  });

  hawkeyeService.on('error', (error: string) => {
    trayStatusService.setStatus('error', { errorMessage: error });
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
    setupTrayStatusSync();

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

    // Init Whisper (auto-download model if not present)
    const appConfig = configService.getConfig();
    let whisperModelPath = appConfig.whisperModelPath;

    if (!whisperModelPath || !fs.existsSync(whisperModelPath)) {
      // Check if default model already exists
      const defaultPath = whisperService.getDefaultModelPath();
      if (fs.existsSync(defaultPath)) {
        whisperModelPath = defaultPath;
        configService.saveConfig({
          whisperModelPath: defaultPath,
          whisperEnabled: true,
        });
        debugLog(`[Whisper] Found existing model at: ${defaultPath}`);
      } else {
        // Auto-download on first launch
        debugLog('[Whisper] Model not found, starting auto-download...');
        try {
          whisperModelPath = await whisperService.downloadModel();
          configService.saveConfig({
            whisperModelPath,
            whisperEnabled: true,
          });
          debugLog(`[Whisper] Auto-download complete: ${whisperModelPath}`);
        } catch (error) {
          debugLog(`[Whisper] Auto-download failed: ${error}`);
          whisperModelPath = '';
        }
      }
    }

    if (whisperModelPath) {
      await whisperService.initialize({
        modelPath: whisperModelPath,
        language: appConfig.whisperLanguage,
      });
    }

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
  trayStatusService.destroy();
  await whisperService.shutdown();
  await hawkeyeService.shutdown();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
