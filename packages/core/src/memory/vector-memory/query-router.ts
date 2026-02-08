/**
 * Query Router - 智能查询路由
 * 基于 memU 的预检索决策系统
 *
 * 功能：
 * - 决定查询是否需要记忆检索
 * - 查询重写以提高检索质量
 * - 分层充分性检查
 * - 避免不必要的 API 调用
 */

import type { IAIProvider, AIMessage } from '../../ai/types';
import type { QueryRouteDecision, TierSufficiencyResult } from './types';

// ============ Prompts ============

const PRE_RETRIEVAL_SYSTEM_PROMPT = `You are a memory retrieval decision system. Your job is to:
1. Decide if the user's query requires retrieving information from memory
2. If retrieval is needed, rewrite the query to be more effective for search

Guidelines:
- NO_RETRIEVE: Simple greetings, general knowledge questions, or queries the AI can answer without personal context
- RETRIEVE: Questions about the user's preferences, past conversations, personal information, specific events, or anything requiring user-specific context`;

const PRE_RETRIEVAL_USER_PROMPT = `Query: {query}

Conversation History:
{conversation_history}

Already Retrieved Content:
{retrieved_content}

Based on the above, decide if additional memory retrieval is needed.

Respond in this exact format:
DECISION: [RETRIEVE or NO_RETRIEVE]
REWRITTEN_QUERY: [The optimized search query if RETRIEVE, or "N/A" if NO_RETRIEVE]
REASONING: [Brief explanation of your decision]`;

const SUFFICIENCY_CHECK_PROMPT = `You are evaluating whether retrieved memory content is sufficient to answer a query.

Query: {query}
Retrieved Content: {retrieved_content}

Is this content sufficient to answer the query comprehensively?

Respond in this exact format:
SUFFICIENT: [YES or NO]
REWRITTEN_QUERY: [If NO, a better query to find missing information. If YES, write "N/A"]
MISSING: [If NO, what information is missing. If YES, write "N/A"]`;

// ============ 主要函数 ============

/**
 * 决定查询是否需要记忆检索
 *
 * @param query - 用户查询
 * @param conversationHistory - 对话历史
 * @param retrievedContent - 已检索的内容 (可选)
 * @param llmProvider - LLM 提供者
 * @returns 路由决策
 *
 * @example
 * ```typescript
 * const decision = await routeQuery(
 *   'What did I say about hiking last week?',
 *   conversationHistory,
 *   undefined,
 *   llmProvider
 * );
 * // { needsRetrieval: true, rewrittenQuery: 'user hiking preferences last week', ... }
 * ```
 */
export async function routeQuery(
  query: string,
  conversationHistory: AIMessage[],
  retrievedContent: string | undefined,
  llmProvider: IAIProvider
): Promise<QueryRouteDecision> {
  try {
    const historyText = formatConversationHistory(conversationHistory);
    const contentText = retrievedContent || 'No content retrieved yet.';

    const prompt = PRE_RETRIEVAL_USER_PROMPT
      .replace('{query}', escapePromptValue(query))
      .replace('{conversation_history}', escapePromptValue(historyText))
      .replace('{retrieved_content}', escapePromptValue(contentText));

    const messages: AIMessage[] = [
      { role: 'system', content: PRE_RETRIEVAL_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const response = await llmProvider.chat(messages);
    return parseRouteDecision(response.text, query);
  } catch (error) {
    console.warn('[QueryRouter] Route decision failed:', error);
    // 默认进行检索
    return {
      needsRetrieval: true,
      rewrittenQuery: query,
      suggestedTiers: ['category', 'item'],
      reasoning: 'Default: retrieval due to error',
    };
  }
}

/**
 * 快速路由判断 (不使用 LLM)
 * 基于规则的快速判断，用于简单场景
 *
 * @param query - 用户查询
 * @returns 是否需要检索
 */
export function quickRouteDecision(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();

  // 不需要检索的模式
  const noRetrievalPatterns = [
    /^(hi|hello|hey|good morning|good afternoon|good evening)/,
    /^(thanks|thank you|thx)/,
    /^(bye|goodbye|see you)/,
    /^(what is|what are|define|explain)\s+(a |an |the )?\w+$/,  // 通用定义问题
    /^(how do i|how to)\s+\w+$/,  // 通用操作问题
    /^(what time|what date|what day)/,
  ];

  for (const pattern of noRetrievalPatterns) {
    if (pattern.test(lowerQuery)) {
      return false;
    }
  }

  // 需要检索的模式
  const retrievalPatterns = [
    /\b(my|mine|i|me)\b/,  // 个人相关
    /(last time|yesterday|last week|before|previously)/,  // 时间相关
    /(remember|recall|mentioned|said|told)/,  // 记忆相关
    /(preference|favorite|like|dislike|hate|love)/,  // 偏好相关
    /\?$/,  // 问题通常需要检索
  ];

  for (const pattern of retrievalPatterns) {
    if (pattern.test(lowerQuery)) {
      return true;
    }
  }

  // 默认不检索 (保守策略以节省 API 调用)
  return false;
}

/**
 * 检查当前层级的检索结果是否充分
 *
 * @param query - 原始查询
 * @param retrievedContent - 当前层级检索到的内容
 * @param tier - 当前层级
 * @param llmProvider - LLM 提供者
 * @returns 充分性检查结果
 */
export async function checkTierSufficiency(
  query: string,
  retrievedContent: string,
  tier: 'category' | 'item' | 'resource',
  llmProvider: IAIProvider
): Promise<TierSufficiencyResult> {
  try {
    const prompt = SUFFICIENCY_CHECK_PROMPT
      .replace('{query}', escapePromptValue(query))
      .replace('{retrieved_content}', escapePromptValue(retrievedContent));

    const messages: AIMessage[] = [{ role: 'user', content: prompt }];
    const response = await llmProvider.chat(messages);

    return parseSufficiencyResult(response.text, query);
  } catch (error) {
    console.warn(`[QueryRouter] Sufficiency check failed for ${tier}:`, error);
    // 默认不足，继续下一层
    return {
      sufficient: false,
      rewrittenQuery: query,
    };
  }
}

/**
 * 快速充分性检查 (不使用 LLM)
 * 基于简单规则判断
 *
 * @param retrievedContent - 检索到的内容
 * @param minLength - 最小内容长度
 * @param minItems - 最小条目数
 * @returns 是否充分
 */
export function quickSufficiencyCheck(
  retrievedContent: string,
  minLength: number = 100,
  minItems: number = 2
): boolean {
  if (!retrievedContent) return false;

  const length = retrievedContent.length;
  const itemCount = (retrievedContent.match(/\n/g) || []).length + 1;

  return length >= minLength && itemCount >= minItems;
}

/**
 * 根据查询生成建议的检索层级
 *
 * @param query - 用户查询
 * @returns 建议的层级顺序
 */
export function suggestRetrievalTiers(
  query: string
): ('category' | 'item' | 'resource')[] {
  const lowerQuery = query.toLowerCase();

  // 如果查询明确关于特定细节，从 item 开始
  if (
    lowerQuery.includes('specifically') ||
    lowerQuery.includes('exactly') ||
    lowerQuery.includes('detail')
  ) {
    return ['item', 'resource'];
  }

  // 如果查询关于原始内容，包含 resource
  if (
    lowerQuery.includes('original') ||
    lowerQuery.includes('full conversation') ||
    lowerQuery.includes('exact words')
  ) {
    return ['item', 'resource'];
  }

  // 默认从 category 开始 (最高效)
  return ['category', 'item'];
}

/**
 * 重写查询以提高检索效果
 * 简单的规则基础重写 (不使用 LLM)
 *
 * @param query - 原始查询
 * @returns 重写后的查询
 */
export function rewriteQuerySimple(query: string): string {
  let rewritten = query;

  // 移除问句词
  rewritten = rewritten.replace(/^(what|when|where|who|why|how|do|does|did|is|are|was|were)\s+/i, '');

  // 移除代词并保留关键词
  rewritten = rewritten.replace(/\b(i|me|my|mine)\b/gi, 'user');

  // 移除停用词
  const stopWords = ['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with'];
  for (const word of stopWords) {
    rewritten = rewritten.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ');
  }

  // 清理多余空格
  rewritten = rewritten.replace(/\s+/g, ' ').trim();

  return rewritten || query;
}

// ============ 辅助函数 ============

function formatConversationHistory(messages: AIMessage[]): string {
  if (messages.length === 0) return 'No conversation history.';

  // 只取最近 5 轮对话
  const recent = messages.slice(-10);
  return recent
    .map((m) => `${m.role.toUpperCase()}: ${truncate(String(m.content), 200)}`)
    .join('\n');
}

function escapePromptValue(value: string): string {
  // 防止提示注入
  return value.replace(/[{}]/g, (c) => (c === '{' ? '{{' : '}}'));
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

function parseRouteDecision(response: string, originalQuery: string): QueryRouteDecision {
  const lines = response.split('\n').map((l) => l.trim());

  let needsRetrieval = true;
  let rewrittenQuery = originalQuery;
  let reasoning = '';

  for (const line of lines) {
    if (line.startsWith('DECISION:')) {
      const decision = line.replace('DECISION:', '').trim().toUpperCase();
      needsRetrieval = decision === 'RETRIEVE';
    } else if (line.startsWith('REWRITTEN_QUERY:')) {
      const query = line.replace('REWRITTEN_QUERY:', '').trim();
      if (query && query !== 'N/A') {
        rewrittenQuery = query;
      }
    } else if (line.startsWith('REASONING:')) {
      reasoning = line.replace('REASONING:', '').trim();
    }
  }

  return {
    needsRetrieval,
    rewrittenQuery,
    suggestedTiers: needsRetrieval ? suggestRetrievalTiers(originalQuery) : [],
    reasoning,
  };
}

function parseSufficiencyResult(response: string, originalQuery: string): TierSufficiencyResult {
  const lines = response.split('\n').map((l) => l.trim());

  let sufficient = false;
  let rewrittenQuery: string | undefined;
  let contentSummary: string | undefined;

  for (const line of lines) {
    if (line.startsWith('SUFFICIENT:')) {
      const answer = line.replace('SUFFICIENT:', '').trim().toUpperCase();
      sufficient = answer === 'YES';
    } else if (line.startsWith('REWRITTEN_QUERY:')) {
      const query = line.replace('REWRITTEN_QUERY:', '').trim();
      if (query && query !== 'N/A') {
        rewrittenQuery = query;
      }
    } else if (line.startsWith('MISSING:')) {
      const missing = line.replace('MISSING:', '').trim();
      if (missing && missing !== 'N/A') {
        contentSummary = `Missing: ${missing}`;
      }
    }
  }

  return {
    sufficient,
    rewrittenQuery: sufficient ? undefined : (rewrittenQuery || originalQuery),
    contentSummary,
  };
}
