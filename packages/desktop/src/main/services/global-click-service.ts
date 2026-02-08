/**
 * GlobalClickService - 全局鼠标点击捕获服务
 *
 * 使用 uiohook-napi 捕获系统级鼠标点击事件，用于 WebGazer 校准。
 * 可以捕获 app 窗口内外的所有点击。
 */

import { BrowserWindow } from 'electron';
import { uIOhook, UiohookMouseEvent } from 'uiohook-napi';

export interface GlobalClickEvent {
  x: number; // 屏幕坐标 X
  y: number; // 屏幕坐标 Y
  button: number; // 鼠标按钮 (1=左键, 2=右键, 3=中键)
  timestamp: number;
  isInsideApp: boolean; // 是否在 app 窗口内
}

export class GlobalClickService {
  private isRunning = false;
  private mainWindow: BrowserWindow | null = null;
  private debugLogFn: (msg: string) => void;
  private clickCallback: ((event: GlobalClickEvent) => void) | null = null;

  constructor(debugLogFn: (msg: string) => void = console.log) {
    this.debugLogFn = debugLogFn;
  }

  /**
   * 设置主窗口引用，用于判断点击是否在窗口内
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
    this.debugLogFn('[GlobalClick] Main window set');
  }

  /**
   * 设置点击回调
   */
  onGlobalClick(callback: (event: GlobalClickEvent) => void): void {
    this.clickCallback = callback;
  }

  /**
   * 启动全局鼠标监听
   */
  start(): boolean {
    if (this.isRunning) {
      this.debugLogFn('[GlobalClick] Already running');
      return true;
    }

    try {
      // 监听鼠标点击事件
      uIOhook.on('mousedown', (e: UiohookMouseEvent) => {
        // 只处理左键点击 (button 1)
        if (e.button !== 1) return;

        const clickEvent = this.createClickEvent(e);
        this.debugLogFn(
          `[GlobalClick] Click at (${clickEvent.x}, ${clickEvent.y}), inside app: ${clickEvent.isInsideApp}`
        );

        // 触发回调
        if (this.clickCallback) {
          this.clickCallback(clickEvent);
        }
      });

      // 启动 hook
      uIOhook.start();
      this.isRunning = true;
      this.debugLogFn('[GlobalClick] Global mouse hook started');
      return true;
    } catch (error) {
      this.debugLogFn(`[GlobalClick] Failed to start: ${error}`);
      return false;
    }
  }

  /**
   * 停止全局鼠标监听
   */
  stop(): void {
    if (!this.isRunning) return;

    try {
      uIOhook.stop();
      this.isRunning = false;
      this.debugLogFn('[GlobalClick] Global mouse hook stopped');
    } catch (error) {
      this.debugLogFn(`[GlobalClick] Failed to stop: ${error}`);
    }
  }

  /**
   * 检查是否正在运行
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 创建点击事件对象
   */
  private createClickEvent(e: UiohookMouseEvent): GlobalClickEvent {
    const isInsideApp = this.isClickInsideWindow(e.x, e.y);

    return {
      x: e.x,
      y: e.y,
      button: e.button as number,
      timestamp: Date.now(),
      isInsideApp,
    };
  }

  /**
   * 检查点击是否在主窗口内
   */
  private isClickInsideWindow(x: number, y: number): boolean {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return false;
    }

    try {
      const bounds = this.mainWindow.getBounds();
      return (
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height
      );
    } catch {
      return false;
    }
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.stop();
    this.clickCallback = null;
    this.mainWindow = null;
    this.debugLogFn('[GlobalClick] Service destroyed');
  }
}
