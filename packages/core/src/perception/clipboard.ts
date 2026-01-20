/**
 * 剪贴板监听模块
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ClipboardWatcher {
  private platform: NodeJS.Platform;
  private lastContent: string = '';
  private watchInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.platform = process.platform;
  }

  /**
   * 获取当前剪贴板内容
   */
  async getContent(): Promise<string> {
    try {
      switch (this.platform) {
        case 'darwin':
          return this.getClipboardMac();
        case 'win32':
          return this.getClipboardWindows();
        case 'linux':
          return this.getClipboardLinux();
        default:
          throw new Error(`不支持的平台: ${this.platform}`);
      }
    } catch (error) {
      console.error('获取剪贴板失败:', error);
      return '';
    }
  }

  /**
   * 开始监听剪贴板变化
   * @param callback 变化回调
   * @param interval 检查间隔 (ms)
   */
  startWatching(callback: (content: string) => void, interval: number = 1000): void {
    if (this.watchInterval) {
      this.stopWatching();
    }

    this.watchInterval = setInterval(async () => {
      const content = await this.getContent();
      if (content !== this.lastContent && content) {
        this.lastContent = content;
        callback(content);
      }
    }, interval);
  }

  /**
   * 停止监听
   */
  stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  private async getClipboardMac(): Promise<string> {
    const { stdout } = await execAsync('pbpaste');
    return stdout;
  }

  private async getClipboardWindows(): Promise<string> {
    const { stdout } = await execAsync('powershell -Command "Get-Clipboard"');
    return stdout.trim();
  }

  private async getClipboardLinux(): Promise<string> {
    try {
      const { stdout } = await execAsync('xclip -selection clipboard -o');
      return stdout;
    } catch {
      // xclip 可能未安装，尝试 xsel
      const { stdout } = await execAsync('xsel --clipboard --output');
      return stdout;
    }
  }
}
