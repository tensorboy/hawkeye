/**
 * Trajectory Learning - 轨迹学习系统
 *
 * 参考 OS-Copilot 的设计:
 * - 记录成功的任务执行轨迹
 * - 从轨迹中学习动作模式
 * - 支持轨迹回放和泛化
 *
 * 核心功能:
 * - 轨迹录制与存储
 * - 轨迹相似度匹配
 * - 动作序列学习
 * - 轨迹泛化与适配
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// ============ 类型定义 ============

/**
 * 动作类型
 */
export type TrajectoryActionType =
  | 'click'
  | 'double_click'
  | 'right_click'
  | 'type'
  | 'scroll'
  | 'drag'
  | 'hotkey'
  | 'wait'
  | 'focus'
  | 'navigate';

/**
 * 轨迹中的单个动作
 */
export interface TrajectoryAction {
  /** 动作 ID */
  id: string;
  /** 动作类型 */
  type: TrajectoryActionType;
  /** 目标元素描述 */
  target?: string;
  /** 目标元素类型 */
  targetType?: string;
  /** 相对坐标 (0-1 范围) */
  relativeCoord?: { x: number; y: number };
  /** 绝对坐标 */
  absoluteCoord?: { x: number; y: number };
  /** 输入文本 (type 动作) */
  text?: string;
  /** 快捷键 (hotkey 动作) */
  hotkey?: string;
  /** 滚动参数 */
  scroll?: { direction: 'up' | 'down' | 'left' | 'right'; amount: number };
  /** 拖拽终点 */
  dragEnd?: { x: number; y: number };
  /** URL (navigate 动作) */
  url?: string;
  /** 执行时间 (ms) */
  duration: number;
  /** 执行结果 */
  success: boolean;
  /** 截图前 (base64, 可选) */
  beforeScreenshot?: string;
  /** 截图后 (base64, 可选) */
  afterScreenshot?: string;
  /** 时间戳 */
  timestamp: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 完整的执行轨迹
 */
export interface Trajectory {
  /** 轨迹 ID */
  id: string;
  /** 任务描述 */
  task: string;
  /** 应用上下文 */
  appContext: string;
  /** 窗口标题 */
  windowTitle?: string;
  /** 动作序列 */
  actions: TrajectoryAction[];
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 总时长 (ms) */
  totalDuration: number;
  /** 是否成功 */
  success: boolean;
  /** 失败原因 */
  failureReason?: string;
  /** 使用次数 */
  usageCount: number;
  /** 成功率 */
  successRate: number;
  /** 泛化参数 */
  generalizationParams?: string[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 轨迹模式 (从多个轨迹中学习)
 */
export interface TrajectoryPattern {
  /** 模式 ID */
  id: string;
  /** 任务模式 (正则表达式) */
  taskPattern: string;
  /** 应用上下文 */
  appContext: string;
  /** 动作模式序列 */
  actionPatterns: ActionPattern[];
  /** 源轨迹 ID 列表 */
  sourceTrajectories: string[];
  /** 置信度 */
  confidence: number;
  /** 创建时间 */
  createdAt: number;
  /** 最后使用时间 */
  lastUsedAt: number;
}

/**
 * 动作模式
 */
export interface ActionPattern {
  /** 动作类型 */
  type: TrajectoryActionType;
  /** 目标元素模式 */
  targetPattern?: string;
  /** 是否需要文本输入 */
  requiresText?: boolean;
  /** 文本占位符 */
  textPlaceholder?: string;
  /** 是否可选 */
  optional?: boolean;
  /** 顺序索引 */
  order: number;
}

/**
 * 轨迹匹配结果
 */
export interface TrajectoryMatch {
  /** 匹配的轨迹 */
  trajectory: Trajectory;
  /** 匹配分数 (0-1) */
  score: number;
  /** 需要适配的参数 */
  adaptations: TrajectoryAdaptation[];
}

/**
 * 轨迹适配
 */
export interface TrajectoryAdaptation {
  /** 动作索引 */
  actionIndex: number;
  /** 适配类型 */
  type: 'coordinate' | 'text' | 'target' | 'url';
  /** 原值 */
  originalValue: unknown;
  /** 建议值 */
  suggestedValue?: unknown;
}

/**
 * 轨迹学习配置
 */
export interface TrajectoryLearningConfig {
  /** 最大存储轨迹数 */
  maxTrajectories: number;
  /** 最小轨迹相似度阈值 */
  minSimilarity: number;
  /** 是否存储截图 */
  storeScreenshots: boolean;
  /** 是否启用模式学习 */
  enablePatternLearning: boolean;
  /** 模式学习最小样本数 */
  patternMinSamples: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: TrajectoryLearningConfig = {
  maxTrajectories: 1000,
  minSimilarity: 0.6,
  storeScreenshots: false,
  enablePatternLearning: true,
  patternMinSamples: 3,
};

// ============ Trajectory Learning System ============

/**
 * TrajectoryLearning - 轨迹学习系统
 *
 * 提供任务执行轨迹的录制、存储、学习和回放能力
 */
export class TrajectoryLearning extends EventEmitter {
  private config: TrajectoryLearningConfig;
  private trajectories: Map<string, Trajectory> = new Map();
  private patterns: Map<string, TrajectoryPattern> = new Map();
  private appIndex: Map<string, Set<string>> = new Map(); // appContext -> trajectory IDs
  private taskIndex: Map<string, Set<string>> = new Map(); // task keywords -> trajectory IDs

  // 录制状态
  private isRecording: boolean = false;
  private currentRecording: {
    task: string;
    appContext: string;
    windowTitle?: string;
    actions: TrajectoryAction[];
    startTime: number;
  } | null = null;

  constructor(config: Partial<TrajectoryLearningConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============ 录制 API ============

  /**
   * 开始录制轨迹
   */
  startRecording(task: string, appContext: string, windowTitle?: string): void {
    if (this.isRecording) {
      console.warn('[TrajectoryLearning] Already recording, stopping previous recording');
      this.stopRecording(false);
    }

    this.isRecording = true;
    this.currentRecording = {
      task,
      appContext,
      windowTitle,
      actions: [],
      startTime: Date.now(),
    };

    this.emit('recording:started', { task, appContext });
  }

  /**
   * 记录动作
   */
  recordAction(action: Omit<TrajectoryAction, 'id' | 'timestamp'>): void {
    if (!this.isRecording || !this.currentRecording) {
      console.warn('[TrajectoryLearning] Not recording');
      return;
    }

    const fullAction: TrajectoryAction = {
      ...action,
      id: this.generateActionId(),
      timestamp: Date.now(),
    };

    // 如果不存储截图，清除截图数据
    if (!this.config.storeScreenshots) {
      delete fullAction.beforeScreenshot;
      delete fullAction.afterScreenshot;
    }

    this.currentRecording.actions.push(fullAction);
    this.emit('action:recorded', fullAction);
  }

  /**
   * 停止录制
   */
  stopRecording(success: boolean, failureReason?: string): Trajectory | null {
    if (!this.isRecording || !this.currentRecording) {
      return null;
    }

    const endTime = Date.now();
    const trajectory: Trajectory = {
      id: this.generateTrajectoryId(),
      task: this.currentRecording.task,
      appContext: this.currentRecording.appContext,
      windowTitle: this.currentRecording.windowTitle,
      actions: this.currentRecording.actions,
      startTime: this.currentRecording.startTime,
      endTime,
      totalDuration: endTime - this.currentRecording.startTime,
      success,
      failureReason,
      usageCount: 0,
      successRate: success ? 1 : 0,
    };

    this.isRecording = false;
    this.currentRecording = null;

    // 只存储成功的轨迹
    if (success) {
      this.addTrajectory(trajectory);
    }

    this.emit('recording:stopped', { trajectory, success });
    return trajectory;
  }

  /**
   * 取消录制
   */
  cancelRecording(): void {
    this.isRecording = false;
    this.currentRecording = null;
    this.emit('recording:cancelled');
  }

  // ============ 存储 API ============

  /**
   * 添加轨迹
   */
  addTrajectory(trajectory: Trajectory): void {
    // 检查容量
    if (this.trajectories.size >= this.config.maxTrajectories) {
      this.evictOldTrajectories();
    }

    this.trajectories.set(trajectory.id, trajectory);

    // 更新索引
    this.addToIndex(this.appIndex, trajectory.appContext, trajectory.id);
    for (const keyword of this.extractKeywords(trajectory.task)) {
      this.addToIndex(this.taskIndex, keyword, trajectory.id);
    }

    // 触发模式学习
    if (this.config.enablePatternLearning) {
      this.learnPatterns(trajectory);
    }

    this.emit('trajectory:added', trajectory);
  }

  /**
   * 获取轨迹
   */
  getTrajectory(id: string): Trajectory | null {
    return this.trajectories.get(id) || null;
  }

  /**
   * 删除轨迹
   */
  deleteTrajectory(id: string): boolean {
    const trajectory = this.trajectories.get(id);
    if (!trajectory) return false;

    this.trajectories.delete(id);

    // 更新索引
    this.removeFromIndex(this.appIndex, trajectory.appContext, id);
    for (const keyword of this.extractKeywords(trajectory.task)) {
      this.removeFromIndex(this.taskIndex, keyword, id);
    }

    this.emit('trajectory:deleted', { id });
    return true;
  }

  // ============ 检索 API ============

  /**
   * 查找匹配的轨迹
   */
  findMatchingTrajectories(
    task: string,
    appContext: string,
    options: {
      topK?: number;
      minSimilarity?: number;
    } = {}
  ): TrajectoryMatch[] {
    const { topK = 5, minSimilarity = this.config.minSimilarity } = options;

    // 获取候选轨迹
    const candidates = this.getCandidates(task, appContext);
    const matches: TrajectoryMatch[] = [];

    for (const trajectory of candidates) {
      const score = this.calculateSimilarity(task, appContext, trajectory);
      if (score >= minSimilarity) {
        const adaptations = this.identifyAdaptations(task, trajectory);
        matches.push({ trajectory, score, adaptations });
      }
    }

    // 排序并返回 topK
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, topK);
  }

  /**
   * 获取最佳匹配轨迹
   */
  getBestMatch(task: string, appContext: string): TrajectoryMatch | null {
    const matches = this.findMatchingTrajectories(task, appContext, { topK: 1 });
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * 查找应用的所有轨迹
   */
  getTrajectoryByApp(appContext: string): Trajectory[] {
    const ids = this.appIndex.get(appContext);
    if (!ids) return [];

    return Array.from(ids)
      .map((id) => this.trajectories.get(id))
      .filter((t): t is Trajectory => t !== undefined);
  }

  // ============ 学习 API ============

  /**
   * 更新轨迹使用统计
   */
  recordUsage(trajectoryId: string, success: boolean): void {
    const trajectory = this.trajectories.get(trajectoryId);
    if (!trajectory) return;

    trajectory.usageCount++;
    const totalAttempts = trajectory.usageCount;
    const previousSuccesses = trajectory.successRate * (totalAttempts - 1);
    trajectory.successRate = (previousSuccesses + (success ? 1 : 0)) / totalAttempts;

    this.emit('trajectory:used', { id: trajectoryId, success });
  }

  /**
   * 获取学习到的模式
   */
  getPatterns(appContext?: string): TrajectoryPattern[] {
    if (appContext) {
      return Array.from(this.patterns.values()).filter(
        (p) => p.appContext === appContext
      );
    }
    return Array.from(this.patterns.values());
  }

  /**
   * 根据模式生成建议动作
   */
  suggestActions(
    task: string,
    appContext: string
  ): { actions: ActionPattern[]; confidence: number } | null {
    const patterns = this.getPatterns(appContext);

    for (const pattern of patterns) {
      if (new RegExp(pattern.taskPattern, 'i').test(task)) {
        return {
          actions: pattern.actionPatterns,
          confidence: pattern.confidence,
        };
      }
    }

    return null;
  }

  // ============ 导入导出 ============

  /**
   * 导出所有数据
   */
  export(): {
    trajectories: Trajectory[];
    patterns: TrajectoryPattern[];
  } {
    return {
      trajectories: Array.from(this.trajectories.values()),
      patterns: Array.from(this.patterns.values()),
    };
  }

  /**
   * 导入数据
   */
  import(data: { trajectories: Trajectory[]; patterns?: TrajectoryPattern[] }): void {
    for (const trajectory of data.trajectories) {
      this.addTrajectory(trajectory);
    }

    if (data.patterns) {
      for (const pattern of data.patterns) {
        this.patterns.set(pattern.id, pattern);
      }
    }

    this.emit('data:imported', {
      trajectoryCount: data.trajectories.length,
      patternCount: data.patterns?.length || 0,
    });
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalTrajectories: number;
    totalPatterns: number;
    byApp: Record<string, number>;
    averageSuccessRate: number;
    averageActionCount: number;
  } {
    const byApp: Record<string, number> = {};
    let totalSuccessRate = 0;
    let totalActions = 0;

    for (const [, trajectory] of this.trajectories) {
      byApp[trajectory.appContext] = (byApp[trajectory.appContext] || 0) + 1;
      totalSuccessRate += trajectory.successRate;
      totalActions += trajectory.actions.length;
    }

    const count = this.trajectories.size;
    return {
      totalTrajectories: count,
      totalPatterns: this.patterns.size,
      byApp,
      averageSuccessRate: count > 0 ? totalSuccessRate / count : 0,
      averageActionCount: count > 0 ? totalActions / count : 0,
    };
  }

  /**
   * 清空所有数据
   */
  clear(): void {
    this.trajectories.clear();
    this.patterns.clear();
    this.appIndex.clear();
    this.taskIndex.clear();
    this.emit('data:cleared');
  }

  // ============ 私有方法 ============

  private generateTrajectoryId(): string {
    return `traj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateActionId(): string {
    return `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  private generatePatternId(): string {
    return `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private addToIndex(index: Map<string, Set<string>>, key: string, id: string): void {
    if (!index.has(key)) {
      index.set(key, new Set());
    }
    index.get(key)!.add(id);
  }

  private removeFromIndex(index: Map<string, Set<string>>, key: string, id: string): void {
    const set = index.get(key);
    if (set) {
      set.delete(id);
      if (set.size === 0) {
        index.delete(key);
      }
    }
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
  }

  private getCandidates(task: string, appContext: string): Trajectory[] {
    const candidates = new Set<Trajectory>();

    // 从应用索引获取
    const appIds = this.appIndex.get(appContext);
    if (appIds) {
      for (const id of appIds) {
        const t = this.trajectories.get(id);
        if (t) candidates.add(t);
      }
    }

    // 从任务关键词索引获取
    for (const keyword of this.extractKeywords(task)) {
      const keywordIds = this.taskIndex.get(keyword);
      if (keywordIds) {
        for (const id of keywordIds) {
          const t = this.trajectories.get(id);
          if (t) candidates.add(t);
        }
      }
    }

    return Array.from(candidates);
  }

  private calculateSimilarity(
    task: string,
    appContext: string,
    trajectory: Trajectory
  ): number {
    let score = 0;

    // 应用上下文匹配
    if (trajectory.appContext === appContext) {
      score += 0.3;
    }

    // 任务文本相似度 (Jaccard)
    const taskKeywords = new Set(this.extractKeywords(task));
    const trajKeywords = new Set(this.extractKeywords(trajectory.task));
    const intersection = new Set([...taskKeywords].filter((x) => trajKeywords.has(x)));
    const union = new Set([...taskKeywords, ...trajKeywords]);
    const jaccard = union.size > 0 ? intersection.size / union.size : 0;
    score += jaccard * 0.5;

    // 成功率权重
    score += trajectory.successRate * 0.2;

    return Math.min(score, 1.0);
  }

  private identifyAdaptations(task: string, trajectory: Trajectory): TrajectoryAdaptation[] {
    const adaptations: TrajectoryAdaptation[] = [];

    for (let i = 0; i < trajectory.actions.length; i++) {
      const action = trajectory.actions[i];

      // 文本输入需要适配
      if (action.type === 'type' && action.text) {
        adaptations.push({
          actionIndex: i,
          type: 'text',
          originalValue: action.text,
          suggestedValue: undefined, // 需要用户提供
        });
      }

      // URL 导航需要适配
      if (action.type === 'navigate' && action.url) {
        adaptations.push({
          actionIndex: i,
          type: 'url',
          originalValue: action.url,
          suggestedValue: undefined,
        });
      }
    }

    return adaptations;
  }

  private learnPatterns(trajectory: Trajectory): void {
    // 查找相似的轨迹
    const similar = this.findMatchingTrajectories(trajectory.task, trajectory.appContext, {
      topK: this.config.patternMinSamples,
      minSimilarity: 0.7,
    });

    if (similar.length < this.config.patternMinSamples) {
      return;
    }

    // 提取共同的动作模式
    const actionPatterns = this.extractActionPatterns(similar.map((m) => m.trajectory));
    if (actionPatterns.length === 0) {
      return;
    }

    // 创建或更新模式
    const patternKey = `${trajectory.appContext}:${this.normalizeTask(trajectory.task)}`;
    const existingPattern = this.findPatternByKey(patternKey);

    if (existingPattern) {
      existingPattern.sourceTrajectories.push(trajectory.id);
      existingPattern.confidence = Math.min(
        existingPattern.confidence + 0.1,
        1.0
      );
      existingPattern.lastUsedAt = Date.now();
    } else {
      const pattern: TrajectoryPattern = {
        id: this.generatePatternId(),
        taskPattern: this.createTaskPattern(trajectory.task),
        appContext: trajectory.appContext,
        actionPatterns,
        sourceTrajectories: similar.map((m) => m.trajectory.id),
        confidence: 0.5 + similar.length * 0.1,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };
      this.patterns.set(pattern.id, pattern);
      this.emit('pattern:learned', pattern);
    }
  }

  private extractActionPatterns(trajectories: Trajectory[]): ActionPattern[] {
    if (trajectories.length === 0) return [];

    // 使用第一个轨迹作为参考
    const reference = trajectories[0];
    const patterns: ActionPattern[] = [];

    for (let i = 0; i < reference.actions.length; i++) {
      const action = reference.actions[i];

      // 检查其他轨迹是否有相同位置的相同类型动作
      const matchCount = trajectories.filter(
        (t) => t.actions[i]?.type === action.type
      ).length;

      const confidence = matchCount / trajectories.length;
      if (confidence >= 0.7) {
        patterns.push({
          type: action.type,
          targetPattern: action.target,
          requiresText: action.type === 'type',
          textPlaceholder: action.type === 'type' ? '{{input}}' : undefined,
          optional: confidence < 1.0,
          order: i,
        });
      }
    }

    return patterns;
  }

  private normalizeTask(task: string): string {
    return task
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 50);
  }

  private createTaskPattern(task: string): string {
    // 创建宽松的正则表达式模式
    const keywords = this.extractKeywords(task);
    if (keywords.length === 0) return task;
    return keywords.map((k) => `(?=.*${k})`).join('') + '.*';
  }

  private findPatternByKey(key: string): TrajectoryPattern | null {
    for (const [, pattern] of this.patterns) {
      const patternKey = `${pattern.appContext}:${this.normalizeTask(pattern.taskPattern)}`;
      if (patternKey === key) {
        return pattern;
      }
    }
    return null;
  }

  private evictOldTrajectories(): void {
    // 按使用次数和成功率排序，删除最不重要的
    const sorted = Array.from(this.trajectories.values()).sort(
      (a, b) => a.usageCount * a.successRate - b.usageCount * b.successRate
    );

    // 删除 10%
    const toDelete = Math.ceil(sorted.length * 0.1);
    for (let i = 0; i < toDelete; i++) {
      this.deleteTrajectory(sorted[i].id);
    }
  }
}

// ============ 单例支持 ============

let globalTrajectoryLearning: TrajectoryLearning | null = null;

export function getTrajectoryLearning(): TrajectoryLearning {
  if (!globalTrajectoryLearning) {
    globalTrajectoryLearning = new TrajectoryLearning();
  }
  return globalTrajectoryLearning;
}

export function createTrajectoryLearning(
  config?: Partial<TrajectoryLearningConfig>
): TrajectoryLearning {
  return new TrajectoryLearning(config);
}

export function setTrajectoryLearning(learning: TrajectoryLearning): void {
  globalTrajectoryLearning = learning;
}
