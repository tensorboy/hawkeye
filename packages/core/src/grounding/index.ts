/**
 * Grounding Module - UI 元素定位模块
 *
 * 提供从截图中检测和定位 UI 元素的能力
 *
 * 核心组件：
 * - UIGroundingPipeline: 主要的 UI 定位管道
 * - ElementDetector: 元素检测器 (OCR + 视觉)
 * - NMS: 非极大值抑制算法
 *
 * 使用示例:
 * ```typescript
 * import { createUIGroundingPipeline, UIElement } from './grounding';
 *
 * const pipeline = createUIGroundingPipeline();
 *
 * // 检测截图中的元素
 * const elements = await pipeline.detectElements(screenshot);
 *
 * // 通过描述定位元素
 * const result = pipeline.locateByDescription('submit button', elements);
 *
 * // 通过文本定位元素
 * const buttons = pipeline.locateByText('OK', elements);
 *
 * // 获取可点击点
 * const point = pipeline.getClickablePoint(result.element);
 * ```
 */

// 类型导出
export * from './types';

// NMS 算法
export {
  calculateIoU,
  calculateArea,
  getBoxCenter,
  calculateCenterDistance,
  containsBox,
  mergeBoxes,
  applyNMS,
  applySoftNMS,
  applyCategoryAwareNMS,
  applyHierarchicalNMS,
  removeDuplicates,
  filterByRegion,
  NMSProcessor,
  createNMSProcessor,
} from './nms';

// 元素检测器
export {
  ElementDetector,
  createElementDetector,
  TesseractOCREngine,
  createTesseractOCREngine,
  type OCREngine,
} from './element-detector';

// UI Grounding Pipeline
export {
  UIGroundingPipeline,
  createUIGroundingPipeline,
  getUIGroundingPipeline,
  setUIGroundingPipeline,
} from './ui-grounding';

// 坐标持久化 (参考 Self-Operating Computer)
export {
  CoordinatePersistence,
  createCoordinatePersistence,
  getCoordinatePersistence,
  setCoordinatePersistence,
  type CoordinateHash,
  type CoordinateLookupOptions,
  type CoordinatePersistenceConfig,
} from './coordinate-persistence';

// Windows Control Tree (参考 UFO)
export {
  WindowsControlTree,
  createWindowsControlTree,
  getWindowsControlTree,
  setWindowsControlTree,
  type ControlType,
  type ControlTreeNode,
  type ControlTree,
  type ControlSearchOptions,
  type ControlSearchResult,
  type ControlAction,
  type ControlActionParams,
  type ControlActionResult,
  type WindowsControlTreeConfig,
} from './windows-control-tree';
