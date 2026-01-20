/**
 * 窗口追踪模块
 * 获取当前活动窗口信息
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { WindowInfo } from '../types';

const execAsync = promisify(exec);

export class WindowTracker {
  private platform: NodeJS.Platform;

  constructor() {
    this.platform = process.platform;
  }

  /**
   * 获取当前活动窗口信息
   */
  async getActiveWindow(): Promise<WindowInfo | null> {
    try {
      switch (this.platform) {
        case 'darwin':
          return this.getActiveWindowMac();
        case 'win32':
          return this.getActiveWindowWindows();
        case 'linux':
          return this.getActiveWindowLinux();
        default:
          throw new Error(`不支持的平台: ${this.platform}`);
      }
    } catch (error) {
      console.error('获取活动窗口失败:', error);
      return null;
    }
  }

  /**
   * macOS: 使用 AppleScript 获取活动窗口
   */
  private async getActiveWindowMac(): Promise<WindowInfo> {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set windowTitle to ""
        try
          set windowTitle to name of front window of frontApp
        end try
        return appName & "|" & windowTitle
      end tell
    `;

    const { stdout } = await execAsync(`osascript -e '${script}'`);
    const [appName, title] = stdout.trim().split('|');

    return {
      appName: appName || 'Unknown',
      title: title || '',
      isActive: true,
    };
  }

  /**
   * Windows: 使用 PowerShell 获取活动窗口
   */
  private async getActiveWindowWindows(): Promise<WindowInfo> {
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class User32 {
          [DllImport("user32.dll")]
          public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")]
          public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
        }
"@
      $hwnd = [User32]::GetForegroundWindow()
      $title = New-Object System.Text.StringBuilder 256
      [User32]::GetWindowText($hwnd, $title, 256)
      $title.ToString()
    `;

    const { stdout } = await execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`);

    return {
      appName: 'Unknown',
      title: stdout.trim(),
      isActive: true,
    };
  }

  /**
   * Linux: 使用 xdotool 获取活动窗口
   */
  private async getActiveWindowLinux(): Promise<WindowInfo> {
    try {
      const { stdout: windowId } = await execAsync('xdotool getactivewindow');
      const { stdout: windowName } = await execAsync(`xdotool getwindowname ${windowId.trim()}`);

      return {
        appName: 'Unknown',
        title: windowName.trim(),
        isActive: true,
      };
    } catch {
      // xdotool 可能未安装
      return {
        appName: 'Unknown',
        title: '',
        isActive: true,
      };
    }
  }
}
