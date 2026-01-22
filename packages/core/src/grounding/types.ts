/**
 * UI Grounding Types - UI 元素定位类型定义
 *
 * 用于 UI 元素检测、定位和交互
 */

/**
 * 边界框 (Bounding Box)
 */
export interface BoundingBox {
  /** 左上角 X 坐标 */
  x: number;
  /** 左上角 Y 坐标 */
  y: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/**
 * 点坐标
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * UI 元素类型
 */
export type UIElementType =
  | 'button'
  | 'input'
  | 'link'
  | 'text'
  | 'icon'
  | 'checkbox'
  | 'dropdown'
  | 'menu'
  | 'menuitem'
  | 'tab'
  | 'toolbar'
  | 'dialog'
  | 'listitem'
  | 'scrollbar'
  | 'image'
  | 'unknown';

/**
 * 检测到的 UI 元素
 */
export interface UIElement {
  /** 元素唯一 ID */
  id: string;
  /** 元素类型 */
  type: UIElementType;
  /** 边界框 */
  bounds: BoundingBox;
  /** 元素文本 (如果有) */
  text?: string;
  /** 检测置信度 (0-1) */
  confidence: number;
  /** 是否可交互 */
  interactable: boolean;
  /** 元素层级深度 */
  depth?: number;
  /** 父元素 ID */
  parentId?: string;
  /** 子元素 ID 列表 */
  childIds?: string[];
  /** 元素属性 */
  attributes?: Record<string, string>;
  /** OCR 检测的文本区域 */
  ocrRegions?: OCRRegion[];
  /** 元素截图 (Base64) */
  thumbnail?: string;
}

/**
 * OCR 检测区域
 */
export interface OCRRegion {
  /** 区域文本 */
  text: string;
  /** 边界框 */
  bounds: BoundingBox;
  /** 置信度 */
  confidence: number;
  /** 语言 */
  language?: string;
}

/**
 * 截图数据
 */
export interface Screenshot {
  /** 图像数据 (Base64) */
  data: string;
  /** 图像宽度 */
  width: number;
  /** 图像高度 */
  height: number;
  /** 格式 */
  format: 'png' | 'jpeg' | 'webp';
  /** 截图时间戳 */
  timestamp: number;
  /** 显示器 ID */
  displayId?: string;
  /** 缩放比例 */
  scale?: number;
}

/**
 * 元素检测结果
 */
export interface ElementDetectionResult {
  /** 检测到的元素列表 */
  elements: UIElement[];
  /** 检测耗时 (ms) */
  duration: number;
  /** 截图信息 */
  screenshot: {
    width: number;
    height: number;
    timestamp: number;
  };
  /** 检测方法 */
  method: 'ocr' | 'visual' | 'hybrid' | 'accessibility';
}

/**
 * 定位查询选项
 */
export interface LocateOptions {
  /** 是否只返回可交互元素 */
  interactableOnly?: boolean;
  /** 元素类型过滤 */
  types?: UIElementType[];
  /** 最小置信度 */
  minConfidence?: number;
  /** 限制返回数量 */
  limit?: number;
  /** 搜索区域 */
  region?: BoundingBox;
  /** 是否模糊匹配文本 */
  fuzzyMatch?: boolean;
}

/**
 * 定位结果
 */
export interface LocateResult {
  /** 找到的元素 */
  element: UIElement | null;
  /** 所有候选元素 */
  candidates: UIElement[];
  /** 匹配分数 */
  score: number;
  /** 匹配方法 */
  matchMethod: 'exact' | 'fuzzy' | 'semantic' | 'visual';
}

/**
 * NMS (非极大值抑制) 配置
 */
export interface NMSConfig {
  /** IOU 阈值 */
  iouThreshold: number;
  /** 置信度阈值 */
  confidenceThreshold: number;
  /** 最大保留数量 */
  maxDetections?: number;
}

/**
 * UI Grounding 配置
 */
export interface UIGroundingConfig {
  /** 是否启用 OCR */
  enableOCR: boolean;
  /** 是否启用视觉检测 */
  enableVisualDetection: boolean;
  /** OCR 语言 */
  ocrLanguages: string[];
  /** 最小元素大小 */
  minElementSize: { width: number; height: number };
  /** 最大检测元素数 */
  maxElements: number;
  /** NMS 配置 */
  nms: NMSConfig;
  /** 元素检测模型 (可选，用于更高级的检测) */
  detectionModel?: string;
  /** 是否生成缩略图 */
  generateThumbnails: boolean;
  /** 缩略图大小 */
  thumbnailSize: { width: number; height: number };
}

/**
 * 默认 UI Grounding 配置
 */
export const DEFAULT_UI_GROUNDING_CONFIG: UIGroundingConfig = {
  enableOCR: true,
  enableVisualDetection: true,
  ocrLanguages: ['en', 'zh'],
  minElementSize: { width: 10, height: 10 },
  maxElements: 500,
  nms: {
    iouThreshold: 0.5,
    confidenceThreshold: 0.3,
    maxDetections: 200,
  },
  generateThumbnails: false,
  thumbnailSize: { width: 64, height: 64 },
};

/**
 * 元素匹配器接口
 */
export interface ElementMatcher {
  /** 匹配分数 (0-1) */
  score: number;
  /** 匹配描述 */
  description: string;
}

/**
 * 元素树节点
 */
export interface ElementTreeNode {
  element: UIElement;
  children: ElementTreeNode[];
  parent?: ElementTreeNode;
}

/**
 * 元素关系
 */
export interface ElementRelation {
  /** 源元素 ID */
  sourceId: string;
  /** 目标元素 ID */
  targetId: string;
  /** 关系类型 */
  type: 'parent' | 'child' | 'sibling' | 'contains' | 'near' | 'above' | 'below' | 'left' | 'right';
  /** 关系强度 */
  strength: number;
}
