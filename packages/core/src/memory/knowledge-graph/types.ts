/**
 * Knowledge Graph Types
 *
 * Defines entities, edges, facts, summaries, context budget, learning records,
 * and cost tracking for the Knowledge Graph memory system.
 *
 * Based on babyagi3's three-layer memory architecture:
 * - Layer 1: Event Log (immutable events)
 * - Layer 2: Knowledge Graph (entities, edges, facts)
 * - Layer 3: Hierarchical Summaries (with staleness tracking)
 */

// ============================================================================
// Knowledge Graph Core
// ============================================================================

/** A named entity extracted from events (person, place, tool, concept, etc.) */
export interface KGEntity {
  id: string;
  name: string;
  /** Canonical entity type (person, organization, tool, project, concept, location, website, file) */
  entityType: KGEntityType;
  /** Raw type as returned by LLM before clustering */
  entityTypeRaw?: string;
  /** Alternative names or aliases */
  aliases: string[];
  /** Short description of the entity */
  description: string;
  /** Embedding vector for semantic search */
  embedding?: number[];
  /** Importance score 0-1, decays over time */
  importance: number;
  /** Number of times this entity has been referenced */
  accessCount: number;
  /** Timestamp of first appearance */
  firstSeen: number;
  /** Timestamp of most recent reference */
  lastSeen: number;
  /** IDs of source events that mention this entity */
  sourceEventIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type KGEntityType =
  | 'person'
  | 'organization'
  | 'tool'
  | 'project'
  | 'concept'
  | 'location'
  | 'website'
  | 'file'
  | 'event'
  | 'other';

/** A directed relationship between two entities */
export interface KGEdge {
  id: string;
  sourceId: string;
  targetId: string;
  /** Relationship label (e.g., "uses", "works_on", "belongs_to") */
  relation: string;
  /** Canonical relation type */
  relationType: KGRelationType;
  /** Strength of the relationship 0-1 */
  strength: number;
  /** Whether the relationship is bidirectional */
  bidirectional: boolean;
  /** Source event IDs that evidence this relationship */
  evidence: string[];
  /** Whether this edge is currently valid */
  isCurrent: boolean;
  createdAt: number;
  updatedAt: number;
}

export type KGRelationType =
  | 'professional'
  | 'social'
  | 'technical'
  | 'financial'
  | 'spatial'
  | 'temporal'
  | 'causal'
  | 'other';

/** A fact triple: subject → predicate → object */
export interface KGFact {
  id: string;
  /** Subject entity name or ID */
  subject: string;
  /** Predicate / relationship verb */
  predicate: string;
  /** Object entity or value */
  object: string;
  /** Full sentence expressing the fact */
  factText: string;
  /** Type of fact */
  factType: KGFactType;
  /** Confidence score 0-1 */
  confidence: number;
  /** Strength/importance 0-1 */
  strength: number;
  /** Source event IDs that establish this fact */
  sourceEventIds: string[];
  /** ID of fact this supersedes (for contradiction resolution) */
  contradicts?: string;
  /** Embedding for semantic search */
  embedding?: number[];
  /** When fact became valid */
  validFrom?: number;
  /** When fact became invalid (null = still valid) */
  validTo?: number;
  /** Usage stats */
  timesRetrieved: number;
  timesUsed: number;
  createdAt: number;
  updatedAt: number;
}

export type KGFactType =
  | 'relation'    // entity-to-entity relationship
  | 'attribute'   // entity property
  | 'event'       // something that happened
  | 'state'       // current state
  | 'metric'      // quantitative measurement
  | 'preference'; // user preference

// ============================================================================
// Hierarchical Summaries
// ============================================================================

/** A node in the hierarchical summary tree */
export interface HierarchicalSummary {
  id: string;
  /** Type of summary node */
  nodeType: SummaryNodeType;
  /** Unique key (e.g., "root", "entity:uuid", "type:person") */
  nodeKey: string;
  /** Human-readable label */
  label: string;
  /** Summary content text */
  content: string;
  /** Parent node ID (null for root) */
  parentId?: string;
  /** Child node IDs */
  childIds: string[];
  /** Embedding for semantic search */
  embedding?: number[];
  /** Number of events since last refresh */
  eventsSinceRefresh: number;
  /** Computed staleness score for priority queue */
  stalenessScore: number;
  /** Priority multiplier (leaf nodes get 1.5x) */
  priorityMultiplier: number;
  /** Total events that contributed to this summary */
  totalEventCount: number;
  /** Timestamp of first contributing event */
  firstEventAt?: number;
  /** Timestamp of last contributing event */
  lastEventAt?: number;
  /** Last time this summary was regenerated */
  lastRefreshedAt: number;
  createdAt: number;
  updatedAt: number;
}

export type SummaryNodeType =
  | 'root'          // Single root node: high-level overview
  | 'entity_type'   // Group by entity type (e.g., "People", "Tools")
  | 'entity'        // Individual entity summary
  | 'topic'         // Topic cluster summary
  | 'channel'       // Channel summary (screen, clipboard, browser)
  | 'relation_type' // Group by relation type
  | 'task'          // Task/goal summary
  | 'temporal';     // Time-based summary (daily, weekly)

/** Configuration for staleness-based refresh */
export interface StalenessConfig {
  /** Events threshold to trigger refresh */
  threshold: number;
  /** Max nodes to refresh per batch */
  maxBatchSize: number;
  /** Priority boost for leaf nodes */
  leafPriorityBoost: number;
  /** Staleness increase per day since last refresh */
  ageFactor: number;
  /** Refresh interval in milliseconds */
  refreshIntervalMs: number;
}

export const DEFAULT_STALENESS_CONFIG: StalenessConfig = {
  threshold: 10,
  maxBatchSize: 20,
  leafPriorityBoost: 1.5,
  ageFactor: 0.1,
  refreshIntervalMs: 60_000, // 1 minute
};

// ============================================================================
// Context Assembly
// ============================================================================

/** Token budget allocation per context section */
export interface ContextBudget {
  /** User identity and preferences */
  identity: number;
  /** Current state (focus, active topics) */
  state: number;
  /** Root knowledge summary */
  knowledge: number;
  /** Recent activity events */
  recent: number;
  /** Relevant entity context */
  entities: number;
  /** Learning records and reflections */
  reflection: number;
  /** Hard cap on total tokens */
  totalCap: number;
  /** Characters per token estimate */
  charsPerToken: number;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  identity: 200,
  state: 150,
  knowledge: 500,
  recent: 400,
  entities: 400,
  reflection: 150,
  totalCap: 4000,
  charsPerToken: 4,
};

/** Result of context assembly */
export interface AssembledContext {
  /** Full formatted context string */
  text: string;
  /** Total estimated tokens used */
  tokenCount: number;
  /** Breakdown by section */
  sections: Record<string, { text: string; tokens: number; truncated: boolean }>;
  /** Entity IDs referenced in context */
  referencedEntityIds: string[];
}

// ============================================================================
// Extraction Pipeline
// ============================================================================

/** Event to be processed by the extraction pipeline */
export interface ExtractionEvent {
  id: string;
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/** Result of extraction from one or more events */
export interface ExtractionResult {
  entities: Partial<KGEntity>[];
  edges: Partial<KGEdge>[];
  facts: Partial<KGFact>[];
  topics: ExtractedTopic[];
  /** Whether any events were skipped by triage */
  skippedCount: number;
  /** Number of LLM calls made */
  llmCallCount: number;
  /** Processing duration in ms */
  durationMs: number;
}

/** A topic cluster extracted from events */
export interface ExtractedTopic {
  label: string;
  keywords: string[];
  relevance: number;
}

/** Configuration for the extraction pipeline */
export interface ExtractionConfig {
  /** Max events per batch LLM call */
  batchSize: number;
  /** Max characters per event content for extraction */
  maxContentChars: number;
  /** Event types to skip (no LLM call needed) */
  skipEventTypes: string[];
  /** Whether to use heuristic type clustering */
  useHeuristicClustering: boolean;
  /** Whether to extract topics */
  extractTopics: boolean;
}

export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  batchSize: 5,
  maxContentChars: 2000,
  skipEventTypes: [
    'heartbeat',
    'status_update',
    'audio_level',
    'mouse_move',
    'scroll',
    'window_resize',
    'focus_change',
  ],
  useHeuristicClustering: true,
  extractTopics: true,
};

// ============================================================================
// Self-Improvement & Learning
// ============================================================================

/** A learning record from user feedback or error patterns */
export interface LearningRecord {
  id: string;
  /** Source of the learning */
  type: LearningType;
  /** What was learned */
  content: string;
  /** Actionable recommendation */
  recommendation?: string;
  /** Sentiment of the feedback */
  sentiment: 'positive' | 'negative' | 'neutral';
  /** Confidence in this learning 0-1 */
  confidence: number;
  /** Related tool or feature ID */
  relatedToolId?: string;
  /** Related entity ID */
  relatedEntityId?: string;
  /** ID of learning this supersedes */
  supersededBy?: string;
  /** Number of times this learning was applied */
  appliedCount: number;
  /** Embedding for semantic search */
  embedding?: number[];
  learnedAt: number;
  updatedAt: number;
}

export type LearningType =
  | 'user_feedback'
  | 'tool_error_pattern'
  | 'self_evaluation'
  | 'correction';

// ============================================================================
// Cost Tracking
// ============================================================================

/** A single LLM cost entry */
export interface CostEntry {
  id: string;
  /** Model used (e.g., "claude-sonnet-4-5", "gemini-2.0-flash") */
  model: string;
  /** What the call was for */
  source: CostSource;
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Cost in USD */
  cost: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export type CostSource =
  | 'extraction'        // Knowledge graph extraction
  | 'summary_refresh'   // Summary regeneration
  | 'context_assembly'  // Context retrieval/assembly
  | 'intent_detection'  // User intent recognition
  | 'plan_generation'   // Action plan generation
  | 'execution'         // Plan execution
  | 'chat'              // Direct chat/conversation
  | 'embedding'         // Embedding generation
  | 'other';

/** Cost report for a time period */
export interface CostReport {
  /** Time period start */
  from: number;
  /** Time period end */
  to: number;
  /** Total cost in USD */
  totalCost: number;
  /** Breakdown by model */
  byModel: Record<string, { inputTokens: number; outputTokens: number; cost: number; callCount: number }>;
  /** Breakdown by source */
  bySource: Record<string, { inputTokens: number; outputTokens: number; cost: number; callCount: number }>;
  /** Total LLM calls */
  totalCalls: number;
}

/** LLM pricing table (per 1M tokens) */
export const LLM_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5': { input: 15, output: 75 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-3-5': { input: 1, output: 5 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gemini-2.0-flash': { input: 0.075, output: 0.30 },
  'gemini-2.0-flash-lite': { input: 0.02, output: 0.10 },
};

/** Calculate cost for an LLM call */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = LLM_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

/** Estimate token count from text */
export function estimateTokens(text: string, charsPerToken = 4): number {
  return Math.ceil(text.length / charsPerToken);
}

/** Format cost as human-readable string */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${(costUsd * 100).toFixed(2)}c`;
  }
  return `$${costUsd.toFixed(4)}`;
}
