/**
 * Chrome DevTools MCP Client
 * 通过 WebSocket 连接 Chrome DevTools Protocol 实现浏览器自动化
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type {
  MCPConfig,
  MCPConnectionStatus,
  MCPResult,
  BrowserAction,
  BrowserActionType,
  BrowserNavigateParams,
  BrowserClickParams,
  BrowserTypeParams,
  BrowserFillFormParams,
  BrowserScreenshotParams,
  BrowserSnapshotParams,
  BrowserHoverParams,
  BrowserSelectParams,
  BrowserPressKeyParams,
  BrowserWaitParams,
  BrowserDragParams,
  BrowserEvaluateParams,
  BrowserTabsParams,
  BrowserFileUploadParams,
  BrowserDialogParams,
  SnapshotResult,
  ScreenshotResult,
  ConsoleMessage,
  NetworkRequest,
  TabInfo,
} from './types';

/**
 * Chrome DevTools Protocol 消息
 */
interface CDPMessage {
  id: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Chrome DevTools MCP 客户端
 * 提供与 Chrome 浏览器交互的能力
 */
export class ChromeDevToolsMCP extends EventEmitter {
  private config: MCPConfig;
  private ws: WebSocket | null = null;
  private status: MCPConnectionStatus = 'disconnected';
  private messageId = 0;
  private pendingMessages: Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }> = new Map();
  private consoleMessages: ConsoleMessage[] = [];
  private networkRequests: NetworkRequest[] = [];

  constructor(config: MCPConfig = {}) {
    super();
    this.config = {
      debugPort: config.debugPort || 9222,
      headless: config.headless ?? false,
      timeout: config.timeout || 30000,
      viewport: config.viewport || { width: 1280, height: 720 },
      ...config,
    };
  }

  /**
   * 获取连接状态
   */
  getStatus(): MCPConnectionStatus {
    return this.status;
  }

  /**
   * 连接到 Chrome DevTools
   */
  async connect(): Promise<MCPResult<void>> {
    const startTime = Date.now();

    if (this.status === 'connected') {
      return { success: true, duration: 0 };
    }

    this.status = 'connecting';
    this.emit('status', this.status);

    try {
      // 获取 WebSocket 调试 URL
      const debugUrl = await this.getDebugUrl();

      // 连接 WebSocket
      await this.connectWebSocket(debugUrl);

      // 启用必要的域
      await this.enableDomains();

      this.status = 'connected';
      this.emit('status', this.status);

      return {
        success: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.status = 'error';
      this.emit('status', this.status);
      this.emit('error', error);

      return {
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.status = 'disconnected';
    this.pendingMessages.clear();
    this.emit('status', this.status);
  }

  /**
   * 执行浏览器动作
   */
  async executeAction<T extends BrowserActionType>(
    action: BrowserAction<T>
  ): Promise<MCPResult> {
    const startTime = Date.now();

    if (this.status !== 'connected') {
      return {
        success: false,
        error: 'Not connected to Chrome DevTools',
        duration: Date.now() - startTime,
      };
    }

    try {
      let result: unknown;

      switch (action.type) {
        case 'navigate':
          result = await this.navigate(action.params as BrowserNavigateParams);
          break;
        case 'click':
          result = await this.click(action.params as BrowserClickParams);
          break;
        case 'type':
          result = await this.type(action.params as BrowserTypeParams);
          break;
        case 'fill_form':
          result = await this.fillForm(action.params as BrowserFillFormParams);
          break;
        case 'screenshot':
          result = await this.screenshot(action.params as BrowserScreenshotParams);
          break;
        case 'snapshot':
          result = await this.snapshot(action.params as BrowserSnapshotParams);
          break;
        case 'hover':
          result = await this.hover(action.params as BrowserHoverParams);
          break;
        case 'select':
          result = await this.select(action.params as BrowserSelectParams);
          break;
        case 'press_key':
          result = await this.pressKey(action.params as BrowserPressKeyParams);
          break;
        case 'wait':
          result = await this.wait(action.params as BrowserWaitParams);
          break;
        case 'drag':
          result = await this.drag(action.params as BrowserDragParams);
          break;
        case 'evaluate':
          result = await this.evaluate(action.params as BrowserEvaluateParams);
          break;
        case 'tabs':
          result = await this.tabs(action.params as BrowserTabsParams);
          break;
        case 'file_upload':
          result = await this.fileUpload(action.params as BrowserFileUploadParams);
          break;
        case 'dialog':
          result = await this.handleDialog(action.params as BrowserDialogParams);
          break;
        case 'navigate_back':
          result = await this.navigateBack();
          break;
        case 'close':
          result = await this.closePage();
          break;
        case 'resize':
          result = await this.resize(action.params as { width: number; height: number });
          break;
        case 'console_messages':
          result = await this.getConsoleMessages(
            action.params as { level?: 'error' | 'warning' | 'info' | 'debug' }
          );
          break;
        case 'network_requests':
          result = await this.getNetworkRequests(
            action.params as { includeStatic?: boolean }
          );
          break;
        default:
          return {
            success: false,
            error: `Unknown action type: ${action.type}`,
            duration: Date.now() - startTime,
          };
      }

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }

  // ============ 浏览器操作实现 ============

  /**
   * 导航到 URL
   */
  private async navigate(params: BrowserNavigateParams): Promise<void> {
    await this.sendCommand('Page.navigate', { url: params.url });

    // 等待页面加载
    if (params.waitUntil) {
      await this.waitForLoad(params.waitUntil);
    } else {
      await this.waitForLoad('load');
    }
  }

  /**
   * 点击元素
   */
  private async click(params: BrowserClickParams): Promise<void> {
    const { x, y } = await this.getElementCenter(params.element, params.ref);

    await this.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: params.button || 'left',
      clickCount: params.doubleClick ? 2 : 1,
    });

    await this.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: params.button || 'left',
    });
  }

  /**
   * 输入文本
   */
  private async type(params: BrowserTypeParams): Promise<void> {
    // 先聚焦元素
    await this.focusElement(params.element, params.ref);

    if (params.slowly) {
      // 逐字符输入
      for (const char of params.text) {
        await this.sendCommand('Input.dispatchKeyEvent', {
          type: 'char',
          text: char,
        });
        await this.sleep(50);
      }
    } else {
      // 直接输入
      await this.sendCommand('Input.insertText', { text: params.text });
    }

    if (params.submit) {
      await this.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
      });
      await this.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
      });
    }
  }

  /**
   * 填写表单
   */
  private async fillForm(params: BrowserFillFormParams): Promise<void> {
    for (const field of params.fields) {
      switch (field.type) {
        case 'textbox':
          await this.type({
            element: field.name,
            ref: field.ref,
            text: field.value,
          });
          break;
        case 'checkbox':
          if (field.value === 'true') {
            await this.click({ element: field.name, ref: field.ref });
          }
          break;
        case 'radio':
          await this.click({ element: field.name, ref: field.ref });
          break;
        case 'combobox':
          await this.select({
            element: field.name,
            ref: field.ref,
            values: [field.value],
          });
          break;
        case 'slider':
          // 滑块需要特殊处理
          await this.setSliderValue(field.ref, parseFloat(field.value));
          break;
      }
    }
  }

  /**
   * 截图
   */
  private async screenshot(params: BrowserScreenshotParams): Promise<ScreenshotResult> {
    const options: Record<string, unknown> = {
      format: params.type || 'png',
    };

    if (params.fullPage) {
      // 获取完整页面尺寸
      const metrics = await this.sendCommand('Page.getLayoutMetrics');
      const contentSize = (metrics as { contentSize: { width: number; height: number } }).contentSize;
      options.clip = {
        x: 0,
        y: 0,
        width: contentSize.width,
        height: contentSize.height,
        scale: 1,
      };
    }

    const result = await this.sendCommand('Page.captureScreenshot', options);
    const imageData = (result as { data: string }).data;

    return {
      imageData,
      filePath: params.filename,
    };
  }

  /**
   * 获取页面快照 (可访问性树)
   */
  private async snapshot(_params: BrowserSnapshotParams): Promise<SnapshotResult> {
    // 获取可访问性树
    const result = await this.sendCommand('Accessibility.getFullAXTree');
    const tree = (result as { nodes: Array<{ nodeId: string; name?: { value: string }; role?: { value: string } }> }).nodes;

    // 获取页面信息
    const evalResult = await this.sendCommand('Runtime.evaluate', {
      expression: 'JSON.stringify({ title: document.title, url: location.href })',
      returnByValue: true,
    });
    const pageInfo = JSON.parse(
      ((evalResult as { result: { value: string } }).result.value) as string
    );

    // 构建可访问性树的 Markdown 表示
    const accessibilityTree = this.buildAccessibilityTreeMarkdown(tree);

    return {
      title: pageInfo.title,
      url: pageInfo.url,
      accessibilityTree,
      elementRefs: new Map(),
    };
  }

  /**
   * 悬停元素
   */
  private async hover(params: BrowserHoverParams): Promise<void> {
    const { x, y } = await this.getElementCenter(params.element, params.ref);

    await this.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    });
  }

  /**
   * 下拉选择
   */
  private async select(params: BrowserSelectParams): Promise<void> {
    // 先点击打开下拉
    await this.click({ element: params.element, ref: params.ref });

    // 选择选项
    for (const value of params.values) {
      await this.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            const select = document.querySelector('[data-ref="${params.ref}"]') ||
                          document.evaluate("//*[contains(text(), '${params.element}')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (select && select.tagName === 'SELECT') {
              select.value = '${value}';
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()
        `,
      });
    }
  }

  /**
   * 按键
   */
  private async pressKey(params: BrowserPressKeyParams): Promise<void> {
    await this.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: params.key,
    });
    await this.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: params.key,
    });
  }

  /**
   * 等待
   */
  private async wait(params: BrowserWaitParams): Promise<void> {
    if (params.time) {
      await this.sleep(params.time * 1000);
      return;
    }

    const timeout = this.config.timeout || 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const evalResult = await this.sendCommand('Runtime.evaluate', {
        expression: `document.body.innerText`,
        returnByValue: true,
      });
      const text = (evalResult as { result: { value: string } }).result.value;

      if (params.text && text.includes(params.text)) {
        return;
      }

      if (params.textGone && !text.includes(params.textGone)) {
        return;
      }

      await this.sleep(100);
    }

    throw new Error('Wait timeout');
  }

  /**
   * 拖拽
   */
  private async drag(params: BrowserDragParams): Promise<void> {
    const start = await this.getElementCenter(params.startElement, params.startRef);
    const end = await this.getElementCenter(params.endElement, params.endRef);

    // 按下
    await this.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: start.x,
      y: start.y,
      button: 'left',
    });

    // 移动
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const x = start.x + (end.x - start.x) * (i / steps);
      const y = start.y + (end.y - start.y) * (i / steps);
      await this.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
      });
      await this.sleep(20);
    }

    // 释放
    await this.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: end.x,
      y: end.y,
      button: 'left',
    });
  }

  /**
   * 执行 JavaScript
   */
  private async evaluate(params: BrowserEvaluateParams): Promise<unknown> {
    const result = await this.sendCommand('Runtime.evaluate', {
      expression: `(${params.function})()`,
      returnByValue: true,
      awaitPromise: true,
    });
    return (result as { result: { value: unknown } }).result.value;
  }

  /**
   * 标签页操作
   */
  private async tabs(params: BrowserTabsParams): Promise<TabInfo[] | void> {
    switch (params.action) {
      case 'list':
        const targets = await this.getTargets();
        return targets.map((t, i) => ({
          index: i,
          title: t.title,
          url: t.url,
          active: t.attached,
        }));
      case 'new':
        await this.sendCommand('Target.createTarget', { url: 'about:blank' });
        break;
      case 'close':
        // 关闭当前标签页
        await this.closePage();
        break;
      case 'select':
        if (params.index !== undefined) {
          const targets = await this.getTargets();
          if (targets[params.index]) {
            await this.attachToTarget(targets[params.index].targetId);
          }
        }
        break;
    }
  }

  /**
   * 文件上传
   */
  private async fileUpload(params: BrowserFileUploadParams): Promise<void> {
    if (!params.paths || params.paths.length === 0) {
      // 取消文件选择
      return;
    }

    await this.sendCommand('DOM.setFileInputFiles', {
      files: params.paths,
    });
  }

  /**
   * 处理对话框
   */
  private async handleDialog(params: BrowserDialogParams): Promise<void> {
    await this.sendCommand('Page.handleJavaScriptDialog', {
      accept: params.accept,
      promptText: params.promptText,
    });
  }

  /**
   * 返回上一页
   */
  private async navigateBack(): Promise<void> {
    await this.sendCommand('Page.navigateToHistoryEntry', {
      entryId: -1, // 相对当前位置
    });
  }

  /**
   * 关闭页面
   */
  private async closePage(): Promise<void> {
    await this.sendCommand('Page.close');
  }

  /**
   * 调整窗口大小
   */
  private async resize(params: { width: number; height: number }): Promise<void> {
    await this.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: params.width,
      height: params.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  /**
   * 获取控制台消息
   */
  private async getConsoleMessages(
    params: { level?: 'error' | 'warning' | 'info' | 'debug' }
  ): Promise<ConsoleMessage[]> {
    const levelPriority: Record<string, number> = {
      debug: 0,
      info: 1,
      warning: 2,
      error: 3,
    };

    const minLevel = params.level ? levelPriority[params.level] : 1;

    return this.consoleMessages.filter(
      (msg) => levelPriority[msg.level] >= minLevel
    );
  }

  /**
   * 获取网络请求
   */
  private async getNetworkRequests(
    params: { includeStatic?: boolean }
  ): Promise<NetworkRequest[]> {
    if (params.includeStatic) {
      return this.networkRequests;
    }

    const staticTypes = ['Image', 'Font', 'Stylesheet', 'Script'];
    return this.networkRequests.filter(
      (req) => !staticTypes.includes(req.resourceType)
    );
  }

  // ============ 辅助方法 ============

  /**
   * 获取调试 URL
   */
  private async getDebugUrl(): Promise<string> {
    const response = await fetch(
      `http://localhost:${this.config.debugPort}/json/version`
    );
    const data = await response.json();
    return data.webSocketDebuggerUrl;
  }

  /**
   * 连接 WebSocket
   */
  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(JSON.parse(data.toString()));
      });

      this.ws.on('error', (error) => {
        reject(error);
      });

      this.ws.on('close', () => {
        this.status = 'disconnected';
        this.emit('status', this.status);
      });
    });
  }

  /**
   * 启用必要的 CDP 域
   */
  private async enableDomains(): Promise<void> {
    await Promise.all([
      this.sendCommand('Page.enable'),
      this.sendCommand('DOM.enable'),
      this.sendCommand('Runtime.enable'),
      this.sendCommand('Network.enable'),
      this.sendCommand('Console.enable'),
      this.sendCommand('Accessibility.enable'),
    ]);

    // 设置视口
    await this.resize(this.config.viewport!);
  }

  /**
   * 发送 CDP 命令
   */
  private sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = ++this.messageId;
      const message: CDPMessage = { id, method, params };

      this.pendingMessages.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(message));

      // 超时处理
      setTimeout(() => {
        if (this.pendingMessages.has(id)) {
          this.pendingMessages.delete(id);
          reject(new Error(`Command timeout: ${method}`));
        }
      }, this.config.timeout);
    });
  }

  /**
   * 处理 CDP 消息
   */
  private handleMessage(message: CDPMessage): void {
    // 响应消息
    if (message.id !== undefined) {
      const pending = this.pendingMessages.get(message.id);
      if (pending) {
        this.pendingMessages.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // 事件消息
    if (message.method) {
      this.handleEvent(message.method, message.params || {});
    }
  }

  /**
   * 处理 CDP 事件
   */
  private handleEvent(method: string, params: Record<string, unknown>): void {
    switch (method) {
      case 'Console.messageAdded':
        const msg = params.message as { level: string; text: string };
        this.consoleMessages.push({
          level: msg.level as ConsoleMessage['level'],
          text: msg.text,
          timestamp: Date.now(),
        });
        this.emit('console', msg);
        break;

      case 'Network.requestWillBeSent':
        const request = params.request as { url: string; method: string };
        this.networkRequests.push({
          url: request.url,
          method: request.method,
          resourceType: params.type as string,
          timestamp: Date.now(),
        });
        break;

      case 'Network.responseReceived':
        const response = params.response as { status: number; url: string };
        const req = this.networkRequests.find((r) => r.url === response.url);
        if (req) {
          req.status = response.status;
        }
        break;

      case 'Page.javascriptDialogOpening':
        this.emit('dialog', params);
        break;
    }
  }

  /**
   * 获取元素中心坐标
   */
  private async getElementCenter(
    element: string,
    ref?: string
  ): Promise<{ x: number; y: number }> {
    // 使用选择器或文本查找元素
    const result = await this.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          let el = ${ref ? `document.querySelector('[data-ref="${ref}"]')` : 'null'};
          if (!el) {
            el = document.evaluate(
              "//*[contains(text(), '${element}')]",
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            ).singleNodeValue;
          }
          if (!el) {
            el = document.querySelector('${element}');
          }
          if (el) {
            const rect = el.getBoundingClientRect();
            return JSON.stringify({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2
            });
          }
          return null;
        })()
      `,
      returnByValue: true,
    });

    const value = (result as { result: { value: string } }).result.value;
    if (!value) {
      throw new Error(`Element not found: ${element}`);
    }

    return JSON.parse(value);
  }

  /**
   * 聚焦元素
   */
  private async focusElement(element: string, ref?: string): Promise<void> {
    await this.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          let el = ${ref ? `document.querySelector('[data-ref="${ref}"]')` : 'null'};
          if (!el) {
            el = document.querySelector('${element}');
          }
          if (el) {
            el.focus();
          }
        })()
      `,
    });
  }

  /**
   * 设置滑块值
   */
  private async setSliderValue(ref: string, value: number): Promise<void> {
    await this.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const slider = document.querySelector('[data-ref="${ref}"]');
          if (slider) {
            slider.value = ${value};
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `,
    });
  }

  /**
   * 等待页面加载
   */
  private waitForLoad(condition: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void> {
    return new Promise((resolve) => {
      const handler = (method: string) => {
        if (condition === 'load' && method === 'Page.loadEventFired') {
          resolve();
        } else if (condition === 'domcontentloaded' && method === 'Page.domContentEventFired') {
          resolve();
        } else if (condition === 'networkidle' && method === 'Page.loadEventFired') {
          // 简化处理：等待 load 事件后再等 500ms
          setTimeout(resolve, 500);
        }
      };

      this.ws?.on('message', (data: Buffer) => {
        const msg = JSON.parse(data.toString());
        if (msg.method) {
          handler(msg.method);
        }
      });

      // 超时
      setTimeout(resolve, this.config.timeout);
    });
  }

  /**
   * 获取所有 targets
   */
  private async getTargets(): Promise<Array<{
    targetId: string;
    title: string;
    url: string;
    attached: boolean;
  }>> {
    const result = await this.sendCommand('Target.getTargets');
    return (result as { targetInfos: Array<{
      targetId: string;
      title: string;
      url: string;
      attached: boolean;
    }> }).targetInfos.filter((t) => t.url.startsWith('http'));
  }

  /**
   * 切换到指定 target
   */
  private async attachToTarget(targetId: string): Promise<void> {
    await this.sendCommand('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
  }

  /**
   * 构建可访问性树 Markdown
   */
  private buildAccessibilityTreeMarkdown(
    nodes: Array<{ nodeId: string; name?: { value: string }; role?: { value: string } }>
  ): string {
    const lines: string[] = [];

    for (const node of nodes) {
      if (node.role?.value && node.name?.value) {
        lines.push(`- [${node.role.value}] ${node.name.value}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 延时
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
