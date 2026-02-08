/**
 * Reference Tracking System - 引用追踪系统
 * 基于 memU 的 [ref:xxx] 引用系统
 *
 * 用于在类别摘要中追踪引用的记忆项，支持：
 * - 从摘要中提取引用
 * - 清除引用显示
 * - 转换为带编号的引用格式
 * - 生成短引用 ID
 */

// ============ 常量 ============

/** 引用模式: [ref:abc123] 或 [ref:abc123,def456] */
const REFERENCE_PATTERN = /\[ref:([a-zA-Z0-9_,\-]+)\]/g;

/** 短引用 ID 长度 */
const REF_ID_LENGTH = 6;

// ============ 核心函数 ============

/**
 * 从文本中提取所有引用的记忆项 ID
 *
 * @param text - 包含 [ref:xxx] 引用的文本
 * @returns 唯一的记忆项 ID 列表
 *
 * @example
 * ```typescript
 * const text = 'User likes hiking [ref:abc123] and swimming [ref:def456,abc123]';
 * const refs = extractReferences(text);
 * // ['abc123', 'def456']
 * ```
 */
export function extractReferences(text: string | null | undefined): string[] {
  if (!text) return [];

  const itemIds: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const idsStr = match[1];
    for (const itemId of idsStr.split(',')) {
      const trimmed = itemId.trim();
      if (trimmed && !seen.has(trimmed)) {
        itemIds.push(trimmed);
        seen.add(trimmed);
      }
    }
  }

  return itemIds;
}

/**
 * 从文本中移除所有 [ref:xxx] 引用
 * 用于显示给用户的干净文本
 *
 * @param text - 包含引用的文本
 * @returns 清理后的文本
 *
 * @example
 * ```typescript
 * const text = 'User likes hiking [ref:abc123].';
 * const clean = stripReferences(text);
 * // 'User likes hiking.'
 * ```
 */
export function stripReferences(text: string | null | undefined): string | null {
  if (!text) return text as null;

  let result = text.replace(REFERENCE_PATTERN, '');
  // 清理标点符号前的多余空格
  result = result.replace(/\s+([.,;:!?])/g, '$1');
  // 清理多余空格
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * 将 [ref:ID] 格式转换为带编号的引用 [1], [2] 并添加脚注
 *
 * @param text - 包含引用的文本
 * @returns 带编号引用和脚注的文本
 *
 * @example
 * ```typescript
 * const text = 'User likes hiking [ref:abc123] and swimming [ref:def456].';
 * const cited = formatAsCitations(text);
 * // 'User likes hiking [1] and swimming [2].\n\nReferences:\n[1] abc123\n[2] def456'
 * ```
 */
export function formatAsCitations(text: string | null | undefined): string | null {
  if (!text) return text as null;

  const refs = extractReferences(text);
  if (refs.length === 0) return text;

  const idToNum = new Map<string, number>();
  refs.forEach((refId, idx) => idToNum.set(refId, idx + 1));

  // 替换引用为编号
  const result = text.replace(REFERENCE_PATTERN, (_, idsStr) => {
    const nums = idsStr
      .split(',')
      .map((id: string) => id.trim())
      .filter((id: string) => idToNum.has(id))
      .map((id: string) => String(idToNum.get(id)));
    return `[${nums.join(',')}]`;
  });

  // 添加脚注
  const footnotes = Array.from(idToNum.entries())
    .map(([refId, num]) => `[${num}] ${refId}`)
    .join('\n');

  return `${result}\n\nReferences:\n${footnotes}`;
}

/**
 * 生成记忆项的短引用 ID
 *
 * @param itemId - 完整的记忆项 ID
 * @returns 6字符的短引用 ID
 *
 * @example
 * ```typescript
 * const shortRef = buildItemRefId('mem_1234567890_abcd1234');
 * // 'mem123'
 * ```
 */
export function buildItemRefId(itemId: string): string {
  return itemId.replace(/-/g, '').slice(0, REF_ID_LENGTH);
}

/**
 * 检查文本是否包含引用
 *
 * @param text - 要检查的文本
 * @returns 是否包含引用
 */
export function hasReferences(text: string | null | undefined): boolean {
  if (!text) return false;
  return REFERENCE_PATTERN.test(text);
}

/**
 * 统计文本中的引用数量
 *
 * @param text - 包含引用的文本
 * @returns 唯一引用的数量
 */
export function countReferences(text: string | null | undefined): number {
  return extractReferences(text).length;
}

/**
 * 在摘要中添加引用
 *
 * @param summary - 原始摘要文本
 * @param refIds - 要添加的引用 ID 列表
 * @returns 带引用的摘要
 *
 * @example
 * ```typescript
 * const summary = 'User enjoys outdoor activities.';
 * const withRefs = addReferencesToSummary(summary, ['abc123', 'def456']);
 * // 'User enjoys outdoor activities. [ref:abc123,def456]'
 * ```
 */
export function addReferencesToSummary(
  summary: string,
  refIds: string[]
): string {
  if (refIds.length === 0) return summary;

  const refStr = `[ref:${refIds.join(',')}]`;
  // 在句末添加引用
  const trimmed = summary.trim();
  const lastChar = trimmed[trimmed.length - 1];

  if (['.', '!', '?'].includes(lastChar)) {
    return `${trimmed.slice(0, -1)} ${refStr}${lastChar}`;
  }
  return `${trimmed} ${refStr}`;
}

/**
 * 解析带引用的记忆项内容
 * 返回内容和关联的引用 ID
 *
 * @param text - 带引用的文本
 * @returns 解析结果
 *
 * @example
 * ```typescript
 * const { content, references } = parseMemoryWithReferences(
 *   'User likes hiking [ref:abc123,def456]'
 * );
 * // content: 'User likes hiking'
 * // references: ['abc123', 'def456']
 * ```
 */
export function parseMemoryWithReferences(text: string): {
  content: string;
  references: string[];
} {
  const references = extractReferences(text);
  const content = stripReferences(text) || '';
  return { content, references };
}

/**
 * 构建带引用的类别摘要提示词
 * 用于指导 LLM 生成包含引用的摘要
 *
 * @param categoryName - 类别名称
 * @param existingSummary - 现有摘要
 * @param newMemories - 新增的记忆项 [{id, content}, ...]
 * @returns 提示词
 */
export function buildCategorySummaryPrompt(
  categoryName: string,
  existingSummary: string | undefined,
  newMemories: Array<{ id: string; content: string; refId: string }>
): string {
  const memoriesText = newMemories
    .map((m) => `- [${m.refId}]: ${m.content}`)
    .join('\n');

  const existingPart = existingSummary
    ? `\n\nExisting Summary:\n${existingSummary}`
    : '';

  return `You are updating the summary for the "${categoryName}" memory category.${existingPart}

New Memory Items to incorporate:
${memoriesText}

Instructions:
1. Create a coherent summary that incorporates all relevant information
2. Use [ref:REFID] citations to reference specific memory items (e.g., [ref:abc123])
3. Combine multiple references when they support the same point: [ref:abc123,def456]
4. Keep the summary concise but comprehensive
5. Preserve important details from the existing summary
6. Remove outdated information if contradicted by new items

Generate the updated summary:`;
}

// ============ 数据库集成函数 ============

import type { MemoryItem, MemoryType } from './types';

/**
 * 引用项结果
 */
export interface ReferencedItem {
  id: string;
  summary: string;
  memoryType: MemoryType;
}

/**
 * 从数据库获取引用的记忆项
 *
 * @param text - 包含引用的文本
 * @param getItemById - 通过 ID 获取记忆项的函数
 * @returns 引用的记忆项列表
 *
 * @example
 * ```typescript
 * const items = await fetchReferencedItems(
 *   'User loves hiking [ref:abc123].',
 *   async (id) => memoryStore.getItem(id)
 * );
 * // [{ id: 'abc123', summary: '...', memoryType: 'profile' }]
 * ```
 */
export async function fetchReferencedItems(
  text: string,
  getItemById: (id: string) => Promise<MemoryItem | null>
): Promise<ReferencedItem[]> {
  const itemIds = extractReferences(text);
  if (itemIds.length === 0) return [];

  const items: ReferencedItem[] = [];

  for (const itemId of itemIds) {
    const item = await getItemById(itemId);
    if (item) {
      items.push({
        id: item.id,
        summary: item.summary,
        memoryType: item.memoryType,
      });
    }
  }

  return items;
}

/**
 * 同步版本：从内存中获取引用的记忆项
 *
 * @param text - 包含引用的文本
 * @param itemsMap - 记忆项 Map (id -> item)
 * @returns 引用的记忆项列表
 */
export function fetchReferencedItemsSync(
  text: string,
  itemsMap: Map<string, MemoryItem>
): ReferencedItem[] {
  const itemIds = extractReferences(text);
  if (itemIds.length === 0) return [];

  const items: ReferencedItem[] = [];

  for (const itemId of itemIds) {
    const item = itemsMap.get(itemId);
    if (item) {
      items.push({
        id: item.id,
        summary: item.summary,
        memoryType: item.memoryType,
      });
    }
  }

  return items;
}

/**
 * 构建记忆项引用映射字符串
 * 用于 LLM 提示词中展示可用的引用项
 *
 * @param items - 记忆项列表 [(id, summary), ...]
 * @returns 格式化的引用映射字符串
 *
 * @example
 * ```typescript
 * const map = buildItemReferenceMap([
 *   { id: 'abc123', summary: 'User loves hiking' },
 *   { id: 'def456', summary: 'User works at Google' }
 * ]);
 * // 'Available memory items for reference:\n- [ref:abc123] User loves hiking\n- [ref:def456] User works at Google'
 * ```
 */
export function buildItemReferenceMap(
  items: Array<{ id: string; summary: string }>
): string {
  if (items.length === 0) return '';

  const lines = ['Available memory items for reference:'];

  for (const item of items) {
    // 截断过长的摘要
    const display =
      item.summary.length > 100
        ? item.summary.slice(0, 100) + '...'
        : item.summary;
    lines.push(`- [ref:${item.id}] ${display}`);
  }

  return lines.join('\n');
}

/**
 * 验证引用的完整性
 * 检查文本中的引用是否都能在给定的记忆项中找到
 *
 * @param text - 包含引用的文本
 * @param availableIds - 可用的记忆项 ID 集合
 * @returns 验证结果
 */
export function validateReferences(
  text: string,
  availableIds: Set<string>
): {
  valid: boolean;
  missingIds: string[];
  foundIds: string[];
} {
  const refs = extractReferences(text);
  const missingIds: string[] = [];
  const foundIds: string[] = [];

  for (const ref of refs) {
    if (availableIds.has(ref)) {
      foundIds.push(ref);
    } else {
      missingIds.push(ref);
    }
  }

  return {
    valid: missingIds.length === 0,
    missingIds,
    foundIds,
  };
}
