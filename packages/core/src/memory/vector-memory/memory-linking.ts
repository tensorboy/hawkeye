/**
 * Memory Linking - 记忆关联系统
 * 基于 memU-experiment 的记忆链接算法
 *
 * 功能：
 * - 基于 embedding 相似度发现相关记忆
 * - 跨类别的语义链接
 * - 构建记忆知识图谱
 */

import type { MemoryItem, MemoryCategory } from './types';

// ============ 配置 ============

export interface MemoryLinkingConfig {
  /** 最大关联数量 */
  maxLinks: number;
  /** 最小相似度阈值 (0-1) */
  minSimilarity: number;
  /** 是否启用跨类别链接 */
  crossCategoryLinking: boolean;
  /** 相似度算法 */
  similarityAlgorithm: 'cosine' | 'euclidean';
}

export const DEFAULT_LINKING_CONFIG: MemoryLinkingConfig = {
  maxLinks: 5,
  minSimilarity: 0.3,
  crossCategoryLinking: true,
  similarityAlgorithm: 'cosine',
};

// ============ 类型 ============

export interface LinkedMemory extends MemoryItem {
  relatedIds: string[];
}

export interface MemoryLink {
  sourceId: string;
  targetId: string;
  similarity: number;
  linkType: 'semantic' | 'temporal' | 'explicit';
}

export interface RelatedMemoryResult {
  memoryId: string;
  content: string;
  category?: string;
  similarity: number;
}

// ============ 主要函数 ============

/**
 * 查找与目标记忆项相关的其他记忆
 *
 * @param targetItem - 目标记忆项
 * @param candidateItems - 候选记忆项列表
 * @param config - 配置选项
 * @returns 相关记忆列表
 *
 * @example
 * ```typescript
 * const related = findRelatedMemories(
 *   targetItem,
 *   allItems,
 *   { maxLinks: 5, minSimilarity: 0.4 }
 * );
 * // [{ memoryId: 'xxx', similarity: 0.85, ... }, ...]
 * ```
 */
export function findRelatedMemories(
  targetItem: MemoryItem,
  candidateItems: MemoryItem[],
  config: Partial<MemoryLinkingConfig> = {}
): RelatedMemoryResult[] {
  const fullConfig = { ...DEFAULT_LINKING_CONFIG, ...config };

  if (!targetItem.embedding) {
    return [];
  }

  const results: RelatedMemoryResult[] = [];

  for (const candidate of candidateItems) {
    // 排除自身
    if (candidate.id === targetItem.id) continue;

    // 需要有 embedding
    if (!candidate.embedding) continue;

    const similarity = calculateSimilarity(
      targetItem.embedding,
      candidate.embedding,
      fullConfig.similarityAlgorithm
    );

    if (similarity >= fullConfig.minSimilarity) {
      results.push({
        memoryId: candidate.id,
        content: candidate.summary,
        similarity,
      });
    }
  }

  // 按相似度排序并限制数量
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, fullConfig.maxLinks);
}

/**
 * 跨类别查找相关记忆
 *
 * @param targetEmbedding - 目标 embedding
 * @param categories - 类别列表 (包含各自的记忆项)
 * @param excludeId - 要排除的记忆 ID
 * @param config - 配置选项
 * @returns 带类别信息的相关记忆
 */
export function findRelatedAcrossCategories(
  targetEmbedding: number[],
  categories: Map<string, MemoryItem[]>,
  excludeId: string,
  config: Partial<MemoryLinkingConfig> = {}
): RelatedMemoryResult[] {
  const fullConfig = { ...DEFAULT_LINKING_CONFIG, ...config };
  const results: RelatedMemoryResult[] = [];

  for (const [categoryName, items] of categories) {
    for (const item of items) {
      if (item.id === excludeId || !item.embedding) continue;

      const similarity = calculateSimilarity(
        targetEmbedding,
        item.embedding,
        fullConfig.similarityAlgorithm
      );

      if (similarity >= fullConfig.minSimilarity) {
        results.push({
          memoryId: item.id,
          content: item.summary,
          category: categoryName,
          similarity,
        });
      }
    }
  }

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, fullConfig.maxLinks);
}

/**
 * 为记忆项添加关联链接
 *
 * @param item - 要处理的记忆项
 * @param allItems - 所有候选记忆项
 * @param config - 配置选项
 * @returns 带关联的记忆项
 */
export function linkMemoryItem(
  item: MemoryItem,
  allItems: MemoryItem[],
  config: Partial<MemoryLinkingConfig> = {}
): LinkedMemory {
  const related = findRelatedMemories(item, allItems, config);

  return {
    ...item,
    relatedIds: related.map((r) => r.memoryId),
  };
}

/**
 * 为单条新增记忆建立关联（增量方式，避免全量 O(n²)）
 *
 * @param newItem - 新增的记忆项
 * @param existingItems - 已有记忆项列表
 * @param config - 配置选项
 * @returns 新记忆与已有记忆之间的链接
 */
export function linkNewMemory(
  newItem: MemoryItem,
  existingItems: MemoryItem[],
  config: Partial<MemoryLinkingConfig> = {}
): MemoryLink[] {
  const fullConfig = { ...DEFAULT_LINKING_CONFIG, ...config };
  if (!newItem.embedding) return [];

  const links: MemoryLink[] = [];
  for (const existing of existingItems) {
    if (existing.id === newItem.id || !existing.embedding) continue;

    const similarity = calculateSimilarity(
      newItem.embedding,
      existing.embedding,
      fullConfig.similarityAlgorithm
    );

    if (similarity >= fullConfig.minSimilarity) {
      links.push({
        sourceId: newItem.id,
        targetId: existing.id,
        similarity,
        linkType: 'semantic',
      });
    }
  }

  return links
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, fullConfig.maxLinks);
}

/**
 * 批量为所有记忆项添加关联
 * 注意：O(n²) 复杂度，大数据集请使用 linkNewMemory 增量方式
 *
 * @param items - 记忆项列表
 * @param config - 配置选项
 * @returns 带关联的记忆项列表
 */
export function linkAllMemories(
  items: MemoryItem[],
  config: Partial<MemoryLinkingConfig> = {}
): LinkedMemory[] {
  if (items.length > 1000) {
    console.warn(`[MemoryLinking] linkAllMemories called with ${items.length} items (O(n²)). Consider using linkNewMemory for incremental linking.`);
  }
  return items.map((item) => linkMemoryItem(item, items, config));
}

/**
 * 构建记忆关联图
 *
 * @param items - 记忆项列表
 * @param config - 配置选项
 * @returns 记忆链接列表
 */
export function buildMemoryGraph(
  items: MemoryItem[],
  config: Partial<MemoryLinkingConfig> = {}
): MemoryLink[] {
  const fullConfig = { ...DEFAULT_LINKING_CONFIG, ...config };
  const links: MemoryLink[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const source = items[i];
    if (!source.embedding) continue;

    for (let j = i + 1; j < items.length; j++) {
      const target = items[j];
      if (!target.embedding) continue;

      const pairKey = [source.id, target.id].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const similarity = calculateSimilarity(
        source.embedding,
        target.embedding,
        fullConfig.similarityAlgorithm
      );

      if (similarity >= fullConfig.minSimilarity) {
        links.push({
          sourceId: source.id,
          targetId: target.id,
          similarity,
          linkType: 'semantic',
        });
      }
    }
  }

  // 按相似度排序
  return links.sort((a, b) => b.similarity - a.similarity);
}

/**
 * 从已有关联中获取 N 度关联
 * 例如：获取"朋友的朋友"
 *
 * @param startId - 起始记忆 ID
 * @param links - 记忆链接列表
 * @param degree - 关联度数 (1 = 直接关联, 2 = 二度关联)
 * @returns 关联的记忆 ID 列表
 */
export function getLinkedMemories(
  startId: string,
  links: MemoryLink[],
  degree: number = 1
): Set<string> {
  const result = new Set<string>();
  let currentLevel = new Set([startId]);

  for (let d = 0; d < degree; d++) {
    const nextLevel = new Set<string>();

    for (const link of links) {
      if (currentLevel.has(link.sourceId) && !result.has(link.targetId) && link.targetId !== startId) {
        nextLevel.add(link.targetId);
        result.add(link.targetId);
      }
      if (currentLevel.has(link.targetId) && !result.has(link.sourceId) && link.sourceId !== startId) {
        nextLevel.add(link.sourceId);
        result.add(link.sourceId);
      }
    }

    currentLevel = nextLevel;
    if (currentLevel.size === 0) break;
  }

  return result;
}

/**
 * 格式化记忆项的关联信息
 * 用于存储格式: [content] [ref1,ref2,ref3]
 *
 * @param item - 带关联的记忆项
 * @returns 格式化字符串
 */
export function formatLinkedMemory(item: LinkedMemory): string {
  const relatedStr = item.relatedIds.length > 0
    ? ` [${item.relatedIds.join(',')}]`
    : '';
  return `[${item.refId || item.id.slice(0, 6)}][mentioned at ${new Date(item.updatedAt).toISOString().split('T')[0]}] ${item.summary}${relatedStr}`;
}

// ============ 相似度计算 ============

/**
 * 计算两个向量的相似度
 */
export function calculateSimilarity(
  vec1: number[],
  vec2: number[],
  algorithm: 'cosine' | 'euclidean' = 'cosine'
): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same dimensions');
  }

  if (algorithm === 'cosine') {
    return cosineSimilarity(vec1, vec2);
  } else {
    return euclideanSimilarity(vec1, vec2);
  }
}

/**
 * 余弦相似度
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * 欧氏距离转相似度 (归一化到 0-1)
 */
function euclideanSimilarity(vec1: number[], vec2: number[]): number {
  let sumSquares = 0;

  for (let i = 0; i < vec1.length; i++) {
    const diff = vec1[i] - vec2[i];
    sumSquares += diff * diff;
  }

  const distance = Math.sqrt(sumSquares);
  // 将距离转换为相似度 (使用 sigmoid-like 转换)
  return 1 / (1 + distance);
}

/**
 * 批量计算与目标向量的相似度
 * 使用向量化计算优化性能
 */
export function batchCosineSimilarity(
  queryVec: number[],
  corpus: Array<{ id: string; embedding: number[] }>,
  topK: number
): Array<{ id: string; similarity: number }> {
  const results = corpus.map((item) => ({
    id: item.id,
    similarity: cosineSimilarity(queryVec, item.embedding),
  }));

  // 使用部分排序 (O(n) for small k)
  return partialSort(results, topK, (a, b) => b.similarity - a.similarity);
}

/**
 * 部分排序 - 只找出前 K 个元素
 * 比完整排序更高效 (O(n) vs O(n log n))
 */
function partialSort<T>(
  arr: T[],
  k: number,
  compareFn: (a: T, b: T) => number
): T[] {
  if (k >= arr.length) {
    return arr.slice().sort(compareFn);
  }

  // 使用堆或简单的选择算法
  const result = arr.slice(0, k).sort(compareFn);

  for (let i = k; i < arr.length; i++) {
    const item = arr[i];
    // 检查是否应该插入
    if (compareFn(item, result[k - 1]) < 0) {
      // 找到插入位置
      let insertIdx = k - 1;
      while (insertIdx > 0 && compareFn(item, result[insertIdx - 1]) < 0) {
        insertIdx--;
      }
      // 插入并移除最后一个
      result.splice(insertIdx, 0, item);
      result.pop();
    }
  }

  return result;
}
