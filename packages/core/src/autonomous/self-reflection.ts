/**
 * SelfReflection - 自我反思模块
 *
 * 检测执行错误并分析原因
 * 提供自我改进能力
 *
 * 功能:
 * - 错误检测和分类
 * - 原因分析
 * - 改进建议生成
 * - 学习和适应
 */

/**
 * 反思类型
 */
export type ReflectionType =
  | 'action_failure'      // 动作执行失败
  | 'unexpected_result'   // 结果不符预期
  | 'performance_issue'   // 性能问题
  | 'timeout'             // 超时
  | 'state_mismatch'      // 状态不匹配
  | 'resource_error'      // 资源错误
  | 'user_correction';    // 用户纠正

/**
 * 错误严重程度
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * 错误类别
 */
export type ErrorCategory =
  | 'ui_element_not_found'    // UI 元素未找到
  | 'ui_element_not_visible'  // UI 元素不可见
  | 'click_target_missed'     // 点击目标偏移
  | 'text_input_failed'       // 文本输入失败
  | 'navigation_failed'       // 导航失败
  | 'timeout_exceeded'        // 超时
  | 'permission_denied'       // 权限不足
  | 'state_conflict'          // 状态冲突
  | 'resource_unavailable'    // 资源不可用
  | 'unknown';                // 未知错误

/**
 * 反思条目
 */
export interface ReflectionEntry {
  /** 条目 ID */
  id: string;
  /** 反思类型 */
  type: ReflectionType;
  /** 错误严重程度 */
  severity: ErrorSeverity;
  /** 错误类别 */
  category: ErrorCategory;
  /** 错误描述 */
  description: string;
  /** 上下文 */
  context: ReflectionContext;
  /** 原因分析 */
  analysis: CauseAnalysis;
  /** 改进建议 */
  improvements: ImprovementSuggestion[];
  /** 时间戳 */
  timestamp: number;
  /** 是否已解决 */
  resolved: boolean;
  /** 解决方案 */
  resolution?: string;
}

/**
 * 反思上下文
 */
export interface ReflectionContext {
  /** 执行的动作 */
  action?: string;
  /** 目标元素 */
  targetElement?: string;
  /** 预期结果 */
  expectedResult?: string;
  /** 实际结果 */
  actualResult?: string;
  /** 应用名称 */
  appName?: string;
  /** 窗口标题 */
  windowTitle?: string;
  /** URL */
  url?: string;
  /** 执行时间 (ms) */
  executionTime?: number;
  /** 截图路径 */
  screenshotPath?: string;
  /** 额外数据 */
  extra?: Record<string, unknown>;
}

/**
 * 原因分析
 */
export interface CauseAnalysis {
  /** 主要原因 */
  primaryCause: string;
  /** 次要原因 */
  secondaryCauses: string[];
  /** 置信度 */
  confidence: number;
  /** 根因类型 */
  rootCauseType: RootCauseType;
  /** 影响范围 */
  impactScope: 'local' | 'session' | 'global';
}

/**
 * 根因类型
 */
export type RootCauseType =
  | 'ui_change'           // UI 变化
  | 'timing_issue'        // 时机问题
  | 'state_pollution'     // 状态污染
  | 'resource_contention' // 资源竞争
  | 'external_factor'     // 外部因素
  | 'model_limitation'    // 模型局限
  | 'data_issue'          // 数据问题
  | 'unknown';

/**
 * 改进建议
 */
export interface ImprovementSuggestion {
  /** 建议 ID */
  id: string;
  /** 建议类型 */
  type: ImprovementType;
  /** 描述 */
  description: string;
  /** 优先级 */
  priority: 'low' | 'medium' | 'high';
  /** 实施难度 */
  difficulty: 'easy' | 'medium' | 'hard';
  /** 预期效果 */
  expectedImpact: string;
  /** 是否自动应用 */
  autoApplicable: boolean;
  /** 自动应用的配置变更 */
  configChanges?: Record<string, unknown>;
}

/**
 * 改进类型
 */
export type ImprovementType =
  | 'add_wait'           // 添加等待
  | 'change_selector'    // 更换选择器
  | 'adjust_timing'      // 调整时机
  | 'add_retry'          // 添加重试
  | 'add_validation'     // 添加验证
  | 'update_pattern'     // 更新模式
  | 'fallback_strategy'  // 回退策略
  | 'manual_review';     // 人工审核

/**
 * 学习记录
 */
export interface LearningRecord {
  /** 错误模式签名 */
  errorSignature: string;
  /** 出现次数 */
  occurrences: number;
  /** 成功的解决方案 */
  successfulResolutions: string[];
  /** 失败的尝试 */
  failedAttempts: string[];
  /** 最佳实践 */
  bestPractice?: string;
  /** 最后更新 */
  lastUpdated: number;
}

/**
 * 自我反思配置
 */
export interface SelfReflectionConfig {
  /** 是否启用自动分析 */
  enableAutoAnalysis: boolean;
  /** 最大保留条目数 */
  maxEntries: number;
  /** 是否启用自动改进 */
  enableAutoImprovement: boolean;
  /** 自动改进置信度阈值 */
  autoImprovementThreshold: number;
  /** 学习模式 */
  learningMode: 'passive' | 'active' | 'aggressive';
  /** 是否保存截图 */
  saveScreenshots: boolean;
  /** 截图保存路径 */
  screenshotPath: string;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: SelfReflectionConfig = {
  enableAutoAnalysis: true,
  maxEntries: 500,
  enableAutoImprovement: true,
  autoImprovementThreshold: 0.8,
  learningMode: 'active',
  saveScreenshots: false,
  screenshotPath: '',
};

/**
 * 错误模式匹配规则
 */
interface ErrorPatternRule {
  pattern: RegExp | string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  rootCauseType: RootCauseType;
  suggestions: Partial<ImprovementSuggestion>[];
}

/**
 * 默认错误模式规则
 */
const DEFAULT_ERROR_PATTERNS: ErrorPatternRule[] = [
  {
    pattern: /element.*not found/i,
    category: 'ui_element_not_found',
    severity: 'error',
    rootCauseType: 'ui_change',
    suggestions: [
      {
        type: 'add_wait',
        description: '增加等待时间确保元素加载',
        priority: 'high',
        difficulty: 'easy',
        autoApplicable: true,
      },
      {
        type: 'change_selector',
        description: '尝试使用更稳定的选择器',
        priority: 'medium',
        difficulty: 'medium',
        autoApplicable: false,
      },
    ],
  },
  {
    pattern: /element.*not visible/i,
    category: 'ui_element_not_visible',
    severity: 'warning',
    rootCauseType: 'timing_issue',
    suggestions: [
      {
        type: 'add_wait',
        description: '等待元素可见',
        priority: 'high',
        difficulty: 'easy',
        autoApplicable: true,
      },
    ],
  },
  {
    pattern: /timeout/i,
    category: 'timeout_exceeded',
    severity: 'error',
    rootCauseType: 'timing_issue',
    suggestions: [
      {
        type: 'adjust_timing',
        description: '增加超时时间',
        priority: 'high',
        difficulty: 'easy',
        autoApplicable: true,
        configChanges: { timeoutMultiplier: 2 },
      },
      {
        type: 'add_retry',
        description: '添加重试机制',
        priority: 'medium',
        difficulty: 'easy',
        autoApplicable: true,
      },
    ],
  },
  {
    pattern: /permission denied/i,
    category: 'permission_denied',
    severity: 'critical',
    rootCauseType: 'external_factor',
    suggestions: [
      {
        type: 'manual_review',
        description: '需要人工确认权限',
        priority: 'high',
        difficulty: 'hard',
        autoApplicable: false,
      },
    ],
  },
  {
    pattern: /click.*failed|click.*missed/i,
    category: 'click_target_missed',
    severity: 'error',
    rootCauseType: 'ui_change',
    suggestions: [
      {
        type: 'add_validation',
        description: '点击前验证元素位置',
        priority: 'high',
        difficulty: 'medium',
        autoApplicable: true,
      },
      {
        type: 'add_retry',
        description: '添加点击重试',
        priority: 'medium',
        difficulty: 'easy',
        autoApplicable: true,
      },
    ],
  },
];

/**
 * 自我反思模块
 */
export class SelfReflection {
  private config: SelfReflectionConfig;
  private entries: Map<string, ReflectionEntry>;
  private learningRecords: Map<string, LearningRecord>;
  private errorPatterns: ErrorPatternRule[];
  private idCounter: number;

  constructor(config: Partial<SelfReflectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.entries = new Map();
    this.learningRecords = new Map();
    this.errorPatterns = [...DEFAULT_ERROR_PATTERNS];
    this.idCounter = 0;
  }

  /**
   * 记录错误并进行反思
   */
  reflect(
    error: string | Error,
    context: ReflectionContext,
    type: ReflectionType = 'action_failure'
  ): ReflectionEntry {
    const errorMessage = error instanceof Error ? error.message : error;

    // 分类错误
    const { category, severity, rootCauseType, suggestions } =
      this.categorizeError(errorMessage);

    // 生成原因分析
    const analysis = this.analyzeRootCause(errorMessage, context, rootCauseType);

    // 生成改进建议
    const improvements = this.generateImprovements(suggestions, context);

    // 创建反思条目
    const entry: ReflectionEntry = {
      id: this.generateId(),
      type,
      severity,
      category,
      description: errorMessage,
      context,
      analysis,
      improvements,
      timestamp: Date.now(),
      resolved: false,
    };

    this.entries.set(entry.id, entry);

    // 更新学习记录
    this.updateLearningRecord(entry);

    // 限制条目数量
    this.pruneEntries();

    // 自动应用改进 (如果启用)
    if (this.config.enableAutoImprovement) {
      this.applyAutoImprovements(entry);
    }

    return entry;
  }

  /**
   * 记录用户纠正
   */
  recordUserCorrection(
    originalAction: string,
    correction: string,
    context: ReflectionContext
  ): ReflectionEntry {
    const entry = this.reflect(
      `用户纠正: 原操作 "${originalAction}" 被更正为 "${correction}"`,
      {
        ...context,
        expectedResult: originalAction,
        actualResult: correction,
      },
      'user_correction'
    );

    // 用户纠正是重要的学习信号
    this.learnFromCorrection(originalAction, correction, context);

    return entry;
  }

  /**
   * 标记问题已解决
   */
  markResolved(entryId: string, resolution: string): boolean {
    const entry = this.entries.get(entryId);
    if (!entry) {
      return false;
    }

    entry.resolved = true;
    entry.resolution = resolution;

    // 更新学习记录
    this.updateLearningWithResolution(entry, resolution);

    return true;
  }

  /**
   * 获取所有反思条目
   */
  getEntries(): ReflectionEntry[] {
    return Array.from(this.entries.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }

  /**
   * 获取未解决的条目
   */
  getUnresolvedEntries(): ReflectionEntry[] {
    return this.getEntries().filter((e) => !e.resolved);
  }

  /**
   * 按类别获取条目
   */
  getEntriesByCategory(category: ErrorCategory): ReflectionEntry[] {
    return this.getEntries().filter((e) => e.category === category);
  }

  /**
   * 获取改进建议
   */
  getSuggestions(limit = 10): ImprovementSuggestion[] {
    const allSuggestions: ImprovementSuggestion[] = [];

    for (const entry of this.getUnresolvedEntries()) {
      allSuggestions.push(...entry.improvements);
    }

    // 按优先级排序
    return allSuggestions
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .slice(0, limit);
  }

  /**
   * 获取学习记录
   */
  getLearningRecords(): LearningRecord[] {
    return Array.from(this.learningRecords.values());
  }

  /**
   * 获取统计信息
   */
  getStatistics(): ReflectionStatistics {
    const entries = this.getEntries();

    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let resolvedCount = 0;

    for (const entry of entries) {
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
      bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
      if (entry.resolved) {
        resolvedCount++;
      }
    }

    return {
      totalEntries: entries.length,
      resolvedCount,
      unresolvedCount: entries.length - resolvedCount,
      resolutionRate: entries.length > 0 ? resolvedCount / entries.length : 0,
      byCategory,
      bySeverity,
      topIssues: this.getTopIssues(),
      learningProgress: this.getLearningProgress(),
    };
  }

  /**
   * 清除所有条目
   */
  clearEntries(): void {
    this.entries.clear();
  }

  /**
   * 添加自定义错误模式
   */
  addErrorPattern(pattern: ErrorPatternRule): void {
    this.errorPatterns.push(pattern);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SelfReflectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ===== Private Methods =====

  private generateId(): string {
    return `ref_${++this.idCounter}_${Date.now()}`;
  }

  private categorizeError(errorMessage: string): {
    category: ErrorCategory;
    severity: ErrorSeverity;
    rootCauseType: RootCauseType;
    suggestions: Partial<ImprovementSuggestion>[];
  } {
    for (const rule of this.errorPatterns) {
      const matches =
        typeof rule.pattern === 'string'
          ? errorMessage.toLowerCase().includes(rule.pattern.toLowerCase())
          : rule.pattern.test(errorMessage);

      if (matches) {
        return {
          category: rule.category,
          severity: rule.severity,
          rootCauseType: rule.rootCauseType,
          suggestions: rule.suggestions,
        };
      }
    }

    return {
      category: 'unknown',
      severity: 'error',
      rootCauseType: 'unknown',
      suggestions: [
        {
          type: 'manual_review',
          description: '需要人工分析此未知错误',
          priority: 'medium',
          difficulty: 'medium',
          autoApplicable: false,
        },
      ],
    };
  }

  private analyzeRootCause(
    errorMessage: string,
    context: ReflectionContext,
    rootCauseType: RootCauseType
  ): CauseAnalysis {
    const secondaryCauses: string[] = [];

    // 基于上下文推断次要原因
    if (context.executionTime && context.executionTime > 5000) {
      secondaryCauses.push('执行时间较长可能导致页面状态变化');
    }

    if (context.url && context.url.includes('dynamic')) {
      secondaryCauses.push('动态页面可能存在加载时机问题');
    }

    // 检查学习记录中是否有类似错误
    const signature = this.generateErrorSignature(errorMessage, context);
    const learningRecord = this.learningRecords.get(signature);

    if (learningRecord && learningRecord.occurrences > 3) {
      secondaryCauses.push(`此错误已出现 ${learningRecord.occurrences} 次，可能是系统性问题`);
    }

    return {
      primaryCause: this.inferPrimaryCause(errorMessage, rootCauseType),
      secondaryCauses,
      confidence: this.calculateConfidence(rootCauseType, learningRecord),
      rootCauseType,
      impactScope: this.determineImpactScope(rootCauseType),
    };
  }

  private inferPrimaryCause(errorMessage: string, rootCauseType: RootCauseType): string {
    const causeMap: Record<RootCauseType, string> = {
      ui_change: 'UI 元素可能已更改位置或属性',
      timing_issue: '操作时机不当，页面可能尚未完全加载',
      state_pollution: '应用状态与预期不符',
      resource_contention: '系统资源竞争导致操作失败',
      external_factor: '外部因素影响（如网络、权限）',
      model_limitation: 'AI 模型理解能力限制',
      data_issue: '输入数据格式或内容问题',
      unknown: `未知原因: ${errorMessage.slice(0, 100)}`,
    };

    return causeMap[rootCauseType];
  }

  private calculateConfidence(
    rootCauseType: RootCauseType,
    learningRecord?: LearningRecord
  ): number {
    let baseConfidence = 0.5;

    // 已知类型提高置信度
    if (rootCauseType !== 'unknown') {
      baseConfidence += 0.2;
    }

    // 有学习记录提高置信度
    if (learningRecord) {
      baseConfidence += Math.min(0.2, learningRecord.occurrences * 0.02);

      // 有成功解决方案进一步提高
      if (learningRecord.successfulResolutions.length > 0) {
        baseConfidence += 0.1;
      }
    }

    return Math.min(1, baseConfidence);
  }

  private determineImpactScope(rootCauseType: RootCauseType): 'local' | 'session' | 'global' {
    switch (rootCauseType) {
      case 'state_pollution':
        return 'session';
      case 'model_limitation':
      case 'external_factor':
        return 'global';
      default:
        return 'local';
    }
  }

  private generateImprovements(
    baseSuggestions: Partial<ImprovementSuggestion>[],
    context: ReflectionContext
  ): ImprovementSuggestion[] {
    return baseSuggestions.map((suggestion, index) => ({
      id: `imp_${Date.now()}_${index}`,
      type: suggestion.type || 'manual_review',
      description: suggestion.description || '检查并处理此问题',
      priority: suggestion.priority || 'medium',
      difficulty: suggestion.difficulty || 'medium',
      expectedImpact: suggestion.expectedImpact || '减少类似错误发生',
      autoApplicable: suggestion.autoApplicable || false,
      configChanges: suggestion.configChanges,
    }));
  }

  private generateErrorSignature(errorMessage: string, context: ReflectionContext): string {
    // 生成错误签名用于匹配学习记录
    const normalizedError = errorMessage
      .toLowerCase()
      .replace(/\d+/g, 'N')
      .replace(/['"]/g, '')
      .slice(0, 100);

    return `${context.appName || 'unknown'}:${normalizedError}`;
  }

  private updateLearningRecord(entry: ReflectionEntry): void {
    const signature = this.generateErrorSignature(entry.description, entry.context);

    const existing = this.learningRecords.get(signature) || {
      errorSignature: signature,
      occurrences: 0,
      successfulResolutions: [],
      failedAttempts: [],
      lastUpdated: Date.now(),
    };

    existing.occurrences++;
    existing.lastUpdated = Date.now();

    this.learningRecords.set(signature, existing);
  }

  private updateLearningWithResolution(entry: ReflectionEntry, resolution: string): void {
    const signature = this.generateErrorSignature(entry.description, entry.context);
    const record = this.learningRecords.get(signature);

    if (record) {
      if (!record.successfulResolutions.includes(resolution)) {
        record.successfulResolutions.push(resolution);
      }

      // 如果有多个成功方案，选择最常用的作为最佳实践
      if (record.successfulResolutions.length > 0) {
        record.bestPractice = record.successfulResolutions[0];
      }

      record.lastUpdated = Date.now();
    }
  }

  private learnFromCorrection(
    originalAction: string,
    correction: string,
    context: ReflectionContext
  ): void {
    const signature = `correction:${context.appName}:${originalAction}`;

    const existing = this.learningRecords.get(signature) || {
      errorSignature: signature,
      occurrences: 0,
      successfulResolutions: [],
      failedAttempts: [originalAction],
      lastUpdated: Date.now(),
    };

    existing.occurrences++;
    if (!existing.successfulResolutions.includes(correction)) {
      existing.successfulResolutions.push(correction);
    }
    existing.bestPractice = correction;
    existing.lastUpdated = Date.now();

    this.learningRecords.set(signature, existing);
  }

  private applyAutoImprovements(entry: ReflectionEntry): void {
    if (entry.analysis.confidence < this.config.autoImprovementThreshold) {
      return;
    }

    for (const improvement of entry.improvements) {
      if (improvement.autoApplicable && improvement.configChanges) {
        // 记录自动应用的改进
        console.log(
          `[SelfReflection] Auto-applying improvement: ${improvement.description}`,
          improvement.configChanges
        );
        // 实际应用需要与配置系统集成
      }
    }
  }

  private pruneEntries(): void {
    const entries = Array.from(this.entries.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp);

    while (entries.length > this.config.maxEntries) {
      const [id] = entries.pop()!;
      this.entries.delete(id);
    }
  }

  private getTopIssues(): { category: ErrorCategory; count: number }[] {
    const counts: Record<string, number> = {};

    for (const entry of this.getUnresolvedEntries()) {
      counts[entry.category] = (counts[entry.category] || 0) + 1;
    }

    return Object.entries(counts)
      .map(([category, count]) => ({ category: category as ErrorCategory, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private getLearningProgress(): number {
    const records = this.getLearningRecords();
    if (records.length === 0) {
      return 0;
    }

    const withBestPractice = records.filter((r) => r.bestPractice).length;
    return withBestPractice / records.length;
  }
  /**
   * 触发 SEPO 优化
   */
  async optimizeProcess(plan: ExecutionPlan, result: ExecutionResult): Promise<void> {
    if (!this.sepo) return;

    try {
      const optimization = await this.sepo.optimize(plan, result);
      if (optimization) {
        this.emit('process:optimized', optimization);
      }
    } catch (error) {
      console.warn('[SelfReflection] SEPO optimization failed:', error);
    }
  }
}

/**
 * 反思统计信息
 */
export interface ReflectionStatistics {
  totalEntries: number;
  resolvedCount: number;
  unresolvedCount: number;
  resolutionRate: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  topIssues: { category: ErrorCategory; count: number }[];
  learningProgress: number;
}

// ===== Singleton Support =====

let globalSelfReflection: SelfReflection | null = null;

export function getSelfReflection(): SelfReflection {
  if (!globalSelfReflection) {
    globalSelfReflection = new SelfReflection();
  }
  return globalSelfReflection;
}

export function createSelfReflection(config?: Partial<SelfReflectionConfig>, vectorStore?: VectorStore): SelfReflection {
  return new SelfReflection(config, vectorStore);
}

export function setSelfReflection(reflection: SelfReflection): void {
  globalSelfReflection = reflection;
}
