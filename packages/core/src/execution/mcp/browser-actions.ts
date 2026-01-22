/**
 * Browser Actions Abstraction Layer
 * 提供高级浏览器操作 API，对接 A2UI 系统
 */

import { ChromeDevToolsMCP } from './chrome-devtools';
import type {
  MCPConfig,
  MCPResult,
  BrowserAction,
  BrowserActionType,
  BrowserExecutionPlan,
  BrowserPlanExecutionStatus,
  StepExecutionResult,
  SnapshotResult,
  ScreenshotResult,
  ConsoleMessage,
  NetworkRequest,
  TabInfo,
} from './types';

/**
 * 浏览器动作执行器配置
 */
export interface BrowserActionsConfig extends MCPConfig {
  /** 是否自动连接 */
  autoConnect?: boolean;
  /** 执行前回调 */
  onBeforeAction?: (action: BrowserAction) => void;
  /** 执行后回调 */
  onAfterAction?: (action: BrowserAction, result: MCPResult) => void;
  /** 进度回调 */
  onProgress?: (status: BrowserPlanExecutionStatus) => void;
}

/**
 * 浏览器动作执行器
 * 高级 API 封装，支持计划执行、暂停/恢复等功能
 */
export class BrowserActionsExecutor {
  private mcp: ChromeDevToolsMCP;
  private config: BrowserActionsConfig;
  private currentPlan: BrowserExecutionPlan | null = null;
  private currentStatus: BrowserPlanExecutionStatus | null = null;
  private isPaused = false;
  private isCancelled = false;

  constructor(config: BrowserActionsConfig = {}) {
    this.config = {
      autoConnect: true,
      ...config,
    };
    this.mcp = new ChromeDevToolsMCP(config);

    // 转发事件
    this.mcp.on('status', (status) => this.onStatusChange(status));
    this.mcp.on('error', (error) => this.onError(error));
    this.mcp.on('console', (message) => this.onConsoleMessage(message));
    this.mcp.on('dialog', (dialog) => this.onDialog(dialog));
  }

  /**
   * 初始化连接
   */
  async initialize(): Promise<MCPResult<void>> {
    if (this.config.autoConnect) {
      return this.mcp.connect();
    }
    return { success: true, duration: 0 };
  }

  /**
   * 连接到浏览器
   */
  async connect(): Promise<MCPResult<void>> {
    return this.mcp.connect();
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    return this.mcp.disconnect();
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus() {
    return this.mcp.getStatus();
  }

  // ============ 单个动作执行 ============

  /**
   * 执行单个浏览器动作
   */
  async execute<T extends BrowserActionType>(
    action: BrowserAction<T>
  ): Promise<MCPResult> {
    this.config.onBeforeAction?.(action);
    const result = await this.mcp.executeAction(action);
    this.config.onAfterAction?.(action, result);
    return result;
  }

  /**
   * 导航到 URL
   */
  async navigate(url: string, waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<MCPResult> {
    return this.execute({
      type: 'navigate',
      params: { url, waitUntil },
    });
  }

  /**
   * 点击元素
   */
  async click(element: string, ref?: string): Promise<MCPResult> {
    return this.execute({
      type: 'click',
      params: { element, ref },
    });
  }

  /**
   * 输入文本
   */
  async type(element: string, text: string, options?: { ref?: string; slowly?: boolean; submit?: boolean }): Promise<MCPResult> {
    return this.execute({
      type: 'type',
      params: { element, text, ...options },
    });
  }

  /**
   * 填写表单
   */
  async fillForm(fields: Array<{
    name: string;
    type: 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider';
    ref: string;
    value: string;
  }>): Promise<MCPResult> {
    return this.execute({
      type: 'fill_form',
      params: { fields },
    });
  }

  /**
   * 截图
   */
  async screenshot(options?: {
    filename?: string;
    fullPage?: boolean;
    type?: 'png' | 'jpeg';
  }): Promise<MCPResult<ScreenshotResult>> {
    return this.execute({
      type: 'screenshot',
      params: options || {},
    }) as Promise<MCPResult<ScreenshotResult>>;
  }

  /**
   * 获取页面快照
   */
  async snapshot(): Promise<MCPResult<SnapshotResult>> {
    return this.execute({
      type: 'snapshot',
      params: {},
    }) as Promise<MCPResult<SnapshotResult>>;
  }

  /**
   * 悬停元素
   */
  async hover(element: string, ref: string): Promise<MCPResult> {
    return this.execute({
      type: 'hover',
      params: { element, ref },
    });
  }

  /**
   * 下拉选择
   */
  async select(element: string, ref: string, values: string[]): Promise<MCPResult> {
    return this.execute({
      type: 'select',
      params: { element, ref, values },
    });
  }

  /**
   * 按键
   */
  async pressKey(key: string): Promise<MCPResult> {
    return this.execute({
      type: 'press_key',
      params: { key },
    });
  }

  /**
   * 等待
   */
  async wait(options: { text?: string; textGone?: string; time?: number }): Promise<MCPResult> {
    return this.execute({
      type: 'wait',
      params: options,
    });
  }

  /**
   * 等待文本出现
   */
  async waitForText(text: string): Promise<MCPResult> {
    return this.wait({ text });
  }

  /**
   * 等待时间
   */
  async waitFor(seconds: number): Promise<MCPResult> {
    return this.wait({ time: seconds });
  }

  /**
   * 执行 JavaScript
   */
  async evaluate(fn: string): Promise<MCPResult> {
    return this.execute({
      type: 'evaluate',
      params: { function: fn },
    });
  }

  /**
   * 返回上一页
   */
  async back(): Promise<MCPResult> {
    return this.execute({
      type: 'navigate_back',
      params: {},
    });
  }

  /**
   * 关闭页面
   */
  async close(): Promise<MCPResult> {
    return this.execute({
      type: 'close',
      params: {},
    });
  }

  /**
   * 获取控制台消息
   */
  async getConsoleMessages(level?: 'error' | 'warning' | 'info' | 'debug'): Promise<MCPResult<ConsoleMessage[]>> {
    return this.execute({
      type: 'console_messages',
      params: { level },
    }) as Promise<MCPResult<ConsoleMessage[]>>;
  }

  /**
   * 获取网络请求
   */
  async getNetworkRequests(includeStatic = false): Promise<MCPResult<NetworkRequest[]>> {
    return this.execute({
      type: 'network_requests',
      params: { includeStatic },
    }) as Promise<MCPResult<NetworkRequest[]>>;
  }

  /**
   * 获取标签页列表
   */
  async getTabs(): Promise<MCPResult<TabInfo[]>> {
    return this.execute({
      type: 'tabs',
      params: { action: 'list' },
    }) as Promise<MCPResult<TabInfo[]>>;
  }

  /**
   * 新建标签页
   */
  async newTab(): Promise<MCPResult> {
    return this.execute({
      type: 'tabs',
      params: { action: 'new' },
    });
  }

  /**
   * 切换标签页
   */
  async switchTab(index: number): Promise<MCPResult> {
    return this.execute({
      type: 'tabs',
      params: { action: 'select', index },
    });
  }

  // ============ 计划执行 ============

  /**
   * 执行浏览器操作计划
   */
  async executePlan(plan: BrowserExecutionPlan): Promise<BrowserPlanExecutionStatus> {
    this.currentPlan = plan;
    this.isPaused = false;
    this.isCancelled = false;

    this.currentStatus = {
      planId: plan.id,
      status: 'running',
      currentStepIndex: 0,
      totalSteps: plan.steps.length,
      stepResults: [],
      startedAt: Date.now(),
    };

    this.notifyProgress();

    // 如果有起始 URL，先导航
    if (plan.startUrl) {
      const navResult = await this.navigate(plan.startUrl);
      if (!navResult.success) {
        this.currentStatus.status = 'failed';
        this.currentStatus.error = `Failed to navigate to start URL: ${navResult.error}`;
        this.currentStatus.completedAt = Date.now();
        this.notifyProgress();
        return this.currentStatus;
      }
    }

    // 执行各步骤
    for (let i = 0; i < plan.steps.length; i++) {
      // 检查是否取消
      if (this.isCancelled) {
        this.currentStatus.status = 'cancelled';
        this.currentStatus.completedAt = Date.now();
        this.notifyProgress();
        return this.currentStatus;
      }

      // 检查是否暂停
      while (this.isPaused) {
        await this.sleep(100);
        if (this.isCancelled) {
          this.currentStatus.status = 'cancelled';
          this.currentStatus.completedAt = Date.now();
          this.notifyProgress();
          return this.currentStatus;
        }
      }

      const step = plan.steps[i];
      this.currentStatus.currentStepIndex = i;
      this.notifyProgress();

      const stepResult = await this.executeStep(step);
      this.currentStatus.stepResults.push(stepResult);

      if (!stepResult.success) {
        const onFailure = step.onFailure || 'stop';
        if (onFailure === 'stop') {
          this.currentStatus.status = 'failed';
          this.currentStatus.error = `Step ${i + 1} failed: ${stepResult.result?.error}`;
          this.currentStatus.completedAt = Date.now();
          this.notifyProgress();
          return this.currentStatus;
        }
        // continue: 继续执行下一步
      }

      this.notifyProgress();
    }

    this.currentStatus.status = 'completed';
    this.currentStatus.completedAt = Date.now();
    this.notifyProgress();

    return this.currentStatus;
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(step: {
    id: string;
    action: BrowserAction;
    retryCount?: number;
  }): Promise<StepExecutionResult> {
    const maxRetries = step.retryCount || 0;
    let lastResult: MCPResult | null = null;
    let retries = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      lastResult = await this.execute(step.action);

      if (lastResult.success) {
        return {
          stepId: step.id,
          success: true,
          result: lastResult,
          duration: Date.now() - startTime,
          retries,
        };
      }

      retries = attempt;
      await this.sleep(1000); // 重试前等待
    }

    return {
      stepId: step.id,
      success: false,
      result: lastResult!,
      duration: lastResult!.duration,
      retries,
    };
  }

  /**
   * 暂停执行
   */
  pause(): void {
    if (this.currentStatus?.status === 'running') {
      this.isPaused = true;
      this.currentStatus.status = 'paused';
      this.notifyProgress();
    }
  }

  /**
   * 恢复执行
   */
  resume(): void {
    if (this.currentStatus?.status === 'paused') {
      this.isPaused = false;
      this.currentStatus.status = 'running';
      this.notifyProgress();
    }
  }

  /**
   * 取消执行
   */
  cancel(): void {
    this.isCancelled = true;
    this.isPaused = false;
  }

  /**
   * 获取当前执行状态
   */
  getCurrentStatus(): BrowserPlanExecutionStatus | null {
    return this.currentStatus;
  }

  /**
   * 获取当前计划
   */
  getCurrentPlan(): BrowserExecutionPlan | null {
    return this.currentPlan;
  }

  // ============ 便捷方法 ============

  /**
   * 快速填写登录表单
   */
  async login(
    usernameSelector: string,
    passwordSelector: string,
    submitSelector: string,
    username: string,
    password: string
  ): Promise<MCPResult> {
    // 输入用户名
    let result = await this.type(usernameSelector, username);
    if (!result.success) return result;

    // 输入密码
    result = await this.type(passwordSelector, password);
    if (!result.success) return result;

    // 点击提交
    return this.click(submitSelector);
  }

  /**
   * 滚动页面
   */
  async scroll(direction: 'up' | 'down' | 'top' | 'bottom', amount?: number): Promise<MCPResult> {
    const scrollScript = {
      up: `window.scrollBy(0, -${amount || 300})`,
      down: `window.scrollBy(0, ${amount || 300})`,
      top: 'window.scrollTo(0, 0)',
      bottom: 'window.scrollTo(0, document.body.scrollHeight)',
    };

    return this.evaluate(scrollScript[direction]);
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<MCPResult<string>> {
    const result = await this.evaluate('document.title');
    return {
      ...result,
      data: result.data as string,
    };
  }

  /**
   * 获取当前 URL
   */
  async getUrl(): Promise<MCPResult<string>> {
    const result = await this.evaluate('location.href');
    return {
      ...result,
      data: result.data as string,
    };
  }

  /**
   * 检查元素是否存在
   */
  async elementExists(selector: string): Promise<MCPResult<boolean>> {
    const result = await this.evaluate(`!!document.querySelector('${selector}')`);
    return {
      ...result,
      data: result.data as boolean,
    };
  }

  /**
   * 获取元素文本
   */
  async getText(selector: string): Promise<MCPResult<string>> {
    const result = await this.evaluate(
      `document.querySelector('${selector}')?.textContent || ''`
    );
    return {
      ...result,
      data: result.data as string,
    };
  }

  /**
   * 获取元素属性
   */
  async getAttribute(selector: string, attribute: string): Promise<MCPResult<string | null>> {
    const result = await this.evaluate(
      `document.querySelector('${selector}')?.getAttribute('${attribute}')`
    );
    return {
      ...result,
      data: result.data as string | null,
    };
  }

  // ============ 事件处理 ============

  private onStatusChange(status: string): void {
    // 可以扩展处理
  }

  private onError(error: Error): void {
    console.error('Browser action error:', error);
  }

  private onConsoleMessage(message: unknown): void {
    // 可以扩展处理
  }

  private onDialog(dialog: unknown): void {
    // 可以扩展处理
  }

  private notifyProgress(): void {
    if (this.currentStatus && this.config.onProgress) {
      this.config.onProgress(this.currentStatus);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 创建浏览器动作执行器实例
 */
export function createBrowserActionsExecutor(
  config?: BrowserActionsConfig
): BrowserActionsExecutor {
  return new BrowserActionsExecutor(config);
}
