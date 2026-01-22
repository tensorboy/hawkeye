/**
 * NutJS Executor - NutJS 图形界面执行器
 *
 * 使用 NutJS (@nut-tree/nut-js) 执行真实的 GUI 操作
 * 支持跨平台: Windows, macOS, Linux
 *
 * 参考: UFO, Agent-S 等项目的 GUI 执行方案
 */

import { EventEmitter } from 'events';
import type {
  GUIAction,
  ActionResult,
  ActionSequence,
  SequenceResult,
  Point,
  ClickAction,
  DoubleClickAction,
  RightClickAction,
  DragAction,
  MoveAction,
  ScrollAction,
  TypeAction,
  HotkeyAction,
  KeyPressAction,
  WaitAction,
  ScreenshotAction,
  HoverAction,
  ModifierKey,
} from './action-types';

// NutJS 类型 (动态导入时使用)
// 使用宽松类型以适应不同版本的 NutJS API
interface NutJSMouse {
  move: (point: { x: number; y: number }) => Promise<void>;
  leftClick: () => Promise<void>;
  rightClick: () => Promise<void>;
  doubleClick: () => Promise<void>;
  drag: (from: { x: number; y: number }, to: { x: number; y: number }) => Promise<void>;
  scrollUp: (amount: number) => Promise<void>;
  scrollDown: (amount: number) => Promise<void>;
  scrollLeft: (amount: number) => Promise<void>;
  scrollRight: (amount: number) => Promise<void>;
  getPosition: () => Promise<{ x: number; y: number }>;
  setPosition: (point: { x: number; y: number }) => Promise<void>;
  config: {
    mouseSpeed: number;
    autoDelayMs: number;
  };
}

interface NutJSKeyboard {
  type: (text: string) => Promise<void>;
  pressKey: (...keys: number[]) => Promise<void>;
  releaseKey: (...keys: number[]) => Promise<void>;
  config: {
    autoDelayMs: number;
  };
}

interface NutJSScreen {
  width: () => Promise<number>;
  height: () => Promise<number>;
  capture: (
    region?: { left: number; top: number; width: number; height: number }
  ) => Promise<{ data: Buffer; width: number; height: number }>;
}

type NutJSKey = Record<string, number>;

/**
 * NutJS 执行器配置
 */
export interface NutJSExecutorConfig {
  /** 鼠标移动速度 (像素/秒) */
  mouseSpeed: number;
  /** 动作间自动延迟 (ms) */
  autoDelayMs: number;
  /** 键盘输入延迟 (ms) */
  typeDelayMs: number;
  /** 是否启用平滑鼠标移动 */
  smoothMouse: boolean;
  /** 失败时重试次数 */
  retries: number;
  /** 重试延迟 (ms) */
  retryDelay: number;
  /** 是否启用安全模式 (限制危险操作) */
  safeMode: boolean;
  /** 屏幕边界缓冲 (像素) */
  screenBuffer: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: NutJSExecutorConfig = {
  mouseSpeed: 1000,
  autoDelayMs: 100,
  typeDelayMs: 50,
  smoothMouse: true,
  retries: 3,
  retryDelay: 500,
  safeMode: true,
  screenBuffer: 10,
};

/**
 * NutJSExecutor - GUI 执行器
 *
 * 使用 NutJS 执行真实的鼠标、键盘操作
 */
export class NutJSExecutor extends EventEmitter {
  private config: NutJSExecutorConfig;
  private nutjs: {
    mouse: NutJSMouse;
    keyboard: NutJSKeyboard;
    screen: NutJSScreen;
    Key: NutJSKey;
  } | null = null;
  private isInitialized: boolean = false;
  private screenSize: { width: number; height: number } | null = null;

  constructor(config: Partial<NutJSExecutorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化 NutJS
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    try {
      // 动态导入 NutJS
      const nutTree = await import('@nut-tree/nut-js').catch(() => null);

      if (!nutTree) {
        console.warn('NutJS (@nut-tree/nut-js) not installed, GUI actions disabled');
        this.emit('warning', 'NutJS not installed');
        return false;
      }

      // 验证必需的 API 是否存在
      if (!nutTree.mouse || !nutTree.keyboard || !nutTree.screen || !nutTree.Key) {
        console.warn('NutJS API incomplete, some features may not work');
        this.emit('warning', 'NutJS API incomplete');
        return false;
      }

      this.nutjs = {
        mouse: nutTree.mouse as unknown as NutJSMouse,
        keyboard: nutTree.keyboard as unknown as NutJSKeyboard,
        screen: nutTree.screen as unknown as NutJSScreen,
        Key: nutTree.Key as unknown as NutJSKey,
      };

      // 配置 NutJS
      if (this.nutjs.mouse.config) {
        this.nutjs.mouse.config.mouseSpeed = this.config.mouseSpeed;
        this.nutjs.mouse.config.autoDelayMs = this.config.autoDelayMs;
      }
      if (this.nutjs.keyboard.config) {
        this.nutjs.keyboard.config.autoDelayMs = this.config.typeDelayMs;
      }

      // 获取屏幕大小
      this.screenSize = {
        width: await this.nutjs.screen.width(),
        height: await this.nutjs.screen.height(),
      };

      this.isInitialized = true;
      this.emit('initialized', this.screenSize);
      return true;
    } catch (error) {
      console.error('Failed to initialize NutJS:', error);
      this.emit('error', { type: 'init', error });
      return false;
    }
  }

  /**
   * 执行单个 GUI 动作
   */
  async execute(action: GUIAction): Promise<ActionResult> {
    const startTime = Date.now();
    const beforePosition = await this.getMousePosition();

    try {
      // 确保已初始化
      if (!this.isInitialized) {
        const initialized = await this.initialize();
        if (!initialized) {
          return {
            success: false,
            actionType: action.type,
            duration: Date.now() - startTime,
            error: 'NutJS not initialized',
          };
        }
      }

      // 执行动作
      let result: Partial<ActionResult> = {};

      switch (action.type) {
        case 'click':
          await this.executeClick(action);
          break;
        case 'double_click':
          await this.executeDoubleClick(action);
          break;
        case 'right_click':
          await this.executeRightClick(action);
          break;
        case 'drag':
          await this.executeDrag(action);
          break;
        case 'move':
          await this.executeMove(action);
          break;
        case 'scroll':
          await this.executeScroll(action);
          break;
        case 'type':
          await this.executeType(action);
          break;
        case 'hotkey':
          await this.executeHotkey(action);
          break;
        case 'key_press':
          await this.executeKeyPress(action);
          break;
        case 'wait':
          await this.executeWait(action);
          break;
        case 'screenshot':
          result = await this.executeScreenshot(action);
          break;
        case 'hover':
          await this.executeHover(action);
          break;
        case 'focus':
          // Focus 动作需要特殊处理
          await this.executeFocus(action);
          break;
        default:
          throw new Error(`Unknown action type: ${(action as any).type}`);
      }

      const afterPosition = await this.getMousePosition();

      return {
        success: true,
        actionType: action.type,
        duration: Date.now() - startTime,
        output: `Action ${action.type} completed`,
        beforePosition,
        afterPosition,
        ...result,
      };
    } catch (error) {
      return {
        success: false,
        actionType: action.type,
        duration: Date.now() - startTime,
        error: (error as Error).message,
        beforePosition,
      };
    }
  }

  /**
   * 执行动作序列
   */
  async executeSequence(sequence: ActionSequence): Promise<SequenceResult> {
    const startTime = Date.now();
    const results: ActionResult[] = [];
    let failedAt: number | undefined;

    for (let i = 0; i < sequence.actions.length; i++) {
      const action = sequence.actions[i];

      // 执行动作 (带重试)
      let result: ActionResult | null = null;
      const retries = sequence.retries ?? 0;

      for (let attempt = 0; attempt <= retries; attempt++) {
        result = await this.execute(action);

        if (result.success) {
          break;
        }

        // 重试延迟
        if (attempt < retries) {
          await this.sleep(sequence.retryDelay ?? 500);
        }
      }

      results.push(result!);

      // 检查是否失败
      if (!result!.success) {
        failedAt = i;
        if (sequence.stopOnFailure) {
          break;
        }
      }

      // 动作间隔
      if (i < sequence.actions.length - 1 && sequence.interval) {
        await this.sleep(sequence.interval);
      }
    }

    return {
      sequenceId: sequence.id,
      success: failedAt === undefined,
      executedCount: results.length,
      totalCount: sequence.actions.length,
      results,
      duration: Date.now() - startTime,
      failedAt,
    };
  }

  /**
   * 获取屏幕尺寸
   */
  async getScreenSize(): Promise<{ width: number; height: number }> {
    if (this.screenSize) {
      return this.screenSize;
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.nutjs) {
      // 返回默认值
      return { width: 1920, height: 1080 };
    }

    return {
      width: await this.nutjs.screen.width(),
      height: await this.nutjs.screen.height(),
    };
  }

  /**
   * 获取当前鼠标位置
   */
  async getMousePosition(): Promise<Point | undefined> {
    if (!this.nutjs) return undefined;

    try {
      const pos = await this.nutjs.mouse.getPosition();
      return { x: pos.x, y: pos.y };
    } catch {
      return undefined;
    }
  }

  /**
   * 归一化坐标 (0-1) 转换为绝对坐标
   */
  async normalizeCoordinates(x: number, y: number): Promise<Point> {
    const screen = await this.getScreenSize();

    // 如果坐标在 0-1 范围内，认为是归一化坐标
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      return {
        x: Math.round(x * screen.width),
        y: Math.round(y * screen.height),
      };
    }

    // 否则直接返回
    return { x: Math.round(x), y: Math.round(y) };
  }

  /**
   * 验证坐标是否在屏幕范围内
   */
  async validateCoordinates(x: number, y: number): Promise<boolean> {
    const screen = await this.getScreenSize();
    const buffer = this.config.screenBuffer;

    return (
      x >= buffer &&
      x <= screen.width - buffer &&
      y >= buffer &&
      y <= screen.height - buffer
    );
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<NutJSExecutorConfig>): void {
    this.config = { ...this.config, ...config };

    if (this.nutjs) {
      if (this.nutjs.mouse.config) {
        this.nutjs.mouse.config.mouseSpeed = this.config.mouseSpeed;
        this.nutjs.mouse.config.autoDelayMs = this.config.autoDelayMs;
      }
      if (this.nutjs.keyboard.config) {
        this.nutjs.keyboard.config.autoDelayMs = this.config.typeDelayMs;
      }
    }

    this.emit('config:updated', this.config);
  }

  /**
   * 获取配置
   */
  getConfig(): NutJSExecutorConfig {
    return { ...this.config };
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized && this.nutjs !== null;
  }

  // ============ 私有方法: 动作执行 ============

  private async executeClick(action: ClickAction): Promise<void> {
    if (!this.nutjs) throw new Error('NutJS not initialized');

    // 验证坐标
    if (this.config.safeMode) {
      const valid = await this.validateCoordinates(action.x, action.y);
      if (!valid) {
        throw new Error(`Coordinates (${action.x}, ${action.y}) out of screen bounds`);
      }
    }

    // 按下修饰键
    if (action.modifiers) {
      await this.pressModifiers(action.modifiers);
    }

    // 移动到目标位置
    await this.nutjs.mouse.move({ x: action.x, y: action.y });

    // 点击
    const clicks = action.clicks ?? 1;
    for (let i = 0; i < clicks; i++) {
      switch (action.button ?? 'left') {
        case 'left':
          await this.nutjs.mouse.leftClick();
          break;
        case 'right':
          await this.nutjs.mouse.rightClick();
          break;
        case 'middle':
          // NutJS 可能不直接支持中键，使用 leftClick 作为后备
          await this.nutjs.mouse.leftClick();
          break;
      }
    }

    // 释放修饰键
    if (action.modifiers) {
      await this.releaseModifiers(action.modifiers);
    }
  }

  private async executeDoubleClick(action: DoubleClickAction): Promise<void> {
    if (!this.nutjs) throw new Error('NutJS not initialized');

    if (action.modifiers) {
      await this.pressModifiers(action.modifiers);
    }

    await this.nutjs.mouse.move({ x: action.x, y: action.y });
    await this.nutjs.mouse.doubleClick();

    if (action.modifiers) {
      await this.releaseModifiers(action.modifiers);
    }
  }

  private async executeRightClick(action: RightClickAction): Promise<void> {
    if (!this.nutjs) throw new Error('NutJS not initialized');

    if (action.modifiers) {
      await this.pressModifiers(action.modifiers);
    }

    await this.nutjs.mouse.move({ x: action.x, y: action.y });
    await this.nutjs.mouse.rightClick();

    if (action.modifiers) {
      await this.releaseModifiers(action.modifiers);
    }
  }

  private async executeDrag(action: DragAction): Promise<void> {
    if (!this.nutjs) throw new Error('NutJS not initialized');

    await this.nutjs.mouse.drag(
      { x: action.from.x, y: action.from.y },
      { x: action.to.x, y: action.to.y }
    );
  }

  private async executeMove(action: MoveAction): Promise<void> {
    if (!this.nutjs) throw new Error('NutJS not initialized');

    await this.nutjs.mouse.move({ x: action.x, y: action.y });
  }

  private async executeScroll(action: ScrollAction): Promise<void> {
    if (!this.nutjs) throw new Error('NutJS not initialized');

    // 如果指定了位置，先移动鼠标
    if (action.x !== undefined && action.y !== undefined) {
      await this.nutjs.mouse.move({ x: action.x, y: action.y });
    }

    switch (action.direction) {
      case 'up':
        await this.nutjs.mouse.scrollUp(action.amount);
        break;
      case 'down':
        await this.nutjs.mouse.scrollDown(action.amount);
        break;
      case 'left':
        await this.nutjs.mouse.scrollLeft(action.amount);
        break;
      case 'right':
        await this.nutjs.mouse.scrollRight(action.amount);
        break;
    }
  }

  private async executeType(action: TypeAction): Promise<void> {
    if (!this.nutjs) throw new Error('NutJS not initialized');

    // 如果需要清空
    if (action.clear) {
      // 全选然后删除
      await this.executeHotkey({ type: 'hotkey', keys: ['ctrl', 'a'] });
      await this.nutjs.keyboard.pressKey(this.nutjs.Key.Delete);
    }

    // 输入文本
    await this.nutjs.keyboard.type(action.text);
  }

  private async executeHotkey(action: HotkeyAction): Promise<void> {
    if (!this.nutjs) throw new Error('NutJS not initialized');

    const keyCodes = action.keys.map((key) => this.mapKeyToCode(key));
    await this.nutjs.keyboard.pressKey(...keyCodes);
    await this.nutjs.keyboard.releaseKey(...keyCodes.reverse());
  }

  private async executeKeyPress(action: KeyPressAction): Promise<void> {
    if (!this.nutjs) throw new Error('NutJS not initialized');

    if (action.modifiers) {
      await this.pressModifiers(action.modifiers);
    }

    const keyCode = this.mapKeyToCode(action.key);
    await this.nutjs.keyboard.pressKey(keyCode);

    if (action.duration) {
      await this.sleep(action.duration);
    }

    await this.nutjs.keyboard.releaseKey(keyCode);

    if (action.modifiers) {
      await this.releaseModifiers(action.modifiers);
    }
  }

  private async executeWait(action: WaitAction): Promise<void> {
    await this.sleep(action.duration);
  }

  private async executeScreenshot(
    action: ScreenshotAction
  ): Promise<Partial<ActionResult>> {
    if (!this.nutjs) throw new Error('NutJS not initialized');

    const region = action.region
      ? {
          left: action.region.x,
          top: action.region.y,
          width: action.region.width,
          height: action.region.height,
        }
      : undefined;

    const capture = await this.nutjs.screen.capture(region);

    return {
      screenshot: {
        data: capture.data.toString('base64'),
        width: capture.width,
        height: capture.height,
      },
    };
  }

  private async executeHover(action: HoverAction): Promise<void> {
    if (!this.nutjs) throw new Error('NutJS not initialized');

    await this.nutjs.mouse.move({ x: action.x, y: action.y });

    if (action.duration) {
      await this.sleep(action.duration);
    }
  }

  private async executeFocus(action: any): Promise<void> {
    // Focus 需要通过点击实现
    if (typeof action.target === 'object') {
      await this.executeClick({
        type: 'click',
        x: action.target.x,
        y: action.target.y,
      });
    }
  }

  // ============ 私有方法: 辅助函数 ============

  private async pressModifiers(modifiers: ModifierKey[]): Promise<void> {
    if (!this.nutjs) return;

    for (const mod of modifiers) {
      const keyCode = this.mapModifierToCode(mod);
      await this.nutjs.keyboard.pressKey(keyCode);
    }
  }

  private async releaseModifiers(modifiers: ModifierKey[]): Promise<void> {
    if (!this.nutjs) return;

    for (const mod of modifiers.reverse()) {
      const keyCode = this.mapModifierToCode(mod);
      await this.nutjs.keyboard.releaseKey(keyCode);
    }
  }

  private mapModifierToCode(modifier: ModifierKey): number {
    if (!this.nutjs) return 0;

    const modMap: Record<ModifierKey, string> = {
      ctrl: 'LeftControl',
      alt: 'LeftAlt',
      shift: 'LeftShift',
      meta: 'LeftSuper',
      command: 'LeftSuper',
    };

    return this.nutjs.Key[modMap[modifier]] || 0;
  }

  private mapKeyToCode(key: string): number {
    if (!this.nutjs) return 0;

    // 尝试直接映射
    const directKey = this.nutjs.Key[key];
    if (directKey !== undefined) {
      return directKey;
    }

    // 尝试首字母大写
    const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
    const capitalKey = this.nutjs.Key[capitalizedKey];
    if (capitalKey !== undefined) {
      return capitalKey;
    }

    // 尝试全大写
    const upperKey = this.nutjs.Key[key.toUpperCase()];
    if (upperKey !== undefined) {
      return upperKey;
    }

    // 特殊按键映射
    const specialKeys: Record<string, string> = {
      enter: 'Return',
      return: 'Return',
      esc: 'Escape',
      escape: 'Escape',
      space: 'Space',
      tab: 'Tab',
      backspace: 'Backspace',
      delete: 'Delete',
      up: 'Up',
      down: 'Down',
      left: 'Left',
      right: 'Right',
      home: 'Home',
      end: 'End',
      pageup: 'PageUp',
      pagedown: 'PageDown',
    };

    const mappedKey = specialKeys[key.toLowerCase()];
    if (mappedKey) {
      return this.nutjs.Key[mappedKey] || 0;
    }

    console.warn(`Unknown key: ${key}`);
    return 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 创建 NutJS 执行器
 */
export function createNutJSExecutor(
  config?: Partial<NutJSExecutorConfig>
): NutJSExecutor {
  return new NutJSExecutor(config);
}

// ============ 单例支持 ============

let globalNutJSExecutor: NutJSExecutor | null = null;

/**
 * 获取全局 NutJS 执行器实例
 */
export function getNutJSExecutor(): NutJSExecutor {
  if (!globalNutJSExecutor) {
    globalNutJSExecutor = createNutJSExecutor();
  }
  return globalNutJSExecutor;
}

/**
 * 设置全局 NutJS 执行器实例
 */
export function setNutJSExecutor(executor: NutJSExecutor): void {
  globalNutJSExecutor = executor;
}
