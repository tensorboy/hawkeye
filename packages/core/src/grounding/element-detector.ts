/**
 * Element Detector - UI 元素检测器
 *
 * 从截图中检测 UI 元素
 * 支持 OCR 检测和视觉特征检测
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  UIElement,
  UIElementType,
  BoundingBox,
  Screenshot,
  OCRRegion,
  ElementDetectionResult,
  UIGroundingConfig,
} from './types';
import { DEFAULT_UI_GROUNDING_CONFIG } from './types';
import { applyNMS, applyCategoryAwareNMS, removeDuplicates } from './nms';

/**
 * OCR 检测结果
 */
interface OCRDetectionResult {
  regions: OCRRegion[];
  duration: number;
}

/**
 * 视觉检测结果
 */
interface VisualDetectionResult {
  elements: UIElement[];
  duration: number;
}

/**
 * ElementDetector - UI 元素检测器
 *
 * 结合 OCR 和视觉特征检测 UI 元素
 */
export class ElementDetector extends EventEmitter {
  private config: UIGroundingConfig;
  private ocrEngine: OCREngine | null = null;

  constructor(config: Partial<UIGroundingConfig> = {}) {
    super();
    this.config = {
      ...DEFAULT_UI_GROUNDING_CONFIG,
      ...config,
      nms: { ...DEFAULT_UI_GROUNDING_CONFIG.nms, ...config.nms },
    };
  }

  /**
   * 检测截图中的 UI 元素
   */
  async detect(screenshot: Screenshot): Promise<ElementDetectionResult> {
    const startTime = Date.now();
    let allElements: UIElement[] = [];

    // 并行执行 OCR 和视觉检测
    const detectionPromises: Promise<void>[] = [];

    if (this.config.enableOCR) {
      detectionPromises.push(
        this.detectWithOCR(screenshot).then((result) => {
          allElements.push(...result.elements);
        })
      );
    }

    if (this.config.enableVisualDetection) {
      detectionPromises.push(
        this.detectVisualElements(screenshot).then((result) => {
          allElements.push(...result.elements);
        })
      );
    }

    await Promise.all(detectionPromises);

    // 去重
    allElements = removeDuplicates(allElements);

    // 应用 NMS
    allElements = applyCategoryAwareNMS(allElements, this.config.nms);

    // 限制最大数量
    if (allElements.length > this.config.maxElements) {
      allElements = allElements.slice(0, this.config.maxElements);
    }

    // 分配 ID 和计算层级关系
    this.assignHierarchy(allElements);

    const result: ElementDetectionResult = {
      elements: allElements,
      duration: Date.now() - startTime,
      screenshot: {
        width: screenshot.width,
        height: screenshot.height,
        timestamp: screenshot.timestamp,
      },
      method: this.config.enableOCR && this.config.enableVisualDetection ? 'hybrid' :
              this.config.enableOCR ? 'ocr' : 'visual',
    };

    this.emit('detection:complete', result);
    return result;
  }

  /**
   * OCR 检测
   */
  private async detectWithOCR(screenshot: Screenshot): Promise<VisualDetectionResult> {
    const startTime = Date.now();
    const elements: UIElement[] = [];

    try {
      // 使用 OCR 引擎检测文本区域
      const ocrResult = await this.performOCR(screenshot);

      // 将 OCR 结果转换为 UI 元素
      for (const region of ocrResult.regions) {
        // 过滤太小的元素
        if (
          region.bounds.width < this.config.minElementSize.width ||
          region.bounds.height < this.config.minElementSize.height
        ) {
          continue;
        }

        const element = this.createElementFromOCR(region);
        elements.push(element);
      }
    } catch (error) {
      this.emit('error', { type: 'ocr', error });
    }

    return {
      elements,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 视觉特征检测
   * 基于图像处理检测常见 UI 元素
   */
  private async detectVisualElements(screenshot: Screenshot): Promise<VisualDetectionResult> {
    const startTime = Date.now();
    const elements: UIElement[] = [];

    try {
      // 基于边缘检测和形状分析检测 UI 元素
      // 这里使用启发式方法，实际可接入更复杂的视觉模型

      // 1. 检测按钮形状的区域 (圆角矩形)
      const buttonCandidates = await this.detectButtonShapes(screenshot);
      elements.push(...buttonCandidates);

      // 2. 检测输入框 (长方形边框)
      const inputCandidates = await this.detectInputFields(screenshot);
      elements.push(...inputCandidates);

      // 3. 检测图标 (小型正方形区域)
      const iconCandidates = await this.detectIcons(screenshot);
      elements.push(...iconCandidates);

    } catch (error) {
      this.emit('error', { type: 'visual', error });
    }

    return {
      elements,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 执行 OCR
   */
  private async performOCR(screenshot: Screenshot): Promise<OCRDetectionResult> {
    const startTime = Date.now();

    // 如果有外部 OCR 引擎，使用它
    if (this.ocrEngine) {
      const regions = await this.ocrEngine.recognize(screenshot);
      return {
        regions,
        duration: Date.now() - startTime,
      };
    }

    // 默认实现: 返回空结果
    // 实际使用时应该接入 Tesseract.js 或其他 OCR 引擎
    return {
      regions: [],
      duration: Date.now() - startTime,
    };
  }

  /**
   * 从 OCR 区域创建 UI 元素
   */
  private createElementFromOCR(region: OCRRegion): UIElement {
    const elementType = this.inferTypeFromText(region.text);

    return {
      id: uuidv4(),
      type: elementType,
      bounds: region.bounds,
      text: region.text,
      confidence: region.confidence,
      interactable: this.isTextInteractable(region.text, elementType),
      ocrRegions: [region],
    };
  }

  /**
   * 从文本推断元素类型
   */
  private inferTypeFromText(text: string): UIElementType {
    const lowerText = text.toLowerCase().trim();

    // 按钮关键词
    const buttonKeywords = ['submit', 'cancel', 'ok', 'save', 'delete', 'confirm', 'apply', 'close', 'open', 'next', 'back', 'send', 'login', 'logout', 'sign', '确定', '取消', '保存', '删除', '确认', '应用', '关闭', '打开', '下一步', '返回', '发送', '登录', '退出'];
    if (buttonKeywords.some(kw => lowerText.includes(kw))) {
      return 'button';
    }

    // 链接关键词
    const linkKeywords = ['http', 'https', 'www', '.com', '.org', '.net', 'click here', '点击', '链接'];
    if (linkKeywords.some(kw => lowerText.includes(kw))) {
      return 'link';
    }

    // 菜单项
    const menuKeywords = ['file', 'edit', 'view', 'help', 'tools', 'window', '文件', '编辑', '视图', '帮助', '工具', '窗口'];
    if (menuKeywords.some(kw => lowerText === kw)) {
      return 'menuitem';
    }

    // 默认为文本
    return 'text';
  }

  /**
   * 判断文本是否可交互
   */
  private isTextInteractable(text: string, type: UIElementType): boolean {
    // 按钮、链接、菜单项都是可交互的
    if (['button', 'link', 'menuitem', 'checkbox', 'dropdown', 'tab'].includes(type)) {
      return true;
    }

    // 短文本更可能是可点击的标签
    if (text.length < 20) {
      return true;
    }

    return false;
  }

  /**
   * 检测按钮形状
   * 基于颜色对比度和边缘检测
   */
  private async detectButtonShapes(screenshot: Screenshot): Promise<UIElement[]> {
    // 简化实现: 基于启发式规则
    // 实际应该使用图像处理库分析边缘和颜色
    const elements: UIElement[] = [];

    // 这里可以接入 Sharp 或 Canvas 进行图像分析
    // 当前返回空数组，后续可以扩展

    return elements;
  }

  /**
   * 检测输入框
   */
  private async detectInputFields(screenshot: Screenshot): Promise<UIElement[]> {
    const elements: UIElement[] = [];

    // 简化实现
    // 实际应该检测具有边框的矩形区域

    return elements;
  }

  /**
   * 检测图标
   */
  private async detectIcons(screenshot: Screenshot): Promise<UIElement[]> {
    const elements: UIElement[] = [];

    // 简化实现
    // 实际应该检测小型正方形区域

    return elements;
  }

  /**
   * 分配层级关系
   */
  private assignHierarchy(elements: UIElement[]): void {
    // 按面积降序排序
    const sortedByArea = [...elements].sort((a, b) => {
      const areaA = a.bounds.width * a.bounds.height;
      const areaB = b.bounds.width * b.bounds.height;
      return areaB - areaA;
    });

    // 建立包含关系
    for (const element of elements) {
      element.childIds = [];

      for (const potentialChild of sortedByArea) {
        if (potentialChild.id === element.id) continue;

        // 检查是否包含
        if (this.containsElement(element.bounds, potentialChild.bounds)) {
          if (!potentialChild.parentId) {
            potentialChild.parentId = element.id;
            element.childIds!.push(potentialChild.id);
          }
        }
      }
    }

    // 计算深度
    for (const element of elements) {
      element.depth = this.calculateDepth(element, elements);
    }
  }

  /**
   * 检查边界框是否包含另一个
   */
  private containsElement(outer: BoundingBox, inner: BoundingBox): boolean {
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.width <= outer.x + outer.width &&
      inner.y + inner.height <= outer.y + outer.height
    );
  }

  /**
   * 计算元素深度
   */
  private calculateDepth(
    element: UIElement,
    allElements: UIElement[],
    visited: Set<string> = new Set()
  ): number {
    if (visited.has(element.id)) {
      return 0; // 防止循环
    }
    visited.add(element.id);

    if (!element.parentId) {
      return 0;
    }

    const parent = allElements.find((e) => e.id === element.parentId);
    if (!parent) {
      return 0;
    }

    return 1 + this.calculateDepth(parent, allElements, visited);
  }

  /**
   * 设置 OCR 引擎
   */
  setOCREngine(engine: OCREngine): void {
    this.ocrEngine = engine;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<UIGroundingConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      nms: { ...this.config.nms, ...config.nms },
    };
    this.emit('config:updated', this.config);
  }

  /**
   * 获取配置
   */
  getConfig(): UIGroundingConfig {
    return { ...this.config };
  }
}

/**
 * OCR 引擎接口
 */
export interface OCREngine {
  /**
   * 识别截图中的文本
   */
  recognize(screenshot: Screenshot): Promise<OCRRegion[]>;

  /**
   * 设置语言
   */
  setLanguages?(languages: string[]): void;
}

/**
 * 创建元素检测器
 */
export function createElementDetector(
  config?: Partial<UIGroundingConfig>
): ElementDetector {
  return new ElementDetector(config);
}

/**
 * 默认 OCR 引擎实现 (基于 Tesseract.js)
 * 需要单独安装 tesseract.js
 */
export class TesseractOCREngine implements OCREngine {
  private languages: string[];
  private worker: any = null;

  constructor(languages: string[] = ['eng']) {
    this.languages = languages;
  }

  async recognize(screenshot: Screenshot): Promise<OCRRegion[]> {
    const regions: OCRRegion[] = [];

    try {
      // 动态导入 tesseract.js
      const Tesseract = await import('tesseract.js').catch(() => null);

      if (!Tesseract) {
        console.warn('tesseract.js not installed, OCR disabled');
        return regions;
      }

      // 创建 worker
      if (!this.worker) {
        this.worker = await Tesseract.createWorker(this.languages[0]);
      }

      // 将 Base64 转换为图像数据
      const imageData = `data:image/${screenshot.format};base64,${screenshot.data}`;

      // 执行 OCR
      const result = await this.worker.recognize(imageData);

      // 转换结果
      for (const word of result.data.words) {
        regions.push({
          text: word.text,
          bounds: {
            x: word.bbox.x0,
            y: word.bbox.y0,
            width: word.bbox.x1 - word.bbox.x0,
            height: word.bbox.y1 - word.bbox.y0,
          },
          confidence: word.confidence / 100,
        });
      }
    } catch (error) {
      console.error('OCR error:', error);
    }

    return regions;
  }

  setLanguages(languages: string[]): void {
    this.languages = languages;
    // 重新创建 worker
    this.worker = null;
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

/**
 * 创建 Tesseract OCR 引擎
 */
export function createTesseractOCREngine(
  languages?: string[]
): TesseractOCREngine {
  return new TesseractOCREngine(languages);
}
