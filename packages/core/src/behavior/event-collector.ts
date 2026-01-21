/**
 * 行为事件收集器
 * 负责收集、缓存和批量存储用户行为事件
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  BehaviorEvent,
  BehaviorEventType,
  BehaviorTrackerConfig,
  DEFAULT_BEHAVIOR_CONFIG,
} from './types';

export interface EventCollectorOptions {
  config?: Partial<BehaviorTrackerConfig>;
  onBatch?: (events: BehaviorEvent[]) => Promise<void>;
}

export class BehaviorEventCollector extends EventEmitter {
  private config: BehaviorTrackerConfig;
  private eventBuffer: BehaviorEvent[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private onBatch?: (events: BehaviorEvent[]) => Promise<void>;
  private isRunning = false;

  constructor(options: EventCollectorOptions = {}) {
    super();
    this.config = { ...DEFAULT_BEHAVIOR_CONFIG, ...options.config };
    this.onBatch = options.onBatch;
  }

  /**
   * 启动事件收集器
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // 启动批处理定时器
    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, this.config.batchIntervalMs);

    this.emit('started');
  }

  /**
   * 停止事件收集器
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    // 刷新剩余事件
    this.flushBatch();
    this.emit('stopped');
  }

  /**
   * 记录行为事件
   */
  recordEvent(
    eventType: BehaviorEventType,
    data: Partial<BehaviorEvent['data']>,
    environment?: Partial<BehaviorEvent['environment']>
  ): BehaviorEvent {
    if (!this.config.enabled) {
      throw new Error('Behavior tracking is disabled');
    }

    const event: BehaviorEvent = {
      id: uuidv4(),
      timestamp: Date.now(),
      eventType,
      data: {
        action: data.action || eventType,
        target: data.target || '',
        context: data.context || {},
        duration: data.duration,
        result: data.result,
      },
      environment: {
        platform: process.platform,
        activeApp: environment?.activeApp || 'unknown',
        windowTitle: environment?.windowTitle || '',
        screenResolution: environment?.screenResolution,
      },
    };

    // 隐私检查
    if (this.shouldExclude(event)) {
      return event;
    }

    // 添加到缓冲区
    this.eventBuffer.push(event);

    // 检查是否需要立即刷新
    if (this.eventBuffer.length >= this.config.batchSize) {
      this.flushBatch();
    }

    // 发出事件
    this.emit('event', event);

    return event;
  }

  /**
   * 记录应用切换事件
   */
  recordAppSwitch(fromApp: string, toApp: string, windowTitle: string): BehaviorEvent {
    return this.recordEvent(
      BehaviorEventType.APP_SWITCH,
      {
        action: 'switch',
        target: toApp,
        context: { fromApp, toApp },
      },
      { activeApp: toApp, windowTitle }
    );
  }

  /**
   * 记录窗口焦点变化
   */
  recordWindowFocus(appName: string, windowTitle: string): BehaviorEvent {
    return this.recordEvent(
      BehaviorEventType.WINDOW_FOCUS,
      {
        action: 'focus',
        target: windowTitle,
        context: { appName },
      },
      { activeApp: appName, windowTitle }
    );
  }

  /**
   * 记录文件操作
   */
  recordFileOperation(
    operation: 'open' | 'save' | 'create' | 'delete' | 'move',
    filePath: string,
    context: Record<string, unknown> = {}
  ): BehaviorEvent {
    const eventTypeMap: Record<string, BehaviorEventType> = {
      open: BehaviorEventType.FILE_OPEN,
      save: BehaviorEventType.FILE_SAVE,
      create: BehaviorEventType.FILE_CREATE,
      delete: BehaviorEventType.FILE_DELETE,
      move: BehaviorEventType.FILE_MOVE,
    };

    return this.recordEvent(eventTypeMap[operation], {
      action: operation,
      target: filePath,
      context,
    });
  }

  /**
   * 记录剪贴板操作
   */
  recordClipboardOperation(
    operation: 'copy' | 'paste',
    contentType: string,
    contentLength: number
  ): BehaviorEvent {
    const eventType =
      operation === 'copy'
        ? BehaviorEventType.CLIPBOARD_COPY
        : BehaviorEventType.CLIPBOARD_PASTE;

    return this.recordEvent(eventType, {
      action: operation,
      target: contentType,
      context: { contentType, contentLength },
    });
  }

  /**
   * 记录建议交互
   */
  recordSuggestionInteraction(
    interaction: 'view' | 'accept' | 'reject' | 'modify',
    suggestionId: string,
    suggestionType: string,
    feedback?: { reason?: string; modifiedAction?: string }
  ): BehaviorEvent {
    const eventTypeMap: Record<string, BehaviorEventType> = {
      view: BehaviorEventType.SUGGESTION_VIEW,
      accept: BehaviorEventType.SUGGESTION_ACCEPT,
      reject: BehaviorEventType.SUGGESTION_REJECT,
      modify: BehaviorEventType.SUGGESTION_MODIFY,
    };

    const event = this.recordEvent(eventTypeMap[interaction], {
      action: interaction,
      target: suggestionId,
      context: { suggestionType },
    });

    if (feedback) {
      event.feedback = {
        type: interaction as 'accept' | 'reject' | 'modify' | 'ignore',
        reason: feedback.reason,
        modifiedAction: feedback.modifiedAction,
      };
    }

    return event;
  }

  /**
   * 记录执行事件
   */
  recordExecution(
    phase: 'start' | 'complete',
    executionId: string,
    result?: 'success' | 'failure' | 'cancelled',
    duration?: number
  ): BehaviorEvent {
    const eventType =
      phase === 'start'
        ? BehaviorEventType.EXECUTION_START
        : BehaviorEventType.EXECUTION_COMPLETE;

    return this.recordEvent(eventType, {
      action: phase,
      target: executionId,
      context: {},
      result,
      duration,
    });
  }

  /**
   * 记录浏览器操作
   */
  recordBrowserAction(
    action: 'navigate' | 'search' | 'bookmark',
    url: string,
    title?: string
  ): BehaviorEvent {
    const eventTypeMap: Record<string, BehaviorEventType> = {
      navigate: BehaviorEventType.BROWSER_NAVIGATE,
      search: BehaviorEventType.BROWSER_SEARCH,
      bookmark: BehaviorEventType.BROWSER_BOOKMARK,
    };

    return this.recordEvent(eventTypeMap[action], {
      action,
      target: url,
      context: { title },
    });
  }

  /**
   * 记录键盘快捷键
   */
  recordKeyboardShortcut(shortcut: string, appName: string): BehaviorEvent {
    return this.recordEvent(
      BehaviorEventType.KEYBOARD_SHORTCUT,
      {
        action: 'shortcut',
        target: shortcut,
        context: {},
      },
      { activeApp: appName }
    );
  }

  /**
   * 记录命令执行
   */
  recordCommandExecution(
    command: string,
    result: 'success' | 'failure',
    duration: number
  ): BehaviorEvent {
    return this.recordEvent(BehaviorEventType.COMMAND_EXECUTE, {
      action: 'execute',
      target: command,
      context: {},
      result,
      duration,
    });
  }

  /**
   * 获取缓冲区中的事件数量
   */
  getBufferSize(): number {
    return this.eventBuffer.length;
  }

  /**
   * 强制刷新缓冲区
   */
  async flushBatch(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      if (this.onBatch) {
        await this.onBatch(events);
      }
      this.emit('batch', events);
    } catch (error) {
      // 如果保存失败，将事件放回缓冲区
      this.eventBuffer = [...events, ...this.eventBuffer];
      // 限制缓冲区大小
      if (this.eventBuffer.length > this.config.maxEventCache) {
        this.eventBuffer = this.eventBuffer.slice(-this.config.maxEventCache);
      }
      this.emit('error', error);
    }
  }

  /**
   * 检查事件是否应该被排除
   */
  private shouldExclude(event: BehaviorEvent): boolean {
    const privacy = this.config.habitLearning.privacy;

    // 检查排除的应用
    if (privacy.excludedApps.includes(event.environment.activeApp)) {
      return true;
    }

    // 检查排除的路径
    const target = event.data.target;
    if (
      target &&
      privacy.excludedPaths.some((path) => target.startsWith(path))
    ) {
      return true;
    }

    return false;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<BehaviorTrackerConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('configUpdated', this.config);
  }

  /**
   * 获取当前配置
   */
  getConfig(): BehaviorTrackerConfig {
    return { ...this.config };
  }
}
