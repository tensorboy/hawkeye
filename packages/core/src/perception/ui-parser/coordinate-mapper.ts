/**
 * Coordinate Mapper - 坐标映射器
 * 处理屏幕坐标、缩放、多显示器等场景
 */

import type { BoundingBox, UIElement, ClickTarget } from './element-types';
import { createBoundingBox } from './element-types';

export interface DisplayInfo {
  id: string;
  name: string;
  bounds: BoundingBox;
  workArea: BoundingBox;
  scaleFactor: number;
  isPrimary: boolean;
  rotation: number;
}

export interface CoordinateMapperConfig {
  /** 默认缩放因子 */
  defaultScale: number;
  /** 是否启用多显示器支持 */
  enableMultiDisplay: boolean;
  /** 点击安全边距 (像素) */
  clickSafeMargin: number;
  /** 坐标舍入模式 */
  roundingMode: 'floor' | 'round' | 'ceil';
}

const DEFAULT_CONFIG: CoordinateMapperConfig = {
  defaultScale: 1,
  enableMultiDisplay: true,
  clickSafeMargin: 2,
  roundingMode: 'round',
};

/**
 * 坐标映射器
 */
export class CoordinateMapper {
  private config: CoordinateMapperConfig;
  private displays: DisplayInfo[] = [];
  private primaryDisplay: DisplayInfo | null = null;
  private currentScale = 1;

  constructor(config: Partial<CoordinateMapperConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentScale = this.config.defaultScale;
  }

  /**
   * 设置显示器信息
   */
  setDisplays(displays: DisplayInfo[]): void {
    this.displays = displays;
    this.primaryDisplay = displays.find(d => d.isPrimary) || displays[0] || null;
  }

  /**
   * 设置当前缩放因子
   */
  setScale(scale: number): void {
    this.currentScale = scale;
  }

  /**
   * 将截图坐标转换为屏幕坐标
   */
  screenshotToScreen(
    x: number,
    y: number,
    screenshotScale?: number
  ): { x: number; y: number } {
    const scale = screenshotScale || this.currentScale;

    // 应用缩放
    let screenX = x * scale;
    let screenY = y * scale;

    // 如果启用多显示器，添加主显示器偏移
    if (this.config.enableMultiDisplay && this.primaryDisplay) {
      screenX += this.primaryDisplay.bounds.x;
      screenY += this.primaryDisplay.bounds.y;
    }

    return this.roundCoordinates(screenX, screenY);
  }

  /**
   * 将屏幕坐标转换为截图坐标
   */
  screenToScreenshot(
    x: number,
    y: number,
    screenshotScale?: number
  ): { x: number; y: number } {
    const scale = screenshotScale || this.currentScale;

    let screenshotX = x;
    let screenshotY = y;

    // 如果启用多显示器，减去主显示器偏移
    if (this.config.enableMultiDisplay && this.primaryDisplay) {
      screenshotX -= this.primaryDisplay.bounds.x;
      screenshotY -= this.primaryDisplay.bounds.y;
    }

    // 反向缩放
    screenshotX /= scale;
    screenshotY /= scale;

    return this.roundCoordinates(screenshotX, screenshotY);
  }

  /**
   * 转换边界框到屏幕坐标
   */
  bboxToScreen(bbox: BoundingBox, screenshotScale?: number): BoundingBox {
    const topLeft = this.screenshotToScreen(bbox.x, bbox.y, screenshotScale);
    const bottomRight = this.screenshotToScreen(bbox.right, bbox.bottom, screenshotScale);

    return createBoundingBox(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y
    );
  }

  /**
   * 转换边界框到截图坐标
   */
  bboxToScreenshot(bbox: BoundingBox, screenshotScale?: number): BoundingBox {
    const topLeft = this.screenToScreenshot(bbox.x, bbox.y, screenshotScale);
    const bottomRight = this.screenToScreenshot(bbox.right, bbox.bottom, screenshotScale);

    return createBoundingBox(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y
    );
  }

  /**
   * 获取元素的安全点击位置
   */
  getSafeClickPosition(element: UIElement, screenshotScale?: number): ClickTarget {
    const margin = this.config.clickSafeMargin;
    const bbox = element.bbox;

    // 计算安全区域
    const safeX = Math.max(bbox.x + margin, Math.min(bbox.centerX, bbox.right - margin));
    const safeY = Math.max(bbox.y + margin, Math.min(bbox.centerY, bbox.bottom - margin));

    // 转换到屏幕坐标
    const screenPos = this.screenshotToScreen(safeX, safeY, screenshotScale);

    return {
      x: screenPos.x,
      y: screenPos.y,
      element,
      strategy: 'safe',
    };
  }

  /**
   * 获取元素中心点击位置
   */
  getCenterClickPosition(element: UIElement, screenshotScale?: number): ClickTarget {
    const screenPos = this.screenshotToScreen(
      element.bbox.centerX,
      element.bbox.centerY,
      screenshotScale
    );

    return {
      x: screenPos.x,
      y: screenPos.y,
      element,
      strategy: 'center',
    };
  }

  /**
   * 获取元素偏移点击位置
   */
  getOffsetClickPosition(
    element: UIElement,
    offsetX: number,
    offsetY: number,
    screenshotScale?: number
  ): ClickTarget {
    const x = element.bbox.x + offsetX;
    const y = element.bbox.y + offsetY;

    const screenPos = this.screenshotToScreen(x, y, screenshotScale);

    return {
      x: screenPos.x,
      y: screenPos.y,
      element,
      strategy: 'offset',
    };
  }

  /**
   * 检查坐标是否在屏幕范围内
   */
  isOnScreen(x: number, y: number): boolean {
    if (!this.config.enableMultiDisplay || this.displays.length === 0) {
      return true; // 无显示器信息时假设有效
    }

    for (const display of this.displays) {
      if (this.isInBounds(x, y, display.bounds)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查坐标是否在边界框内
   */
  private isInBounds(x: number, y: number, bounds: BoundingBox): boolean {
    return (
      x >= bounds.x &&
      x <= bounds.right &&
      y >= bounds.y &&
      y <= bounds.bottom
    );
  }

  /**
   * 获取坐标所在的显示器
   */
  getDisplayAt(x: number, y: number): DisplayInfo | null {
    for (const display of this.displays) {
      if (this.isInBounds(x, y, display.bounds)) {
        return display;
      }
    }
    return null;
  }

  /**
   * 将坐标限制在屏幕范围内
   */
  clampToScreen(x: number, y: number): { x: number; y: number } {
    if (!this.primaryDisplay) {
      return { x, y };
    }

    const bounds = this.primaryDisplay.workArea;
    return {
      x: Math.max(bounds.x, Math.min(x, bounds.right)),
      y: Math.max(bounds.y, Math.min(y, bounds.bottom)),
    };
  }

  /**
   * 将坐标限制在元素范围内
   */
  clampToElement(
    x: number,
    y: number,
    element: UIElement
  ): { x: number; y: number } {
    const margin = this.config.clickSafeMargin;
    const bbox = element.bbox;

    return {
      x: Math.max(bbox.x + margin, Math.min(x, bbox.right - margin)),
      y: Math.max(bbox.y + margin, Math.min(y, bbox.bottom - margin)),
    };
  }

  /**
   * 坐标舍入
   */
  private roundCoordinates(x: number, y: number): { x: number; y: number } {
    switch (this.config.roundingMode) {
      case 'floor':
        return { x: Math.floor(x), y: Math.floor(y) };
      case 'ceil':
        return { x: Math.ceil(x), y: Math.ceil(y) };
      default:
        return { x: Math.round(x), y: Math.round(y) };
    }
  }

  /**
   * 计算两点之间的距离
   */
  static distance(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 计算点到元素的最近距离
   */
  static distanceToElement(
    x: number,
    y: number,
    element: UIElement
  ): number {
    const bbox = element.bbox;

    // 如果点在元素内，距离为 0
    if (x >= bbox.x && x <= bbox.right && y >= bbox.y && y <= bbox.bottom) {
      return 0;
    }

    // 找到最近的边界点
    const nearestX = Math.max(bbox.x, Math.min(x, bbox.right));
    const nearestY = Math.max(bbox.y, Math.min(y, bbox.bottom));

    return CoordinateMapper.distance(x, y, nearestX, nearestY);
  }

  /**
   * 获取当前配置
   */
  getConfig(): CoordinateMapperConfig {
    return { ...this.config };
  }

  /**
   * 获取当前缩放
   */
  getScale(): number {
    return this.currentScale;
  }

  /**
   * 获取主显示器
   */
  getPrimaryDisplay(): DisplayInfo | null {
    return this.primaryDisplay;
  }

  /**
   * 获取所有显示器
   */
  getAllDisplays(): DisplayInfo[] {
    return [...this.displays];
  }
}

// 单例
let globalCoordinateMapper: CoordinateMapper | null = null;

export function getCoordinateMapper(): CoordinateMapper {
  if (!globalCoordinateMapper) {
    globalCoordinateMapper = new CoordinateMapper();
  }
  return globalCoordinateMapper;
}

export function setCoordinateMapper(mapper: CoordinateMapper): void {
  globalCoordinateMapper = mapper;
}
