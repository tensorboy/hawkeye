/**
 * Memory Deduplication - 记忆去重系统
 * 基于 memU 的 CRUD 操作和去重合并
 *
 * 功能：
 * - 检测重复记忆
 * - 合并相似记忆
 * - 更新过时信息
 * - 维护记忆一致性
 */

import type { IAIProvider, AIMessage } from '../../ai/types';
import type { MemoryItem, MemoryOperation } from './types';
import { calculateSimilarity } from './memory-linking';

// ============ 配置 ============

export interface DeduplicationConfig {
  /** 判定为重复的相似度阈值 */
  duplicateThreshold: number;
  /** 判定为相似（可合并）的阈值 */
  mergeThreshold: number;
  /** 使用 LLM 进行语义去重 */
  useLLMDedup: boolean;
  /** 最大批处理大小 */
  batchSize: number;
}

export const DEFAULT_DEDUP_CONFIG: DeduplicationConfig = {
  duplicateThreshold: 0.95,
  mergeThreshold: 0.75,
  useLLMDedup: false,
  batchSize: 50,
};

// ============ Prompts ============

const DEDUP_ANALYSIS_PROMPT = `You are analyzing memory items for duplicates and potential merges.

Memory Items:
{items}

Instructions:
1. Identify EXACT duplicates (same information, different wording)
2. Identify items that should be MERGED (related information that can be combined)
3. Identify items that should be UPDATED (newer information supersedes older)

Output format:
DUPLICATES: [comma-separated pairs like "id1=id2, id3=id4"]
MERGE: [groups like "id1+id2+id3 -> merged content"]
UPDATE: [pairs like "id1 -> updated content (supersedes id2)"]
KEEP: [ids to keep unchanged]`;

const MERGE_ITEMS_PROMPT = `Merge these related memory items into a single, comprehensive item:

Items to merge:
{items}

Requirements:
1. Preserve all unique information
2. Remove redundancy
3. Keep under 30 words
4. Make it self-contained

Merged item:`;

// ============ 主要函数 ============

/**
 * 检测重复的记忆项
 *
 * @param items - 待检查的记忆项列表
 * @param config - 配置选项
 * @returns 重复对列表 [[id1, id2], ...]
 */
export function detectDuplicates(
  items: MemoryItem[],
  config: Partial<DeduplicationConfig> = {}
): [string, string][] {
  const fullConfig = { ...DEFAULT_DEDUP_CONFIG, ...config };
  const duplicates: [string, string][] = [];
  const checked = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item1 = items[i];
    if (!item1.embedding) continue;

    for (let j = i + 1; j < items.length; j++) {
      const item2 = items[j];
      if (!item2.embedding) continue;

      const pairKey = `${item1.id}|${item2.id}`;
      if (checked.has(pairKey)) continue;
      checked.add(pairKey);

      const similarity = calculateSimilarity(
        item1.embedding,
        item2.embedding,
        'cosine'
      );

      if (similarity >= fullConfig.duplicateThreshold) {
        duplicates.push([item1.id, item2.id]);
      }
    }
  }

  return duplicates;
}

/**
 * 检测可合并的记忆项
 *
 * @param items - 待检查的记忆项列表
 * @param config - 配置选项
 * @returns 可合并的组列表 [[id1, id2, id3], ...]
 */
export function detectMergeable(
  items: MemoryItem[],
  config: Partial<DeduplicationConfig> = {}
): string[][] {
  const fullConfig = { ...DEFAULT_DEDUP_CONFIG, ...config };
  const groups: string[][] = [];
  const assigned = new Set<string>();

  for (const item of items) {
    if (assigned.has(item.id) || !item.embedding) continue;

    const group: string[] = [item.id];
    assigned.add(item.id);

    for (const other of items) {
      if (assigned.has(other.id) || !other.embedding) continue;

      const similarity = calculateSimilarity(
        item.embedding,
        other.embedding,
        'cosine'
      );

      if (
        similarity >= fullConfig.mergeThreshold &&
        similarity < fullConfig.duplicateThreshold
      ) {
        group.push(other.id);
        assigned.add(other.id);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  return groups;
}

/**
 * 合并记忆项 (简单版 - 不使用 LLM)
 *
 * @param items - 待合并的记忆项
 * @returns 合并后的记忆项
 */
export function mergeItemsSimple(items: MemoryItem[]): Partial<MemoryItem> {
  if (items.length === 0) return {};
  if (items.length === 1) return items[0];

  // 取最新的作为基础
  const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
  const base = sorted[0];

  // 合并内容 (简单拼接去重)
  const allWords = new Set<string>();
  const contents: string[] = [];

  for (const item of sorted) {
    const words = item.summary.toLowerCase().split(/\s+/);
    const uniqueContent = words.filter((w) => !allWords.has(w));

    if (uniqueContent.length > 0) {
      contents.push(item.summary);
      words.forEach((w) => allWords.add(w));
    }
  }

  // 取最短的作为合并结果（通常是最精炼的）
  const mergedSummary = contents.length > 0
    ? contents.reduce((a, b) => (a.length <= b.length ? a : b))
    : base.summary;

  // 合并关联
  const relatedIds = [...new Set(items.flatMap((item) => item.relatedIds || []))];

  return {
    ...base,
    summary: mergedSummary,
    relatedIds: relatedIds.length > 0 ? relatedIds : undefined,
    updatedAt: Date.now(),
  };
}

/**
 * 使用 LLM 合并记忆项
 *
 * @param items - 待合并的记忆项
 * @param llmProvider - LLM 提供者
 * @returns 合并后的内容
 */
export async function mergeItemsWithLLM(
  items: MemoryItem[],
  llmProvider: IAIProvider
): Promise<string> {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0].summary;

  const itemsText = items
    .map((item, idx) => `${idx + 1}. ${item.summary}`)
    .join('\n');

  const prompt = MERGE_ITEMS_PROMPT.replace('{items}', itemsText);
  const messages: AIMessage[] = [{ role: 'user', content: prompt }];
  const response = await llmProvider.chat(messages);

  return response.text.trim();
}

/**
 * 生成去重操作列表
 *
 * @param items - 记忆项列表
 * @param config - 配置选项
 * @returns 建议的操作列表
 */
export function generateDeduplicationOps(
  items: MemoryItem[],
  config: Partial<DeduplicationConfig> = {}
): MemoryOperation[] {
  const ops: MemoryOperation[] = [];

  // 检测重复
  const duplicates = detectDuplicates(items, config);
  for (const [id1, id2] of duplicates) {
    const item1 = items.find((i) => i.id === id1);
    const item2 = items.find((i) => i.id === id2);
    if (!item1 || !item2) continue;

    // 保留较新的，删除较旧的
    if (item1.updatedAt >= item2.updatedAt) {
      ops.push({ type: 'DELETE', targetId: id2 });
      ops.push({ type: 'TOUCH', targetId: id1, timestamp: Date.now() });
    } else {
      ops.push({ type: 'DELETE', targetId: id1 });
      ops.push({ type: 'TOUCH', targetId: id2, timestamp: Date.now() });
    }
  }

  // 检测可合并项
  const mergeable = detectMergeable(items, config);
  for (const group of mergeable) {
    const groupItems = group
      .map((id) => items.find((i) => i.id === id))
      .filter((i): i is MemoryItem => !!i);

    if (groupItems.length < 2) continue;

    const merged = mergeItemsSimple(groupItems);
    const keepId = groupItems[0].id;

    // 更新第一个，删除其余
    ops.push({ type: 'UPDATE', targetId: keepId, item: merged });
    for (let i = 1; i < group.length; i++) {
      ops.push({ type: 'DELETE', targetId: group[i] });
    }
  }

  return ops;
}

/**
 * 执行去重操作
 *
 * @param items - 原始记忆项列表
 * @param ops - 操作列表
 * @returns 处理后的记忆项列表
 */
export function executeDeduplicationOps(
  items: MemoryItem[],
  ops: MemoryOperation[]
): MemoryItem[] {
  const itemMap = new Map(items.map((i) => [i.id, { ...i }]));

  for (const op of ops) {
    switch (op.type) {
      case 'DELETE':
        if (op.targetId) {
          itemMap.delete(op.targetId);
        }
        break;

      case 'UPDATE':
        if (op.targetId && op.item) {
          const existing = itemMap.get(op.targetId);
          if (existing) {
            itemMap.set(op.targetId, { ...existing, ...op.item });
          }
        }
        break;

      case 'TOUCH':
        if (op.targetId) {
          const existing = itemMap.get(op.targetId);
          if (existing) {
            existing.updatedAt = op.timestamp || Date.now();
          }
        }
        break;

      case 'ADD':
        if (op.item && op.item.id) {
          itemMap.set(op.item.id, op.item as MemoryItem);
        }
        break;
    }
  }

  return Array.from(itemMap.values());
}

/**
 * 完整的去重流程
 *
 * @param items - 记忆项列表
 * @param config - 配置选项
 * @param llmProvider - LLM 提供者 (可选)
 * @returns 去重后的记忆项列表和操作统计
 */
export async function deduplicateMemories(
  items: MemoryItem[],
  config: Partial<DeduplicationConfig> = {},
  llmProvider?: IAIProvider
): Promise<{
  items: MemoryItem[];
  stats: {
    originalCount: number;
    finalCount: number;
    duplicatesRemoved: number;
    itemsMerged: number;
  };
}> {
  const fullConfig = { ...DEFAULT_DEDUP_CONFIG, ...config };
  const originalCount = items.length;

  let ops: MemoryOperation[];

  if (fullConfig.useLLMDedup && llmProvider) {
    ops = await generateDeduplicationOpsWithLLM(items, llmProvider, fullConfig);
  } else {
    ops = generateDeduplicationOps(items, fullConfig);
  }

  const dedupedItems = executeDeduplicationOps(items, ops);

  const deleteOps = ops.filter((o) => o.type === 'DELETE').length;
  const mergeOps = ops.filter((o) => o.type === 'UPDATE').length;

  return {
    items: dedupedItems,
    stats: {
      originalCount,
      finalCount: dedupedItems.length,
      duplicatesRemoved: deleteOps,
      itemsMerged: mergeOps,
    },
  };
}

// ============ LLM-based Deduplication ============

async function generateDeduplicationOpsWithLLM(
  items: MemoryItem[],
  llmProvider: IAIProvider,
  config: DeduplicationConfig
): Promise<MemoryOperation[]> {
  const ops: MemoryOperation[] = [];

  // 分批处理
  for (let i = 0; i < items.length; i += config.batchSize) {
    const batch = items.slice(i, i + config.batchSize);
    const itemsText = batch
      .map((item) => `[${item.id.slice(-8)}] ${item.summary}`)
      .join('\n');

    const prompt = DEDUP_ANALYSIS_PROMPT.replace('{items}', itemsText);
    const messages: AIMessage[] = [{ role: 'user', content: prompt }];

    try {
      const response = await llmProvider.chat(messages);
      const batchOps = parseDedupResponse(response.text, batch);
      ops.push(...batchOps);
    } catch (error) {
      console.warn('[Deduplication] LLM analysis failed:', error);
      // Fallback to simple dedup
      ops.push(...generateDeduplicationOps(batch, config));
    }
  }

  return ops;
}

function parseDedupResponse(
  response: string,
  items: MemoryItem[]
): MemoryOperation[] {
  const ops: MemoryOperation[] = [];
  const idMap = new Map(items.map((i) => [i.id.slice(-8), i.id]));

  const lines = response.split('\n').map((l) => l.trim());

  for (const line of lines) {
    if (line.startsWith('DUPLICATES:')) {
      const pairs = line
        .replace('DUPLICATES:', '')
        .split(',')
        .map((p) => p.trim());

      for (const pair of pairs) {
        const [shortId1, shortId2] = pair.split('=').map((s) => s.trim());
        const id1 = idMap.get(shortId1);
        const id2 = idMap.get(shortId2);
        if (id1 && id2) {
          ops.push({ type: 'DELETE', targetId: id2 });
        }
      }
    }
  }

  return ops;
}

/**
 * 检查新记忆是否与现有记忆重复
 *
 * @param newItem - 新记忆项
 * @param existingItems - 现有记忆项
 * @param threshold - 相似度阈值
 * @returns 是否重复，以及匹配的现有记忆 ID
 */
export function checkDuplicate(
  newItem: MemoryItem,
  existingItems: MemoryItem[],
  threshold: number = 0.9
): { isDuplicate: boolean; matchedId?: string; similarity?: number } {
  if (!newItem.embedding) {
    return { isDuplicate: false };
  }

  for (const existing of existingItems) {
    if (!existing.embedding) continue;

    const similarity = calculateSimilarity(
      newItem.embedding,
      existing.embedding,
      'cosine'
    );

    if (similarity >= threshold) {
      return { isDuplicate: true, matchedId: existing.id, similarity };
    }
  }

  return { isDuplicate: false };
}
