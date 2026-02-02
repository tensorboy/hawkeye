/**
 * Intent Engine - 意图识别引擎
 * 分析用户上下文，识别用户意图
 */

import { EventEmitter } from 'events';
import type {
  UserIntent,
  IntentType,
  IntentEntity,
  IntentContext,
  AIMessage,
} from '../ai/types';
import type { AIManager } from '../ai/manager';
import type { ExtendedPerceptionContext } from '../perception/engine';

export interface IntentEngineConfig {
  /** 最小置信度阈值 */
  minConfidence: number;
  /** 是否启用详细日志 */
  verbose: boolean;
  /** 意图缓存时间 (ms) */
  cacheDuration: number;
}

interface CachedIntent {
  intent: UserIntent;
  timestamp: number;
  contextHash: string;
}

export class IntentEngine extends EventEmitter {
  private config: IntentEngineConfig;
  private aiManager: AIManager | null = null;
  private intentCache: Map<string, CachedIntent> = new Map();
  private recentIntents: UserIntent[] = [];

  constructor(config: Partial<IntentEngineConfig> = {}) {
    super();
    this.config = {
      minConfidence: 0.5,
      verbose: false,
      cacheDuration: 30000, // 30 秒
      ...config,
    };
  }

  /**
   * 设置 AI Manager
   */
  setAIManager(manager: AIManager): void {
    this.aiManager = manager;
  }

  /**
   * 分析感知上下文，识别用户意图
   */
  async recognize(context: ExtendedPerceptionContext): Promise<UserIntent[]> {
    // 计算上下文哈希
    const contextHash = this.hashContext(context);

    // 检查缓存
    const cached = this.intentCache.get(contextHash);
    if (cached && Date.now() - cached.timestamp < this.config.cacheDuration) {
      return [cached.intent];
    }

    // 先尝试基于规则的快速识别
    const ruleBasedIntents = this.recognizeByRules(context);

    // 如果有 AI Manager，使用 AI 增强识别
    if (this.aiManager?.isReady) {
      try {
        const aiIntents = await this.recognizeByAI(context, ruleBasedIntents);
        const mergedIntents = this.mergeIntents(ruleBasedIntents, aiIntents);

        // 缓存结果
        if (mergedIntents.length > 0) {
          this.intentCache.set(contextHash, {
            intent: mergedIntents[0],
            timestamp: Date.now(),
            contextHash,
          });
        }

        // 更新最近的意图
        this.updateRecentIntents(mergedIntents);

        this.emit('intents:recognized', mergedIntents);
        return mergedIntents.filter(i => i.confidence >= this.config.minConfidence);
      } catch (error) {
        console.warn('AI 意图识别失败，使用规则识别结果:', error);
      }
    }

    this.updateRecentIntents(ruleBasedIntents);
    this.emit('intents:recognized', ruleBasedIntents);
    return ruleBasedIntents.filter(i => i.confidence >= this.config.minConfidence);
  }

  /**
   * 获取最近识别的意图
   */
  getRecentIntents(): UserIntent[] {
    return [...this.recentIntents];
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.intentCache.clear();
    this.recentIntents = [];
  }

  // ============ 基于规则的识别 ============

  private recognizeByRules(context: ExtendedPerceptionContext): UserIntent[] {
    const intents: UserIntent[] = [];
    const intentContext = this.buildIntentContext(context);

    // 规则 1: 检测文件整理意图
    if (this.isFileOrganizeContext(context)) {
      intents.push(this.createIntent('file_organize', '整理文件或下载', 0.7, [], intentContext));
    }

    // 规则 2: 检测代码辅助意图
    if (this.isCodeContext(context)) {
      intents.push(this.createIntent('code_assist', '代码开发辅助', 0.75, [], intentContext));
    }

    // 规则 3: 检测搜索意图
    if (this.isSearchContext(context)) {
      intents.push(this.createIntent('search', '搜索信息', 0.6, [], intentContext));
    }

    // 规则 4: 检测写作/沟通意图
    if (this.isWritingContext(context)) {
      intents.push(this.createIntent('communication', '写作或沟通', 0.65, [], intentContext));
    }

    // 规则 5: 检测重复操作（自动化候选）
    if (this.isRepetitiveAction(context)) {
      intents.push(this.createIntent('automation', '检测到重复操作', 0.55, [], intentContext));
    }

    // 规则 6: 检测数据处理意图
    if (this.isDataProcessContext(context)) {
      intents.push(this.createIntent('data_process', '数据处理', 0.6, [], intentContext));
    }

    return intents;
  }

  private isFileOrganizeContext(context: ExtendedPerceptionContext): boolean {
    const app = context.activeWindow?.appName?.toLowerCase() || '';
    const title = context.activeWindow?.title?.toLowerCase() || '';

    // Finder/文件管理器
    if (app.includes('finder') || app.includes('explorer') || app.includes('nautilus')) {
      return true;
    }

    // 下载目录
    if (title.includes('download') || title.includes('下载')) {
      return true;
    }

    // 有新文件事件
    if (context.fileEvents && context.fileEvents.length > 0) {
      return true;
    }

    return false;
  }

  private isCodeContext(context: ExtendedPerceptionContext): boolean {
    const app = context.activeWindow?.appName?.toLowerCase() || '';
    const title = context.activeWindow?.title?.toLowerCase() || '';

    // IDE/编辑器
    const codeApps = ['vscode', 'code', 'idea', 'webstorm', 'pycharm', 'sublime', 'vim', 'nvim', 'emacs', 'atom', 'cursor'];
    if (codeApps.some(a => app.includes(a))) {
      return true;
    }

    // 代码文件
    const codeExts = ['.ts', '.js', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h', '.swift', '.kt'];
    if (codeExts.some(ext => title.includes(ext))) {
      return true;
    }

    // 剪贴板有代码
    const clipboard = context.clipboard || '';
    if (this.looksLikeCode(clipboard)) {
      return true;
    }

    return false;
  }

  private isSearchContext(context: ExtendedPerceptionContext): boolean {
    const app = context.activeWindow?.appName?.toLowerCase() || '';
    const title = context.activeWindow?.title?.toLowerCase() || '';

    // 浏览器
    if (app.includes('chrome') || app.includes('safari') || app.includes('firefox') || app.includes('edge')) {
      // 搜索页面
      if (title.includes('google') || title.includes('bing') || title.includes('baidu') || title.includes('搜索')) {
        return true;
      }
    }

    return false;
  }

  private isWritingContext(context: ExtendedPerceptionContext): boolean {
    const app = context.activeWindow?.appName?.toLowerCase() || '';
    const title = context.activeWindow?.title?.toLowerCase() || '';

    // 写作应用
    const writingApps = ['word', 'pages', 'docs', 'notion', 'obsidian', 'typora', 'bear', 'ulysses'];
    if (writingApps.some(a => app.includes(a) || title.includes(a))) {
      return true;
    }

    // 邮件应用
    const mailApps = ['mail', 'outlook', 'gmail', 'thunderbird'];
    if (mailApps.some(a => app.includes(a) || title.includes(a))) {
      return true;
    }

    return false;
  }

  private isRepetitiveAction(context: ExtendedPerceptionContext): boolean {
    // 检测文件事件是否有重复模式
    if (context.fileEvents && context.fileEvents.length >= 3) {
      const types = context.fileEvents.map(e => e.type);
      const uniqueTypes = new Set(types);
      // 如果大部分是同类型操作
      if (uniqueTypes.size === 1) {
        return true;
      }
    }

    return false;
  }

  private isDataProcessContext(context: ExtendedPerceptionContext): boolean {
    const app = context.activeWindow?.appName?.toLowerCase() || '';
    const title = context.activeWindow?.title?.toLowerCase() || '';

    // 数据处理应用
    const dataApps = ['excel', 'numbers', 'sheets', 'tableau', 'jupyter', 'rstudio'];
    if (dataApps.some(a => app.includes(a) || title.includes(a))) {
      return true;
    }

    // 数据文件
    const dataExts = ['.csv', '.xlsx', '.xls', '.json', '.xml', '.sql'];
    if (dataExts.some(ext => title.includes(ext))) {
      return true;
    }

    return false;
  }

  private looksLikeCode(text: string): boolean {
    if (!text || text.length < 20) return false;

    // 代码特征
    const codePatterns = [
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /var\s+\w+\s*=/,
      /class\s+\w+/,
      /import\s+.*from/,
      /def\s+\w+\s*\(/,
      /if\s*\(.*\)\s*{/,
      /for\s*\(.*\)\s*{/,
      /=>/,
      /\{\s*\n/,
    ];

    return codePatterns.some(pattern => pattern.test(text));
  }

  // ============ AI 增强识别 ============

  private async recognizeByAI(
    context: ExtendedPerceptionContext,
    ruleBasedIntents: UserIntent[]
  ): Promise<UserIntent[]> {
    if (!this.aiManager) return [];

    const contextDesc = this.buildContextDescription(context);
    const ruleHints = ruleBasedIntents.map(i => `${i.type}: ${i.description}`).join(', ');

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `你是 Hawkeye 意图识别引擎。根据用户的当前上下文（包括屏幕内容、剪贴板、文件操作、以及用户的语音指令），识别用户可能的意图。

特别注意：如果用户有语音输入，这通常是最重要的意图信号，应该优先考虑用户说的话。

输出格式（JSON）:
{
  "intents": [
    {
      "type": "意图类型",
      "description": "简短描述",
      "confidence": 0.8,
      "entities": []
    }
  ]
}

意图类型包括:
- file_organize: 文件整理
- code_assist: 代码辅助
- search: 搜索信息
- automation: 自动化操作
- learning: 学习/理解
- communication: 沟通/写作
- data_process: 数据处理
- system_config: 系统配置
- voice_command: 语音指令 (当用户通过语音下达明确指令时)

只返回 JSON，不要其他内容。`,
      },
      {
        role: 'user',
        content: `当前上下文:
${contextDesc}

规则预识别的意图: ${ruleHints || '无'}

请分析用户意图:`,
      },
    ];

    try {
      const response = await this.aiManager.chat(messages);
      return this.parseAIIntentResponse(response.text, this.buildIntentContext(context));
    } catch (error) {
      console.warn('AI 意图识别出错:', error);
      return [];
    }
  }

  private parseAIIntentResponse(text: string, intentContext: IntentContext): UserIntent[] {
    try {
      // 提取 JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const data = JSON.parse(jsonMatch[0]);
      if (!data.intents || !Array.isArray(data.intents)) return [];

      return data.intents.map((item: any) => this.createIntent(
        item.type || 'unknown',
        item.description || '',
        Math.min(1, Math.max(0, item.confidence || 0.5)),
        item.entities || [],
        intentContext
      ));
    } catch {
      return [];
    }
  }

  // ============ 辅助方法 ============

  private createIntent(
    type: IntentType,
    description: string,
    confidence: number,
    entities: IntentEntity[],
    context: IntentContext
  ): UserIntent {
    return {
      id: `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      description,
      confidence,
      entities,
      context,
      createdAt: Date.now(),
    };
  }

  private buildIntentContext(context: ExtendedPerceptionContext): IntentContext {
    const appName = context.activeWindow?.appName?.toLowerCase() || '';

    let activityState: IntentContext['activityState'] = 'idle';
    if (this.isCodeContext(context)) activityState = 'coding';
    else if (this.isSearchContext(context)) activityState = 'browsing';
    else if (this.isWritingContext(context)) activityState = 'writing';
    else if (this.isFileOrganizeContext(context)) activityState = 'organizing';

    let clipboardType: IntentContext['clipboardType'] = 'text';
    const clipboard = context.clipboard || '';
    if (this.looksLikeCode(clipboard)) clipboardType = 'code';
    else if (clipboard.match(/^https?:\/\//)) clipboardType = 'url';

    return {
      currentApp: context.activeWindow?.appName,
      currentFile: context.activeWindow?.title,
      clipboardType,
      activityState,
    };
  }

  private buildContextDescription(context: ExtendedPerceptionContext): string {
    const parts: string[] = [];

    if (context.activeWindow) {
      parts.push(`应用: ${context.activeWindow.appName}`);
      parts.push(`窗口: ${context.activeWindow.title}`);
    }

    if (context.clipboard) {
      const preview = context.clipboard.length > 100
        ? context.clipboard.slice(0, 100) + '...'
        : context.clipboard;
      parts.push(`剪贴板: ${preview}`);
    }

    if (context.ocr?.text) {
      const preview = context.ocr.text.length > 200
        ? context.ocr.text.slice(0, 200) + '...'
        : context.ocr.text;
      parts.push(`屏幕文字: ${preview}`);
    }

    // ASR 语音转录
    if (context.speechText) {
      const preview = context.speechText.length > 200
        ? context.speechText.slice(0, 200) + '...'
        : context.speechText;
      const langInfo = context.speechLanguage ? ` (${context.speechLanguage})` : '';
      parts.push(`用户语音${langInfo}: ${preview}`);
    }

    if (context.fileEvents && context.fileEvents.length > 0) {
      const recent = context.fileEvents.slice(-5);
      const fileDesc = recent.map(e => `${e.type}: ${e.path}`).join(', ');
      parts.push(`最近文件操作: ${fileDesc}`);
    }

    return parts.join('\n');
  }

  private hashContext(context: ExtendedPerceptionContext): string {
    const key = [
      context.activeWindow?.appName,
      context.activeWindow?.title,
      context.clipboard?.slice(0, 50),
      context.speechText?.slice(0, 50), // Include ASR in cache key
    ].join('|');

    // 简单的哈希
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private mergeIntents(ruleIntents: UserIntent[], aiIntents: UserIntent[]): UserIntent[] {
    const merged = new Map<IntentType, UserIntent>();

    // 先添加规则识别的
    for (const intent of ruleIntents) {
      merged.set(intent.type, intent);
    }

    // AI 识别的可以覆盖或补充
    for (const intent of aiIntents) {
      const existing = merged.get(intent.type);
      if (!existing || intent.confidence > existing.confidence) {
        merged.set(intent.type, {
          ...intent,
          // 如果规则也识别到了，提高置信度
          confidence: existing
            ? Math.min(1, (intent.confidence + existing.confidence) / 2 + 0.1)
            : intent.confidence,
        });
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  private updateRecentIntents(intents: UserIntent[]): void {
    this.recentIntents = [...intents, ...this.recentIntents].slice(0, 10);
  }
}
