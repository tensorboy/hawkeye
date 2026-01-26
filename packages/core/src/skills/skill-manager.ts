/**
 * Skill Manager - 技能管理器
 * 管理技能的注册、加载和执行编排
 */

import { EventEmitter } from 'events';
import type { Skill, SkillContext, SkillResult, SkillStep } from './skill-types';
import type { ToolRegistry } from '../mcp/tool-registry';

export class SkillManager extends EventEmitter {
  private skills: Map<string, Skill> = new Map();
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    super();
    this.toolRegistry = toolRegistry;
  }

  /**
   * 注册技能
   */
  registerSkill(skill: Skill): void {
    // 验证依赖工具
    const missingTools = skill.requiredTools.filter(t => !this.toolRegistry.getTool(t));
    if (missingTools.length > 0) {
      console.warn(`[SkillManager] Warning: Skill ${skill.name} missing tools: ${missingTools.join(', ')}`);
    }

    this.skills.set(skill.id, skill);
    this.emit('skill:registered', skill);
  }

  /**
   * 获取技能
   */
  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /**
   * 执行技能
   */
  async executeSkill(skillId: string, params: Record<string, unknown> = {}): Promise<SkillResult> {
    const skill = this.getSkill(skillId);
    if (!skill) {
      return { success: false, output: null, error: `Skill not found: ${skillId}` };
    }

    const context: SkillContext = {
      sessionId: `sess_${Date.now()}`,
      workspacePath: process.cwd(),
      variables: { ...params },
      history: []
    };

    this.emit('skill:start', { skillId, context });
    const startTime = Date.now();

    try {
      let result: SkillResult;

      // 优先使用自定义执行逻辑
      if (skill.execute) {
        result = await skill.execute(context);
      } else {
        // 使用工作流引擎执行
        result = await this.executeWorkflow(skill.workflow.steps, context);
      }

      const duration = Date.now() - startTime;
      result.metrics = {
        duration,
        stepsExecuted: context.history.length
      };

      this.emit('skill:complete', { skillId, result });
      return result;
    } catch (error) {
      this.emit('skill:error', { skillId, error });
      return {
        success: false,
        output: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 简单的工作流执行引擎
   */
  private async executeWorkflow(steps: SkillStep[], context: SkillContext): Promise<SkillResult> {
    for (const step of steps) {
      // 检查条件
      if (step.condition && !step.condition(context)) {
        continue;
      }

      try {
        await this.executeStep(step, context);
      } catch (error) {
        if (step.onError === 'stop' || !step.onError) {
          throw error;
        }
        console.warn(`[SkillManager] Step ${step.name} failed, continuing...`, error);
      }
    }

    return { success: true, output: context.variables };
  }

  private async executeStep(step: SkillStep, context: SkillContext): Promise<void> {
    // 解析参数
    let params: Record<string, unknown> = {};
    if (typeof step.params === 'function') {
      params = step.params(context);
    } else if (step.params) {
      params = step.params;
    }

    let output: unknown;

    switch (step.type) {
      case 'tool':
        if (!step.toolName) throw new Error('Tool name required');
        const toolResult = await this.toolRegistry.executeTool(step.toolName, params);
        if (toolResult.isError) throw new Error(`Tool execution failed: ${JSON.stringify(toolResult)}`);
        output = toolResult;
        break;

      case 'skill':
        if (!step.skillId) throw new Error('Skill ID required');
        const skillResult = await this.executeSkill(step.skillId, params);
        if (!skillResult.success) throw new Error(skillResult.error);
        output = skillResult.output;
        break;

      case 'wait':
        const ms = (params.duration as number) || 1000;
        await new Promise(resolve => setTimeout(resolve, ms));
        break;
    }

    // 保存结果
    if (step.resultKey && output !== undefined) {
      context.variables[step.resultKey] = output;
    }

    context.history.push({ stepId: step.id, output, timestamp: Date.now() });
  }
}
