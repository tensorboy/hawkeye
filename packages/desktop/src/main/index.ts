/**
 * Hawkeye Desktop - Main Process
 */

import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import { HawkeyeEngine, type TaskSuggestion } from '@hawkeye/core';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let engine: HawkeyeEngine | null = null;

// 存储配置
const store = {
  apiKey: '',
  model: 'claude-sonnet-4-20250514',
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
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
  // 创建托盘图标（使用内置图标作为占位符）
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Observe Screen',
      accelerator: 'CmdOrCtrl+Shift+H',
      click: () => observeScreen(),
    },
    {
      label: 'Show Suggestions',
      click: () => showWindow(),
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        // TODO: 打开设置窗口
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip('Hawkeye - Intelligent Task Assistant');
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
  if (!engine) {
    mainWindow?.webContents.send('error', 'Please configure API key first');
    showWindow();
    return;
  }

  mainWindow?.webContents.send('loading', true);

  try {
    const suggestions = await engine.observe();
    mainWindow?.webContents.send('suggestions', suggestions);
    showWindow();
  } catch (error) {
    mainWindow?.webContents.send('error', (error as Error).message);
  } finally {
    mainWindow?.webContents.send('loading', false);
  }
}

function initializeEngine() {
  if (!store.apiKey) {
    return;
  }

  engine = new HawkeyeEngine({
    anthropicApiKey: store.apiKey,
    model: store.model,
  });
}

// IPC 处理
ipcMain.handle('observe', async () => {
  await observeScreen();
});

ipcMain.handle('execute', async (_event, suggestionId: string) => {
  if (!engine) {
    throw new Error('Engine not initialized');
  }
  return engine.execute(suggestionId);
});

ipcMain.handle('getSuggestions', () => {
  return engine?.getSuggestions() || [];
});

ipcMain.handle('setApiKey', (_event, apiKey: string) => {
  store.apiKey = apiKey;
  initializeEngine();
});

ipcMain.handle('getConfig', () => {
  return { ...store, hasApiKey: !!store.apiKey };
});

// 应用启动
app.whenReady().then(() => {
  createWindow();
  createTray();
  initializeEngine();

  // 注册全局快捷键
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    observeScreen();
  });
});

// 退出时清理
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
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
