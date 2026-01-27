/**
 * MCP Built-in Tools - Hawkeye 内置 MCP 工具集
 * 参考 claude-code-mcp / macos-automator-mcp 的工具暴露模式
 *
 * 工具分类:
 * 1. 感知工具 - 屏幕截图、OCR、窗口信息
 * 2. 自动化工具 - GUI 操作（点击、输入、滚动）
 * 3. 系统工具 - 剪贴板、Shell 命令、文件操作
 * 4. AI 工具 - 意图分析、计划生成
 */

import type { MCPTool, ToolResult } from './tool-types';

// ============ 工具创建辅助函数 ============

function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function imageResult(base64: string, mimeType = 'image/png'): ToolResult {
  return { content: [{ type: 'image', data: base64, mimeType }] };
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

// ============ 1. 感知工具 ============

/**
 * 屏幕截图工具
 */
export const screenCaptureTool: MCPTool = {
  name: 'hawkeye__perception__screenshot',
  description: 'Capture a screenshot of the current screen. Returns the image as base64 PNG.',
  inputSchema: {
    type: 'object',
    properties: {
      display: { type: 'number', description: 'Display index (0 = primary). Default: 0' },
      region: {
        type: 'object',
        description: 'Optional region to capture (x, y, width, height)',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
      },
    },
  },
  permissions: [{ scope: 'session', level: 'read' }],
  execute: async (input: any) => {
    try {
      const { ScreenCapture } = await import('../perception/screen');
      const capture = new ScreenCapture();
      const result = await capture.capture() as any;
      if (result?.base64) {
        return imageResult(result.base64);
      }
      return errorResult('Failed to capture screen');
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

/**
 * OCR 文本识别工具
 */
export const ocrTool: MCPTool = {
  name: 'hawkeye__perception__ocr',
  description: 'Perform OCR (Optical Character Recognition) on the current screen or a provided image. Returns detected text regions with positions.',
  inputSchema: {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        description: 'OCR language hint (e.g. "eng", "chi_sim", "jpn"). Default: auto',
      },
    },
  },
  permissions: [{ scope: 'session', level: 'read' }],
  execute: async (input: any) => {
    try {
      const { ocrManager } = await import('../perception/ocr');
      const { ScreenCapture } = await import('../perception/screen');
      const capture = new ScreenCapture();
      const screenshot = await capture.capture() as any;
      if (!screenshot?.base64) {
        return errorResult('Failed to capture screen for OCR');
      }
      const result = await ocrManager.recognize(screenshot.base64);
      return textResult(JSON.stringify({
        text: result.text,
        regions: result.regions?.map((r: any) => ({
          text: r.text,
          confidence: r.confidence,
          bounds: r.bounds,
        })),
      }, null, 2));
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

/**
 * 窗口信息工具
 */
export const windowInfoTool: MCPTool = {
  name: 'hawkeye__perception__window_info',
  description: 'Get information about the currently focused window and list of open windows.',
  inputSchema: {
    type: 'object',
    properties: {
      listAll: {
        type: 'boolean',
        description: 'If true, list all open windows. Default: false (focused only)',
      },
    },
  },
  permissions: [{ scope: 'session', level: 'read' }],
  execute: async (input: any) => {
    try {
      const { WindowTracker } = await import('../perception/window');
      const tracker = new WindowTracker();
      const info = await tracker.getActiveWindow();
      return textResult(JSON.stringify(info, null, 2));
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

/**
 * 剪贴板读取工具
 */
export const clipboardReadTool: MCPTool = {
  name: 'hawkeye__system__clipboard_read',
  description: 'Read the current clipboard content (text only).',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  permissions: [{ scope: 'session', level: 'read' }],
  execute: async () => {
    try {
      const { ClipboardWatcher } = await import('../perception/clipboard');
      const watcher = new ClipboardWatcher() as any;
      const content = await watcher.read();
      return textResult(content || '(empty clipboard)');
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

// ============ 2. 自动化工具 ============

/**
 * 鼠标点击工具
 */
export const mouseClickTool: MCPTool = {
  name: 'hawkeye__automation__click',
  description: 'Click at a specific screen coordinate. Supports left, right, and double click.',
  inputSchema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'X coordinate (pixels)' },
      y: { type: 'number', description: 'Y coordinate (pixels)' },
      button: {
        type: 'string',
        description: 'Mouse button: "left" (default), "right", "middle"',
      },
      doubleClick: {
        type: 'boolean',
        description: 'If true, perform a double click. Default: false',
      },
    },
    required: ['x', 'y'],
  },
  permissions: [{ scope: 'session', level: 'execute' }],
  execute: async (input: any) => {
    try {
      const { getNutJSExecutor } = await import('../execution/nutjs-executor');
      const executor = getNutJSExecutor() as any;
      const action = input.doubleClick
        ? { type: 'double_click' as const, x: input.x, y: input.y }
        : { type: 'click' as const, x: input.x, y: input.y, button: input.button || 'left' };
      const result = await executor.executeAction(action);
      return textResult(JSON.stringify({ success: result.success, message: result.message }));
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

/**
 * 键盘输入工具
 */
export const keyboardTypeTool: MCPTool = {
  name: 'hawkeye__automation__type',
  description: 'Type text using the keyboard. The text will be typed character by character at the current cursor position.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to type' },
      delay: {
        type: 'number',
        description: 'Delay between keystrokes in ms. Default: 0 (fastest)',
      },
    },
    required: ['text'],
  },
  permissions: [{ scope: 'session', level: 'execute' }],
  execute: async (input: any) => {
    try {
      const { getNutJSExecutor } = await import('../execution/nutjs-executor');
      const executor = getNutJSExecutor() as any;
      const result = await executor.executeAction({
        type: 'type',
        text: input.text,
      });
      return textResult(JSON.stringify({ success: result.success, message: result.message }));
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

/**
 * 键盘快捷键工具
 */
export const hotkeyTool: MCPTool = {
  name: 'hawkeye__automation__hotkey',
  description: 'Press a keyboard shortcut (e.g. Cmd+C, Ctrl+V, Alt+Tab). Uses platform-aware key names.',
  inputSchema: {
    type: 'object',
    properties: {
      keys: {
        type: 'array',
        description: 'Array of keys to press simultaneously (e.g. ["command", "c"])',
        items: { type: 'string' },
      },
    },
    required: ['keys'],
  },
  permissions: [{ scope: 'session', level: 'execute' }],
  execute: async (input: any) => {
    try {
      const { getNutJSExecutor } = await import('../execution/nutjs-executor');
      const executor = getNutJSExecutor() as any;
      const result = await executor.executeAction({
        type: 'hotkey',
        keys: input.keys,
      });
      return textResult(JSON.stringify({ success: result.success, message: result.message }));
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

/**
 * 鼠标滚动工具
 */
export const scrollTool: MCPTool = {
  name: 'hawkeye__automation__scroll',
  description: 'Scroll at a specific position or the current cursor location.',
  inputSchema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'X coordinate (optional, uses current position if omitted)' },
      y: { type: 'number', description: 'Y coordinate (optional)' },
      direction: {
        type: 'string',
        description: '"up", "down", "left", or "right". Default: "down"',
      },
      amount: {
        type: 'number',
        description: 'Scroll amount in pixels. Default: 300',
      },
    },
  },
  permissions: [{ scope: 'session', level: 'execute' }],
  execute: async (input: any) => {
    try {
      const { getNutJSExecutor } = await import('../execution/nutjs-executor');
      const executor = getNutJSExecutor() as any;
      const result = await executor.executeAction({
        type: 'scroll',
        x: input.x,
        y: input.y,
        direction: input.direction || 'down',
        amount: input.amount || 300,
      });
      return textResult(JSON.stringify({ success: result.success, message: result.message }));
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

// ============ 3. 系统工具 ============

/**
 * Shell 命令执行工具
 */
export const shellExecuteTool: MCPTool = {
  name: 'hawkeye__system__shell',
  description: 'Execute a shell command and return the output. Commands are checked against a security allowlist.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      cwd: { type: 'string', description: 'Working directory (optional)' },
      timeout: { type: 'number', description: 'Timeout in ms. Default: 30000' },
    },
    required: ['command'],
  },
  permissions: [{ scope: 'session', level: 'execute', domains: ['shell'] }],
  execute: async (input: any) => {
    try {
      const { ShellExecutor } = await import('../execution/shell');
      const executor = new ShellExecutor({
        timeout: input.timeout || 30000,
        cwd: input.cwd,
      });
      const result = await executor.execute(input.command) as any;
      return textResult(JSON.stringify({
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      }, null, 2));
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

/**
 * 文件读取工具
 */
export const fileReadTool: MCPTool = {
  name: 'hawkeye__system__file_read',
  description: 'Read the contents of a file. Supports text files and returns the content as string.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute or relative file path' },
      encoding: { type: 'string', description: 'File encoding. Default: "utf-8"' },
    },
    required: ['path'],
  },
  permissions: [{ scope: 'session', level: 'read', domains: ['filesystem'] }],
  execute: async (input: any) => {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(input.path, { encoding: input.encoding || 'utf-8' });
      return textResult(content as unknown as string);
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

/**
 * 文件写入工具
 */
export const fileWriteTool: MCPTool = {
  name: 'hawkeye__system__file_write',
  description: 'Write content to a file. Creates the file if it does not exist.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to write to' },
      content: { type: 'string', description: 'Content to write' },
      encoding: { type: 'string', description: 'File encoding. Default: "utf-8"' },
    },
    required: ['path', 'content'],
  },
  permissions: [{ scope: 'session', level: 'write', domains: ['filesystem'] }],
  execute: async (input: any) => {
    try {
      const fs = await import('fs/promises');
      await fs.writeFile(input.path, input.content, { encoding: input.encoding || 'utf-8' });
      return textResult(JSON.stringify({ success: true, path: input.path }));
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

/**
 * 文件列表工具
 */
export const fileListTool: MCPTool = {
  name: 'hawkeye__system__file_list',
  description: 'List files and directories at the given path.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path to list' },
      recursive: { type: 'boolean', description: 'If true, list recursively. Default: false' },
    },
    required: ['path'],
  },
  permissions: [{ scope: 'session', level: 'read', domains: ['filesystem'] }],
  execute: async (input: any) => {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const entries = await fs.readdir(input.path, { withFileTypes: true });
      const items = entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
        path: path.join(input.path, e.name),
      }));
      return textResult(JSON.stringify(items, null, 2));
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

// ============ 4. AI 工具 ============

/**
 * AI 聊天工具
 */
export const aiChatTool: MCPTool = {
  name: 'hawkeye__ai__chat',
  description: 'Send a message to the AI model and get a response. Uses the configured AI provider (LlamaCpp, Gemini, OpenAI-compatible).',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Message to send to the AI' },
      systemPrompt: { type: 'string', description: 'Optional system prompt override' },
      images: {
        type: 'array',
        description: 'Optional base64-encoded images for vision models',
        items: { type: 'string' },
      },
    },
    required: ['message'],
  },
  permissions: [{ scope: 'session', level: 'execute' }],
  execute: async (input: any) => {
    try {
      const { getAIManager } = await import('../ai');
      const manager = getAIManager();
      const messages: any[] = [];
      if (input.systemPrompt) {
        messages.push({ role: 'system', content: input.systemPrompt });
      }
      messages.push({ role: 'user', content: input.message });

      if (!manager) {
        return errorResult('AI manager not initialized');
      }
      let response: any;
      if (input.images?.length) {
        response = await manager.chatWithVision(messages, input.images);
      } else {
        response = await manager.chat(messages);
      }
      return textResult(response.content);
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

/**
 * 全文搜索工具
 */
export const searchTool: MCPTool = {
  name: 'hawkeye__system__search',
  description: 'Search through stored contexts (window titles, clipboard history, OCR text) using full-text search.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text' },
      limit: { type: 'number', description: 'Max results to return. Default: 20' },
    },
    required: ['query'],
  },
  permissions: [{ scope: 'session', level: 'read' }],
  execute: async (input: any) => {
    try {
      const dbModule = await import('../storage/database') as any;
      const db = new dbModule.HawkeyeDB();
      const results = await (db as any).searchContextsFTS?.(input.query, input.limit || 20);
      if (!results) {
        return textResult('FTS search not available');
      }
      return textResult(JSON.stringify(results, null, 2));
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

/**
 * 任务队列状态工具
 */
export const queueStatusTool: MCPTool = {
  name: 'hawkeye__system__queue_status',
  description: 'Get the current status of the task queue (pending, running, completed counts).',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  permissions: [{ scope: 'session', level: 'read' }],
  execute: async () => {
    try {
      const { getTaskQueue } = await import('../queue');
      const queue = getTaskQueue();
      const status = queue.getStatus();
      return textResult(JSON.stringify({
        pending: status.pending,
        running: status.running,
        completed: status.completed,
        paused: status.paused,
      }, null, 2));
    } catch (e: any) {
      return errorResult(e.message);
    }
  },
};

// ============ 工具集合 ============

/**
 * 所有内置 MCP 工具
 */
export const ALL_BUILTIN_TOOLS: MCPTool[] = [
  // 感知
  screenCaptureTool,
  ocrTool,
  windowInfoTool,
  clipboardReadTool,
  // 自动化
  mouseClickTool,
  keyboardTypeTool,
  hotkeyTool,
  scrollTool,
  // 系统
  shellExecuteTool,
  fileReadTool,
  fileWriteTool,
  fileListTool,
  searchTool,
  queueStatusTool,
  // AI
  aiChatTool,
];

/**
 * 按分类获取工具
 */
export const TOOL_CATEGORIES = {
  perception: [screenCaptureTool, ocrTool, windowInfoTool, clipboardReadTool],
  automation: [mouseClickTool, keyboardTypeTool, hotkeyTool, scrollTool],
  system: [shellExecuteTool, fileReadTool, fileWriteTool, fileListTool, searchTool, queueStatusTool],
  ai: [aiChatTool],
} as const;

/**
 * 注册所有内置工具到注册表
 */
export function registerBuiltinTools(registry: import('./tool-registry').ToolRegistry): void {
  registry.registerTools(ALL_BUILTIN_TOOLS);
}
