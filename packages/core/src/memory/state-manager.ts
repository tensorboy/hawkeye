/**
 * 高级状态管理器
 * Advanced State Manager
 *
 * 基于 Agent-S、Cradle、UI-TARS 和 Open Interpreter 的设计模式
 * - 双重记忆系统（情节记忆 + 语义记忆）
 * - 工作区设计（LocalMemory + recent_history）
 * - 对话历史管理与上下文裁剪
 * - 代码执行状态与变量持久化
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// 类型定义 (Type Definitions)
// ============================================================================

/**
 * 状态版本信息
 */
export interface StateVersion {
  id: string;
  timestamp: number;
  hash: string;
  parentId?: string;
  description?: string;
  size: number;
}

/**
 * 序列化后的状态
 */
export interface SerializedState {
  version: string;
  timestamp: number;
  checksum: string;
  compressed: boolean;
  data: string;
}

/**
 * 检查点
 */
export interface Checkpoint {
  id: string;
  name: string;
  timestamp: number;
  state: SerializedState;
  metadata: Record<string, unknown>;
}

/**
 * 对话消息
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens?: number;
  metadata?: Record<string, unknown>;
}

/**
 * 对话历史配置
 */
export interface ConversationConfig {
  maxMessages: number;
  maxTokens: number;
  trimStrategy: 'oldest' | 'importance' | 'summarize';
  summarizeThreshold: number;
  preserveSystemMessages: boolean;
}

/**
 * 执行上下文
 */
export interface ExecutionContext {
  id: string;
  language: string;
  variables: Map<string, unknown>;
  imports: Set<string>;
  outputs: Array<{
    type: 'text' | 'image' | 'error' | 'html';
    content: string;
    timestamp: number;
  }>;
  isActive: boolean;
  startTime: number;
}

/**
 * 工作区项目
 */
export interface WorkingAreaItem {
  key: string;
  value: unknown;
  timestamp: number;
  ttl?: number; // Time to live in ms
  priority: number;
}

/**
 * 双重记忆条目 (Agent-S 风格)
 */
export interface DualMemoryEntry {
  id: string;
  timestamp: number;

  // 情节记忆部分
  episodic: {
    event: string;
    context: Record<string, unknown>;
    outcome: 'success' | 'failure' | 'pending';
    trajectory: string;
  };

  // 语义记忆部分
  semantic: {
    key: string;
    knowledge: string;
    embedding?: number[];
    confidence: number;
  };
}

/**
 * 状态管理器配置
 */
export interface StateManagerConfig {
  storagePath: string;
  enablePersistence: boolean;
  enableVersioning: boolean;
  maxVersions: number;
  autoSaveInterval: number; // ms, 0 = disabled
  compressionEnabled: boolean;
  encryptionKey?: string;
  conversation: ConversationConfig;
}

/**
 * 默认配置
 */
export const DEFAULT_STATE_MANAGER_CONFIG: StateManagerConfig = {
  storagePath: '~/.hawkeye/state',
  enablePersistence: true,
  enableVersioning: true,
  maxVersions: 50,
  autoSaveInterval: 60000, // 1 minute
  compressionEnabled: true,
  conversation: {
    maxMessages: 100,
    maxTokens: 8000,
    trimStrategy: 'importance',
    summarizeThreshold: 0.8,
    preserveSystemMessages: true,
  },
};

// ============================================================================
// 状态管理器 (State Manager)
// ============================================================================

export class StateManager extends EventEmitter {
  private config: StateManagerConfig;

  // 工作区 (Cradle 风格的 LocalMemory)
  private workingArea: Map<string, WorkingAreaItem> = new Map();

  // 最近历史 (recent_history 数据结构)
  private recentHistory: Map<string, unknown[]> = new Map();
  private maxRecentSteps: number = 20;

  // 对话历史
  private conversationHistory: ConversationMessage[] = [];
  private conversationSummary: string = '';

  // 执行上下文 (Open Interpreter 风格)
  private executionContexts: Map<string, ExecutionContext> = new Map();
  private activeContextId: string | null = null;

  // 双重记忆 (Agent-S 风格)
  private episodicMemoryPath: string = '';
  private narrativeMemoryPath: string = '';
  private dualMemoryCache: Map<string, DualMemoryEntry> = new Map();

  // 版本控制
  private versions: StateVersion[] = [];
  private currentVersionId: string | null = null;

  // 检查点
  private checkpoints: Map<string, Checkpoint> = new Map();

  // 自动保存定时器
  private autoSaveTimer: NodeJS.Timeout | null = null;

  // 状态变更追踪
  private isDirty: boolean = false;
  private lastSaveTime: number = 0;

  constructor(config?: Partial<StateManagerConfig>) {
    super();
    this.config = { ...DEFAULT_STATE_MANAGER_CONFIG, ...config };

    // 初始化存储路径
    const storagePath = this.config.storagePath.replace('~', process.env.HOME || '');
    this.episodicMemoryPath = path.join(storagePath, 'episodic_memory.json');
    this.narrativeMemoryPath = path.join(storagePath, 'narrative_memory.json');

    // 初始化默认的历史桶
    this.initializeHistoryBuckets();

    // 启动自动保存
    if (this.config.autoSaveInterval > 0 && this.config.enablePersistence) {
      this.startAutoSave();
    }
  }

  // ============================================================================
  // 工作区管理 (Working Area - Cradle 风格)
  // ============================================================================

  /**
   * 设置工作区项目
   */
  setWorkingItem(key: string, value: unknown, options?: { ttl?: number; priority?: number }): void {
    this.workingArea.set(key, {
      key,
      value,
      timestamp: Date.now(),
      ttl: options?.ttl,
      priority: options?.priority ?? 1,
    });
    this.markDirty();
    this.emit('working:updated', key, value);
  }

  /**
   * 获取工作区项目
   */
  getWorkingItem<T = unknown>(key: string): T | undefined {
    const item = this.workingArea.get(key);
    if (!item) return undefined;

    // 检查 TTL
    if (item.ttl && Date.now() - item.timestamp > item.ttl) {
      this.workingArea.delete(key);
      return undefined;
    }

    return item.value as T;
  }

  /**
   * 更新工作区（批量）
   */
  updateWorkingArea(data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      this.setWorkingItem(key, value);
    }
  }

  /**
   * 清理过期的工作区项目
   */
  cleanupWorkingArea(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.workingArea) {
      if (item.ttl && now - item.timestamp > item.ttl) {
        this.workingArea.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.markDirty();
    }

    return cleaned;
  }

  // ============================================================================
  // 最近历史管理 (Recent History - Cradle 风格)
  // ============================================================================

  /**
   * 初始化历史桶
   */
  private initializeHistoryBuckets(): void {
    const defaultBuckets = [
      'images',
      'actions',
      'action_errors',
      'reasoning',
      'task_guidance',
      'dialogue',
      'summarization',
      'screenshots',
      'clipboard',
      'window_focus',
    ];

    for (const bucket of defaultBuckets) {
      if (!this.recentHistory.has(bucket)) {
        this.recentHistory.set(bucket, []);
      }
    }
  }

  /**
   * 添加到最近历史
   */
  addRecentHistory(key: string, value: unknown): void {
    if (!this.recentHistory.has(key)) {
      this.recentHistory.set(key, []);
    }

    const history = this.recentHistory.get(key)!;
    history.push(value);

    // 限制大小
    while (history.length > this.maxRecentSteps) {
      history.shift();
    }

    this.markDirty();
    this.emit('history:added', key, value);
  }

  /**
   * 批量添加历史
   */
  addRecentHistoryBatch(data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      this.addRecentHistory(key, value);
    }
  }

  /**
   * 获取最近历史
   */
  getRecentHistory<T = unknown>(key: string, count: number = 1): T[] {
    const history = this.recentHistory.get(key);
    if (!history || history.length === 0) {
      return [];
    }

    return history.slice(-count) as T[];
  }

  /**
   * 获取所有历史
   */
  getAllRecentHistory(): Record<string, unknown[]> {
    const result: Record<string, unknown[]> = {};
    for (const [key, value] of this.recentHistory) {
      result[key] = [...value];
    }
    return result;
  }

  /**
   * 设置摘要
   */
  setSummarization(summary: string): void {
    this.recentHistory.set('summarization', [summary]);
    this.markDirty();
  }

  /**
   * 获取摘要
   */
  getSummarization(): string {
    const summary = this.recentHistory.get('summarization');
    return summary && summary.length > 0 ? String(summary[0]) : '';
  }

  // ============================================================================
  // 对话历史管理 (UI-TARS 风格上下文裁剪)
  // ============================================================================

  /**
   * 添加对话消息
   */
  addConversationMessage(message: Omit<ConversationMessage, 'id'>): ConversationMessage {
    const fullMessage: ConversationMessage = {
      id: uuidv4(),
      ...message,
    };

    this.conversationHistory.push(fullMessage);

    // 检查是否需要裁剪
    this.trimConversationIfNeeded();

    this.markDirty();
    this.emit('conversation:added', fullMessage);

    return fullMessage;
  }

  /**
   * 获取对话历史
   */
  getConversationHistory(limit?: number): ConversationMessage[] {
    if (limit) {
      return this.conversationHistory.slice(-limit);
    }
    return [...this.conversationHistory];
  }

  /**
   * 获取用于 LLM 的对话上下文
   */
  getConversationContext(maxTokens?: number): ConversationMessage[] {
    const max = maxTokens ?? this.config.conversation.maxTokens;
    const messages: ConversationMessage[] = [];
    let totalTokens = 0;

    // 首先添加系统消息
    if (this.config.conversation.preserveSystemMessages) {
      const systemMessages = this.conversationHistory.filter(m => m.role === 'system');
      for (const msg of systemMessages) {
        messages.push(msg);
        totalTokens += msg.tokens ?? this.estimateTokens(msg.content);
      }
    }

    // 如果有摘要，添加摘要
    if (this.conversationSummary) {
      messages.push({
        id: 'summary',
        role: 'system',
        content: `Previous conversation summary: ${this.conversationSummary}`,
        timestamp: Date.now(),
      });
      totalTokens += this.estimateTokens(this.conversationSummary) + 10;
    }

    // 从最新的消息开始添加
    const nonSystemMessages = this.conversationHistory
      .filter(m => m.role !== 'system')
      .reverse();

    for (const msg of nonSystemMessages) {
      const msgTokens = msg.tokens ?? this.estimateTokens(msg.content);
      if (totalTokens + msgTokens > max) break;

      messages.push(msg);
      totalTokens += msgTokens;
    }

    // 按时间排序
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 裁剪对话历史
   */
  private trimConversationIfNeeded(): void {
    const config = this.config.conversation;

    // 检查消息数量
    if (this.conversationHistory.length <= config.maxMessages) {
      return;
    }

    // 根据策略裁剪
    switch (config.trimStrategy) {
      case 'oldest':
        this.trimOldestMessages();
        break;
      case 'importance':
        this.trimByImportance();
        break;
      case 'summarize':
        this.trimWithSummarization();
        break;
    }
  }

  /**
   * 删除最旧的消息
   */
  private trimOldestMessages(): void {
    const config = this.config.conversation;
    const nonSystemMessages = this.conversationHistory.filter(m => m.role !== 'system');
    const systemMessages = config.preserveSystemMessages
      ? this.conversationHistory.filter(m => m.role === 'system')
      : [];

    // 保留最新的一半
    const keepCount = Math.floor(config.maxMessages / 2);
    const keptMessages = nonSystemMessages.slice(-keepCount);

    this.conversationHistory = [...systemMessages, ...keptMessages];
    this.emit('conversation:trimmed', nonSystemMessages.length - keepCount);
  }

  /**
   * 按重要性裁剪
   */
  private trimByImportance(): void {
    const config = this.config.conversation;

    // 计算每条消息的重要性分数
    const scoredMessages = this.conversationHistory.map((msg, index) => ({
      message: msg,
      score: this.calculateMessageImportance(msg, index),
    }));

    // 保留系统消息和高分消息
    const systemMessages = scoredMessages.filter(m => m.message.role === 'system');
    const otherMessages = scoredMessages
      .filter(m => m.message.role !== 'system')
      .sort((a, b) => b.score - a.score)
      .slice(0, config.maxMessages - systemMessages.length);

    // 按时间排序
    this.conversationHistory = [...systemMessages.map(m => m.message), ...otherMessages.map(m => m.message)]
      .sort((a, b) => a.timestamp - b.timestamp);

    this.emit('conversation:trimmed', scoredMessages.length - this.conversationHistory.length);
  }

  /**
   * 带摘要的裁剪
   */
  private trimWithSummarization(): void {
    const config = this.config.conversation;
    const halfCount = Math.floor(config.maxMessages / 2);

    // 获取要摘要的消息
    const messagesToSummarize = this.conversationHistory.slice(0, halfCount);

    // 生成摘要（简单版本，实际应使用 LLM）
    const summary = this.generateSimpleSummary(messagesToSummarize);
    this.conversationSummary = this.conversationSummary
      ? `${this.conversationSummary}\n\n${summary}`
      : summary;

    // 保留最新的消息
    this.conversationHistory = this.conversationHistory.slice(halfCount);

    this.emit('conversation:summarized', messagesToSummarize.length, summary);
  }

  /**
   * 计算消息重要性
   */
  private calculateMessageImportance(message: ConversationMessage, index: number): number {
    let score = 0;

    // 最近的消息更重要
    const recencyScore = index / this.conversationHistory.length;
    score += recencyScore * 0.3;

    // 包含代码的消息更重要
    if (message.content.includes('```')) {
      score += 0.3;
    }

    // 包含关键词的消息更重要
    const keywords = ['error', 'success', 'important', 'remember', 'note'];
    for (const keyword of keywords) {
      if (message.content.toLowerCase().includes(keyword)) {
        score += 0.1;
      }
    }

    // 用户消息略微更重要
    if (message.role === 'user') {
      score += 0.1;
    }

    // 自定义元数据中的重要性
    if (message.metadata?.importance) {
      score += Number(message.metadata.importance) * 0.2;
    }

    return Math.min(score, 1);
  }

  /**
   * 生成简单摘要
   */
  private generateSimpleSummary(messages: ConversationMessage[]): string {
    const topics = new Set<string>();
    const actions = new Set<string>();

    for (const msg of messages) {
      // 提取主题（简单实现）
      const words = msg.content.split(/\s+/).filter(w => w.length > 5);
      for (const word of words.slice(0, 3)) {
        topics.add(word.toLowerCase());
      }

      // 提取动作
      if (msg.content.includes('```')) {
        actions.add('code execution');
      }
      if (msg.content.toLowerCase().includes('file')) {
        actions.add('file operations');
      }
    }

    return `Discussed: ${Array.from(topics).slice(0, 5).join(', ')}. Actions: ${Array.from(actions).join(', ')}.`;
  }

  /**
   * 估算 token 数量
   */
  private estimateTokens(text: string): number {
    // 简单估算：约 4 个字符 = 1 token
    return Math.ceil(text.length / 4);
  }

  // ============================================================================
  // 执行上下文管理 (Open Interpreter 风格)
  // ============================================================================

  /**
   * 创建执行上下文
   */
  createExecutionContext(language: string = 'python'): ExecutionContext {
    const context: ExecutionContext = {
      id: uuidv4(),
      language,
      variables: new Map(),
      imports: new Set(),
      outputs: [],
      isActive: true,
      startTime: Date.now(),
    };

    this.executionContexts.set(context.id, context);
    this.activeContextId = context.id;

    this.markDirty();
    this.emit('execution:created', context.id);

    return context;
  }

  /**
   * 获取活动执行上下文
   */
  getActiveExecutionContext(): ExecutionContext | null {
    if (!this.activeContextId) return null;
    return this.executionContexts.get(this.activeContextId) ?? null;
  }

  /**
   * 设置变量
   */
  setVariable(name: string, value: unknown, contextId?: string): void {
    const ctx = contextId
      ? this.executionContexts.get(contextId)
      : this.getActiveExecutionContext();

    if (!ctx) return;

    ctx.variables.set(name, value);
    this.markDirty();
    this.emit('execution:variable', contextId ?? this.activeContextId, name, value);
  }

  /**
   * 获取变量
   */
  getVariable<T = unknown>(name: string, contextId?: string): T | undefined {
    const ctx = contextId
      ? this.executionContexts.get(contextId)
      : this.getActiveExecutionContext();

    return ctx?.variables.get(name) as T | undefined;
  }

  /**
   * 添加 import
   */
  addImport(importPath: string, contextId?: string): void {
    const ctx = contextId
      ? this.executionContexts.get(contextId)
      : this.getActiveExecutionContext();

    if (!ctx) return;

    ctx.imports.add(importPath);
    this.markDirty();
  }

  /**
   * 添加输出
   */
  addOutput(
    output: { type: 'text' | 'image' | 'error' | 'html'; content: string },
    contextId?: string
  ): void {
    const ctx = contextId
      ? this.executionContexts.get(contextId)
      : this.getActiveExecutionContext();

    if (!ctx) return;

    ctx.outputs.push({
      ...output,
      timestamp: Date.now(),
    });

    this.markDirty();
    this.emit('execution:output', contextId ?? this.activeContextId, output);
  }

  /**
   * 获取执行上下文的所有变量
   */
  getAllVariables(contextId?: string): Record<string, unknown> {
    const ctx = contextId
      ? this.executionContexts.get(contextId)
      : this.getActiveExecutionContext();

    if (!ctx) return {};

    const result: Record<string, unknown> = {};
    for (const [key, value] of ctx.variables) {
      result[key] = value;
    }
    return result;
  }

  /**
   * 终止执行上下文
   */
  terminateExecutionContext(contextId?: string): void {
    const id = contextId ?? this.activeContextId;
    if (!id) return;

    const ctx = this.executionContexts.get(id);
    if (ctx) {
      ctx.isActive = false;
    }

    if (this.activeContextId === id) {
      this.activeContextId = null;
    }

    this.markDirty();
    this.emit('execution:terminated', id);
  }

  // ============================================================================
  // 双重记忆系统 (Agent-S 风格)
  // ============================================================================

  /**
   * 保存情节记忆（子任务级别）
   */
  saveEpisodicMemory(key: string, trajectory: string, outcome: 'success' | 'failure'): DualMemoryEntry {
    const entry: DualMemoryEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      episodic: {
        event: key,
        context: this.getAllRecentHistory(),
        outcome,
        trajectory,
      },
      semantic: {
        key,
        knowledge: this.summarizeTrajectory(trajectory),
        confidence: outcome === 'success' ? 0.9 : 0.5,
      },
    };

    this.dualMemoryCache.set(entry.id, entry);
    this.markDirty();

    // 持久化
    if (this.config.enablePersistence) {
      this.persistDualMemory('episodic', key, entry);
    }

    this.emit('memory:episodic', entry);
    return entry;
  }

  /**
   * 保存叙事记忆（任务级别）
   */
  saveNarrativeMemory(taskKey: string, fullTrajectory: string): DualMemoryEntry {
    const entry: DualMemoryEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      episodic: {
        event: taskKey,
        context: {},
        outcome: 'success',
        trajectory: fullTrajectory,
      },
      semantic: {
        key: taskKey,
        knowledge: this.summarizeTrajectory(fullTrajectory),
        confidence: 0.85,
      },
    };

    this.dualMemoryCache.set(entry.id, entry);
    this.markDirty();

    // 持久化
    if (this.config.enablePersistence) {
      this.persistDualMemory('narrative', taskKey, entry);
    }

    this.emit('memory:narrative', entry);
    return entry;
  }

  /**
   * 检索相似经验
   */
  retrieveSimilarExperience(query: string, type: 'episodic' | 'narrative' = 'episodic'): DualMemoryEntry | null {
    // 简单的关键词匹配（实际应使用向量相似度）
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    let bestMatch: DualMemoryEntry | null = null;
    let bestScore = 0;

    for (const entry of this.dualMemoryCache.values()) {
      const entryWords = new Set(entry.semantic.knowledge.toLowerCase().split(/\s+/));
      let overlap = 0;
      for (const word of queryWords) {
        if (entryWords.has(word)) overlap++;
      }

      const score = overlap / Math.max(queryWords.size, 1);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    return bestScore > 0.3 ? bestMatch : null;
  }

  /**
   * 摘要轨迹
   */
  private summarizeTrajectory(trajectory: string): string {
    // 简单实现：提取前200个字符
    return trajectory.slice(0, 200) + (trajectory.length > 200 ? '...' : '');
  }

  /**
   * 持久化双重记忆
   */
  private persistDualMemory(type: 'episodic' | 'narrative', key: string, entry: DualMemoryEntry): void {
    const filePath = type === 'episodic' ? this.episodicMemoryPath : this.narrativeMemoryPath;

    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let existing: Record<string, DualMemoryEntry> = {};
      if (fs.existsSync(filePath)) {
        existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }

      existing[key] = entry;
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
    } catch (error) {
      this.emit('error', new Error(`Failed to persist ${type} memory: ${error}`));
    }
  }

  // ============================================================================
  // 状态序列化与持久化
  // ============================================================================

  /**
   * 序列化完整状态
   */
  serialize(): SerializedState {
    const state = {
      workingArea: Array.from(this.workingArea.entries()),
      recentHistory: Array.from(this.recentHistory.entries()),
      conversationHistory: this.conversationHistory,
      conversationSummary: this.conversationSummary,
      executionContexts: Array.from(this.executionContexts.entries()).map(([id, ctx]) => ({
        id,
        language: ctx.language,
        variables: Array.from(ctx.variables.entries()),
        imports: Array.from(ctx.imports),
        outputs: ctx.outputs,
        isActive: ctx.isActive,
        startTime: ctx.startTime,
      })),
      activeContextId: this.activeContextId,
      dualMemoryCache: Array.from(this.dualMemoryCache.entries()),
    };

    let data = JSON.stringify(state);
    const checksum = this.calculateChecksum(data);

    // 压缩
    if (this.config.compressionEnabled) {
      data = this.compress(data);
    }

    // 加密
    if (this.config.encryptionKey) {
      data = this.encrypt(data);
    }

    return {
      version: '1.0.0',
      timestamp: Date.now(),
      checksum,
      compressed: this.config.compressionEnabled,
      data,
    };
  }

  /**
   * 反序列化状态
   */
  deserialize(serialized: SerializedState): void {
    let data = serialized.data;

    // 解密
    if (this.config.encryptionKey) {
      data = this.decrypt(data);
    }

    // 解压
    if (serialized.compressed) {
      data = this.decompress(data);
    }

    // 验证校验和
    const checksum = this.calculateChecksum(data);
    if (checksum !== serialized.checksum) {
      throw new Error('State checksum mismatch - data may be corrupted');
    }

    const state = JSON.parse(data);

    // 恢复工作区
    this.workingArea.clear();
    for (const [key, value] of state.workingArea) {
      this.workingArea.set(key, value);
    }

    // 恢复历史
    this.recentHistory.clear();
    for (const [key, value] of state.recentHistory) {
      this.recentHistory.set(key, value);
    }

    // 恢复对话
    this.conversationHistory = state.conversationHistory;
    this.conversationSummary = state.conversationSummary;

    // 恢复执行上下文
    this.executionContexts.clear();
    for (const ctx of state.executionContexts) {
      this.executionContexts.set(ctx.id, {
        id: ctx.id,
        language: ctx.language,
        variables: new Map(ctx.variables),
        imports: new Set(ctx.imports),
        outputs: ctx.outputs,
        isActive: ctx.isActive,
        startTime: ctx.startTime,
      });
    }
    this.activeContextId = state.activeContextId;

    // 恢复双重记忆
    this.dualMemoryCache.clear();
    for (const [key, value] of state.dualMemoryCache) {
      this.dualMemoryCache.set(key, value);
    }

    this.isDirty = false;
    this.emit('state:restored', serialized.timestamp);
  }

  /**
   * 保存到文件
   */
  async save(filePath?: string): Promise<void> {
    const serialized = this.serialize();
    const targetPath = filePath ?? path.join(
      this.config.storagePath.replace('~', process.env.HOME || ''),
      'state.json'
    );

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetPath, JSON.stringify(serialized, null, 2));

    // 创建版本
    if (this.config.enableVersioning) {
      this.createVersion(serialized);
    }

    this.isDirty = false;
    this.lastSaveTime = Date.now();
    this.emit('state:saved', targetPath);
  }

  /**
   * 从文件加载
   */
  async load(filePath?: string): Promise<void> {
    const targetPath = filePath ?? path.join(
      this.config.storagePath.replace('~', process.env.HOME || ''),
      'state.json'
    );

    if (!fs.existsSync(targetPath)) {
      this.emit('state:notfound', targetPath);
      return;
    }

    const content = fs.readFileSync(targetPath, 'utf-8');
    const serialized: SerializedState = JSON.parse(content);

    this.deserialize(serialized);
    this.emit('state:loaded', targetPath);
  }

  // ============================================================================
  // 版本控制
  // ============================================================================

  /**
   * 创建版本
   */
  private createVersion(serialized: SerializedState): StateVersion {
    const version: StateVersion = {
      id: uuidv4(),
      timestamp: Date.now(),
      hash: serialized.checksum,
      parentId: this.currentVersionId ?? undefined,
      size: serialized.data.length,
    };

    this.versions.push(version);
    this.currentVersionId = version.id;

    // 限制版本数量
    while (this.versions.length > this.config.maxVersions) {
      this.versions.shift();
    }

    // 保存版本
    if (this.config.enablePersistence) {
      this.persistVersion(version, serialized);
    }

    return version;
  }

  /**
   * 持久化版本
   */
  private persistVersion(version: StateVersion, serialized: SerializedState): void {
    const versionDir = path.join(
      this.config.storagePath.replace('~', process.env.HOME || ''),
      'versions'
    );

    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    const versionPath = path.join(versionDir, `${version.id}.json`);
    fs.writeFileSync(versionPath, JSON.stringify({
      version,
      state: serialized,
    }, null, 2));
  }

  /**
   * 获取版本历史
   */
  getVersionHistory(): StateVersion[] {
    return [...this.versions];
  }

  /**
   * 恢复到指定版本
   */
  async restoreVersion(versionId: string): Promise<void> {
    const versionPath = path.join(
      this.config.storagePath.replace('~', process.env.HOME || ''),
      'versions',
      `${versionId}.json`
    );

    if (!fs.existsSync(versionPath)) {
      throw new Error(`Version not found: ${versionId}`);
    }

    const content = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
    this.deserialize(content.state);
    this.currentVersionId = versionId;

    this.emit('version:restored', versionId);
  }

  // ============================================================================
  // 检查点管理
  // ============================================================================

  /**
   * 创建检查点
   */
  createCheckpoint(name: string, metadata?: Record<string, unknown>): Checkpoint {
    const checkpoint: Checkpoint = {
      id: uuidv4(),
      name,
      timestamp: Date.now(),
      state: this.serialize(),
      metadata: metadata ?? {},
    };

    this.checkpoints.set(checkpoint.id, checkpoint);
    this.emit('checkpoint:created', checkpoint);

    return checkpoint;
  }

  /**
   * 恢复检查点
   */
  restoreCheckpoint(checkpointId: string): void {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    this.deserialize(checkpoint.state);
    this.emit('checkpoint:restored', checkpointId);
  }

  /**
   * 列出检查点
   */
  listCheckpoints(): Checkpoint[] {
    return Array.from(this.checkpoints.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 删除检查点
   */
  deleteCheckpoint(checkpointId: string): boolean {
    const deleted = this.checkpoints.delete(checkpointId);
    if (deleted) {
      this.emit('checkpoint:deleted', checkpointId);
    }
    return deleted;
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 标记状态已更改
   */
  private markDirty(): void {
    this.isDirty = true;
  }

  /**
   * 计算校验和
   */
  private calculateChecksum(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * 压缩数据
   */
  private compress(data: string): string {
    // 简单的 Base64 编码（实际应使用 zlib）
    return Buffer.from(data).toString('base64');
  }

  /**
   * 解压数据
   */
  private decompress(data: string): string {
    return Buffer.from(data, 'base64').toString('utf-8');
  }

  /**
   * 加密数据
   */
  private encrypt(data: string): string {
    if (!this.config.encryptionKey) return data;

    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * 解密数据
   */
  private decrypt(data: string): string {
    if (!this.config.encryptionKey) return data;

    const [ivHex, encrypted] = data.split(':');
    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * 启动自动保存
   */
  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.save();
        } catch (error) {
          this.emit('error', error);
        }
      }
    }, this.config.autoSaveInterval);
  }

  /**
   * 停止自动保存
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * 获取状态统计
   */
  getStatistics(): {
    workingAreaSize: number;
    recentHistoryBuckets: number;
    conversationLength: number;
    executionContexts: number;
    dualMemoryEntries: number;
    versions: number;
    checkpoints: number;
    isDirty: boolean;
    lastSaveTime: number;
  } {
    return {
      workingAreaSize: this.workingArea.size,
      recentHistoryBuckets: this.recentHistory.size,
      conversationLength: this.conversationHistory.length,
      executionContexts: this.executionContexts.size,
      dualMemoryEntries: this.dualMemoryCache.size,
      versions: this.versions.length,
      checkpoints: this.checkpoints.size,
      isDirty: this.isDirty,
      lastSaveTime: this.lastSaveTime,
    };
  }

  /**
   * 清空所有状态
   */
  clear(): void {
    this.workingArea.clear();
    this.recentHistory.clear();
    this.conversationHistory = [];
    this.conversationSummary = '';
    this.executionContexts.clear();
    this.activeContextId = null;
    this.dualMemoryCache.clear();
    this.checkpoints.clear();

    this.initializeHistoryBuckets();
    this.markDirty();

    this.emit('state:cleared');
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.stopAutoSave();
    this.clear();
    this.removeAllListeners();
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建状态管理器
 */
export function createStateManager(config?: Partial<StateManagerConfig>): StateManager {
  return new StateManager(config);
}

/**
 * 创建带自动恢复的状态管理器
 */
export async function createPersistentStateManager(
  config?: Partial<StateManagerConfig>
): Promise<StateManager> {
  const manager = new StateManager({
    ...config,
    enablePersistence: true,
  });

  try {
    await manager.load();
  } catch (error) {
    // 首次启动，没有保存的状态
  }

  return manager;
}
