/**
 * GazeOverlayService - 全屏透明覆盖窗口
 *
 * 创建一个透明、置顶、鼠标穿透的全屏窗口，
 * 用于在屏幕任意位置显示注视点和鼠标位置。
 */

import { BrowserWindow, screen, ipcMain } from 'electron';
import * as path from 'path';

export class GazeOverlayService {
  private overlayWindow: BrowserWindow | null = null;
  private cursorPollTimer: ReturnType<typeof setInterval> | null = null;
  private debugLog: (msg: string) => void;

  constructor(debugLog: (msg: string) => void = console.log) {
    this.debugLog = debugLog;
  }

  /**
   * 创建覆盖窗口
   */
  createOverlay(): void {
    if (this.overlayWindow) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    this.overlayWindow = new BrowserWindow({
      x: 0,
      y: 0,
      width,
      height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      roundedCorners: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
      },
    });

    // 鼠标事件穿透
    this.overlayWindow.setIgnoreMouseEvents(true);

    // macOS: 让窗口出现在所有桌面空间
    this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // 设置窗口层级为屏幕保护程序级别（最高）
    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');

    // 加载覆盖页面
    const overlayHtml = path.join(__dirname, '../renderer/gaze-overlay.html');
    if (process.env.ELECTRON_RENDERER_URL) {
      // dev 模式：用 data URL 加载内联 HTML
      this.overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.getOverlayHTML(width, height))}`);
    } else {
      this.overlayWindow.loadFile(overlayHtml);
    }

    // 开始轮询鼠标位置
    this.startCursorPolling();

    // 注册 IPC
    this.registerIPC();

    this.debugLog('[GazeOverlay] Overlay window created');
  }

  /**
   * 注册 IPC 处理
   */
  private registerIPC(): void {
    // 接收注视点数据
    let gazeLogCount = 0;
    ipcMain.on('gaze-overlay:update-gaze', (_event, data: { x: number; y: number } | null) => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('overlay:gaze', data);
        // Log first few gaze updates to confirm IPC flow
        if (data && gazeLogCount < 5) {
          gazeLogCount++;
          this.debugLog(`[GazeOverlay] IPC gaze data forwarded #${gazeLogCount}: (${data.x}, ${data.y})`);
        }
      }
    });

    // 显示/隐藏覆盖
    ipcMain.handle('gaze-overlay:toggle', (_event, visible: boolean) => {
      if (visible) {
        this.show();
      } else {
        this.hide();
      }
      return { success: true };
    });
  }

  /**
   * 开始轮询鼠标位置，发送给覆盖窗口
   */
  private startCursorPolling(): void {
    if (this.cursorPollTimer) return;
    this.cursorPollTimer = setInterval(() => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        const point = screen.getCursorScreenPoint();
        this.overlayWindow.webContents.send('overlay:cursor', { x: point.x, y: point.y });
      }
    }, 33); // ~30fps
  }

  /**
   * 显示覆盖窗口
   */
  show(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.showInactive();
      this.startCursorPolling();
    }
  }

  /**
   * 隐藏覆盖窗口
   */
  hide(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.hide();
    }
    if (this.cursorPollTimer) {
      clearInterval(this.cursorPollTimer);
      this.cursorPollTimer = null;
    }
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.cursorPollTimer) {
      clearInterval(this.cursorPollTimer);
      this.cursorPollTimer = null;
    }
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.destroy();
    }
    this.overlayWindow = null;
    this.debugLog('[GazeOverlay] Service destroyed');
  }

  /**
   * 开发模式用的内联 HTML
   */
  private getOverlayHTML(width: number, height: number): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; }
html, body { width: 100vw; height: 100vh; overflow: hidden; background: transparent; }
#gaze-dot {
  position: fixed; width: 40px; height: 40px;
  border-radius: 50%; pointer-events: none;
  display: none; z-index: 2;
  transform: translate(-50%, -50%);
  transition: left 0.05s linear, top 0.05s linear, opacity 0.3s ease;
}
#gaze-dot-inner {
  width: 50%; height: 50%; border-radius: 50%;
  background: radial-gradient(circle, #60a5fa, #2563eb);
  box-shadow: 0 0 18px rgba(59,130,246,1), 0 0 40px rgba(59,130,246,0.4);
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
}
#gaze-dot-ring {
  position: absolute; inset: 0;
  border: 2px solid rgba(96,165,250,0.8);
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%,100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.3); opacity: 0.4; }
}
#cursor-dot {
  position: fixed; width: 16px; height: 16px;
  border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, #22c55e, #16a34a);
  box-shadow: 0 0 8px rgba(34,197,94,0.8);
  border: 2px solid rgba(34,197,94,0.6);
  display: none; z-index: 2;
  transform: translate(-50%, -50%);
}
#deviation-svg {
  position: fixed; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 1;
}
#dev-line { stroke: rgba(255,255,0,0.5); stroke-width: 1; stroke-dasharray: 4 4; }
#dev-text { fill: rgba(255,255,0,0.8); font-size: 12px; font-family: 'SF Mono', Monaco, monospace; }
</style>
</head>
<body>
<div id="gaze-dot"><div id="gaze-dot-inner"></div><div id="gaze-dot-ring"></div></div>
<div id="cursor-dot"></div>
<svg id="deviation-svg"><line id="dev-line"/><text id="dev-text"></text></svg>
<script>
const { ipcRenderer } = require('electron');
const gazeDot = document.getElementById('gaze-dot');
const cursorDot = document.getElementById('cursor-dot');
const devLine = document.getElementById('dev-line');
const devText = document.getElementById('dev-text');

let gazePos = null;
let cursorPos = null;
let gazeHideTimer = null;
let gazeLogCount = 0;

function update() {
  if (gazePos) {
    gazeDot.style.display = 'block';
    gazeDot.style.opacity = '1';
    gazeDot.style.left = gazePos.x + 'px';
    gazeDot.style.top = gazePos.y + 'px';
  }
  if (cursorPos) {
    cursorDot.style.display = 'block';
    cursorDot.style.left = cursorPos.x + 'px';
    cursorDot.style.top = cursorPos.y + 'px';
  }
  if (gazePos && cursorPos) {
    devLine.setAttribute('x1', gazePos.x);
    devLine.setAttribute('y1', gazePos.y);
    devLine.setAttribute('x2', cursorPos.x);
    devLine.setAttribute('y2', cursorPos.y);
    const dist = Math.round(Math.sqrt(
      Math.pow(gazePos.x - cursorPos.x, 2) + Math.pow(gazePos.y - cursorPos.y, 2)
    ));
    devText.textContent = dist + 'px';
    devText.setAttribute('x', (gazePos.x + cursorPos.x) / 2 + 10);
    devText.setAttribute('y', (gazePos.y + cursorPos.y) / 2 - 10);
    devLine.style.display = '';
    devText.style.display = '';
  } else {
    devLine.style.display = 'none';
    devText.style.display = 'none';
  }
}

ipcRenderer.on('overlay:gaze', (_, data) => {
  if (data) {
    gazePos = data;
    if (gazeLogCount < 3) {
      gazeLogCount++;
      console.log('[Overlay] Gaze received #' + gazeLogCount + ': (' + data.x + ', ' + data.y + ')');
    }
    // Clear any pending hide timer
    if (gazeHideTimer) { clearTimeout(gazeHideTimer); gazeHideTimer = null; }
  } else {
    // Keep showing the last gaze position for 3 seconds before fading
    if (gazePos && !gazeHideTimer) {
      gazeHideTimer = setTimeout(() => {
        gazeDot.style.opacity = '0';
        setTimeout(() => { gazeDot.style.display = 'none'; gazePos = null; }, 300);
        gazeHideTimer = null;
      }, 3000);
    }
  }
  update();
});
ipcRenderer.on('overlay:cursor', (_, data) => { cursorPos = data; update(); });
</script>
</body>
</html>`;
  }
}
