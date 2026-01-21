/**
 * 工作流类型定义
 * Workflow Type Definitions
 *
 * 定义自定义工作流的接口和数据结构
 */

import { PlanStep } from '../ai';

// ============================================================================
// 工作流基础类型 (Workflow Base Types)
// ============================================================================

/**
 * 工作流状态
 */
export type WorkflowState =
  | 'draft'       // 草稿
  | 'active'      // 活动
  | 'paused'      // 暂停
  | 'completed'   // 完成
  | 'failed'      // 失败
  | 'archived';   // 已归档

/**
 * 工作流元数据
 */
export interface WorkflowMetadata {
  /** 唯一标识 */
  id: string;
  /** 名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 版本 */
  version: string;
  /** 作者 */
  author?: string;
  /** 标签 */
  tags?: string[];
  /** 分类 */
  category?: WorkflowCategory;
  /** 图标 */
  icon?: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 是否为系统工作流 */
  isSystem?: boolean;
  /** 是否为模板 */
  isTemplate?: boolean;
}

/**
 * 工作流分类
 */
export type WorkflowCategory =
  | 'development'    // 开发相关
  | 'writing'        // 写作相关
  | 'communication'  // 沟通相关
  | 'organization'   // 组织管理
  | 'automation'     // 自动化
  | 'custom';        // 自定义

// ============================================================================
// 触发器类型 (Trigger Types)
// ============================================================================

/**
 * 触发器类型
 */
export type TriggerType =
  | 'manual'        // 手动触发
  | 'schedule'      // 定时触发
  | 'event'         // 事件触发
  | 'condition'     // 条件触发
  | 'webhook'       // Webhook 触发
  | 'hotkey';       // 快捷键触发

/**
 * 基础触发器配置
 */
export interface BaseTrigger {
  /** 触发器类型 */
  type: TriggerType;
  /** 是否启用 */
  enabled: boolean;
  /** 描述 */
  description?: string;
}

/**
 * 手动触发器
 */
export interface ManualTrigger extends BaseTrigger {
  type: 'manual';
}

/**
 * 定时触发器
 */
export interface ScheduleTrigger extends BaseTrigger {
  type: 'schedule';
  /** Cron 表达式 */
  cron?: string;
  /** 间隔 (毫秒) */
  interval?: number;
  /** 开始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
  /** 时区 */
  timezone?: string;
}

/**
 * 事件触发器
 */
export interface EventTrigger extends BaseTrigger {
  type: 'event';
  /** 事件名称 */
  eventName: string;
  /** 事件过滤条件 */
  filter?: Record<string, unknown>;
}

/**
 * 条件触发器
 */
export interface ConditionTrigger extends BaseTrigger {
  type: 'condition';
  /** 条件表达式 */
  conditions: WorkflowCondition[];
  /** 条件组合方式 */
  logic: 'and' | 'or';
}

/**
 * Webhook 触发器
 */
export interface WebhookTrigger extends BaseTrigger {
  type: 'webhook';
  /** Webhook URL 路径 */
  path: string;
  /** 允许的 HTTP 方法 */
  methods?: ('GET' | 'POST' | 'PUT' | 'DELETE')[];
  /** 验证密钥 */
  secret?: string;
}

/**
 * 快捷键触发器
 */
export interface HotkeyTrigger extends BaseTrigger {
  type: 'hotkey';
  /** 快捷键组合 */
  keys: string;
  /** 是否全局 */
  global?: boolean;
}

/**
 * 触发器配置
 */
export type WorkflowTrigger =
  | ManualTrigger
  | ScheduleTrigger
  | EventTrigger
  | ConditionTrigger
  | WebhookTrigger
  | HotkeyTrigger;

// ============================================================================
// 条件类型 (Condition Types)
// ============================================================================

/**
 * 条件运算符
 */
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'is_empty'
  | 'is_not_empty'
  | 'matches_regex';

/**
 * 工作流条件
 */
export interface WorkflowCondition {
  /** 条件字段 */
  field: string;
  /** 运算符 */
  operator: ConditionOperator;
  /** 比较值 */
  value?: unknown;
  /** 是否取反 */
  negate?: boolean;
}

// ============================================================================
// 步骤类型 (Step Types)
// ============================================================================

/**
 * 步骤类型
 */
export type WorkflowStepType =
  | 'action'        // 执行操作
  | 'condition'     // 条件判断
  | 'loop'          // 循环
  | 'parallel'      // 并行执行
  | 'wait'          // 等待
  | 'input'         // 用户输入
  | 'notification'  // 通知
  | 'script'        // 脚本执行
  | 'subworkflow';  // 子工作流

/**
 * 基础步骤配置
 */
export interface BaseWorkflowStep {
  /** 步骤 ID */
  id: string;
  /** 步骤类型 */
  type: WorkflowStepType;
  /** 步骤名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 错误处理策略 */
  onError?: ErrorHandlingStrategy;
  /** 重试配置 */
  retry?: RetryConfig;
  /** 超时 (毫秒) */
  timeout?: number;
}

/**
 * 操作步骤
 */
export interface ActionStep extends BaseWorkflowStep {
  type: 'action';
  /** 操作定义 */
  action: PlanStep;
}

/**
 * 条件步骤
 */
export interface ConditionStep extends BaseWorkflowStep {
  type: 'condition';
  /** 条件列表 */
  conditions: WorkflowCondition[];
  /** 条件逻辑 */
  logic: 'and' | 'or';
  /** 条件为真时执行的步骤 */
  thenSteps: WorkflowStep[];
  /** 条件为假时执行的步骤 */
  elseSteps?: WorkflowStep[];
}

/**
 * 循环步骤
 */
export interface LoopStep extends BaseWorkflowStep {
  type: 'loop';
  /** 循环类型 */
  loopType: 'count' | 'while' | 'for_each';
  /** 循环次数 (count 类型) */
  count?: number;
  /** 循环条件 (while 类型) */
  whileCondition?: WorkflowCondition;
  /** 遍历数组 (for_each 类型) */
  items?: unknown[];
  /** 当前项变量名 */
  itemVariable?: string;
  /** 循环内的步骤 */
  steps: WorkflowStep[];
  /** 最大迭代次数 */
  maxIterations?: number;
}

/**
 * 并行执行步骤
 */
export interface ParallelStep extends BaseWorkflowStep {
  type: 'parallel';
  /** 并行执行的分支 */
  branches: Array<{
    name: string;
    steps: WorkflowStep[];
  }>;
  /** 等待策略 */
  waitStrategy: 'all' | 'any' | 'none';
}

/**
 * 等待步骤
 */
export interface WaitStep extends BaseWorkflowStep {
  type: 'wait';
  /** 等待时长 (毫秒) */
  duration?: number;
  /** 等待事件 */
  event?: string;
  /** 等待条件 */
  condition?: WorkflowCondition;
}

/**
 * 用户输入步骤
 */
export interface InputStep extends BaseWorkflowStep {
  type: 'input';
  /** 提示信息 */
  prompt: string;
  /** 输入类型 */
  inputType: 'text' | 'number' | 'boolean' | 'select' | 'file';
  /** 选项 (select 类型) */
  options?: Array<{ label: string; value: unknown }>;
  /** 默认值 */
  defaultValue?: unknown;
  /** 验证规则 */
  validation?: InputValidation;
  /** 结果变量名 */
  resultVariable: string;
}

/**
 * 通知步骤
 */
export interface NotificationStep extends BaseWorkflowStep {
  type: 'notification';
  /** 通知标题 */
  title: string;
  /** 通知内容 */
  message: string;
  /** 通知类型 */
  notificationType: 'info' | 'success' | 'warning' | 'error';
  /** 操作按钮 */
  actions?: Array<{ label: string; value: string }>;
}

/**
 * 脚本步骤
 */
export interface ScriptStep extends BaseWorkflowStep {
  type: 'script';
  /** 脚本语言 */
  language: 'javascript' | 'shell';
  /** 脚本代码 */
  code: string;
  /** 输入变量 */
  inputs?: Record<string, string>;
  /** 输出变量 */
  outputs?: string[];
}

/**
 * 子工作流步骤
 */
export interface SubworkflowStep extends BaseWorkflowStep {
  type: 'subworkflow';
  /** 子工作流 ID */
  workflowId: string;
  /** 输入参数映射 */
  inputMapping?: Record<string, string>;
  /** 输出参数映射 */
  outputMapping?: Record<string, string>;
}

/**
 * 工作流步骤
 */
export type WorkflowStep =
  | ActionStep
  | ConditionStep
  | LoopStep
  | ParallelStep
  | WaitStep
  | InputStep
  | NotificationStep
  | ScriptStep
  | SubworkflowStep;

// ============================================================================
// 错误处理 (Error Handling)
// ============================================================================

/**
 * 错误处理策略
 */
export type ErrorHandlingStrategy =
  | 'stop'           // 停止执行
  | 'continue'       // 继续执行
  | 'retry'          // 重试
  | 'fallback';      // 回退到备选方案

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试间隔 (毫秒) */
  retryInterval: number;
  /** 指数退避 */
  exponentialBackoff?: boolean;
  /** 最大间隔 (毫秒) */
  maxInterval?: number;
}

/**
 * 输入验证
 */
export interface InputValidation {
  /** 是否必填 */
  required?: boolean;
  /** 最小值 */
  min?: number;
  /** 最大值 */
  max?: number;
  /** 最小长度 */
  minLength?: number;
  /** 最大长度 */
  maxLength?: number;
  /** 正则表达式 */
  pattern?: string;
  /** 自定义验证消息 */
  message?: string;
}

// ============================================================================
// 工作流定义 (Workflow Definition)
// ============================================================================

/**
 * 工作流变量
 */
export interface WorkflowVariable {
  /** 变量名 */
  name: string;
  /** 类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** 默认值 */
  defaultValue?: unknown;
  /** 描述 */
  description?: string;
  /** 是否必填 */
  required?: boolean;
}

/**
 * 工作流定义
 */
export interface Workflow {
  /** 元数据 */
  metadata: WorkflowMetadata;
  /** 触发器列表 */
  triggers: WorkflowTrigger[];
  /** 输入变量 */
  inputs?: WorkflowVariable[];
  /** 输出变量 */
  outputs?: WorkflowVariable[];
  /** 步骤列表 */
  steps: WorkflowStep[];
  /** 全局错误处理 */
  errorHandling?: ErrorHandlingStrategy;
  /** 全局超时 (毫秒) */
  timeout?: number;
}

// ============================================================================
// 执行相关类型 (Execution Types)
// ============================================================================

/**
 * 执行状态
 */
export type ExecutionStatus =
  | 'pending'     // 等待执行
  | 'running'     // 执行中
  | 'paused'      // 已暂停
  | 'completed'   // 已完成
  | 'failed'      // 失败
  | 'cancelled';  // 已取消

/**
 * 步骤执行结果
 */
export interface StepExecutionResult {
  /** 步骤 ID */
  stepId: string;
  /** 状态 */
  status: ExecutionStatus;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 输出 */
  output?: unknown;
  /** 错误信息 */
  error?: string;
  /** 重试次数 */
  retryCount?: number;
}

/**
 * 工作流执行记录
 */
export interface WorkflowExecution {
  /** 执行 ID */
  id: string;
  /** 工作流 ID */
  workflowId: string;
  /** 工作流版本 */
  workflowVersion: string;
  /** 触发器类型 */
  triggerType: TriggerType;
  /** 触发时间 */
  triggeredAt: number;
  /** 开始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
  /** 状态 */
  status: ExecutionStatus;
  /** 输入参数 */
  inputs?: Record<string, unknown>;
  /** 输出结果 */
  outputs?: Record<string, unknown>;
  /** 步骤执行结果 */
  stepResults: StepExecutionResult[];
  /** 变量快照 */
  variables: Record<string, unknown>;
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// 配置类型 (Configuration Types)
// ============================================================================

/**
 * 工作流管理器配置
 */
export interface WorkflowManagerConfig {
  /** 工作流存储目录 */
  workflowDir: string;
  /** 最大并发执行数 */
  maxConcurrentExecutions: number;
  /** 执行历史保留天数 */
  executionHistoryDays: number;
  /** 默认超时 (毫秒) */
  defaultTimeout: number;
  /** 是否启用脚本执行 */
  enableScriptExecution: boolean;
  /** 脚本执行超时 (毫秒) */
  scriptTimeout: number;
}

/**
 * 默认工作流管理器配置
 */
export const DEFAULT_WORKFLOW_CONFIG: WorkflowManagerConfig = {
  workflowDir: '~/.hawkeye/workflows',
  maxConcurrentExecutions: 5,
  executionHistoryDays: 30,
  defaultTimeout: 300000, // 5 分钟
  enableScriptExecution: true,
  scriptTimeout: 60000,  // 1 分钟
};
