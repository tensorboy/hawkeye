/**
 * Knowledge Extractor — Entity extraction from screen observations
 *
 * Extracts entities (person, project, technology, concept, place) from
 * OCR text and window titles. Manages entity deduplication using
 * label + alias matching (borrowed from Omi's approach).
 */

import type {
  KnowledgeEntity,
  KnowledgeEdge,
  KnowledgeNodeType,
  EntityExtractionResult,
} from './types';

// ============ ID Generation ============
let _kgCounter = 0;
function generateKgId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++_kgCounter}`;
}

// ============ Quick regex patterns for common entities ============
// These run before LLM for fast extraction

const TECH_KEYWORDS: Record<string, KnowledgeNodeType> = {
  // Languages
  'typescript': 'technology', 'javascript': 'technology', 'python': 'technology',
  'rust': 'technology', 'swift': 'technology', 'kotlin': 'technology',
  'java': 'technology', 'go': 'technology', 'ruby': 'technology',
  'c++': 'technology', 'c#': 'technology', 'php': 'technology',
  // Frameworks
  'react': 'technology', 'vue': 'technology', 'angular': 'technology',
  'nextjs': 'technology', 'next.js': 'technology',
  'tauri': 'technology', 'electron': 'technology', 'flutter': 'technology',
  'django': 'technology', 'fastapi': 'technology', 'express': 'technology',
  'pytorch': 'technology', 'tensorflow': 'technology',
  // Tools
  'docker': 'technology', 'kubernetes': 'technology', 'git': 'technology',
  'webpack': 'technology', 'vite': 'technology', 'npm': 'technology',
  'pnpm': 'technology', 'cargo': 'technology',
  // Databases
  'postgresql': 'technology', 'mysql': 'technology', 'redis': 'technology',
  'mongodb': 'technology', 'sqlite': 'technology',
};

// Pattern: @username or common person name patterns (CamelCase in code, etc.)
const PERSON_PATTERN = /@(\w{2,20})/g;
// Pattern: project names from paths like /project-name/ or repo:project-name
const PROJECT_PATH_PATTERN = /(?:\/|repo:|github\.com\/)([a-zA-Z][\w-]{2,30})/g;

export class KnowledgeExtractor {
  private aiChat: ((system: string, user: string) => Promise<string>) | null = null;
  private entities: Map<string, KnowledgeEntity> = new Map();
  private edges: Map<string, KnowledgeEdge> = new Map();

  constructor() {}

  setAIChat(fn: (system: string, user: string) => Promise<string>): void {
    this.aiChat = fn;
  }

  /** Load existing entities (from persisted state) */
  loadEntities(entities: KnowledgeEntity[], edges: KnowledgeEdge[]): void {
    this.entities.clear();
    this.edges.clear();
    for (const e of entities) this.entities.set(e.id, e);
    for (const edge of edges) this.edges.set(edge.id, edge);
  }

  getEntities(): KnowledgeEntity[] {
    return [...this.entities.values()];
  }

  getEdges(): KnowledgeEdge[] {
    return [...this.edges.values()];
  }

  /**
   * Extract entities from screen observation context and update the knowledge graph.
   * Returns IDs of entities found/updated for this observation.
   */
  async extractFromContext(
    ocrText: string | undefined,
    windowTitle: string | undefined,
    appName: string | undefined,
    treeNodeId: string,
  ): Promise<string[]> {
    const combinedText = [windowTitle, appName, ocrText?.slice(0, 500)].filter(Boolean).join(' ');
    if (combinedText.length < 5) return [];

    // Phase 1: Fast regex extraction
    const regexEntities = this.extractByRegex(combinedText);

    // Phase 2: LLM extraction (if available and text is substantial enough)
    let llmEntities: EntityExtractionResult = { entities: [], relations: [] };
    if (this.aiChat && combinedText.length > 30) {
      try {
        llmEntities = await this.extractByLLM(combinedText);
      } catch {
        // Fall through to regex-only results
      }
    }

    // Merge and deduplicate
    const allRawEntities = [
      ...regexEntities,
      ...llmEntities.entities,
    ];

    const touchedEntityIds: string[] = [];

    for (const raw of allRawEntities) {
      const entity = this.upsertEntity(raw.label, raw.type, raw.aliases || [], treeNodeId);
      touchedEntityIds.push(entity.id);
    }

    // Process relations from LLM
    for (const rel of llmEntities.relations) {
      this.upsertEdge(rel.sourceLabel, rel.targetLabel, rel.relation, treeNodeId);
    }

    // Auto-generate co-occurrence edges for entities found in same context
    if (touchedEntityIds.length >= 2) {
      this.createCoOccurrenceEdges(touchedEntityIds, treeNodeId);
    }

    return touchedEntityIds;
  }

  // ============ Regex Extraction ============

  private extractByRegex(text: string): Array<{ label: string; type: KnowledgeNodeType; aliases: string[] }> {
    const found: Array<{ label: string; type: KnowledgeNodeType; aliases: string[] }> = [];
    const textLower = text.toLowerCase();
    const seen = new Set<string>();

    // Match technology keywords
    for (const [keyword, type] of Object.entries(TECH_KEYWORDS)) {
      // Word boundary check: ensure it's not part of a larger word
      const idx = textLower.indexOf(keyword);
      if (idx !== -1) {
        const before = idx > 0 ? textLower[idx - 1] : ' ';
        const after = idx + keyword.length < textLower.length ? textLower[idx + keyword.length] : ' ';
        const isWord = /[\s\.,;:!?\/\-\(\)]/.test(before) && /[\s\.,;:!?\/\-\(\)]/.test(after);
        if (isWord || idx === 0) {
          const normalized = keyword.charAt(0).toUpperCase() + keyword.slice(1);
          if (!seen.has(normalized.toLowerCase())) {
            seen.add(normalized.toLowerCase());
            found.push({ label: normalized, type, aliases: [keyword] });
          }
        }
      }
    }

    // Match @person patterns
    const personMatches = text.matchAll(PERSON_PATTERN);
    for (const match of personMatches) {
      const name = match[1];
      if (!seen.has(name.toLowerCase()) && name.length >= 2) {
        seen.add(name.toLowerCase());
        found.push({ label: name, type: 'person', aliases: [`@${name}`] });
      }
    }

    // Match project paths
    const pathMatches = text.matchAll(PROJECT_PATH_PATTERN);
    for (const match of pathMatches) {
      const name = match[1];
      // Filter out common non-project words
      const skipWords = new Set(['users', 'home', 'desktop', 'documents', 'downloads', 'src', 'lib', 'bin', 'usr', 'var', 'tmp', 'etc', 'opt', 'node_modules', 'dist', 'build', 'target']);
      if (!seen.has(name.toLowerCase()) && !skipWords.has(name.toLowerCase()) && name.length >= 3) {
        seen.add(name.toLowerCase());
        found.push({ label: name, type: 'project', aliases: [] });
      }
    }

    return found;
  }

  // ============ LLM Extraction ============

  private async extractByLLM(text: string): Promise<EntityExtractionResult> {
    if (!this.aiChat) return { entities: [], relations: [] };

    // Build existing entities context for dedup (Omi's approach)
    const existingLabels = [...this.entities.values()]
      .map(e => `${e.label} (${e.type})`)
      .slice(0, 50) // Cap to avoid huge prompts
      .join(', ');

    const systemPrompt = `You extract knowledge entities from screen content. Return valid JSON only.`;

    const userPrompt = `Extract entities and relationships from this screen observation.

Screen content:
${text.slice(0, 600)}

${existingLabels ? `EXISTING ENTITIES (reuse these EXACT labels if matched):\n${existingLabels}\n` : ''}
Entity types: person, project, technology, concept, place

Rules:
- CRITICAL: If a new entity matches or is similar to an existing one, use the EXACT SAME LABEL
- Skip generic words: "file", "window", "app", "code", "page", "the", "settings"
- Skip dates, times, numbers
- Max 5 entities per extraction
- Only include entities clearly present in the text

Respond with JSON only:
{"entities": [{"label": "Name", "type": "person|project|technology|concept|place", "aliases": ["alt_name"]}], "relations": [{"sourceLabel": "A", "targetLabel": "B", "relation": "uses|works_with|belongs_to|creates|manages"}]}`;

    const response = await this.aiChat(systemPrompt, userPrompt);

    // Parse JSON, handling markdown code blocks
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as EntityExtractionResult;

    // Validate structure
    if (!Array.isArray(parsed.entities)) parsed.entities = [];
    if (!Array.isArray(parsed.relations)) parsed.relations = [];

    return parsed;
  }

  // ============ Entity Deduplication & Upsert ============

  /**
   * Find existing entity by label or aliases (case-insensitive).
   * This is the core dedup logic borrowed from Omi.
   */
  findEntityByLabel(label: string): KnowledgeEntity | null {
    const labelLower = label.toLowerCase();

    for (const entity of this.entities.values()) {
      if (entity.label.toLowerCase() === labelLower) return entity;
      if (entity.aliases.some(a => a.toLowerCase() === labelLower)) return entity;
    }
    return null;
  }

  private upsertEntity(
    label: string,
    type: KnowledgeNodeType,
    aliases: string[],
    treeNodeId: string,
  ): KnowledgeEntity {
    const existing = this.findEntityByLabel(label);

    if (existing) {
      // Merge
      existing.lastSeen = Date.now();
      existing.frequency += 1;
      if (!existing.sourceNodeIds.includes(treeNodeId)) {
        existing.sourceNodeIds.push(treeNodeId);
      }
      // Merge new aliases
      for (const alias of aliases) {
        if (!existing.aliases.some(a => a.toLowerCase() === alias.toLowerCase())) {
          existing.aliases.push(alias);
        }
      }
      return existing;
    }

    // Create new
    const entity: KnowledgeEntity = {
      id: generateKgId('ke'),
      label,
      type,
      aliases,
      sourceNodeIds: [treeNodeId],
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      frequency: 1,
    };
    this.entities.set(entity.id, entity);
    return entity;
  }

  // ============ Edge Management ============

  private upsertEdge(
    sourceLabel: string,
    targetLabel: string,
    relation: string,
    treeNodeId: string,
  ): KnowledgeEdge | null {
    const source = this.findEntityByLabel(sourceLabel);
    const target = this.findEntityByLabel(targetLabel);
    if (!source || !target || source.id === target.id) return null;

    const edgeId = `${source.id}_${relation}_${target.id}`;
    const existing = this.edges.get(edgeId);

    if (existing) {
      if (!existing.sourceNodeIds.includes(treeNodeId)) {
        existing.sourceNodeIds.push(treeNodeId);
      }
      existing.strength = Math.min(1, existing.strength + 0.1);
      return existing;
    }

    const edge: KnowledgeEdge = {
      id: edgeId,
      sourceEntityId: source.id,
      targetEntityId: target.id,
      relation,
      strength: 0.3,
      sourceNodeIds: [treeNodeId],
    };
    this.edges.set(edge.id, edge);
    return edge;
  }

  /**
   * Create co-occurrence edges between entities found in the same observation.
   * This builds implicit relationships based on proximity.
   */
  private createCoOccurrenceEdges(entityIds: string[], treeNodeId: string): void {
    for (let i = 0; i < entityIds.length; i++) {
      for (let j = i + 1; j < entityIds.length; j++) {
        const a = this.entities.get(entityIds[i]);
        const b = this.entities.get(entityIds[j]);
        if (!a || !b) continue;

        const edgeId = `${a.id}_co_occurs_${b.id}`;
        const reverseId = `${b.id}_co_occurs_${a.id}`;
        const existing = this.edges.get(edgeId) || this.edges.get(reverseId);

        if (existing) {
          if (!existing.sourceNodeIds.includes(treeNodeId)) {
            existing.sourceNodeIds.push(treeNodeId);
          }
          existing.strength = Math.min(1, existing.strength + 0.05);
        } else {
          this.edges.set(edgeId, {
            id: edgeId,
            sourceEntityId: a.id,
            targetEntityId: b.id,
            relation: 'co_occurs',
            strength: 0.15,
            sourceNodeIds: [treeNodeId],
          });
        }
      }
    }
  }

  // ============ Query Helpers ============

  /** Get entities associated with a specific tree node */
  getEntitiesForNode(nodeId: string): KnowledgeEntity[] {
    return [...this.entities.values()].filter(e => e.sourceNodeIds.includes(nodeId));
  }

  /** Get tree node IDs that share entities with the given node (cross-stage connections) */
  getConnectedNodeIds(nodeId: string): string[] {
    const nodeEntities = this.getEntitiesForNode(nodeId);
    const connectedIds = new Set<string>();

    for (const entity of nodeEntities) {
      for (const srcId of entity.sourceNodeIds) {
        if (srcId !== nodeId) connectedIds.add(srcId);
      }
    }

    return [...connectedIds];
  }

  /** Get edges between entities that bridge two different tree nodes */
  getCrossNodeEdges(): Array<{ fromNodeId: string; toNodeId: string; entityLabel: string; strength: number }> {
    const crossEdges: Array<{ fromNodeId: string; toNodeId: string; entityLabel: string; strength: number }> = [];

    for (const entity of this.entities.values()) {
      if (entity.sourceNodeIds.length < 2) continue;

      // Each pair of source nodes is connected via this entity
      const nodes = entity.sourceNodeIds;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          crossEdges.push({
            fromNodeId: nodes[i],
            toNodeId: nodes[j],
            entityLabel: entity.label,
            strength: Math.min(1, entity.frequency * 0.1),
          });
        }
      }
    }

    return crossEdges;
  }

  /** Get top N most frequently observed entities */
  getTopEntities(n: number = 10): KnowledgeEntity[] {
    return [...this.entities.values()]
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, n);
  }

  /**
   * Record that the user actually LOOKED at this entity (via gaze→entity
   * coupling), not just that it appeared on screen. This is a stronger
   * signal of attention than `frequency`.
   *
   * Match is by label (case-insensitive) or alias — same dedup logic as
   * upsert. Silently no-ops if the entity isn't tracked yet.
   */
  recordGaze(label: string, dwellMs: number, appName?: string): KnowledgeEntity | null {
    const entity = this.findEntityByLabel(label);
    if (!entity) return null;

    if (!entity.gazeHistory) entity.gazeHistory = [];
    entity.gazeHistory.push({ timestamp: Date.now(), dwellMs, appName });
    entity.totalAttentionMs = (entity.totalAttentionMs ?? 0) + dwellMs;
    entity.lastSeen = Date.now();
    return entity;
  }

  /**
   * Get top N entities ordered by ACTUAL attention (total dwell time),
   * not just appearance frequency. Falls back to frequency for entities
   * with no gaze history.
   */
  getTopByAttention(n: number = 10): KnowledgeEntity[] {
    return [...this.entities.values()]
      .map((e) => ({
        e,
        score: e.totalAttentionMs ?? e.frequency * 100, // 100ms-equivalent per observation
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map((x) => x.e);
  }

  /** Remove an entity and all its edges */
  removeEntity(entityId: string): void {
    this.entities.delete(entityId);
    for (const [edgeId, edge] of this.edges) {
      if (edge.sourceEntityId === entityId || edge.targetEntityId === entityId) {
        this.edges.delete(edgeId);
      }
    }
  }

  /** Clear all knowledge data */
  clear(): void {
    this.entities.clear();
    this.edges.clear();
  }
}
