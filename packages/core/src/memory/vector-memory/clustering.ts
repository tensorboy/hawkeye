/**
 * Dynamic Memory Clustering - 动态记忆聚类
 * 基于 memU-experiment 的自动聚类系统
 *
 * 功能：
 * - 自动发现记忆主题/类别
 * - 无需预定义类别
 * - 支持增量聚类
 */

import type { IAIProvider, AIMessage } from '../../ai/types';
import type { MemoryItem, MemoryCluster, MemoryCategory } from './types';
import { calculateSimilarity, batchCosineSimilarity } from './memory-linking';

// ============ 配置 ============

export interface ClusteringConfig {
  /** 发现新聚类的最小条目数 */
  minItemsForCluster: number;
  /** 聚类相似度阈值 */
  clusterThreshold: number;
  /** 最大聚类数量 */
  maxClusters: number;
  /** 使用 LLM 命名聚类 */
  useLLMNaming: boolean;
}

export const DEFAULT_CLUSTERING_CONFIG: ClusteringConfig = {
  minItemsForCluster: 3,
  clusterThreshold: 0.5,
  maxClusters: 20,
  useLLMNaming: true,
};

// ============ Prompts ============

const CLUSTER_DETECTION_PROMPT = `You are analyzing memory items to discover new thematic clusters.

Existing clusters: {existingClusters}

New memory items:
{newMemoryItems}

Recent conversation context:
{conversationContext}

Identify NEW clusters that are:
1. Important events (marriage, job promotion, graduation, etc.)
2. Recurring activities (going to gym, attending support groups, etc.)
3. Significant relationships or topics

**Rules:**
- Do NOT suggest clusters that already exist
- Each cluster name should be 1-3 words, lowercase, using underscores (e.g., "hiking_trips")
- Only suggest clusters with at least {minItems} supporting items

**Output format:**
CLUSTER: [cluster_name]
DESCRIPTION: [Brief description of what this cluster represents]
ITEMS: [comma-separated list of item indices that belong here]

---
`;

const CLUSTER_NAMING_PROMPT = `Given these memory items that share a common theme, provide a concise name for this cluster.

Items:
{items}

The name should be:
- 1-3 words
- Lowercase with underscores (e.g., "hiking_trips", "work_projects")
- Descriptive of the common theme

CLUSTER_NAME:`;

// ============ 主要函数 ============

/**
 * 检测新的记忆聚类
 *
 * @param newMemoryItems - 新添加的记忆项
 * @param existingClusters - 已存在的聚类名称
 * @param conversationContext - 对话上下文
 * @param llmProvider - LLM 提供者
 * @param config - 配置选项
 * @returns 新发现的聚类列表
 */
export async function detectNewClusters(
  newMemoryItems: MemoryItem[],
  existingClusters: string[],
  conversationContext: string,
  llmProvider: IAIProvider,
  config: Partial<ClusteringConfig> = {}
): Promise<MemoryCluster[]> {
  const fullConfig = { ...DEFAULT_CLUSTERING_CONFIG, ...config };

  if (newMemoryItems.length < fullConfig.minItemsForCluster) {
    return [];
  }

  try {
    const itemsText = newMemoryItems
      .map((item, idx) => `${idx}. ${item.summary}`)
      .join('\n');

    const prompt = CLUSTER_DETECTION_PROMPT
      .replace('{existingClusters}', existingClusters.join(', ') || 'None')
      .replace('{newMemoryItems}', itemsText)
      .replace('{conversationContext}', conversationContext)
      .replace('{minItems}', String(fullConfig.minItemsForCluster));

    const messages: AIMessage[] = [{ role: 'user', content: prompt }];
    const response = await llmProvider.chat(messages);

    return parseClusters(response.text, newMemoryItems);
  } catch (error) {
    console.warn('[Clustering] Detection failed:', error);
    return [];
  }
}

/**
 * 基于 embedding 的快速聚类 (不使用 LLM)
 * 使用简单的 k-means 变体
 *
 * @param items - 记忆项列表
 * @param config - 配置选项
 * @returns 聚类结果
 */
export function clusterByEmbedding(
  items: MemoryItem[],
  config: Partial<ClusteringConfig> = {}
): Map<number, MemoryItem[]> {
  const fullConfig = { ...DEFAULT_CLUSTERING_CONFIG, ...config };
  const clusters = new Map<number, MemoryItem[]>();

  // 过滤有 embedding 的项
  const validItems = items.filter((item) => item.embedding);
  if (validItems.length === 0) return clusters;

  // 简单的层次聚类
  const assigned = new Set<string>();
  let clusterId = 0;

  for (const item of validItems) {
    if (assigned.has(item.id)) continue;

    // 找出与当前项相似的所有项
    const clusterItems: MemoryItem[] = [item];
    assigned.add(item.id);

    for (const other of validItems) {
      if (assigned.has(other.id)) continue;

      const similarity = calculateSimilarity(
        item.embedding!,
        other.embedding!,
        'cosine'
      );

      if (similarity >= fullConfig.clusterThreshold) {
        clusterItems.push(other);
        assigned.add(other.id);
      }
    }

    // 只保留达到最小数量的聚类
    if (clusterItems.length >= fullConfig.minItemsForCluster) {
      clusters.set(clusterId++, clusterItems);
    }

    if (clusters.size >= fullConfig.maxClusters) break;
  }

  return clusters;
}

/**
 * 为聚类生成名称
 *
 * @param clusterItems - 聚类中的记忆项
 * @param llmProvider - LLM 提供者
 * @returns 聚类名称
 */
export async function generateClusterName(
  clusterItems: MemoryItem[],
  llmProvider: IAIProvider
): Promise<string> {
  try {
    const itemsText = clusterItems
      .slice(0, 5) // 只用前5个
      .map((item) => `- ${item.summary}`)
      .join('\n');

    const prompt = CLUSTER_NAMING_PROMPT.replace('{items}', itemsText);
    const messages: AIMessage[] = [{ role: 'user', content: prompt }];
    const response = await llmProvider.chat(messages);

    const name = response.text
      .replace('CLUSTER_NAME:', '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    return name || 'unnamed_cluster';
  } catch (error) {
    console.warn('[Clustering] Naming failed:', error);
    return `cluster_${Date.now()}`;
  }
}

/**
 * 为聚类生成简单名称 (不使用 LLM)
 * 基于关键词提取
 *
 * @param clusterItems - 聚类中的记忆项
 * @returns 聚类名称
 */
export function generateClusterNameSimple(clusterItems: MemoryItem[]): string {
  // 合并所有摘要
  const allText = clusterItems.map((item) => item.summary).join(' ');

  // 简单的词频统计
  const words = allText
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter((w) => !STOP_WORDS.has(w));

  const wordCount = new Map<string, number>();
  for (const word of words) {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  }

  // 找出最常见的词
  const sorted = Array.from(wordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  if (sorted.length === 0) {
    return `cluster_${Date.now()}`;
  }

  return sorted.map(([word]) => word).join('_');
}

/**
 * 将记忆项分配到最合适的聚类
 *
 * @param item - 待分配的记忆项
 * @param clusters - 现有聚类列表
 * @param config - 配置选项
 * @returns 最佳匹配的聚类 ID，或 null 如果没有匹配
 */
export function assignToCluster(
  item: MemoryItem,
  clusters: MemoryCluster[],
  config: Partial<ClusteringConfig> = {}
): string | null {
  const fullConfig = { ...DEFAULT_CLUSTERING_CONFIG, ...config };

  if (!item.embedding) return null;

  let bestMatch: { clusterId: string; similarity: number } | null = null;

  for (const cluster of clusters) {
    if (!cluster.centroidEmbedding) continue;

    const similarity = calculateSimilarity(
      item.embedding,
      cluster.centroidEmbedding,
      'cosine'
    );

    if (similarity >= fullConfig.clusterThreshold) {
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { clusterId: cluster.id, similarity };
      }
    }
  }

  return bestMatch?.clusterId || null;
}

/**
 * 更新聚类质心
 *
 * @param cluster - 聚类
 * @param items - 聚类中的所有记忆项
 * @returns 更新后的聚类
 */
export function updateClusterCentroid(
  cluster: MemoryCluster,
  items: MemoryItem[]
): MemoryCluster {
  const validItems = items.filter((item) => item.embedding);

  if (validItems.length === 0) {
    return cluster;
  }

  // 计算平均 embedding
  const dimensions = validItems[0].embedding!.length;
  const centroid = new Array(dimensions).fill(0);

  for (const item of validItems) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += item.embedding![i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= validItems.length;
  }

  // 归一化 (skip if norm is effectively zero — means embeddings cancelled out)
  const norm = Math.sqrt(centroid.reduce((sum, v) => sum + v * v, 0));
  if (norm > 1e-10) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] /= norm;
    }
  } else {
    // Degenerate case: keep existing centroid if available
    if (cluster.centroidEmbedding) {
      return { ...cluster, itemIds: validItems.map((item) => item.id), updatedAt: Date.now() };
    }
  }

  return {
    ...cluster,
    centroidEmbedding: centroid,
    itemIds: validItems.map((item) => item.id),
    updatedAt: Date.now(),
  };
}

/**
 * 将聚类转换为记忆类别
 *
 * @param cluster - 聚类
 * @returns 记忆类别
 */
export function clusterToCategory(cluster: MemoryCluster): MemoryCategory {
  return {
    id: `cat_${cluster.id}`,
    name: cluster.name,
    description: cluster.description,
    embedding: cluster.centroidEmbedding,
    itemCount: cluster.itemIds.length,
    createdAt: cluster.createdAt,
    updatedAt: cluster.updatedAt,
  };
}

// ============ 辅助函数 ============

function parseClusters(
  response: string,
  items: MemoryItem[]
): MemoryCluster[] {
  const clusters: MemoryCluster[] = [];
  const blocks = response.split(/---+/);

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim());

    let name = '';
    let description = '';
    let itemIndices: number[] = [];

    for (const line of lines) {
      if (line.startsWith('CLUSTER:')) {
        name = line.replace('CLUSTER:', '').trim().toLowerCase().replace(/\s+/g, '_');
      } else if (line.startsWith('DESCRIPTION:')) {
        description = line.replace('DESCRIPTION:', '').trim();
      } else if (line.startsWith('ITEMS:')) {
        const indices = line
          .replace('ITEMS:', '')
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
        itemIndices = indices;
      }
    }

    if (name && itemIndices.length > 0) {
      const clusterItems = itemIndices
        .filter((idx) => idx >= 0 && idx < items.length)
        .map((idx) => items[idx]);

      clusters.push({
        id: `cluster_${Date.now()}_${name}`,
        name,
        description,
        itemIds: clusterItems.map((item) => item.id),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  return clusters;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'this', 'that', 'these', 'those', 'user', 'they', 'them', 'their',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'about', 'into', 'through', 'during', 'before', 'after', 'above',
]);
