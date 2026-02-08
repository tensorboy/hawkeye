import {
  KGEntity,
  KGEntityType,
  KGEdge,
  KGRelationType,
  KGFact,
  KGFactType,
  ExtractionEvent,
  ExtractionResult,
  ExtractedTopic,
  ExtractionConfig,
  DEFAULT_EXTRACTION_CONFIG,
  CostEntry,
  CostSource,
  calculateCost,
  estimateTokens,
} from './types';

/**
 * Type keywords for heuristic entity classification
 */
const TYPE_KEYWORDS: Record<KGEntityType, string[]> = {
  person: ['@', 'mr', 'mrs', 'ms', 'dr', 'prof', 'professor', 'engineer', 'developer', 'manager', 'ceo', 'cto'],
  organization: ['inc', 'corp', 'ltd', 'llc', 'company', 'team', 'dept', 'department', 'org', 'foundation', 'institute'],
  tool: ['app', 'software', 'plugin', 'extension', 'ide', 'editor', 'browser', 'terminal', 'vscode', 'chrome', 'slack'],
  project: ['repo', 'repository', 'project', 'codebase', 'workspace', 'monorepo', 'library', 'framework'],
  concept: ['algorithm', 'pattern', 'architecture', 'method', 'approach', 'technique', 'methodology', 'paradigm', 'principle'],
  location: ['city', 'country', 'street', 'avenue', 'building', 'office', 'room', 'floor', 'state', 'province'],
  website: ['http', 'https', 'www', '.com', '.org', '.io', '.dev', '.net', '.ai', '.app', 'github', 'gitlab'],
  file: ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rs', '.md', '.json', '.yaml', '.yml', '.css', '.html', '.xml', '/src/', '/lib/', '/test/', '/dist/'],
  event: ['meeting', 'call', 'standup', 'review', 'deadline', 'demo', 'presentation', 'interview', 'workshop', 'conference'],
  other: [],
};

/**
 * Relation keywords for heuristic relationship classification
 */
const RELATION_KEYWORDS: Record<KGRelationType, string[]> = {
  professional: ['works', 'manages', 'reports', 'leads', 'reviews', 'develops', 'collaborates', 'supervises', 'mentors'],
  social: ['friends', 'family', 'knows', 'likes', 'follows', 'connected', 'acquaintance'],
  technical: ['uses', 'depends', 'imports', 'extends', 'implements', 'calls', 'inherits', 'compiles', 'runs', 'executes'],
  financial: ['pays', 'costs', 'earns', 'invests', 'budget', 'funds', 'sponsors', 'bills'],
  spatial: ['located', 'near', 'inside', 'contains', 'adjacent', 'within', 'outside', 'at'],
  temporal: ['before', 'after', 'during', 'since', 'until', 'while', 'when', 'then'],
  causal: ['causes', 'triggers', 'enables', 'prevents', 'requires', 'leads to', 'results in', 'produces'],
  other: [],
};

/**
 * Event types to skip during triage (noise)
 */
const SKIP_EVENT_TYPES = new Set([
  'heartbeat',
  'status_update',
  'audio_level',
  'mouse_move',
  'scroll',
  'window_resize',
  'focus_change',
  'idle_start',
  'idle_end',
  'ping',
]);

/**
 * LLM call function type
 */
export type LLMCallFunction = (prompt: string) => Promise<string>;

/**
 * Heuristic-first extraction pipeline for knowledge graph construction.
 * Based on babyagi3's three-step approach:
 * 1. Event triage (skip ~70% of noise)
 * 2. Heuristic extraction (handle ~95% without LLM)
 * 3. Batch LLM extraction (for complex cases)
 */
export class ExtractionPipeline {
  private config: ExtractionConfig;
  private recentHashes: Set<string> = new Set();
  private maxRecentHashes = 500;
  private costEntries: CostEntry[] = [];

  constructor(
    private llmCall?: LLMCallFunction,
    config?: Partial<ExtractionConfig>
  ) {
    this.config = { ...DEFAULT_EXTRACTION_CONFIG, ...config };
  }

  /**
   * Set or update the LLM call function
   */
  setLLMCall(fn: LLMCallFunction): void {
    this.llmCall = fn;
  }

  /**
   * Process a batch of events through the three-step pipeline.
   * Returns extracted entities, edges, facts, and topics.
   */
  async processEvents(events: ExtractionEvent[]): Promise<ExtractionResult> {
    const startTime = Date.now();
    let skippedCount = 0;
    let llmCallCount = 0;

    // Step 1: Triage - filter out noise events
    const { passed, skipped } = this.triageEvents(events);
    skippedCount = skipped.length;

    // Step 2: Heuristic extraction (always runs)
    const heuristicResults = this.heuristicExtract(passed);

    // Step 3: Batch LLM extraction (if LLM available and enabled)
    let llmResults: ExtractionResult | null = null;
    if (this.llmCall && passed.length > 0) {
      try {
        llmResults = await this.batchLLMExtract(passed);
        llmCallCount = Math.ceil(passed.length / this.config.batchSize);
      } catch (error) {
        console.error('[ExtractionPipeline] LLM extraction failed:', error);
        // Continue with heuristic results only
      }
    }

    // Merge results
    const merged = this.mergeResults(heuristicResults, llmResults, {
      skippedCount,
      llmCallCount,
      durationMs: Date.now() - startTime,
    });

    return merged;
  }

  /**
   * Step 1: Triage - filter noise events
   */
  private triageEvents(events: ExtractionEvent[]): {
    passed: ExtractionEvent[];
    skipped: ExtractionEvent[];
  } {
    const passed: ExtractionEvent[] = [];
    const skipped: ExtractionEvent[] = [];

    for (const event of events) {
      // Skip events with no content
      if (!event.content || event.content.trim().length < 10) {
        skipped.push(event);
        continue;
      }

      // Skip noise event types
      if (SKIP_EVENT_TYPES.has(event.type)) {
        skipped.push(event);
        continue;
      }

      // Skip duplicates
      if (this.isDuplicate(event)) {
        skipped.push(event);
        continue;
      }

      passed.push(event);
    }

    return { passed, skipped };
  }

  /**
   * Check if event is a duplicate based on content hash
   */
  private isDuplicate(event: ExtractionEvent): boolean {
    const hash = this.hashContent(event.content);

    if (this.recentHashes.has(hash)) {
      return true;
    }

    // Add to recent hashes
    this.recentHashes.add(hash);

    // Limit cache size
    if (this.recentHashes.size > this.maxRecentHashes) {
      const firstHash = this.recentHashes.values().next().value;
      if (firstHash !== undefined) {
        this.recentHashes.delete(firstHash);
      }
    }

    return false;
  }

  /**
   * Simple string hash for deduplication
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Step 2: Heuristic extraction without LLM
   */
  private heuristicExtract(events: ExtractionEvent[]): ExtractionResult {
    const entities: Partial<KGEntity>[] = [];
    const edges: Partial<KGEdge>[] = [];
    const facts: Partial<KGFact>[] = [];
    const topics: ExtractedTopic[] = [];
    const entityMap = new Map<string, Partial<KGEntity>>();

    for (const event of events) {
      const text = event.content;
      const eventId = event.id;

      // Extract entities
      const extractedEntities = this.extractEntitiesHeuristic(text, eventId);
      for (const partial of extractedEntities) {
        const name = partial.name || '';
        if (!name) continue;
        const key = name.toLowerCase();

        if (!entityMap.has(key)) {
          const entity: Partial<KGEntity> = {
            id: `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            entityType: partial.entityType || 'other',
            aliases: partial.aliases || [],
            description: partial.description || '',
            importance: 0.7,
            accessCount: 0,
            sourceEventIds: [eventId],
            firstSeen: event.timestamp,
            lastSeen: event.timestamp,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          entityMap.set(key, entity);
          entities.push(entity);
        } else {
          // Update existing entity
          const existing = entityMap.get(key)!;
          const sourceEvents = existing.sourceEventIds || [];
          if (!sourceEvents.includes(eventId)) {
            sourceEvents.push(eventId);
          }
          existing.sourceEventIds = sourceEvents;
          existing.lastSeen = event.timestamp;
        }
      }

      // Extract facts
      const extractedFacts = this.extractFactsHeuristic(text, eventId);
      for (const partial of extractedFacts) {
        const subject = partial.subject || '';
        const predicate = partial.predicate || '';
        const object = partial.object || '';
        if (!subject || !predicate || !object) continue;

        const fact: Partial<KGFact> = {
          id: `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          subject,
          predicate,
          object,
          factType: partial.factType || 'relation',
          factText: partial.factText || `${subject} ${predicate} ${object}`,
          confidence: partial.confidence || 0.6,
          strength: 0.5,
          sourceEventIds: [eventId],
          timesRetrieved: 0,
          timesUsed: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        facts.push(fact);

        // Create edges from facts
        const sourceKey = subject.toLowerCase();
        const targetKey = object.toLowerCase();
        const sourceEntity = entityMap.get(sourceKey);
        const targetEntity = entityMap.get(targetKey);

        if (sourceEntity && targetEntity) {
          const relationType = this.classifyRelationType(predicate);
          const edge: Partial<KGEdge> = {
            id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sourceId: sourceEntity.id || '',
            targetId: targetEntity.id || '',
            relation: predicate,
            relationType,
            strength: partial.confidence || 0.6,
            bidirectional: false,
            evidence: [eventId],
            isCurrent: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          edges.push(edge);
        }
      }

      // Extract topics (simple keyword extraction)
      const words = text.toLowerCase().split(/\s+/);
      const keywords = words.filter((w) => w.length > 4);
      if (keywords.length > 0) {
        const topicLabel = keywords.slice(0, 3).join(' ');
        const topic: ExtractedTopic = {
          label: topicLabel,
          keywords: keywords.slice(0, 10),
          relevance: 0.5,
        };
        topics.push(topic);
      }
    }

    return {
      entities,
      edges,
      facts,
      topics,
      skippedCount: 0,
      llmCallCount: 0,
      durationMs: 0,
    };
  }

  /**
   * Extract entities from text using pattern matching
   */
  private extractEntitiesHeuristic(text: string, _eventId: string): Partial<KGEntity>[] {
    const entities: Partial<KGEntity>[] = [];

    // Extract URLs (websites)
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = text.match(urlRegex) || [];
    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        entities.push({
          name: urlObj.hostname,
          entityType: 'website',
          importance: 0.95,
        });
      } catch {
        // Invalid URL, skip
      }
    }

    // Extract file paths
    const fileRegex = /(?:\/|\\|[A-Za-z]:\\)(?:[^\s\/\\]+(?:\/|\\))*[^\s\/\\]+\.[a-z]{2,5}\b/gi;
    const files = text.match(fileRegex) || [];
    for (const file of files) {
      const fileName = file.split(/[\/\\]/).pop() || file;
      entities.push({
        name: fileName,
        entityType: 'file',
        importance: 0.9,
      });
    }

    // Extract emails (person)
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailRegex) || [];
    for (const email of emails) {
      const name = email.split('@')[0].replace(/[._]/g, ' ');
      entities.push({
        name,
        entityType: 'person',
        aliases: [email],
        importance: 0.85,
      });
    }

    // Extract @mentions (person)
    const mentionRegex = /@([A-Za-z0-9_]+)/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      entities.push({
        name: match[1],
        entityType: 'person',
        importance: 0.8,
      });
    }

    // Extract capitalized names (person or organization)
    const capitalizedRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    while ((match = capitalizedRegex.exec(text)) !== null) {
      const name = match[1];
      const entityType = this.classifyEntityType(name, text);
      entities.push({
        name,
        entityType,
        importance: 0.7,
      });
    }

    return entities;
  }

  /**
   * Extract facts from text using pattern matching
   */
  private extractFactsHeuristic(text: string, _eventId: string): Partial<KGFact>[] {
    const facts: Partial<KGFact>[] = [];

    // Pattern: "X uses Y"
    const usesRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:uses|using)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;
    let match;
    while ((match = usesRegex.exec(text)) !== null) {
      facts.push({
        subject: match[1].trim(),
        predicate: 'uses',
        object: match[2].trim(),
        factType: 'relation',
        confidence: 0.7,
      });
    }

    // Pattern: "X works on Y"
    const worksRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:works on|working on)\s+([A-Za-z0-9\s]+)/gi;
    while ((match = worksRegex.exec(text)) !== null) {
      facts.push({
        subject: match[1].trim(),
        predicate: 'works on',
        object: match[2].trim(),
        factType: 'relation',
        confidence: 0.7,
      });
    }

    // Pattern: "X is Y" (definition)
    const isRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+(?:a|an|the)?\s*([a-z]+(?:\s+[a-z]+)*)/gi;
    while ((match = isRegex.exec(text)) !== null) {
      facts.push({
        subject: match[1].trim(),
        predicate: 'is',
        object: match[2].trim(),
        factType: 'attribute',
        confidence: 0.6,
      });
    }

    return facts;
  }

  /**
   * Classify entity type using keyword matching
   */
  classifyEntityType(name: string, context?: string): KGEntityType {
    const lowerName = name.toLowerCase();
    const searchText = context ? `${name} ${context}`.toLowerCase() : lowerName;

    // Check each type's keywords
    for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          return type as KGEntityType;
        }
      }
    }

    // Heuristics based on name structure
    if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(name)) {
      return 'person'; // Two capitalized words likely a person name
    }

    if (/\s+(Inc|Corp|Ltd|LLC|Company)$/i.test(name)) {
      return 'organization';
    }

    if (/^[A-Z]{2,}$/.test(name)) {
      return 'organization'; // Acronym likely an org
    }

    return 'other';
  }

  /**
   * Classify relation type using keyword matching
   */
  classifyRelationType(relation: string): KGRelationType {
    const lowerRelation = relation.toLowerCase();

    for (const [type, keywords] of Object.entries(RELATION_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerRelation.includes(keyword.toLowerCase())) {
          return type as KGRelationType;
        }
      }
    }

    return 'other';
  }

  /**
   * Step 3: Batch LLM extraction
   */
  private async batchLLMExtract(events: ExtractionEvent[]): Promise<ExtractionResult> {
    const allEntities: Partial<KGEntity>[] = [];
    const allEdges: Partial<KGEdge>[] = [];
    const allFacts: Partial<KGFact>[] = [];
    const allTopics: ExtractedTopic[] = [];
    let totalLLMCalls = 0;
    let totalCost = 0;

    // Process in batches
    for (let i = 0; i < events.length; i += this.config.batchSize) {
      const batch = events.slice(i, i + this.config.batchSize);
      const prompt = this.buildExtractionPrompt(batch);

      try {
        // Track cost
        const inputTokens = estimateTokens(prompt);
        const startTime = Date.now();

        const response = await this.llmCall!(prompt);

        const outputTokens = estimateTokens(response);
        const _durationMs = Date.now() - startTime;
        const model = 'gpt-4o-mini';
        const cost = calculateCost(model, inputTokens, outputTokens);

        this.costEntries.push({
          id: `cost_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          model,
          source: 'extraction' as CostSource,
          inputTokens,
          outputTokens,
          cost,
          metadata: { batchSize: batch.length },
          timestamp: Date.now(),
        });

        totalLLMCalls++;
        totalCost += cost;

        // Parse response
        const partial = this.parseLLMResponse(response);

        // Convert partial entities to full entities
        for (const e of partial.entities || []) {
          if (!e.name) continue;
          const entity: Partial<KGEntity> = {
            id: `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: e.name,
            entityType: e.entityType || 'other',
            aliases: e.aliases || [],
            description: e.description || '',
            importance: 0.8,
            accessCount: 0,
            sourceEventIds: batch.map((b) => b.id),
            firstSeen: batch[0].timestamp,
            lastSeen: batch[batch.length - 1].timestamp,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          allEntities.push(entity);
        }

        // Convert partial edges
        for (const edge of partial.edges || []) {
          const fullEdge: Partial<KGEdge> = {
            id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sourceId: edge.sourceId || '',
            targetId: edge.targetId || '',
            relation: edge.relation || '',
            relationType: edge.relationType || 'other',
            strength: edge.strength || 0.7,
            bidirectional: false,
            evidence: batch.map((b) => b.id),
            isCurrent: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          allEdges.push(fullEdge);
        }

        // Convert partial facts
        for (const f of partial.facts || []) {
          if (!f.subject || !f.predicate || !f.object) continue;
          const fact: Partial<KGFact> = {
            id: `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            subject: f.subject,
            predicate: f.predicate,
            object: f.object,
            factType: f.factType || 'relation',
            factText: f.factText || `${f.subject} ${f.predicate} ${f.object}`,
            confidence: f.confidence || 0.8,
            strength: 0.5,
            sourceEventIds: [batch[0].id],
            timesRetrieved: 0,
            timesUsed: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          allFacts.push(fact);
        }

        // Add topics
        allTopics.push(...(partial.topics || []));
      } catch (error) {
        console.error('[ExtractionPipeline] Batch LLM extraction failed:', error);
        // Continue with next batch
      }
    }

    return {
      entities: allEntities,
      edges: allEdges,
      facts: allFacts,
      topics: allTopics,
      skippedCount: 0,
      llmCallCount: totalLLMCalls,
      durationMs: 0,
    };
  }

  /**
   * Build extraction prompt for a batch of events
   */
  private buildExtractionPrompt(batch: ExtractionEvent[]): string {
    const eventDescriptions = batch
      .map(
        (e, idx) =>
          `Event ${idx + 1} [${e.type}] at ${new Date(e.timestamp).toISOString()}:\n${e.content}`
      )
      .join('\n\n');

    return `You are a knowledge graph extraction system. Given these activity events, extract structured knowledge elements.

Activity Events:
${eventDescriptions}

Extract and return JSON with the following structure:
{
  "entities": [
    {
      "name": "Entity Name",
      "entityType": "person|organization|tool|project|concept|location|website|file|event|other",
      "description": "Brief description of the entity"
    }
  ],
  "edges": [
    {
      "sourceId": "Source Entity Name",
      "targetId": "Target Entity Name",
      "relationType": "professional|social|technical|financial|spatial|temporal|causal|other",
      "relation": "specific relationship verb",
      "strength": 0.8
    }
  ],
  "facts": [
    {
      "subject": "Subject",
      "predicate": "relationship or action",
      "object": "Object",
      "factText": "Full sentence describing the fact",
      "confidence": 0.9
    }
  ],
  "topics": [
    {
      "label": "Topic Name",
      "keywords": ["keyword1", "keyword2"],
      "relevance": 0.7
    }
  ]
}

Focus on:
- Identifying key entities (people, tools, projects, concepts)
- Relationships between entities
- Facts about what happened or was observed
- Main topics discussed

Return only valid JSON. Be concise and focus on the most important elements.`;
  }

  /**
   * Parse LLM response into extraction results
   */
  private parseLLMResponse(response: string): Partial<ExtractionResult> {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[ExtractionPipeline] No JSON found in LLM response');
        return {};
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        entities: parsed.entities || [],
        edges: parsed.edges || [],
        facts: parsed.facts || [],
        topics: parsed.topics || [],
      };
    } catch (error) {
      console.error('[ExtractionPipeline] Failed to parse LLM response:', error);
      return {};
    }
  }

  /**
   * Merge heuristic and LLM results, deduplicating entities
   */
  private mergeResults(
    heuristic: ExtractionResult,
    llm: ExtractionResult | null,
    meta: { skippedCount: number; llmCallCount: number; durationMs: number }
  ): ExtractionResult {
    if (!llm) {
      return {
        ...heuristic,
        skippedCount: meta.skippedCount,
        llmCallCount: 0,
        durationMs: meta.durationMs,
      };
    }

    // Deduplicate entities by name
    const entityMap = new Map<string, Partial<KGEntity>>();

    // Add heuristic entities first
    for (const entity of heuristic.entities) {
      const name = entity.name || '';
      if (!name) continue;
      const key = name.toLowerCase();
      entityMap.set(key, entity);
    }

    // Merge LLM entities (prefer LLM data for duplicates)
    for (const entity of llm.entities) {
      const name = entity.name || '';
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = entityMap.get(key);

      if (existing) {
        // Merge fields
        existing.description = entity.description || existing.description;
        existing.aliases = [
          ...new Set([...(existing.aliases || []), ...(entity.aliases || [])]),
        ];
        existing.sourceEventIds = [
          ...new Set([
            ...(existing.sourceEventIds || []),
            ...(entity.sourceEventIds || []),
          ]),
        ];
        const existingImportance = existing.importance || 0;
        const entityImportance = entity.importance || 0;
        existing.importance = Math.max(existingImportance, entityImportance);
      } else {
        entityMap.set(key, entity);
      }
    }

    const mergedEntities = Array.from(entityMap.values());

    // Combine edges and facts (no dedup for now, could add later)
    const mergedEdges = [...heuristic.edges, ...llm.edges];
    const mergedFacts = [...heuristic.facts, ...llm.facts];
    const mergedTopics = [...heuristic.topics, ...llm.topics];

    return {
      entities: mergedEntities,
      edges: mergedEdges,
      facts: mergedFacts,
      topics: mergedTopics,
      skippedCount: meta.skippedCount,
      llmCallCount: meta.llmCallCount,
      durationMs: meta.durationMs,
    };
  }

  /**
   * Get accumulated cost entries
   */
  getCostEntries(): CostEntry[] {
    return [...this.costEntries];
  }

  /**
   * Clear cost entries
   */
  clearCostEntries(): void {
    this.costEntries = [];
  }
}
