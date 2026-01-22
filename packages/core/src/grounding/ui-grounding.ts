/**
 * UI Grounding Pipeline - UI 元素定位管道
 *
 * 从截图中检测 UI 元素，并支持自然语言定位
 * 参考: UI-TARS, OmniParser, ShowUI 等项目
 */

import { EventEmitter } from 'events';
import type {
  UIElement,
  UIElementType,
  BoundingBox,
  Point,
  Screenshot,
  ElementDetectionResult,
  LocateOptions,
  LocateResult,
  UIGroundingConfig,
  ElementRelation,
} from './types';
import { DEFAULT_UI_GROUNDING_CONFIG } from './types';
import {
  ElementDetector,
  createElementDetector,
  OCREngine,
} from './element-detector';
import {
  calculateIoU,
  getBoxCenter,
  calculateCenterDistance,
  containsBox,
  filterByRegion,
} from './nms';

/**
 * 元素匹配分数
 */
interface MatchScore {
  element: UIElement;
  score: number;
  matchType: 'exact' | 'fuzzy' | 'semantic' | 'visual';
  details: string;
}

/**
 * UIGroundingPipeline - UI 元素定位管道
 *
 * 提供完整的 UI 元素检测和定位功能
 */
export class UIGroundingPipeline extends EventEmitter {
  private config: UIGroundingConfig;
  private detector: ElementDetector;
  private cachedElements: UIElement[] = [];
  private cacheTimestamp: number = 0;
  private cacheTimeout: number = 1000; // 1秒缓存

  constructor(config: Partial<UIGroundingConfig> = {}) {
    super();
    this.config = {
      ...DEFAULT_UI_GROUNDING_CONFIG,
      ...config,
      nms: { ...DEFAULT_UI_GROUNDING_CONFIG.nms, ...config.nms },
    };

    this.detector = createElementDetector(this.config);

    // 转发检测器事件
    this.detector.on('detection:complete', (result) => {
      this.emit('detection:complete', result);
    });
    this.detector.on('error', (error) => {
      this.emit('error', error);
    });
  }

  /**
   * 检测截图中的所有 UI 元素
   */
  async detectElements(screenshot: Screenshot): Promise<UIElement[]> {
    const result = await this.detector.detect(screenshot);
    this.cachedElements = result.elements;
    this.cacheTimestamp = Date.now();
    return result.elements;
  }

  /**
   * 获取完整的检测结果
   */
  async detectWithDetails(screenshot: Screenshot): Promise<ElementDetectionResult> {
    const result = await this.detector.detect(screenshot);
    this.cachedElements = result.elements;
    this.cacheTimestamp = Date.now();
    return result;
  }

  /**
   * 通过自然语言描述定位元素
   */
  locateByDescription(
    description: string,
    elements: UIElement[],
    options: LocateOptions = {}
  ): LocateResult {
    const filteredElements = this.filterElements(elements, options);
    const scores = this.scoreElementsByDescription(description, filteredElements);

    // 排序并返回最佳匹配
    scores.sort((a, b) => b.score - a.score);

    const bestMatch = scores.length > 0 && scores[0].score > 0.3 ? scores[0] : null;

    return {
      element: bestMatch?.element ?? null,
      candidates: scores.slice(0, options.limit ?? 5).map((s) => s.element),
      score: bestMatch?.score ?? 0,
      matchMethod: bestMatch?.matchType ?? 'fuzzy',
    };
  }

  /**
   * 通过文本定位元素
   */
  locateByText(
    text: string,
    elements: UIElement[],
    options: LocateOptions = {}
  ): UIElement[] {
    const filteredElements = this.filterElements(elements, options);
    const lowerText = text.toLowerCase();
    const fuzzyMatch = options.fuzzyMatch ?? true;

    const matches = filteredElements.filter((element) => {
      if (!element.text) return false;

      const elementText = element.text.toLowerCase();

      if (fuzzyMatch) {
        // 模糊匹配: 包含或被包含
        return elementText.includes(lowerText) || lowerText.includes(elementText);
      } else {
        // 精确匹配
        return elementText === lowerText;
      }
    });

    // 按相关性排序
    matches.sort((a, b) => {
      const aText = a.text!.toLowerCase();
      const bText = b.text!.toLowerCase();

      // 精确匹配优先
      if (aText === lowerText && bText !== lowerText) return -1;
      if (bText === lowerText && aText !== lowerText) return 1;

      // 较短文本优先 (更精确)
      return aText.length - bText.length;
    });

    return matches.slice(0, options.limit ?? 10);
  }

  /**
   * 通过类型定位元素
   */
  locateByType(
    type: UIElementType,
    elements: UIElement[],
    options: LocateOptions = {}
  ): UIElement[] {
    const filteredElements = this.filterElements(elements, options);
    return filteredElements.filter((e) => e.type === type);
  }

  /**
   * 通过位置定位元素 (相对位置)
   */
  locateByPosition(
    position: 'top' | 'bottom' | 'left' | 'right' | 'center',
    elements: UIElement[],
    referenceElement?: UIElement
  ): UIElement[] {
    if (elements.length === 0) return [];

    // 如果有参考元素，找相对位置
    if (referenceElement) {
      return this.locateRelativeTo(position, referenceElement, elements);
    }

    // 否则按屏幕位置筛选
    const sortedElements = [...elements];

    switch (position) {
      case 'top':
        sortedElements.sort((a, b) => a.bounds.y - b.bounds.y);
        break;
      case 'bottom':
        sortedElements.sort((a, b) => b.bounds.y - a.bounds.y);
        break;
      case 'left':
        sortedElements.sort((a, b) => a.bounds.x - b.bounds.x);
        break;
      case 'right':
        sortedElements.sort((a, b) => b.bounds.x - a.bounds.x);
        break;
      case 'center':
        // 返回最接近中心的元素
        const avgX = elements.reduce((sum, e) => sum + getBoxCenter(e.bounds).x, 0) / elements.length;
        const avgY = elements.reduce((sum, e) => sum + getBoxCenter(e.bounds).y, 0) / elements.length;
        sortedElements.sort((a, b) => {
          const distA = Math.hypot(getBoxCenter(a.bounds).x - avgX, getBoxCenter(a.bounds).y - avgY);
          const distB = Math.hypot(getBoxCenter(b.bounds).x - avgX, getBoxCenter(b.bounds).y - avgY);
          return distA - distB;
        });
        break;
    }

    return sortedElements;
  }

  /**
   * 定位相对于参考元素的元素
   */
  private locateRelativeTo(
    position: 'top' | 'bottom' | 'left' | 'right' | 'center',
    reference: UIElement,
    elements: UIElement[]
  ): UIElement[] {
    const refCenter = getBoxCenter(reference.bounds);
    const results: Array<{ element: UIElement; distance: number }> = [];

    for (const element of elements) {
      if (element.id === reference.id) continue;

      const center = getBoxCenter(element.bounds);
      let isInPosition = false;
      let distance = 0;

      switch (position) {
        case 'top':
          isInPosition = center.y < refCenter.y;
          distance = refCenter.y - center.y;
          break;
        case 'bottom':
          isInPosition = center.y > refCenter.y;
          distance = center.y - refCenter.y;
          break;
        case 'left':
          isInPosition = center.x < refCenter.x;
          distance = refCenter.x - center.x;
          break;
        case 'right':
          isInPosition = center.x > refCenter.x;
          distance = center.x - refCenter.x;
          break;
        case 'center':
          isInPosition = true;
          distance = calculateCenterDistance(reference.bounds, element.bounds);
          break;
      }

      if (isInPosition) {
        results.push({ element, distance });
      }
    }

    // 按距离排序
    results.sort((a, b) => a.distance - b.distance);
    return results.map((r) => r.element);
  }

  /**
   * 获取元素的可点击点
   */
  getClickablePoint(element: UIElement): Point {
    // 默认使用中心点
    const center = getBoxCenter(element.bounds);

    // 对于某些元素类型，可能需要调整点击位置
    if (element.type === 'checkbox') {
      // 复选框点击左侧
      return {
        x: element.bounds.x + element.bounds.height / 2,
        y: center.y,
      };
    }

    return center;
  }

  /**
   * 获取元素关系
   */
  getElementRelations(
    element: UIElement,
    elements: UIElement[]
  ): ElementRelation[] {
    const relations: ElementRelation[] = [];

    for (const other of elements) {
      if (other.id === element.id) continue;

      // 检查包含关系
      if (containsBox(element.bounds, other.bounds)) {
        relations.push({
          sourceId: element.id,
          targetId: other.id,
          type: 'contains',
          strength: 1,
        });
      } else if (containsBox(other.bounds, element.bounds)) {
        relations.push({
          sourceId: element.id,
          targetId: other.id,
          type: 'parent',
          strength: 1,
        });
      }

      // 检查相邻关系
      const distance = calculateCenterDistance(element.bounds, other.bounds);
      const avgSize =
        (element.bounds.width +
          element.bounds.height +
          other.bounds.width +
          other.bounds.height) /
        4;

      if (distance < avgSize * 1.5) {
        // 确定方向
        const dx = getBoxCenter(other.bounds).x - getBoxCenter(element.bounds).x;
        const dy = getBoxCenter(other.bounds).y - getBoxCenter(element.bounds).y;

        let type: ElementRelation['type'];
        if (Math.abs(dx) > Math.abs(dy)) {
          type = dx > 0 ? 'right' : 'left';
        } else {
          type = dy > 0 ? 'below' : 'above';
        }

        relations.push({
          sourceId: element.id,
          targetId: other.id,
          type,
          strength: 1 - distance / (avgSize * 1.5),
        });
      }
    }

    return relations;
  }

  /**
   * 获取缓存的元素
   */
  getCachedElements(): UIElement[] {
    // 检查缓存是否过期
    if (Date.now() - this.cacheTimestamp > this.cacheTimeout) {
      return [];
    }
    return this.cachedElements;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedElements = [];
    this.cacheTimestamp = 0;
  }

  /**
   * 设置 OCR 引擎
   */
  setOCREngine(engine: OCREngine): void {
    this.detector.setOCREngine(engine);
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
    this.detector.updateConfig(this.config);
    this.emit('config:updated', this.config);
  }

  /**
   * 获取配置
   */
  getConfig(): UIGroundingConfig {
    return { ...this.config };
  }

  // ============ 私有方法 ============

  /**
   * 根据选项过滤元素
   */
  private filterElements(
    elements: UIElement[],
    options: LocateOptions
  ): UIElement[] {
    let filtered = [...elements];

    // 按可交互性过滤
    if (options.interactableOnly) {
      filtered = filtered.filter((e) => e.interactable);
    }

    // 按类型过滤
    if (options.types && options.types.length > 0) {
      filtered = filtered.filter((e) => options.types!.includes(e.type));
    }

    // 按置信度过滤
    if (options.minConfidence) {
      filtered = filtered.filter((e) => e.confidence >= options.minConfidence!);
    }

    // 按区域过滤
    if (options.region) {
      filtered = filterByRegion(filtered, options.region);
    }

    return filtered;
  }

  /**
   * 根据描述给元素打分
   */
  private scoreElementsByDescription(
    description: string,
    elements: UIElement[]
  ): MatchScore[] {
    const scores: MatchScore[] = [];
    const lowerDesc = description.toLowerCase();
    const descWords = this.tokenize(lowerDesc);

    for (const element of elements) {
      let score = 0;
      let matchType: 'exact' | 'fuzzy' | 'semantic' | 'visual' = 'fuzzy';
      let details = '';

      // 1. 文本匹配
      if (element.text) {
        const elementText = element.text.toLowerCase();
        const elementWords = this.tokenize(elementText);

        // 精确匹配
        if (elementText === lowerDesc) {
          score = 1.0;
          matchType = 'exact';
          details = 'Exact text match';
        }
        // 包含匹配
        else if (elementText.includes(lowerDesc) || lowerDesc.includes(elementText)) {
          const containScore = Math.min(lowerDesc.length, elementText.length) /
            Math.max(lowerDesc.length, elementText.length);
          score = Math.max(score, containScore * 0.8);
          details = 'Partial text match';
        }
        // 词汇重叠
        else {
          const overlap = descWords.filter((w) => elementWords.includes(w)).length;
          const overlapScore = overlap / Math.max(descWords.length, elementWords.length);
          score = Math.max(score, overlapScore * 0.6);
          details = `Word overlap: ${overlap}`;
        }
      }

      // 2. 类型匹配
      const typeScore = this.scoreTypeMatch(description, element.type);
      if (typeScore > 0) {
        score = Math.max(score, typeScore * 0.5);
        if (!details) details = 'Type match';
      }

      // 3. 语义匹配 (简化版)
      const semanticScore = this.scoreSemanticMatch(description, element);
      if (semanticScore > score) {
        score = semanticScore;
        matchType = 'semantic';
        details = 'Semantic match';
      }

      if (score > 0) {
        scores.push({
          element,
          score,
          matchType,
          details,
        });
      }
    }

    return scores;
  }

  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s\-_.,;:!?'"()\[\]{}]+/)
      .filter((w) => w.length > 0);
  }

  /**
   * 类型匹配分数
   */
  private scoreTypeMatch(description: string, type: UIElementType): number {
    const lowerDesc = description.toLowerCase();

    const typeKeywords: Record<UIElementType, string[]> = {
      button: ['button', 'btn', 'click', 'press', '按钮', '点击'],
      input: ['input', 'text', 'field', 'box', 'enter', '输入', '文本框'],
      link: ['link', 'url', 'href', 'go to', '链接'],
      text: ['text', 'label', 'title', '文本', '标签'],
      icon: ['icon', 'image', 'img', '图标'],
      checkbox: ['checkbox', 'check', 'tick', '复选框', '勾选'],
      dropdown: ['dropdown', 'select', 'combo', '下拉', '选择'],
      menu: ['menu', '菜单'],
      menuitem: ['menu item', 'option', '菜单项'],
      tab: ['tab', '标签页'],
      toolbar: ['toolbar', '工具栏'],
      dialog: ['dialog', 'modal', 'popup', '对话框', '弹窗'],
      listitem: ['list item', 'item', '列表项'],
      scrollbar: ['scrollbar', '滚动条'],
      image: ['image', 'photo', 'picture', '图片', '图像'],
      unknown: [],
    };

    const keywords = typeKeywords[type] || [];
    for (const keyword of keywords) {
      if (lowerDesc.includes(keyword)) {
        return 0.7;
      }
    }

    return 0;
  }

  /**
   * 语义匹配分数
   */
  private scoreSemanticMatch(description: string, element: UIElement): number {
    const lowerDesc = description.toLowerCase();

    // 简化的语义匹配规则
    const semanticRules: Array<{
      patterns: string[];
      types: UIElementType[];
      textPatterns?: string[];
    }> = [
      {
        patterns: ['submit', 'send', 'confirm', 'ok', 'yes', '确定', '提交', '发送'],
        types: ['button'],
        textPatterns: ['submit', 'send', 'ok', 'confirm', '确定', '提交', '发送', '确认'],
      },
      {
        patterns: ['cancel', 'close', 'no', 'dismiss', '取消', '关闭'],
        types: ['button'],
        textPatterns: ['cancel', 'close', 'no', '取消', '关闭'],
      },
      {
        patterns: ['search', 'find', '搜索', '查找'],
        types: ['input', 'button'],
        textPatterns: ['search', 'find', '搜索', '查找'],
      },
      {
        patterns: ['login', 'sign in', '登录'],
        types: ['button', 'link'],
        textPatterns: ['login', 'sign in', '登录'],
      },
      {
        patterns: ['logout', 'sign out', '退出', '登出'],
        types: ['button', 'link'],
        textPatterns: ['logout', 'sign out', '退出', '登出'],
      },
    ];

    for (const rule of semanticRules) {
      const patternMatch = rule.patterns.some((p) => lowerDesc.includes(p));
      if (!patternMatch) continue;

      const typeMatch = rule.types.includes(element.type);
      if (!typeMatch) continue;

      if (rule.textPatterns && element.text) {
        const textMatch = rule.textPatterns.some((p) =>
          element.text!.toLowerCase().includes(p)
        );
        if (textMatch) {
          return 0.85;
        }
      }

      return 0.6;
    }

    return 0;
  }
}

/**
 * 创建 UI Grounding Pipeline
 */
export function createUIGroundingPipeline(
  config?: Partial<UIGroundingConfig>
): UIGroundingPipeline {
  return new UIGroundingPipeline(config);
}

// ============ 单例支持 ============

let globalUIGroundingPipeline: UIGroundingPipeline | null = null;

/**
 * 获取全局 UI Grounding Pipeline 实例
 */
export function getUIGroundingPipeline(): UIGroundingPipeline {
  if (!globalUIGroundingPipeline) {
    globalUIGroundingPipeline = createUIGroundingPipeline();
  }
  return globalUIGroundingPipeline;
}

/**
 * 设置全局 UI Grounding Pipeline 实例
 */
export function setUIGroundingPipeline(pipeline: UIGroundingPipeline): void {
  globalUIGroundingPipeline = pipeline;
}
