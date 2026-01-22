/**
 * Windows Control Tree - Windows UI Automation 控制树
 *
 * 参考 UFO (Microsoft) 的设计:
 * - 使用 Windows UI Automation API 获取控制树
 * - 提供确定性的元素定位 (比坐标更可靠)
 * - 支持通过属性搜索元素
 *
 * 核心功能:
 * - 获取窗口控制树结构
 * - 元素属性查询
 * - 元素操作 (点击、输入等)
 * - 与视觉定位的融合
 *
 * 注意: 仅在 Windows 平台可用
 */

import { EventEmitter } from 'events';
import type { BoundingBox, Point } from './types';

// ============ 类型定义 ============

/**
 * 控制类型 (Windows UI Automation Control Types)
 */
export type ControlType =
  | 'Button'
  | 'Calendar'
  | 'CheckBox'
  | 'ComboBox'
  | 'Edit'
  | 'Hyperlink'
  | 'Image'
  | 'ListItem'
  | 'List'
  | 'Menu'
  | 'MenuBar'
  | 'MenuItem'
  | 'ProgressBar'
  | 'RadioButton'
  | 'ScrollBar'
  | 'Slider'
  | 'Spinner'
  | 'StatusBar'
  | 'Tab'
  | 'TabItem'
  | 'Text'
  | 'ToolBar'
  | 'ToolTip'
  | 'Tree'
  | 'TreeItem'
  | 'Custom'
  | 'Group'
  | 'Thumb'
  | 'DataGrid'
  | 'DataItem'
  | 'Document'
  | 'SplitButton'
  | 'Window'
  | 'Pane'
  | 'Header'
  | 'HeaderItem'
  | 'Table'
  | 'TitleBar'
  | 'Separator'
  | 'Unknown';

/**
 * 控制树节点
 */
export interface ControlTreeNode {
  /** 唯一 ID (运行时生成) */
  id: string;
  /** Automation ID */
  automationId?: string;
  /** 控制类型 */
  controlType: ControlType;
  /** 名称 */
  name?: string;
  /** 类名 */
  className?: string;
  /** 边界框 */
  bounds: BoundingBox;
  /** 是否可见 */
  isVisible: boolean;
  /** 是否启用 */
  isEnabled: boolean;
  /** 是否可交互 */
  isInteractive: boolean;
  /** 是否有焦点 */
  hasFocus: boolean;
  /** 值 (对于输入控件) */
  value?: string;
  /** 父节点 ID */
  parentId?: string;
  /** 子节点 ID 列表 */
  childIds: string[];
  /** 深度 */
  depth: number;
  /** 原始句柄 (Windows HWND) */
  nativeHandle?: number;
  /** 附加属性 */
  properties?: Record<string, unknown>;
}

/**
 * 控制树
 */
export interface ControlTree {
  /** 根节点 ID */
  rootId: string;
  /** 所有节点 */
  nodes: Map<string, ControlTreeNode>;
  /** 窗口句柄 */
  windowHandle?: number;
  /** 进程 ID */
  processId?: number;
  /** 应用名称 */
  appName?: string;
  /** 窗口标题 */
  windowTitle?: string;
  /** 捕获时间 */
  capturedAt: number;
}

/**
 * 搜索选项
 */
export interface ControlSearchOptions {
  /** 按 Automation ID 搜索 */
  automationId?: string;
  /** 按名称搜索 (支持正则) */
  name?: string | RegExp;
  /** 按控制类型搜索 */
  controlType?: ControlType | ControlType[];
  /** 按类名搜索 */
  className?: string | RegExp;
  /** 仅搜索可见元素 */
  visibleOnly?: boolean;
  /** 仅搜索可交互元素 */
  interactiveOnly?: boolean;
  /** 最大搜索深度 */
  maxDepth?: number;
  /** 返回第一个匹配 */
  findFirst?: boolean;
}

/**
 * 搜索结果
 */
export interface ControlSearchResult {
  /** 匹配的节点 */
  node: ControlTreeNode;
  /** 匹配分数 */
  score: number;
  /** 匹配的条件 */
  matchedCriteria: string[];
}

/**
 * 元素操作类型
 */
export type ControlAction =
  | 'click'
  | 'doubleClick'
  | 'rightClick'
  | 'focus'
  | 'setValue'
  | 'getValue'
  | 'expand'
  | 'collapse'
  | 'select'
  | 'invoke'
  | 'scroll';

/**
 * 操作参数
 */
export interface ControlActionParams {
  /** 操作类型 */
  action: ControlAction;
  /** 目标节点 ID */
  nodeId: string;
  /** 值 (对于 setValue) */
  value?: string;
  /** 滚动参数 */
  scrollParams?: {
    direction: 'up' | 'down' | 'left' | 'right';
    amount: number;
  };
}

/**
 * 操作结果
 */
export interface ControlActionResult {
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 返回值 (对于 getValue) */
  value?: string;
  /** 执行时间 (ms) */
  duration: number;
}

/**
 * 配置
 */
export interface WindowsControlTreeConfig {
  /** 最大缓存控制树数量 */
  maxCachedTrees: number;
  /** 缓存过期时间 (ms) */
  cacheExpiry: number;
  /** 默认搜索深度 */
  defaultMaxDepth: number;
  /** 是否启用属性缓存 */
  enablePropertyCache: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: WindowsControlTreeConfig = {
  maxCachedTrees: 10,
  cacheExpiry: 5000,
  defaultMaxDepth: 20,
  enablePropertyCache: true,
};

// ============ Windows Control Tree Manager ============

/**
 * WindowsControlTree - Windows 控制树管理器
 *
 * 提供 Windows UI Automation 控制树的访问和操作能力
 *
 * 注意: 实际的 Windows UI Automation 调用需要 native 模块支持
 * 这里提供接口定义和模拟实现，真实实现需要:
 * - node-ffi-napi 调用 UIAutomationCore.dll
 * - 或者使用 PowerShell/C# 桥接
 * - 或者使用 pywinauto 通过子进程
 */
export class WindowsControlTree extends EventEmitter {
  private config: WindowsControlTreeConfig;
  private treeCache: Map<string, { tree: ControlTree; timestamp: number }> = new Map();
  private isWindows: boolean;

  constructor(config: Partial<WindowsControlTreeConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isWindows = process.platform === 'win32';
  }

  /**
   * 检查是否支持 Windows Control Tree
   */
  isSupported(): boolean {
    return this.isWindows;
  }

  /**
   * 获取窗口的控制树
   */
  async getControlTree(
    windowHandle?: number,
    options: { refresh?: boolean; maxDepth?: number } = {}
  ): Promise<ControlTree | null> {
    if (!this.isWindows) {
      console.warn('[WindowsControlTree] Not supported on this platform');
      return null;
    }

    const { refresh = false, maxDepth = this.config.defaultMaxDepth } = options;
    const cacheKey = windowHandle ? `hwnd_${windowHandle}` : 'active';

    // 检查缓存
    if (!refresh) {
      const cached = this.treeCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheExpiry) {
        return cached.tree;
      }
    }

    try {
      // 实际实现需要调用 Windows UI Automation API
      // 这里提供模拟实现
      const tree = await this.captureControlTree(windowHandle, maxDepth);

      // 缓存
      this.treeCache.set(cacheKey, { tree, timestamp: Date.now() });

      // 清理过期缓存
      this.cleanupCache();

      this.emit('tree:captured', { windowHandle, nodeCount: tree.nodes.size });
      return tree;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
      return null;
    }
  }

  /**
   * 在控制树中搜索元素
   */
  search(tree: ControlTree, options: ControlSearchOptions): ControlSearchResult[] {
    const results: ControlSearchResult[] = [];
    const {
      automationId,
      name,
      controlType,
      className,
      visibleOnly = true,
      interactiveOnly = false,
      maxDepth = this.config.defaultMaxDepth,
      findFirst = false,
    } = options;

    const controlTypes = controlType
      ? Array.isArray(controlType)
        ? controlType
        : [controlType]
      : null;

    // BFS 搜索
    const queue: { nodeId: string; depth: number }[] = [{ nodeId: tree.rootId, depth: 0 }];

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      if (depth > maxDepth) continue;

      const node = tree.nodes.get(nodeId);
      if (!node) continue;

      // 检查过滤条件
      if (visibleOnly && !node.isVisible) continue;
      if (interactiveOnly && !node.isInteractive) continue;

      // 计算匹配分数
      const { score, matchedCriteria } = this.calculateMatchScore(node, {
        automationId,
        name,
        controlTypes,
        className,
      });

      if (score > 0) {
        results.push({ node, score, matchedCriteria });
        if (findFirst) {
          return results;
        }
      }

      // 添加子节点到队列
      for (const childId of node.childIds) {
        queue.push({ nodeId: childId, depth: depth + 1 });
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * 通过名称快速查找
   */
  findByName(tree: ControlTree, name: string | RegExp): ControlTreeNode | null {
    const results = this.search(tree, { name, findFirst: true });
    return results.length > 0 ? results[0].node : null;
  }

  /**
   * 通过 Automation ID 快速查找
   */
  findByAutomationId(tree: ControlTree, automationId: string): ControlTreeNode | null {
    const results = this.search(tree, { automationId, findFirst: true });
    return results.length > 0 ? results[0].node : null;
  }

  /**
   * 通过控制类型查找所有
   */
  findAllByType(tree: ControlTree, controlType: ControlType | ControlType[]): ControlTreeNode[] {
    const results = this.search(tree, { controlType });
    return results.map((r) => r.node);
  }

  /**
   * 获取节点的可点击中心点
   */
  getClickablePoint(node: ControlTreeNode): Point {
    return {
      x: node.bounds.x + node.bounds.width / 2,
      y: node.bounds.y + node.bounds.height / 2,
    };
  }

  /**
   * 执行控件操作
   */
  async executeAction(
    tree: ControlTree,
    params: ControlActionParams
  ): Promise<ControlActionResult> {
    const startTime = Date.now();

    if (!this.isWindows) {
      return {
        success: false,
        error: 'Windows Control Tree not supported on this platform',
        duration: Date.now() - startTime,
      };
    }

    const node = tree.nodes.get(params.nodeId);
    if (!node) {
      return {
        success: false,
        error: `Node not found: ${params.nodeId}`,
        duration: Date.now() - startTime,
      };
    }

    try {
      // 实际实现需要调用 Windows UI Automation API
      // 这里提供模拟实现
      const result = await this.performAction(node, params);
      this.emit('action:executed', { nodeId: params.nodeId, action: params.action, success: result.success });
      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        error: err.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 将控制树节点映射到 UI 元素 (用于与视觉定位融合)
   */
  mapToUIElement(node: ControlTreeNode): {
    id: string;
    type: string;
    text?: string;
    bounds: BoundingBox;
    center: Point;
    interactable: boolean;
  } {
    return {
      id: node.id,
      type: this.mapControlTypeToUIType(node.controlType),
      text: node.name || node.value,
      bounds: node.bounds,
      center: this.getClickablePoint(node),
      interactable: node.isInteractive,
    };
  }

  /**
   * 融合视觉定位和控制树定位
   */
  fuseWithVisualGrounding(
    tree: ControlTree,
    visualElements: Array<{ text?: string; bounds: BoundingBox; type?: string }>
  ): Array<{
    visual: (typeof visualElements)[0];
    control: ControlTreeNode | null;
    confidence: number;
  }> {
    const results: Array<{
      visual: (typeof visualElements)[0];
      control: ControlTreeNode | null;
      confidence: number;
    }> = [];

    for (const visual of visualElements) {
      let bestMatch: ControlTreeNode | null = null;
      let bestConfidence = 0;

      for (const [, node] of tree.nodes) {
        if (!node.isVisible) continue;

        // 计算边界框重叠度
        const overlap = this.calculateOverlap(visual.bounds, node.bounds);
        if (overlap < 0.3) continue;

        // 计算文本相似度
        const textSim = visual.text && node.name
          ? this.textSimilarity(visual.text, node.name)
          : 0;

        // 综合置信度
        const confidence = overlap * 0.6 + textSim * 0.4;

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = node;
        }
      }

      results.push({ visual, control: bestMatch, confidence: bestConfidence });
    }

    return results;
  }

  /**
   * 获取控制树统计信息
   */
  getTreeStats(tree: ControlTree): {
    totalNodes: number;
    visibleNodes: number;
    interactiveNodes: number;
    maxDepth: number;
    byType: Record<string, number>;
  } {
    let maxDepth = 0;
    let visibleCount = 0;
    let interactiveCount = 0;
    const byType: Record<string, number> = {};

    for (const [, node] of tree.nodes) {
      if (node.depth > maxDepth) maxDepth = node.depth;
      if (node.isVisible) visibleCount++;
      if (node.isInteractive) interactiveCount++;
      byType[node.controlType] = (byType[node.controlType] || 0) + 1;
    }

    return {
      totalNodes: tree.nodes.size,
      visibleNodes: visibleCount,
      interactiveNodes: interactiveCount,
      maxDepth,
      byType,
    };
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.treeCache.clear();
  }

  // ============ 私有方法 ============

  /**
   * 捕获控制树 (需要实际的 Windows API 调用)
   */
  private async captureControlTree(
    _windowHandle?: number,
    maxDepth: number = 20
  ): Promise<ControlTree> {
    // 这是模拟实现
    // 真实实现需要:
    // 1. 使用 node-ffi-napi 调用 UIAutomationCore.dll
    // 2. 或者通过 PowerShell 脚本获取控制树
    // 3. 或者使用 Python pywinauto 通过子进程

    const nodes = new Map<string, ControlTreeNode>();
    const rootId = 'root_0';

    // 创建一个模拟的根节点
    const rootNode: ControlTreeNode = {
      id: rootId,
      controlType: 'Window',
      name: 'Mock Window',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      isVisible: true,
      isEnabled: true,
      isInteractive: true,
      hasFocus: true,
      childIds: [],
      depth: 0,
    };

    nodes.set(rootId, rootNode);

    // 在实际实现中，这里会递归遍历 UI Automation 树

    return {
      rootId,
      nodes,
      windowHandle: _windowHandle,
      appName: 'MockApp',
      windowTitle: 'Mock Window',
      capturedAt: Date.now(),
    };
  }

  /**
   * 执行控件操作 (需要实际的 Windows API 调用)
   */
  private async performAction(
    _node: ControlTreeNode,
    params: ControlActionParams
  ): Promise<Omit<ControlActionResult, 'duration'>> {
    // 这是模拟实现
    // 真实实现需要调用相应的 UI Automation Pattern

    switch (params.action) {
      case 'click':
      case 'doubleClick':
      case 'rightClick':
      case 'focus':
      case 'invoke':
        return { success: true };

      case 'setValue':
        return { success: true };

      case 'getValue':
        return { success: true, value: _node.value };

      case 'expand':
      case 'collapse':
      case 'select':
      case 'scroll':
        return { success: true };

      default:
        return { success: false, error: `Unknown action: ${params.action}` };
    }
  }

  private calculateMatchScore(
    node: ControlTreeNode,
    criteria: {
      automationId?: string;
      name?: string | RegExp;
      controlTypes?: ControlType[] | null;
      className?: string | RegExp;
    }
  ): { score: number; matchedCriteria: string[] } {
    let score = 0;
    const matchedCriteria: string[] = [];

    // Automation ID 匹配 (最高权重)
    if (criteria.automationId && node.automationId === criteria.automationId) {
      score += 1.0;
      matchedCriteria.push('automationId');
    }

    // 名称匹配
    if (criteria.name && node.name) {
      if (criteria.name instanceof RegExp) {
        if (criteria.name.test(node.name)) {
          score += 0.8;
          matchedCriteria.push('name');
        }
      } else if (node.name.toLowerCase().includes(criteria.name.toLowerCase())) {
        score += 0.8;
        matchedCriteria.push('name');
      }
    }

    // 控制类型匹配
    if (criteria.controlTypes && criteria.controlTypes.includes(node.controlType)) {
      score += 0.3;
      matchedCriteria.push('controlType');
    }

    // 类名匹配
    if (criteria.className && node.className) {
      if (criteria.className instanceof RegExp) {
        if (criteria.className.test(node.className)) {
          score += 0.5;
          matchedCriteria.push('className');
        }
      } else if (node.className.includes(criteria.className)) {
        score += 0.5;
        matchedCriteria.push('className');
      }
    }

    return { score, matchedCriteria };
  }

  private calculateOverlap(a: BoundingBox, b: BoundingBox): number {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);

    if (x2 < x1 || y2 < y1) return 0;

    const intersection = (x2 - x1) * (y2 - y1);
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    const union = areaA + areaB - intersection;

    return union > 0 ? intersection / union : 0;
  }

  private textSimilarity(a: string, b: string): number {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();

    if (aLower === bLower) return 1;
    if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8;

    // 简单的 Jaccard 相似度
    const aWords = new Set(aLower.split(/\s+/));
    const bWords = new Set(bLower.split(/\s+/));
    const intersection = new Set([...aWords].filter((x) => bWords.has(x)));
    const union = new Set([...aWords, ...bWords]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private mapControlTypeToUIType(controlType: ControlType): string {
    const mapping: Partial<Record<ControlType, string>> = {
      Button: 'button',
      CheckBox: 'checkbox',
      RadioButton: 'radio',
      Edit: 'input',
      ComboBox: 'dropdown',
      ListItem: 'list_item',
      MenuItem: 'menu_item',
      Hyperlink: 'link',
      Image: 'image',
      Text: 'text',
      Tab: 'tab',
      TabItem: 'tab_item',
      Tree: 'tree',
      TreeItem: 'tree_item',
      Table: 'table',
      DataGrid: 'grid',
    };

    return mapping[controlType] || 'unknown';
  }

  private cleanupCache(): void {
    if (this.treeCache.size <= this.config.maxCachedTrees) return;

    const now = Date.now();
    const entries = Array.from(this.treeCache.entries());

    // 按时间戳排序，删除最旧的
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toDelete = entries.slice(0, entries.length - this.config.maxCachedTrees);
    for (const [key] of toDelete) {
      this.treeCache.delete(key);
    }
  }
}

// ============ 单例支持 ============

let globalWindowsControlTree: WindowsControlTree | null = null;

export function getWindowsControlTree(): WindowsControlTree {
  if (!globalWindowsControlTree) {
    globalWindowsControlTree = new WindowsControlTree();
  }
  return globalWindowsControlTree;
}

export function createWindowsControlTree(
  config?: Partial<WindowsControlTreeConfig>
): WindowsControlTree {
  return new WindowsControlTree(config);
}

export function setWindowsControlTree(tree: WindowsControlTree): void {
  globalWindowsControlTree = tree;
}
