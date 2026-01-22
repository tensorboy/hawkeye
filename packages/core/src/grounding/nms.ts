/**
 * NMS (Non-Maximum Suppression) - 非极大值抑制
 *
 * 用于从多个重叠的检测框中选择最佳的一个
 * 参考: UI-TARS, OmniParser 等项目的 NMS 实现
 */

import type { BoundingBox, UIElement, NMSConfig } from './types';

/**
 * 计算两个边界框的 IoU (Intersection over Union)
 */
export function calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
  // 计算交集区域
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

  // 如果没有交集
  if (x2 <= x1 || y2 <= y1) {
    return 0;
  }

  const intersectionArea = (x2 - x1) * (y2 - y1);

  // 计算并集区域
  const area1 = box1.width * box1.height;
  const area2 = box2.width * box2.height;
  const unionArea = area1 + area2 - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

/**
 * 计算边界框面积
 */
export function calculateArea(box: BoundingBox): number {
  return box.width * box.height;
}

/**
 * 计算边界框中心点
 */
export function getBoxCenter(box: BoundingBox): { x: number; y: number } {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

/**
 * 计算两个中心点之间的距离
 */
export function calculateCenterDistance(box1: BoundingBox, box2: BoundingBox): number {
  const center1 = getBoxCenter(box1);
  const center2 = getBoxCenter(box2);
  return Math.sqrt(Math.pow(center1.x - center2.x, 2) + Math.pow(center1.y - center2.y, 2));
}

/**
 * 检查一个边界框是否包含另一个
 */
export function containsBox(outer: BoundingBox, inner: BoundingBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * 合并两个边界框
 */
export function mergeBoxes(box1: BoundingBox, box2: BoundingBox): BoundingBox {
  const x = Math.min(box1.x, box2.x);
  const y = Math.min(box1.y, box2.y);
  const x2 = Math.max(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.max(box1.y + box1.height, box2.y + box2.height);

  return {
    x,
    y,
    width: x2 - x,
    height: y2 - y,
  };
}

/**
 * 标准 NMS 算法
 * 从重叠的检测结果中选择最佳的一个
 */
export function applyNMS(elements: UIElement[], config: NMSConfig): UIElement[] {
  if (elements.length === 0) {
    return [];
  }

  // 按置信度降序排序
  const sorted = [...elements].sort((a, b) => b.confidence - a.confidence);

  // 过滤低置信度的元素
  const filtered = sorted.filter((e) => e.confidence >= config.confidenceThreshold);

  const selected: UIElement[] = [];
  const suppressed = new Set<string>();

  for (const element of filtered) {
    if (suppressed.has(element.id)) {
      continue;
    }

    // 如果达到最大检测数，停止
    if (config.maxDetections && selected.length >= config.maxDetections) {
      break;
    }

    selected.push(element);

    // 抑制与当前元素 IoU 超过阈值的其他元素
    for (const other of filtered) {
      if (other.id !== element.id && !suppressed.has(other.id)) {
        const iou = calculateIoU(element.bounds, other.bounds);
        if (iou > config.iouThreshold) {
          suppressed.add(other.id);
        }
      }
    }
  }

  return selected;
}

/**
 * Soft-NMS 算法
 * 不是直接移除重叠元素，而是降低其置信度
 * 参考: Soft-NMS -- Improving Object Detection With One Line of Code
 */
export function applySoftNMS(
  elements: UIElement[],
  config: NMSConfig,
  sigma: number = 0.5
): UIElement[] {
  if (elements.length === 0) {
    return [];
  }

  // 复制元素数组，避免修改原数组
  const results = elements.map((e) => ({ ...e }));

  // 过滤低置信度的元素
  let remaining = results.filter((e) => e.confidence >= config.confidenceThreshold);

  const selected: UIElement[] = [];

  while (remaining.length > 0 && (!config.maxDetections || selected.length < config.maxDetections)) {
    // 找到置信度最高的元素
    let maxIdx = 0;
    let maxConf = remaining[0].confidence;
    for (let i = 1; i < remaining.length; i++) {
      if (remaining[i].confidence > maxConf) {
        maxConf = remaining[i].confidence;
        maxIdx = i;
      }
    }

    const current = remaining[maxIdx];
    selected.push(current);

    // 从剩余列表中移除
    remaining.splice(maxIdx, 1);

    // 降低重叠元素的置信度 (Gaussian penalty)
    remaining = remaining
      .map((element) => {
        const iou = calculateIoU(current.bounds, element.bounds);
        // Gaussian decay: score = score * exp(-iou^2 / sigma)
        const weight = Math.exp(-(iou * iou) / sigma);
        return {
          ...element,
          confidence: element.confidence * weight,
        };
      })
      .filter((e) => e.confidence >= config.confidenceThreshold);
  }

  return selected;
}

/**
 * 类别感知 NMS
 * 只抑制同一类别内的重叠元素
 */
export function applyCategoryAwareNMS(elements: UIElement[], config: NMSConfig): UIElement[] {
  if (elements.length === 0) {
    return [];
  }

  // 按类型分组
  const byType = new Map<string, UIElement[]>();
  for (const element of elements) {
    const type = element.type;
    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type)!.push(element);
  }

  // 对每个类别单独应用 NMS
  const results: UIElement[] = [];
  for (const typeElements of byType.values()) {
    const nmsResults = applyNMS(typeElements, config);
    results.push(...nmsResults);
  }

  // 按位置排序 (从上到下，从左到右)
  return results.sort((a, b) => {
    const yDiff = a.bounds.y - b.bounds.y;
    if (Math.abs(yDiff) > 10) {
      return yDiff;
    }
    return a.bounds.x - b.bounds.x;
  });
}

/**
 * 层级 NMS
 * 考虑元素的包含关系，保留父元素和子元素
 */
export function applyHierarchicalNMS(elements: UIElement[], config: NMSConfig): UIElement[] {
  if (elements.length === 0) {
    return [];
  }

  // 按面积降序排序 (大元素优先)
  const sorted = [...elements].sort(
    (a, b) => calculateArea(b.bounds) - calculateArea(a.bounds)
  );

  // 过滤低置信度的元素
  const filtered = sorted.filter((e) => e.confidence >= config.confidenceThreshold);

  const selected: UIElement[] = [];

  for (const element of filtered) {
    if (config.maxDetections && selected.length >= config.maxDetections) {
      break;
    }

    // 检查是否与已选元素有高重叠（但不是包含关系）
    let shouldAdd = true;

    for (const existing of selected) {
      const iou = calculateIoU(element.bounds, existing.bounds);

      // 如果 IoU 很高，但不是包含关系，则抑制
      if (iou > config.iouThreshold) {
        const isContained = containsBox(existing.bounds, element.bounds);
        const isContainer = containsBox(element.bounds, existing.bounds);

        // 如果不是包含关系，则抑制
        if (!isContained && !isContainer) {
          shouldAdd = false;
          break;
        }
      }
    }

    if (shouldAdd) {
      selected.push(element);
    }
  }

  return selected;
}

/**
 * 去除完全重复的元素
 */
export function removeDuplicates(
  elements: UIElement[],
  tolerance: number = 5
): UIElement[] {
  const unique: UIElement[] = [];

  for (const element of elements) {
    const isDuplicate = unique.some((existing) => {
      return (
        Math.abs(existing.bounds.x - element.bounds.x) <= tolerance &&
        Math.abs(existing.bounds.y - element.bounds.y) <= tolerance &&
        Math.abs(existing.bounds.width - element.bounds.width) <= tolerance &&
        Math.abs(existing.bounds.height - element.bounds.height) <= tolerance
      );
    });

    if (!isDuplicate) {
      unique.push(element);
    }
  }

  return unique;
}

/**
 * 按区域筛选元素
 */
export function filterByRegion(
  elements: UIElement[],
  region: BoundingBox
): UIElement[] {
  return elements.filter((element) => {
    const center = getBoxCenter(element.bounds);
    return (
      center.x >= region.x &&
      center.x <= region.x + region.width &&
      center.y >= region.y &&
      center.y <= region.y + region.height
    );
  });
}

/**
 * NMS 处理器类
 */
export class NMSProcessor {
  private config: NMSConfig;

  constructor(config: Partial<NMSConfig> = {}) {
    this.config = {
      iouThreshold: config.iouThreshold ?? 0.5,
      confidenceThreshold: config.confidenceThreshold ?? 0.3,
      maxDetections: config.maxDetections,
    };
  }

  /**
   * 应用标准 NMS
   */
  apply(elements: UIElement[]): UIElement[] {
    return applyNMS(elements, this.config);
  }

  /**
   * 应用 Soft-NMS
   */
  applySoft(elements: UIElement[], sigma?: number): UIElement[] {
    return applySoftNMS(elements, this.config, sigma);
  }

  /**
   * 应用类别感知 NMS
   */
  applyCategoryAware(elements: UIElement[]): UIElement[] {
    return applyCategoryAwareNMS(elements, this.config);
  }

  /**
   * 应用层级 NMS
   */
  applyHierarchical(elements: UIElement[]): UIElement[] {
    return applyHierarchicalNMS(elements, this.config);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<NMSConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * 创建 NMS 处理器
 */
export function createNMSProcessor(config?: Partial<NMSConfig>): NMSProcessor {
  return new NMSProcessor(config);
}
