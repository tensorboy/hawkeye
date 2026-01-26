/**
 * UI Parser Module - UI 解析模块
 * 提供 UI 元素检测、解析和坐标映射能力
 */

// Types
export type {
  UIElementType,
  BoundingBox,
  UIElement,
  LayoutInfo,
  LayoutRegion,
  ParsedUI,
  UIParseStats,
  ElementMatch,
  ClickTarget,
  UIChange,
  UIDiff,
} from './element-types';

export {
  createBoundingBox,
  isPointInBoundingBox,
  isBoundingBoxOverlap,
  calculateIoU,
  getElementClickPosition,
  isElementInteractable,
  compareElementPosition,
} from './element-types';

// OmniParser Adapter
export {
  OmniParserAdapter,
  getOmniParser,
  setOmniParser,
  type OmniParserConfig,
} from './omniparser-adapter';

// Element Detector
export {
  ElementDetector,
  getElementDetector,
  setElementDetector,
  type DetectionConfig,
  type VisualFeatures,
  type DetectionCandidate,
} from './element-detector';

// Coordinate Mapper
export {
  CoordinateMapper,
  getCoordinateMapper,
  setCoordinateMapper,
  type DisplayInfo,
  type CoordinateMapperConfig,
} from './coordinate-mapper';

// ============ UI Parser Pipeline ============

import { OmniParserAdapter, getOmniParser } from './omniparser-adapter';
import { ElementDetector, getElementDetector } from './element-detector';
import { CoordinateMapper, getCoordinateMapper } from './coordinate-mapper';
import type {
  ParsedUI,
  UIElement,
  ElementMatch,
  ClickTarget,
  UIDiff,
  UIChange,
} from './element-types';

export interface UIParserPipelineConfig {
  /** 启用 OmniParser */
  enableOmniParser: boolean;
  /** 启用视觉检测 */
  enableVisualDetection: boolean;
  /** 启用 OCR 增强 */
  enableOCR: boolean;
  /** 合并阈值 (IoU) */
  mergeThreshold: number;
  /** 缓存解析结果 */
  enableCache: boolean;
  /** 缓存过期时间 (ms) */
  cacheTTL: number;
}

const DEFAULT_PIPELINE_CONFIG: UIParserPipelineConfig = {
  enableOmniParser: true,
  enableVisualDetection: true,
  enableOCR: true,
  mergeThreshold: 0.5,
  enableCache: true,
  cacheTTL: 5000,
};

/**
 * UI 解析管道
 * 整合所有 UI 解析组件，提供统一接口
 */
export class UIParserPipeline {
  private config: UIParserPipelineConfig;
  private omniParser: OmniParserAdapter;
  private elementDetector: ElementDetector;
  private coordinateMapper: CoordinateMapper;

  // 缓存
  private parseCache: Map<string, { result: ParsedUI; timestamp: number }> = new Map();
  private lastParsedUI: ParsedUI | null = null;

  constructor(config: Partial<UIParserPipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this.omniParser = getOmniParser();
    this.elementDetector = getElementDetector();
    this.coordinateMapper = getCoordinateMapper();
  }

  /**
   * 解析截图
   */
  async parse(screenshot: Buffer, ocrText?: string): Promise<ParsedUI> {
    const startTime = Date.now();

    // 检查缓存
    if (this.config.enableCache) {
      const cached = this.getCached(screenshot);
      if (cached) {
        return cached;
      }
    }

    let result: ParsedUI;

    if (this.config.enableOmniParser) {
      // 使用 OmniParser
      result = await this.omniParser.parse(screenshot, ocrText);
    } else if (this.config.enableVisualDetection) {
      // 使用视觉检测
      const elements = await this.elementDetector.detect(screenshot);
      result = this.createParsedUI(elements, screenshot);
    } else {
      // 返回空结果
      result = this.createParsedUI([], screenshot);
    }

    // 更新解析时间
    result.parseTime = Date.now() - startTime;

    // 缓存结果
    if (this.config.enableCache) {
      this.cacheResult(result);
    }

    this.lastParsedUI = result;
    return result;
  }

  /**
   * 查找元素
   */
  async findElement(description: string, parsedUI?: ParsedUI): Promise<ElementMatch | null> {
    const ui = parsedUI || this.lastParsedUI;
    if (!ui) {
      return null;
    }

    return this.omniParser.findElement(description, ui);
  }

  /**
   * 查找所有匹配元素
   */
  async findElements(
    description: string,
    parsedUI?: ParsedUI,
    limit = 10
  ): Promise<ElementMatch[]> {
    const ui = parsedUI || this.lastParsedUI;
    if (!ui) {
      return [];
    }

    const matches: ElementMatch[] = [];
    const lowerDesc = description.toLowerCase();

    for (const element of ui.elements) {
      const score = this.calculateMatchScore(element, lowerDesc);
      if (score > 0.3) {
        matches.push({
          element,
          score,
          matchType: score > 0.9 ? 'exact' : score > 0.6 ? 'partial' : 'semantic',
          reason: 'Text similarity match',
        });
      }
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 获取点击目标
   */
  async getClickTarget(
    element: UIElement,
    strategy: 'safe' | 'center' | 'offset' = 'safe'
  ): Promise<ClickTarget> {
    switch (strategy) {
      case 'center':
        return this.coordinateMapper.getCenterClickPosition(element);
      case 'offset':
        return this.coordinateMapper.getOffsetClickPosition(
          element,
          10, // 默认偏移
          element.bbox.height / 2
        );
      default:
        return this.coordinateMapper.getSafeClickPosition(element);
    }
  }

  /**
   * 比较两个 UI 状态的差异
   */
  diff(before: ParsedUI, after: ParsedUI): UIDiff {
    const changes: UIChange[] = [];
    const beforeIds = new Set(before.elements.map(e => e.id));
    const afterIds = new Set(after.elements.map(e => e.id));

    // 查找添加的元素
    for (const element of after.elements) {
      if (!beforeIds.has(element.id)) {
        // 检查是否是位置变化
        const similar = this.findSimilarElement(element, before.elements);
        if (similar) {
          changes.push({
            type: 'moved',
            elementId: element.id,
            element,
            previousState: {
              bbox: similar.bbox,
            },
            currentState: {
              bbox: element.bbox,
            },
          });
        } else {
          changes.push({
            type: 'added',
            elementId: element.id,
            element,
          });
        }
      }
    }

    // 查找移除的元素
    for (const element of before.elements) {
      if (!afterIds.has(element.id)) {
        const similar = this.findSimilarElement(element, after.elements);
        if (!similar) {
          changes.push({
            type: 'removed',
            elementId: element.id,
            element,
          });
        }
      }
    }

    // 计算统计
    const addedCount = changes.filter(c => c.type === 'added').length;
    const removedCount = changes.filter(c => c.type === 'removed').length;
    const movedCount = changes.filter(c => c.type === 'moved').length;
    const changedCount = changes.filter(c => c.type === 'changed').length;

    // 计算相似度
    const totalBefore = before.elements.length;
    const totalAfter = after.elements.length;
    const similarity = 1 - (addedCount + removedCount) / Math.max(totalBefore, totalAfter, 1);

    return {
      changes,
      addedCount,
      removedCount,
      movedCount,
      changedCount,
      similarity,
    };
  }

  /**
   * 查找相似元素
   */
  private findSimilarElement(target: UIElement, candidates: UIElement[]): UIElement | null {
    for (const candidate of candidates) {
      // 相同类型且文本相似
      if (candidate.type === target.type && candidate.text === target.text) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * 计算匹配分数
   */
  private calculateMatchScore(element: UIElement, query: string): number {
    let score = 0;

    // 精确匹配
    if (element.text?.toLowerCase() === query) {
      return 1.0;
    }
    if (element.label?.toLowerCase() === query) {
      return 0.95;
    }

    // 包含匹配
    if (element.text?.toLowerCase().includes(query)) {
      score = Math.max(score, 0.7);
    }
    if (element.label?.toLowerCase().includes(query)) {
      score = Math.max(score, 0.65);
    }

    // 类型匹配
    if (element.type === query) {
      score = Math.max(score, 0.5);
    }

    return score * element.confidence;
  }

  /**
   * 创建 ParsedUI 对象
   */
  private createParsedUI(elements: UIElement[], screenshot: Buffer): ParsedUI {
    const elementIndex = new Map<string, UIElement>();
    for (const element of elements) {
      elementIndex.set(element.id, element);
    }

    const stats = this.calculateStats(elements);

    return {
      elements,
      elementIndex,
      layout: {
        width: 1920,
        height: 1080,
        scale: 1,
        layoutType: 'desktop',
        regions: [],
      },
      timestamp: Date.now(),
      screenshotHash: this.hashBuffer(screenshot),
      parseTime: 0,
      stats,
    };
  }

  /**
   * 计算统计信息
   */
  private calculateStats(elements: UIElement[]): ParsedUI['stats'] {
    const byType: Record<string, number> = {};
    for (const e of elements) {
      byType[e.type] = (byType[e.type] || 0) + 1;
    }

    return {
      totalElements: elements.length,
      interactableCount: elements.filter(e => e.interactable).length,
      textElementCount: elements.filter(e => e.type === 'text').length,
      buttonCount: byType.button || 0,
      inputCount: byType.input || 0,
      linkCount: byType.link || 0,
      imageCount: byType.image || 0,
      byType: byType as Record<import('./element-types').UIElementType, number>,
    };
  }

  /**
   * 获取缓存的解析结果
   */
  private getCached(screenshot: Buffer): ParsedUI | null {
    const hash = this.hashBuffer(screenshot);
    const cached = this.parseCache.get(hash);

    if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
      return cached.result;
    }

    return null;
  }

  /**
   * 缓存解析结果
   */
  private cacheResult(result: ParsedUI): void {
    this.parseCache.set(result.screenshotHash, {
      result,
      timestamp: Date.now(),
    });

    // 清理过期缓存
    const now = Date.now();
    for (const [hash, entry] of this.parseCache) {
      if (now - entry.timestamp > this.config.cacheTTL) {
        this.parseCache.delete(hash);
      }
    }
  }

  /**
   * 计算 Buffer 哈希
   */
  private hashBuffer(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  }

  /**
   * 获取最后解析的 UI
   */
  getLastParsedUI(): ParsedUI | null {
    return this.lastParsedUI;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.parseCache.clear();
  }

  /**
   * 设置坐标缩放
   */
  setScale(scale: number): void {
    this.coordinateMapper.setScale(scale);
  }
}

// 单例
let globalUIParserPipeline: UIParserPipeline | null = null;

export function getUIParserPipeline(): UIParserPipeline {
  if (!globalUIParserPipeline) {
    globalUIParserPipeline = new UIParserPipeline();
  }
  return globalUIParserPipeline;
}

export function setUIParserPipeline(pipeline: UIParserPipeline): void {
  globalUIParserPipeline = pipeline;
}

export function createUIParserPipeline(
  config?: Partial<UIParserPipelineConfig>
): UIParserPipeline {
  return new UIParserPipeline(config);
}
