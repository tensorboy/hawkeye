/**
 * 感知引擎 - 整合所有感知能力
 */

import { ScreenCapture } from './screen';
import { WindowTracker } from './window';
import { ClipboardWatcher } from './clipboard';
import type { PerceptionContext } from '../types';

export interface PerceptionEngineConfig {
  /** 是否启用屏幕截图 */
  enableScreenCapture?: boolean;
  /** 是否启用窗口追踪 */
  enableWindowTracking?: boolean;
  /** 是否启用剪贴板监听 */
  enableClipboard?: boolean;
}

export class PerceptionEngine {
  private screenCapture: ScreenCapture;
  private windowTracker: WindowTracker;
  private clipboardWatcher: ClipboardWatcher;
  private config: PerceptionEngineConfig;

  constructor(config: PerceptionEngineConfig = {}) {
    this.config = {
      enableScreenCapture: true,
      enableWindowTracking: true,
      enableClipboard: true,
      ...config,
    };

    this.screenCapture = new ScreenCapture();
    this.windowTracker = new WindowTracker();
    this.clipboardWatcher = new ClipboardWatcher();
  }

  /**
   * 获取当前完整的感知上下文
   */
  async perceive(): Promise<PerceptionContext> {
    const context: PerceptionContext = {
      metadata: {
        timestamp: Date.now(),
        platform: process.platform,
      },
    };

    // 并行获取所有感知数据
    const promises: Promise<void>[] = [];

    if (this.config.enableScreenCapture) {
      promises.push(
        this.screenCapture.capture().then((screenshot) => {
          context.screenshot = screenshot;
        }).catch((err) => {
          console.warn('屏幕截图失败:', err.message);
        })
      );
    }

    if (this.config.enableWindowTracking) {
      promises.push(
        this.windowTracker.getActiveWindow().then((window) => {
          context.activeWindow = window ?? undefined;
        }).catch((err) => {
          console.warn('窗口追踪失败:', err.message);
        })
      );
    }

    if (this.config.enableClipboard) {
      promises.push(
        this.clipboardWatcher.getContent().then((content) => {
          context.clipboard = content || undefined;
        }).catch((err) => {
          console.warn('剪贴板获取失败:', err.message);
        })
      );
    }

    await Promise.all(promises);

    return context;
  }

  /**
   * 仅获取屏幕截图
   */
  async captureScreen() {
    return this.screenCapture.capture();
  }

  /**
   * 仅获取当前窗口信息
   */
  async getActiveWindow() {
    return this.windowTracker.getActiveWindow();
  }

  /**
   * 仅获取剪贴板内容
   */
  async getClipboard() {
    return this.clipboardWatcher.getContent();
  }

  /**
   * 开始监听剪贴板变化
   */
  watchClipboard(callback: (content: string) => void, interval?: number) {
    this.clipboardWatcher.startWatching(callback, interval);
  }

  /**
   * 停止剪贴板监听
   */
  stopClipboardWatch() {
    this.clipboardWatcher.stopWatching();
  }
}
