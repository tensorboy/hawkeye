/**
 * 系统自动化执行器
 * 支持 macOS AppleScript / Windows PowerShell
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { ExecutionResult } from '../types';

const execAsync = promisify(exec);

export class AutomationExecutor {
  private platform: NodeJS.Platform;

  constructor() {
    this.platform = process.platform;
  }

  /**
   * 打开应用程序
   */
  async openApp(appName: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      switch (this.platform) {
        case 'darwin':
          await execAsync(`open -a "${appName}"`);
          break;
        case 'win32':
          await execAsync(`start "" "${appName}"`);
          break;
        case 'linux':
          await execAsync(`xdg-open "${appName}" || ${appName}`);
          break;
        default:
          throw new Error(`不支持的平台: ${this.platform}`);
      }
      return {
        success: true,
        output: `已打开应用: ${appName}`,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 打开 URL
   */
  async openUrl(url: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      switch (this.platform) {
        case 'darwin':
          await execAsync(`open "${url}"`);
          break;
        case 'win32':
          await execAsync(`start "" "${url}"`);
          break;
        case 'linux':
          await execAsync(`xdg-open "${url}"`);
          break;
        default:
          throw new Error(`不支持的平台: ${this.platform}`);
      }
      return {
        success: true,
        output: `已打开 URL: ${url}`,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 打开文件（使用默认应用）
   */
  async openFile(filePath: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      switch (this.platform) {
        case 'darwin':
          await execAsync(`open "${filePath}"`);
          break;
        case 'win32':
          await execAsync(`start "" "${filePath}"`);
          break;
        case 'linux':
          await execAsync(`xdg-open "${filePath}"`);
          break;
        default:
          throw new Error(`不支持的平台: ${this.platform}`);
      }
      return {
        success: true,
        output: `已打开文件: ${filePath}`,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 执行 AppleScript (仅 macOS)
   */
  async runAppleScript(script: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (this.platform !== 'darwin') {
      return {
        success: false,
        error: 'AppleScript 仅在 macOS 上可用',
        duration: Date.now() - startTime,
      };
    }

    try {
      const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      return {
        success: true,
        output: stdout.trim(),
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 执行 PowerShell 命令 (仅 Windows)
   */
  async runPowerShell(command: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (this.platform !== 'win32') {
      return {
        success: false,
        error: 'PowerShell 仅在 Windows 上可用',
        duration: Date.now() - startTime,
      };
    }

    try {
      const { stdout } = await execAsync(`powershell -Command "${command.replace(/"/g, '\\"')}"`);
      return {
        success: true,
        output: stdout.trim(),
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 显示系统通知
   */
  async showNotification(title: string, message: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      switch (this.platform) {
        case 'darwin':
          await execAsync(
            `osascript -e 'display notification "${message}" with title "${title}"'`
          );
          break;
        case 'win32':
          await execAsync(
            `powershell -Command "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; $xml = '<toast><visual><binding template=\"ToastText02\"><text id=\"1\">${title}</text><text id=\"2\">${message}</text></binding></visual></toast>'; $toast = [Windows.Data.Xml.Dom.XmlDocument]::new(); $toast.LoadXml($xml); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Hawkeye').Show([Windows.UI.Notifications.ToastNotification]::new($toast))"`
          );
          break;
        case 'linux':
          await execAsync(`notify-send "${title}" "${message}"`);
          break;
        default:
          throw new Error(`不支持的平台: ${this.platform}`);
      }
      return {
        success: true,
        output: '通知已发送',
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 将文本复制到剪贴板
   */
  async copyToClipboard(text: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      switch (this.platform) {
        case 'darwin':
          await execAsync(`echo "${text.replace(/"/g, '\\"')}" | pbcopy`);
          break;
        case 'win32':
          await execAsync(`echo ${text} | clip`);
          break;
        case 'linux':
          await execAsync(`echo "${text.replace(/"/g, '\\"')}" | xclip -selection clipboard`);
          break;
        default:
          throw new Error(`不支持的平台: ${this.platform}`);
      }
      return {
        success: true,
        output: '已复制到剪贴板',
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 设置剪贴板内容 (别名)
   */
  async setClipboard(content: string): Promise<ExecutionResult> {
    return this.copyToClipboard(content);
  }

  /**
   * 关闭应用程序
   */
  async closeApp(appName: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      switch (this.platform) {
        case 'darwin':
          await execAsync(`osascript -e 'quit app "${appName}"'`);
          break;
        case 'win32':
          await execAsync(`taskkill /IM "${appName}.exe" /F`);
          break;
        case 'linux':
          await execAsync(`pkill -f "${appName}"`);
          break;
        default:
          throw new Error(`不支持的平台: ${this.platform}`);
      }
      return {
        success: true,
        output: `已关闭应用: ${appName}`,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 模拟按键
   */
  async pressKey(key: string, modifiers?: string[]): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      switch (this.platform) {
        case 'darwin': {
          const modifierScript = modifiers?.length
            ? modifiers.map(m => `${m} down`).join(', ') + ', '
            : '';
          const script = `tell application "System Events" to key code ${this.getKeyCode(key)} using {${modifierScript.slice(0, -2)}}`;
          await execAsync(`osascript -e '${script}'`);
          break;
        }
        case 'win32': {
          const modifierKeys = modifiers?.map(m => `{${m}}`).join('') || '';
          await execAsync(`powershell -Command "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('${modifierKeys}${key}')"`);
          break;
        }
        default:
          throw new Error(`按键模拟在 ${this.platform} 上不支持`);
      }
      return {
        success: true,
        output: `已按下: ${modifiers?.join('+')}+${key}`,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 获取 macOS 按键代码
   */
  private getKeyCode(key: string): number {
    const keyCodes: Record<string, number> = {
      'a': 0, 'b': 11, 'c': 8, 'd': 2, 'e': 14, 'f': 3, 'g': 5,
      'h': 4, 'i': 34, 'j': 38, 'k': 40, 'l': 37, 'm': 46, 'n': 45,
      'o': 31, 'p': 35, 'q': 12, 'r': 15, 's': 1, 't': 17, 'u': 32,
      'v': 9, 'w': 13, 'x': 7, 'y': 16, 'z': 6,
      'return': 36, 'tab': 48, 'space': 49, 'delete': 51, 'escape': 53,
      'up': 126, 'down': 125, 'left': 123, 'right': 124,
    };
    return keyCodes[key.toLowerCase()] || 0;
  }
}
