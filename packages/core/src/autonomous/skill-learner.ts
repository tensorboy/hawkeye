/**
 * SkillLearner - 技能学习器
 *
 * 从用户行为中学习可复用的宏技能
 * 类似 Cradle 项目的技能提取能力
 *
 * 功能:
 * - 识别重复的操作序列
 * - 提取可参数化的技能模板
 * - 泛化技能以适应新场景
 * - 技能版本管理和优化
 */

import type { GUIAction } from '../execution/action-types';

/**
 * 技能类型
 */
export type SkillType =
  | 'navigation'    // 导航类技能
  | 'data_entry'    // 数据输入类
  | 'extraction'    // 数据提取类
  | 'automation'    // 自动化流程
  | 'interaction'   // UI 交互类
  | 'custom';       // 自定义技能

/**
 * 技能状态
 */
export type SkillStatus = 'draft' | 'active' | 'deprecated' | 'testing';

/**
 * 技能参数定义
 */
export interface SkillParameter {
  /** 参数名称 */
  name: string;
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean' | 'point' | 'selector' | 'any';
  /** 描述 */
  description: string;
  /** 默认值 */
  defaultValue?: unknown;
  /** 是否必需 */
  required: boolean;
  /** 验证规则 */
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    enum?: unknown[];
  };
}

/**
 * 技能步骤
 */
export interface SkillStep {
  /** 步骤 ID */
  id: string;
  /** 步骤索引 */
  index: number;
  /** 动作模板 */
  actionTemplate: SkillActionTemplate;
  /** 条件 (可选) */
  condition?: SkillCondition;
  /** 重试配置 */
  retry?: {
    maxAttempts: number;
    delayMs: number;
  };
  /** 超时 (ms) */
  timeout?: number;
}

/**
 * 技能动作模板
 */
export interface SkillActionTemplate {
  /** 动作类型 */
  type: GUIAction['type'];
  /** 参数映射 (参数名 -> 表达式) */
  parameterBindings: Record<string, string>;
  /** 静态参数 */
  staticParams?: Record<string, unknown>;
}

/**
 * 技能条件
 */
export interface SkillCondition {
  /** 条件类型 */
  type: 'element_exists' | 'text_matches' | 'state_equals' | 'custom';
  /** 条件表达式 */
  expression: string;
  /** 否定条件 */
  negate?: boolean;
}

/**
 * 学习到的技能
 */
export interface LearnedSkill {
  /** 技能 ID */
  id: string;
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 技能类型 */
  type: SkillType;
  /** 技能状态 */
  status: SkillStatus;
  /** 参数定义 */
  parameters: SkillParameter[];
  /** 步骤列表 */
  steps: SkillStep[];
  /** 前置条件 */
  preconditions: SkillCondition[];
  /** 后置条件 */
  postconditions: SkillCondition[];
  /** 学习元数据 */
  metadata: SkillMetadata;
  /** 版本号 */
  version: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 技能元数据
 */
export interface SkillMetadata {
  /** 学习来源 */
  source: 'demonstration' | 'pattern' | 'manual' | 'imported';
  /** 学习次数 */
  learningCount: number;
  /** 执行次数 */
  executionCount: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  failureCount: number;
  /** 成功率 */
  successRate: number;
  /** 平均执行时间 (ms) */
  avgExecutionTime: number;
  /** 相关应用 */
  relatedApps: string[];
  /** 标签 */
  tags: string[];
}

/**
 * 操作记录 (用于学习)
 */
export interface ActionRecord {
  /** 记录 ID */
  id: string;
  /** 动作 */
  action: GUIAction;
  /** 上下文 */
  context: ActionContext;
  /** 时间戳 */
  timestamp: number;
  /** 执行结果 */
  result?: {
    success: boolean;
    error?: string;
  };
}

/**
 * 动作上下文
 */
export interface ActionContext {
  /** 应用名称 */
  appName: string;
  /** 窗口标题 */
  windowTitle: string;
  /** URL (如果是浏览器) */
  url?: string;
  /** 元素选择器 */
  elementSelector?: string;
  /** 元素文本 */
  elementText?: string;
  /** 屏幕区域 */
  screenRegion?: string;
}

/**
 * 模式匹配结果
 */
export interface PatternMatch {
  /** 模式 ID */
  patternId: string;
  /** 匹配的记录索引 */
  recordIndices: number[];
  /** 相似度分数 */
  similarity: number;
  /** 模式长度 */
  patternLength: number;
  /** 出现次数 */
  occurrences: number;
}

/**
 * 技能学习器配置
 */
export interface SkillLearnerConfig {
  /** 最小模式长度 */
  minPatternLength: number;
  /** 最小出现次数才学习 */
  minOccurrences: number;
  /** 相似度阈值 */
  similarityThreshold: number;
  /** 最大技能数量 */
  maxSkills: number;
  /** 是否自动学习 */
  autoLearn: boolean;
  /** 学习间隔 (ms) */
  learningInterval: number;
  /** 是否启用泛化 */
  enableGeneralization: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: SkillLearnerConfig = {
  minPatternLength: 3,
  minOccurrences: 3,
  similarityThreshold: 0.8,
  maxSkills: 100,
  autoLearn: true,
  learningInterval: 60000, // 1 minute
  enableGeneralization: true,
};

/**
 * 技能学习器
 */
export class SkillLearner {
  private config: SkillLearnerConfig;
  private skills: Map<string, LearnedSkill>;
  private actionBuffer: ActionRecord[];
  private learningTimer: ReturnType<typeof setInterval> | null;
  private idCounter: number;

  constructor(config: Partial<SkillLearnerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.skills = new Map();
    this.actionBuffer = [];
    this.learningTimer = null;
    this.idCounter = 0;

    if (this.config.autoLearn) {
      this.startAutoLearning();
    }
  }

  /**
   * 记录用户操作
   */
  recordAction(action: GUIAction, context: ActionContext, result?: { success: boolean; error?: string }): void {
    const record: ActionRecord = {
      id: `ar_${++this.idCounter}`,
      action,
      context,
      timestamp: Date.now(),
      result,
    };

    this.actionBuffer.push(record);

    // 限制缓冲区大小
    if (this.actionBuffer.length > 1000) {
      this.actionBuffer = this.actionBuffer.slice(-500);
    }
  }

  /**
   * 从记录中学习技能
   */
  learn(): LearnedSkill[] {
    const patterns = this.detectPatterns();
    const newSkills: LearnedSkill[] = [];

    for (const pattern of patterns) {
      if (pattern.occurrences >= this.config.minOccurrences &&
          pattern.similarity >= this.config.similarityThreshold) {
        const skill = this.extractSkill(pattern);
        if (skill) {
          this.skills.set(skill.id, skill);
          newSkills.push(skill);
        }
      }
    }

    // 限制技能数量
    this.pruneSkills();

    return newSkills;
  }

  /**
   * 从演示序列创建技能
   */
  createFromDemonstration(
    name: string,
    description: string,
    records: ActionRecord[]
  ): LearnedSkill {
    const steps = this.recordsToSteps(records);
    const parameters = this.extractParameters(records);

    const skill: LearnedSkill = {
      id: this.generateSkillId(),
      name,
      description,
      type: this.inferSkillType(records),
      status: 'draft',
      parameters,
      steps,
      preconditions: [],
      postconditions: [],
      metadata: {
        source: 'demonstration',
        learningCount: 1,
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgExecutionTime: 0,
        relatedApps: [...new Set(records.map((r) => r.context.appName))],
        tags: [],
      },
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.skills.set(skill.id, skill);
    return skill;
  }

  /**
   * 执行技能
   */
  async execute(
    skillId: string,
    params: Record<string, unknown>,
    executor: (action: GUIAction) => Promise<{ success: boolean; error?: string }>
  ): Promise<{ success: boolean; error?: string; duration: number }> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return { success: false, error: `技能不存在: ${skillId}`, duration: 0 };
    }

    const startTime = Date.now();
    let lastError: string | undefined;

    // 执行步骤
    for (const step of skill.steps) {
      // 检查条件
      if (step.condition && !this.evaluateCondition(step.condition, params)) {
        continue;
      }

      // 构建动作
      const action = this.buildAction(step.actionTemplate, params);
      if (!action) {
        lastError = `无法构建步骤 ${step.id} 的动作`;
        continue;
      }

      // 执行动作 (带重试)
      const maxAttempts = step.retry?.maxAttempts || 1;
      let success = false;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const result = await executor(action);
        if (result.success) {
          success = true;
          break;
        }
        lastError = result.error;

        if (attempt < maxAttempts - 1 && step.retry?.delayMs) {
          await this.delay(step.retry.delayMs);
        }
      }

      if (!success) {
        this.updateMetadata(skill, false, Date.now() - startTime);
        return {
          success: false,
          error: lastError || `步骤 ${step.id} 执行失败`,
          duration: Date.now() - startTime,
        };
      }
    }

    const duration = Date.now() - startTime;
    this.updateMetadata(skill, true, duration);

    return { success: true, duration };
  }

  /**
   * 获取所有技能
   */
  getSkills(): LearnedSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取指定技能
   */
  getSkill(id: string): LearnedSkill | undefined {
    return this.skills.get(id);
  }

  /**
   * 按名称搜索技能
   */
  searchSkills(query: string): LearnedSkill[] {
    const lowerQuery = query.toLowerCase();
    return this.getSkills().filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.description.toLowerCase().includes(lowerQuery) ||
        s.metadata.tags.some((t) => t.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 推荐适合当前上下文的技能
   */
  recommendSkills(context: ActionContext, limit = 5): LearnedSkill[] {
    return this.getSkills()
      .filter((s) => s.status === 'active')
      .filter((s) => {
        // 匹配应用
        if (s.metadata.relatedApps.length > 0 &&
            !s.metadata.relatedApps.includes(context.appName)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        // 按成功率和使用频率排序
        const scoreA = a.metadata.successRate * 0.6 + Math.log(a.metadata.executionCount + 1) * 0.4;
        const scoreB = b.metadata.successRate * 0.6 + Math.log(b.metadata.executionCount + 1) * 0.4;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  /**
   * 更新技能
   */
  updateSkill(id: string, updates: Partial<LearnedSkill>): boolean {
    const skill = this.skills.get(id);
    if (!skill) {
      return false;
    }

    const updatedSkill = {
      ...skill,
      ...updates,
      version: skill.version + 1,
      updatedAt: Date.now(),
    };

    this.skills.set(id, updatedSkill);
    return true;
  }

  /**
   * 删除技能
   */
  deleteSkill(id: string): boolean {
    return this.skills.delete(id);
  }

  /**
   * 导出技能
   */
  exportSkill(id: string): string | null {
    const skill = this.skills.get(id);
    if (!skill) {
      return null;
    }
    return JSON.stringify(skill, null, 2);
  }

  /**
   * 导入技能
   */
  importSkill(json: string): LearnedSkill | null {
    try {
      const skill = JSON.parse(json) as LearnedSkill;
      skill.id = this.generateSkillId(); // 生成新 ID
      skill.metadata.source = 'imported';
      skill.createdAt = Date.now();
      skill.updatedAt = Date.now();

      this.skills.set(skill.id, skill);
      return skill;
    } catch {
      return null;
    }
  }

  /**
   * 启动自动学习
   */
  startAutoLearning(): void {
    if (this.learningTimer) {
      return;
    }

    this.learningTimer = setInterval(() => {
      this.learn();
    }, this.config.learningInterval);
  }

  /**
   * 停止自动学习
   */
  stopAutoLearning(): void {
    if (this.learningTimer) {
      clearInterval(this.learningTimer);
      this.learningTimer = null;
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SkillLearnerConfig>): void {
    this.config = { ...this.config, ...config };

    // 重启自动学习
    if (this.learningTimer) {
      this.stopAutoLearning();
      if (this.config.autoLearn) {
        this.startAutoLearning();
      }
    }
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.stopAutoLearning();
    this.skills.clear();
    this.actionBuffer = [];
  }

  // ===== Private Methods =====

  private generateSkillId(): string {
    return `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private detectPatterns(): PatternMatch[] {
    const patterns: PatternMatch[] = [];
    const n = this.actionBuffer.length;

    if (n < this.config.minPatternLength * this.config.minOccurrences) {
      return patterns;
    }

    // 使用滑动窗口检测重复模式
    const patternMap = new Map<string, number[][]>();

    for (let len = this.config.minPatternLength; len <= Math.min(10, n / 2); len++) {
      for (let i = 0; i <= n - len; i++) {
        const key = this.getPatternKey(i, len);
        if (!patternMap.has(key)) {
          patternMap.set(key, []);
        }
        patternMap.get(key)!.push(Array.from({ length: len }, (_, j) => i + j));
      }
    }

    // 过滤出现次数足够的模式
    for (const [patternId, occurrencesList] of patternMap) {
      if (occurrencesList.length >= this.config.minOccurrences) {
        patterns.push({
          patternId,
          recordIndices: occurrencesList[0], // 第一次出现的索引
          similarity: 1.0, // 完全匹配
          patternLength: occurrencesList[0].length,
          occurrences: occurrencesList.length,
        });
      }
    }

    return patterns;
  }

  private getPatternKey(startIndex: number, length: number): string {
    const parts: string[] = [];
    for (let i = 0; i < length; i++) {
      const record = this.actionBuffer[startIndex + i];
      parts.push(`${record.action.type}:${record.context.appName}`);
    }
    return parts.join('|');
  }

  private extractSkill(pattern: PatternMatch): LearnedSkill | null {
    const records = pattern.recordIndices.map((i) => this.actionBuffer[i]);
    if (records.length === 0) {
      return null;
    }

    const steps = this.recordsToSteps(records);
    const parameters = this.config.enableGeneralization
      ? this.extractParameters(records)
      : [];

    return {
      id: this.generateSkillId(),
      name: `自动学习技能 #${this.skills.size + 1}`,
      description: `从 ${pattern.occurrences} 次重复操作中学习`,
      type: this.inferSkillType(records),
      status: 'draft',
      parameters,
      steps,
      preconditions: [],
      postconditions: [],
      metadata: {
        source: 'pattern',
        learningCount: pattern.occurrences,
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgExecutionTime: 0,
        relatedApps: [...new Set(records.map((r) => r.context.appName))],
        tags: [],
      },
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private recordsToSteps(records: ActionRecord[]): SkillStep[] {
    return records.map((record, index) => ({
      id: `step_${index + 1}`,
      index,
      actionTemplate: {
        type: record.action.type,
        parameterBindings: {},
        staticParams: { ...record.action } as Record<string, unknown>,
      },
      timeout: 30000,
    }));
  }

  private extractParameters(records: ActionRecord[]): SkillParameter[] {
    const parameters: SkillParameter[] = [];
    const textValues = new Set<string>();
    const hasCoordinates = records.some(
      (r) => 'coordinate' in r.action && r.action.coordinate
    );

    // 提取文本输入参数
    for (const record of records) {
      if (record.action.type === 'type' && 'text' in record.action) {
        textValues.add(record.action.text as string);
      }
    }

    if (textValues.size > 0) {
      parameters.push({
        name: 'inputText',
        type: 'string',
        description: '输入文本',
        required: true,
      });
    }

    // 如果有坐标，添加目标参数
    if (hasCoordinates) {
      parameters.push({
        name: 'targetPoint',
        type: 'point',
        description: '目标位置',
        required: false,
      });
    }

    return parameters;
  }

  private inferSkillType(records: ActionRecord[]): SkillType {
    const actionTypes = records.map((r) => r.action.type);

    // 导航类: 多点击和滚动
    if (actionTypes.filter((t) => t === 'click' || t === 'scroll').length > records.length * 0.6) {
      return 'navigation';
    }

    // 数据输入类: 多输入
    if (actionTypes.filter((t) => t === 'type').length > records.length * 0.4) {
      return 'data_entry';
    }

    // 交互类
    if (actionTypes.includes('click') && actionTypes.includes('type')) {
      return 'interaction';
    }

    return 'automation';
  }

  private buildAction(
    template: SkillActionTemplate,
    params: Record<string, unknown>
  ): GUIAction | null {
    try {
      const actionParams = { ...template.staticParams };

      // 应用参数绑定
      for (const [paramName, expression] of Object.entries(template.parameterBindings)) {
        const value = this.evaluateExpression(expression, params);
        if (value !== undefined) {
          actionParams[paramName] = value;
        }
      }

      return actionParams as unknown as GUIAction;
    } catch {
      return null;
    }
  }

  private evaluateExpression(expression: string, params: Record<string, unknown>): unknown {
    // 简单的参数替换
    if (expression.startsWith('$')) {
      const paramName = expression.slice(1);
      return params[paramName];
    }
    return expression;
  }

  private evaluateCondition(_condition: SkillCondition, _params: Record<string, unknown>): boolean {
    // 简化实现，实际需要更复杂的条件评估
    return true;
  }

  private updateMetadata(skill: LearnedSkill, success: boolean, duration: number): void {
    skill.metadata.executionCount++;
    if (success) {
      skill.metadata.successCount++;
    } else {
      skill.metadata.failureCount++;
    }
    skill.metadata.successRate =
      skill.metadata.successCount / skill.metadata.executionCount;

    // 更新平均执行时间
    const prevTotal = skill.metadata.avgExecutionTime * (skill.metadata.executionCount - 1);
    skill.metadata.avgExecutionTime =
      (prevTotal + duration) / skill.metadata.executionCount;

    skill.updatedAt = Date.now();
  }

  private pruneSkills(): void {
    const skills = this.getSkills()
      .sort((a, b) => {
        // 保留成功率高、使用频繁的技能
        const scoreA = a.metadata.successRate + Math.log(a.metadata.executionCount + 1) * 0.1;
        const scoreB = b.metadata.successRate + Math.log(b.metadata.executionCount + 1) * 0.1;
        return scoreB - scoreA;
      });

    while (skills.length > this.config.maxSkills) {
      const toRemove = skills.pop();
      if (toRemove) {
        this.skills.delete(toRemove.id);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ===== Singleton Support =====

let globalSkillLearner: SkillLearner | null = null;

export function getSkillLearner(): SkillLearner {
  if (!globalSkillLearner) {
    globalSkillLearner = new SkillLearner();
  }
  return globalSkillLearner;
}

export function createSkillLearner(config?: Partial<SkillLearnerConfig>): SkillLearner {
  return new SkillLearner(config);
}

export function setSkillLearner(learner: SkillLearner): void {
  globalSkillLearner = learner;
}
