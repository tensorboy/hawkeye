/**
 * Context Assembler
 *
 * Assembles token-budgeted context from the knowledge graph for use in AI prompts.
 * Based on babyagi3's context assembly approach with hierarchical summaries and
 * budget-aware truncation.
 *
 * Context sections:
 * 1. Identity - User profile and preferences
 * 2. State - Current focus and application state
 * 3. Knowledge - Root summary from hierarchy
 * 4. Recent - Recent activity events
 * 5. Entities - Relevant entity details
 * 6. Reflection - Learning records and corrections
 */

import {
  ContextBudget,
  DEFAULT_CONTEXT_BUDGET,
  AssembledContext,
  KGEntity,
  KGFact,
  HierarchicalSummary,
  LearningRecord,
  estimateTokens,
} from './types';
import type { KnowledgeGraphStore } from './knowledge-graph-store';

export interface ContextAssemblerConfig {
  budget: ContextBudget;
  /** Max entities to include */
  maxEntities: number;
  /** Max facts per entity */
  maxFactsPerEntity: number;
  /** Max learning records */
  maxLearningRecords: number;
  /** Max recent events to show */
  maxRecentEvents: number;
  /** Whether to include embeddings-based similarity search */
  useSemanticSearch: boolean;
}

export const DEFAULT_ASSEMBLER_CONFIG: ContextAssemblerConfig = {
  budget: DEFAULT_CONTEXT_BUDGET,
  maxEntities: 5,
  maxFactsPerEntity: 3,
  maxLearningRecords: 3,
  maxRecentEvents: 10,
  useSemanticSearch: false,
};

export class ContextAssembler {
  private config: ContextAssemblerConfig;

  constructor(
    private store: KnowledgeGraphStore,
    config?: Partial<ContextAssemblerConfig>
  ) {
    this.config = { ...DEFAULT_ASSEMBLER_CONFIG, ...config };
  }

  /**
   * Assemble context for a given query/situation.
   *
   * @param query - Current user query or intent (for entity relevance)
   * @param recentEvents - Recent activity events (already available from the caller)
   * @param currentState - Current application state (focus, active app, etc.)
   */
  async assemble(options: {
    query?: string;
    recentEvents?: Array<{ content: string; timestamp: number }>;
    currentState?: Record<string, unknown>;
    identityOverride?: string;
  }): Promise<AssembledContext> {
    const sections: Record<string, { text: string; tokens: number; truncated: boolean }> = {};
    const referencedEntityIds: string[] = [];
    const budget = this.config.budget;

    // 1. Identity section
    sections.identity = await this.assembleIdentity(budget.identity, options.identityOverride);

    // 2. State section
    sections.state = this.assembleState(budget.state, options.currentState);

    // 3. Knowledge section (root summary)
    sections.knowledge = await this.assembleKnowledge(budget.knowledge);

    // 4. Recent events section
    sections.recent = this.assembleRecent(budget.recent, options.recentEvents);

    // 5. Entity context (relevant to query)
    const entityResult = await this.assembleEntities(budget.entities, options.query);
    sections.entities = entityResult.section;
    referencedEntityIds.push(...entityResult.entityIds);

    // 6. Reflection section
    sections.reflection = await this.assembleReflection(budget.reflection);

    // Build final text
    const parts: string[] = [];
    let totalTokens = 0;

    for (const [key, section] of Object.entries(sections)) {
      if (section.text.trim()) {
        parts.push(`## ${this.sectionTitle(key)}\n${section.text}`);
        totalTokens += section.tokens;
      }
    }

    // Enforce total cap
    let text = parts.join('\n\n');
    const totalEstimate = estimateTokens(text, budget.charsPerToken);
    if (totalEstimate > budget.totalCap) {
      text = this.truncateToTokens(text, budget.totalCap, budget.charsPerToken);
    }

    return {
      text,
      tokenCount: Math.min(totalEstimate, budget.totalCap),
      sections,
      referencedEntityIds,
    };
  }

  // === Section Assemblers ===

  private async assembleIdentity(
    budget: number,
    override?: string
  ): Promise<{ text: string; tokens: number; truncated: boolean }> {
    if (override) {
      const tokens = estimateTokens(override, this.config.budget.charsPerToken);
      if (tokens > budget) {
        const truncated = this.truncateToTokens(override, budget, this.config.budget.charsPerToken);
        return { text: truncated, tokens: budget, truncated: true };
      }
      return { text: override, tokens, truncated: false };
    }

    // Look for user_preferences summary node
    const userPrefSummary = this.store.getSummaryByKey('user_preferences');
    if (userPrefSummary?.content) {
      const tokens = estimateTokens(userPrefSummary.content, this.config.budget.charsPerToken);
      if (tokens > budget) {
        const truncated = this.truncateToTokens(
          userPrefSummary.content,
          budget,
          this.config.budget.charsPerToken
        );
        return { text: truncated, tokens: budget, truncated: true };
      }
      return { text: userPrefSummary.content, tokens, truncated: false };
    }

    // Fallback: Get preference facts
    const prefFacts = this.store.findFacts({ factType: 'preference', limit: 5 });
    if (prefFacts.length === 0) {
      return { text: '', tokens: 0, truncated: false };
    }

    const lines = prefFacts.map((f) => `- ${f.factText || `${f.subject} ${f.predicate} ${f.object}`}`);
    let text = lines.join('\n');
    const tokens = estimateTokens(text, this.config.budget.charsPerToken);

    if (tokens > budget) {
      text = this.truncateToTokens(text, budget, this.config.budget.charsPerToken);
      return { text, tokens: budget, truncated: true };
    }

    return { text, tokens, truncated: false };
  }

  private assembleState(
    budget: number,
    currentState?: Record<string, unknown>
  ): { text: string; tokens: number; truncated: boolean } {
    const parts: string[] = [];

    // Current timestamp
    parts.push(`Current time: ${this.formatTimestamp(Date.now())}`);

    // Application state
    if (currentState) {
      if (currentState.focusedApp) {
        parts.push(`Focused app: ${currentState.focusedApp}`);
      }
      if (currentState.activeWindow) {
        parts.push(`Active window: ${currentState.activeWindow}`);
      }
      if (currentState.currentTopic) {
        parts.push(`Current topic: ${currentState.currentTopic}`);
      }
      if (currentState.workMode) {
        parts.push(`Work mode: ${currentState.workMode}`);
      }

      // Add any other state fields
      for (const [key, value] of Object.entries(currentState)) {
        if (!['focusedApp', 'activeWindow', 'currentTopic', 'workMode'].includes(key)) {
          if (value !== null && value !== undefined) {
            parts.push(`${key}: ${String(value)}`);
          }
        }
      }
    }

    if (parts.length === 0) {
      return { text: '', tokens: 0, truncated: false };
    }

    let text = parts.join('\n');
    const tokens = estimateTokens(text, this.config.budget.charsPerToken);

    if (tokens > budget) {
      text = this.truncateToTokens(text, budget, this.config.budget.charsPerToken);
      return { text, tokens: budget, truncated: true };
    }

    return { text, tokens, truncated: false };
  }

  private async assembleKnowledge(
    budget: number
  ): Promise<{ text: string; tokens: number; truncated: boolean }> {
    // Get root summary
    const rootSummary = this.store.getRootSummary();

    if (rootSummary?.content) {
      const tokens = estimateTokens(rootSummary.content, this.config.budget.charsPerToken);
      if (tokens > budget) {
        const truncated = this.truncateToTokens(
          rootSummary.content,
          budget,
          this.config.budget.charsPerToken
        );
        return { text: truncated, tokens: budget, truncated: true };
      }
      return { text: rootSummary.content, tokens, truncated: false };
    }

    // Fallback: List top entities by importance
    const topEntities = this.store.findEntities({ minImportance: 0.5, limit: 10 });

    if (topEntities.length === 0) {
      return { text: 'No knowledge yet.', tokens: 5, truncated: false };
    }

    const lines = topEntities.map((e) => {
      const desc = e.description ? `: ${e.description}` : '';
      return `- ${e.name} (${e.entityType})${desc}`;
    });

    let text = `Key entities:\n${lines.join('\n')}`;
    const tokens = estimateTokens(text, this.config.budget.charsPerToken);

    if (tokens > budget) {
      text = this.truncateToTokens(text, budget, this.config.budget.charsPerToken);
      return { text, tokens: budget, truncated: true };
    }

    return { text, tokens, truncated: false };
  }

  private assembleRecent(
    budget: number,
    events?: Array<{ content: string; timestamp: number }>
  ): { text: string; tokens: number; truncated: boolean } {
    if (!events || events.length === 0) {
      return { text: '', tokens: 0, truncated: false };
    }

    // Sort by timestamp descending (newest first)
    const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);

    // Limit to maxRecentEvents
    const limited = sorted.slice(0, this.config.maxRecentEvents);

    const lines = limited.map((e) => {
      const time = this.formatTimestamp(e.timestamp);
      return `[${time}] ${e.content}`;
    });

    let text = lines.join('\n');
    const tokens = estimateTokens(text, this.config.budget.charsPerToken);

    if (tokens > budget) {
      // Truncate from the bottom (oldest events)
      const avgChars = text.length / lines.length;
      const targetChars = budget * this.config.budget.charsPerToken;
      const targetLines = Math.floor(targetChars / avgChars);

      if (targetLines > 0) {
        text = lines.slice(0, targetLines).join('\n') + '\n...';
      } else {
        text = this.truncateToTokens(text, budget, this.config.budget.charsPerToken);
      }

      return { text, tokens: budget, truncated: true };
    }

    return { text, tokens, truncated: false };
  }

  private async assembleEntities(
    budget: number,
    query?: string
  ): Promise<{
    section: { text: string; tokens: number; truncated: boolean };
    entityIds: string[];
  }> {
    let entities: KGEntity[] = [];
    const entityIds: string[] = [];

    if (query && query.trim()) {
      // Search entities by query
      entities = this.store.searchEntities(query, this.config.maxEntities);
    } else {
      // Get top entities by importance + recent access
      entities = this.store.findEntities({
        minImportance: 0.3,
        limit: this.config.maxEntities,
      });
    }

    if (entities.length === 0) {
      return {
        section: { text: '', tokens: 0, truncated: false },
        entityIds: [],
      };
    }

    const parts: string[] = [];
    let currentTokens = 0;

    for (const entity of entities) {
      entityIds.push(entity.id);

      // Increment access count
      this.store.incrementEntityAccess(entity.id);

      // Build entity section
      const entityLines: string[] = [];
      entityLines.push(`### ${entity.name} (${entity.entityType})`);

      if (entity.description) {
        entityLines.push(entity.description);
      }

      if (entity.aliases.length > 0) {
        entityLines.push(`Aliases: ${entity.aliases.join(', ')}`);
      }

      // Get related facts
      const facts = this.store.getFactsForSubject(entity.name).slice(0, this.config.maxFactsPerEntity);

      if (facts.length > 0) {
        entityLines.push('Facts:');
        for (const fact of facts) {
          entityLines.push(`- ${fact.factText || `${fact.predicate} ${fact.object}`}`);
          this.store.incrementFactRetrieval(fact.id);
        }
      }

      const entityText = entityLines.join('\n');
      const entityTokens = estimateTokens(entityText, this.config.budget.charsPerToken);

      // Check budget
      if (currentTokens + entityTokens > budget) {
        // Try to fit a truncated version
        const remaining = budget - currentTokens;
        if (remaining > 50) {
          const truncated = this.truncateToTokens(
            entityText,
            remaining,
            this.config.budget.charsPerToken
          );
          parts.push(truncated);
          currentTokens += remaining;
        }
        break;
      }

      parts.push(entityText);
      currentTokens += entityTokens;
    }

    const text = parts.join('\n\n');
    const truncated = currentTokens >= budget;

    return {
      section: { text, tokens: currentTokens, truncated },
      entityIds,
    };
  }

  private async assembleReflection(
    budget: number
  ): Promise<{ text: string; tokens: number; truncated: boolean }> {
    // Get recent learning records
    const learnings = this.store.getLearningRecords({ limit: this.config.maxLearningRecords });

    if (learnings.length === 0) {
      return { text: '', tokens: 0, truncated: false };
    }

    const lines = learnings.map((learning) => {
      const sentiment = learning.sentiment === 'positive' ? '✓' : learning.sentiment === 'negative' ? '✗' : '○';
      let line = `${sentiment} ${learning.content}`;
      if (learning.recommendation) {
        line += ` → ${learning.recommendation}`;
      }
      return line;
    });

    let text = lines.join('\n');
    const tokens = estimateTokens(text, this.config.budget.charsPerToken);

    if (tokens > budget) {
      // Truncate from bottom (oldest learnings)
      const avgChars = text.length / lines.length;
      const targetChars = budget * this.config.budget.charsPerToken;
      const targetLines = Math.floor(targetChars / avgChars);

      if (targetLines > 0) {
        text = lines.slice(0, targetLines).join('\n') + '\n...';
      } else {
        text = this.truncateToTokens(text, budget, this.config.budget.charsPerToken);
      }

      return { text, tokens: budget, truncated: true };
    }

    return { text, tokens, truncated: false };
  }

  // === Helpers ===

  private sectionTitle(key: string): string {
    const titles: Record<string, string> = {
      identity: 'User Profile',
      state: 'Current Context',
      knowledge: 'Knowledge Summary',
      recent: 'Recent Activity',
      entities: 'Relevant Knowledge',
      reflection: 'Past Learnings',
    };
    return titles[key] ?? key;
  }

  private truncateToTokens(text: string, maxTokens: number, charsPerToken: number): string {
    const maxChars = maxTokens * charsPerToken;
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars - 3) + '...';
  }

  private formatTimestamp(ts: number): string {
    return new Date(ts).toISOString().replace('T', ' ').substring(0, 19);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ContextAssemblerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ContextAssemblerConfig {
    return { ...this.config };
  }
}
