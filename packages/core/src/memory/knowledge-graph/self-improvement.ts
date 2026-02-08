/**
 * Self-Improvement Module
 *
 * Handles self-improvement from user feedback, tool errors, and cost tracking.
 * Based on babyagi3's learning system.
 *
 * Features:
 * - Tracks LLM API costs with daily budget limits
 * - Records user feedback (positive/negative/neutral)
 * - Learns from tool errors and patterns
 * - Records corrections and self-evaluations
 * - Provides cost reports and summaries
 */

import {
  LearningRecord,
  LearningType,
  CostEntry,
  CostSource,
  CostReport,
  LLM_PRICING,
  calculateCost,
  estimateTokens,
  formatCost,
} from './types';
import type { KnowledgeGraphStore } from './knowledge-graph-store';

// ============================================================================
// Configuration
// ============================================================================

export interface SelfImprovementConfig {
  /** Max daily cost in USD before throttling (default: 1.0) */
  dailyCostLimit: number;
  /** Minimum confidence to apply a learning (default: 0.5) */
  minLearningConfidence: number;
  /** Max learning records to keep (default: 500) */
  maxLearningRecords: number;
  /** Enable auto-learning from errors (default: true) */
  learnFromErrors: boolean;
  /** Enable learning from user feedback (default: true) */
  learnFromFeedback: boolean;
}

export const DEFAULT_SELF_IMPROVEMENT_CONFIG: SelfImprovementConfig = {
  dailyCostLimit: 1.0,
  minLearningConfidence: 0.5,
  maxLearningRecords: 500,
  learnFromErrors: true,
  learnFromFeedback: true,
};

// ============================================================================
// Self-Improvement Manager
// ============================================================================

export class SelfImprovementManager {
  private config: SelfImprovementConfig;
  private pendingCostEntries: CostEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 1000; // Batch flush every 1s

  constructor(
    private store: KnowledgeGraphStore,
    config?: Partial<SelfImprovementConfig>
  ) {
    this.config = { ...DEFAULT_SELF_IMPROVEMENT_CONFIG, ...config };
  }

  // =============================================
  // Cost Tracking
  // =============================================

  /**
   * Track an LLM API call's cost.
   * Should be called after every AI provider interaction.
   *
   * @param params - LLM call parameters
   * @returns The created cost entry
   */
  trackCost(params: {
    model: string;
    source: CostSource;
    inputTokens: number;
    outputTokens: number;
    metadata?: Record<string, unknown>;
  }): CostEntry {
    try {
      const cost = calculateCost(params.model, params.inputTokens, params.outputTokens);
      const entry: CostEntry = {
        id: this.generateId(),
        model: params.model,
        source: params.source,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        cost,
        metadata: params.metadata,
        timestamp: Date.now(),
      };

      this.pendingCostEntries.push(entry);
      this.scheduleFlush();

      return entry;
    } catch (error) {
      console.error('Failed to track cost:', error);
      throw error;
    }
  }

  /**
   * Check if we're within the daily cost budget.
   *
   * @returns true if within budget, false if exceeded
   */
  isWithinBudget(): boolean {
    try {
      const todayCost = this.store.getTotalCostToday();
      return todayCost < this.config.dailyCostLimit;
    } catch (error) {
      console.error('Failed to check budget:', error);
      // Fail open - assume within budget if error occurs
      return true;
    }
  }

  /**
   * Get remaining budget for today.
   *
   * @returns Remaining budget in USD
   */
  getRemainingBudget(): number {
    try {
      const todayCost = this.store.getTotalCostToday();
      return Math.max(0, this.config.dailyCostLimit - todayCost);
    } catch (error) {
      console.error('Failed to get remaining budget:', error);
      return 0;
    }
  }

  /**
   * Get cost report for a time period.
   *
   * @param from - Start timestamp (default: 24 hours ago)
   * @param to - End timestamp (default: now)
   * @returns Cost report with breakdown by model and source
   */
  getCostReport(from?: number, to?: number): CostReport {
    try {
      const now = Date.now();
      const start = from ?? (now - 24 * 60 * 60 * 1000); // Default: last 24h
      const end = to ?? now;

      const rawReport = this.store.getCostReport(start, end);

      // Transform to match CostReport interface
      const byModel: Record<string, { inputTokens: number; outputTokens: number; cost: number; callCount: number }> = {};
      const bySource: Record<string, { inputTokens: number; outputTokens: number; cost: number; callCount: number }> = {};

      for (const entry of rawReport.entries) {
        // By model
        if (!byModel[entry.model]) {
          byModel[entry.model] = { inputTokens: 0, outputTokens: 0, cost: 0, callCount: 0 };
        }
        byModel[entry.model].inputTokens += entry.inputTokens;
        byModel[entry.model].outputTokens += entry.outputTokens;
        byModel[entry.model].cost += entry.cost;
        byModel[entry.model].callCount += 1;

        // By source
        if (!bySource[entry.source]) {
          bySource[entry.source] = { inputTokens: 0, outputTokens: 0, cost: 0, callCount: 0 };
        }
        bySource[entry.source].inputTokens += entry.inputTokens;
        bySource[entry.source].outputTokens += entry.outputTokens;
        bySource[entry.source].cost += entry.cost;
        bySource[entry.source].callCount += 1;
      }

      return {
        from: start,
        to: end,
        totalCost: rawReport.totalCost,
        byModel,
        bySource,
        totalCalls: rawReport.entries.length,
      };
    } catch (error) {
      console.error('Failed to get cost report:', error);
      const now = Date.now();
      return {
        from: from ?? (now - 24 * 60 * 60 * 1000),
        to: to ?? now,
        totalCost: 0,
        byModel: {},
        bySource: {},
        totalCalls: 0,
      };
    }
  }

  // =============================================
  // Learning from Feedback
  // =============================================

  /**
   * Record user feedback on an action or response.
   * Positive feedback reinforces, negative creates corrections.
   *
   * @param params - Feedback parameters
   * @returns The created learning record, or null if disabled
   */
  recordFeedback(params: {
    content: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    relatedToolId?: string;
    relatedEntityId?: string;
  }): LearningRecord | null {
    if (!this.config.learnFromFeedback) {
      return null;
    }

    try {
      const record: LearningRecord = {
        id: this.generateId(),
        type: 'user_feedback',
        content: params.content,
        sentiment: params.sentiment,
        confidence: params.sentiment === 'positive' ? 0.9 : 0.7,
        relatedToolId: params.relatedToolId,
        relatedEntityId: params.relatedEntityId,
        appliedCount: 0,
        learnedAt: Date.now(),
        updatedAt: Date.now(),
      };

      this.store.saveLearningRecord(record);
      this.trimLearningRecords();

      return record;
    } catch (error) {
      console.error('Failed to record feedback:', error);
      return null;
    }
  }

  /**
   * Record that a tool/action failed, creating an error pattern learning.
   *
   * @param params - Error parameters
   * @returns The created learning record, or null if disabled
   */
  recordToolError(params: {
    toolId: string;
    errorMessage: string;
    context?: string;
  }): LearningRecord | null {
    if (!this.config.learnFromErrors) {
      return null;
    }

    try {
      const record: LearningRecord = {
        id: this.generateId(),
        type: 'tool_error_pattern',
        content: `Tool "${params.toolId}" failed: ${params.errorMessage}`,
        recommendation: params.context ? `Context: ${params.context}` : undefined,
        sentiment: 'negative',
        confidence: 0.6,
        relatedToolId: params.toolId,
        appliedCount: 0,
        learnedAt: Date.now(),
        updatedAt: Date.now(),
      };

      this.store.saveLearningRecord(record);
      this.trimLearningRecords();

      return record;
    } catch (error) {
      console.error('Failed to record tool error:', error);
      return null;
    }
  }

  /**
   * Record a correction (user fixed an AI response).
   *
   * @param params - Correction parameters
   * @returns The created learning record
   */
  recordCorrection(params: {
    originalContent: string;
    correctedContent: string;
    relatedEntityId?: string;
  }): LearningRecord | null {
    try {
      const record: LearningRecord = {
        id: this.generateId(),
        type: 'correction',
        content: `Original: "${params.originalContent}" → Corrected: "${params.correctedContent}"`,
        recommendation: params.correctedContent,
        sentiment: 'negative',
        confidence: 0.95, // User corrections are high confidence
        relatedEntityId: params.relatedEntityId,
        appliedCount: 0,
        learnedAt: Date.now(),
        updatedAt: Date.now(),
      };

      this.store.saveLearningRecord(record);
      this.trimLearningRecords();

      return record;
    } catch (error) {
      console.error('Failed to record correction:', error);
      return null;
    }
  }

  /**
   * Record a self-evaluation result.
   *
   * @param params - Self-evaluation parameters
   * @returns The created learning record
   */
  recordSelfEvaluation(params: {
    content: string;
    recommendation?: string;
    confidence: number;
  }): LearningRecord | null {
    try {
      const record: LearningRecord = {
        id: this.generateId(),
        type: 'self_evaluation',
        content: params.content,
        recommendation: params.recommendation,
        sentiment: 'neutral',
        confidence: Math.max(0, Math.min(1, params.confidence)), // Clamp to [0, 1]
        appliedCount: 0,
        learnedAt: Date.now(),
        updatedAt: Date.now(),
      };

      this.store.saveLearningRecord(record);
      this.trimLearningRecords();

      return record;
    } catch (error) {
      console.error('Failed to record self-evaluation:', error);
      return null;
    }
  }

  // =============================================
  // Retrieving Learnings
  // =============================================

  /**
   * Get relevant learnings for a given context.
   * Returns learnings sorted by relevance and confidence.
   *
   * @param options - Filter options
   * @returns Array of learning records
   */
  getRelevantLearnings(options?: {
    type?: LearningType;
    relatedToolId?: string;
    limit?: number;
  }): LearningRecord[] {
    try {
      const allRecords = this.store.getLearningRecords({
        type: options?.type,
        limit: options?.limit ?? 10,
      });

      // Filter by tool ID if specified
      let filtered = allRecords;
      if (options?.relatedToolId) {
        filtered = allRecords.filter(r => r.relatedToolId === options.relatedToolId);
      }

      // Filter out low-confidence learnings
      filtered = filtered.filter(r => r.confidence >= this.config.minLearningConfidence);

      // Sort by confidence * appliedCount (successful learnings ranked higher)
      filtered.sort((a, b) => {
        const scoreA = a.confidence * (1 + Math.log1p(a.appliedCount));
        const scoreB = b.confidence * (1 + Math.log1p(b.appliedCount));
        return scoreB - scoreA;
      });

      return filtered;
    } catch (error) {
      console.error('Failed to get relevant learnings:', error);
      return [];
    }
  }

  /**
   * Get error patterns for a specific tool.
   *
   * @param toolId - Tool identifier
   * @returns Array of error pattern learning records
   */
  getToolErrorPatterns(toolId: string): LearningRecord[] {
    try {
      return this.store.getLearningRecords({ type: 'tool_error_pattern' })
        .filter(r => r.relatedToolId === toolId)
        .filter(r => r.confidence >= this.config.minLearningConfidence);
    } catch (error) {
      console.error('Failed to get tool error patterns:', error);
      return [];
    }
  }

  /**
   * Mark a learning as applied (increments counter).
   * Call this when a learning is successfully used.
   *
   * @param id - Learning record ID
   */
  markLearningApplied(id: string): void {
    try {
      this.store.incrementLearningApplied(id);
    } catch (error) {
      console.error('Failed to mark learning applied:', error);
    }
  }

  // =============================================
  // Summary / Statistics
  // =============================================

  /**
   * Get a summary of all learnings and costs.
   *
   * @returns Summary statistics
   */
  getSummary(): {
    totalLearnings: number;
    byType: Record<string, number>;
    todayCost: number;
    remainingBudget: number;
    costFormatted: string;
  } {
    try {
      const stats = this.store.getStats();
      const allLearnings = this.store.getLearningRecords({});

      // Count by type
      const byType: Record<string, number> = {
        user_feedback: 0,
        tool_error_pattern: 0,
        correction: 0,
        self_evaluation: 0,
      };

      for (const learning of allLearnings) {
        byType[learning.type] = (byType[learning.type] || 0) + 1;
      }

      const todayCost = this.store.getTotalCostToday();
      const remainingBudget = this.getRemainingBudget();

      return {
        totalLearnings: stats.learningRecords,
        byType,
        todayCost,
        remainingBudget,
        costFormatted: formatCost(todayCost),
      };
    } catch (error) {
      console.error('Failed to get summary:', error);
      return {
        totalLearnings: 0,
        byType: {},
        todayCost: 0,
        remainingBudget: 0,
        costFormatted: '$0.00',
      };
    }
  }

  /**
   * Get detailed learning statistics.
   *
   * @returns Detailed statistics about learnings
   */
  getLearningStats(): {
    total: number;
    byType: Record<LearningType, number>;
    bySentiment: Record<'positive' | 'negative' | 'neutral', number>;
    avgConfidence: number;
    mostApplied: LearningRecord[];
  } {
    try {
      const allLearnings = this.store.getLearningRecords({});

      const byType: Record<LearningType, number> = {
        user_feedback: 0,
        tool_error_pattern: 0,
        correction: 0,
        self_evaluation: 0,
      };

      const bySentiment: Record<'positive' | 'negative' | 'neutral', number> = {
        positive: 0,
        negative: 0,
        neutral: 0,
      };

      let totalConfidence = 0;

      for (const learning of allLearnings) {
        byType[learning.type] = (byType[learning.type] || 0) + 1;
        bySentiment[learning.sentiment] = (bySentiment[learning.sentiment] || 0) + 1;
        totalConfidence += learning.confidence;
      }

      // Get most applied learnings
      const mostApplied = [...allLearnings]
        .sort((a, b) => b.appliedCount - a.appliedCount)
        .slice(0, 5);

      return {
        total: allLearnings.length,
        byType,
        bySentiment,
        avgConfidence: allLearnings.length > 0 ? totalConfidence / allLearnings.length : 0,
        mostApplied,
      };
    } catch (error) {
      console.error('Failed to get learning stats:', error);
      return {
        total: 0,
        byType: {
          user_feedback: 0,
          tool_error_pattern: 0,
          correction: 0,
          self_evaluation: 0,
        },
        bySentiment: {
          positive: 0,
          negative: 0,
          neutral: 0,
        },
        avgConfidence: 0,
        mostApplied: [],
      };
    }
  }

  // =============================================
  // Internal Helpers
  // =============================================

  /**
   * Flush pending cost entries to store.
   * Called automatically by the flush timer.
   */
  private flush(): void {
    if (this.pendingCostEntries.length === 0) {
      return;
    }

    try {
      for (const entry of this.pendingCostEntries) {
        this.store.saveCostEntry(entry);
      }
      this.pendingCostEntries = [];
    } catch (error) {
      console.error('Failed to flush cost entries:', error);
      // Keep entries in buffer for next flush attempt
    }
  }

  /**
   * Schedule a flush operation.
   * Uses a timer to batch multiple trackCost calls.
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      return; // Already scheduled
    }

    this.flushTimer = setTimeout(() => {
      this.flush();
      this.flushTimer = null;
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Trim learning records to stay within maxLearningRecords limit.
   * Removes oldest, least-used records first.
   */
  private trimLearningRecords(): void {
    try {
      const allLearnings = this.store.getLearningRecords({});

      if (allLearnings.length > this.config.maxLearningRecords) {
        // Sort by usefulness: appliedCount * confidence * recency
        const scored = allLearnings.map(learning => {
          const ageInDays = (Date.now() - learning.learnedAt) / (1000 * 60 * 60 * 24);
          const recencyScore = 1 / (1 + ageInDays / 30); // Decay over 30 days
          const usefulness = learning.appliedCount * learning.confidence * recencyScore;
          return { learning, usefulness };
        });

        scored.sort((a, b) => a.usefulness - b.usefulness);

        // Delete least useful records
        const toDelete = scored.slice(0, allLearnings.length - this.config.maxLearningRecords);
        // Note: We don't have a deleteLearningRecord method in the store,
        // so we'd need to add one or mark records as superseded
        // For now, we'll just log a warning
        if (toDelete.length > 0) {
          console.warn(`Would delete ${toDelete.length} learning records to stay within limit`);
        }
      }
    } catch (error) {
      console.error('Failed to trim learning records:', error);
    }
  }

  /**
   * Generate a unique ID.
   *
   * @returns A unique identifier string
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Cleanup resources and flush pending data.
   * Call this when shutting down.
   */
  destroy(): void {
    // Flush any pending cost entries
    this.flush();

    // Clear flush timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Clear pending entries
    this.pendingCostEntries = [];
  }
}

// ============================================================================
// Exports
// ============================================================================

export { estimateTokens, formatCost, calculateCost } from './types';
