/**
 * UI Element Types - UI 元素类型定义
 * 定义 UI 元素的数据结构和解析结果
 */

/**
 * UI 元素类型
 */
export type UIElementType =
  | 'button'
  | 'link'
  | 'input'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'dropdown'
  | 'menu'
  | 'menuitem'
  | 'tab'
  | 'icon'
  | 'image'
  | 'text'
  | 'label'
  | 'heading'
  | 'list'
  | 'listitem'
  | 'table'
  | 'row'
  | 'cell'
  | 'container'
  | 'dialog'
  | 'tooltip'
  | 'slider'
  | 'switch'
  | 'progressbar'
  | 'scrollbar'
  | 'toolbar'
  | 'unknown';

/**
 * 边界框
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  // 计算属性
  centerX: number;
  centerY: number;
  right: number;
  bottom: number;
}

/**
 * UI 元素
 */
export interface UIElement {
  /** 唯一标识符 */
  id: string;

  /** 元素类型 */
  type: UIElementType;

  /** 元素标签/名称 */
  label?: string;

  /** 元素文本内容 */
  text?: string;

  /** 边界框 */
  bbox: BoundingBox;

  /** 检测置信度 (0-1) */
  confidence: number;

  /** 是否可交互 */
  interactable: boolean;

  /** 是否可见 */
  visible: boolean;

  /** 是否可点击 */
  clickable: boolean;

  /** 是否可输入 */
  editable: boolean;

  /** 是否选中/激活 */
  selected?: boolean;

  /** 是否禁用 */
  disabled?: boolean;

  /** 元素属性 */
  attributes: Record<string, string>;

  /** 子元素 ID 列表 */
  children?: string[];

  /** 父元素 ID */
  parentId?: string;

  /** 语义角色 */
  role?: string;

  /** 层级深度 */
  depth: number;

  /** 检测来源 */
  source: 'vision' | 'ocr' | 'hybrid';
}

/**
 * 布局信息
 */
export interface LayoutInfo {
  /** 屏幕宽度 */
  width: number;

  /** 屏幕高度 */
  height: number;

  /** DPI 缩放比例 */
  scale: number;

  /** 布局类型 */
  layoutType: 'desktop' | 'mobile' | 'tablet' | 'unknown';

  /** 主要区域 */
  regions: LayoutRegion[];
}

/**
 * 布局区域
 */
export interface LayoutRegion {
  type: 'header' | 'sidebar' | 'content' | 'footer' | 'navigation' | 'modal' | 'toolbar';
  bbox: BoundingBox;
  elements: string[]; // 区域内元素 ID
}

/**
 * 解析后的 UI 结构
 */
export interface ParsedUI {
  /** 所有元素 */
  elements: UIElement[];

  /** 元素索引 (id -> element) */
  elementIndex: Map<string, UIElement>;

  /** 布局信息 */
  layout: LayoutInfo;

  /** 解析时间戳 */
  timestamp: number;

  /** 截图哈希 */
  screenshotHash: string;

  /** 解析耗时 (ms) */
  parseTime: number;

  /** 元素统计 */
  stats: UIParseStats;
}

/**
 * 解析统计
 */
export interface UIParseStats {
  totalElements: number;
  interactableCount: number;
  textElementCount: number;
  buttonCount: number;
  inputCount: number;
  linkCount: number;
  imageCount: number;
  byType: Record<UIElementType, number>;
}

/**
 * 元素匹配结果
 */
export interface ElementMatch {
  element: UIElement;
  score: number;
  matchType: 'exact' | 'partial' | 'semantic';
  reason: string;
}

/**
 * 点击目标
 */
export interface ClickTarget {
  x: number;
  y: number;
  element: UIElement;
  strategy: 'center' | 'offset' | 'safe';
}

/**
 * 元素变化
 */
export interface UIChange {
  type: 'added' | 'removed' | 'moved' | 'changed';
  elementId: string;
  element?: UIElement;
  previousState?: Partial<UIElement>;
  currentState?: Partial<UIElement>;
}

/**
 * UI 差异结果
 */
export interface UIDiff {
  changes: UIChange[];
  addedCount: number;
  removedCount: number;
  movedCount: number;
  changedCount: number;
  similarity: number; // 0-1 相似度
}

/**
 * 创建边界框
 */
export function createBoundingBox(
  x: number,
  y: number,
  width: number,
  height: number
): BoundingBox {
  return {
    x,
    y,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2,
    right: x + width,
    bottom: y + height,
  };
}

/**
 * 检查点是否在边界框内
 */
export function isPointInBoundingBox(
  point: { x: number; y: number },
  bbox: BoundingBox
): boolean {
  return (
    point.x >= bbox.x &&
    point.x <= bbox.right &&
    point.y >= bbox.y &&
    point.y <= bbox.bottom
  );
}

/**
 * 检查两个边界框是否重叠
 */
export function isBoundingBoxOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.right < b.x ||
    b.right < a.x ||
    a.bottom < b.y ||
    b.bottom < a.y
  );
}

/**
 * 计算两个边界框的 IoU (Intersection over Union)
 */
export function calculateIoU(a: BoundingBox, b: BoundingBox): number {
  const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  const intersection = xOverlap * yOverlap;

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * 获取元素的点击位置
 */
export function getElementClickPosition(element: UIElement): { x: number; y: number } {
  // 对于某些元素类型，使用偏移点击
  switch (element.type) {
    case 'checkbox':
    case 'radio':
      // 点击元素左侧
      return {
        x: element.bbox.x + Math.min(15, element.bbox.width / 4),
        y: element.bbox.centerY,
      };
    case 'slider':
      // 点击滑块中心
      return {
        x: element.bbox.centerX,
        y: element.bbox.centerY,
      };
    default:
      // 默认点击中心
      return {
        x: element.bbox.centerX,
        y: element.bbox.centerY,
      };
  }
}

/**
 * 判断元素是否可交互
 */
export function isElementInteractable(element: UIElement): boolean {
  if (element.disabled) return false;
  if (!element.visible) return false;

  const interactableTypes: UIElementType[] = [
    'button', 'link', 'input', 'textarea', 'checkbox', 'radio',
    'select', 'dropdown', 'menuitem', 'tab', 'slider', 'switch',
  ];

  return interactableTypes.includes(element.type) || element.clickable;
}

/**
 * 元素排序比较函数 (从上到下，从左到右)
 */
export function compareElementPosition(a: UIElement, b: UIElement): number {
  // 首先按 Y 坐标排序
  if (Math.abs(a.bbox.y - b.bbox.y) > 10) {
    return a.bbox.y - b.bbox.y;
  }
  // Y 坐标相近时按 X 坐标排序
  return a.bbox.x - b.bbox.x;
}
