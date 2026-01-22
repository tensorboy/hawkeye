/**
 * ProactiveIntentDetector - 主动意图检测器
 *
 * 无需用户输入，自动检测用户意图并提供建议
 * 基于上下文变化、时间、错误检测等触发条件
 *
 * 触发条件：
 * - window_switch: 窗口切换时
 * - idle_timeout: 用户空闲时
 * - repeated_action: 重复操作检测
 * - error_detected: 检测到错误时
 * - file_changed: 文件变化时
 * - clipboard_content: 剪贴板内容变化时
 * - time_based: 特定时间触发
 */

import { EventEmitter } from 'events';
import type {
  ProactiveIntent,
  IntentTrigger,
  TriggerHandler,
  TriggerConfig,
  ProactiveIntentConfig,
} from './types';
import { DEFAULT_PROACTIVE_INTENT_CONFIG } from './types';
import { PatternDetector } from './pattern-detector';
import type { ExtendedPerceptionContext } from '../perception/engine';
import type { ExecutionPlan, PlanStep, UserIntent, ActionType } from '../ai/types';

// ============ 辅助函数 ============

let idCounter = 0;

function generateId(): string {
  return `int_${Date.now()}_${++idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

function generatePlanId(): string {
  return `plan_${Date.now()}_${++idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============ 内置触发器处理器 ============

const createWindowSwitchHandler = (detector: ProactiveIntentDetector): TriggerHandler => {
  return async (context, prevContext) => {
    if (!prevContext?.activeWindow || !context.activeWindow) return null;

    const prevApp = prevContext.activeWindow.appName;
    const currentApp = context.activeWindow.appName;

    if (prevApp === currentApp) return null;

    // 根据应用切换生成意图
    const intents: Record<string, () => ProactiveIntent> = {
      // 切换到 VS Code
      'Visual Studio Code': () => ({
        id: generateId(),
        trigger: 'window_switch',
        confidence: 0.6,
        title: '继续编码',
        description: '你回到了 VS Code，需要运行上次的命令吗？',
        suggestedPlan: createSimplePlan('继续编码', [
          { actionType: 'shell', params: { command: 'npm run dev' }, description: '启动开发服务器' },
        ]),
        autoExecute: false,
        requiresConfirmation: true,
        detectedAt: Date.now(),
        context: { activeWindow: context.activeWindow },
      }),

      // 切换到终端
      'Terminal': () => ({
        id: generateId(),
        trigger: 'window_switch',
        confidence: 0.5,
        title: '清理终端',
        description: '切换到终端，需要清除屏幕吗？',
        suggestedPlan: createSimplePlan('清理终端', [
          { actionType: 'shell', params: { command: 'clear' }, description: '清除终端屏幕' },
        ]),
        autoExecute: false,
        requiresConfirmation: true,
        detectedAt: Date.now(),
        context: { activeWindow: context.activeWindow },
      }),

      // 切换到浏览器
      'Google Chrome': () => ({
        id: generateId(),
        trigger: 'window_switch',
        confidence: 0.4,
        title: '刷新页面',
        description: '切换到浏览器，需要刷新页面吗？',
        suggestedPlan: createSimplePlan('刷新页面', [
          { actionType: 'hotkey' as any, params: { keys: ['cmd', 'r'] }, description: '刷新页面' },
        ]),
        autoExecute: false,
        requiresConfirmation: true,
        detectedAt: Date.now(),
        context: { activeWindow: context.activeWindow },
      }),
    };

    const handler = intents[currentApp];
    return handler ? handler() : null;
  };
};

const createIdleTimeoutHandler = (detector: ProactiveIntentDetector): TriggerHandler => {
  return async (context) => {
    // 检查是否有未保存的工作
    const hasUnsavedWork = context.activeWindow?.title?.includes('•') ||
                          context.activeWindow?.title?.includes('*');

    if (hasUnsavedWork) {
      return {
        id: generateId(),
        trigger: 'idle_timeout',
        confidence: 0.7,
        title: '保存工作',
        description: '你已经空闲一段时间了，检测到可能有未保存的工作',
        suggestedPlan: createSimplePlan('保存工作', [
          { actionType: 'hotkey' as any, params: { keys: ['cmd', 's'] }, description: '保存文件' },
        ]),
        autoExecute: false,
        requiresConfirmation: true,
        detectedAt: Date.now(),
        context: { activeWindow: context.activeWindow },
      };
    }

    // 建议休息
    return {
      id: generateId(),
      trigger: 'idle_timeout',
      confidence: 0.5,
      title: '休息提醒',
      description: '你已经工作了一段时间，需要休息一下吗？',
      suggestedPlan: createSimplePlan('休息提醒', [
        { actionType: 'notification', params: { title: 'Hawkeye', message: '该休息一下了！' }, description: '显示休息提醒' },
      ]),
      autoExecute: false,
      requiresConfirmation: true,
      detectedAt: Date.now(),
      context: {},
    };
  };
};

const createRepeatedActionHandler = (
  detector: ProactiveIntentDetector,
  patternDetector: PatternDetector
): TriggerHandler => {
  return async (context) => {
    const repetition = patternDetector.detectRepetition(3);
    if (!repetition) return null;

    return {
      id: generateId(),
      trigger: 'repeated_action',
      confidence: 0.8,
      title: '自动化重复操作',
      description: `检测到你重复执行 "${repetition.type}" 操作 3 次以上，需要自动化吗？`,
      suggestedPlan: createSimplePlan('自动化操作', [
        {
          actionType: repetition.type as any,
          params: repetition.params,
          description: `自动执行 ${repetition.type}`,
        },
      ]),
      autoExecute: false,
      requiresConfirmation: true,
      detectedAt: Date.now(),
      context: { activeWindow: context.activeWindow },
    };
  };
};

const createErrorDetectedHandler = (detector: ProactiveIntentDetector): TriggerHandler => {
  return async (context) => {
    // 检查 OCR 结果中是否有错误关键词
    const ocrText = context.ocr?.text?.toLowerCase() ?? '';
    const errorKeywords = ['error', 'exception', 'failed', 'crash', '错误', '失败', '异常'];

    const hasError = errorKeywords.some(keyword => ocrText.includes(keyword));
    if (!hasError) return null;

    return {
      id: generateId(),
      trigger: 'error_detected',
      confidence: 0.7,
      title: '检测到错误',
      description: '屏幕上可能有错误信息，需要帮助分析吗？',
      suggestedPlan: createSimplePlan('分析错误', [
        {
          actionType: 'shell',
          params: { command: 'echo "准备分析错误..."' },
          description: '准备错误分析',
        },
      ]),
      autoExecute: false,
      requiresConfirmation: true,
      detectedAt: Date.now(),
      context: { ocr: context.ocr },
    };
  };
};

const createFileChangedHandler = (detector: ProactiveIntentDetector): TriggerHandler => {
  return async (context) => {
    const fileEvents = context.fileEvents ?? [];
    if (fileEvents.length === 0) return null;

    // 检查是否有新文件下载
    const downloadEvents = fileEvents.filter(e =>
      e.path.toLowerCase().includes('download') && e.type === 'create'
    );

    if (downloadEvents.length > 0) {
      const latestDownload = downloadEvents[downloadEvents.length - 1];
      return {
        id: generateId(),
        trigger: 'file_changed',
        confidence: 0.6,
        title: '新下载文件',
        description: `检测到新下载: ${latestDownload.path.split('/').pop()}`,
        suggestedPlan: createSimplePlan('处理下载', [
          {
            actionType: 'shell',
            params: { command: `open -R "${latestDownload.path}"` },
            description: '在 Finder 中显示',
          },
        ]),
        autoExecute: false,
        requiresConfirmation: true,
        detectedAt: Date.now(),
        context: { fileEvents },
      };
    }

    return null;
  };
};

const createClipboardContentHandler = (detector: ProactiveIntentDetector): TriggerHandler => {
  let lastClipboard = '';

  return async (context) => {
    const clipboard = context.clipboard ?? '';
    if (clipboard === lastClipboard || clipboard.length === 0) return null;

    lastClipboard = clipboard;

    // URL 检测
    const urlRegex = /https?:\/\/[^\s]+/;
    if (urlRegex.test(clipboard)) {
      const url = clipboard.match(urlRegex)![0];
      return {
        id: generateId(),
        trigger: 'clipboard_content',
        confidence: 0.7,
        title: '打开链接',
        description: `剪贴板包含链接: ${url.slice(0, 50)}...`,
        suggestedPlan: createSimplePlan('打开链接', [
          { actionType: 'url_open', params: { url }, description: '在浏览器中打开' },
        ]),
        autoExecute: false,
        requiresConfirmation: true,
        detectedAt: Date.now(),
        context: { clipboard },
      };
    }

    // Shell 命令检测
    const shellPatterns = [/^\s*(npm|yarn|git|cd|ls|mkdir|rm|cp|mv|cat|echo)\s/];
    if (shellPatterns.some(p => p.test(clipboard))) {
      return {
        id: generateId(),
        trigger: 'clipboard_content',
        confidence: 0.6,
        title: '执行命令',
        description: `剪贴板包含命令: ${clipboard.slice(0, 50)}...`,
        suggestedPlan: createSimplePlan('执行命令', [
          { actionType: 'shell', params: { command: clipboard }, description: '执行剪贴板中的命令' },
        ]),
        autoExecute: false,
        requiresConfirmation: true,
        detectedAt: Date.now(),
        context: { clipboard },
      };
    }

    return null;
  };
};

const createTimeBasedHandler = (detector: ProactiveIntentDetector): TriggerHandler => {
  const scheduledTasks: Array<{
    hour: number;
    minute: number;
    dayOfWeek?: number[];
    intent: Omit<ProactiveIntent, 'id' | 'detectedAt' | 'context'>;
    lastTriggered?: number;
  }> = [
    {
      hour: 9,
      minute: 0,
      dayOfWeek: [1, 2, 3, 4, 5],
      intent: {
        trigger: 'time_based',
        confidence: 0.6,
        title: '早间检查',
        description: '早上好！需要查看邮件和日历吗？',
        suggestedPlan: createSimplePlan('早间检查', [
          { actionType: 'app_open', params: { app: 'Mail' }, description: '打开邮件' },
        ]),
        autoExecute: false,
        requiresConfirmation: true,
      },
    },
    {
      hour: 18,
      minute: 0,
      intent: {
        trigger: 'time_based',
        confidence: 0.5,
        title: '整理工作',
        description: '一天快结束了，需要整理下载文件夹吗？',
        suggestedPlan: createSimplePlan('整理文件', [
          { actionType: 'shell', params: { command: 'open ~/Downloads' }, description: '打开下载文件夹' },
        ]),
        autoExecute: false,
        requiresConfirmation: true,
      },
    },
  ];

  return async (context) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay();

    for (const task of scheduledTasks) {
      // 检查时间匹配
      if (task.hour !== currentHour || Math.abs(task.minute - currentMinute) > 5) {
        continue;
      }

      // 检查星期匹配
      if (task.dayOfWeek && !task.dayOfWeek.includes(currentDay)) {
        continue;
      }

      // 检查是否已触发过 (每天只触发一次)
      const lastTriggered = task.lastTriggered ?? 0;
      const hoursSinceLastTrigger = (Date.now() - lastTriggered) / (1000 * 60 * 60);
      if (hoursSinceLastTrigger < 12) {
        continue;
      }

      task.lastTriggered = Date.now();

      return {
        ...task.intent,
        id: generateId(),
        detectedAt: Date.now(),
        context: {},
      };
    }

    return null;
  };
};

// ============ 辅助函数 ============

/** 有效的动作类型列表 (来自 ActionType) */
const VALID_ACTION_TYPES: ActionType[] = [
  'shell', 'file_read', 'file_write', 'file_move', 'file_delete', 'file_copy',
  'folder_create', 'folder_delete', 'url_open', 'browser_action',
  'app_open', 'app_close', 'app_action', 'clipboard_set', 'clipboard_get',
  'notification', 'api_call', 'wait', 'condition', 'loop', 'user_input'
];

/** 动作类型映射 (将 GUI 动作映射到 ActionType) */
const ACTION_TYPE_MAP: Record<string, ActionType> = {
  'click': 'browser_action',
  'type': 'browser_action',
  'scroll': 'browser_action',
  'hotkey': 'browser_action',
  'custom': 'app_action',
};

/** 验证并返回有效的动作类型 */
function validateActionType(actionType: string): ActionType {
  // 直接匹配有效类型
  if (VALID_ACTION_TYPES.includes(actionType as ActionType)) {
    return actionType as ActionType;
  }
  // 尝试映射
  if (actionType in ACTION_TYPE_MAP) {
    return ACTION_TYPE_MAP[actionType];
  }
  // 回退到 app_action 类型
  console.warn(`[ProactiveIntent] Unknown action type "${actionType}", falling back to "app_action"`);
  return 'app_action';
}

interface SimplePlanOptions {
  /** 意图类型 */
  intentType?: UserIntent['type'];
  /** 置信度 */
  confidence?: number;
  /** 优点列表 */
  pros?: string[];
  /** 缺点列表 */
  cons?: string[];
  /** 是否需要确认 */
  requiresConfirmation?: boolean;
}

function createSimplePlan(
  title: string,
  steps: Array<{ actionType: string; params: Record<string, unknown>; description: string }>,
  options: SimplePlanOptions = {}
): ExecutionPlan {
  const {
    intentType = 'automation',
    confidence = 0.8,
    pros = ['自动化执行'],
    cons = [],
    requiresConfirmation = true,
  } = options;

  return {
    id: generatePlanId(),
    title,
    description: title,
    intent: {
      id: generateId(),
      type: intentType,
      description: title,
      confidence,
      entities: [],
      context: {},
      createdAt: Date.now(),
    },
    steps: steps.map((s, i) => ({
      id: `step_${i}`,
      description: s.description,
      actionType: validateActionType(s.actionType),
      params: s.params,
      riskLevel: 'low' as const,
      reversible: false,
    })),
    pros,
    cons,
    impact: {
      filesAffected: 0,
      systemChanges: false,
      requiresNetwork: false,
      fullyReversible: false,
      estimatedDuration: steps.length,
    },
    requiresConfirmation,
    createdAt: Date.now(),
  };
}

// ============ ProactiveIntentDetector 类 ============

export class ProactiveIntentDetector extends EventEmitter {
  private config: ProactiveIntentConfig;
  private patternDetector: PatternDetector;
  private handlers: Map<IntentTrigger, TriggerHandler> = new Map();
  private lastTriggerTime: Map<IntentTrigger, number> = new Map();
  private lastGlobalTriggerTime: number = 0;
  private lastContext: ExtendedPerceptionContext | null = null;
  private lastActivityTime: number = Date.now();

  // 空闲检测
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    patternDetector: PatternDetector,
    config: Partial<ProactiveIntentConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_PROACTIVE_INTENT_CONFIG, ...config };
    this.patternDetector = patternDetector;

    // 注册默认处理器
    this.registerDefaultHandlers();
  }

  /**
   * 检测意图
   */
  async detect(
    context: ExtendedPerceptionContext,
    prevContext?: ExtendedPerceptionContext
  ): Promise<ProactiveIntent | null> {
    if (!this.config.enabled) return null;

    // 检查全局冷却
    const now = Date.now();
    if (now - this.lastGlobalTriggerTime < this.config.globalCooldown) {
      return null;
    }

    // 更新活动时间
    this.lastActivityTime = now;

    // 按优先级检查各个触发器
    const triggers: IntentTrigger[] = [
      'error_detected',      // 最高优先级
      'repeated_action',
      'window_switch',
      'clipboard_content',
      'file_changed',
      'idle_timeout',
      'time_based',          // 最低优先级
    ];

    for (const trigger of triggers) {
      const triggerConfig = this.config.triggers.find(t => t.trigger === trigger);
      if (!triggerConfig?.enabled) continue;

      // 检查触发器冷却
      const lastTrigger = this.lastTriggerTime.get(trigger) ?? 0;
      if (now - lastTrigger < triggerConfig.cooldown) continue;

      const handler = this.handlers.get(trigger);
      if (!handler) continue;

      try {
        const intent = await handler(context, prevContext ?? this.lastContext ?? undefined);

        if (intent && intent.confidence >= triggerConfig.minConfidence) {
          // 更新时间记录
          this.lastTriggerTime.set(trigger, now);
          this.lastGlobalTriggerTime = now;

          // 检查是否自动执行
          intent.autoExecute = intent.confidence >= triggerConfig.autoExecuteThreshold;

          this.emit('intent:detected', intent);
          this.lastContext = context;

          return intent;
        }
      } catch (error) {
        console.warn(`[ProactiveIntent] Handler error for ${trigger}:`, error);
      }
    }

    this.lastContext = context;
    return null;
  }

  /**
   * 注册触发器处理器
   */
  registerTrigger(trigger: IntentTrigger, handler: TriggerHandler): void {
    this.handlers.set(trigger, handler);
  }

  /**
   * 启动空闲检测
   */
  startIdleDetection(): void {
    if (this.idleTimer) return;

    this.idleTimer = setInterval(async () => {
      const idleTime = Date.now() - this.lastActivityTime;

      if (idleTime >= this.config.idleTimeout) {
        const handler = this.handlers.get('idle_timeout');
        if (handler && this.lastContext) {
          const intent = await handler(this.lastContext);
          if (intent) {
            this.emit('intent:detected', intent);
          }
        }
      }
    }, 10000);  // 每 10 秒检查一次
  }

  /**
   * 停止空闲检测
   */
  stopIdleDetection(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * 更新活动时间 (用于空闲检测)
   */
  updateActivityTime(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * 设置自动执行阈值
   */
  setAutoExecuteThreshold(trigger: IntentTrigger, threshold: number): void {
    const config = this.config.triggers.find(t => t.trigger === trigger);
    if (config) {
      config.autoExecuteThreshold = threshold;
    }
  }

  /**
   * 启用/禁用触发器
   */
  setTriggerEnabled(trigger: IntentTrigger, enabled: boolean): void {
    const config = this.config.triggers.find(t => t.trigger === trigger);
    if (config) {
      config.enabled = enabled;
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ProactiveIntentConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config:updated', this.config);
  }

  /**
   * 获取配置
   */
  getConfig(): ProactiveIntentConfig {
    return { ...this.config };
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    enabledTriggers: IntentTrigger[];
    triggerCounts: Map<IntentTrigger, number>;
    lastActivityTime: number;
    idleTime: number;
  } {
    return {
      enabledTriggers: this.config.triggers.filter(t => t.enabled).map(t => t.trigger),
      triggerCounts: new Map(this.lastTriggerTime),
      lastActivityTime: this.lastActivityTime,
      idleTime: Date.now() - this.lastActivityTime,
    };
  }

  // ============ 私有方法 ============

  private registerDefaultHandlers(): void {
    this.handlers.set('window_switch', createWindowSwitchHandler(this));
    this.handlers.set('idle_timeout', createIdleTimeoutHandler(this));
    this.handlers.set('repeated_action', createRepeatedActionHandler(this, this.patternDetector));
    this.handlers.set('error_detected', createErrorDetectedHandler(this));
    this.handlers.set('file_changed', createFileChangedHandler(this));
    this.handlers.set('clipboard_content', createClipboardContentHandler(this));
    this.handlers.set('time_based', createTimeBasedHandler(this));
  }
}

// ============ 工厂函数 ============

export function createProactiveIntentDetector(
  patternDetector: PatternDetector,
  config?: Partial<ProactiveIntentConfig>
): ProactiveIntentDetector {
  return new ProactiveIntentDetector(patternDetector, config);
}
