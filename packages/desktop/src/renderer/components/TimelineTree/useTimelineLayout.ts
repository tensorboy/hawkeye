/**
 * Timeline Tree Layout Algorithm
 *
 * Horizontal timeline-based layout for activity summaries.
 * Arranges cards above the timeline with slight vertical variation for visual interest.
 */

export interface TimelineNode {
  id: string;
  x: number;
  y: number;
  label: string;
  timestamp: number;
  dominantStage?: string;
  confidence: number;
  appDistribution?: Record<string, number>;
  keywords?: string[];
  eventCounts?: Record<string, number>;
  animationDelay: number;
}

export interface TimelineEdge {
  from: { x: number; y: number };
  to: { x: number; y: number };
  animationDelay: number;
}

export interface TimelineLayoutResult {
  nodes: TimelineNode[];
  edges: TimelineEdge[];
  width: number;
  height: number;
  timeRange: { start: number; end: number };
}

export interface ActivitySummaryData {
  id: string;
  startTime: number;
  endTime: number;
  summaryText: string;
  appDistribution?: string;
  eventCounts?: string;
  dominantStage?: string;
  confidence: number;
  keywords?: string;
}

const CARD_WIDTH = 160;
const CARD_GAP = 180;
const TIMELINE_Y = 200;
const CARD_HEIGHT = 80;
const ANIMATION_STAGGER = 120; // ms between each node animation

/**
 * Compute timeline layout positions with cards above the axis.
 */
export function computeTimelineLayout(
  summaries: ActivitySummaryData[],
  containerWidth: number
): TimelineLayoutResult {
  if (!summaries || summaries.length === 0) {
    return {
      nodes: [],
      edges: [],
      width: containerWidth,
      height: 400,
      timeRange: { start: Date.now(), end: Date.now() },
    };
  }

  // Sort by time
  const sorted = [...summaries].sort((a, b) => a.startTime - b.startTime);
  const timeRange = {
    start: sorted[0].startTime,
    end: sorted[sorted.length - 1].endTime,
  };

  const nodes: TimelineNode[] = [];
  const edges: TimelineEdge[] = [];

  // Calculate horizontal scale
  const timeSpan = timeRange.end - timeRange.start || 1;
  const padding = 100;
  const minWidth = sorted.length * CARD_GAP;
  const availableWidth = Math.max(containerWidth - padding * 2, minWidth);

  // Create nodes - position cards above the timeline
  sorted.forEach((summary, index) => {
    const progress = (summary.startTime - timeRange.start) / timeSpan;
    const x = padding + progress * availableWidth;

    // Cards positioned above the timeline with slight variation
    // Alternate between two vertical positions for visual interest
    const baseY = TIMELINE_Y - CARD_HEIGHT - 40;
    const variation = (index % 3) * 15; // Slight staggered heights
    const y = baseY - variation;

    // Parse JSON fields
    let appDist: Record<string, number> | undefined;
    let keywords: string[] | undefined;
    let eventCounts: Record<string, number> | undefined;

    try {
      if (summary.appDistribution) {
        appDist = JSON.parse(summary.appDistribution);
      }
      if (summary.keywords) {
        keywords = JSON.parse(summary.keywords);
      }
      if (summary.eventCounts) {
        eventCounts = JSON.parse(summary.eventCounts);
      }
    } catch {
      // Ignore parse errors
    }

    nodes.push({
      id: summary.id,
      x,
      y,
      label: summary.summaryText,
      timestamp: summary.startTime,
      dominantStage: summary.dominantStage,
      confidence: summary.confidence,
      appDistribution: appDist,
      keywords,
      eventCounts,
      animationDelay: index * ANIMATION_STAGGER,
    });
  });

  // Create edges connecting dots on the timeline
  for (let i = 1; i < nodes.length; i++) {
    const from = nodes[i - 1];
    const to = nodes[i];

    edges.push({
      from: { x: from.x, y: TIMELINE_Y },
      to: { x: to.x, y: TIMELINE_Y },
      animationDelay: (i - 1) * ANIMATION_STAGGER + ANIMATION_STAGGER / 2,
    });
  }

  // Calculate bounds
  const maxX = nodes.reduce((max, n) => Math.max(max, n.x), 0) + padding;

  return {
    nodes,
    edges,
    width: maxX,
    height: 400,
    timeRange,
  };
}

/**
 * Format timestamp for display
 */
export function formatTimeLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
