/**
 * Browser Perception Module
 * 使用 agent-browser 的 accessibility tree 增强浏览器感知能力
 */

import { EventEmitter } from 'events';
import {
  AgentBrowserExecutor,
  createAgentBrowserExecutor,
  type AgentBrowserConfig,
  type SnapshotResult as AgentBrowserSnapshot,
  type AccessibilityElement,
} from '../execution/agent-browser';

/**
 * 浏览器感知配置
 */
export interface BrowserPerceptionConfig extends AgentBrowserConfig {
  /** 是否自动启动 */
  autoStart?: boolean;
  /** 感知间隔 (ms) */
  interval?: number;
  /** 是否只获取可交互元素 */
  interactiveOnly?: boolean;
  /** 可交互角色列表 */
  interactiveRoles?: string[];
}

/**
 * 浏览器上下文
 */
export interface BrowserContext {
  /** 页面 URL */
  url: string;
  /** 页面标题 */
  title: string;
  /** 可交互元素列表 */
  elements: SimplifiedElement[];
  /** 原始快照 */
  rawSnapshot?: string;
  /** 感知时间戳 */
  timestamp: number;
  /** 是否有表单 */
  hasForm: boolean;
  /** 是否有输入框 */
  hasInput: boolean;
  /** 是否有按钮 */
  hasButton: boolean;
  /** 是否有链接 */
  hasLink: boolean;
}

/**
 * 简化的元素表示 (为 AI 优化)
 */
export interface SimplifiedElement {
  /** 元素引用 (如 @e1, @e2) */
  ref: string;
  /** 角色 */
  role: string;
  /** 名称/标签 */
  name?: string;
  /** 当前值 */
  value?: string;
  /** 是否可点击 */
  clickable: boolean;
  /** 是否可输入 */
  editable: boolean;
  /** 描述文本 */
  description?: string;
}

/**
 * 默认可交互角色
 */
const DEFAULT_INTERACTIVE_ROLES = [
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem',
];

/**
 * 可点击角色
 */
const CLICKABLE_ROLES = [
  'button',
  'link',
  'checkbox',
  'radio',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'switch',
  'tab',
  'treeitem',
];

/**
 * 可编辑角色
 */
const EDITABLE_ROLES = [
  'textbox',
  'searchbox',
  'combobox',
  'spinbutton',
];

/**
 * Browser Perception
 * 提供基于 accessibility tree 的浏览器感知能力
 */
export class BrowserPerception extends EventEmitter {
  private executor: AgentBrowserExecutor;
  private config: Required<BrowserPerceptionConfig>;
  private isRunning: boolean = false;
  private lastContext: BrowserContext | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(config: BrowserPerceptionConfig = {}) {
    super();
    this.config = {
      session: config.session || `hawkeye-perception-${Date.now()}`,
      profile: config.profile || '',
      headless: config.headless ?? true,
      timeout: config.timeout || 30000,
      browserPath: config.browserPath || '',
      autoStart: config.autoStart ?? false,
      interval: config.interval || 5000,
      interactiveOnly: config.interactiveOnly ?? true,
      interactiveRoles: config.interactiveRoles || DEFAULT_INTERACTIVE_ROLES,
    };

    this.executor = createAgentBrowserExecutor({
      session: this.config.session,
      profile: this.config.profile,
      headless: this.config.headless,
      timeout: this.config.timeout,
      browserPath: this.config.browserPath,
    });

    // 转发 executor 事件
    this.executor.on('plan:started', (status) => this.emit('plan:started', status));
    this.executor.on('plan:completed', (status) => this.emit('plan:completed', status));
    this.executor.on('plan:failed', (status) => this.emit('plan:failed', status));
    this.executor.on('step:started', (data) => this.emit('step:started', data));
    this.executor.on('step:completed', (data) => this.emit('step:completed', data));
  }

  /**
   * 启动浏览器感知
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.emit('started');

    // 开始定时感知
    if (this.config.interval > 0) {
      this.pollTimer = setInterval(async () => {
        try {
          await this.perceive();
        } catch (err) {
          this.emit('error', err);
        }
      }, this.config.interval);
    }
  }

  /**
   * 停止浏览器感知
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    await this.executor.close();
    this.emit('stopped');
  }

  /**
   * 打开页面并感知
   */
  async open(url: string): Promise<BrowserContext> {
    const result = await this.executor.open(url);
    if (!result.success) {
      throw new Error(`Failed to open URL: ${result.error}`);
    }

    return this.perceive();
  }

  /**
   * 执行感知 - 获取当前页面状态
   */
  async perceive(): Promise<BrowserContext> {
    const startTime = Date.now();

    // 获取 accessibility snapshot
    const snapshotResult = await this.executor.snapshot({ interactive: true });

    if (!snapshotResult.success || !snapshotResult.data) {
      throw new Error(`Failed to get snapshot: ${snapshotResult.error}`);
    }

    const snapshot = snapshotResult.data;

    // 转换为简化元素
    let elements = this.simplifyElements(snapshot.elements);

    // 过滤可交互元素
    if (this.config.interactiveOnly) {
      elements = elements.filter(el =>
        this.config.interactiveRoles.includes(el.role.toLowerCase())
      );
    }

    const context: BrowserContext = {
      url: snapshot.url,
      title: snapshot.title,
      elements,
      rawSnapshot: snapshot.raw,
      timestamp: Date.now(),
      hasForm: elements.some(el => el.role === 'form'),
      hasInput: elements.some(el => EDITABLE_ROLES.includes(el.role)),
      hasButton: elements.some(el => el.role === 'button'),
      hasLink: elements.some(el => el.role === 'link'),
    };

    this.lastContext = context;
    this.emit('context', context);

    console.log(`[BrowserPerception] 感知完成: ${elements.length} 个元素, 耗时 ${Date.now() - startTime}ms`);

    return context;
  }

  /**
   * 简化元素列表
   */
  private simplifyElements(elements: AccessibilityElement[]): SimplifiedElement[] {
    const result: SimplifiedElement[] = [];

    const processElement = (el: AccessibilityElement) => {
      const simplified: SimplifiedElement = {
        ref: el.ref,
        role: el.role,
        name: el.name,
        value: el.value,
        clickable: CLICKABLE_ROLES.includes(el.role.toLowerCase()),
        editable: EDITABLE_ROLES.includes(el.role.toLowerCase()),
        description: el.description,
      };

      result.push(simplified);

      // 处理子元素
      if (el.children) {
        for (const child of el.children) {
          processElement(child);
        }
      }
    };

    for (const el of elements) {
      processElement(el);
    }

    return result;
  }

  /**
   * 生成 AI 友好的上下文描述
   */
  generateContextForAI(context?: BrowserContext): string {
    const ctx = context || this.lastContext;
    if (!ctx) {
      return '无浏览器上下文';
    }

    const lines: string[] = [
      `页面: ${ctx.title}`,
      `URL: ${ctx.url}`,
      '',
      '可交互元素:',
    ];

    // 按类型分组
    const buttons = ctx.elements.filter(el => el.role === 'button');
    const links = ctx.elements.filter(el => el.role === 'link');
    const inputs = ctx.elements.filter(el => el.editable);
    const others = ctx.elements.filter(el =>
      !el.clickable && !el.editable && el.role !== 'button' && el.role !== 'link'
    );

    if (buttons.length > 0) {
      lines.push('', '按钮:');
      for (const btn of buttons.slice(0, 10)) {
        lines.push(`  ${btn.ref}: ${btn.name || '(无名称)'}`);
      }
      if (buttons.length > 10) {
        lines.push(`  ... 还有 ${buttons.length - 10} 个按钮`);
      }
    }

    if (links.length > 0) {
      lines.push('', '链接:');
      for (const link of links.slice(0, 10)) {
        lines.push(`  ${link.ref}: ${link.name || '(无名称)'}`);
      }
      if (links.length > 10) {
        lines.push(`  ... 还有 ${links.length - 10} 个链接`);
      }
    }

    if (inputs.length > 0) {
      lines.push('', '输入框:');
      for (const input of inputs.slice(0, 10)) {
        const value = input.value ? ` [当前值: ${input.value}]` : '';
        lines.push(`  ${input.ref}: ${input.name || input.role}${value}`);
      }
      if (inputs.length > 10) {
        lines.push(`  ... 还有 ${inputs.length - 10} 个输入框`);
      }
    }

    if (others.length > 0) {
      lines.push('', '其他元素:');
      for (const el of others.slice(0, 5)) {
        lines.push(`  ${el.ref}: ${el.role} - ${el.name || '(无名称)'}`);
      }
      if (others.length > 5) {
        lines.push(`  ... 还有 ${others.length - 5} 个其他元素`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 查找元素
   */
  async findElement(options: { role?: string; text?: string; label?: string }): Promise<SimplifiedElement | null> {
    const result = await this.executor.find(options);
    if (result.success && result.data && result.data.length > 0) {
      const el = result.data[0];
      return {
        ref: el.ref,
        role: el.role,
        name: el.name,
        value: el.value,
        clickable: CLICKABLE_ROLES.includes(el.role.toLowerCase()),
        editable: EDITABLE_ROLES.includes(el.role.toLowerCase()),
        description: el.description,
      };
    }
    return null;
  }

  /**
   * 点击元素
   */
  async click(ref: string): Promise<boolean> {
    const result = await this.executor.click(ref);
    if (result.success) {
      // 点击后重新感知
      await this.perceive();
    }
    return result.success;
  }

  /**
   * 填写输入框
   */
  async fill(ref: string, value: string): Promise<boolean> {
    const result = await this.executor.fill(ref, value);
    if (result.success) {
      await this.perceive();
    }
    return result.success;
  }

  /**
   * 语义查找并点击
   */
  async findAndClick(options: { role?: string; text?: string; label?: string }): Promise<boolean> {
    const result = await this.executor.findAndClick(options);
    if (result.success) {
      await this.perceive();
    }
    return result.success;
  }

  /**
   * 语义查找并填写
   */
  async findAndFill(options: { role?: string; text?: string; label?: string }, value: string): Promise<boolean> {
    const result = await this.executor.findAndFill(options, value);
    if (result.success) {
      await this.perceive();
    }
    return result.success;
  }

  /**
   * 等待文本出现
   */
  async waitForText(text: string, timeout?: number): Promise<boolean> {
    const result = await this.executor.waitForText(text, timeout);
    if (result.success) {
      await this.perceive();
    }
    return result.success;
  }

  /**
   * 截图
   */
  async screenshot(filename?: string): Promise<string | null> {
    const result = await this.executor.screenshot(filename);
    if (result.success && result.data) {
      return result.data.path;
    }
    return null;
  }

  /**
   * 获取最后的上下文
   */
  getLastContext(): BrowserContext | null {
    return this.lastContext;
  }

  /**
   * 获取 executor (用于高级操作)
   */
  getExecutor(): AgentBrowserExecutor {
    return this.executor;
  }

  /**
   * 获取状态
   */
  getStatus(): {
    isRunning: boolean;
    hasContext: boolean;
    currentUrl: string | undefined;
    elementCount: number;
  } {
    return {
      isRunning: this.isRunning,
      hasContext: this.lastContext !== null,
      currentUrl: this.lastContext?.url,
      elementCount: this.lastContext?.elements.length || 0,
    };
  }
}

/**
 * 创建 BrowserPerception 实例
 */
export function createBrowserPerception(config?: BrowserPerceptionConfig): BrowserPerception {
  return new BrowserPerception(config);
}

// 全局实例
let globalBrowserPerception: BrowserPerception | null = null;

/**
 * 获取全局 BrowserPerception 实例
 */
export function getBrowserPerception(): BrowserPerception | null {
  return globalBrowserPerception;
}

/**
 * 设置全局 BrowserPerception 实例
 */
export function setBrowserPerception(instance: BrowserPerception): void {
  globalBrowserPerception = instance;
}
