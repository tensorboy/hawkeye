/**
 * Element Detector - UI 元素检测器
 * 基于视觉特征和启发式规则检测 UI 元素
 */

import type {
  UIElement,
  UIElementType,
  BoundingBox,
} from './element-types';
import { createBoundingBox } from './element-types';

export interface DetectionConfig {
  /** 启用边缘检测 */
  enableEdgeDetection: boolean;
  /** 启用颜色分析 */
  enableColorAnalysis: boolean;
  /** 启用文本检测 */
  enableTextDetection: boolean;
  /** 最小元素面积 */
  minElementArea: number;
  /** 最大元素面积比例 */
  maxElementAreaRatio: number;
  /** 边缘检测阈值 */
  edgeThreshold: number;
}

const DEFAULT_CONFIG: DetectionConfig = {
  enableEdgeDetection: true,
  enableColorAnalysis: true,
  enableTextDetection: true,
  minElementArea: 100,
  maxElementAreaRatio: 0.8,
  edgeThreshold: 30,
};

/**
 * 视觉特征
 */
export interface VisualFeatures {
  hasRoundedCorners: boolean;
  hasBorder: boolean;
  hasShadow: boolean;
  hasGradient: boolean;
  dominantColor: string;
  contrastRatio: number;
  aspectRatio: number;
}

/**
 * 检测候选区域
 */
export interface DetectionCandidate {
  bbox: BoundingBox;
  features: VisualFeatures;
  confidence: number;
  suggestedType: UIElementType;
}

/**
 * UI 元素检测器
 */
export class ElementDetector {
  private config: DetectionConfig;
  private elementCounter = 0;

  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 检测截图中的 UI 元素
   */
  async detect(screenshot: Buffer): Promise<UIElement[]> {
    const elements: UIElement[] = [];

    // 1. 获取图像尺寸
    const dimensions = await this.getImageDimensions(screenshot);

    // 2. 检测候选区域
    const candidates = await this.detectCandidates(screenshot, dimensions);

    // 3. 过滤和分类候选区域
    for (const candidate of candidates) {
      if (this.isValidCandidate(candidate, dimensions)) {
        const element = this.candidateToElement(candidate);
        elements.push(element);
      }
    }

    // 4. 建立元素层级关系
    this.buildHierarchy(elements);

    return elements;
  }

  /**
   * 获取图像尺寸
   */
  private async getImageDimensions(screenshot: Buffer): Promise<{ width: number; height: number }> {
    // 简化实现：解析 PNG/JPEG 头部获取尺寸
    // 实际实现需要使用图像处理库

    // PNG 格式
    if (screenshot[0] === 0x89 && screenshot[1] === 0x50) {
      const width = screenshot.readUInt32BE(16);
      const height = screenshot.readUInt32BE(20);
      return { width, height };
    }

    // JPEG 格式
    if (screenshot[0] === 0xff && screenshot[1] === 0xd8) {
      // 简化：返回默认尺寸
      return { width: 1920, height: 1080 };
    }

    return { width: 1920, height: 1080 };
  }

  /**
   * 检测候选区域
   */
  private async detectCandidates(
    screenshot: Buffer,
    dimensions: { width: number; height: number }
  ): Promise<DetectionCandidate[]> {
    const candidates: DetectionCandidate[] = [];

    // 这是一个简化的启发式实现
    // 实际生产环境中应该使用 CV 库 (如 OpenCV) 或 ML 模型

    // 基于常见 UI 模式生成候选区域
    // 顶部工具栏区域
    candidates.push({
      bbox: createBoundingBox(0, 0, dimensions.width, 60),
      features: this.createDefaultFeatures(),
      confidence: 0.7,
      suggestedType: 'toolbar',
    });

    // 侧边栏区域
    candidates.push({
      bbox: createBoundingBox(0, 60, 250, dimensions.height - 60),
      features: this.createDefaultFeatures(),
      confidence: 0.6,
      suggestedType: 'container',
    });

    // 主内容区域
    candidates.push({
      bbox: createBoundingBox(250, 60, dimensions.width - 250, dimensions.height - 60),
      features: this.createDefaultFeatures(),
      confidence: 0.6,
      suggestedType: 'container',
    });

    return candidates;
  }

  /**
   * 创建默认视觉特征
   */
  private createDefaultFeatures(): VisualFeatures {
    return {
      hasRoundedCorners: false,
      hasBorder: false,
      hasShadow: false,
      hasGradient: false,
      dominantColor: '#ffffff',
      contrastRatio: 1,
      aspectRatio: 1,
    };
  }

  /**
   * 验证候选区域是否有效
   */
  private isValidCandidate(
    candidate: DetectionCandidate,
    dimensions: { width: number; height: number }
  ): boolean {
    const area = candidate.bbox.width * candidate.bbox.height;
    const screenArea = dimensions.width * dimensions.height;

    // 检查最小面积
    if (area < this.config.minElementArea) {
      return false;
    }

    // 检查最大面积比例
    if (area / screenArea > this.config.maxElementAreaRatio) {
      return false;
    }

    return true;
  }

  /**
   * 将候选区域转换为 UI 元素
   */
  private candidateToElement(candidate: DetectionCandidate): UIElement {
    const type = candidate.suggestedType;

    return {
      id: this.generateElementId(),
      type,
      bbox: candidate.bbox,
      confidence: candidate.confidence,
      interactable: this.isTypeInteractable(type),
      visible: true,
      clickable: this.isTypeClickable(type),
      editable: this.isTypeEditable(type),
      attributes: {},
      depth: 0,
      source: 'vision',
    };
  }

  /**
   * 判断元素类型是否可交互
   */
  private isTypeInteractable(type: UIElementType): boolean {
    const interactableTypes: UIElementType[] = [
      'button', 'link', 'input', 'textarea', 'checkbox', 'radio',
      'select', 'dropdown', 'menuitem', 'tab', 'slider', 'switch',
    ];
    return interactableTypes.includes(type);
  }

  /**
   * 判断元素类型是否可点击
   */
  private isTypeClickable(type: UIElementType): boolean {
    const clickableTypes: UIElementType[] = [
      'button', 'link', 'checkbox', 'radio', 'menuitem', 'tab',
      'icon', 'image', 'listitem', 'cell',
    ];
    return clickableTypes.includes(type);
  }

  /**
   * 判断元素类型是否可编辑
   */
  private isTypeEditable(type: UIElementType): boolean {
    return type === 'input' || type === 'textarea';
  }

  /**
   * 建立元素层级关系
   */
  private buildHierarchy(elements: UIElement[]): void {
    // 按面积从大到小排序
    const sorted = [...elements].sort((a, b) => {
      const areaA = a.bbox.width * a.bbox.height;
      const areaB = b.bbox.width * b.bbox.height;
      return areaB - areaA;
    });

    // 检查包含关系
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (this.isContained(sorted[j].bbox, sorted[i].bbox)) {
          sorted[j].parentId = sorted[i].id;
          sorted[j].depth = (sorted[i].depth || 0) + 1;

          if (!sorted[i].children) {
            sorted[i].children = [];
          }
          sorted[i].children.push(sorted[j].id);
        }
      }
    }
  }

  /**
   * 检查一个边界框是否包含在另一个内
   */
  private isContained(inner: BoundingBox, outer: BoundingBox): boolean {
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.right <= outer.right &&
      inner.bottom <= outer.bottom
    );
  }

  /**
   * 生成元素 ID
   */
  private generateElementId(): string {
    return `det_${Date.now()}_${this.elementCounter++}`;
  }

  /**
   * 根据视觉特征推断元素类型
   */
  inferTypeFromFeatures(features: VisualFeatures, bbox: BoundingBox): UIElementType {
    const aspectRatio = bbox.width / bbox.height;
    const area = bbox.width * bbox.height;

    // 按钮特征: 圆角、有边框、宽高比适中
    if (features.hasRoundedCorners && features.hasBorder && aspectRatio > 1.5 && aspectRatio < 8) {
      return 'button';
    }

    // 输入框特征: 有边框、宽且矮
    if (features.hasBorder && aspectRatio > 3 && bbox.height < 50) {
      return 'input';
    }

    // 图片特征: 无边框、面积较大
    if (!features.hasBorder && area > 10000) {
      return 'image';
    }

    // 文本特征: 高对比度、无装饰
    if (features.contrastRatio > 4 && !features.hasBorder && !features.hasShadow) {
      return 'text';
    }

    // 图标特征: 正方形、小尺寸
    if (Math.abs(aspectRatio - 1) < 0.2 && area < 2000) {
      return 'icon';
    }

    return 'unknown';
  }
}

// 单例
let globalElementDetector: ElementDetector | null = null;

export function getElementDetector(): ElementDetector {
  if (!globalElementDetector) {
    globalElementDetector = new ElementDetector();
  }
  return globalElementDetector;
}

export function setElementDetector(detector: ElementDetector): void {
  globalElementDetector = detector;
}
