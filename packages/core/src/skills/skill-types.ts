/**
 * Skill Types - 技能类型定义
 * 技能是基于工具的高级工作流编排
 */

export interface SkillContext {
  sessionId: string;
  workspacePath: string;
  variables: Record<string, unknown>;
  history: any[];
}

export interface SkillResult {
  success: boolean;
  output: unknown;
  error?: string;
  artifacts?: string[];
  metrics?: {
    duration: number;
    stepsExecuted: number;
  };
}

export interface SkillStep {
  id: string;
  name: string;
  type: 'tool' | 'skill' | 'condition' | 'loop' | 'wait';

  // 工具调用
  toolName?: string;
  params?: Record<string, unknown> | ((ctx: SkillContext) => Record<string, unknown>);

  // 嵌套技能
  skillId?: string;

  // 流程控制
  condition?: (ctx: SkillContext) => boolean;
  loop?: {
    items: string | any[]; // 变量名或数组
    iterator: string; // 迭代变量名
  };

  // 结果处理
  resultKey?: string; // 将结果存入 context.variables[key]

  // 错误处理
  onError?: 'stop' | 'continue' | 'retry';
  maxRetries?: number;
}

export interface SkillWorkflow {
  steps: SkillStep[];
  inputs: Record<string, { type: string; description: string; default?: any }>;
  outputs: Record<string, { type: string; description: string }>;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];

  // 依赖的 MCP 工具
  requiredTools: string[];

  // 工作流定义
  workflow: SkillWorkflow;

  // 最佳实践指南 (用于 Prompt 增强)
  guidelines: string[];

  // 自定义执行逻辑 (可选，如果不使用通用 workflow 引擎)
  execute?: (context: SkillContext) => Promise<SkillResult>;
}
