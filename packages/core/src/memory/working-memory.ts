/**
 * 工作记忆管理器
 * Working Memory Manager
 *
 * 管理当前会话的短期记忆，包括上下文、注意力焦点和临时状态
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkingMemory,
  WindowInfo,
  RecentAction,
  TaskSuggestion,
  WorkingMemoryConfig,
  DEFAULT_WORKING_CONFIG,
} from './types';

/**
 * 工作记忆事件
 */
export interface WorkingMemoryEvents {
  'session:started': (sessionId: string) => void;
  'session:ended': (sessionId: string) => void;
  'context:updated': (context: WorkingMemory['currentContext']) => void;
  'focus:changed': (focus: WorkingMemory['attentionFocus']) => void;
  'action:recorded': (action: RecentAction) => void;
  'suggestion:added': (suggestion: TaskSuggestion) => void;
  'suggestion:removed': (id: string) => void;
  'capacity:warning': (current: number, max: number) => void;
}

/**
 * 工作记忆管理器
 */
export class WorkingMemoryManager extends EventEmitter {
  private memory: WorkingMemory | null = null;
  private config: WorkingMemoryConfig;
  private expirationTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<WorkingMemoryConfig>) {
    super();
    this.config = { ...DEFAULT_WORKING_CONFIG, ...config };
  }

  /**
   * 开始新会话
   */
  startSession(): string {
    // 如果有现有会话，先结束它
    if (this.memory) {
      this.endSession();
    }

    const sessionId = uuidv4();
    const now = Date.now();

    this.memory = {
      sessionId,
      startTime: now,
      currentContext: {
        activeTask: undefined,
        focusedWindow: undefined,
        recentActions: [],
        pendingSuggestions: [],
      },
      attentionFocus: {
        primaryFocus: undefined,
        secondaryFoci: [],
        distractions: [],
      },
      temporaryState: {
        flags: {},
        counters: {},
        buffers: {},
      },
      capacity: {
        maxItems: this.config.maxItems,
        currentItems: 0,
        oldestItemAge: 0,
      },
    };

    this.startExpirationTimer();
    this.emit('session:started', sessionId);

    return sessionId;
  }

  /**
   * 结束会话
   */
  endSession(): void {
    if (!this.memory) return;

    const sessionId = this.memory.sessionId;
    this.stopExpirationTimer();
    this.memory = null;

    this.emit('session:ended', sessionId);
  }

  /**
   * 获取当前会话
   */
  getSession(): WorkingMemory | null {
    return this.memory;
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string | null {
    return this.memory?.sessionId ?? null;
  }

  /**
   * 检查会话是否活跃
   */
  isSessionActive(): boolean {
    if (!this.memory) return false;

    const elapsed = Date.now() - this.memory.startTime;
    const expirationMs = this.config.expirationMinutes * 60 * 1000;

    return elapsed < expirationMs;
  }

  // ============================================================================
  // 上下文管理 (Context Management)
  // ============================================================================

  /**
   * 设置活动任务
   */
  setActiveTask(task: string | undefined): void {
    if (!this.memory) return;

    this.memory.currentContext.activeTask = task;
    this.emit('context:updated', this.memory.currentContext);
  }

  /**
   * 设置聚焦窗口
   */
  setFocusedWindow(window: WindowInfo | undefined): void {
    if (!this.memory) return;

    this.memory.currentContext.focusedWindow = window;
    this.emit('context:updated', this.memory.currentContext);
  }

  /**
   * 获取当前上下文
   */
  getCurrentContext(): WorkingMemory['currentContext'] | null {
    return this.memory?.currentContext ?? null;
  }

  // ============================================================================
  // 动作管理 (Action Management)
  // ============================================================================

  /**
   * 记录动作
   */
  recordAction(action: Omit<RecentAction, 'id'>): RecentAction {
    if (!this.memory) {
      this.startSession();
    }

    const fullAction: RecentAction = {
      id: uuidv4(),
      ...action,
    };

    this.memory!.currentContext.recentActions.push(fullAction);

    // 限制动作数量
    while (this.memory!.currentContext.recentActions.length > this.config.maxRecentActions) {
      this.memory!.currentContext.recentActions.shift();
    }

    this.updateCapacity();
    this.emit('action:recorded', fullAction);

    return fullAction;
  }

  /**
   * 获取最近的动作
   */
  getRecentActions(limit?: number): RecentAction[] {
    if (!this.memory) return [];

    const actions = this.memory.currentContext.recentActions;
    return limit ? actions.slice(-limit) : actions;
  }

  /**
   * 获取特定类型的最近动作
   */
  getActionsByType(type: string, limit?: number): RecentAction[] {
    if (!this.memory) return [];

    let actions = this.memory.currentContext.recentActions.filter(a => a.type === type);
    return limit ? actions.slice(-limit) : actions;
  }

  /**
   * 清除动作历史
   */
  clearActions(): void {
    if (!this.memory) return;

    this.memory.currentContext.recentActions = [];
    this.updateCapacity();
  }

  // ============================================================================
  // 建议管理 (Suggestion Management)
  // ============================================================================

  /**
   * 添加建议
   */
  addSuggestion(suggestion: Omit<TaskSuggestion, 'id' | 'createdAt'>): TaskSuggestion {
    if (!this.memory) {
      this.startSession();
    }

    const fullSuggestion: TaskSuggestion = {
      id: uuidv4(),
      createdAt: Date.now(),
      ...suggestion,
    };

    this.memory!.currentContext.pendingSuggestions.push(fullSuggestion);

    // 限制建议数量
    while (this.memory!.currentContext.pendingSuggestions.length > this.config.maxSuggestions) {
      const removed = this.memory!.currentContext.pendingSuggestions.shift();
      if (removed) {
        this.emit('suggestion:removed', removed.id);
      }
    }

    this.updateCapacity();
    this.emit('suggestion:added', fullSuggestion);

    return fullSuggestion;
  }

  /**
   * 移除建议
   */
  removeSuggestion(id: string): boolean {
    if (!this.memory) return false;

    const index = this.memory.currentContext.pendingSuggestions.findIndex(s => s.id === id);
    if (index === -1) return false;

    this.memory.currentContext.pendingSuggestions.splice(index, 1);
    this.updateCapacity();
    this.emit('suggestion:removed', id);

    return true;
  }

  /**
   * 获取所有待处理建议
   */
  getPendingSuggestions(): TaskSuggestion[] {
    return this.memory?.currentContext.pendingSuggestions ?? [];
  }

  /**
   * 按优先级获取建议
   */
  getSuggestionsByPriority(priority: TaskSuggestion['priority']): TaskSuggestion[] {
    if (!this.memory) return [];

    return this.memory.currentContext.pendingSuggestions.filter(s => s.priority === priority);
  }

  /**
   * 清除所有建议
   */
  clearSuggestions(): void {
    if (!this.memory) return;

    this.memory.currentContext.pendingSuggestions = [];
    this.updateCapacity();
  }

  // ============================================================================
  // 注意力焦点管理 (Attention Focus Management)
  // ============================================================================

  /**
   * 设置主要焦点
   */
  setPrimaryFocus(focus: string | undefined): void {
    if (!this.memory) return;

    this.memory.attentionFocus.primaryFocus = focus;
    this.emit('focus:changed', this.memory.attentionFocus);
  }

  /**
   * 添加次要焦点
   */
  addSecondaryFocus(focus: string): void {
    if (!this.memory) return;

    if (!this.memory.attentionFocus.secondaryFoci.includes(focus)) {
      this.memory.attentionFocus.secondaryFoci.push(focus);
      this.emit('focus:changed', this.memory.attentionFocus);
    }
  }

  /**
   * 移除次要焦点
   */
  removeSecondaryFocus(focus: string): void {
    if (!this.memory) return;

    const index = this.memory.attentionFocus.secondaryFoci.indexOf(focus);
    if (index !== -1) {
      this.memory.attentionFocus.secondaryFoci.splice(index, 1);
      this.emit('focus:changed', this.memory.attentionFocus);
    }
  }

  /**
   * 记录干扰
   */
  addDistraction(distraction: string): void {
    if (!this.memory) return;

    if (!this.memory.attentionFocus.distractions.includes(distraction)) {
      this.memory.attentionFocus.distractions.push(distraction);

      // 限制干扰记录数量
      if (this.memory.attentionFocus.distractions.length > 10) {
        this.memory.attentionFocus.distractions.shift();
      }
    }
  }

  /**
   * 获取注意力焦点
   */
  getAttentionFocus(): WorkingMemory['attentionFocus'] | null {
    return this.memory?.attentionFocus ?? null;
  }

  // ============================================================================
  // 临时状态管理 (Temporary State Management)
  // ============================================================================

  /**
   * 设置标志
   */
  setFlag(key: string, value: boolean): void {
    if (!this.memory) return;

    this.memory.temporaryState.flags[key] = value;
  }

  /**
   * 获取标志
   */
  getFlag(key: string): boolean {
    return this.memory?.temporaryState.flags[key] ?? false;
  }

  /**
   * 设置计数器
   */
  setCounter(key: string, value: number): void {
    if (!this.memory) return;

    this.memory.temporaryState.counters[key] = value;
  }

  /**
   * 增加计数器
   */
  incrementCounter(key: string, amount: number = 1): number {
    if (!this.memory) return 0;

    const current = this.memory.temporaryState.counters[key] ?? 0;
    const newValue = current + amount;
    this.memory.temporaryState.counters[key] = newValue;
    return newValue;
  }

  /**
   * 获取计数器
   */
  getCounter(key: string): number {
    return this.memory?.temporaryState.counters[key] ?? 0;
  }

  /**
   * 设置缓冲区
   */
  setBuffer(key: string, value: unknown): void {
    if (!this.memory) return;

    this.memory.temporaryState.buffers[key] = value;
    this.updateCapacity();
  }

  /**
   * 获取缓冲区
   */
  getBuffer<T = unknown>(key: string): T | undefined {
    return this.memory?.temporaryState.buffers[key] as T | undefined;
  }

  /**
   * 删除缓冲区
   */
  deleteBuffer(key: string): boolean {
    if (!this.memory) return false;

    if (key in this.memory.temporaryState.buffers) {
      delete this.memory.temporaryState.buffers[key];
      this.updateCapacity();
      return true;
    }
    return false;
  }

  /**
   * 清除所有临时状态
   */
  clearTemporaryState(): void {
    if (!this.memory) return;

    this.memory.temporaryState = {
      flags: {},
      counters: {},
      buffers: {},
    };
    this.updateCapacity();
  }

  // ============================================================================
  // 容量管理 (Capacity Management)
  // ============================================================================

  /**
   * 更新容量信息
   */
  private updateCapacity(): void {
    if (!this.memory) return;

    const actionsCount = this.memory.currentContext.recentActions.length;
    const suggestionsCount = this.memory.currentContext.pendingSuggestions.length;
    const buffersCount = Object.keys(this.memory.temporaryState.buffers).length;

    this.memory.capacity.currentItems = actionsCount + suggestionsCount + buffersCount;

    // 计算最旧项目年龄
    if (this.memory.currentContext.recentActions.length > 0) {
      const oldestAction = this.memory.currentContext.recentActions[0];
      this.memory.capacity.oldestItemAge = Math.floor(
        (Date.now() - oldestAction.timestamp) / 1000
      );
    }

    // 检查容量警告
    if (this.memory.capacity.currentItems >= this.memory.capacity.maxItems * 0.9) {
      this.emit(
        'capacity:warning',
        this.memory.capacity.currentItems,
        this.memory.capacity.maxItems
      );
    }
  }

  /**
   * 获取容量信息
   */
  getCapacity(): WorkingMemory['capacity'] | null {
    return this.memory?.capacity ?? null;
  }

  // ============================================================================
  // 过期管理 (Expiration Management)
  // ============================================================================

  /**
   * 启动过期定时器
   */
  private startExpirationTimer(): void {
    this.stopExpirationTimer();

    const expirationMs = this.config.expirationMinutes * 60 * 1000;

    this.expirationTimer = setTimeout(() => {
      this.endSession();
    }, expirationMs);
  }

  /**
   * 停止过期定时器
   */
  private stopExpirationTimer(): void {
    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }
  }

  /**
   * 延长会话
   */
  extendSession(): void {
    if (!this.memory) return;

    this.startExpirationTimer();
  }

  // ============================================================================
  // 导出/导入 (Export/Import)
  // ============================================================================

  /**
   * 导出工作记忆
   */
  export(): WorkingMemory | null {
    return this.memory ? { ...this.memory } : null;
  }

  /**
   * 导入工作记忆
   */
  import(memory: WorkingMemory): void {
    this.memory = { ...memory };
    this.startExpirationTimer();
    this.emit('session:started', memory.sessionId);
  }

  /**
   * 获取统计信息
   */
  getStatistics(): {
    sessionActive: boolean;
    sessionDuration: number;
    actionsCount: number;
    suggestionsCount: number;
    flagsCount: number;
    countersCount: number;
    buffersCount: number;
    capacityUsage: number;
  } | null {
    if (!this.memory) return null;

    const sessionDuration = Date.now() - this.memory.startTime;

    return {
      sessionActive: this.isSessionActive(),
      sessionDuration,
      actionsCount: this.memory.currentContext.recentActions.length,
      suggestionsCount: this.memory.currentContext.pendingSuggestions.length,
      flagsCount: Object.keys(this.memory.temporaryState.flags).length,
      countersCount: Object.keys(this.memory.temporaryState.counters).length,
      buffersCount: Object.keys(this.memory.temporaryState.buffers).length,
      capacityUsage: this.memory.capacity.currentItems / this.memory.capacity.maxItems,
    };
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.endSession();
  }
}

/**
 * 创建工作记忆管理器
 */
export function createWorkingMemory(
  config?: Partial<WorkingMemoryConfig>
): WorkingMemoryManager {
  return new WorkingMemoryManager(config);
}
