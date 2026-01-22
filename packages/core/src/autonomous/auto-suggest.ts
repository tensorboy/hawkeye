/**
 * AutoSuggestEngine - 自动建议引擎
 *
 * 基于用户历史行为、当前上下文和检测到的模式
 * 自动生成操作建议，无需用户输入 Prompt
 *
 * 核心功能：
 * - 预测用户下一步操作
 * - 检测重复模式并建议自动化
 * - 基于上下文生成智能建议
 * - 从用户反馈中学习
 */

import { EventEmitter } from 'events';
import type {
  SuggestedAction,
  SuggestionGroup,
  SuggestionFeedback,
  SuggestionType,
  AutoSuggestConfig,
  RiskLevel,
  BehaviorPattern,
  PatternMatch,
} from './types';
import { DEFAULT_AUTO_SUGGEST_CONFIG } from './types';
import { PatternDetector } from './pattern-detector';
import type { ExtendedPerceptionContext } from '../perception/engine';
import type { PlanStep, ActionType } from '../ai/types';
import type { ExecutionResult } from '../types';

// ============ 辅助函数 ============

function generateId(): string {
  return `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// ============ 预定义的上下文建议规则 ============

interface ContextRule {
  condition: (context: ExtendedPerceptionContext) => boolean;
  suggestion: Omit<SuggestedAction, 'id'>;
}

const CONTEXT_RULES: ContextRule[] = [
  // VS Code 相关建议
  {
    condition: (ctx) => ctx.activeWindow?.appName?.toLowerCase().includes('code') ?? false,
    suggestion: {
      type: 'contextual',
      title: '运行测试',
      description: '在 VS Code 中运行项目测试',
      action: {
        id: '',
        description: '运行 npm test',
        actionType: 'shell',
        params: { command: 'npm test' },
        riskLevel: 'low',
        reversible: false,
      },
      confidence: 0.6,
      reason: '你正在使用 VS Code，可能需要运行测试',
      priority: 5,
      riskLevel: 'low',
      autoExecutable: false,
    },
  },
  {
    condition: (ctx) => ctx.activeWindow?.appName?.toLowerCase().includes('code') ?? false,
    suggestion: {
      type: 'contextual',
      title: '提交代码',
      description: '提交当前的代码更改',
      action: {
        id: '',
        description: '打开 Git 提交',
        actionType: 'hotkey' as ActionType,
        params: { keys: ['cmd', 'shift', 'g'] },
        riskLevel: 'low',
        reversible: false,
      },
      confidence: 0.5,
      reason: '你正在编写代码，可能需要提交',
      priority: 4,
      riskLevel: 'low',
      autoExecutable: false,
    },
  },

  // 浏览器相关建议
  {
    condition: (ctx) =>
      (ctx.activeWindow?.appName?.toLowerCase().includes('chrome') ||
        ctx.activeWindow?.appName?.toLowerCase().includes('safari') ||
        ctx.activeWindow?.appName?.toLowerCase().includes('firefox')) ?? false,
    suggestion: {
      type: 'contextual',
      title: '保存页面',
      description: '保存当前网页到书签',
      action: {
        id: '',
        description: '添加书签',
        actionType: 'hotkey' as ActionType,
        params: { keys: ['cmd', 'd'] },
        riskLevel: 'safe',
        reversible: true,
      },
      confidence: 0.4,
      reason: '你正在浏览网页，可能想保存',
      priority: 3,
      riskLevel: 'safe',
      autoExecutable: false,
    },
  },

  // 终端相关建议
  {
    condition: (ctx) =>
      (ctx.activeWindow?.appName?.toLowerCase().includes('terminal') ||
        ctx.activeWindow?.appName?.toLowerCase().includes('iterm')) ?? false,
    suggestion: {
      type: 'contextual',
      title: '清除屏幕',
      description: '清除终端屏幕',
      action: {
        id: '',
        description: '清除终端',
        actionType: 'shell',
        params: { command: 'clear' },
        riskLevel: 'safe',
        reversible: false,
      },
      confidence: 0.3,
      reason: '终端可能需要清理',
      priority: 2,
      riskLevel: 'safe',
      autoExecutable: true,
    },
  },

  // Finder/文件管理器建议
  {
    condition: (ctx) => ctx.activeWindow?.appName?.toLowerCase().includes('finder') ?? false,
    suggestion: {
      type: 'contextual',
      title: '显示隐藏文件',
      description: '切换隐藏文件的显示状态',
      action: {
        id: '',
        description: '切换隐藏文件',
        actionType: 'hotkey' as ActionType,
        params: { keys: ['cmd', 'shift', '.'] },
        riskLevel: 'safe',
        reversible: true,
      },
      confidence: 0.4,
      reason: '在 Finder 中可能需要查看隐藏文件',
      priority: 3,
      riskLevel: 'safe',
      autoExecutable: false,
    },
  },
];

// ============ 时间相关建议 ============

interface TimeBasedSuggestion {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek?: number[];  // 0-6, 0 是周日
  suggestion: Omit<SuggestedAction, 'id'>;
}

const TIME_BASED_SUGGESTIONS: TimeBasedSuggestion[] = [
  {
    timeOfDay: 'morning',
    dayOfWeek: [1, 2, 3, 4, 5],  // 工作日
    suggestion: {
      type: 'scheduled',
      title: '查看邮件',
      description: '开始新的一天，查看邮件',
      action: {
        id: '',
        description: '打开邮件应用',
        actionType: 'app_open',
        params: { app: 'Mail' },
        riskLevel: 'safe',
        reversible: false,
      },
      confidence: 0.5,
      reason: '工作日早晨通常需要查看邮件',
      priority: 6,
      riskLevel: 'safe',
      autoExecutable: false,
    },
  },
  {
    timeOfDay: 'evening',
    suggestion: {
      type: 'scheduled',
      title: '整理下载文件夹',
      description: '清理今天下载的文件',
      action: {
        id: '',
        description: '打开下载文件夹',
        actionType: 'shell',
        params: { command: 'open ~/Downloads' },
        riskLevel: 'safe',
        reversible: false,
      },
      confidence: 0.4,
      reason: '傍晚适合整理文件',
      priority: 4,
      riskLevel: 'safe',
      autoExecutable: false,
    },
  },
];

// ============ AutoSuggestEngine 类 ============

export class AutoSuggestEngine extends EventEmitter {
  private config: AutoSuggestConfig;
  private patternDetector: PatternDetector;
  private suggestions: Map<string, SuggestedAction> = new Map();
  private feedbackHistory: SuggestionFeedback[] = [];
  private lastContext: ExtendedPerceptionContext | null = null;

  // 学习权重
  private ruleWeights: Map<string, number> = new Map();

  constructor(
    patternDetector: PatternDetector,
    config: Partial<AutoSuggestConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_AUTO_SUGGEST_CONFIG, ...config };
    this.patternDetector = patternDetector;
  }

  /**
   * 分析上下文并生成建议
   */
  async analyze(context: ExtendedPerceptionContext): Promise<SuggestedAction[]> {
    if (!this.config.enabled) return [];

    const allSuggestions: SuggestedAction[] = [];

    // 1. 基于模式的建议
    const patternSuggestions = this.generatePatternBasedSuggestions(context);
    allSuggestions.push(...patternSuggestions);

    // 2. 基于上下文规则的建议
    const contextSuggestions = this.generateContextBasedSuggestions(context);
    allSuggestions.push(...contextSuggestions);

    // 3. 基于时间的建议
    const timeSuggestions = this.generateTimeBasedSuggestions();
    allSuggestions.push(...timeSuggestions);

    // 4. 基于剪贴板内容的建议
    if (context.clipboard) {
      const clipboardSuggestions = this.generateClipboardSuggestions(context.clipboard);
      allSuggestions.push(...clipboardSuggestions);
    }

    // 5. 基于重复检测的建议
    const repetitionSuggestion = this.generateRepetitionSuggestion();
    if (repetitionSuggestion) {
      allSuggestions.push(repetitionSuggestion);
    }

    // 过滤和排序
    const filteredSuggestions = this.filterAndRankSuggestions(allSuggestions);

    // 更新建议存储
    this.suggestions.clear();
    for (const suggestion of filteredSuggestions) {
      this.suggestions.set(suggestion.id, suggestion);
    }

    this.lastContext = context;
    this.emit('suggestions:updated', filteredSuggestions);

    return filteredSuggestions;
  }

  /**
   * 获取当前的顶部建议
   */
  getTopSuggestions(limit: number = this.config.maxSuggestions): SuggestedAction[] {
    return Array.from(this.suggestions.values())
      .sort((a, b) => {
        // 先按优先级，再按置信度
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return b.confidence - a.confidence;
      })
      .slice(0, limit);
  }

  /**
   * 获取分组的建议
   */
  getGroupedSuggestions(): SuggestionGroup[] {
    const groups: Map<SuggestionType, SuggestedAction[]> = new Map();

    for (const suggestion of this.suggestions.values()) {
      if (!groups.has(suggestion.type)) {
        groups.set(suggestion.type, []);
      }
      groups.get(suggestion.type)!.push(suggestion);
    }

    const typeInfo: Record<SuggestionType, { icon: string; label: string }> = {
      predicted: { icon: '🔮', label: '预测建议' },
      repetitive: { icon: '🔁', label: '自动化建议' },
      contextual: { icon: '📍', label: '上下文建议' },
      scheduled: { icon: '⏰', label: '定时建议' },
      error_fix: { icon: '🔧', label: '修复建议' },
      optimization: { icon: '⚡', label: '优化建议' },
    };

    return Array.from(groups.entries()).map(([type, suggestions]) => ({
      category: typeInfo[type].label,
      icon: typeInfo[type].icon,
      suggestions: suggestions.sort((a, b) => b.confidence - a.confidence),
    }));
  }

  /**
   * 执行建议
   */
  async executeSuggestion(id: string): Promise<ExecutionResult> {
    const suggestion = this.suggestions.get(id);
    if (!suggestion) {
      return {
        success: false,
        error: `建议 ${id} 不存在`,
        duration: 0,
      };
    }

    this.emit('suggestion:executing', suggestion);

    // 实际执行将由 PlanExecutor 处理
    // 这里只是标记和记录
    return {
      success: true,
      output: `准备执行: ${suggestion.title}`,
      duration: 0,
      metadata: { suggestionId: id, action: suggestion.action },
    };
  }

  /**
   * 忽略建议
   */
  dismissSuggestion(id: string): void {
    const suggestion = this.suggestions.get(id);
    if (suggestion) {
      this.suggestions.delete(id);
      this.learnFromFeedback(id, false);
      this.emit('suggestion:dismissed', suggestion);
    }
  }

  /**
   * 从反馈中学习
   */
  learnFromFeedback(suggestionId: string, accepted: boolean, result?: ExecutionResult): void {
    if (!this.config.learnFromFeedback) return;

    const feedback: SuggestionFeedback = {
      suggestionId,
      accepted,
      executionResult: result,
    };

    this.feedbackHistory.push(feedback);

    // 限制历史记录大小
    if (this.feedbackHistory.length > 100) {
      this.feedbackHistory = this.feedbackHistory.slice(-100);
    }

    // 调整规则权重
    const suggestion = this.suggestions.get(suggestionId);
    if (suggestion) {
      const ruleKey = `${suggestion.type}:${suggestion.action.actionType}`;
      const currentWeight = this.ruleWeights.get(ruleKey) ?? 1.0;

      if (accepted) {
        this.ruleWeights.set(ruleKey, Math.min(2.0, currentWeight + 0.1));
      } else {
        this.ruleWeights.set(ruleKey, Math.max(0.1, currentWeight - 0.1));
      }
    }

    this.emit('feedback:received', feedback);
  }

  /**
   * 获取建议
   */
  getSuggestion(id: string): SuggestedAction | undefined {
    return this.suggestions.get(id);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AutoSuggestConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config:updated', this.config);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalSuggestions: number;
    acceptanceRate: number;
    topRules: Array<{ rule: string; weight: number }>;
  } {
    const accepted = this.feedbackHistory.filter(f => f.accepted).length;
    const total = this.feedbackHistory.length;

    const topRules = Array.from(this.ruleWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([rule, weight]) => ({ rule, weight }));

    return {
      totalSuggestions: this.suggestions.size,
      acceptanceRate: total > 0 ? accepted / total : 0,
      topRules,
    };
  }

  // ============ 私有方法 ============

  private generatePatternBasedSuggestions(context: ExtendedPerceptionContext): SuggestedAction[] {
    const suggestions: SuggestedAction[] = [];

    const patternMatch = this.patternDetector.getPatternForContext(context);
    if (patternMatch && patternMatch.matchScore > 0.3) {
      const pattern = patternMatch.pattern;

      suggestions.push({
        id: generateId(),
        type: 'predicted',
        title: `执行: ${pattern.name}`,
        description: pattern.description,
        action: patternMatch.predictedNextActions[0] || {
          id: generateId(),
          description: pattern.name,
          actionType: 'shell',
          params: {},
          riskLevel: 'low',
          reversible: false,
        },
        confidence: patternMatch.matchScore * pattern.confidence,
        reason: `基于你的历史行为模式 (出现 ${pattern.frequency} 次)`,
        priority: 7,
        riskLevel: 'low',
        autoExecutable: patternMatch.matchScore > 0.8 && pattern.confidence > 0.9,
      });
    }

    return suggestions;
  }

  private generateContextBasedSuggestions(context: ExtendedPerceptionContext): SuggestedAction[] {
    const suggestions: SuggestedAction[] = [];

    for (const rule of CONTEXT_RULES) {
      if (rule.condition(context)) {
        const ruleKey = `contextual:${rule.suggestion.action.actionType}`;
        const weight = this.ruleWeights.get(ruleKey) ?? 1.0;

        suggestions.push({
          ...rule.suggestion,
          id: generateId(),
          action: { ...rule.suggestion.action, id: generateId() },
          confidence: rule.suggestion.confidence * weight,
        });
      }
    }

    return suggestions;
  }

  private generateTimeBasedSuggestions(): SuggestedAction[] {
    const suggestions: SuggestedAction[] = [];
    const currentTime = getTimeOfDay();
    const currentDay = new Date().getDay();

    for (const timeSuggestion of TIME_BASED_SUGGESTIONS) {
      if (timeSuggestion.timeOfDay !== currentTime) continue;

      if (timeSuggestion.dayOfWeek && !timeSuggestion.dayOfWeek.includes(currentDay)) {
        continue;
      }

      const ruleKey = `scheduled:${timeSuggestion.suggestion.action.actionType}`;
      const weight = this.ruleWeights.get(ruleKey) ?? 1.0;

      suggestions.push({
        ...timeSuggestion.suggestion,
        id: generateId(),
        action: { ...timeSuggestion.suggestion.action, id: generateId() },
        confidence: timeSuggestion.suggestion.confidence * weight,
      });
    }

    return suggestions;
  }

  private generateClipboardSuggestions(clipboardContent: string): SuggestedAction[] {
    const suggestions: SuggestedAction[] = [];

    // URL 检测
    const urlRegex = /https?:\/\/[^\s]+/;
    if (urlRegex.test(clipboardContent)) {
      suggestions.push({
        id: generateId(),
        type: 'contextual',
        title: '打开链接',
        description: '在浏览器中打开剪贴板中的链接',
        action: {
          id: generateId(),
          description: '打开 URL',
          actionType: 'url_open',
          params: { url: clipboardContent.match(urlRegex)![0] },
          riskLevel: 'safe',
          reversible: false,
        },
        confidence: 0.7,
        reason: '检测到剪贴板中有 URL',
        priority: 6,
        riskLevel: 'safe',
        autoExecutable: false,
      });
    }

    // 文件路径检测
    const pathRegex = /^(\/|~\/|\.\/)[^\s]+/;
    if (pathRegex.test(clipboardContent)) {
      suggestions.push({
        id: generateId(),
        type: 'contextual',
        title: '打开文件/文件夹',
        description: '在 Finder 中显示剪贴板中的路径',
        action: {
          id: generateId(),
          description: '在 Finder 中显示',
          actionType: 'shell',
          params: { command: `open -R "${clipboardContent}"` },
          riskLevel: 'safe',
          reversible: false,
        },
        confidence: 0.6,
        reason: '检测到剪贴板中有文件路径',
        priority: 5,
        riskLevel: 'safe',
        autoExecutable: false,
      });
    }

    // JSON 检测
    try {
      JSON.parse(clipboardContent);
      if (clipboardContent.length > 50) {
        suggestions.push({
          id: generateId(),
          type: 'contextual',
          title: '格式化 JSON',
          description: '格式化剪贴板中的 JSON 数据',
          action: {
            id: generateId(),
            description: '格式化 JSON',
            actionType: 'shell',
            params: { command: `echo '${clipboardContent}' | python3 -m json.tool | pbcopy` },
            riskLevel: 'safe',
            reversible: false,
          },
          confidence: 0.5,
          reason: '检测到剪贴板中有 JSON 数据',
          priority: 4,
          riskLevel: 'safe',
          autoExecutable: false,
        });
      }
    } catch {
      // 不是 JSON，忽略
    }

    return suggestions;
  }

  private generateRepetitionSuggestion(): SuggestedAction | null {
    const repetition = this.patternDetector.detectRepetition(3);
    if (!repetition) return null;

    return {
      id: generateId(),
      type: 'repetitive',
      title: '自动化重复操作',
      description: `检测到你重复执行 "${repetition.type}" 操作，要自动化吗？`,
      action: {
        id: generateId(),
        description: `自动执行 ${repetition.type}`,
        actionType: repetition.type as ActionType,
        params: repetition.params,
        riskLevel: 'low',
        reversible: false,
      },
      confidence: 0.8,
      reason: '检测到连续重复操作',
      priority: 8,
      riskLevel: 'low',
      autoExecutable: false,
    };
  }

  private filterAndRankSuggestions(suggestions: SuggestedAction[]): SuggestedAction[] {
    // 过滤低置信度
    let filtered = suggestions.filter(s => s.confidence >= this.config.minConfidence);

    // 去重 (基于动作类型和参数)
    const seen = new Set<string>();
    filtered = filtered.filter(s => {
      const key = `${s.action.actionType}:${JSON.stringify(s.action.params)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 设置过期时间
    const now = Date.now();
    filtered = filtered.map(s => ({
      ...s,
      expiresAt: s.expiresAt ?? now + this.config.suggestionTTL,
    }));

    // 排序
    filtered.sort((a, b) => {
      // 先按优先级
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // 再按置信度
      return b.confidence - a.confidence;
    });

    // 限制数量
    return filtered.slice(0, this.config.maxSuggestions);
  }
}

// ============ 工厂函数 ============

export function createAutoSuggestEngine(
  patternDetector: PatternDetector,
  config?: Partial<AutoSuggestConfig>
): AutoSuggestEngine {
  return new AutoSuggestEngine(patternDetector, config);
}
