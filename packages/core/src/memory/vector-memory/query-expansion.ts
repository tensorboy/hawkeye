/**
 * Query Expansion Module
 * 查询扩展：生成多个查询变体以提高搜索召回率
 *
 * 支持三种扩展类型：
 * 1. Lexical (词汇变体) - 用于 FTS 搜索
 * 2. Vector (语义变体) - 用于向量搜索
 * 3. HyDE (假设文档) - 生成假设答案用于向量搜索
 */

import type { IAIProvider, AIMessage } from '../../ai/types';

// ============ 类型定义 ============

export interface ExpandedQuery {
  /** 原始查询 */
  original: string;
  /** 词汇变体 (用于 FTS) */
  lexical: string[];
  /** 语义变体 (用于向量搜索) */
  vector: string[];
  /** 假设文档 (HyDE) */
  hyde?: string;
}

export interface QueryExpansionConfig {
  /** 是否启用词汇扩展 */
  enableLexical: boolean;
  /** 是否启用语义扩展 */
  enableVector: boolean;
  /** 是否启用 HyDE */
  enableHyde: boolean;
  /** 每种类型生成的最大变体数 */
  maxVariants: number;
  /** LLM 温度参数 */
  temperature: number;
  /** 最大 token 数 */
  maxTokens: number;
}

export const DEFAULT_QUERY_EXPANSION_CONFIG: QueryExpansionConfig = {
  enableLexical: true,
  enableVector: true,
  enableHyde: false, // HyDE 成本较高，默认关闭
  maxVariants: 3,
  temperature: 0.7,
  maxTokens: 256,
};

// ============ Prompts ============

const LEXICAL_EXPANSION_PROMPT = `You are a search query optimizer. Given a user query, generate alternative phrasings optimized for keyword/full-text search.

Rules:
- Generate exactly {count} alternative queries
- Focus on synonyms, related terms, and different word orderings
- Keep queries concise and keyword-focused
- Output ONLY the queries, one per line, no numbering or explanations

User query: {query}

Alternative queries:`;

const VECTOR_EXPANSION_PROMPT = `You are a semantic search optimizer. Given a user query, generate alternative phrasings that capture the same meaning but with different wording.

Rules:
- Generate exactly {count} alternative queries
- Focus on semantic variations and paraphrases
- Include more context or specificity when helpful
- Output ONLY the queries, one per line, no numbering or explanations

User query: {query}

Alternative queries:`;

const HYDE_PROMPT = `Given a question, generate a hypothetical answer that would appear in a document containing the answer. This will be used for semantic search.

Rules:
- Write as if you're quoting from an authoritative source
- Be specific and include relevant details
- Keep the response concise (2-3 sentences)
- Do not include meta-commentary, just the hypothetical content

Question: {query}

Hypothetical document excerpt:`;

// ============ 主要函数 ============

/**
 * 扩展查询，生成多个变体
 *
 * @param query - 原始查询
 * @param llmProvider - LLM 提供者
 * @param config - 扩展配置
 * @returns 扩展后的查询对象
 *
 * @example
 * ```typescript
 * const expanded = await expandQuery(
 *   'how to implement RRF',
 *   llmProvider,
 *   { enableHyde: true }
 * );
 *
 * // expanded.lexical: ['RRF implementation', 'reciprocal rank fusion code', ...]
 * // expanded.vector: ['implementing RRF algorithm', 'RRF search fusion method', ...]
 * // expanded.hyde: 'RRF (Reciprocal Rank Fusion) is implemented by...'
 * ```
 */
export async function expandQuery(
  query: string,
  llmProvider: IAIProvider,
  config: Partial<QueryExpansionConfig> = {}
): Promise<ExpandedQuery> {
  const fullConfig = { ...DEFAULT_QUERY_EXPANSION_CONFIG, ...config };

  const result: ExpandedQuery = {
    original: query,
    lexical: [],
    vector: [],
  };

  // 并行执行所有扩展任务
  const tasks: Promise<void>[] = [];

  if (fullConfig.enableLexical) {
    tasks.push(
      generateLexicalVariants(query, llmProvider, fullConfig).then((variants) => {
        result.lexical = variants;
      })
    );
  }

  if (fullConfig.enableVector) {
    tasks.push(
      generateVectorVariants(query, llmProvider, fullConfig).then((variants) => {
        result.vector = variants;
      })
    );
  }

  if (fullConfig.enableHyde) {
    tasks.push(
      generateHyDE(query, llmProvider, fullConfig).then((hyde) => {
        result.hyde = hyde;
      })
    );
  }

  await Promise.all(tasks);

  return result;
}

/**
 * 生成词汇变体 (用于 FTS)
 */
async function generateLexicalVariants(
  query: string,
  llmProvider: IAIProvider,
  config: QueryExpansionConfig
): Promise<string[]> {
  try {
    const prompt = LEXICAL_EXPANSION_PROMPT.replace('{query}', query).replace(
      '{count}',
      String(config.maxVariants)
    );

    const messages: AIMessage[] = [{ role: 'user', content: prompt }];

    const response = await llmProvider.chat(messages);

    return parseVariants(response.text, config.maxVariants);
  } catch (error) {
    console.warn('[QueryExpansion] Lexical expansion failed:', error);
    return [];
  }
}

/**
 * 生成语义变体 (用于向量搜索)
 */
async function generateVectorVariants(
  query: string,
  llmProvider: IAIProvider,
  config: QueryExpansionConfig
): Promise<string[]> {
  try {
    const prompt = VECTOR_EXPANSION_PROMPT.replace('{query}', query).replace(
      '{count}',
      String(config.maxVariants)
    );

    const messages: AIMessage[] = [{ role: 'user', content: prompt }];

    const response = await llmProvider.chat(messages);

    return parseVariants(response.text, config.maxVariants);
  } catch (error) {
    console.warn('[QueryExpansion] Vector expansion failed:', error);
    return [];
  }
}

/**
 * 生成假设文档 (HyDE)
 */
async function generateHyDE(
  query: string,
  llmProvider: IAIProvider,
  config: QueryExpansionConfig
): Promise<string | undefined> {
  try {
    const prompt = HYDE_PROMPT.replace('{query}', query);

    const messages: AIMessage[] = [{ role: 'user', content: prompt }];

    const response = await llmProvider.chat(messages);

    const hyde = response.text.trim();
    return hyde.length > 0 ? hyde : undefined;
  } catch (error) {
    console.warn('[QueryExpansion] HyDE generation failed:', error);
    return undefined;
  }
}

// ============ 辅助函数 ============

/**
 * 解析 LLM 输出的变体列表
 */
function parseVariants(text: string, maxCount: number): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // 移除可能的序号前缀 (1., -, *, etc.)
    .map((line) => line.replace(/^[\d\-\*\.]+\s*/, '').trim())
    .filter((line) => line.length > 0);

  return lines.slice(0, maxCount);
}

/**
 * 简单的同义词扩展 (不依赖 LLM)
 * 用于快速扩展或作为 fallback
 */
export function expandQuerySimple(query: string): ExpandedQuery {
  const words = query.toLowerCase().split(/\s+/);

  // 简单的同义词映射
  const synonyms: Record<string, string[]> = {
    search: ['find', 'lookup', 'query'],
    implement: ['create', 'build', 'develop'],
    function: ['method', 'procedure', 'routine'],
    algorithm: ['method', 'approach', 'technique'],
    error: ['bug', 'issue', 'problem'],
    fix: ['resolve', 'repair', 'correct'],
    add: ['include', 'insert', 'append'],
    remove: ['delete', 'eliminate', 'drop'],
    update: ['modify', 'change', 'edit'],
    get: ['retrieve', 'fetch', 'obtain'],
  };

  const lexicalVariants: string[] = [];

  // 生成变体
  for (const word of words) {
    const syns = synonyms[word];
    if (syns) {
      for (const syn of syns.slice(0, 2)) {
        const variant = query.toLowerCase().replace(word, syn);
        if (!lexicalVariants.includes(variant)) {
          lexicalVariants.push(variant);
        }
      }
    }
  }

  return {
    original: query,
    lexical: lexicalVariants.slice(0, 3),
    vector: [], // 简单扩展不生成语义变体
  };
}

/**
 * 合并多个查询结果
 * 用于处理扩展查询的多个搜索结果
 */
export function mergeExpandedResults<T extends { id: string; score: number }>(
  resultSets: T[][],
  weights?: number[]
): T[] {
  const scoreMap = new Map<string, { item: T; totalScore: number; count: number }>();

  for (let i = 0; i < resultSets.length; i++) {
    const results = resultSets[i];
    const weight = weights?.[i] ?? 1.0;

    for (const item of results) {
      const existing = scoreMap.get(item.id);
      if (existing) {
        existing.totalScore += item.score * weight;
        existing.count++;
      } else {
        scoreMap.set(item.id, {
          item,
          totalScore: item.score * weight,
          count: 1,
        });
      }
    }
  }

  // 计算平均分数并排序
  return Array.from(scoreMap.values())
    .map(({ item, totalScore, count }) => ({
      ...item,
      score: totalScore / count,
    }))
    .sort((a, b) => b.score - a.score);
}
