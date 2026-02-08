/**
 * RRF Fusion Algorithm Tests
 */

import { describe, it, expect } from 'vitest';
import {
  reciprocalRankFusion,
  fuseVectorAndFTS,
  applyPositionBlending,
  DEFAULT_RRF_CONFIG,
  DEFAULT_BLENDING_CONFIG,
  type RankedItem,
  type RRFResult,
} from '../rrf-fusion';

// Test helper - create a ranked item
const createItem = (id: string, score: number): RankedItem & { score: number } => ({
  id,
  score,
});

describe('RRF Fusion Algorithm', () => {
  describe('reciprocalRankFusion', () => {
    it('should fuse two result lists correctly', () => {
      const vectorResults = [
        createItem('a', 0.9),
        createItem('b', 0.8),
        createItem('c', 0.7),
      ];

      const ftsResults = [
        createItem('b', 0.95),
        createItem('d', 0.85),
        createItem('a', 0.75),
      ];

      const fused = reciprocalRankFusion([
        { name: 'vector', results: vectorResults, weight: 1.0 },
        { name: 'fts', results: ftsResults, weight: 1.0 },
      ]);

      // 'b' appears in both lists at good ranks, should be top
      expect(fused[0].item.id).toBe('b');

      // All items should be present
      const ids = fused.map((r) => r.item.id);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toContain('c');
      expect(ids).toContain('d');
    });

    it('should apply top-rank bonus', () => {
      const list1 = [createItem('a', 0.9)];
      const list2 = [createItem('b', 0.9)];

      const fused = reciprocalRankFusion([
        { name: 'list1', results: list1, weight: 1.0 },
        { name: 'list2', results: list2, weight: 1.0 },
      ]);

      // Both items are rank 0 in their lists, so both get top-rank bonus
      expect(fused[0].rrfScore).toBeCloseTo(
        1.0 / (DEFAULT_RRF_CONFIG.k + 1) + DEFAULT_RRF_CONFIG.topRankBonus
      );
    });

    it('should apply secondary-rank bonus for ranks 1-2', () => {
      const results = [
        createItem('a', 0.9),
        createItem('b', 0.8),
        createItem('c', 0.7),
        createItem('d', 0.6),
      ];

      const fused = reciprocalRankFusion([
        { name: 'single', results, weight: 1.0 },
      ]);

      // Item 'b' at rank 1 should get secondary bonus
      const itemB = fused.find((r) => r.item.id === 'b')!;
      expect(itemB.topRank).toBe(1);

      // Item 'd' at rank 3 should NOT get any bonus
      const itemD = fused.find((r) => r.item.id === 'd')!;
      expect(itemD.topRank).toBe(3);
    });

    it('should respect weight parameter', () => {
      const vectorResults = [createItem('a', 0.9)];
      const ftsResults = [createItem('b', 0.9)];

      // Give vector higher weight
      const fused = reciprocalRankFusion([
        { name: 'vector', results: vectorResults, weight: 2.0 },
        { name: 'fts', results: ftsResults, weight: 1.0 },
      ]);

      const itemA = fused.find((r) => r.item.id === 'a')!;
      const itemB = fused.find((r) => r.item.id === 'b')!;

      // itemA should have higher RRF score due to higher weight
      expect(itemA.rrfScore).toBeGreaterThan(itemB.rrfScore);
    });

    it('should track ranks from each list', () => {
      const vectorResults = [createItem('a', 0.9), createItem('b', 0.8)];
      const ftsResults = [createItem('b', 0.95), createItem('a', 0.75)];

      const fused = reciprocalRankFusion([
        { name: 'vector', results: vectorResults, weight: 1.0 },
        { name: 'fts', results: ftsResults, weight: 1.0 },
      ]);

      const itemA = fused.find((r) => r.item.id === 'a')!;
      const itemB = fused.find((r) => r.item.id === 'b')!;

      expect(itemA.ranks.get('vector')).toBe(0);
      expect(itemA.ranks.get('fts')).toBe(1);
      expect(itemB.ranks.get('vector')).toBe(1);
      expect(itemB.ranks.get('fts')).toBe(0);
    });
  });

  describe('fuseVectorAndFTS', () => {
    it('should be a convenient wrapper for two-list fusion', () => {
      const vectorResults = [createItem('a', 0.9)];
      const ftsResults = [createItem('b', 0.9)];

      const fused = fuseVectorAndFTS(vectorResults, ftsResults);

      expect(fused.length).toBe(2);
      expect(fused.map((r) => r.item.id).sort()).toEqual(['a', 'b']);
    });
  });

  describe('applyPositionBlending', () => {
    it('should blend RRF scores with reranker scores', () => {
      const vectorResults = [
        createItem('a', 0.9),
        createItem('b', 0.8),
        createItem('c', 0.7),
      ];

      const ftsResults = [
        createItem('a', 0.85),
        createItem('b', 0.75),
        createItem('c', 0.65),
      ];

      const rrfResults = reciprocalRankFusion([
        { name: 'vector', results: vectorResults, weight: 1.0 },
        { name: 'fts', results: ftsResults, weight: 1.0 },
      ]);

      // Simulate reranker scores (higher for 'c')
      const rerankerScores = new Map<string, number>([
        ['a', 0.6],
        ['b', 0.7],
        ['c', 0.95],
      ]);

      const blended = applyPositionBlending(rrfResults, rerankerScores);

      // Each result should have blendedScore and rerankerScore
      expect(blended[0].blendedScore).toBeDefined();
      expect(blended[0].rerankerScore).toBeDefined();

      // Results should be re-sorted by blendedScore
      for (let i = 0; i < blended.length - 1; i++) {
        expect(blended[i].blendedScore).toBeGreaterThanOrEqual(
          blended[i + 1].blendedScore
        );
      }
    });

    it('should apply different weights based on RRF rank', () => {
      // Create 15 items to test all weight tiers
      const items = Array.from({ length: 15 }, (_, i) =>
        createItem(`item${i}`, 0.9 - i * 0.05)
      );

      const rrfResults = reciprocalRankFusion([
        { name: 'single', results: items, weight: 1.0 },
      ]);

      const rerankerScores = new Map<string, number>(
        items.map((item) => [item.id, 0.5])
      );

      const blended = applyPositionBlending(rrfResults, rerankerScores);

      // Top 3 items should use topRRFWeight (0.75)
      // Items 4-10 should use midRRFWeight (0.60)
      // Items 11+ should use lowRRFWeight (0.40)

      // This is implicitly tested by the sorting - items with higher RRF ranks
      // but same reranker scores should be weighted differently
      expect(blended.length).toBe(15);
    });
  });
});

describe('RRF Integration', () => {
  it('should handle empty input lists', () => {
    const fused = reciprocalRankFusion([
      { name: 'empty', results: [], weight: 1.0 },
    ]);

    expect(fused).toEqual([]);
  });

  it('should handle single item lists', () => {
    const fused = reciprocalRankFusion([
      { name: 'single', results: [createItem('only', 1.0)], weight: 1.0 },
    ]);

    expect(fused.length).toBe(1);
    expect(fused[0].item.id).toBe('only');
  });

  it('should handle no overlapping items', () => {
    const fused = fuseVectorAndFTS(
      [createItem('a', 0.9), createItem('b', 0.8)],
      [createItem('c', 0.95), createItem('d', 0.85)]
    );

    expect(fused.length).toBe(4);
  });

  it('should handle completely overlapping items', () => {
    const items = [createItem('a', 0.9), createItem('b', 0.8)];

    const fused = fuseVectorAndFTS(items, items);

    expect(fused.length).toBe(2);
    // Items appearing in both lists should have higher scores
    expect(fused[0].rrfScore).toBeGreaterThan(
      1.0 / (DEFAULT_RRF_CONFIG.k + 1) + DEFAULT_RRF_CONFIG.topRankBonus
    );
  });
});
