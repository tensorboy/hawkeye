/**
 * 系统自动化执行器
 * 支持 macOS AppleScript / Windows PowerShell
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import type { ExecutionResult } from '../types';

const execFileAsync = promisify(execFile);

/**
 * Write data to a command's stdin (replaces shell pipes like `echo x | cmd`).
 */
function spawnWrite(command: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
    proc.on('error', reject);
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

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
          await execFileAsync('open', ['-a', appName]);
          break;
        case 'win32':
          await execFileAsync('cmd', ['/c', 'start', '', appName]);
          break;
        case 'linux':
          try {
            await execFileAsync('xdg-open', [appName]);
          } catch {
            await execFileAsync(appName, []);
          }
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
          await execFileAsync('open', [url]);
          break;
        case 'win32':
          await execFileAsync('cmd', ['/c', 'start', '', url]);
          break;
        case 'linux':
          await execFileAsync('xdg-open', [url]);
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
          await execFileAsync('open', [filePath]);
          break;
        case 'win32':
          await execFileAsync('cmd', ['/c', 'start', '', filePath]);
          break;
        case 'linux':
          await execFileAsync('xdg-open', [filePath]);
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
      const { stdout } = await execFileAsync('osascript', ['-e', script]);
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
      const { stdout } = await execFileAsync('powershell', ['-Command', command]);
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
          await execFileAsync('osascript', ['-e',
            `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`
          ]);
          break;
        case 'win32': {
          const safeTitle = title.replace(/[<>&'"]/g, '');
          const safeMessage = message.replace(/[<>&'"]/g, '');
          await execFileAsync('powershell', ['-Command',
            `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; $xml = '<toast><visual><binding template="ToastText02"><text id="1">${safeTitle}</text><text id="2">${safeMessage}</text></binding></visual></toast>'; $toast = [Windows.Data.Xml.Dom.XmlDocument]::new(); $toast.LoadXml($xml); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Hawkeye').Show([Windows.UI.Notifications.ToastNotification]::new($toast))`
          ]);
          break;
        }
        case 'linux':
          await execFileAsync('notify-send', [title, message]);
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
          await spawnWrite('pbcopy', [], text);
          break;
        case 'win32':
          await spawnWrite('clip', [], text);
          break;
        case 'linux':
          await spawnWrite('xclip', ['-selection', 'clipboard'], text);
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
   * 获取剪贴板内容
   */
  async getClipboard(): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      let content: string;
      switch (this.platform) {
        case 'darwin': {
          const { stdout } = await execFileAsync('pbpaste', []);
          content = stdout;
          break;
        }
        case 'win32': {
          const { stdout } = await execFileAsync('powershell', ['-Command', 'Get-Clipboard']);
          content = stdout;
          break;
        }
        case 'linux': {
          const { stdout } = await execFileAsync('xclip', ['-selection', 'clipboard', '-o']);
          content = stdout;
          break;
        }
        default:
          throw new Error(`不支持的平台: ${this.platform}`);
      }
      return {
        success: true,
        output: content.trim(),
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
   * 浏览器动作
   */
  async browserAction(
    action: string,
    options?: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      switch (action) {
        case 'navigate':
          return this.openUrl(options?.url as string);

        case 'refresh':
          if (this.platform === 'darwin') {
            await execFileAsync('osascript', ['-e', 'tell application "System Events" to keystroke "r" using command down']);
          } else if (this.platform === 'win32') {
            await execFileAsync('powershell', ['-Command', '$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys("^r")']);
          }
          return {
            success: true,
            output: '页面已刷新',
            duration: Date.now() - startTime,
          };

        case 'back':
          if (this.platform === 'darwin') {
            await execFileAsync('osascript', ['-e', 'tell application "System Events" to keystroke "[" using command down']);
          } else if (this.platform === 'win32') {
            await execFileAsync('powershell', ['-Command', '$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys("%{LEFT}")']);
          }
          return {
            success: true,
            output: '已返回上一页',
            duration: Date.now() - startTime,
          };

        case 'forward':
          if (this.platform === 'darwin') {
            await execFileAsync('osascript', ['-e', 'tell application "System Events" to keystroke "]" using command down']);
          } else if (this.platform === 'win32') {
            await execFileAsync('powershell', ['-Command', '$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys("%{RIGHT}")']);
          }
          return {
            success: true,
            output: '已前进到下一页',
            duration: Date.now() - startTime,
          };

        default:
          return {
            success: false,
            error: `不支持的浏览器动作: ${action}`,
            duration: Date.now() - startTime,
          };
      }
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 应用动作
   */
  async appAction(
    app: string,
    action: string,
    options?: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      if (this.platform === 'darwin') {
        // 使用 AppleScript 执行应用动作
        let script = '';
        switch (action) {
          case 'activate':
            script = `tell application "${app}" to activate`;
            break;
          case 'hide':
            script = `tell application "System Events" to set visible of process "${app}" to false`;
            break;
          case 'show':
            script = `tell application "System Events" to set visible of process "${app}" to true`;
            break;
          case 'minimize':
            script = `tell application "${app}" to set miniaturized of every window to true`;
            break;
          default:
            // 自定义动作
            script = `tell application "${app}" to ${action}`;
        }
        return this.runAppleScript(script);
      } else if (this.platform === 'win32') {
        // Windows 下的应用动作较有限
        switch (action) {
          case 'activate':
            await execFileAsync('powershell', ['-Command', `$wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate('${app.replace(/'/g, "''")}')`]);
            return {
              success: true,
              output: `已激活应用: ${app}`,
              duration: Date.now() - startTime,
            };
          case 'minimize':
            await execFileAsync('powershell', ['-Command', `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W32 { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }'; $hwnd = (Get-Process -Name '${app.replace(/'/g, "''")}' | Select-Object -First 1).MainWindowHandle; [W32]::ShowWindow($hwnd, 6)`]);
            return {
              success: true,
              output: `已最小化应用: ${app}`,
              duration: Date.now() - startTime,
            };
          default:
            return {
              success: false,
              error: `Windows 上不支持的应用动作: ${action}`,
              duration: Date.now() - startTime,
            };
        }
      }
      return {
        success: false,
        error: `平台 ${this.platform} 不支持应用动作`,
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
   * 关闭应用程序
   */
  async closeApp(appName: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      switch (this.platform) {
        case 'darwin':
          await execFileAsync('osascript', ['-e', `quit app "${appName.replace(/"/g, '\\"')}"`]);
          break;
        case 'win32':
          await execFileAsync('taskkill', ['/IM', `${appName}.exe`, '/F']);
          break;
        case 'linux':
          await execFileAsync('pkill', ['-f', appName]);
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
          await execFileAsync('osascript', ['-e', script]);
          break;
        }
        case 'win32': {
          const modifierKeys = modifiers?.map(m => `{${m}}`).join('') || '';
          await execFileAsync('powershell', ['-Command', `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('${modifierKeys}${key}')`]);
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

  // ============================================
  // 鼠标控制 (Peekaboo/Computer Use 风格)
  // ============================================

  private cliclickAvailable: boolean | null = null;

  /**
   * 检查 cliclick 是否可用 (macOS)
   */
  private async checkCliclick(): Promise<boolean> {
    if (this.cliclickAvailable !== null) return this.cliclickAvailable;
    if (this.platform !== 'darwin') {
      this.cliclickAvailable = false;
      return false;
    }
    try {
      await execFileAsync('which', ['cliclick']);
      this.cliclickAvailable = true;
    } catch {
      this.cliclickAvailable = false;
    }
    return this.cliclickAvailable;
  }

  /**
   * 移动鼠标到指定位置
   */
  async moveTo(x: number, y: number): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      switch (this.platform) {
        case 'darwin':
          if (await this.checkCliclick()) {
            await execFileAsync('cliclick', [`m:${Math.round(x)},${Math.round(y)}`]);
          } else {
            const pyScript = `import Quartz\nQuartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, (${x}, ${y}), 0))`;
            await execFileAsync('python3', ['-c', pyScript]);
          }
          break;
        case 'linux':
          await execFileAsync('xdotool', ['mousemove', String(Math.round(x)), String(Math.round(y))]);
          break;
        case 'win32':
          await execFileAsync('powershell', ['-Command', `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})`]);
          break;
        default:
          throw new Error(`鼠标移动在 ${this.platform} 上不支持`);
      }
      return {
        success: true,
        output: `鼠标已移动到 (${x}, ${y})`,
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
   * 点击指定位置
   */
  async clickAt(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      switch (this.platform) {
        case 'darwin':
          if (await this.checkCliclick()) {
            const cmd = button === 'right' ? 'rc' : button === 'middle' ? 'mc' : 'c';
            await execFileAsync('cliclick', [`${cmd}:${Math.round(x)},${Math.round(y)}`]);
          } else {
            const buttonNum = button === 'right' ? 1 : button === 'middle' ? 2 : 0;
            const pyScript = [
              'import Quartz, time',
              `pos = (${x}, ${y})`,
              'Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, pos, 0))',
              'time.sleep(0.05)',
              `Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, pos, ${buttonNum}))`,
              `Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, pos, ${buttonNum}))`,
            ].join('\n');
            await execFileAsync('python3', ['-c', pyScript]);
          }
          break;
        case 'linux': {
          const linuxButton = button === 'right' ? 3 : button === 'middle' ? 2 : 1;
          await execFileAsync('xdotool', ['mousemove', String(Math.round(x)), String(Math.round(y)), 'click', String(linuxButton)]);
          break;
        }
        case 'win32': {
          const downFlag = button === 'right' ? 'MOUSEEVENTF_RIGHTDOWN' : button === 'middle' ? 'MOUSEEVENTF_MIDDLEDOWN' : 'MOUSEEVENTF_LEFTDOWN';
          const upFlag = button === 'right' ? 'MOUSEEVENTF_RIGHTUP' : button === 'middle' ? 'MOUSEEVENTF_MIDDLEUP' : 'MOUSEEVENTF_LEFTUP';
          await execFileAsync('powershell', ['-Command', `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class MouseOps { [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo); public const uint MOUSEEVENTF_LEFTDOWN = 0x0002; public const uint MOUSEEVENTF_LEFTUP = 0x0004; public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008; public const uint MOUSEEVENTF_RIGHTUP = 0x0010; public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020; public const uint MOUSEEVENTF_MIDDLEUP = 0x0040; }'
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})
Start-Sleep -Milliseconds 50
[MouseOps]::mouse_event([MouseOps]::${downFlag}, 0, 0, 0, 0); [MouseOps]::mouse_event([MouseOps]::${upFlag}, 0, 0, 0, 0)
`]);
          break;
        }
        default:
          throw new Error(`点击操作在 ${this.platform} 上不支持`);
      }
      return {
        success: true,
        output: `已${button === 'right' ? '右键' : button === 'middle' ? '中键' : ''}点击 (${x}, ${y})`,
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
   * 双击指定位置
   */
  async doubleClickAt(x: number, y: number): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      switch (this.platform) {
        case 'darwin':
          if (await this.checkCliclick()) {
            await execFileAsync('cliclick', [`dc:${Math.round(x)},${Math.round(y)}`]);
          } else {
            const pyScript = [
              'import Quartz, time',
              `pos = (${x}, ${y})`,
              'for _ in range(2):',
              '  Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, pos, 0))',
              '  Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, pos, 0))',
              '  time.sleep(0.05)',
            ].join('\n');
            await execFileAsync('python3', ['-c', pyScript]);
          }
          break;
        case 'linux':
          await execFileAsync('xdotool', ['mousemove', String(Math.round(x)), String(Math.round(y)), 'click', '--repeat', '2', '--delay', '50', '1']);
          break;
        case 'win32':
          await execFileAsync('powershell', ['-Command', `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class MouseOps { [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo); public const uint MOUSEEVENTF_LEFTDOWN = 0x0002; public const uint MOUSEEVENTF_LEFTUP = 0x0004; }'
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})
Start-Sleep -Milliseconds 50
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); [MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); [MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
`]);
          break;
        default:
          throw new Error(`双击操作在 ${this.platform} 上不支持`);
      }
      return {
        success: true,
        output: `已双击 (${x}, ${y})`,
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
   * 拖拽操作
   */
  async drag(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number = 500
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      switch (this.platform) {
        case 'darwin':
          if (await this.checkCliclick()) {
            await execFileAsync('cliclick', [`dd:${Math.round(startX)},${Math.round(startY)}`, `du:${Math.round(endX)},${Math.round(endY)}`]);
          } else {
            const steps = Math.max(10, Math.floor(duration / 20));
            const pyScript = [
              'import Quartz, time',
              `start = (${startX}, ${startY})`,
              `end = (${endX}, ${endY})`,
              `steps = ${steps}`,
              'Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, start, 0))',
              'time.sleep(0.05)',
              'Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, start, 0))',
              'for i in range(steps + 1):',
              '  t = i / steps',
              '  x = start[0] + (end[0] - start[0]) * t',
              '  y = start[1] + (end[1] - start[1]) * t',
              '  Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDragged, (x, y), 0))',
              `  time.sleep(${duration / 1000 / steps})`,
              'Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, end, 0))',
            ].join('\n');
            await execFileAsync('python3', ['-c', pyScript]);
          }
          break;
        case 'linux':
          await execFileAsync('xdotool', ['mousemove', String(Math.round(startX)), String(Math.round(startY)), 'mousedown', '1', 'mousemove', '--delay', String(Math.floor(duration / 10)), String(Math.round(endX)), String(Math.round(endY)), 'mouseup', '1']);
          break;
        case 'win32':
          await execFileAsync('powershell', ['-Command', `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class MouseOps { [DllImport("user32.dll") ] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo); public const uint MOUSEEVENTF_LEFTDOWN = 0x0002; public const uint MOUSEEVENTF_LEFTUP = 0x0004; public const uint MOUSEEVENTF_MOVE = 0x0001; }'
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(startX)}, ${Math.round(startY)})
Start-Sleep -Milliseconds 50
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
$steps = 20
for ($i = 1; $i -le $steps; $i++) { $t = $i / $steps; $x = [int](${startX} + (${endX} - ${startX}) * $t); $y = [int](${startY} + (${endY} - ${startY}) * $t); [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y); Start-Sleep -Milliseconds ${Math.floor(duration / 20)} }
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
`]);
          break;
        default:
          throw new Error(`拖拽操作在 ${this.platform} 上不支持`);
      }
      return {
        success: true,
        output: `已拖拽从 (${startX}, ${startY}) 到 (${endX}, ${endY})`,
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
   * 滚动操作
   */
  async scroll(
    x: number,
    y: number,
    deltaX: number = 0,
    deltaY: number = 0
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      // First move to position
      await this.moveTo(x, y);

      switch (this.platform) {
        case 'darwin':
          if (await this.checkCliclick()) {
            const scrollAmount = Math.round(deltaY / 10) || Math.round(-deltaX / 10);
            await execFileAsync('cliclick', [`m:${Math.round(x)},${Math.round(y)}`]);
            await execFileAsync('cliclick', [`kd:${scrollAmount > 0 ? 'arrow-down' : 'arrow-up'}`]);
          } else {
            const pyScript = [
              'import Quartz',
              `scroll_event = Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitPixel, 2, ${Math.round(-deltaY / 10)}, ${Math.round(-deltaX / 10)})`,
              'Quartz.CGEventPost(Quartz.kCGHIDEventTap, scroll_event)',
            ].join('\n');
            await execFileAsync('python3', ['-c', pyScript]);
          }
          break;
        case 'linux':
          if (deltaY !== 0) {
            const clicks = Math.abs(Math.round(deltaY / 30));
            const button = deltaY > 0 ? 5 : 4;
            await execFileAsync('xdotool', ['click', '--repeat', String(clicks), '--delay', '10', String(button)]);
          }
          if (deltaX !== 0) {
            const clicks = Math.abs(Math.round(deltaX / 30));
            const button = deltaX > 0 ? 7 : 6;
            await execFileAsync('xdotool', ['click', '--repeat', String(clicks), '--delay', '10', String(button)]);
          }
          break;
        case 'win32': {
          let psCmd = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class MouseOps { [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo); public const uint MOUSEEVENTF_WHEEL = 0x0800; public const uint MOUSEEVENTF_HWHEEL = 0x01000; }'\n`;
          psCmd += `[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_WHEEL, 0, 0, ${Math.round(-deltaY)}, 0)\n`;
          if (deltaX !== 0) {
            psCmd += `[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_HWHEEL, 0, 0, ${Math.round(-deltaX)}, 0)\n`;
          }
          await execFileAsync('powershell', ['-Command', psCmd]);
          break;
        }
        default:
          throw new Error(`滚动操作在 ${this.platform} 上不支持`);
      }
      return {
        success: true,
        output: `已在 (${x}, ${y}) 滚动 (${deltaX}, ${deltaY})`,
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
   * 输入文本 (模拟键盘输入)
   */
  async typeText(text: string, delayMs: number = 12): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      switch (this.platform) {
        case 'darwin':
          if (await this.checkCliclick()) {
            await execFileAsync('cliclick', [`t:${text}`]);
          } else {
            await execFileAsync('osascript', ['-e', `tell application "System Events" to keystroke "${text.replace(/"/g, '\\"')}"`]);
          }
          break;
        case 'linux':
          await execFileAsync('xdotool', ['type', '--delay', String(delayMs), '--', text]);
          break;
        case 'win32': {
          const escaped = text
            .replace(/\+/g, '{+}')
            .replace(/\^/g, '{^}')
            .replace(/%/g, '{%}')
            .replace(/~/g, '{~}')
            .replace(/\(/g, '{(}')
            .replace(/\)/g, '{)}')
            .replace(/\[/g, '{[}')
            .replace(/\]/g, '{]}')
            .replace(/{/g, '{{}')
            .replace(/}/g, '{}}');
          await execFileAsync('powershell', ['-Command', `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('${escaped}')`]);
          break;
        }
        default:
          throw new Error(`文本输入在 ${this.platform} 上不支持`);
      }
      return {
        success: true,
        output: `已输入文本: ${text.substring(0, 20)}${text.length > 20 ? '...' : ''}`,
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
   * 获取当前鼠标位置
   */
  async getMousePosition(): Promise<{ x: number; y: number } | null> {
    try {
      switch (this.platform) {
        case 'darwin': {
          const pyScript = [
            'import Quartz',
            'loc = Quartz.NSEvent.mouseLocation()',
            'print(int(loc.x), int(Quartz.CGDisplayPixelsHigh(Quartz.CGMainDisplayID()) - loc.y))',
          ].join('\n');
          const { stdout } = await execFileAsync('python3', ['-c', pyScript]);
          const [x, y] = stdout.trim().split(' ').map(Number);
          return { x, y };
        }
        case 'linux': {
          const { stdout } = await execFileAsync('xdotool', ['getmouselocation', '--shell']);
          const xMatch = stdout.match(/X=(\d+)/);
          const yMatch = stdout.match(/Y=(\d+)/);
          if (xMatch && yMatch) {
            return { x: parseInt(xMatch[1]), y: parseInt(yMatch[1]) };
          }
          return null;
        }
        case 'win32': {
          const { stdout } = await execFileAsync('powershell', ['-Command', '[System.Windows.Forms.Cursor]::Position | Format-List X,Y']);
          const xMatch = stdout.match(/X\s*:\s*(\d+)/);
          const yMatch = stdout.match(/Y\s*:\s*(\d+)/);
          if (xMatch && yMatch) {
            return { x: parseInt(xMatch[1]), y: parseInt(yMatch[1]) };
          }
          return null;
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}
