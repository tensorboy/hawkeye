/**
 * Action Types - 统一的 GUI 动作类型系统
 *
 * 定义所有支持的 GUI 操作类型
 * 参考: UFO, Agent-S, UI-TARS 等项目的动作空间设计
 */

/**
 * 点坐标
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * 鼠标按钮类型
 */
export type MouseButton = 'left' | 'right' | 'middle';

/**
 * 滚动方向
 */
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

/**
 * 修饰键
 */
export type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'meta' | 'command';

/**
 * 基础 GUI 动作类型
 */
export type GUIAction =
  // 鼠标操作
  | ClickAction
  | DoubleClickAction
  | RightClickAction
  | DragAction
  | MoveAction
  | ScrollAction
  // 键盘操作
  | TypeAction
  | HotkeyAction
  | KeyPressAction
  // 其他操作
  | WaitAction
  | ScreenshotAction
  | FocusAction
  | HoverAction;

/**
 * 点击动作
 */
export interface ClickAction {
  type: 'click';
  /** X 坐标 (像素) */
  x: number;
  /** Y 坐标 (像素) */
  y: number;
  /** 鼠标按钮 */
  button?: MouseButton;
  /** 点击次数 */
  clicks?: number;
  /** 修饰键 */
  modifiers?: ModifierKey[];
}

/**
 * 双击动作
 */
export interface DoubleClickAction {
  type: 'double_click';
  x: number;
  y: number;
  button?: MouseButton;
  modifiers?: ModifierKey[];
}

/**
 * 右键点击动作
 */
export interface RightClickAction {
  type: 'right_click';
  x: number;
  y: number;
  modifiers?: ModifierKey[];
}

/**
 * 拖拽动作
 */
export interface DragAction {
  type: 'drag';
  /** 起始点 */
  from: Point;
  /** 终点 */
  to: Point;
  /** 拖拽按钮 */
  button?: MouseButton;
  /** 拖拽持续时间 (ms) */
  duration?: number;
}

/**
 * 移动鼠标动作
 */
export interface MoveAction {
  type: 'move';
  x: number;
  y: number;
  /** 是否平滑移动 */
  smooth?: boolean;
}

/**
 * 滚动动作
 */
export interface ScrollAction {
  type: 'scroll';
  /** 滚动方向 */
  direction: ScrollDirection;
  /** 滚动量 (像素或行数) */
  amount: number;
  /** 滚动位置 (可选, 默认为鼠标当前位置) */
  x?: number;
  y?: number;
}

/**
 * 输入文本动作
 */
export interface TypeAction {
  type: 'type';
  /** 要输入的文本 */
  text: string;
  /** 输入延迟 (ms, 每个字符) */
  delay?: number;
  /** 是否清空之前的内容 */
  clear?: boolean;
}

/**
 * 快捷键动作
 */
export interface HotkeyAction {
  type: 'hotkey';
  /** 按键组合 (如 ['ctrl', 'c']) */
  keys: string[];
}

/**
 * 按键动作
 */
export interface KeyPressAction {
  type: 'key_press';
  /** 按键名称 */
  key: string;
  /** 修饰键 */
  modifiers?: ModifierKey[];
  /** 按住时长 (ms) */
  duration?: number;
}

/**
 * 等待动作
 */
export interface WaitAction {
  type: 'wait';
  /** 等待时长 (ms) */
  duration: number;
}

/**
 * 截图动作
 */
export interface ScreenshotAction {
  type: 'screenshot';
  /** 截图区域 (可选, 默认全屏) */
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 保存路径 (可选) */
  savePath?: string;
  /** 显示器 ID (可选) */
  displayId?: string;
}

/**
 * 聚焦动作
 */
export interface FocusAction {
  type: 'focus';
  /** 目标元素 ID 或坐标 */
  target: string | Point;
}

/**
 * 悬停动作
 */
export interface HoverAction {
  type: 'hover';
  x: number;
  y: number;
  /** 悬停时长 (ms) */
  duration?: number;
}

/**
 * 动作执行结果
 */
export interface ActionResult {
  /** 是否成功 */
  success: boolean;
  /** 动作类型 */
  actionType: GUIAction['type'];
  /** 执行耗时 (ms) */
  duration: number;
  /** 输出信息 */
  output?: string;
  /** 错误信息 */
  error?: string;
  /** 截图数据 (用于 screenshot 动作) */
  screenshot?: {
    data: string;
    width: number;
    height: number;
  };
  /** 执行前坐标 */
  beforePosition?: Point;
  /** 执行后坐标 */
  afterPosition?: Point;
}

/**
 * 动作序列
 */
export interface ActionSequence {
  /** 序列 ID */
  id: string;
  /** 动作列表 */
  actions: GUIAction[];
  /** 动作间隔 (ms) */
  interval?: number;
  /** 是否失败时停止 */
  stopOnFailure?: boolean;
  /** 重试次数 */
  retries?: number;
  /** 重试延迟 (ms) */
  retryDelay?: number;
}

/**
 * 序列执行结果
 */
export interface SequenceResult {
  /** 序列 ID */
  sequenceId: string;
  /** 是否全部成功 */
  success: boolean;
  /** 执行的动作数 */
  executedCount: number;
  /** 总动作数 */
  totalCount: number;
  /** 各动作结果 */
  results: ActionResult[];
  /** 总耗时 (ms) */
  duration: number;
  /** 失败的动作索引 (如果有) */
  failedAt?: number;
}

/**
 * 坐标系统
 */
export type CoordinateSystem = 'absolute' | 'relative' | 'normalized';

/**
 * 坐标转换配置
 */
export interface CoordinateConfig {
  /** 坐标系统 */
  system: CoordinateSystem;
  /** 屏幕宽度 (用于归一化) */
  screenWidth?: number;
  /** 屏幕高度 (用于归一化) */
  screenHeight?: number;
  /** 参考点 (用于相对坐标) */
  reference?: Point;
}

/**
 * 将归一化坐标 (0-1) 转换为绝对坐标
 */
export function normalizedToAbsolute(
  point: Point,
  screenWidth: number,
  screenHeight: number
): Point {
  return {
    x: Math.round(point.x * screenWidth),
    y: Math.round(point.y * screenHeight),
  };
}

/**
 * 将绝对坐标转换为归一化坐标 (0-1)
 */
export function absoluteToNormalized(
  point: Point,
  screenWidth: number,
  screenHeight: number
): Point {
  return {
    x: point.x / screenWidth,
    y: point.y / screenHeight,
  };
}

/**
 * 将相对坐标转换为绝对坐标
 */
export function relativeToAbsolute(point: Point, reference: Point): Point {
  return {
    x: reference.x + point.x,
    y: reference.y + point.y,
  };
}

/**
 * 创建点击动作
 */
export function createClickAction(
  x: number,
  y: number,
  options?: Partial<Omit<ClickAction, 'type' | 'x' | 'y'>>
): ClickAction {
  return {
    type: 'click',
    x,
    y,
    ...options,
  };
}

/**
 * 创建输入动作
 */
export function createTypeAction(
  text: string,
  options?: Partial<Omit<TypeAction, 'type' | 'text'>>
): TypeAction {
  return {
    type: 'type',
    text,
    ...options,
  };
}

/**
 * 创建快捷键动作
 */
export function createHotkeyAction(keys: string[]): HotkeyAction {
  return {
    type: 'hotkey',
    keys,
  };
}

/**
 * 创建滚动动作
 */
export function createScrollAction(
  direction: ScrollDirection,
  amount: number,
  position?: Point
): ScrollAction {
  return {
    type: 'scroll',
    direction,
    amount,
    x: position?.x,
    y: position?.y,
  };
}

/**
 * 创建等待动作
 */
export function createWaitAction(duration: number): WaitAction {
  return {
    type: 'wait',
    duration,
  };
}

/**
 * 创建动作序列
 */
export function createActionSequence(
  actions: GUIAction[],
  options?: Partial<Omit<ActionSequence, 'actions'>>
): ActionSequence {
  return {
    id: options?.id || `seq_${Date.now()}`,
    actions,
    interval: options?.interval ?? 100,
    stopOnFailure: options?.stopOnFailure ?? true,
    retries: options?.retries ?? 0,
    retryDelay: options?.retryDelay ?? 500,
  };
}

/**
 * 常用快捷键预设
 */
export const COMMON_HOTKEYS = {
  // 编辑
  copy: ['ctrl', 'c'],
  cut: ['ctrl', 'x'],
  paste: ['ctrl', 'v'],
  undo: ['ctrl', 'z'],
  redo: ['ctrl', 'shift', 'z'],
  selectAll: ['ctrl', 'a'],
  save: ['ctrl', 's'],
  find: ['ctrl', 'f'],
  replace: ['ctrl', 'h'],

  // 导航
  newTab: ['ctrl', 't'],
  closeTab: ['ctrl', 'w'],
  switchTab: ['ctrl', 'tab'],
  refresh: ['ctrl', 'r'],
  back: ['alt', 'left'],
  forward: ['alt', 'right'],

  // 系统
  screenshot: ['meta', 'shift', '4'], // macOS
  screenshotWin: ['printscreen'], // Windows
  taskManager: ['ctrl', 'shift', 'escape'],
  spotlight: ['meta', 'space'], // macOS

  // macOS 特定
  copyMac: ['meta', 'c'],
  cutMac: ['meta', 'x'],
  pasteMac: ['meta', 'v'],
  undoMac: ['meta', 'z'],
  redoMac: ['meta', 'shift', 'z'],
  saveMac: ['meta', 's'],
} as const;

/**
 * 获取平台特定的快捷键
 */
export function getPlatformHotkey(
  action: keyof typeof COMMON_HOTKEYS,
  platform: NodeJS.Platform = process.platform
): string[] {
  const isMac = platform === 'darwin';

  // Mac 特定快捷键
  if (isMac) {
    const macVersion = `${action}Mac` as keyof typeof COMMON_HOTKEYS;
    if (macVersion in COMMON_HOTKEYS) {
      return [...COMMON_HOTKEYS[macVersion]];
    }
  }

  return [...COMMON_HOTKEYS[action]];
}
