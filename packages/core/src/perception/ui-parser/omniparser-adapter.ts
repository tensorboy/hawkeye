/**
 * OmniParser Adapter - OmniParser 适配器
 * 集成 Microsoft OmniParser 进行 UI 元素检测
 * 将截图转换为结构化的 UI 元素
 */

import * as crypto from 'crypto';
import type {
  UIElement,
  ParsedUI,
  LayoutInfo,
  UIParseStats,
  UIElementType,
  BoundingBox,
  ElementMatch,
  ClickTarget,
} from './element-types';
import { createBoundingBox, isElementInteractable, compareElementPosition } from './element-types';

export interface OmniParserConfig {
  /** 是否启用本地模型 */
  useLocalModel: boolean;

  /** API 端点 (远程模式) */
  apiEndpoint?: string;

  /** API Key */
  apiKey?: string;

  /** 最小置信度阈值 */
  minConfidence: number;

  /** 最大元素数量 */
  maxElements: number;

  /** 是否启用 OCR 增强 */
  enableOCR: boolean;

  /** 是否启用语义分析 */
  enableSemantic: boolean;

  /** 超时时间 (ms) */
  timeout: number;
}

const DEFAULT_CONFIG: OmniParserConfig = {
  useLocalModel: true,
  minConfidence: 0.5,
  maxElements: 500,
  enableOCR: true,
  enableSemantic: true,
  timeout: 10000,
};

/**
 * OmniParser 适配器
 * 提供 UI 元素检测和解析能力
 */
export class OmniParserAdapter {
  private config: OmniParserConfig;
  private elementCounter = 0;

  constructor(config: Partial<OmniParserConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 解析截图中的 UI 元素
   */
  async parse(screenshot: Buffer, existingOCR?: string): Promise<ParsedUI> {
    const startTime = Date.now();
    const screenshotHash = this.hashScreenshot(screenshot);

    try {
      // 根据配置选择解析方式
      let elements: UIElement[];

      if (this.config.useLocalModel) {
        elements = await this.parseWithLocalModel(screenshot, existingOCR);
      } else if (this.config.apiEndpoint) {
        elements = await this.parseWithAPI(screenshot);
      } else {
        // 回退到基于启发式的解析
        elements = await this.parseWithHeuristics(screenshot, existingOCR);
      }

      // 过滤低置信度元素
      elements = elements.filter(e => e.confidence >= this.config.minConfidence);

      // 限制元素数量
      if (elements.length > this.config.maxElements) {
        elements = elements
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, this.config.maxElements);
      }

      // 建立元素索引
      const elementIndex = new Map<string, UIElement>();
      for (const element of elements) {
        elementIndex.set(element.id, element);
      }

      // 推断布局信息
      const layout = this.inferLayout(elements, screenshot);

      // 计算统计信息
      const stats = this.calculateStats(elements);

      const parseTime = Date.now() - startTime;

      return {
        elements,
        elementIndex,
        layout,
        timestamp: Date.now(),
        screenshotHash,
        parseTime,
        stats,
      };
    } catch (error) {
      console.error('[OmniParser] Parse error:', error);
      throw error;
    }
  }

  /**
   * 使用本地模型解析 (基于启发式 + OCR)
   */
  private async parseWithLocalModel(
    screenshot: Buffer,
    existingOCR?: string
  ): Promise<UIElement[]> {
    const elements: UIElement[] = [];

    // 从 OCR 结果提取文本元素
    if (existingOCR || this.config.enableOCR) {
      const ocrText = existingOCR || '';
      const textElements = this.extractTextElements(ocrText);
      elements.push(...textElements);
    }

    // 使用视觉启发式检测 UI 控件
    const visualElements = await this.detectVisualElements(screenshot);
    elements.push(...visualElements);

    // 合并重叠元素
    return this.mergeOverlappingElements(elements);
  }

  /**
   * 使用远程 API 解析
   */
  private async parseWithAPI(screenshot: Buffer): Promise<UIElement[]> {
    if (!this.config.apiEndpoint) {
      throw new Error('API endpoint not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
        body: JSON.stringify({
          image: screenshot.toString('base64'),
          options: {
            minConfidence: this.config.minConfidence,
            enableOCR: this.config.enableOCR,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return this.convertAPIResponse(data);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * 使用启发式方法解析
   */
  private async parseWithHeuristics(
    screenshot: Buffer,
    existingOCR?: string
  ): Promise<UIElement[]> {
    const elements: UIElement[] = [];

    // 从 OCR 提取
    if (existingOCR) {
      const textElements = this.extractTextElements(existingOCR);
      elements.push(...textElements);
    }

    return elements;
  }

  /**
   * 从 OCR 结果提取文本元素
   */
  private extractTextElements(ocrText: string): UIElement[] {
    const elements: UIElement[] = [];
    const lines = ocrText.split('\n').filter(line => line.trim());

    // 简单的文本元素提取
    // 实际实现需要 OCR 引擎提供位置信息
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 推断元素类型
      const type = this.inferElementType(trimmed);

      elements.push({
        id: this.generateElementId(),
        type,
        text: trimmed,
        label: trimmed.length < 30 ? trimmed : undefined,
        bbox: createBoundingBox(0, 0, 100, 20), // 占位符，需要实际坐标
        confidence: 0.7,
        interactable: type !== 'text',
        visible: true,
        clickable: type !== 'text',
        editable: type === 'input' || type === 'textarea',
        attributes: {},
        depth: 0,
        source: 'ocr',
      });
    }

    return elements;
  }

  /**
   * 检测视觉元素 (占位符实现)
   */
  private async detectVisualElements(screenshot: Buffer): Promise<UIElement[]> {
    // 这里是占位符实现
    // 实际应该使用图像处理/ML模型检测 UI 控件
    // 例如使用 YOLO、Faster R-CNN 等模型
    return [];
  }

  /**
   * 推断元素类型
   */
  private inferElementType(text: string): UIElementType {
    const lowerText = text.toLowerCase();

    // 按钮关键词
    if (/^(ok|cancel|submit|save|delete|close|open|confirm|yes|no|apply|done)$/i.test(text)) {
      return 'button';
    }

    // 链接模式
    if (/^https?:\/\//.test(text) || /^www\./.test(text)) {
      return 'link';
    }

    // 输入提示
    if (/^(enter|type|input|search|email|password|username)/i.test(text)) {
      return 'input';
    }

    // 标题模式
    if (text.length < 50 && /^[A-Z][^.!?]*$/.test(text)) {
      return 'heading';
    }

    // 菜单项
    if (text.length < 30 && !text.includes(' ')) {
      return 'menuitem';
    }

    return 'text';
  }

  /**
   * 合并重叠元素
   */
  private mergeOverlappingElements(elements: UIElement[]): UIElement[] {
    // 使用非极大值抑制 (NMS) 合并重叠元素
    const sorted = elements.sort((a, b) => b.confidence - a.confidence);
    const kept: UIElement[] = [];
    const suppressed = new Set<string>();

    for (const element of sorted) {
      if (suppressed.has(element.id)) continue;

      kept.push(element);

      // 抑制重叠度高的低置信度元素
      for (const other of sorted) {
        if (other.id === element.id || suppressed.has(other.id)) continue;

        const iou = this.calculateIoU(element.bbox, other.bbox);
        if (iou > 0.5) {
          suppressed.add(other.id);
        }
      }
    }

    return kept;
  }

  /**
   * 计算 IoU
   */
  private calculateIoU(a: BoundingBox, b: BoundingBox): number {
    const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
    const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
    const intersection = xOverlap * yOverlap;

    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    const union = areaA + areaB - intersection;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * 推断布局信息
   */
  private inferLayout(elements: UIElement[], screenshot: Buffer): LayoutInfo {
    // 从截图获取尺寸 (简化实现)
    const width = 1920; // 默认值，实际需要从截图解析
    const height = 1080;

    return {
      width,
      height,
      scale: 1,
      layoutType: this.inferLayoutType(width, height),
      regions: this.detectRegions(elements, width, height),
    };
  }

  /**
   * 推断布局类型
   */
  private inferLayoutType(width: number, height: number): LayoutInfo['layoutType'] {
    const ratio = width / height;

    if (width >= 1200) return 'desktop';
    if (width >= 768) return 'tablet';
    if (ratio < 1) return 'mobile';
    return 'desktop';
  }

  /**
   * 检测布局区域
   */
  private detectRegions(
    elements: UIElement[],
    width: number,
    height: number
  ): LayoutInfo['regions'] {
    const regions: LayoutInfo['regions'] = [];

    // 检测顶部区域 (导航/工具栏)
    const topElements = elements.filter(e => e.bbox.y < height * 0.1);
    if (topElements.length > 0) {
      regions.push({
        type: 'header',
        bbox: createBoundingBox(0, 0, width, height * 0.1),
        elements: topElements.map(e => e.id),
      });
    }

    // 检测左侧边栏
    const leftElements = elements.filter(
      e => e.bbox.x < width * 0.2 && e.bbox.y > height * 0.1
    );
    if (leftElements.length > 3) {
      regions.push({
        type: 'sidebar',
        bbox: createBoundingBox(0, height * 0.1, width * 0.2, height * 0.9),
        elements: leftElements.map(e => e.id),
      });
    }

    // 主内容区域
    const contentElements = elements.filter(
      e => e.bbox.x >= width * 0.2 && e.bbox.y > height * 0.1
    );
    if (contentElements.length > 0) {
      regions.push({
        type: 'content',
        bbox: createBoundingBox(width * 0.2, height * 0.1, width * 0.8, height * 0.9),
        elements: contentElements.map(e => e.id),
      });
    }

    return regions;
  }

  /**
   * 计算统计信息
   */
  private calculateStats(elements: UIElement[]): UIParseStats {
    const byType: Record<UIElementType, number> = {} as Record<UIElementType, number>;

    for (const element of elements) {
      byType[element.type] = (byType[element.type] || 0) + 1;
    }

    return {
      totalElements: elements.length,
      interactableCount: elements.filter(e => e.interactable).length,
      textElementCount: elements.filter(e => e.type === 'text').length,
      buttonCount: byType.button || 0,
      inputCount: byType.input || 0,
      linkCount: byType.link || 0,
      imageCount: byType.image || 0,
      byType,
    };
  }

  /**
   * 转换 API 响应
   */
  private convertAPIResponse(data: unknown): UIElement[] {
    // 根据实际 API 响应格式转换
    if (!Array.isArray(data)) return [];

    return (data as Array<Record<string, unknown>>).map(item => ({
      id: this.generateElementId(),
      type: (item.type as UIElementType) || 'unknown',
      label: item.label as string | undefined,
      text: item.text as string | undefined,
      bbox: createBoundingBox(
        (item.x as number) || 0,
        (item.y as number) || 0,
        (item.width as number) || 0,
        (item.height as number) || 0
      ),
      confidence: (item.confidence as number) || 0.5,
      interactable: (item.interactable as boolean) || false,
      visible: true,
      clickable: (item.clickable as boolean) || false,
      editable: (item.editable as boolean) || false,
      attributes: (item.attributes as Record<string, string>) || {},
      depth: 0,
      source: 'vision' as const,
    }));
  }

  /**
   * 根据描述查找元素
   */
  async findElement(description: string, parsedUI: ParsedUI): Promise<ElementMatch | null> {
    const lowerDesc = description.toLowerCase();
    const matches: ElementMatch[] = [];

    for (const element of parsedUI.elements) {
      let score = 0;
      let matchType: ElementMatch['matchType'] = 'partial';
      let reason = '';

      // 精确文本匹配
      if (element.text?.toLowerCase() === lowerDesc) {
        score = 1.0;
        matchType = 'exact';
        reason = 'Exact text match';
      }
      // 标签匹配
      else if (element.label?.toLowerCase() === lowerDesc) {
        score = 0.95;
        matchType = 'exact';
        reason = 'Exact label match';
      }
      // 部分文本匹配
      else if (element.text?.toLowerCase().includes(lowerDesc)) {
        score = 0.7;
        matchType = 'partial';
        reason = 'Partial text match';
      }
      // 部分标签匹配
      else if (element.label?.toLowerCase().includes(lowerDesc)) {
        score = 0.65;
        matchType = 'partial';
        reason = 'Partial label match';
      }
      // 类型匹配
      else if (element.type === lowerDesc) {
        score = 0.5;
        matchType = 'semantic';
        reason = 'Type match';
      }

      if (score > 0) {
        // 根据置信度调整分数
        score *= element.confidence;

        // 可交互元素加分
        if (element.interactable) {
          score += 0.1;
        }

        matches.push({ element, score, matchType, reason });
      }
    }

    if (matches.length === 0) return null;

    // 返回最高分匹配
    matches.sort((a, b) => b.score - a.score);
    return matches[0];
  }

  /**
   * 获取元素的点击目标
   */
  async getClickTarget(element: UIElement): Promise<ClickTarget> {
    let x = element.bbox.centerX;
    let y = element.bbox.centerY;
    let strategy: ClickTarget['strategy'] = 'center';

    // 对于某些元素类型，使用特殊策略
    switch (element.type) {
      case 'checkbox':
      case 'radio':
        // 点击元素左侧的选择框
        x = element.bbox.x + Math.min(10, element.bbox.width * 0.2);
        strategy = 'offset';
        break;

      case 'input':
      case 'textarea':
        // 点击输入框内部
        x = element.bbox.x + Math.min(20, element.bbox.width * 0.1);
        strategy = 'offset';
        break;

      case 'slider':
        // 点击滑块当前位置
        strategy = 'center';
        break;
    }

    // 确保点击位置在元素边界内
    x = Math.max(element.bbox.x + 2, Math.min(x, element.bbox.right - 2));
    y = Math.max(element.bbox.y + 2, Math.min(y, element.bbox.bottom - 2));

    return { x, y, element, strategy };
  }

  /**
   * 生成元素 ID
   */
  private generateElementId(): string {
    return `ui_${Date.now()}_${this.elementCounter++}`;
  }

  /**
   * 计算截图哈希
   */
  private hashScreenshot(screenshot: Buffer): string {
    return crypto.createHash('sha256').update(screenshot).digest('hex').slice(0, 16);
  }
}

// 单例
let globalOmniParser: OmniParserAdapter | null = null;

export function getOmniParser(): OmniParserAdapter {
  if (!globalOmniParser) {
    globalOmniParser = new OmniParserAdapter();
  }
  return globalOmniParser;
}

export function setOmniParser(parser: OmniParserAdapter): void {
  globalOmniParser = parser;
}
