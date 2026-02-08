/**
 * Reciprocal Rank Fusion (RRF) Algorithm
 * 基于 QMD 项目的 RRF 实现，用于融合多个排序结果列表
 *
 * 公式: score = Σ(weight / (k + rank + 1)) + top_rank_bonus
 * - k: 平滑参数，默认 60（防止高排名结果主导）
 * - weight: 每个列表的权重
 * - top_rank_bonus: 排名奖励（排名1: +0.05, 排名2-3: +0.02）
 */

// ============ 配置类型 ============

export interface RRFConfig {
  /** 平滑参数 k，默认 60 */
  k: number;
  /** 向量搜索权重，默认 1.0 */
  vectorWeight: number;
  /** 全文搜索权重，默认 1.0 */
  ftsWeight: number;
  /** 排名第1的奖励分数，默认 0.05 */
  topRankBonus: number;
  /** 排名2-3的奖励分数，默认 0.02 */
  secondaryRankBonus: number;
}

export const DEFAULT_RRF_CONFIG: RRFConfig = {
  k: 60,
  vectorWeight: 1.0,
  ftsWeight: 1.0,
  topRankBonus: 0.05,
  secondaryRankBonus: 0.02,
};

// ============ 位置感知混合配置 ============

export interface BlendingConfig {
  /** Rank 1-3 的 RRF 权重，默认 0.75 */
  topRRFWeight: number;
  /** Rank 4-10 的 RRF 权重，默认 0.60 */
  midRRFWeight: number;
  /** Rank 11+ 的 RRF 权重，默认 0.40 */
  lowRRFWeight: number;
}

export const DEFAULT_BLENDING_CONFIG: BlendingConfig = {
  topRRFWeight: 0.75,
  midRRFWeight: 0.60,
  lowRRFWeight: 0.40,
};

// ============ 结果类型 ============

export interface RankedItem {
  id: string;
  [key: string]: unknown;
}

export interface RRFResult<T extends RankedItem> {
  item: T;
  rrfScore: number;
  topRank: number;
  ranks: Map<string, number>; // listName -> rank
}

export interface RankedResultList<T extends RankedItem> {
  name: string;
  results: T[];
  weight: number;
}

// ============ RRF 核心算法 ============

/**
 * Reciprocal Rank Fusion 算法
 * 融合多个排序结果列表，返回按 RRF 分数排序的结果
 *
 * @param resultLists - 多个带权重的排序结果列表
 * @param config - RRF 配置参数
 * @returns 融合后的结果数组，按 RRF 分数降序排列
 *
 * @example
 * ```typescript
 * const vectorResults = [{ id: 'a', score: 0.9 }, { id: 'b', score: 0.8 }];
 * const ftsResults = [{ id: 'b', score: 0.95 }, { id: 'c', score: 0.7 }];
 *
 * const fused = reciprocalRankFusion([
 *   { name: 'vector', results: vectorResults, weight: 1.0 },
 *   { name: 'fts', results: ftsResults, weight: 1.0 },
 * ]);
 * // 结果: [{ item: b, rrfScore: ... }, { item: a, ... }, { item: c, ... }]
 * ```
 */
export function reciprocalRankFusion<T extends RankedItem>(
  resultLists: RankedResultList<T>[],
  config: Partial<RRFConfig> = {}
): RRFResult<T>[] {
  const { k, topRankBonus, secondaryRankBonus } = {
    ...DEFAULT_RRF_CONFIG,
    ...config,
  };

  // 使用 Map 累积每个 item 的 RRF 分数
  const scores = new Map<
    string,
    {
      item: T;
      rrfScore: number;
      topRank: number;
      ranks: Map<string, number>;
    }
  >();

  // 遍历每个结果列表
  for (const { name, results, weight } of resultLists) {
    for (let rank = 0; rank < results.length; rank++) {
      const item = results[rank];
      const rrfContribution = weight / (k + rank + 1);

      const existing = scores.get(item.id);
      if (existing) {
        existing.rrfScore += rrfContribution;
        existing.topRank = Math.min(existing.topRank, rank);
        existing.ranks.set(name, rank);
      } else {
        const ranks = new Map<string, number>();
        ranks.set(name, rank);
        scores.set(item.id, {
          item,
          rrfScore: rrfContribution,
          topRank: rank,
          ranks,
        });
      }
    }
  }

  // 应用 top-rank bonus
  for (const entry of scores.values()) {
    if (entry.topRank === 0) {
      entry.rrfScore += topRankBonus;
    } else if (entry.topRank <= 2) {
      entry.rrfScore += secondaryRankBonus;
    }
  }

  // 按 RRF 分数降序排序
  return Array.from(scores.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}

// ============ 位置感知混合 ============

/**
 * 位置感知混合算法
 * 根据 RRF 排名动态调整 RRF 分数和重排序分数的权重
 *
 * - Rank 1-3: 75% RRF, 25% reranker
 * - Rank 4-10: 60% RRF, 40% reranker
 * - Rank 11+: 40% RRF, 60% reranker
 *
 * @param rrfResults - RRF 融合后的结果
 * @param rerankerScores - 重排序分数 (id -> score, 0-1)
 * @param config - 混合配置
 * @returns 混合后的结果，按最终分数排序
 */
export function applyPositionBlending<T extends RankedItem>(
  rrfResults: RRFResult<T>[],
  rerankerScores: Map<string, number>,
  config: Partial<BlendingConfig> = {}
): Array<RRFResult<T> & { blendedScore: number; rerankerScore: number }> {
  const { topRRFWeight, midRRFWeight, lowRRFWeight } = {
    ...DEFAULT_BLENDING_CONFIG,
    ...config,
  };

  const blendedResults = rrfResults.map((result, rrfRank) => {
    const rerankerScore = rerankerScores.get(result.item.id) ?? 0;

    // 根据 RRF 排名确定权重
    let rrfWeight: number;
    if (rrfRank < 3) {
      rrfWeight = topRRFWeight; // Rank 1-3 (0-indexed: 0-2)
    } else if (rrfRank < 10) {
      rrfWeight = midRRFWeight; // Rank 4-10 (0-indexed: 3-9)
    } else {
      rrfWeight = lowRRFWeight; // Rank 11+
    }

    // 归一化 RRF 分数到 0-1 范围
    const normalizedRRFScore = 1 / (rrfRank + 1);

    // 计算混合分数
    const blendedScore =
      rrfWeight * normalizedRRFScore + (1 - rrfWeight) * rerankerScore;

    return {
      ...result,
      blendedScore,
      rerankerScore,
    };
  });

  // 按混合分数降序排序
  return blendedResults.sort((a, b) => b.blendedScore - a.blendedScore);
}

// ============ 辅助函数 ============

/**
 * 简化的双列表 RRF 融合（向量 + FTS）
 * 适用于 Hawkeye 的 hybrid search 场景
 */
export function fuseVectorAndFTS<T extends RankedItem>(
  vectorResults: T[],
  ftsResults: T[],
  config: Partial<RRFConfig> = {}
): RRFResult<T>[] {
  const { vectorWeight, ftsWeight } = { ...DEFAULT_RRF_CONFIG, ...config };

  return reciprocalRankFusion(
    [
      { name: 'vector', results: vectorResults, weight: vectorWeight },
      { name: 'fts', results: ftsResults, weight: ftsWeight },
    ],
    config
  );
}

/**
 * 从 RRF 结果中提取原始 items
 */
export function extractItems<T extends RankedItem>(
  rrfResults: RRFResult<T>[]
): T[] {
  return rrfResults.map((r) => r.item);
}

/**
 * 限制结果数量
 */
export function limitResults<T>(results: T[], limit: number): T[] {
  return results.slice(0, limit);
}
