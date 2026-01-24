/**
 * Agent Browser Executor
 * 封装 agent-browser CLI 命令，提供类型安全的 API
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type {
  AgentBrowserConfig,
  AgentBrowserResult,
  SnapshotResult,
  ScreenshotResult,
  AccessibilityElement,
  FindOptions,
  WaitOptions,
  FormField,
  TabInfo,
  ConsoleMessage,
  NetworkRequest,
  SessionInfo,
  DeviceEmulation,
  NetworkRoute,
  AgentBrowserPlan,
  AgentBrowserPlanStatus,
} from './types';

/**
 * Agent Browser Executor
 * 提供完整的浏览器自动化能力
 */
export class AgentBrowserExecutor extends EventEmitter {
  private config: Required<AgentBrowserConfig>;
  private isConnected: boolean = false;
  private currentUrl: string = '';
  private currentPlan: AgentBrowserPlan | null = null;
  private planStatus: AgentBrowserPlanStatus | null = null;
  private isPaused: boolean = false;
  private isCancelled: boolean = false;

  constructor(config: AgentBrowserConfig = {}) {
    super();
    this.config = {
      session: config.session || `hawkeye-${Date.now()}`,
      profile: config.profile || '',
      headless: config.headless ?? true,
      timeout: config.timeout || 30000,
      browserPath: config.browserPath || '',
    };
  }

  // ============ 核心命令执行 ============

  /**
   * 执行 agent-browser CLI 命令
   */
  private async execute(
    command: string,
    args: string[] = [],
    options: Record<string, unknown> = {}
  ): Promise<AgentBrowserResult<string>> {
    const startTime = Date.now();

    // 构建命令参数
    const cmdArgs: string[] = [];

    // 添加会话参数
    if (this.config.session) {
      cmdArgs.push('--session', this.config.session);
    }

    // 添加 profile 参数
    if (this.config.profile) {
      cmdArgs.push('--profile', this.config.profile);
    }

    // 添加 headless 参数
    if (this.config.headless) {
      cmdArgs.push('--headless');
    }

    // 添加主命令和参数
    cmdArgs.push(command, ...args);

    // 添加选项
    for (const [key, value] of Object.entries(options)) {
      if (value === true) {
        cmdArgs.push(`--${key}`);
      } else if (value !== false && value !== undefined && value !== null) {
        cmdArgs.push(`--${key}`, String(value));
      }
    }

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn('agent-browser', cmdArgs, {
        timeout: this.config.timeout,
        shell: true,
      });

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code === 0) {
          resolve({
            success: true,
            data: stdout.trim(),
            output: stdout.trim(),
            duration,
          });
        } else {
          resolve({
            success: false,
            error: stderr.trim() || `Command exited with code ${code}`,
            output: stdout.trim(),
            duration,
          });
        }
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          error: err.message,
          duration: Date.now() - startTime,
        });
      });
    });
  }

  // ============ 辅助方法 ============

  /**
   * 将 string 结果转换为 void 结果 (去除 data 字段)
   */
  private toVoidResult(result: AgentBrowserResult<string>): AgentBrowserResult<void> {
    return {
      success: result.success,
      output: result.output,
      error: result.error,
      duration: result.duration,
    };
  }

  // ============ 导航命令 ============

  /**
   * 打开 URL
   */
  async open(url: string): Promise<AgentBrowserResult<void>> {
    const result = await this.execute('open', [url]);
    if (result.success) {
      this.isConnected = true;
      this.currentUrl = url;
    }
    return this.toVoidResult(result);
  }

  /**
   * 导航到 URL (别名)
   */
  async goto(url: string): Promise<AgentBrowserResult<void>> {
    return this.open(url);
  }

  /**
   * 导航到 URL
   */
  async navigate(url: string): Promise<AgentBrowserResult<void>> {
    return this.open(url);
  }

  /**
   * 返回上一页
   */
  async back(): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('back'));
  }

  /**
   * 前进到下一页
   */
  async forward(): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('forward'));
  }

  /**
   * 刷新页面
   */
  async reload(): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('reload'));
  }

  // ============ 元素交互 ============

  /**
   * 点击元素
   * @param ref 元素引用 (如 @e1) 或 CSS 选择器
   */
  async click(ref: string): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('click', [ref]));
  }

  /**
   * 双击元素
   */
  async dblclick(ref: string): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('dblclick', [ref]));
  }

  /**
   * 右键点击
   */
  async rightClick(ref: string): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('click', [ref], { button: 'right' }));
  }

  /**
   * 填写输入框 (清空后输入)
   */
  async fill(ref: string, value: string): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('fill', [ref, value]));
  }

  /**
   * 输入文本 (追加输入)
   */
  async type(ref: string, text: string, options?: { slowly?: boolean }): Promise<AgentBrowserResult<void>> {
    const opts: Record<string, unknown> = {};
    if (options?.slowly) {
      opts.slowly = true;
    }
    return this.toVoidResult(await this.execute('type', [ref, text], opts));
  }

  /**
   * 选择下拉选项
   */
  async select(ref: string, value: string): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('select', [ref, value]));
  }

  /**
   * 勾选复选框
   */
  async check(ref: string): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('check', [ref]));
  }

  /**
   * 取消勾选
   */
  async uncheck(ref: string): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('uncheck', [ref]));
  }

  /**
   * 悬停在元素上
   */
  async hover(ref: string): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('hover', [ref]));
  }

  /**
   * 拖拽元素
   */
  async drag(fromRef: string, toRef: string): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('drag', [fromRef, toRef]));
  }

  /**
   * 按键
   */
  async pressKey(key: string): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('key', [key]));
  }

  // ============ 语义查找 ============

  /**
   * 语义查找元素
   */
  async find(options: FindOptions): Promise<AgentBrowserResult<AccessibilityElement[]>> {
    const args: string[] = [];
    const opts: Record<string, unknown> = {};

    if (options.role) {
      args.push('role', options.role);
    } else if (options.text) {
      args.push('text', options.text);
    } else if (options.label) {
      args.push('label', options.label);
    } else if (options.placeholder) {
      args.push('placeholder', options.placeholder);
    }

    if (options.name) {
      opts.name = options.name;
    }
    if (options.exact) {
      opts.exact = true;
    }

    const result = await this.execute('find', args, opts);
    if (result.success && result.data) {
      try {
        return {
          ...result,
          data: JSON.parse(result.data),
        };
      } catch {
        return {
          ...result,
          data: [],
        };
      }
    }
    return { ...result, data: [] };
  }

  /**
   * 查找并点击
   */
  async findAndClick(options: FindOptions): Promise<AgentBrowserResult<void>> {
    const args: string[] = [];

    if (options.role) {
      args.push('role', options.role, 'click');
    } else if (options.text) {
      args.push('text', options.text, 'click');
    } else if (options.label) {
      args.push('label', options.label, 'click');
    }

    const opts: Record<string, unknown> = {};
    if (options.name) {
      opts.name = options.name;
    }

    return this.toVoidResult(await this.execute('find', args, opts));
  }

  /**
   * 查找并填写
   */
  async findAndFill(options: FindOptions, value: string): Promise<AgentBrowserResult<void>> {
    const args: string[] = [];

    if (options.role) {
      args.push('role', options.role, 'fill', value);
    } else if (options.label) {
      args.push('label', options.label, 'fill', value);
    } else if (options.placeholder) {
      args.push('placeholder', options.placeholder, 'fill', value);
    }

    return this.toVoidResult(await this.execute('find', args));
  }

  // ============ 信息获取 ============

  /**
   * 获取页面 Accessibility Tree 快照
   */
  async snapshot(options?: { interactive?: boolean }): Promise<AgentBrowserResult<SnapshotResult>> {
    const opts: Record<string, unknown> = {};
    if (options?.interactive) {
      opts.i = true;
    }

    const result = await this.execute('snapshot', [], opts);
    if (result.success && result.data) {
      // 解析 snapshot 输出
      const snapshot = this.parseSnapshot(result.data);
      return {
        ...result,
        data: snapshot,
      };
    }
    return {
      ...result,
      data: {
        url: this.currentUrl,
        title: '',
        elements: [],
      },
    };
  }

  /**
   * 解析 snapshot 输出为结构化数据
   */
  private parseSnapshot(raw: string): SnapshotResult {
    const lines = raw.split('\n');
    const elements: AccessibilityElement[] = [];

    // 简单解析: 查找 @e1, @e2 等引用
    const refPattern = /@e(\d+)/g;
    let match;

    for (const line of lines) {
      while ((match = refPattern.exec(line)) !== null) {
        const ref = match[0];
        // 尝试提取元素信息
        const roleMatch = line.match(/(\w+)\s+@e\d+/);
        const nameMatch = line.match(/"([^"]+)"/);

        elements.push({
          ref,
          role: roleMatch?.[1] || 'unknown',
          name: nameMatch?.[1],
        });
      }
    }

    // 尝试从第一行获取 URL 和标题
    const urlMatch = raw.match(/URL:\s*(.+)/);
    const titleMatch = raw.match(/Title:\s*(.+)/);

    return {
      url: urlMatch?.[1] || this.currentUrl,
      title: titleMatch?.[1] || '',
      elements,
      raw,
    };
  }

  /**
   * 截图
   */
  async screenshot(filename?: string, options?: { fullPage?: boolean }): Promise<AgentBrowserResult<ScreenshotResult>> {
    const args: string[] = [];
    if (filename) {
      args.push(filename);
    }

    const opts: Record<string, unknown> = {};
    if (options?.fullPage) {
      opts.fullPage = true;
    }

    const result = await this.execute('screenshot', args, opts);
    return {
      ...result,
      data: {
        path: filename || 'screenshot.png',
      },
    };
  }

  /**
   * 获取页面文本内容
   */
  async getText(selector?: string): Promise<AgentBrowserResult<string>> {
    const args = selector ? ['text', selector] : ['text'];
    return this.execute('get', args);
  }

  /**
   * 获取元素属性
   */
  async getAttribute(selector: string, attribute: string): Promise<AgentBrowserResult<string>> {
    return this.execute('get', ['attr', selector, attribute]);
  }

  /**
   * 获取元素值
   */
  async getValue(selector: string): Promise<AgentBrowserResult<string>> {
    return this.execute('get', ['value', selector]);
  }

  /**
   * 获取页面 HTML
   */
  async getHtml(selector?: string): Promise<AgentBrowserResult<string>> {
    const args = selector ? ['html', selector] : ['html'];
    return this.execute('get', args);
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<AgentBrowserResult<string>> {
    return this.execute('get', ['title']);
  }

  /**
   * 获取当前 URL
   */
  async getUrl(): Promise<AgentBrowserResult<string>> {
    return this.execute('get', ['url']);
  }

  // ============ 等待 ============

  /**
   * 等待
   */
  async wait(options: WaitOptions): Promise<AgentBrowserResult<void>> {
    const opts: Record<string, unknown> = {};

    if (options.text) {
      opts.text = options.text;
    }
    if (options.textGone) {
      opts.textGone = options.textGone;
    }
    if (options.url) {
      opts.url = options.url;
    }
    if (options.time) {
      opts.time = options.time;
    }
    if (options.timeout) {
      opts.timeout = options.timeout;
    }

    return this.toVoidResult(await this.execute('wait', [], opts));
  }

  /**
   * 等待文本出现
   */
  async waitForText(text: string, timeout?: number): Promise<AgentBrowserResult<void>> {
    return this.wait({ text, timeout });
  }

  /**
   * 等待 URL 变化
   */
  async waitForUrl(urlPattern: string, timeout?: number): Promise<AgentBrowserResult<void>> {
    return this.wait({ url: urlPattern, timeout });
  }

  /**
   * 等待固定时间
   */
  async waitFor(seconds: number): Promise<AgentBrowserResult<void>> {
    return this.wait({ time: seconds });
  }

  // ============ 表单操作 ============

  /**
   * 批量填写表单
   */
  async fillForm(fields: FormField[]): Promise<AgentBrowserResult<void>> {
    for (const field of fields) {
      let result: AgentBrowserResult<void>;

      switch (field.type) {
        case 'textbox':
          result = await this.fill(field.ref, field.value);
          break;
        case 'checkbox':
          result = field.value === 'true'
            ? await this.check(field.ref)
            : await this.uncheck(field.ref);
          break;
        case 'combobox':
          result = await this.select(field.ref, field.value);
          break;
        default:
          result = await this.fill(field.ref, field.value);
      }

      if (!result.success) {
        return result;
      }
    }

    return { success: true, duration: 0 };
  }

  // ============ 标签页管理 ============

  /**
   * 列出所有标签页
   */
  async listTabs(): Promise<AgentBrowserResult<TabInfo[]>> {
    const result = await this.execute('tab', ['list']);
    if (result.success && result.data) {
      try {
        return {
          ...result,
          data: JSON.parse(result.data),
        };
      } catch {
        return { ...result, data: [] };
      }
    }
    return { ...result, data: [] };
  }

  /**
   * 新建标签页
   */
  async newTab(url?: string): Promise<AgentBrowserResult<void>> {
    const args = url ? ['new', url] : ['new'];
    return this.toVoidResult(await this.execute('tab', args));
  }

  /**
   * 关闭当前标签页
   */
  async closeTab(index?: number): Promise<AgentBrowserResult<void>> {
    const args = index !== undefined ? ['close', String(index)] : ['close'];
    return this.toVoidResult(await this.execute('tab', args));
  }

  /**
   * 切换到指定标签页
   */
  async switchTab(index: number): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('tab', ['select', String(index)]));
  }

  // ============ JavaScript 执行 ============

  /**
   * 执行 JavaScript
   */
  async evaluate(script: string): Promise<AgentBrowserResult<unknown>> {
    const result = await this.execute('eval', [script]);
    if (result.success && result.data) {
      try {
        return {
          ...result,
          data: JSON.parse(result.data),
        };
      } catch {
        return result;
      }
    }
    return result;
  }

  // ============ 控制台和网络 ============

  /**
   * 获取控制台消息
   */
  async getConsoleMessages(): Promise<AgentBrowserResult<ConsoleMessage[]>> {
    const result = await this.execute('console');
    if (result.success && result.data) {
      try {
        return {
          ...result,
          data: JSON.parse(result.data),
        };
      } catch {
        return { ...result, data: [] };
      }
    }
    return { ...result, data: [] };
  }

  /**
   * 获取控制台错误
   */
  async getErrors(): Promise<AgentBrowserResult<string[]>> {
    const result = await this.execute('errors');
    if (result.success && result.data) {
      return {
        ...result,
        data: result.data.split('\n').filter(Boolean),
      };
    }
    return { ...result, data: [] };
  }

  /**
   * 设置网络路由规则
   */
  async setNetworkRoute(route: NetworkRoute): Promise<AgentBrowserResult<void>> {
    const args = ['route', route.pattern];
    const opts: Record<string, unknown> = {};

    if (route.status) {
      opts.status = route.status;
    }
    if (route.body) {
      opts.body = route.body;
    }
    if (route.abort) {
      opts.abort = true;
    }

    return this.toVoidResult(await this.execute('network', args, opts));
  }

  // ============ 设备模拟 ============

  /**
   * 设置视口大小
   */
  async setViewport(width: number, height: number): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('set', ['viewport', String(width), String(height)]));
  }

  /**
   * 模拟设备
   */
  async setDevice(device: string): Promise<AgentBrowserResult<void>> {
    return this.toVoidResult(await this.execute('set', ['device', device]));
  }

  // ============ 会话管理 ============

  /**
   * 列出会话
   */
  async listSessions(): Promise<AgentBrowserResult<SessionInfo[]>> {
    const result = await this.execute('session', ['list']);
    if (result.success && result.data) {
      try {
        return {
          ...result,
          data: JSON.parse(result.data),
        };
      } catch {
        return { ...result, data: [] };
      }
    }
    return { ...result, data: [] };
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<AgentBrowserResult<void>> {
    const result = await this.execute('close');
    this.isConnected = false;
    this.currentUrl = '';
    return this.toVoidResult(result);
  }

  // ============ 计划执行 ============

  /**
   * 执行浏览器操作计划
   */
  async executePlan(plan: AgentBrowserPlan): Promise<AgentBrowserPlanStatus> {
    this.currentPlan = plan;
    this.isPaused = false;
    this.isCancelled = false;

    this.planStatus = {
      planId: plan.id,
      status: 'running',
      currentStepIndex: 0,
      totalSteps: plan.steps.length,
      stepResults: [],
      startedAt: Date.now(),
    };

    this.emit('plan:started', this.planStatus);

    // 使用计划配置覆盖默认配置
    if (plan.session) {
      this.config.session = plan.session;
    }
    if (plan.profile) {
      this.config.profile = plan.profile;
    }

    // 如果有起始 URL，先导航
    if (plan.startUrl) {
      const navResult = await this.open(plan.startUrl);
      if (!navResult.success) {
        this.planStatus.status = 'failed';
        this.planStatus.error = `Failed to navigate to start URL: ${navResult.error}`;
        this.planStatus.completedAt = Date.now();
        this.emit('plan:failed', this.planStatus);
        return this.planStatus;
      }
    }

    // 执行步骤
    for (let i = 0; i < plan.steps.length; i++) {
      if (this.isCancelled) {
        this.planStatus.status = 'cancelled';
        this.planStatus.completedAt = Date.now();
        this.emit('plan:cancelled', this.planStatus);
        return this.planStatus;
      }

      while (this.isPaused) {
        await this.sleep(100);
        if (this.isCancelled) {
          this.planStatus.status = 'cancelled';
          this.planStatus.completedAt = Date.now();
          this.emit('plan:cancelled', this.planStatus);
          return this.planStatus;
        }
      }

      const step = plan.steps[i];
      this.planStatus.currentStepIndex = i;
      this.emit('step:started', { step, index: i });

      // 执行前等待
      if (step.delay) {
        await this.sleep(step.delay);
      }

      const stepResult = await this.executeStep(step);
      this.planStatus.stepResults.push({
        stepId: step.id,
        success: stepResult.success,
        duration: stepResult.duration,
        error: stepResult.error,
      });

      this.emit('step:completed', { step, index: i, result: stepResult });

      if (!stepResult.success) {
        const onFailure = step.onFailure || 'stop';
        if (onFailure === 'stop') {
          this.planStatus.status = 'failed';
          this.planStatus.error = `Step ${i + 1} failed: ${stepResult.error}`;
          this.planStatus.completedAt = Date.now();
          this.emit('plan:failed', this.planStatus);
          return this.planStatus;
        }
        // continue: 继续执行下一步
      }
    }

    this.planStatus.status = 'completed';
    this.planStatus.completedAt = Date.now();
    this.emit('plan:completed', this.planStatus);
    return this.planStatus;
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(step: { action: { command: string; args?: string[]; options?: Record<string, unknown> }; retryCount?: number }): Promise<AgentBrowserResult<string>> {
    const maxRetries = step.retryCount || 0;
    let lastResult: AgentBrowserResult<string>;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      lastResult = await this.execute(
        step.action.command,
        step.action.args || [],
        step.action.options || {}
      );

      if (lastResult.success) {
        return lastResult;
      }

      if (attempt < maxRetries) {
        await this.sleep(1000);
      }
    }

    return lastResult!;
  }

  /**
   * 暂停计划执行
   */
  pause(): void {
    if (this.planStatus?.status === 'running') {
      this.isPaused = true;
      this.planStatus.status = 'paused';
      this.emit('plan:paused', this.planStatus);
    }
  }

  /**
   * 恢复计划执行
   */
  resume(): void {
    if (this.planStatus?.status === 'paused') {
      this.isPaused = false;
      this.planStatus.status = 'running';
      this.emit('plan:resumed', this.planStatus);
    }
  }

  /**
   * 取消计划执行
   */
  cancel(): void {
    this.isCancelled = true;
    this.isPaused = false;
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    isConnected: boolean;
    currentUrl: string;
    session: string;
    profile: string;
    planStatus: AgentBrowserPlanStatus | null;
  } {
    return {
      isConnected: this.isConnected,
      currentUrl: this.currentUrl,
      session: this.config.session,
      profile: this.config.profile,
      planStatus: this.planStatus,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AgentBrowserConfig>): void {
    Object.assign(this.config, config);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 创建 Agent Browser Executor 实例
 */
export function createAgentBrowserExecutor(config?: AgentBrowserConfig): AgentBrowserExecutor {
  return new AgentBrowserExecutor(config);
}
