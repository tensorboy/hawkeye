/**
 * 语义记忆管理器
 * Semantic Memory Manager
 *
 * 存储结构化的知识和概念关系（知识图谱）
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  SemanticMemory,
  RelationType,
  NodeType,
  ProvenanceSource,
  SemanticMemoryConfig,
  SemanticQuery,
  MemoryQueryResult,
  DEFAULT_SEMANTIC_CONFIG,
} from './types';

/**
 * 语义记忆事件
 */
export interface SemanticMemoryEvents {
  'node:added': (node: SemanticMemory) => void;
  'node:updated': (node: SemanticMemory) => void;
  'node:removed': (id: string) => void;
  'relation:added': (sourceId: string, targetId: string, type: RelationType) => void;
  'relation:removed': (sourceId: string, targetId: string, type: RelationType) => void;
  'inference:completed': (newRelations: number) => void;
}

/**
 * 语义记忆管理器
 */
export class SemanticMemoryManager extends EventEmitter {
  private nodes: Map<string, SemanticMemory> = new Map();
  private config: SemanticMemoryConfig;

  // 索引：按名称快速查找
  private nameIndex: Map<string, Set<string>> = new Map();

  // 索引：按类型快速查找
  private typeIndex: Map<NodeType, Set<string>> = new Map();

  // 反向关系索引
  private reverseRelations: Map<string, Array<{ sourceId: string; type: RelationType }>> = new Map();

  constructor(config?: Partial<SemanticMemoryConfig>) {
    super();
    this.config = { ...DEFAULT_SEMANTIC_CONFIG, ...config };

    // 初始化类型索引
    for (const type of ['concept', 'entity', 'relation', 'fact'] as NodeType[]) {
      this.typeIndex.set(type, new Set());
    }
  }

  /**
   * 添加知识节点
   */
  addNode(params: {
    type: NodeType;
    name: string;
    description: string;
    properties?: Record<string, unknown>;
    source?: ProvenanceSource;
    confidence?: number;
    evidence?: string[];
    embedding?: number[];
  }): SemanticMemory {
    const now = Date.now();

    // 检查是否已存在同名节点
    const existing = this.getByName(params.name);
    if (existing) {
      // 更新现有节点
      return this.updateNode(existing.id, {
        description: params.description,
        properties: params.properties,
        confidence: params.confidence,
        embedding: params.embedding,
      });
    }

    // 检查最大节点数
    if (this.nodes.size >= this.config.maxNodes) {
      this.removeLowestConfidenceNode();
    }

    const node: SemanticMemory = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      node: {
        type: params.type,
        name: params.name,
        description: params.description,
        properties: params.properties ?? {},
      },
      relations: [],
      provenance: {
        source: params.source ?? 'inferred',
        confidence: params.confidence ?? 0.5,
        evidence: params.evidence ?? [],
      },
      embedding: params.embedding,
    };

    this.nodes.set(node.id, node);
    this.addToIndex(node);

    this.emit('node:added', node);
    return node;
  }

  /**
   * 获取节点
   */
  getNode(id: string): SemanticMemory | undefined {
    return this.nodes.get(id);
  }

  /**
   * 按名称获取节点
   */
  getByName(name: string): SemanticMemory | undefined {
    const normalizedName = name.toLowerCase();
    const ids = this.nameIndex.get(normalizedName);
    if (!ids || ids.size === 0) return undefined;
    const firstId = ids.values().next().value as string | undefined;
    if (!firstId) return undefined;
    return this.nodes.get(firstId);
  }

  /**
   * 按类型获取节点
   */
  getByType(type: NodeType): SemanticMemory[] {
    const ids = this.typeIndex.get(type);
    if (!ids) return [];
    return Array.from(ids).map(id => this.nodes.get(id)!).filter(Boolean);
  }

  /**
   * 更新节点
   */
  updateNode(
    id: string,
    updates: {
      description?: string;
      properties?: Record<string, unknown>;
      confidence?: number;
      embedding?: number[];
    }
  ): SemanticMemory {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Node not found: ${id}`);
    }

    if (updates.description !== undefined) {
      node.node.description = updates.description;
    }

    if (updates.properties !== undefined) {
      node.node.properties = { ...node.node.properties, ...updates.properties };
    }

    if (updates.confidence !== undefined) {
      node.provenance.confidence = updates.confidence;
    }

    if (updates.embedding !== undefined) {
      node.embedding = updates.embedding;
    }

    node.updatedAt = Date.now();

    this.emit('node:updated', node);
    return node;
  }

  /**
   * 删除节点
   */
  removeNode(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // 从索引中移除
    this.removeFromIndex(node);

    // 删除相关的关系
    for (const [sourceId, relations] of this.reverseRelations) {
      const filtered = relations.filter(r => r.sourceId !== id);
      if (filtered.length === 0) {
        this.reverseRelations.delete(sourceId);
      } else {
        this.reverseRelations.set(sourceId, filtered);
      }
    }

    this.nodes.delete(id);
    this.emit('node:removed', id);
    return true;
  }

  /**
   * 添加关系
   */
  addRelation(
    sourceId: string,
    targetId: string,
    type: RelationType,
    weight: number = 1.0,
    bidirectional: boolean = false
  ): void {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);

    if (!source || !target) {
      throw new Error('Source or target node not found');
    }

    // 检查是否已存在
    const existingRelation = source.relations.find(
      r => r.targetId === targetId && r.type === type
    );

    if (existingRelation) {
      // 更新权重
      existingRelation.weight = weight;
      existingRelation.bidirectional = bidirectional;
    } else {
      // 添加新关系
      source.relations.push({
        type,
        targetId,
        weight,
        bidirectional,
      });

      // 更新反向索引
      const reverseList = this.reverseRelations.get(targetId) ?? [];
      reverseList.push({ sourceId, type });
      this.reverseRelations.set(targetId, reverseList);

      // 如果是双向关系，同时添加反向
      if (bidirectional) {
        target.relations.push({
          type,
          targetId: sourceId,
          weight,
          bidirectional: true,
        });
      }
    }

    source.updatedAt = Date.now();
    this.emit('relation:added', sourceId, targetId, type);
  }

  /**
   * 删除关系
   */
  removeRelation(sourceId: string, targetId: string, type: RelationType): boolean {
    const source = this.nodes.get(sourceId);
    if (!source) return false;

    const index = source.relations.findIndex(
      r => r.targetId === targetId && r.type === type
    );

    if (index === -1) return false;

    const relation = source.relations[index];
    source.relations.splice(index, 1);

    // 更新反向索引
    const reverseList = this.reverseRelations.get(targetId);
    if (reverseList) {
      const reverseIndex = reverseList.findIndex(
        r => r.sourceId === sourceId && r.type === type
      );
      if (reverseIndex !== -1) {
        reverseList.splice(reverseIndex, 1);
      }
    }

    // 如果是双向关系，同时删除反向
    if (relation.bidirectional) {
      const target = this.nodes.get(targetId);
      if (target) {
        const reverseIdx = target.relations.findIndex(
          r => r.targetId === sourceId && r.type === type
        );
        if (reverseIdx !== -1) {
          target.relations.splice(reverseIdx, 1);
        }
      }
    }

    source.updatedAt = Date.now();
    this.emit('relation:removed', sourceId, targetId, type);
    return true;
  }

  /**
   * 获取节点的所有关系
   */
  getRelations(nodeId: string, type?: RelationType): Array<{
    type: RelationType;
    targetId: string;
    targetName: string;
    weight: number;
  }> {
    const node = this.nodes.get(nodeId);
    if (!node) return [];

    let relations = node.relations;
    if (type) {
      relations = relations.filter(r => r.type === type);
    }

    return relations.map(r => {
      const target = this.nodes.get(r.targetId);
      return {
        type: r.type,
        targetId: r.targetId,
        targetName: target?.node.name ?? 'Unknown',
        weight: r.weight,
      };
    });
  }

  /**
   * 获取指向某节点的关系
   */
  getIncomingRelations(nodeId: string, type?: RelationType): Array<{
    type: RelationType;
    sourceId: string;
    sourceName: string;
    weight: number;
  }> {
    const reverseList = this.reverseRelations.get(nodeId) ?? [];
    let results = reverseList;

    if (type) {
      results = results.filter(r => r.type === type);
    }

    return results.map(r => {
      const source = this.nodes.get(r.sourceId);
      const relation = source?.relations.find(
        rel => rel.targetId === nodeId && rel.type === r.type
      );
      return {
        type: r.type,
        sourceId: r.sourceId,
        sourceName: source?.node.name ?? 'Unknown',
        weight: relation?.weight ?? 0,
      };
    });
  }

  /**
   * 查找路径
   */
  findPath(
    startId: string,
    endId: string,
    maxDepth: number = 5
  ): Array<{ nodeId: string; relationType: RelationType }> | null {
    if (startId === endId) {
      return [{ nodeId: startId, relationType: RelationType.IS_A }];
    }

    // BFS 查找路径
    const visited = new Set<string>();
    const queue: Array<{
      nodeId: string;
      path: Array<{ nodeId: string; relationType: RelationType }>;
    }> = [{ nodeId: startId, path: [] }];

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;

      if (path.length >= maxDepth) continue;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (!node) continue;

      for (const relation of node.relations) {
        if (relation.targetId === endId) {
          return [
            ...path,
            { nodeId: relation.targetId, relationType: relation.type },
          ];
        }

        queue.push({
          nodeId: relation.targetId,
          path: [...path, { nodeId: relation.targetId, relationType: relation.type }],
        });
      }
    }

    return null;
  }

  /**
   * 语义搜索（基于向量相似度）
   */
  semanticSearch(query: SemanticQuery): MemoryQueryResult<SemanticMemory> {
    const startTime = Date.now();
    let results: Array<{ node: SemanticMemory; score: number }> = [];

    // 如果提供了向量，进行向量搜索
    if (query.embedding) {
      for (const node of this.nodes.values()) {
        if (!node.embedding) continue;

        const similarity = this.cosineSimilarity(query.embedding, node.embedding);
        if (similarity >= (query.threshold ?? 0.7)) {
          results.push({ node, score: similarity });
        }
      }
    } else if (query.text) {
      // 文本搜索（简单的关键词匹配）
      const keywords = query.text.toLowerCase().split(/\s+/);

      for (const node of this.nodes.values()) {
        const text = `${node.node.name} ${node.node.description}`.toLowerCase();
        const matchCount = keywords.filter(k => text.includes(k)).length;
        const score = matchCount / keywords.length;

        if (score > 0) {
          results.push({ node, score });
        }
      }
    }

    // 过滤节点类型
    if (query.nodeTypes && query.nodeTypes.length > 0) {
      results = results.filter(r => query.nodeTypes!.includes(r.node.node.type));
    }

    // 排序
    results.sort((a, b) => b.score - a.score);

    // 限制结果数
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return {
      items: results.map(r => r.node),
      total: results.length,
      query,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * 自动推理新关系
   */
  inferRelations(): number {
    if (!this.config.autoInference) return 0;

    let newRelations = 0;

    // 传递性推理：如果 A IS_A B, B IS_A C，则 A IS_A C
    for (const nodeA of this.nodes.values()) {
      for (const relationAB of nodeA.relations) {
        if (relationAB.type !== RelationType.IS_A) continue;

        const nodeB = this.nodes.get(relationAB.targetId);
        if (!nodeB) continue;

        for (const relationBC of nodeB.relations) {
          if (relationBC.type !== RelationType.IS_A) continue;

          // 检查 A -> C 是否已存在
          const existingAC = nodeA.relations.find(
            r => r.targetId === relationBC.targetId && r.type === RelationType.IS_A
          );

          if (!existingAC) {
            // 计算推理置信度
            const confidence = relationAB.weight * relationBC.weight * 0.8;
            if (confidence >= this.config.inferenceThreshold) {
              this.addRelation(
                nodeA.id,
                relationBC.targetId,
                RelationType.IS_A,
                confidence
              );
              newRelations++;
            }
          }
        }
      }
    }

    // 相似性推理：共享多个相同关系的节点可能相似
    const nodeRelationSignatures = new Map<string, string>();

    for (const node of this.nodes.values()) {
      const signature = node.relations
        .map(r => `${r.type}:${r.targetId}`)
        .sort()
        .join('|');
      nodeRelationSignatures.set(node.id, signature);
    }

    for (const [id1, sig1] of nodeRelationSignatures) {
      for (const [id2, sig2] of nodeRelationSignatures) {
        if (id1 >= id2) continue;

        const overlap = this.calculateSignatureOverlap(sig1, sig2);
        if (overlap >= this.config.inferenceThreshold) {
          // 检查是否已存在相似关系
          const node1 = this.nodes.get(id1)!;
          const existingSimilar = node1.relations.find(
            r => r.targetId === id2 && r.type === RelationType.SIMILAR_TO
          );

          if (!existingSimilar) {
            this.addRelation(id1, id2, RelationType.SIMILAR_TO, overlap, true);
            newRelations++;
          }
        }
      }
    }

    this.emit('inference:completed', newRelations);
    return newRelations;
  }

  /**
   * 获取统计信息
   */
  getStatistics(): {
    totalNodes: number;
    byType: Record<string, number>;
    totalRelations: number;
    byRelationType: Record<string, number>;
    averageConfidence: number;
    averageRelationsPerNode: number;
  } {
    const byType: Record<string, number> = {};
    const byRelationType: Record<string, number> = {};
    let totalRelations = 0;
    let totalConfidence = 0;

    for (const node of this.nodes.values()) {
      byType[node.node.type] = (byType[node.node.type] || 0) + 1;
      totalConfidence += node.provenance.confidence;

      for (const relation of node.relations) {
        byRelationType[relation.type] = (byRelationType[relation.type] || 0) + 1;
        totalRelations++;
      }
    }

    return {
      totalNodes: this.nodes.size,
      byType,
      totalRelations,
      byRelationType,
      averageConfidence: this.nodes.size > 0 ? totalConfidence / this.nodes.size : 0,
      averageRelationsPerNode: this.nodes.size > 0 ? totalRelations / this.nodes.size : 0,
    };
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 计算签名重叠度
   */
  private calculateSignatureOverlap(sig1: string, sig2: string): number {
    const parts1 = new Set(sig1.split('|').filter(Boolean));
    const parts2 = new Set(sig2.split('|').filter(Boolean));

    if (parts1.size === 0 || parts2.size === 0) return 0;

    let overlap = 0;
    for (const part of parts1) {
      if (parts2.has(part)) overlap++;
    }

    return overlap / Math.max(parts1.size, parts2.size);
  }

  /**
   * 添加到索引
   */
  private addToIndex(node: SemanticMemory): void {
    // 名称索引
    const normalizedName = node.node.name.toLowerCase();
    const nameSet = this.nameIndex.get(normalizedName) ?? new Set();
    nameSet.add(node.id);
    this.nameIndex.set(normalizedName, nameSet);

    // 类型索引
    const typeSet = this.typeIndex.get(node.node.type);
    typeSet?.add(node.id);
  }

  /**
   * 从索引中移除
   */
  private removeFromIndex(node: SemanticMemory): void {
    // 名称索引
    const normalizedName = node.node.name.toLowerCase();
    const nameSet = this.nameIndex.get(normalizedName);
    nameSet?.delete(node.id);

    // 类型索引
    const typeSet = this.typeIndex.get(node.node.type);
    typeSet?.delete(node.id);
  }

  /**
   * 移除最低置信度的节点
   */
  private removeLowestConfidenceNode(): void {
    let lowestNode: SemanticMemory | null = null;
    let lowestConfidence = Infinity;

    for (const node of this.nodes.values()) {
      if (node.provenance.confidence < lowestConfidence) {
        lowestConfidence = node.provenance.confidence;
        lowestNode = node;
      }
    }

    if (lowestNode) {
      this.removeNode(lowestNode.id);
    }
  }

  /**
   * 导出所有节点
   */
  exportAll(): SemanticMemory[] {
    return Array.from(this.nodes.values());
  }

  /**
   * 导入节点
   */
  importAll(nodes: SemanticMemory[]): void {
    for (const node of nodes) {
      this.nodes.set(node.id, node);
      this.addToIndex(node);

      // 重建反向索引
      for (const relation of node.relations) {
        const reverseList = this.reverseRelations.get(relation.targetId) ?? [];
        reverseList.push({ sourceId: node.id, type: relation.type });
        this.reverseRelations.set(relation.targetId, reverseList);
      }
    }
  }

  /**
   * 清空
   */
  clear(): void {
    this.nodes.clear();
    this.nameIndex.clear();
    this.reverseRelations.clear();
    for (const set of this.typeIndex.values()) {
      set.clear();
    }
  }
}

/**
 * 创建语义记忆管理器
 */
export function createSemanticMemory(
  config?: Partial<SemanticMemoryConfig>
): SemanticMemoryManager {
  return new SemanticMemoryManager(config);
}
