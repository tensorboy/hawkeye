/**
 * Context Compressor - 上下文压缩器
 *
 * 优化发送给 AI 模型的上下文，管理 Token 预算
 * 功能:
 * - 动态 Token 预算分配
 * - 增量更新 (只发送变化部分)
 * - 历史上下文摘要
 * - 优先级排序
 *
 * 参考: Agent-S, Cradle 等项目的上下文管理策略
 */

import { EventEmitter } from 'events';
import type { ExtendedPerceptionContext } from '../perception/engine';
import type { AIMessage } from './types';

/**
 * Token 估算配置
 */
interface TokenEstimation {
  /** 平均每个字符的 token 数 (英文约 0.25, 中文约 0.5-1) */
  charsPerToken: number;
  /** 图像 token 数 (根据分辨率) */
  imageTokens: number;
  /** 系统提示基础 token 数 */
  systemPromptTokens: number;
}

/**
 * 上下文优先级
 */
export type ContextPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * 上下文块
 */
export interface ContextChunk {
  /** 块 ID */
  id: string;
  /** 块类型 */
  type: 'system' | 'user' | 'assistant' | 'context' | 'history' | 'observation';
  /** 内容 */
  content: string;
  /** 优先级 */
  priority: ContextPriority;
  /** 估计 token 数 */
  estimatedTokens: number;
  /** 时间戳 */
  timestamp: number;
  /** 是否可压缩 */
  compressible: boolean;
  /** 已压缩 */
  compressed?: boolean;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 压缩后的上下文
 */
export interface CompressedContext {
  /** 压缩后的消息列表 */
  messages: AIMessage[];
  /** 总 token 数 */
  totalTokens: number;
  /** 原始 token 数 */
  originalTokens: number;
  /** 压缩率 */
  compressionRatio: number;
  /** 被丢弃的块数 */
  droppedChunks: number;
  /** 被摘要的块数 */
  summarizedChunks: number;
}

/**
 * 上下文压缩器配置
 */
export interface ContextCompressorConfig {
  /** 最大 token 预算 */
  maxTokens: number;
  /** 保留系统提示的最小 token 数 */
  minSystemTokens: number;
  /** 保留最近上下文的最小 token 数 */
  minRecentTokens: number;
  /** 历史摘要的最大 token 数 */
  maxHistorySummaryTokens: number;
  /** Token 估算配置 */
  tokenEstimation: TokenEstimation;
  /** 是否启用增量更新 */
  enableIncrementalUpdate: boolean;
  /** 是否启用自动摘要 */
  enableAutoSummary: boolean;
  /** 摘要触发阈值 (token 占用率) */
  summaryThreshold: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ContextCompressorConfig = {
  maxTokens: 8192,
  minSystemTokens: 500,
  minRecentTokens: 2000,
  maxHistorySummaryTokens: 1000,
  tokenEstimation: {
    charsPerToken: 0.4, // 混合语言估算
    imageTokens: 1024, // 中等分辨率图像
    systemPromptTokens: 200,
  },
  enableIncrementalUpdate: true,
  enableAutoSummary: true,
  summaryThreshold: 0.8,
};

/**
 * ContextCompressor - 上下文压缩器
 */
export class ContextCompressor extends EventEmitter {
  private config: ContextCompressorConfig;
  private chunks: ContextChunk[] = [];
  private previousContext: ExtendedPerceptionContext | null = null;
  private historySummary: string = '';
  private totalTokensUsed: number = 0;

  constructor(config: Partial<ContextCompressorConfig> = {}) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      tokenEstimation: { ...DEFAULT_CONFIG.tokenEstimation, ...config.tokenEstimation },
    };
  }

  /**
   * 估算文本的 token 数
   */
  estimateTokens(text: string): number {
    if (!text) return 0;

    // 基于字符数估算
    // 中文字符占用更多 token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;

    // 中文约 0.5-1 token/字, 英文约 0.25 token/字
    const tokens = chineseChars * 0.7 + otherChars * this.config.tokenEstimation.charsPerToken;

    return Math.ceil(tokens);
  }

  /**
   * 添加上下文块
   */
  addChunk(chunk: Omit<ContextChunk, 'id' | 'estimatedTokens' | 'timestamp'>): void {
    const newChunk: ContextChunk = {
      ...chunk,
      id: `chunk_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      estimatedTokens: this.estimateTokens(chunk.content),
      timestamp: Date.now(),
    };

    this.chunks.push(newChunk);
    this.totalTokensUsed += newChunk.estimatedTokens;

    // 检查是否需要压缩
    if (this.shouldCompress()) {
      this.emit('compression:needed', {
        currentTokens: this.totalTokensUsed,
        maxTokens: this.config.maxTokens,
      });
    }
  }

  /**
   * 从感知上下文创建上下文块
   */
  addPerceptionContext(context: ExtendedPerceptionContext): void {
    // 如果启用增量更新，只添加变化部分
    if (this.config.enableIncrementalUpdate && this.previousContext) {
      const changes = this.detectChanges(this.previousContext, context);
      if (changes.length === 0) {
        return; // 无变化
      }

      this.addChunk({
        type: 'observation',
        content: this.formatChanges(changes),
        priority: 'medium',
        compressible: true,
      });
    } else {
      // 添加完整上下文
      this.addChunk({
        type: 'context',
        content: this.formatContext(context),
        priority: 'high',
        compressible: true,
        metadata: {
          activeApp: context.activeApp,
          windowTitle: context.windowTitle,
        },
      });
    }

    this.previousContext = context;
  }

  /**
   * 压缩上下文
   */
  compress(): CompressedContext {
    const startTokens = this.totalTokensUsed;
    let droppedChunks = 0;
    let summarizedChunks = 0;

    // 按优先级和时间排序
    const sortedChunks = this.sortChunks();

    // 分配 token 预算
    const budget = this.allocateBudget();

    // 选择要保留的块
    const { selected, dropped, summarized } = this.selectChunks(sortedChunks, budget);

    droppedChunks = dropped.length;
    summarizedChunks = summarized.length;

    // 如果有被丢弃的块，生成摘要
    if (summarized.length > 0 && this.config.enableAutoSummary) {
      this.historySummary = this.generateSummary(summarized);
    }

    // 构建消息
    const messages = this.buildMessages(selected);

    // 计算总 token 数
    const totalTokens = messages.reduce(
      (sum, msg) => sum + this.estimateMessageTokens(msg),
      0
    );

    const result: CompressedContext = {
      messages,
      totalTokens,
      originalTokens: startTokens,
      compressionRatio: startTokens > 0 ? totalTokens / startTokens : 1,
      droppedChunks,
      summarizedChunks,
    };

    this.emit('compression:complete', result);
    return result;
  }

  /**
   * 构建增量上下文 (只包含变化部分)
   */
  buildIncrementalContext(
    context: ExtendedPerceptionContext,
    userMessage: string
  ): CompressedContext {
    // 检测变化
    const changes = this.previousContext
      ? this.detectChanges(this.previousContext, context)
      : [];

    // 构建消息
    const messages: AIMessage[] = [];

    // 系统消息 (包含历史摘要)
    if (this.historySummary) {
      messages.push({
        role: 'system',
        content: `历史上下文摘要:\n${this.historySummary}`,
      });
    }

    // 当前状态 (简化)
    messages.push({
      role: 'system',
      content: this.formatContextBrief(context),
    });

    // 变化 (如果有)
    if (changes.length > 0) {
      messages.push({
        role: 'system',
        content: `最近变化:\n${this.formatChanges(changes)}`,
      });
    }

    // 用户消息
    messages.push({
      role: 'user',
      content: userMessage,
    });

    this.previousContext = context;

    const totalTokens = messages.reduce(
      (sum, msg) => sum + this.estimateMessageTokens(msg),
      0
    );

    return {
      messages,
      totalTokens,
      originalTokens: totalTokens, // 增量模式下没有压缩
      compressionRatio: 1,
      droppedChunks: 0,
      summarizedChunks: 0,
    };
  }

  /**
   * 清除历史
   */
  clear(): void {
    this.chunks = [];
    this.previousContext = null;
    this.historySummary = '';
    this.totalTokensUsed = 0;
    this.emit('cleared');
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    chunksCount: number;
    totalTokens: number;
    budgetUsage: number;
    hasSummary: boolean;
  } {
    return {
      chunksCount: this.chunks.length,
      totalTokens: this.totalTokensUsed,
      budgetUsage: this.totalTokensUsed / this.config.maxTokens,
      hasSummary: this.historySummary.length > 0,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ContextCompressorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      tokenEstimation: { ...this.config.tokenEstimation, ...config.tokenEstimation },
    };
    this.emit('config:updated', this.config);
  }

  // ============ 私有方法 ============

  /**
   * 检查是否需要压缩
   */
  private shouldCompress(): boolean {
    return (
      this.totalTokensUsed / this.config.maxTokens >= this.config.summaryThreshold
    );
  }

  /**
   * 检测上下文变化
   */
  private detectChanges(
    prev: ExtendedPerceptionContext,
    current: ExtendedPerceptionContext
  ): Array<{ field: string; from: unknown; to: unknown }> {
    const changes: Array<{ field: string; from: unknown; to: unknown }> = [];

    // 检测窗口变化
    if (prev.activeApp !== current.activeApp) {
      changes.push({
        field: 'activeApp',
        from: prev.activeApp,
        to: current.activeApp,
      });
    }

    if (prev.windowTitle !== current.windowTitle) {
      changes.push({
        field: 'windowTitle',
        from: prev.windowTitle,
        to: current.windowTitle,
      });
    }

    // 检测 URL 变化
    if (prev.url !== current.url) {
      changes.push({
        field: 'url',
        from: prev.url,
        to: current.url,
      });
    }

    // 检测剪贴板变化
    if (prev.clipboard !== current.clipboard) {
      changes.push({
        field: 'clipboard',
        from: prev.clipboard ? '(有内容)' : '(空)',
        to: current.clipboard ? '(有内容)' : '(空)',
      });
    }

    return changes;
  }

  /**
   * 格式化变化
   */
  private formatChanges(
    changes: Array<{ field: string; from: unknown; to: unknown }>
  ): string {
    return changes
      .map((c) => `- ${c.field}: ${c.from} → ${c.to}`)
      .join('\n');
  }

  /**
   * 格式化完整上下文
   */
  private formatContext(context: ExtendedPerceptionContext): string {
    const parts: string[] = [];

    parts.push(`当前应用: ${context.activeApp || '未知'}`);
    parts.push(`窗口标题: ${context.windowTitle || '无'}`);

    if (context.url) {
      parts.push(`URL: ${context.url}`);
    }

    if (context.clipboard) {
      const clipboardPreview = context.clipboard.length > 100
        ? context.clipboard.slice(0, 100) + '...'
        : context.clipboard;
      parts.push(`剪贴板: ${clipboardPreview}`);
    }

    if (context.recentApps && context.recentApps.length > 0) {
      parts.push(`最近应用: ${context.recentApps.slice(0, 3).join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * 格式化简短上下文
   */
  private formatContextBrief(context: ExtendedPerceptionContext): string {
    return `当前: ${context.activeApp || '未知'} - ${context.windowTitle || '无标题'}`;
  }

  /**
   * 排序块
   */
  private sortChunks(): ContextChunk[] {
    const priorityOrder: Record<ContextPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    return [...this.chunks].sort((a, b) => {
      // 先按优先级
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // 再按时间 (新的优先)
      return b.timestamp - a.timestamp;
    });
  }

  /**
   * 分配 token 预算
   */
  private allocateBudget(): {
    system: number;
    recent: number;
    history: number;
  } {
    const total = this.config.maxTokens;
    const system = this.config.minSystemTokens;
    const recent = this.config.minRecentTokens;
    const history = Math.min(
      total - system - recent,
      this.config.maxHistorySummaryTokens
    );

    return { system, recent, history };
  }

  /**
   * 选择要保留的块
   */
  private selectChunks(
    sortedChunks: ContextChunk[],
    budget: { system: number; recent: number; history: number }
  ): {
    selected: ContextChunk[];
    dropped: ContextChunk[];
    summarized: ContextChunk[];
  } {
    const selected: ContextChunk[] = [];
    const dropped: ContextChunk[] = [];
    const summarized: ContextChunk[] = [];

    let usedTokens = 0;
    const availableTokens = budget.system + budget.recent;

    for (const chunk of sortedChunks) {
      if (usedTokens + chunk.estimatedTokens <= availableTokens) {
        selected.push(chunk);
        usedTokens += chunk.estimatedTokens;
      } else if (chunk.compressible && usedTokens < availableTokens) {
        // 可以摘要的块
        summarized.push(chunk);
      } else {
        dropped.push(chunk);
      }
    }

    return { selected, dropped, summarized };
  }

  /**
   * 生成摘要
   */
  private generateSummary(chunks: ContextChunk[]): string {
    // 简单的摘要生成 (实际可以调用 AI 模型)
    const summaryParts: string[] = [];

    // 按类型分组
    const byType = new Map<string, ContextChunk[]>();
    for (const chunk of chunks) {
      if (!byType.has(chunk.type)) {
        byType.set(chunk.type, []);
      }
      byType.get(chunk.type)!.push(chunk);
    }

    // 为每种类型生成简短摘要
    for (const [type, typeChunks] of byType) {
      const contents = typeChunks.map((c) => c.content.slice(0, 50));
      summaryParts.push(`[${type}] ${typeChunks.length} 条记录: ${contents.join('; ')}`);
    }

    return summaryParts.join('\n');
  }

  /**
   * 构建消息
   */
  private buildMessages(chunks: ContextChunk[]): AIMessage[] {
    const messages: AIMessage[] = [];

    // 添加历史摘要
    if (this.historySummary) {
      messages.push({
        role: 'system',
        content: `历史摘要:\n${this.historySummary}`,
      });
    }

    // 按时间排序添加块
    const sortedByTime = [...chunks].sort((a, b) => a.timestamp - b.timestamp);

    for (const chunk of sortedByTime) {
      const role = chunk.type === 'user' ? 'user' :
                   chunk.type === 'assistant' ? 'assistant' : 'system';

      messages.push({
        role,
        content: chunk.content,
      });
    }

    return messages;
  }

  /**
   * 估算消息的 token 数
   */
  private estimateMessageTokens(message: AIMessage): number {
    if (typeof message.content === 'string') {
      return this.estimateTokens(message.content);
    }

    // 多内容消息
    let tokens = 0;
    for (const content of message.content) {
      if (content.type === 'text') {
        tokens += this.estimateTokens(content.text || '');
      } else if (content.type === 'image') {
        tokens += this.config.tokenEstimation.imageTokens;
      }
    }
    return tokens;
  }
}

/**
 * 创建上下文压缩器
 */
export function createContextCompressor(
  config?: Partial<ContextCompressorConfig>
): ContextCompressor {
  return new ContextCompressor(config);
}

// ============ 单例支持 ============

let globalContextCompressor: ContextCompressor | null = null;

/**
 * 获取全局上下文压缩器实例
 */
export function getContextCompressor(): ContextCompressor {
  if (!globalContextCompressor) {
    globalContextCompressor = createContextCompressor();
  }
  return globalContextCompressor;
}

/**
 * 设置全局上下文压缩器实例
 */
export function setContextCompressor(compressor: ContextCompressor): void {
  globalContextCompressor = compressor;
}
