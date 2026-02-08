/**
 * Hierarchical Memory Manager - 分层记忆管理器
 * 基于 memU 的三层记忆架构
 *
 * 层级结构：
 * 1. Resource (资源层) - 原始数据
 * 2. Item (记忆项层) - 提取的独立记忆
 * 3. Category (类别层) - 聚合摘要
 */

import type { IAIProvider, AIMessage } from '../../ai/types';
import type {
  MemoryResource,
  MemoryItem,
  MemoryCategory,
  CategoryItemLink,
  MemoryType,
  MemoryHierarchy,
  TheoryOfMindItem,
} from './types';
import {
  extractReferences,
  buildItemRefId,
  buildCategorySummaryPrompt,
} from './references';
import { linkAllMemories, type LinkedMemory } from './memory-linking';
import { extractTheoryOfMind } from './theory-of-mind';
import {
  detectNewClusters,
  clusterByEmbedding,
  generateClusterName,
  clusterToCategory,
} from './clustering';
import type { EmbeddingProvider } from './types';

// ============ 配置 ============

export interface HierarchyConfig {
  /** 默认记忆类型 */
  defaultMemoryTypes: MemoryType[];
  /** 是否自动生成类别摘要 */
  autoGenerateSummary: boolean;
  /** 是否自动发现新类别 */
  autoDiscoverCategories: boolean;
  /** 是否提取心智推断 */
  extractTheoryOfMind: boolean;
  /** 是否自动链接相关记忆 */
  autoLinkMemories: boolean;
  /** 最大类别摘要长度 */
  maxSummaryLength: number;
}

export const DEFAULT_HIERARCHY_CONFIG: HierarchyConfig = {
  defaultMemoryTypes: ['profile', 'event'],
  autoGenerateSummary: true,
  autoDiscoverCategories: true,
  extractTheoryOfMind: true,
  autoLinkMemories: true,
  maxSummaryLength: 500,
};

// ============ Prompts ============

const MEMORY_EXTRACTION_PROMPT = `You are extracting memory items from a conversation for {characterName}.

**MEMORY TYPES:**
- profile: Personal facts, preferences, traits, background
- event: Specific happenings with time context
- knowledge: Learned information, opinions, beliefs
- behavior: Patterns of action, habits, routines
- skill: Abilities, competencies, expertise

**EXTRACTION RULES:**
1. Each item must be SELF-CONTAINED (no pronouns referring to other items)
2. Use "{characterName}" as the subject, not "they/he/she"
3. Keep each item under 30 words
4. Include specific details (names, places, dates when mentioned)
5. Do NOT include timestamps in the memory item itself

**CATEGORIES:**
{categoriesPrompt}

**CONVERSATION:**
{conversationText}

**OUTPUT FORMAT:**
For each memory item:
TYPE: [profile/event/knowledge/behavior/skill]
CONTENT: [The self-contained memory item]
CATEGORIES: [comma-separated category names]

---
`;

const CATEGORY_SUMMARY_PROMPT = `You are updating the summary for the "{categoryName}" memory category.

Existing Summary:
{existingSummary}

New Memory Items:
{newMemories}

Instructions:
1. Create a coherent summary incorporating all relevant information
2. Use [ref:REFID] to cite specific items (e.g., [ref:abc123])
3. Keep the summary concise ({maxLength} characters max)
4. Preserve important details from existing summary
5. Remove outdated info if contradicted by new items

Updated Summary:`;

// ============ 主类 ============

export class HierarchicalMemoryManager {
  private config: HierarchyConfig;
  private resources: Map<string, MemoryResource> = new Map();
  private items: Map<string, MemoryItem> = new Map();
  private categories: Map<string, MemoryCategory> = new Map();
  private categoryLinks: CategoryItemLink[] = [];
  private theoryOfMind: TheoryOfMindItem[] = [];

  constructor(config: Partial<HierarchyConfig> = {}) {
    this.config = { ...DEFAULT_HIERARCHY_CONFIG, ...config };
  }

  // ============ Resource Layer ============

  /**
   * 添加资源
   */
  addResource(resource: Omit<MemoryResource, 'id' | 'createdAt' | 'updatedAt'>): MemoryResource {
    const now = Date.now();
    const fullResource: MemoryResource = {
      ...resource,
      id: `res_${now}_${randomHex(4)}`,
      createdAt: now,
      updatedAt: now,
    };

    this.resources.set(fullResource.id, fullResource);
    return fullResource;
  }

  /**
   * 获取资源
   */
  getResource(id: string): MemoryResource | undefined {
    return this.resources.get(id);
  }

  // ============ Item Layer ============

  /**
   * 从文本中提取记忆项
   */
  async extractMemoryItems(
    text: string,
    resourceId: string | undefined,
    characterName: string,
    llmProvider: IAIProvider,
    embeddingProvider: EmbeddingProvider
  ): Promise<MemoryItem[]> {
    // 构建类别提示
    const categoriesPrompt = this.formatCategoriesForPrompt();

    const prompt = MEMORY_EXTRACTION_PROMPT
      .replace('{characterName}', characterName)
      .replace('{conversationText}', text)
      .replace('{categoriesPrompt}', categoriesPrompt)
      .replace(/{characterName}/g, characterName);

    const messages: AIMessage[] = [{ role: 'user', content: prompt }];
    const response = await llmProvider.chat(messages);

    const extractedItems = this.parseExtractedItems(response.text, resourceId);

    // 生成 embeddings
    const summaries = extractedItems.map((item) => item.summary);
    const embeddings = await embeddingProvider.embedBatch(summaries);

    for (let i = 0; i < extractedItems.length; i++) {
      extractedItems[i].embedding = embeddings[i];
      extractedItems[i].refId = buildItemRefId(extractedItems[i].id);
      this.items.set(extractedItems[i].id, extractedItems[i]);
    }

    // 自动链接
    if (this.config.autoLinkMemories && extractedItems.length > 1) {
      const allItems = Array.from(this.items.values());
      const linked = linkAllMemories(allItems);
      for (const linkedItem of linked) {
        const existing = this.items.get(linkedItem.id);
        if (existing) {
          existing.relatedIds = linkedItem.relatedIds;
        }
      }
    }

    return extractedItems;
  }

  /**
   * 添加记忆项
   */
  addItem(item: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'refId'>): MemoryItem {
    const now = Date.now();
    const fullItem: MemoryItem = {
      ...item,
      id: `item_${now}_${randomHex(4)}`,
      refId: '',
      createdAt: now,
      updatedAt: now,
    };
    fullItem.refId = buildItemRefId(fullItem.id);

    this.items.set(fullItem.id, fullItem);
    return fullItem;
  }

  /**
   * 获取记忆项
   */
  getItem(id: string): MemoryItem | undefined {
    return this.items.get(id);
  }

  /**
   * 按类型获取记忆项
   */
  getItemsByType(memoryType: MemoryType): MemoryItem[] {
    return Array.from(this.items.values())
      .filter((item) => item.memoryType === memoryType);
  }

  // ============ Category Layer ============

  /**
   * 添加或更新类别
   */
  upsertCategory(
    name: string,
    description: string,
    embedding?: number[]
  ): MemoryCategory {
    const existing = Array.from(this.categories.values())
      .find((c) => c.name === name);

    if (existing) {
      existing.description = description;
      existing.embedding = embedding || existing.embedding;
      existing.updatedAt = Date.now();
      return existing;
    }

    const now = Date.now();
    const category: MemoryCategory = {
      id: `cat_${now}_${randomHex(4)}`,
      name,
      description,
      embedding,
      createdAt: now,
      updatedAt: now,
    };

    this.categories.set(category.id, category);
    return category;
  }

  /**
   * 获取类别
   */
  getCategory(id: string): MemoryCategory | undefined {
    return this.categories.get(id);
  }

  /**
   * 按名称获取类别
   */
  getCategoryByName(name: string): MemoryCategory | undefined {
    return Array.from(this.categories.values())
      .find((c) => c.name === name);
  }

  /**
   * 链接记忆项到类别
   */
  linkItemToCategory(itemId: string, categoryId: string): void {
    // 检查是否已存在
    const exists = this.categoryLinks.some(
      (l) => l.itemId === itemId && l.categoryId === categoryId
    );
    if (exists) return;

    this.categoryLinks.push({
      id: `link_${Date.now()}_${randomHex(4)}`,
      itemId,
      categoryId,
      createdAt: Date.now(),
    });

    // 更新类别的 itemCount
    const category = this.categories.get(categoryId);
    if (category) {
      category.itemCount = (category.itemCount || 0) + 1;
    }
  }

  /**
   * 获取类别下的所有记忆项
   */
  getItemsInCategory(categoryId: string): MemoryItem[] {
    const itemIds = this.categoryLinks
      .filter((l) => l.categoryId === categoryId)
      .map((l) => l.itemId);

    return itemIds
      .map((id) => this.items.get(id))
      .filter((item): item is MemoryItem => !!item);
  }

  /**
   * 更新类别摘要
   */
  async updateCategorySummary(
    categoryId: string,
    newItemIds: string[],
    llmProvider: IAIProvider
  ): Promise<string | undefined> {
    const category = this.categories.get(categoryId);
    if (!category) return undefined;

    const newItems = newItemIds
      .map((id) => this.items.get(id))
      .filter((item): item is MemoryItem => !!item);

    if (newItems.length === 0) return category.summary;

    const newMemoriesText = newItems
      .map((item) => `- [${item.refId}]: ${item.summary}`)
      .join('\n');

    const prompt = CATEGORY_SUMMARY_PROMPT
      .replace('{categoryName}', category.name)
      .replace('{existingSummary}', category.summary || 'No existing summary.')
      .replace('{newMemories}', newMemoriesText)
      .replace('{maxLength}', String(this.config.maxSummaryLength));

    const messages: AIMessage[] = [{ role: 'user', content: prompt }];
    const response = await llmProvider.chat(messages);

    const newSummary = response.text
      .replace(/```markdown/g, '')
      .replace(/```/g, '')
      .trim();

    category.summary = newSummary;
    category.updatedAt = Date.now();

    return newSummary;
  }

  // ============ Theory of Mind ============

  /**
   * 提取心智推断
   */
  async extractTheoryOfMindItems(
    conversationText: string,
    characterName: string,
    llmProvider: IAIProvider
  ): Promise<TheoryOfMindItem[]> {
    if (!this.config.extractTheoryOfMind) return [];

    const activityItems = this.getItemsByType('event');
    const inferences = await extractTheoryOfMind(
      conversationText,
      activityItems,
      characterName,
      llmProvider
    );

    this.theoryOfMind.push(...inferences);
    return inferences;
  }

  // ============ Auto Discovery ============

  /**
   * 自动发现新类别
   */
  async discoverCategories(
    newItems: MemoryItem[],
    conversationContext: string,
    llmProvider: IAIProvider,
    embeddingProvider: EmbeddingProvider
  ): Promise<MemoryCategory[]> {
    if (!this.config.autoDiscoverCategories) return [];

    const existingNames = Array.from(this.categories.values()).map((c) => c.name);
    const clusters = await detectNewClusters(
      newItems,
      existingNames,
      conversationContext,
      llmProvider
    );

    const newCategories: MemoryCategory[] = [];

    for (const cluster of clusters) {
      const category = clusterToCategory(cluster);

      // 生成 embedding
      const embedding = await embeddingProvider.embedQuery(
        `${category.name}: ${category.description}`
      );
      category.embedding = embedding;

      this.categories.set(category.id, category);
      newCategories.push(category);

      // 链接项目
      for (const itemId of cluster.itemIds) {
        this.linkItemToCategory(itemId, category.id);
      }
    }

    return newCategories;
  }

  // ============ Full Memorization Pipeline ============

  /**
   * 完整的记忆化流程
   * 1. 创建资源
   * 2. 提取记忆项
   * 3. 链接到类别
   * 4. 更新类别摘要
   * 5. 提取心智推断
   * 6. 发现新类别
   */
  async memorize(
    text: string,
    modality: MemoryResource['modality'],
    characterName: string,
    llmProvider: IAIProvider,
    embeddingProvider: EmbeddingProvider,
    options: {
      url?: string;
      localPath?: string;
    } = {}
  ): Promise<{
    resource: MemoryResource;
    items: MemoryItem[];
    categories: MemoryCategory[];
    theoryOfMind: TheoryOfMindItem[];
    newCategories: MemoryCategory[];
  }> {
    // 1. 创建资源
    const resource = this.addResource({
      url: options.url || `memory://${Date.now()}`,
      modality,
      localPath: options.localPath || '',
    });

    // 2. 提取记忆项
    const items = await this.extractMemoryItems(
      text,
      resource.id,
      characterName,
      llmProvider,
      embeddingProvider
    );

    // 3. 链接到类别并更新摘要
    const categoryUpdates = new Map<string, string[]>();
    for (const item of items) {
      // 这里简化处理，将 profile 类型链接到 profile 类别
      let category = this.getCategoryByName(item.memoryType);
      if (!category) {
        const embedding = await embeddingProvider.embedQuery(item.memoryType);
        category = this.upsertCategory(
          item.memoryType,
          `Memory items of type: ${item.memoryType}`,
          embedding
        );
      }
      this.linkItemToCategory(item.id, category.id);

      const existing = categoryUpdates.get(category.id) || [];
      existing.push(item.id);
      categoryUpdates.set(category.id, existing);
    }

    // 4. 更新类别摘要
    if (this.config.autoGenerateSummary) {
      for (const [categoryId, itemIds] of categoryUpdates) {
        await this.updateCategorySummary(categoryId, itemIds, llmProvider);
      }
    }

    // 5. 提取心智推断
    const tom = await this.extractTheoryOfMindItems(
      text,
      characterName,
      llmProvider
    );

    // 6. 发现新类别
    const newCategories = await this.discoverCategories(
      items,
      text,
      llmProvider,
      embeddingProvider
    );

    const updatedCategories = Array.from(categoryUpdates.keys())
      .map((id) => this.categories.get(id))
      .filter((c): c is MemoryCategory => !!c);

    return {
      resource,
      items,
      categories: updatedCategories,
      theoryOfMind: tom,
      newCategories,
    };
  }

  // ============ Export/Import ============

  /**
   * 导出完整的记忆层级结构
   */
  export(): MemoryHierarchy {
    return {
      resources: Array.from(this.resources.values()),
      items: Array.from(this.items.values()),
      categories: Array.from(this.categories.values()),
      links: this.categoryLinks,
      theoryOfMind: this.theoryOfMind,
    };
  }

  /**
   * 导入记忆层级结构
   */
  import(hierarchy: MemoryHierarchy): void {
    this.resources.clear();
    this.items.clear();
    this.categories.clear();
    this.categoryLinks = [];
    this.theoryOfMind = [];

    for (const resource of hierarchy.resources) {
      this.resources.set(resource.id, resource);
    }
    for (const item of hierarchy.items) {
      this.items.set(item.id, item);
    }
    for (const category of hierarchy.categories) {
      this.categories.set(category.id, category);
    }
    this.categoryLinks = hierarchy.links;
    this.theoryOfMind = hierarchy.theoryOfMind || [];
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    resources: number;
    items: number;
    categories: number;
    links: number;
    theoryOfMind: number;
  } {
    return {
      resources: this.resources.size,
      items: this.items.size,
      categories: this.categories.size,
      links: this.categoryLinks.length,
      theoryOfMind: this.theoryOfMind.length,
    };
  }

  // ============ Private Helpers ============

  private formatCategoriesForPrompt(): string {
    const categories = Array.from(this.categories.values());
    if (categories.length === 0) {
      return 'No categories defined yet. Extract items without category assignment.';
    }

    return categories
      .map((c) => `- ${c.name}: ${c.description}`)
      .join('\n');
  }

  private parseExtractedItems(
    response: string,
    resourceId: string | undefined
  ): MemoryItem[] {
    const items: MemoryItem[] = [];
    const blocks = response.split(/---+/);
    const now = Date.now();

    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trim());

      let memoryType: MemoryType = 'profile';
      let content = '';
      let categoryNames: string[] = [];

      for (const line of lines) {
        if (line.startsWith('TYPE:')) {
          const type = line.replace('TYPE:', '').trim().toLowerCase();
          if (isValidMemoryType(type)) {
            memoryType = type as MemoryType;
          }
        } else if (line.startsWith('CONTENT:')) {
          content = line.replace('CONTENT:', '').trim();
        } else if (line.startsWith('CATEGORIES:')) {
          categoryNames = line
            .replace('CATEGORIES:', '')
            .split(',')
            .map((c) => c.trim())
            .filter((c) => c.length > 0);
        }
      }

      if (content) {
        items.push({
          id: `item_${now}_${randomHex(4)}_${items.length}`,
          resourceId,
          memoryType,
          summary: content,
          refId: '',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return items;
  }
}

// ============ 辅助函数 ============

function randomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function isValidMemoryType(type: string): type is MemoryType {
  return ['profile', 'event', 'knowledge', 'behavior', 'skill'].includes(type);
}
