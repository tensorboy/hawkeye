/**
 * Theory of Mind Extraction - 心智理论推断
 * 基于 memU-experiment 的 ToM 提取系统
 *
 * 从对话中推断用户未明确表达的隐含信息：
 * - 隐含偏好
 * - 潜在意图
 * - 情感状态
 * - 推测的信念
 */

import type { IAIProvider, AIMessage } from '../../ai/types';
import type { TheoryOfMindItem, MemoryItem } from './types';
import { buildItemRefId } from './references';

// ============ 配置 ============

export interface TheoryOfMindConfig {
  /** 最大推断数量 */
  maxInferences: number;
  /** 最小置信度阈值 */
  minConfidence: 'perhaps' | 'probably' | 'likely' | 'very_likely';
  /** 是否包含情感推断 */
  includeEmotions: boolean;
  /** 是否包含意图推断 */
  includeIntentions: boolean;
}

export const DEFAULT_TOM_CONFIG: TheoryOfMindConfig = {
  maxInferences: 5,
  minConfidence: 'probably',
  includeEmotions: true,
  includeIntentions: true,
};

// ============ Prompts ============

const TOM_EXTRACTION_PROMPT = `You are analyzing a conversation to infer information that the user ({characterName}) did NOT explicitly state, but can be reasonably deduced.

**INFERENCE GUIDELINES:**
- Focus on implicit preferences, intentions, emotions, and beliefs
- Use your reasoning to infer what the user MEANT to express or what a listener can deduce
- DO NOT repeat information explicitly stated in the conversation
- Use confidence indicators: "perhaps", "probably", "likely", "very likely"
- Each inference should be self-contained and specific

**Context from Activity Items:**
{activityItems}

**Conversation:**
{conversationText}

**Output Format:**
For each inference, provide:
INFERENCE: [The inferred information]
CONFIDENCE: [perhaps/probably/likely/very_likely]
BASIS: [Brief explanation of what led to this inference]

Generate up to {maxInferences} inferences:`;

// ============ 主要函数 ============

/**
 * 从对话和活动项中提取心智理论推断
 *
 * @param conversationText - 对话文本
 * @param activityItems - 相关的活动记忆项
 * @param characterName - 推断对象名称 (通常是 'user')
 * @param llmProvider - LLM 提供者
 * @param config - 配置选项
 * @returns 心智推断项列表
 *
 * @example
 * ```typescript
 * const inferences = await extractTheoryOfMind(
 *   'User mentioned they work late often but wish they had more time for hobbies',
 *   activityItems,
 *   'user',
 *   llmProvider
 * );
 * // [{ inferredContent: 'User probably feels work-life balance is challenging', ... }]
 * ```
 */
export async function extractTheoryOfMind(
  conversationText: string,
  activityItems: MemoryItem[],
  characterName: string,
  llmProvider: IAIProvider,
  config: Partial<TheoryOfMindConfig> = {}
): Promise<TheoryOfMindItem[]> {
  const fullConfig = { ...DEFAULT_TOM_CONFIG, ...config };

  try {
    const activityText = formatActivityItems(activityItems);

    const prompt = TOM_EXTRACTION_PROMPT
      .replace('{characterName}', characterName)
      .replace('{activityItems}', activityText)
      .replace('{conversationText}', conversationText)
      .replace('{maxInferences}', String(fullConfig.maxInferences));

    const messages: AIMessage[] = [{ role: 'user', content: prompt }];
    const response = await llmProvider.chat(messages);

    const inferences = parseInferences(
      response.text,
      characterName,
      activityItems.map((i) => i.id)
    );

    // 过滤低于阈值的推断
    return filterByConfidence(inferences, fullConfig.minConfidence);
  } catch (error) {
    console.warn('[TheoryOfMind] Extraction failed:', error);
    return [];
  }
}

/**
 * 快速心智推断 (基于规则，不使用 LLM)
 * 用于简单场景或作为 fallback
 *
 * @param conversationText - 对话文本
 * @param characterName - 推断对象
 * @returns 基础推断列表
 */
export function extractTheoryOfMindSimple(
  conversationText: string,
  characterName: string
): Partial<TheoryOfMindItem>[] {
  const inferences: Partial<TheoryOfMindItem>[] = [];
  const text = conversationText.toLowerCase();

  // 情感模式检测
  const emotionPatterns: Array<{ pattern: RegExp; inference: string; confidence: TheoryOfMindItem['confidenceLevel'] }> = [
    {
      pattern: /\b(frustrated|annoyed|upset)\b/,
      inference: `${characterName} is probably experiencing some frustration`,
      confidence: 'probably'
    },
    {
      pattern: /\b(excited|happy|glad)\b/,
      inference: `${characterName} likely feels positive about this`,
      confidence: 'likely'
    },
    {
      pattern: /\b(worried|concerned|anxious)\b/,
      inference: `${characterName} might be feeling anxious about the situation`,
      confidence: 'perhaps'
    },
    {
      pattern: /\b(wish|hope|want)\b.*\b(could|would|more)\b/,
      inference: `${characterName} perhaps desires a change in their current situation`,
      confidence: 'perhaps'
    },
  ];

  // 意图模式检测
  const intentPatterns: Array<{ pattern: RegExp; inference: string; confidence: TheoryOfMindItem['confidenceLevel'] }> = [
    {
      pattern: /\b(looking for|searching|trying to find)\b/,
      inference: `${characterName} is actively seeking a solution`,
      confidence: 'likely'
    },
    {
      pattern: /\b(should i|what if|wondering)\b/,
      inference: `${characterName} is likely considering making a decision`,
      confidence: 'probably'
    },
    {
      pattern: /\b(been thinking|considering|might)\b/,
      inference: `${characterName} is probably contemplating a change`,
      confidence: 'probably'
    },
  ];

  const allPatterns = [...emotionPatterns, ...intentPatterns];

  for (const { pattern, inference, confidence } of allPatterns) {
    if (pattern.test(text)) {
      inferences.push({
        characterName,
        inferredContent: inference,
        confidenceLevel: confidence,
        sourceActivityIds: [],
      });
    }
  }

  return inferences;
}

/**
 * 验证心智推断
 * 用户确认或否定推断的准确性
 *
 * @param inference - 要验证的推断
 * @param confirmed - 用户是否确认
 * @returns 更新后的推断
 */
export function validateInference(
  inference: TheoryOfMindItem,
  confirmed: boolean
): TheoryOfMindItem {
  return {
    ...inference,
    confirmed,
    updatedAt: Date.now(),
    // 如果用户确认，提升置信度
    confidenceLevel: confirmed ? 'very_likely' : inference.confidenceLevel,
  };
}

/**
 * 合并相似的推断
 * 避免重复的心智推断
 *
 * @param inferences - 推断列表
 * @returns 去重后的推断列表
 */
export function mergeInferences(
  inferences: TheoryOfMindItem[]
): TheoryOfMindItem[] {
  const seen = new Map<string, TheoryOfMindItem>();

  for (const inference of inferences) {
    // 简单的文本相似性检查
    const key = inference.inferredContent.toLowerCase().trim();
    const existing = seen.get(key);

    if (!existing || compareConfidence(inference.confidenceLevel, existing.confidenceLevel) > 0) {
      seen.set(key, inference);
    }
  }

  return Array.from(seen.values());
}

// ============ 辅助函数 ============

function formatActivityItems(items: MemoryItem[]): string {
  if (items.length === 0) return 'No activity items available.';

  return items
    .map((item) => `- [${buildItemRefId(item.id)}] ${item.summary}`)
    .join('\n');
}

function parseInferences(
  response: string,
  characterName: string,
  sourceIds: string[]
): TheoryOfMindItem[] {
  const inferences: TheoryOfMindItem[] = [];
  const blocks = response.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim());

    let content = '';
    let confidence: TheoryOfMindItem['confidenceLevel'] = 'probably';

    for (const line of lines) {
      if (line.startsWith('INFERENCE:')) {
        content = line.replace('INFERENCE:', '').trim();
      } else if (line.startsWith('CONFIDENCE:')) {
        const conf = line.replace('CONFIDENCE:', '').trim().toLowerCase();
        if (isValidConfidence(conf)) {
          confidence = conf as TheoryOfMindItem['confidenceLevel'];
        }
      }
    }

    if (content) {
      inferences.push({
        id: `tom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        characterName,
        inferredContent: content,
        confidenceLevel: confidence,
        sourceActivityIds: sourceIds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  return inferences;
}

function isValidConfidence(conf: string): conf is TheoryOfMindItem['confidenceLevel'] {
  return ['perhaps', 'probably', 'likely', 'very_likely'].includes(conf);
}

const CONFIDENCE_ORDER: Record<TheoryOfMindItem['confidenceLevel'], number> = {
  perhaps: 1,
  probably: 2,
  likely: 3,
  very_likely: 4,
};

function compareConfidence(
  a: TheoryOfMindItem['confidenceLevel'],
  b: TheoryOfMindItem['confidenceLevel']
): number {
  return CONFIDENCE_ORDER[a] - CONFIDENCE_ORDER[b];
}

function filterByConfidence(
  inferences: TheoryOfMindItem[],
  minConfidence: TheoryOfMindItem['confidenceLevel']
): TheoryOfMindItem[] {
  const minLevel = CONFIDENCE_ORDER[minConfidence];
  return inferences.filter(
    (inf) => CONFIDENCE_ORDER[inf.confidenceLevel] >= minLevel
  );
}
