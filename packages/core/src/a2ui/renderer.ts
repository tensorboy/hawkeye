/**
 * A2UI Renderer - A2UI 卡片渲染器
 * 管理卡片的创建、更新、生命周期和事件处理
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  A2UICard,
  A2UICardType,
  A2UIAction,
  A2UIActionEvent,
  A2UIShowEvent,
  A2UIDismissEvent,
  A2UIState,
  A2UIConfig,
  DEFAULT_A2UI_CONFIG,
  A2UISuggestionCard,
  A2UIPreviewCard,
  A2UIResultCard,
  A2UIConfirmationCard,
  A2UIProgressCard,
  A2UIInfoCard,
  A2UIErrorCard,
  A2UIChoiceCard,
  CreateSuggestionCardParams,
  CreatePreviewCardParams,
  CreateResultCardParams,
  CreateConfirmationCardParams,
} from './types';

export interface A2UIRendererOptions {
  config?: Partial<A2UIConfig>;
  onAction?: (event: A2UIActionEvent) => void;
  onShow?: (event: A2UIShowEvent) => void;
  onDismiss?: (event: A2UIDismissEvent) => void;
}

export class A2UIRenderer extends EventEmitter {
  private config: A2UIConfig;
  private state: A2UIState;
  private expirationTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(options: A2UIRendererOptions = {}) {
    super();
    this.config = { ...DEFAULT_A2UI_CONFIG, ...options.config };
    this.state = {
      cards: [],
      maxVisibleCards: this.config.maxVisibleCards,
      isLoading: false,
      perceptionStatus: 'idle',
      lastUpdate: Date.now(),
    };

    // 绑定事件回调
    if (options.onAction) {
      this.on('action', options.onAction);
    }
    if (options.onShow) {
      this.on('show', options.onShow);
    }
    if (options.onDismiss) {
      this.on('dismiss', options.onDismiss);
    }
  }

  // ============ 状态管理 ============

  /**
   * 获取当前状态
   */
  getState(): A2UIState {
    return { ...this.state, cards: [...this.state.cards] };
  }

  /**
   * 设置加载状态
   */
  setLoading(loading: boolean): void {
    this.state.isLoading = loading;
    this.state.lastUpdate = Date.now();
    this.emit('stateChange', this.getState());
  }

  /**
   * 设置感知状态
   */
  setPerceptionStatus(status: A2UIState['perceptionStatus']): void {
    this.state.perceptionStatus = status;
    this.state.lastUpdate = Date.now();
    this.emit('stateChange', this.getState());
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<A2UIConfig>): void {
    this.config = { ...this.config, ...config };
    this.state.maxVisibleCards = this.config.maxVisibleCards;
    this.emit('configChange', this.config);
  }

  // ============ 卡片管理 ============

  /**
   * 添加卡片
   */
  addCard(card: A2UICard): void {
    // 检查是否超过最大数量，移除最旧的卡片
    while (this.state.cards.length >= this.config.maxVisibleCards) {
      const oldest = this.state.cards[0];
      this.removeCard(oldest.id, 'replaced');
    }

    this.state.cards.push(card);
    this.state.lastUpdate = Date.now();

    // 设置过期定时器
    if (this.config.cardExpirationMs > 0 && !card.expiresAt) {
      const timer = setTimeout(() => {
        this.removeCard(card.id, 'timeout');
      }, this.config.cardExpirationMs);
      this.expirationTimers.set(card.id, timer);
    } else if (card.expiresAt) {
      const timeout = card.expiresAt - Date.now();
      if (timeout > 0) {
        const timer = setTimeout(() => {
          this.removeCard(card.id, 'timeout');
        }, timeout);
        this.expirationTimers.set(card.id, timer);
      }
    }

    // 触发事件
    const showEvent: A2UIShowEvent = {
      cardId: card.id,
      timestamp: Date.now(),
    };
    this.emit('show', showEvent);
    this.emit('stateChange', this.getState());
  }

  /**
   * 移除卡片
   */
  removeCard(cardId: string, reason: A2UIDismissEvent['reason'] = 'user'): void {
    const index = this.state.cards.findIndex((c) => c.id === cardId);
    if (index === -1) return;

    // 清除过期定时器
    const timer = this.expirationTimers.get(cardId);
    if (timer) {
      clearTimeout(timer);
      this.expirationTimers.delete(cardId);
    }

    this.state.cards.splice(index, 1);
    this.state.lastUpdate = Date.now();

    // 触发事件
    const dismissEvent: A2UIDismissEvent = {
      cardId,
      reason,
      timestamp: Date.now(),
    };
    this.emit('dismiss', dismissEvent);
    this.emit('stateChange', this.getState());
  }

  /**
   * 更新卡片
   */
  updateCard(cardId: string, updates: Partial<A2UICard>): void {
    const index = this.state.cards.findIndex((c) => c.id === cardId);
    if (index === -1) return;

    this.state.cards[index] = { ...this.state.cards[index], ...updates } as A2UICard;
    this.state.lastUpdate = Date.now();
    this.emit('stateChange', this.getState());
  }

  /**
   * 获取卡片
   */
  getCard(cardId: string): A2UICard | undefined {
    return this.state.cards.find((c) => c.id === cardId);
  }

  /**
   * 清除所有卡片
   */
  clearCards(): void {
    // 清除所有定时器
    for (const timer of this.expirationTimers.values()) {
      clearTimeout(timer);
    }
    this.expirationTimers.clear();

    // 触发关闭事件
    for (const card of this.state.cards) {
      const dismissEvent: A2UIDismissEvent = {
        cardId: card.id,
        reason: 'user',
        timestamp: Date.now(),
      };
      this.emit('dismiss', dismissEvent);
    }

    this.state.cards = [];
    this.state.lastUpdate = Date.now();
    this.emit('stateChange', this.getState());
  }

  // ============ 操作处理 ============

  /**
   * 处理卡片操作
   */
  handleAction(cardId: string, actionId: string, data?: Record<string, unknown>): void {
    const card = this.getCard(cardId);
    if (!card) return;

    const action = card.actions.find((a) => a.id === actionId);
    if (!action || action.disabled) return;

    const event: A2UIActionEvent = {
      cardId,
      actionId,
      timestamp: Date.now(),
      data,
    };

    this.emit('action', event);

    // 如果是关闭类型的操作，移除卡片
    if (action.type === 'dismiss') {
      this.removeCard(cardId, 'user');
    }
  }

  // ============ 卡片创建便捷方法 ============

  /**
   * 创建并添加建议卡片
   */
  createSuggestionCard(params: CreateSuggestionCardParams): A2UISuggestionCard {
    const card: A2UISuggestionCard = {
      id: uuidv4(),
      type: 'suggestion',
      title: params.title,
      description: params.description,
      icon: this.getSuggestionIcon(params.suggestionType),
      suggestionType: params.suggestionType,
      impact: params.impact,
      confidence: params.confidence,
      intentId: params.intentId,
      timestamp: Date.now(),
      actions: [
        {
          id: params.primaryAction.id || 'execute',
          label: params.primaryAction.label,
          type: 'primary',
          icon: 'lightning',
        },
        ...(params.secondaryAction
          ? [
              {
                id: params.secondaryAction.id || 'dismiss',
                label: params.secondaryAction.label,
                type: 'dismiss' as const,
                icon: 'x' as const,
              },
            ]
          : []),
      ],
    };

    this.addCard(card);
    return card;
  }

  /**
   * 创建并添加预览卡片
   */
  createPreviewCard(params: CreatePreviewCardParams): A2UIPreviewCard {
    const card: A2UIPreviewCard = {
      id: uuidv4(),
      type: 'preview',
      title: params.title,
      description: params.description,
      icon: 'eye',
      previewType: params.previewType,
      content: params.content,
      analysis: params.analysis,
      timestamp: Date.now(),
      actions: [
        {
          id: params.primaryAction.id || 'confirm',
          label: params.primaryAction.label,
          type: 'primary',
          icon: 'check',
        },
        ...(params.rejectAction
          ? [
              {
                id: params.rejectAction.id || 'reject',
                label: params.rejectAction.label,
                type: 'secondary' as const,
                icon: 'x' as const,
              },
            ]
          : []),
      ],
    };

    this.addCard(card);
    return card;
  }

  /**
   * 创建并添加结果卡片
   */
  createResultCard(params: CreateResultCardParams): A2UIResultCard {
    const card: A2UIResultCard = {
      id: uuidv4(),
      type: 'result',
      title: params.title,
      description: this.getResultDescription(params.status, params.summary),
      icon: this.getResultIcon(params.status),
      status: params.status,
      summary: params.summary,
      impact: params.impact,
      error: params.error,
      rollback: params.rollback,
      timestamp: Date.now(),
      actions: [
        {
          id: 'dismiss',
          label: 'OK',
          type: 'primary',
        },
        ...(params.rollback?.available
          ? [
              {
                id: 'rollback',
                label: 'Undo',
                type: 'secondary' as const,
                icon: 'refresh' as const,
              },
            ]
          : []),
      ],
    };

    this.addCard(card);
    return card;
  }

  /**
   * 创建并添加确认卡片
   */
  createConfirmationCard(params: CreateConfirmationCardParams): A2UIConfirmationCard {
    const card: A2UIConfirmationCard = {
      id: uuidv4(),
      type: 'confirmation',
      title: params.title,
      description: params.description,
      icon: this.getConfirmationIcon(params.warningLevel),
      confirmationType: params.confirmationType,
      warningLevel: params.warningLevel,
      details: params.details,
      requiresInput: params.requiresInput,
      timestamp: Date.now(),
      actions: [
        {
          id: 'confirm',
          label: params.confirmLabel || 'Confirm',
          type: params.warningLevel === 'danger' ? 'danger' : 'primary',
          icon: 'check',
        },
        {
          id: 'cancel',
          label: params.cancelLabel || 'Cancel',
          type: 'secondary',
          icon: 'x',
        },
      ],
    };

    this.addCard(card);
    return card;
  }

  /**
   * 创建并添加进度卡片
   */
  createProgressCard(
    title: string,
    totalSteps: number,
    options?: { pausable?: boolean; cancellable?: boolean }
  ): A2UIProgressCard {
    const actions: A2UIAction[] = [];

    if (options?.pausable) {
      actions.push({
        id: 'pause',
        label: 'Pause',
        type: 'secondary',
        icon: 'clock',
      });
    }

    if (options?.cancellable) {
      actions.push({
        id: 'cancel',
        label: 'Cancel',
        type: 'danger',
        icon: 'x',
      });
    }

    const card: A2UIProgressCard = {
      id: uuidv4(),
      type: 'progress',
      title,
      icon: 'lightning',
      currentStep: 0,
      totalSteps,
      stepDescription: 'Starting...',
      progress: 0,
      pausable: options?.pausable ?? false,
      cancellable: options?.cancellable ?? true,
      status: 'running',
      timestamp: Date.now(),
      actions,
    };

    this.addCard(card);
    return card;
  }

  /**
   * 更新进度卡片
   */
  updateProgress(
    cardId: string,
    currentStep: number,
    stepDescription: string,
    status?: A2UIProgressCard['status']
  ): void {
    const card = this.getCard(cardId);
    if (!card || card.type !== 'progress') return;

    const progressCard = card as A2UIProgressCard;
    const progress = Math.round((currentStep / progressCard.totalSteps) * 100);

    this.updateCard(cardId, {
      currentStep,
      stepDescription,
      progress,
      status: status || progressCard.status,
    });
  }

  /**
   * 创建并添加信息卡片
   */
  createInfoCard(
    title: string,
    description: string,
    infoType: A2UIInfoCard['infoType'] = 'notification',
    options?: { dismissible?: boolean; autoHideAfter?: number }
  ): A2UIInfoCard {
    const card: A2UIInfoCard = {
      id: uuidv4(),
      type: 'info',
      title,
      description,
      icon: this.getInfoIcon(infoType),
      infoType,
      dismissible: options?.dismissible ?? true,
      autoHideAfter: options?.autoHideAfter,
      timestamp: Date.now(),
      actions: options?.dismissible !== false
        ? [{ id: 'dismiss', label: 'OK', type: 'dismiss' }]
        : [],
    };

    // 设置自动隐藏
    if (options?.autoHideAfter) {
      const timer = setTimeout(() => {
        this.removeCard(card.id, 'timeout');
      }, options.autoHideAfter);
      this.expirationTimers.set(card.id, timer);
    }

    this.addCard(card);
    return card;
  }

  /**
   * 创建并添加错误卡片
   */
  createErrorCard(
    title: string,
    errorMessage: string,
    options?: { errorCode?: string; retryable?: boolean; helpUrl?: string }
  ): A2UIErrorCard {
    const actions: A2UIAction[] = [
      { id: 'dismiss', label: 'OK', type: 'primary' },
    ];

    if (options?.retryable) {
      actions.unshift({
        id: 'retry',
        label: 'Retry',
        type: 'secondary',
        icon: 'refresh',
      });
    }

    const card: A2UIErrorCard = {
      id: uuidv4(),
      type: 'error',
      title,
      description: errorMessage,
      icon: 'error',
      errorCode: options?.errorCode,
      errorDetails: errorMessage,
      retryable: options?.retryable ?? false,
      helpUrl: options?.helpUrl,
      timestamp: Date.now(),
      actions,
    };

    this.addCard(card);
    return card;
  }

  /**
   * 创建并添加选择卡片
   */
  createChoiceCard(
    title: string,
    options: A2UIChoiceCard['options'],
    multiSelect = false
  ): A2UIChoiceCard {
    const card: A2UIChoiceCard = {
      id: uuidv4(),
      type: 'choice',
      title,
      icon: 'question',
      multiSelect,
      options,
      timestamp: Date.now(),
      actions: [
        { id: 'confirm', label: 'Confirm', type: 'primary', icon: 'check' },
        { id: 'cancel', label: 'Cancel', type: 'dismiss', icon: 'x' },
      ],
    };

    this.addCard(card);
    return card;
  }

  // ============ 辅助方法 ============

  private getSuggestionIcon(type: A2UISuggestionCard['suggestionType']): A2UISuggestionCard['icon'] {
    switch (type) {
      case 'file_organize':
        return 'folder';
      case 'error_fix':
        return 'terminal';
      case 'automation':
        return 'lightning';
      case 'shortcut':
        return 'magic';
      default:
        return 'magic';
    }
  }

  private getResultIcon(status: A2UIResultCard['status']): A2UIResultCard['icon'] {
    switch (status) {
      case 'success':
        return 'success';
      case 'partial':
        return 'warning';
      case 'failed':
        return 'error';
      case 'cancelled':
        return 'info';
    }
  }

  private getResultDescription(
    status: A2UIResultCard['status'],
    summary: A2UIResultCard['summary']
  ): string {
    switch (status) {
      case 'success':
        return `Completed ${summary.completedSteps} steps in ${summary.duration}s`;
      case 'partial':
        return `Completed ${summary.completedSteps}/${summary.totalSteps} steps, ${summary.failedSteps} failed`;
      case 'failed':
        return `Failed after ${summary.completedSteps} steps`;
      case 'cancelled':
        return `Cancelled after ${summary.completedSteps} steps`;
    }
  }

  private getConfirmationIcon(level: A2UIConfirmationCard['warningLevel']): A2UIConfirmationCard['icon'] {
    switch (level) {
      case 'info':
        return 'info';
      case 'warning':
        return 'warning';
      case 'danger':
        return 'error';
    }
  }

  private getInfoIcon(type: A2UIInfoCard['infoType']): A2UIInfoCard['icon'] {
    switch (type) {
      case 'status':
        return 'info';
      case 'tip':
        return 'magic';
      case 'notification':
        return 'info';
      case 'learning':
        return 'eye';
    }
  }

  /**
   * 销毁渲染器
   */
  destroy(): void {
    this.clearCards();
    this.removeAllListeners();
  }
}

/**
 * 创建 A2UI 渲染器实例
 */
export function createA2UIRenderer(options?: A2UIRendererOptions): A2UIRenderer {
  return new A2UIRenderer(options);
}
