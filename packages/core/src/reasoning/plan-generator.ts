/**
 * Plan Generator - 计划生成器
 * 根据用户意图生成执行计划
 */

import { EventEmitter } from 'events';
import type {
  UserIntent,
  ExecutionPlan,
  PlanStep,
  ActionType,
  AlternativePlan,
  PlanImpact,
  AIMessage,
} from '../ai/types';
import type { AIManager } from '../ai/manager';
import type { ExtendedPerceptionContext } from '../perception/engine';

export interface PlanGeneratorConfig {
  /** 是否自动生成替代方案 */
  generateAlternatives: boolean;
  /** 最大替代方案数 */
  maxAlternatives: number;
  /** 是否详细分析风险 */
  analyzeRisks: boolean;
  /** 默认需要确认 */
  defaultRequiresConfirmation: boolean;
}

export class PlanGenerator extends EventEmitter {
  private config: PlanGeneratorConfig;
  private aiManager: AIManager | null = null;
  private recentPlans: ExecutionPlan[] = [];

  constructor(config: Partial<PlanGeneratorConfig> = {}) {
    super();
    this.config = {
      generateAlternatives: true,
      maxAlternatives: 2,
      analyzeRisks: true,
      defaultRequiresConfirmation: true,
      ...config,
    };
  }

  /**
   * 设置 AI Manager
   */
  setAIManager(manager: AIManager): void {
    this.aiManager = manager;
  }

  /**
   * 根据意图生成执行计划
   */
  async generate(
    intent: UserIntent,
    context?: ExtendedPerceptionContext
  ): Promise<ExecutionPlan> {
    this.emit('generating', intent);

    // 先尝试基于模板生成
    let plan = this.generateFromTemplate(intent, context);

    // 如果有 AI Manager，用 AI 增强计划
    if (this.aiManager?.isReady && intent.confidence >= 0.6) {
      try {
        plan = await this.enhanceWithAI(plan, intent, context);
      } catch (error) {
        console.warn('AI 计划增强失败:', error);
      }
    }

    // 分析影响
    plan.impact = this.analyzeImpact(plan);

    // 添加到最近计划
    this.recentPlans.unshift(plan);
    if (this.recentPlans.length > 20) {
      this.recentPlans.pop();
    }

    this.emit('generated', plan);
    return plan;
  }

  /**
   * 获取最近生成的计划
   */
  getRecentPlans(): ExecutionPlan[] {
    return [...this.recentPlans];
  }

  /**
   * 根据 ID 获取计划
   */
  getPlan(id: string): ExecutionPlan | undefined {
    return this.recentPlans.find(p => p.id === id);
  }

  // ============ 模板生成 ============

  private generateFromTemplate(
    intent: UserIntent,
    context?: ExtendedPerceptionContext
  ): ExecutionPlan {
    switch (intent.type) {
      case 'file_organize':
        return this.generateFileOrganizePlan(intent, context);
      case 'code_assist':
        return this.generateCodeAssistPlan(intent, context);
      case 'automation':
        return this.generateAutomationPlan(intent, context);
      case 'search':
        return this.generateSearchPlan(intent, context);
      case 'communication':
        return this.generateCommunicationPlan(intent, context);
      case 'data_process':
        return this.generateDataProcessPlan(intent, context);
      default:
        return this.generateGenericPlan(intent, context);
    }
  }

  private generateFileOrganizePlan(
    intent: UserIntent,
    context?: ExtendedPerceptionContext
  ): ExecutionPlan {
    const steps: PlanStep[] = [];
    const fileEvents = context?.fileEvents || [];

    // 如果有新下载的文件
    if (fileEvents.length > 0) {
      const newFiles = fileEvents.filter(e => e.type === 'create');

      for (const file of newFiles.slice(0, 5)) {
        steps.push({
          order: steps.length + 1,
          description: `分析文件: ${file.path}`,
          actionType: 'file_read',
          params: { path: file.path },
          reversible: true,
          riskLevel: 'low',
        });
      }

      steps.push({
        order: steps.length + 1,
        description: '根据文件类型建议整理位置',
        actionType: 'notification',
        params: { message: '文件分析完成，请确认整理方案' },
        reversible: true,
        riskLevel: 'low',
      });
    } else {
      steps.push({
        order: 1,
        description: '扫描下载文件夹',
        actionType: 'shell',
        params: { command: 'ls -la ~/Downloads' },
        reversible: true,
        riskLevel: 'low',
      });

      steps.push({
        order: 2,
        description: '分析文件类型和大小',
        actionType: 'notification',
        params: { message: '正在分析文件...' },
        reversible: true,
        riskLevel: 'low',
      });
    }

    return this.createPlan(
      '整理文件',
      '自动分析并整理下载文件夹中的文件',
      intent,
      steps,
      ['自动按类型分类', '减少手动整理时间', '保持文件夹整洁'],
      ['需要确认移动位置', '大文件移动可能需要时间']
    );
  }

  private generateCodeAssistPlan(
    intent: UserIntent,
    context?: ExtendedPerceptionContext
  ): ExecutionPlan {
    const steps: PlanStep[] = [];
    const clipboard = context?.clipboard || '';

    if (clipboard && clipboard.length > 10) {
      steps.push({
        order: 1,
        description: '分析剪贴板中的代码',
        actionType: 'notification',
        params: { message: '正在分析代码...' },
        reversible: true,
        riskLevel: 'low',
      });

      steps.push({
        order: 2,
        description: '生成代码建议',
        actionType: 'notification',
        params: { message: '代码分析完成' },
        reversible: true,
        riskLevel: 'low',
      });
    } else {
      steps.push({
        order: 1,
        description: '监听代码编辑',
        actionType: 'notification',
        params: { message: '准备提供代码辅助' },
        reversible: true,
        riskLevel: 'low',
      });
    }

    return this.createPlan(
      '代码辅助',
      '分析当前代码并提供改进建议',
      intent,
      steps,
      ['实时代码分析', '智能补全建议', '错误检测'],
      ['需要代码上下文', '建议可能需要调整']
    );
  }

  private generateAutomationPlan(
    intent: UserIntent,
    context?: ExtendedPerceptionContext
  ): ExecutionPlan {
    const steps: PlanStep[] = [
      {
        order: 1,
        description: '分析重复操作模式',
        actionType: 'notification',
        params: { message: '检测到重复操作，正在分析...' },
        reversible: true,
        riskLevel: 'low',
      },
      {
        order: 2,
        description: '生成自动化脚本',
        actionType: 'notification',
        params: { message: '自动化脚本已生成' },
        reversible: true,
        riskLevel: 'low',
      },
      {
        order: 3,
        description: '等待用户确认执行',
        actionType: 'notification',
        params: { message: '请确认是否执行自动化' },
        reversible: true,
        riskLevel: 'medium',
      },
    ];

    return this.createPlan(
      '创建自动化',
      '将重复操作转换为自动化脚本',
      intent,
      steps,
      ['节省重复操作时间', '减少人为错误', '可复用'],
      ['首次执行需要验证', '可能需要调整参数'],
      [
        {
          description: '手动记录步骤后创建',
          difference: '用户主动记录操作步骤',
          pros: ['更精确控制'],
          cons: ['需要手动操作'],
        },
      ]
    );
  }

  private generateSearchPlan(
    intent: UserIntent,
    context?: ExtendedPerceptionContext
  ): ExecutionPlan {
    const steps: PlanStep[] = [
      {
        order: 1,
        description: '分析搜索上下文',
        actionType: 'notification',
        params: { message: '正在理解搜索意图...' },
        reversible: true,
        riskLevel: 'low',
      },
      {
        order: 2,
        description: '优化搜索关键词',
        actionType: 'notification',
        params: { message: '搜索建议已生成' },
        reversible: true,
        riskLevel: 'low',
      },
    ];

    return this.createPlan(
      '智能搜索',
      '优化搜索关键词并汇总结果',
      intent,
      steps,
      ['更精准的搜索结果', '自动汇总信息'],
      ['需要网络连接']
    );
  }

  private generateCommunicationPlan(
    intent: UserIntent,
    context?: ExtendedPerceptionContext
  ): ExecutionPlan {
    const steps: PlanStep[] = [
      {
        order: 1,
        description: '分析写作上下文',
        actionType: 'notification',
        params: { message: '正在分析写作内容...' },
        reversible: true,
        riskLevel: 'low',
      },
      {
        order: 2,
        description: '生成写作建议',
        actionType: 'notification',
        params: { message: '写作建议已生成' },
        reversible: true,
        riskLevel: 'low',
      },
    ];

    return this.createPlan(
      '写作辅助',
      '提供写作建议和文本优化',
      intent,
      steps,
      ['语法检查', '风格优化', '内容建议'],
      ['建议可能需要人工调整']
    );
  }

  private generateDataProcessPlan(
    intent: UserIntent,
    context?: ExtendedPerceptionContext
  ): ExecutionPlan {
    const steps: PlanStep[] = [
      {
        order: 1,
        description: '分析数据结构',
        actionType: 'notification',
        params: { message: '正在分析数据...' },
        reversible: true,
        riskLevel: 'low',
      },
      {
        order: 2,
        description: '生成数据处理建议',
        actionType: 'notification',
        params: { message: '数据分析完成' },
        reversible: true,
        riskLevel: 'low',
      },
    ];

    return this.createPlan(
      '数据处理',
      '分析数据并提供处理建议',
      intent,
      steps,
      ['自动数据分析', '可视化建议', '处理脚本生成'],
      ['大数据集处理可能较慢']
    );
  }

  private generateGenericPlan(
    intent: UserIntent,
    context?: ExtendedPerceptionContext
  ): ExecutionPlan {
    const steps: PlanStep[] = [
      {
        order: 1,
        description: '分析当前上下文',
        actionType: 'notification',
        params: { message: `正在分析: ${intent.description}` },
        reversible: true,
        riskLevel: 'low',
      },
      {
        order: 2,
        description: '生成操作建议',
        actionType: 'notification',
        params: { message: '建议已生成' },
        reversible: true,
        riskLevel: 'low',
      },
    ];

    return this.createPlan(
      intent.description,
      `根据上下文提供帮助: ${intent.description}`,
      intent,
      steps,
      ['智能分析', '个性化建议'],
      ['可能需要更多上下文']
    );
  }

  // ============ AI 增强 ============

  private async enhanceWithAI(
    plan: ExecutionPlan,
    intent: UserIntent,
    context?: ExtendedPerceptionContext
  ): Promise<ExecutionPlan> {
    if (!this.aiManager) return plan;

    const contextDesc = this.buildContextDescription(context);

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `你是 Hawkeye 计划优化器。根据用户意图和上下文，优化执行计划。

输出格式（JSON）:
{
  "title": "优化后的标题",
  "description": "优化后的描述",
  "steps": [
    {
      "order": 1,
      "description": "步骤描述",
      "actionType": "shell|file_read|file_write|...",
      "params": {},
      "reversible": true,
      "riskLevel": "low|medium|high"
    }
  ],
  "pros": ["优点1", "优点2"],
  "cons": ["缺点1"],
  "alternatives": [
    {
      "description": "替代方案",
      "difference": "与主方案差异",
      "pros": ["优点"],
      "cons": ["缺点"]
    }
  ]
}

动作类型: shell, file_read, file_write, file_move, file_delete, file_copy, folder_create, url_open, app_open, notification, wait

只返回 JSON，不要其他内容。`,
      },
      {
        role: 'user',
        content: `意图: ${intent.type} - ${intent.description}
置信度: ${intent.confidence}

当前上下文:
${contextDesc}

当前计划:
${JSON.stringify(plan, null, 2)}

请优化这个计划:`,
      },
    ];

    try {
      const response = await this.aiManager.chat(messages);
      const enhanced = this.parseAIPlanResponse(response.text, plan, intent);
      return enhanced;
    } catch (error) {
      console.warn('AI 计划优化出错:', error);
      return plan;
    }
  }

  private parseAIPlanResponse(
    text: string,
    originalPlan: ExecutionPlan,
    intent: UserIntent
  ): ExecutionPlan {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return originalPlan;

      const data = JSON.parse(jsonMatch[0]);

      return {
        ...originalPlan,
        title: data.title || originalPlan.title,
        description: data.description || originalPlan.description,
        steps: (data.steps || originalPlan.steps).map((step: any, index: number) => ({
          order: index + 1,
          description: step.description || '',
          actionType: this.validateActionType(step.actionType),
          params: step.params || {},
          reversible: step.reversible !== false,
          riskLevel: this.validateRiskLevel(step.riskLevel),
          rollback: step.rollback,
        })),
        pros: data.pros || originalPlan.pros,
        cons: data.cons || originalPlan.cons,
        alternatives: data.alternatives?.slice(0, this.config.maxAlternatives) || originalPlan.alternatives,
      };
    } catch {
      return originalPlan;
    }
  }

  // ============ 辅助方法 ============

  private createPlan(
    title: string,
    description: string,
    intent: UserIntent,
    steps: PlanStep[],
    pros: string[],
    cons: string[],
    alternatives?: AlternativePlan[]
  ): ExecutionPlan {
    return {
      id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      description,
      intent,
      steps,
      pros,
      cons,
      alternatives,
      impact: this.analyzeImpact({ steps } as ExecutionPlan),
      requiresConfirmation: this.config.defaultRequiresConfirmation,
      createdAt: Date.now(),
    };
  }

  private analyzeImpact(plan: ExecutionPlan): PlanImpact {
    let filesAffected = 0;
    let systemChanges = false;
    let requiresNetwork = false;
    let fullyReversible = true;
    let estimatedDuration = 0;

    for (const step of plan.steps) {
      // 统计文件操作
      if (['file_write', 'file_move', 'file_delete', 'file_copy', 'folder_create'].includes(step.actionType)) {
        filesAffected++;
      }

      // 检查系统变更
      if (['system_config', 'app_open', 'app_close'].includes(step.actionType)) {
        systemChanges = true;
      }

      // 检查网络需求
      if (['url_open'].includes(step.actionType)) {
        requiresNetwork = true;
      }

      // 检查可回滚性
      if (!step.reversible) {
        fullyReversible = false;
      }

      // 估算时间
      const actionDurations: Record<string, number> = {
        shell: 5,
        file_read: 1,
        file_write: 2,
        file_move: 3,
        file_delete: 1,
        file_copy: 5,
        folder_create: 1,
        url_open: 2,
        app_open: 3,
        notification: 1,
        wait: 1,
      };
      estimatedDuration += actionDurations[step.actionType] || 2;
    }

    return {
      filesAffected,
      systemChanges,
      requiresNetwork,
      fullyReversible,
      estimatedDuration,
    };
  }

  private buildContextDescription(context?: ExtendedPerceptionContext): string {
    if (!context) return '无上下文';

    const parts: string[] = [];

    if (context.activeWindow) {
      parts.push(`应用: ${context.activeWindow.appName}`);
      parts.push(`窗口: ${context.activeWindow.title}`);
    }

    if (context.clipboard) {
      const preview = context.clipboard.length > 50
        ? context.clipboard.slice(0, 50) + '...'
        : context.clipboard;
      parts.push(`剪贴板: ${preview}`);
    }

    if (context.fileEvents && context.fileEvents.length > 0) {
      parts.push(`最近文件操作: ${context.fileEvents.length} 个`);
    }

    return parts.join('\n') || '无上下文';
  }

  private validateActionType(type: string): ActionType {
    const validTypes: ActionType[] = [
      'shell', 'file_read', 'file_write', 'file_move', 'file_delete',
      'file_copy', 'folder_create', 'url_open', 'app_open', 'app_close',
      'clipboard_set', 'notification', 'wait', 'condition', 'loop',
    ];

    return validTypes.includes(type as ActionType) ? type as ActionType : 'notification';
  }

  private validateRiskLevel(level: string): 'low' | 'medium' | 'high' {
    if (level === 'medium' || level === 'high') return level;
    return 'low';
  }
}
