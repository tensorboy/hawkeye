/**
 * Claude Computer Use 执行器
 *
 * 基于 Anthropic Claude Computer Use API 实现桌面自动化
 * 参考 ShowUI-Aloha 的设计模式
 *
 * 特性:
 * - 支持 computer_20250124 工具类型
 * - 坐标缩放 (参考分辨率 → 实际分辨率)
 * - 多显示器支持
 * - GUI 动作执行 (点击、输入、滚动、拖拽等)
 */

import { EventEmitter } from 'events';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import type { ExecutionResult } from '../types';

const execAsync = promisify(exec);

// ============ 类型定义 ============

/**
 * Computer Use 动作类型
 */
export type ComputerUseAction =
  | 'left_click'
  | 'right_click'
  | 'double_click'
  | 'triple_click'
  | 'middle_click'
  | 'left_click_drag'
  | 'mouse_move'
  | 'scroll'
  | 'type'
  | 'key'
  | 'wait'
  | 'screenshot'
  | 'cursor_position';

/**
 * Computer Use 工具输入
 */
export interface ComputerUseInput {
  action: ComputerUseAction;
  coordinate?: [number, number];
  text?: string;
  duration?: number;
  scroll_direction?: 'up' | 'down' | 'left' | 'right';
  scroll_amount?: number;
}

/**
 * 执行器配置
 */
export interface ClaudeComputerUseConfig {
  /** Claude API Key */
  apiKey: string;
  /** 模型 ID (默认: claude-sonnet-4-20250514) */
  model?: string;
  /** 参考分辨率宽度 (默认: 1024) */
  referenceWidth?: number;
  /** 参考分辨率高度 (默认: 768) */
  referenceHeight?: number;
  /** 选择的屏幕索引 (默认: 0，主屏幕) */
  selectedScreen?: number;
  /** 是否缩放坐标 (默认: true) */
  enableScaling?: boolean;
  /** 最大工具循环次数 (默认: 50) */
  maxToolLoops?: number;
  /** 每次动作后的延迟 (ms, 默认: 100) */
  actionDelay?: number;
}

/**
 * 屏幕信息
 */
interface ScreenInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  isPrimary: boolean;
}

/**
 * Claude API 消息格式
 */
interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'image';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | ClaudeContentBlock[];
  is_error?: boolean;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

/**
 * Claude API 响应
 */
interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: ClaudeContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ============ Claude Computer Use Executor ============

export class ClaudeComputerUseExecutor extends EventEmitter {
  private config: Required<ClaudeComputerUseConfig>;
  private platform: NodeJS.Platform;
  private screenInfo: ScreenInfo | null = null;
  private screenOffset: { x: number; y: number } = { x: 0, y: 0 };

  constructor(config: ClaudeComputerUseConfig) {
    super();

    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'claude-sonnet-4-20250514',
      referenceWidth: config.referenceWidth || 1024,
      referenceHeight: config.referenceHeight || 768,
      selectedScreen: config.selectedScreen || 0,
      enableScaling: config.enableScaling !== false,
      maxToolLoops: config.maxToolLoops || 50,
      actionDelay: config.actionDelay || 100,
    };

    this.platform = process.platform;
  }

  /**
   * 初始化执行器
   */
  async initialize(): Promise<void> {
    // 获取屏幕信息
    await this.detectScreen();
    this.emit('initialized', { screen: this.screenInfo });
  }

  /**
   * 执行任务（完整的 Agent 循环）
   */
  async executeTask(
    task: string,
    options?: {
      screenshot?: string; // base64 截图
      maxLoops?: number;
      onProgress?: (step: number, action: string) => void;
    }
  ): Promise<{
    success: boolean;
    result?: string;
    steps: Array<{ action: string; result: ExecutionResult }>;
    error?: string;
  }> {
    const maxLoops = options?.maxLoops || this.config.maxToolLoops;
    const steps: Array<{ action: string; result: ExecutionResult }> = [];

    // 构建初始消息
    const messages: ClaudeMessage[] = [];

    // 添加用户任务
    const userContent: ClaudeContentBlock[] = [{ type: 'text', text: task }];

    // 如果有截图，添加到消息中
    if (options?.screenshot) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: options.screenshot,
        },
      });
    }

    messages.push({ role: 'user', content: userContent });

    // Agent 循环
    for (let loop = 0; loop < maxLoops; loop++) {
      this.emit('loop:start', { loop, maxLoops });

      try {
        // 调用 Claude API
        const response = await this.callClaudeAPI(messages);

        // 检查是否完成
        if (response.stop_reason === 'end_turn') {
          // 提取最终文本响应
          const textContent = response.content.find((c) => c.type === 'text');
          return {
            success: true,
            result: textContent?.text || 'Task completed',
            steps,
          };
        }

        // 处理工具调用
        if (response.stop_reason === 'tool_use') {
          const toolUses = response.content.filter((c) => c.type === 'tool_use');

          // 添加 assistant 响应到消息历史
          messages.push({ role: 'assistant', content: response.content });

          // 执行每个工具调用
          const toolResults: ClaudeContentBlock[] = [];

          for (const toolUse of toolUses) {
            if (toolUse.name === 'computer') {
              const input = toolUse.input as unknown as ComputerUseInput;
              const actionDesc = this.describeAction(input);

              options?.onProgress?.(loop + 1, actionDesc);
              this.emit('action:executing', { action: input.action, input });

              // 执行动作
              const result = await this.executeAction(input);
              steps.push({ action: actionDesc, result });

              this.emit('action:completed', { action: input.action, result });

              // 构建工具结果
              if (result.success) {
                // 如果是截图动作，返回截图
                if (input.action === 'screenshot' && result.screenshot) {
                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id!,
                    content: [
                      {
                        type: 'image',
                        source: {
                          type: 'base64',
                          media_type: 'image/png',
                          data: result.screenshot,
                        },
                      },
                    ],
                  });
                } else {
                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id!,
                    content: result.output || 'Action completed successfully',
                  });
                }
              } else {
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolUse.id!,
                  content: `Error: ${result.error}`,
                  is_error: true,
                });
              }

              // 动作间延迟
              await this.delay(this.config.actionDelay);
            }
          }

          // 添加工具结果到消息历史
          messages.push({ role: 'user', content: toolResults });
        }
      } catch (error) {
        this.emit('error', error);
        return {
          success: false,
          steps,
          error: (error as Error).message,
        };
      }
    }

    return {
      success: false,
      steps,
      error: 'Max tool loops exceeded',
    };
  }

  /**
   * 单独执行一个动作
   */
  async executeAction(input: ComputerUseInput): Promise<ExecutionResult & { screenshot?: string }> {
    const startTime = Date.now();

    try {
      // 坐标缩放
      let coordinate = input.coordinate;
      if (coordinate && this.config.enableScaling) {
        coordinate = this.scaleCoordinate(coordinate[0], coordinate[1]);
      }

      // 添加屏幕偏移（多显示器支持）
      if (coordinate) {
        coordinate = [
          coordinate[0] + this.screenOffset.x,
          coordinate[1] + this.screenOffset.y,
        ];
      }

      switch (input.action) {
        case 'left_click':
          return await this.mouseClick(coordinate!, 'left', startTime);

        case 'right_click':
          return await this.mouseClick(coordinate!, 'right', startTime);

        case 'double_click':
          return await this.mouseDoubleClick(coordinate!, startTime);

        case 'triple_click':
          return await this.mouseTripleClick(coordinate!, startTime);

        case 'middle_click':
          return await this.mouseClick(coordinate!, 'middle', startTime);

        case 'left_click_drag':
          if (!coordinate) {
            return {
              success: false,
              error: 'Drag action requires end coordinate',
              duration: Date.now() - startTime,
            };
          }
          return await this.mouseDrag(coordinate, startTime);

        case 'mouse_move':
          return await this.mouseMove(coordinate!, startTime);

        case 'scroll':
          return await this.mouseScroll(
            coordinate,
            input.scroll_direction || 'down',
            input.scroll_amount || 3,
            startTime
          );

        case 'type':
          return await this.typeText(input.text || '', startTime);

        case 'key':
          return await this.pressKey(input.text || '', startTime);

        case 'wait':
          return await this.wait(input.duration || 1000, startTime);

        case 'screenshot':
          return await this.takeScreenshot(startTime);

        case 'cursor_position':
          return await this.getCursorPosition(startTime);

        default:
          return {
            success: false,
            error: `Unknown action: ${input.action}`,
            duration: Date.now() - startTime,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }

  // ============ 私有方法 - API 调用 ============

  private async callClaudeAPI(messages: ClaudeMessage[]): Promise<ClaudeResponse> {
    const url = 'https://api.anthropic.com/v1/messages';

    const body = {
      model: this.config.model,
      max_tokens: 4096,
      tools: [
        {
          type: 'computer_20250124',
          name: 'computer',
          display_width_px: this.screenInfo?.width || 1920,
          display_height_px: this.screenInfo?.height || 1080,
          display_number: this.config.selectedScreen + 1,
        },
      ],
      messages,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'computer-use-2025-01-24',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  // ============ 私有方法 - 动作执行 ============

  private async mouseClick(
    coordinate: [number, number],
    button: 'left' | 'right' | 'middle',
    startTime: number
  ): Promise<ExecutionResult> {
    const [x, y] = coordinate;

    if (this.platform === 'darwin') {
      // macOS: 使用 cliclick 或 AppleScript
      const clickType = button === 'right' ? 'rc' : button === 'middle' ? 'mc' : 'c';
      try {
        // 尝试使用 cliclick
        await execAsync(`cliclick ${clickType}:${x},${y}`);
      } catch {
        // 回退到 AppleScript (仅支持左键)
        if (button === 'left') {
          await execAsync(
            `osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`
          );
        } else {
          return {
            success: false,
            error: 'cliclick not installed, only left click supported via AppleScript',
            duration: Date.now() - startTime,
          };
        }
      }
    } else if (this.platform === 'win32') {
      // Windows: 使用 PowerShell
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
        $signature = '[DllImport("user32.dll")] public static extern void mouse_event(int flags, int dx, int dy, int data, int info);'
        $mouse = Add-Type -MemberDefinition $signature -Name 'Mouse' -Namespace 'Win32' -PassThru
        $mouse::mouse_event(${button === 'right' ? '0x0008' : '0x0002'}, 0, 0, 0, 0)
        $mouse::mouse_event(${button === 'right' ? '0x0010' : '0x0004'}, 0, 0, 0, 0)
      `;
      await execAsync(`powershell -Command "${psScript.replace(/\n/g, '; ')}"`);
    } else {
      // Linux: 使用 xdotool
      const btn = button === 'right' ? '3' : button === 'middle' ? '2' : '1';
      await execAsync(`xdotool mousemove ${x} ${y} click ${btn}`);
    }

    return {
      success: true,
      output: `Clicked ${button} at (${x}, ${y})`,
      duration: Date.now() - startTime,
    };
  }

  private async mouseDoubleClick(
    coordinate: [number, number],
    startTime: number
  ): Promise<ExecutionResult> {
    const [x, y] = coordinate;

    if (this.platform === 'darwin') {
      try {
        await execAsync(`cliclick dc:${x},${y}`);
      } catch {
        await execAsync(
          `osascript -e 'tell application "System Events" to click at {${x}, ${y}}' -e 'delay 0.1' -e 'tell application "System Events" to click at {${x}, ${y}}'`
        );
      }
    } else if (this.platform === 'win32') {
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
        $signature = '[DllImport("user32.dll")] public static extern void mouse_event(int flags, int dx, int dy, int data, int info);'
        $mouse = Add-Type -MemberDefinition $signature -Name 'Mouse' -Namespace 'Win32' -PassThru
        $mouse::mouse_event(0x0002, 0, 0, 0, 0); $mouse::mouse_event(0x0004, 0, 0, 0, 0)
        $mouse::mouse_event(0x0002, 0, 0, 0, 0); $mouse::mouse_event(0x0004, 0, 0, 0, 0)
      `;
      await execAsync(`powershell -Command "${psScript.replace(/\n/g, '; ')}"`);
    } else {
      await execAsync(`xdotool mousemove ${x} ${y} click --repeat 2 --delay 50 1`);
    }

    return {
      success: true,
      output: `Double clicked at (${x}, ${y})`,
      duration: Date.now() - startTime,
    };
  }

  private async mouseTripleClick(
    coordinate: [number, number],
    startTime: number
  ): Promise<ExecutionResult> {
    const [x, y] = coordinate;

    if (this.platform === 'darwin') {
      try {
        await execAsync(`cliclick tc:${x},${y}`);
      } catch {
        // AppleScript fallback
        await execAsync(
          `osascript -e 'tell application "System Events" to click at {${x}, ${y}}' -e 'delay 0.05' -e 'tell application "System Events" to click at {${x}, ${y}}' -e 'delay 0.05' -e 'tell application "System Events" to click at {${x}, ${y}}'`
        );
      }
    } else if (this.platform === 'linux') {
      await execAsync(`xdotool mousemove ${x} ${y} click --repeat 3 --delay 50 1`);
    } else {
      // Windows: three clicks
      await this.mouseDoubleClick(coordinate, startTime);
      await this.delay(50);
      await this.mouseClick(coordinate, 'left', startTime);
    }

    return {
      success: true,
      output: `Triple clicked at (${x}, ${y})`,
      duration: Date.now() - startTime,
    };
  }

  private async mouseMove(
    coordinate: [number, number],
    startTime: number
  ): Promise<ExecutionResult> {
    const [x, y] = coordinate;

    if (this.platform === 'darwin') {
      try {
        await execAsync(`cliclick m:${x},${y}`);
      } catch {
        await execAsync(
          `osascript -e 'tell application "System Events" to set position of mouse to {${x}, ${y}}'`
        );
      }
    } else if (this.platform === 'win32') {
      await execAsync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})"`
      );
    } else {
      await execAsync(`xdotool mousemove ${x} ${y}`);
    }

    return {
      success: true,
      output: `Mouse moved to (${x}, ${y})`,
      duration: Date.now() - startTime,
    };
  }

  private async mouseDrag(
    endCoordinate: [number, number],
    startTime: number
  ): Promise<ExecutionResult> {
    const [endX, endY] = endCoordinate;

    if (this.platform === 'darwin') {
      try {
        // cliclick: dd (drag down - press), then dm (drag move)
        await execAsync(`cliclick dd:. dm:${endX},${endY} du:.`);
      } catch {
        return {
          success: false,
          error: 'Drag requires cliclick on macOS',
          duration: Date.now() - startTime,
        };
      }
    } else if (this.platform === 'linux') {
      await execAsync(`xdotool mousedown 1 mousemove ${endX} ${endY} mouseup 1`);
    } else {
      return {
        success: false,
        error: 'Drag not implemented for Windows',
        duration: Date.now() - startTime,
      };
    }

    return {
      success: true,
      output: `Dragged to (${endX}, ${endY})`,
      duration: Date.now() - startTime,
    };
  }

  private async mouseScroll(
    coordinate: [number, number] | undefined,
    direction: 'up' | 'down' | 'left' | 'right',
    amount: number,
    startTime: number
  ): Promise<ExecutionResult> {
    // 如果指定了坐标，先移动鼠标
    if (coordinate) {
      await this.mouseMove(coordinate, startTime);
    }

    if (this.platform === 'darwin') {
      const scrollAmount = direction === 'up' || direction === 'left' ? amount : -amount;
      const axis = direction === 'up' || direction === 'down' ? 'y' : 'x';

      try {
        if (axis === 'y') {
          await execAsync(`cliclick w:${scrollAmount * 10}`);
        }
      } catch {
        // AppleScript fallback (limited)
        await execAsync(
          `osascript -e 'tell application "System Events" to scroll ${direction}'`
        );
      }
    } else if (this.platform === 'win32') {
      const scrollValue = direction === 'up' ? 120 * amount : -120 * amount;
      await execAsync(
        `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void mouse_event(int f, int x, int y, int d, int i);'; $m = Add-Type -MemberDefinition $sig -Name 'M' -Namespace 'W' -PassThru; $m::mouse_event(0x0800, 0, 0, ${scrollValue}, 0)"`
      );
    } else {
      const clicks = direction === 'up' || direction === 'left' ? 4 : 5;
      await execAsync(`xdotool click --repeat ${amount} ${clicks}`);
    }

    return {
      success: true,
      output: `Scrolled ${direction} by ${amount}`,
      duration: Date.now() - startTime,
    };
  }

  private async typeText(text: string, startTime: number): Promise<ExecutionResult> {
    if (this.platform === 'darwin') {
      // 使用 AppleScript，需要转义特殊字符
      const escaped = text.replace(/"/g, '\\"').replace(/'/g, "'\"'\"'");
      await execAsync(
        `osascript -e 'tell application "System Events" to keystroke "${escaped}"'`
      );
    } else if (this.platform === 'win32') {
      // PowerShell SendKeys
      const escaped = text.replace(/[+^%~()[\]{}]/g, '{$&}');
      await execAsync(
        `powershell -Command "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('${escaped}')"`
      );
    } else {
      await execAsync(`xdotool type -- '${text.replace(/'/g, "'\\''")}'`);
    }

    return {
      success: true,
      output: `Typed: ${text.slice(0, 50)}${text.length > 50 ? '...' : ''}`,
      duration: Date.now() - startTime,
    };
  }

  private async pressKey(key: string, startTime: number): Promise<ExecutionResult> {
    // 解析组合键，如 "ctrl+c", "cmd+shift+s"
    const parts = key.toLowerCase().split('+');
    const mainKey = parts.pop()!;
    const modifiers = parts;

    if (this.platform === 'darwin') {
      const modMap: Record<string, string> = {
        ctrl: 'control down',
        control: 'control down',
        cmd: 'command down',
        command: 'command down',
        alt: 'option down',
        option: 'option down',
        shift: 'shift down',
      };

      const mods = modifiers.map((m) => modMap[m] || '').filter(Boolean);
      const modStr = mods.length > 0 ? ` using {${mods.join(', ')}}` : '';

      // 处理特殊键名
      const keyMap: Record<string, string> = {
        enter: 'return',
        esc: 'escape',
        backspace: 'delete',
        delete: 'forward delete',
        tab: 'tab',
        space: 'space',
        up: 'up arrow',
        down: 'down arrow',
        left: 'left arrow',
        right: 'right arrow',
      };

      const keyName = keyMap[mainKey] || mainKey;
      await execAsync(
        `osascript -e 'tell application "System Events" to key code (key code of "${keyName}")${modStr}'`
      );
    } else if (this.platform === 'win32') {
      const modMap: Record<string, string> = {
        ctrl: '^',
        control: '^',
        alt: '%',
        shift: '+',
      };

      let keySeq = modifiers.map((m) => modMap[m] || '').join('');
      keySeq += `{${mainKey.toUpperCase()}}`;

      await execAsync(
        `powershell -Command "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('${keySeq}')"`
      );
    } else {
      const modMap: Record<string, string> = {
        ctrl: 'ctrl',
        control: 'ctrl',
        alt: 'alt',
        shift: 'shift',
        super: 'super',
        meta: 'super',
      };

      const modStr = modifiers.map((m) => modMap[m] || m).join('+');
      const fullKey = modStr ? `${modStr}+${mainKey}` : mainKey;
      await execAsync(`xdotool key ${fullKey}`);
    }

    return {
      success: true,
      output: `Pressed: ${key}`,
      duration: Date.now() - startTime,
    };
  }

  private async wait(ms: number, startTime: number): Promise<ExecutionResult> {
    await this.delay(ms);
    return {
      success: true,
      output: `Waited ${ms}ms`,
      duration: Date.now() - startTime,
    };
  }

  private async takeScreenshot(startTime: number): Promise<ExecutionResult & { screenshot?: string }> {
    const tempFile = `/tmp/hawkeye_screenshot_${Date.now()}.png`;

    try {
      if (this.platform === 'darwin') {
        await execAsync(`screencapture -x ${tempFile}`);
      } else if (this.platform === 'win32') {
        await execAsync(
          `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { $bmp = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); $bmp.Save('${tempFile}') }"`
        );
      } else {
        await execAsync(`import -window root ${tempFile}`);
      }

      // 读取文件并转换为 base64
      const { readFile, unlink } = await import('fs/promises');
      const buffer = await readFile(tempFile);
      const base64 = buffer.toString('base64');

      // 删除临时文件
      await unlink(tempFile).catch(() => {});

      return {
        success: true,
        output: 'Screenshot captured',
        screenshot: base64,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: `Screenshot failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
      };
    }
  }

  private async getCursorPosition(startTime: number): Promise<ExecutionResult> {
    let position: { x: number; y: number } | null = null;

    if (this.platform === 'darwin') {
      try {
        const { stdout } = await execAsync(`cliclick p`);
        const match = stdout.match(/(\d+),(\d+)/);
        if (match) {
          position = { x: parseInt(match[1]), y: parseInt(match[2]) };
        }
      } catch {
        // AppleScript fallback
        const { stdout } = await execAsync(
          `osascript -e 'tell application "System Events" to get position of mouse'`
        );
        const match = stdout.match(/(\d+),\s*(\d+)/);
        if (match) {
          position = { x: parseInt(match[1]), y: parseInt(match[2]) };
        }
      }
    } else if (this.platform === 'linux') {
      const { stdout } = await execAsync(`xdotool getmouselocation`);
      const match = stdout.match(/x:(\d+)\s+y:(\d+)/);
      if (match) {
        position = { x: parseInt(match[1]), y: parseInt(match[2]) };
      }
    }

    if (position) {
      return {
        success: true,
        output: `Cursor at (${position.x}, ${position.y})`,
        duration: Date.now() - startTime,
      };
    }

    return {
      success: false,
      error: 'Could not get cursor position',
      duration: Date.now() - startTime,
    };
  }

  // ============ 私有方法 - 辅助函数 ============

  /**
   * 检测屏幕信息
   */
  private async detectScreen(): Promise<void> {
    try {
      if (this.platform === 'darwin') {
        // macOS: 使用 system_profiler 或 Quartz
        const { stdout } = await execAsync(
          `system_profiler SPDisplaysDataType -json 2>/dev/null || echo '{"SPDisplaysDataType":[{"spdisplays_ndrvs":[{"_spdisplays_resolution":"1920 x 1080"}]}]}'`
        );
        try {
          const data = JSON.parse(stdout);
          const displays = data.SPDisplaysDataType?.[0]?.spdisplays_ndrvs || [];
          if (displays.length > this.config.selectedScreen) {
            const display = displays[this.config.selectedScreen];
            const resolution = display._spdisplays_resolution || '1920 x 1080';
            const [width, height] = resolution.split(' x ').map((n: string) => parseInt(n.trim()));
            this.screenInfo = { x: 0, y: 0, width, height, isPrimary: true };
          }
        } catch {
          this.screenInfo = { x: 0, y: 0, width: 1920, height: 1080, isPrimary: true };
        }
      } else if (this.platform === 'win32') {
        const { stdout } = await execAsync(
          `powershell -Command "[System.Windows.Forms.Screen]::PrimaryScreen.Bounds | ConvertTo-Json"`
        );
        const bounds = JSON.parse(stdout);
        this.screenInfo = {
          x: bounds.X || 0,
          y: bounds.Y || 0,
          width: bounds.Width || 1920,
          height: bounds.Height || 1080,
          isPrimary: true,
        };
      } else {
        // Linux: 使用 xrandr
        const { stdout } = await execAsync(`xrandr --current 2>/dev/null || echo "1920x1080"`);
        const match = stdout.match(/(\d+)x(\d+)/);
        if (match) {
          this.screenInfo = {
            x: 0,
            y: 0,
            width: parseInt(match[1]),
            height: parseInt(match[2]),
            isPrimary: true,
          };
        }
      }
    } catch {
      // 默认值
      this.screenInfo = { x: 0, y: 0, width: 1920, height: 1080, isPrimary: true };
    }

    // 计算屏幕偏移（多显示器）
    this.screenOffset = { x: this.screenInfo?.x || 0, y: this.screenInfo?.y || 0 };
  }

  /**
   * 坐标缩放（从参考分辨率到实际分辨率）
   */
  private scaleCoordinate(x: number, y: number): [number, number] {
    if (!this.screenInfo) {
      return [x, y];
    }

    const scaleX = this.screenInfo.width / this.config.referenceWidth;
    const scaleY = this.screenInfo.height / this.config.referenceHeight;

    return [Math.round(x * scaleX), Math.round(y * scaleY)];
  }

  /**
   * 描述动作
   */
  private describeAction(input: ComputerUseInput): string {
    switch (input.action) {
      case 'left_click':
        return `Click at (${input.coordinate?.[0]}, ${input.coordinate?.[1]})`;
      case 'right_click':
        return `Right-click at (${input.coordinate?.[0]}, ${input.coordinate?.[1]})`;
      case 'double_click':
        return `Double-click at (${input.coordinate?.[0]}, ${input.coordinate?.[1]})`;
      case 'type':
        return `Type: "${input.text?.slice(0, 30)}${(input.text?.length || 0) > 30 ? '...' : ''}"`;
      case 'key':
        return `Press key: ${input.text}`;
      case 'scroll':
        return `Scroll ${input.scroll_direction} by ${input.scroll_amount}`;
      case 'screenshot':
        return 'Take screenshot';
      case 'wait':
        return `Wait ${input.duration}ms`;
      default:
        return input.action;
    }
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============ 工厂函数 ============

let globalClaudeComputerUseExecutor: ClaudeComputerUseExecutor | null = null;

export function createClaudeComputerUseExecutor(
  config: ClaudeComputerUseConfig
): ClaudeComputerUseExecutor {
  return new ClaudeComputerUseExecutor(config);
}

export function getClaudeComputerUseExecutor(): ClaudeComputerUseExecutor | null {
  return globalClaudeComputerUseExecutor;
}

export async function initializeClaudeComputerUseExecutor(
  config: ClaudeComputerUseConfig
): Promise<ClaudeComputerUseExecutor> {
  globalClaudeComputerUseExecutor = new ClaudeComputerUseExecutor(config);
  await globalClaudeComputerUseExecutor.initialize();
  return globalClaudeComputerUseExecutor;
}
