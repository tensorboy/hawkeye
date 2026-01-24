/**
 * Semantic Trace Manager - 语义轨迹管理器
 *
 * 参考 ShowUI-Aloha 的设计，实现语义级别的任务轨迹管理：
 * - 四元组格式：observation, think, action, expectation
 * - 支持 GUI 动作的语义描述
 * - In-context 学习格式化输出
 * - 支持轨迹录制和回放
 */

import { EventEmitter } from 'events';

// ============ 类型定义 ============

/**
 * 语义动作类型（ShowUI-Aloha 风格）
 */
export type SemanticActionType =
  | 'click'          // 点击
  | 'double_click'   // 双击
  | 'right_click'    // 右键点击
  | 'drag'           // 拖拽
  | 'type'           // 输入文本
  | 'scroll'         // 滚动
  | 'hotkey'         // 快捷键
  | 'wait'           // 等待
  | 'focus'          // 聚焦窗口
  | 'navigate';      // 导航

/**
 * 语义轨迹步骤（四元组格式）
 */
export interface SemanticTraceStep {
  /** 步骤索引 */
  stepIndex: number;

  /** 观察：描述当前屏幕状态 */
  observation: string;

  /** 思考：解释用户的意图 */
  think: string;

  /** 动作：具体操作描述 */
  action: string;

  /** 期望：预期结果 */
  expectation: string;

  /** 原始动作类型 */
  actionType: SemanticActionType;

  /** 动作参数（内部使用，不暴露给 LLM） */
  actionParams?: {
    /** 坐标（相对比例 0-1） */
    position?: { x: number; y: number };
    /** 输入文本 */
    text?: string;
    /** 快捷键 */
    hotkey?: string;
    /** 滚动方向和距离 */
    scroll?: { direction: 'up' | 'down' | 'left' | 'right'; amount: number };
    /** 拖拽终点 */
    dragTo?: { x: number; y: number };
    /** 等待时间（毫秒） */
    waitMs?: number;
  };

  /** 截图（crop, 可选） */
  screenshotCrop?: string;

  /** 全屏截图（可选） */
  screenshotFull?: string;

  /** 时间戳 */
  timestamp: number;

  /** 执行是否成功 */
  success?: boolean;
}

/**
 * 完整的语义轨迹
 */
export interface SemanticTrace {
  /** 轨迹 ID */
  id: string;

  /** 轨迹名称（用于检索） */
  name: string;

  /** 任务描述 */
  task: string;

  /** 应用上下文 */
  appContext: string;

  /** 轨迹步骤 */
  trajectory: SemanticTraceStep[];

  /** 创建时间 */
  createdAt: number;

  /** 更新时间 */
  updatedAt: number;

  /** 使用次数 */
  usageCount: number;

  /** 成功率 */
  successRate: number;

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * In-Context 格式化步骤（用于 LLM 提示）
 */
export interface InContextStep {
  step_idx: number;
  Observation: string;
  Think: string;
  Action: string;
  Expectation: string;
}

/**
 * In-Context 格式化轨迹
 */
export interface InContextTrajectory {
  task: string;
  appContext: string;
  steps: InContextStep[];
}

/**
 * 语义轨迹管理器配置
 */
export interface SemanticTraceManagerConfig {
  /** 最大存储轨迹数 */
  maxTraces: number;
  /** 是否存储截图 */
  storeScreenshots: boolean;
  /** 最大截图大小（KB） */
  maxScreenshotSize: number;
  /** 是否启用自动摘要 */
  enableAutoSummary: boolean;
}

const DEFAULT_CONFIG: SemanticTraceManagerConfig = {
  maxTraces: 500,
  storeScreenshots: false,
  maxScreenshotSize: 200,
  enableAutoSummary: true,
};

// ============ Semantic Trace Manager ============

export class SemanticTraceManager extends EventEmitter {
  private config: SemanticTraceManagerConfig;
  private traces: Map<string, SemanticTrace> = new Map();
  private nameIndex: Map<string, string> = new Map(); // name -> id
  private appIndex: Map<string, Set<string>> = new Map(); // appContext -> trace IDs

  // 录制状态
  private isRecording: boolean = false;
  private currentRecording: {
    name: string;
    task: string;
    appContext: string;
    steps: SemanticTraceStep[];
    startTime: number;
  } | null = null;

  constructor(config: Partial<SemanticTraceManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============ 录制 API ============

  /**
   * 开始录制语义轨迹
   */
  startRecording(name: string, task: string, appContext: string): void {
    if (this.isRecording) {
      console.warn('[SemanticTraceManager] 已在录制中，停止之前的录制');
      this.stopRecording(false);
    }

    this.isRecording = true;
    this.currentRecording = {
      name,
      task,
      appContext,
      steps: [],
      startTime: Date.now(),
    };

    this.emit('recording:started', { name, task, appContext });
  }

  /**
   * 记录一个步骤
   */
  recordStep(step: Omit<SemanticTraceStep, 'stepIndex' | 'timestamp'>): void {
    if (!this.isRecording || !this.currentRecording) {
      console.warn('[SemanticTraceManager] 未在录制中');
      return;
    }

    const fullStep: SemanticTraceStep = {
      ...step,
      stepIndex: this.currentRecording.steps.length + 1,
      timestamp: Date.now(),
    };

    // 处理截图（如果不存储则清除）
    if (!this.config.storeScreenshots) {
      delete fullStep.screenshotCrop;
      delete fullStep.screenshotFull;
    }

    this.currentRecording.steps.push(fullStep);
    this.emit('step:recorded', fullStep);
  }

  /**
   * 停止录制
   */
  stopRecording(success: boolean = true): SemanticTrace | null {
    if (!this.isRecording || !this.currentRecording) {
      return null;
    }

    const trace: SemanticTrace = {
      id: this.generateTraceId(),
      name: this.currentRecording.name,
      task: this.currentRecording.task,
      appContext: this.currentRecording.appContext,
      trajectory: this.currentRecording.steps,
      createdAt: this.currentRecording.startTime,
      updatedAt: Date.now(),
      usageCount: 0,
      successRate: success ? 1 : 0,
    };

    this.isRecording = false;
    this.currentRecording = null;

    // 只存储成功的轨迹
    if (success && trace.trajectory.length > 0) {
      this.addTrace(trace);
    }

    this.emit('recording:stopped', { trace, success });
    return trace;
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
  addTrace(trace: SemanticTrace): void {
    // 检查容量
    if (this.traces.size >= this.config.maxTraces) {
      this.evictOldTraces();
    }

    this.traces.set(trace.id, trace);
    this.nameIndex.set(trace.name.toLowerCase(), trace.id);

    // 更新索引
    if (!this.appIndex.has(trace.appContext)) {
      this.appIndex.set(trace.appContext, new Set());
    }
    this.appIndex.get(trace.appContext)!.add(trace.id);

    this.emit('trace:added', trace);
  }

  /**
   * 通过 ID 获取轨迹
   */
  getTrace(id: string): SemanticTrace | null {
    return this.traces.get(id) || null;
  }

  /**
   * 通过名称获取轨迹
   */
  getTraceByName(name: string): SemanticTrace | null {
    const id = this.nameIndex.get(name.toLowerCase());
    return id ? this.traces.get(id) || null : null;
  }

  /**
   * 获取应用的所有轨迹
   */
  getTracesByApp(appContext: string): SemanticTrace[] {
    const ids = this.appIndex.get(appContext);
    if (!ids) return [];

    return Array.from(ids)
      .map((id) => this.traces.get(id))
      .filter((t): t is SemanticTrace => t !== undefined);
  }

  /**
   * 获取所有轨迹名称列表
   */
  listTraceNames(): string[] {
    return Array.from(this.traces.values()).map((t) => t.name);
  }

  /**
   * 删除轨迹
   */
  deleteTrace(id: string): boolean {
    const trace = this.traces.get(id);
    if (!trace) return false;

    this.traces.delete(id);
    this.nameIndex.delete(trace.name.toLowerCase());

    const appSet = this.appIndex.get(trace.appContext);
    if (appSet) {
      appSet.delete(id);
      if (appSet.size === 0) {
        this.appIndex.delete(trace.appContext);
      }
    }

    this.emit('trace:deleted', { id });
    return true;
  }

  // ============ In-Context 格式化 API ============

  /**
   * 获取轨迹的 In-Context 格式（用于 LLM 提示）
   *
   * 这是 ShowUI-Aloha 的核心：将轨迹格式化为 LLM 可理解的上下文
   */
  getTrajectoryInContext(
    traceName: string,
    options: {
      formattingString?: boolean;
      includeTask?: boolean;
      maxSteps?: number;
    } = {}
  ): InContextTrajectory | string | null {
    const trace = this.getTraceByName(traceName);
    if (!trace) return null;

    const { formattingString = false, includeTask = true, maxSteps } = options;

    // 格式化步骤
    let steps = trace.trajectory.map((step) => ({
      step_idx: step.stepIndex,
      Observation: step.observation,
      Think: step.think,
      Action: step.action,
      Expectation: step.expectation,
    }));

    // 限制步骤数
    if (maxSteps && steps.length > maxSteps) {
      steps = steps.slice(0, maxSteps);
    }

    const result: InContextTrajectory = {
      task: trace.task,
      appContext: trace.appContext,
      steps,
    };

    if (formattingString) {
      return this.formatTrajectoryAsString(result, includeTask);
    }

    return result;
  }

  /**
   * 将轨迹格式化为字符串（用于直接插入 prompt）
   */
  private formatTrajectoryAsString(
    trajectory: InContextTrajectory,
    includeTask: boolean
  ): string {
    const lines: string[] = [];

    if (includeTask) {
      lines.push(`Task: ${trajectory.task}`);
      lines.push(`Application: ${trajectory.appContext}`);
      lines.push('');
    }

    lines.push('Guidance Trajectory:');

    for (const step of trajectory.steps) {
      lines.push(`\nStep ${step.step_idx}:`);
      lines.push(`  Observation: ${step.Observation}`);
      lines.push(`  Think: ${step.Think}`);
      lines.push(`  Action: ${step.Action}`);
      lines.push(`  Expectation: ${step.Expectation}`);
    }

    return lines.join('\n');
  }

  /**
   * 批量获取多个轨迹的 In-Context 格式
   */
  getMultipleTracesInContext(
    traceNames: string[],
    options: { maxStepsPerTrace?: number } = {}
  ): InContextTrajectory[] {
    const results: InContextTrajectory[] = [];

    for (const name of traceNames) {
      const trajectory = this.getTrajectoryInContext(name, {
        formattingString: false,
        maxSteps: options.maxStepsPerTrace,
      });
      if (trajectory && typeof trajectory !== 'string') {
        results.push(trajectory);
      }
    }

    return results;
  }

  // ============ 使用统计 ============

  /**
   * 记录轨迹使用
   */
  recordUsage(traceId: string, success: boolean): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    trace.usageCount++;
    const totalAttempts = trace.usageCount;
    const previousSuccesses = trace.successRate * (totalAttempts - 1);
    trace.successRate = (previousSuccesses + (success ? 1 : 0)) / totalAttempts;
    trace.updatedAt = Date.now();

    this.emit('trace:used', { id: traceId, success });
  }

  // ============ 导入导出 ============

  /**
   * 从 ShowUI-Aloha 格式的 JSON 导入轨迹
   */
  importFromAlohaFormat(
    name: string,
    task: string,
    appContext: string,
    alohaJson: { trajectory: Array<{ step_idx: number; caption: {
      observation: string;
      think: string;
      action: string;
      expectation: string;
    } }> }
  ): SemanticTrace {
    const steps: SemanticTraceStep[] = alohaJson.trajectory.map((item) => ({
      stepIndex: item.step_idx,
      observation: item.caption.observation,
      think: item.caption.think,
      action: item.caption.action,
      expectation: item.caption.expectation,
      actionType: this.inferActionType(item.caption.action),
      timestamp: Date.now(),
    }));

    const trace: SemanticTrace = {
      id: this.generateTraceId(),
      name,
      task,
      appContext,
      trajectory: steps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
      successRate: 1,
    };

    this.addTrace(trace);
    return trace;
  }

  /**
   * 导出为 ShowUI-Aloha 格式的 JSON
   */
  exportToAlohaFormat(traceId: string): {
    trajectory: Array<{
      step_idx: number;
      caption: {
        observation: string;
        think: string;
        action: string;
        expectation: string;
      };
    }>;
  } | null {
    const trace = this.traces.get(traceId);
    if (!trace) return null;

    return {
      trajectory: trace.trajectory.map((step) => ({
        step_idx: step.stepIndex,
        caption: {
          observation: step.observation,
          think: step.think,
          action: step.action,
          expectation: step.expectation,
        },
      })),
    };
  }

  /**
   * 导出所有数据
   */
  export(): { traces: SemanticTrace[] } {
    return {
      traces: Array.from(this.traces.values()),
    };
  }

  /**
   * 导入数据
   */
  import(data: { traces: SemanticTrace[] }): void {
    for (const trace of data.traces) {
      this.addTrace(trace);
    }
    this.emit('data:imported', { traceCount: data.traces.length });
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalTraces: number;
    byApp: Record<string, number>;
    averageSteps: number;
    averageSuccessRate: number;
  } {
    const byApp: Record<string, number> = {};
    let totalSteps = 0;
    let totalSuccessRate = 0;

    for (const [, trace] of this.traces) {
      byApp[trace.appContext] = (byApp[trace.appContext] || 0) + 1;
      totalSteps += trace.trajectory.length;
      totalSuccessRate += trace.successRate;
    }

    const count = this.traces.size;
    return {
      totalTraces: count,
      byApp,
      averageSteps: count > 0 ? totalSteps / count : 0,
      averageSuccessRate: count > 0 ? totalSuccessRate / count : 0,
    };
  }

  /**
   * 清空所有数据
   */
  clear(): void {
    this.traces.clear();
    this.nameIndex.clear();
    this.appIndex.clear();
    this.emit('data:cleared');
  }

  // ============ 私有方法 ============

  private generateTraceId(): string {
    return `strace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private evictOldTraces(): void {
    // 按使用次数和成功率排序，删除最不重要的
    const sorted = Array.from(this.traces.values()).sort(
      (a, b) => a.usageCount * a.successRate - b.usageCount * b.successRate
    );

    // 删除 10%
    const toDelete = Math.ceil(sorted.length * 0.1);
    for (let i = 0; i < toDelete; i++) {
      this.deleteTrace(sorted[i].id);
    }
  }

  /**
   * 从动作描述推断动作类型
   */
  private inferActionType(actionDescription: string): SemanticActionType {
    const desc = actionDescription.toLowerCase();

    if (desc.includes('double-click') || desc.includes('double click')) {
      return 'double_click';
    }
    if (desc.includes('right-click') || desc.includes('right click')) {
      return 'right_click';
    }
    if (desc.includes('drag') || desc.includes('click-and-hold')) {
      return 'drag';
    }
    if (desc.includes('type') || desc.includes('input') || desc.includes('enter')) {
      return 'type';
    }
    if (desc.includes('scroll')) {
      return 'scroll';
    }
    if (desc.includes('press') || desc.includes('hotkey') || desc.includes('shortcut')) {
      return 'hotkey';
    }
    if (desc.includes('wait')) {
      return 'wait';
    }
    if (desc.includes('navigate') || desc.includes('go to') || desc.includes('open')) {
      return 'navigate';
    }
    if (desc.includes('focus') || desc.includes('switch to')) {
      return 'focus';
    }

    // 默认为点击
    return 'click';
  }
}

// ============ 单例支持 ============

let globalSemanticTraceManager: SemanticTraceManager | null = null;

export function getSemanticTraceManager(): SemanticTraceManager {
  if (!globalSemanticTraceManager) {
    globalSemanticTraceManager = new SemanticTraceManager();
  }
  return globalSemanticTraceManager;
}

export function createSemanticTraceManager(
  config?: Partial<SemanticTraceManagerConfig>
): SemanticTraceManager {
  return new SemanticTraceManager(config);
}

export function setSemanticTraceManager(manager: SemanticTraceManager): void {
  globalSemanticTraceManager = manager;
}
