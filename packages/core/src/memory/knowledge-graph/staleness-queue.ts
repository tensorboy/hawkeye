import {
  HierarchicalSummary,
  StalenessConfig,
  DEFAULT_STALENESS_CONFIG,
  CostEntry,
  calculateCost,
  estimateTokens,
} from './types';
import type { KnowledgeGraphStore } from './knowledge-graph-store';

export type SummaryRefreshFunction = (summary: HierarchicalSummary) => Promise<string>;

interface StalenessEntry {
  summary: HierarchicalSummary;
  score: number;
}

interface RefreshResult {
  refreshed: number;
  errors: number;
  costEntries?: CostEntry[];
}

/**
 * Min-heap priority queue for tracking and refreshing stale hierarchical summaries.
 *
 * Uses a max-heap approach (by negating comparison) to keep most stale items at top.
 *
 * Staleness formula:
 * stalenessScore = eventsSinceRefresh * priorityMultiplier + ageDays * ageFactor
 */
export class StalenessQueue {
  private config: StalenessConfig;
  private heap: StalenessEntry[] = [];
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing = false;

  constructor(
    private store: KnowledgeGraphStore,
    private refreshFn?: SummaryRefreshFunction,
    config?: Partial<StalenessConfig>
  ) {
    this.config = { ...DEFAULT_STALENESS_CONFIG, ...config };
  }

  /**
   * Set or update the refresh function (typically an LLM call)
   */
  setRefreshFunction(fn: SummaryRefreshFunction): void {
    this.refreshFn = fn;
  }

  /**
   * Load all summaries from store and build the priority queue
   */
  async loadFromStore(): Promise<void> {
    this.heap = [];

    // Get all summaries from store (use a large limit to fetch all)
    const summaries = this.store.getStalestSummaries(10000);

    // Calculate staleness scores and build heap
    for (const summary of summaries) {
      const score = this.calculateStalenessScore(summary);
      this.heapPush({ summary, score });
    }
  }

  /**
   * Notify that events have been added to a summary node.
   * Propagates up the hierarchy tree to parent summaries.
   */
  notifyEvents(summaryId: string, eventCount: number = 1): void {
    // Find the summary in the heap
    const entryIndex = this.heap.findIndex(e => e.summary.id === summaryId);
    if (entryIndex === -1) return;

    const entry = this.heap[entryIndex];
    const summary = entry.summary;

    // Increment events_since_refresh in the summary object
    summary.eventsSinceRefresh = (summary.eventsSinceRefresh || 0) + eventCount;

    // Update in store
    this.store.incrementSummaryEvents(summaryId, eventCount);

    // Recalculate staleness score
    entry.score = this.calculateStalenessScore(summary);

    // Re-heapify from this position
    this.siftUp(entryIndex);
    this.siftDown(entryIndex);

    // Propagate to parent summaries up the tree
    if (summary.parentId) {
      this.notifyEvents(summary.parentId, eventCount);
    }
  }

  /**
   * Get top-N most stale summaries that need refresh
   */
  getStale(limit?: number): StalenessEntry[] {
    const threshold = this.config.threshold;

    // Filter summaries that need refresh
    const stale = this.heap
      .filter(entry => entry.summary.eventsSinceRefresh >= threshold)
      .sort((a, b) => b.score - a.score); // Sort by score descending (most stale first)

    if (limit !== undefined) {
      return stale.slice(0, limit);
    }

    return stale;
  }

  /**
   * Refresh stale summaries in batch.
   * Calls the refresh function for each and updates the store.
   */
  async refreshStale(limit?: number): Promise<RefreshResult> {
    if (this.isRefreshing || !this.refreshFn) {
      return { refreshed: 0, errors: 0 };
    }

    this.isRefreshing = true;
    const stale = this.getStale(limit ?? this.config.maxBatchSize);
    let refreshed = 0;
    let errors = 0;
    const costEntries: CostEntry[] = [];

    for (const entry of stale) {
      try {
        const startTime = Date.now();
        const newContent = await this.refreshFn(entry.summary);
        const elapsedMs = Date.now() - startTime;

        // Update summary content in store
        await this.store.updateSummaryContent(entry.summary.id, newContent);

        // Reset events_since_refresh to 0 (updateSummaryContent already resets in the store)
        entry.summary.eventsSinceRefresh = 0;
        entry.summary.lastRefreshedAt = Date.now();

        // Update staleness score
        entry.score = this.calculateStalenessScore(entry.summary);

        // Track cost
        const inputTokens = estimateTokens(entry.summary.content);
        const outputTokens = estimateTokens(newContent);
        const model = 'gpt-4o-mini'; // Default model, should be configurable
        const cost = calculateCost(model, inputTokens, outputTokens);
        costEntries.push({
          id: `cost_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          model,
          source: 'summary_refresh',
          inputTokens,
          outputTokens,
          cost,
          metadata: { summaryId: entry.summary.id, summaryType: entry.summary.nodeType },
          timestamp: Date.now(),
        });

        refreshed++;
      } catch (error) {
        console.error(`Failed to refresh summary ${entry.summary.id}:`, error);
        errors++;
      }
    }

    // Re-heapify after all updates
    this.heapify();

    this.isRefreshing = false;
    return { refreshed, errors, costEntries };
  }

  /**
   * Start automatic periodic refresh
   */
  startAutoRefresh(): void {
    if (this.refreshTimer) return;

    this.refreshTimer = setInterval(() => {
      this.refreshStale().catch(error => {
        console.error('Auto-refresh error:', error);
      });
    }, this.config.refreshIntervalMs);
  }

  /**
   * Stop automatic refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Calculate staleness score for a summary.
   *
   * Formula: eventsSinceRefresh * priorityMultiplier + ageDays * ageFactor
   */
  calculateStalenessScore(summary: HierarchicalSummary): number {
    const now = Date.now();
    const lastRefresh = summary.lastRefreshedAt || summary.createdAt;
    const ageDays = (now - lastRefresh) / (1000 * 60 * 60 * 24);

    const eventsSinceRefresh = summary.eventsSinceRefresh || 0;
    const priorityMultiplier = summary.priorityMultiplier || 1.0;

    return eventsSinceRefresh * priorityMultiplier + ageDays * this.config.ageFactor;
  }

  // ==================== Min-Heap Operations ====================
  // Using max-heap semantics by comparing scores in descending order

  /**
   * Push an entry onto the heap
   */
  private heapPush(entry: StalenessEntry): void {
    this.heap.push(entry);
    this.siftUp(this.heap.length - 1);
  }

  /**
   * Pop the highest priority (most stale) entry from the heap
   */
  private heapPop(): StalenessEntry | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const top = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.siftDown(0);
    return top;
  }

  /**
   * Peek at the top entry without removing it
   */
  private heapPeek(): StalenessEntry | undefined {
    return this.heap[0];
  }

  /**
   * Rebuild the heap from scratch (Floyd's algorithm)
   */
  private heapify(): void {
    // Start from the last non-leaf node and sift down
    for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
      this.siftDown(i);
    }
  }

  /**
   * Sift up: move element at index up until heap property is restored
   */
  private siftUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);

      // Max-heap: parent should have higher score than child
      if (this.heap[parentIndex].score >= this.heap[index].score) {
        break;
      }

      this.swap(parentIndex, index);
      index = parentIndex;
    }
  }

  /**
   * Sift down: move element at index down until heap property is restored
   */
  private siftDown(index: number): void {
    const length = this.heap.length;

    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let largest = index;

      // Max-heap: find the largest among node and its children
      if (
        leftChild < length &&
        this.heap[leftChild].score > this.heap[largest].score
      ) {
        largest = leftChild;
      }

      if (
        rightChild < length &&
        this.heap[rightChild].score > this.heap[largest].score
      ) {
        largest = rightChild;
      }

      if (largest === index) {
        break;
      }

      this.swap(index, largest);
      index = largest;
    }
  }

  /**
   * Swap two elements in the heap
   */
  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }

  /**
   * Get queue size
   */
  get size(): number {
    return this.heap.length;
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.stopAutoRefresh();
    this.heap = [];
    this.isRefreshing = false;
  }
}
