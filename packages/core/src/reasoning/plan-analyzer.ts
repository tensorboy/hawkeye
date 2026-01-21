/**
 * Plan Analyzer - 计划分析器
 * 提供深度的计划优缺点、风险和习惯匹配分析
 */

import { EventEmitter } from 'events';
import type { ExecutionPlan, PlanStep, AlternativePlan, ActionType } from '../ai/types';
import type { UserHabitProfile, WorkflowHabit } from '../behavior/habit-learner';

// ============ 分析结果类型 ============

export interface ProPoint {
  point: string;
  importance: 'high' | 'medium' | 'low';
  explanation: string;
}

export interface ConPoint {
  point: string;
  severity: 'high' | 'medium' | 'low';
  explanation: string;
  mitigation?: string;
}

export interface RiskAssessment {
  risk: string;
  probability: number;
  impact: 'high' | 'medium' | 'low';
  mitigation: string;
}

export interface ImpactScope {
  filesAffected: string[];
  appsAffected: string[];
  systemChanges: string[];
  dataChanges: string[];
  reversibility: 'fully' | 'partially' | 'irreversible';
}

export interface HabitAlignment {
  score: number;
  alignedHabits: string[];
  conflictingHabits: string[];
}

export interface EfficiencyMetrics {
  automationLevel: number;
  userInteractionCount: number;
  timeComparedToManual: number;
}

export interface PlanAnalysis {
  pros: ProPoint[];
  cons: ConPoint[];
  risks: RiskAssessment[];
  impactScope: ImpactScope;
  habitAlignment: HabitAlignment;
  efficiencyMetrics: EfficiencyMetrics;
  overallScore: number;
  recommendation: 'proceed' | 'caution' | 'avoid';
  analysisTimestamp: number;
}

export interface PlanComparisonResult {
  primaryPlan: {
    id: string;
    score: number;
    strengths: string[];
    weaknesses: string[];
  };
  alternatives: Array<{
    id: string;
    score: number;
    betterAt: string[];
    worseAt: string[];
  }>;
  recommendation: string;
}

// ============ 计划分析器实现 ============

export class PlanAnalyzer extends EventEmitter {
  private userProfile: UserHabitProfile | null = null;

  constructor() {
    super();
  }

  /**
   * 设置用户习惯档案
   */
  setUserProfile(profile: UserHabitProfile): void {
    this.userProfile = profile;
  }

  /**
   * 完整分析计划
   */
  analyze(plan: ExecutionPlan): PlanAnalysis {
    const pros = this.analyzePros(plan);
    const cons = this.analyzeCons(plan);
    const risks = this.analyzeRisks(plan);
    const impactScope = this.analyzeImpactScope(plan);
    const habitAlignment = this.analyzeHabitAlignment(plan);
    const efficiencyMetrics = this.calculateEfficiencyMetrics(plan);

    // 计算总体评分
    const overallScore = this.calculateOverallScore({
      pros,
      cons,
      risks,
      impactScope,
      habitAlignment,
      efficiencyMetrics,
    });

    // 生成建议
    const recommendation = this.generateRecommendation(overallScore, risks);

    const analysis: PlanAnalysis = {
      pros,
      cons,
      risks,
      impactScope,
      habitAlignment,
      efficiencyMetrics,
      overallScore,
      recommendation,
      analysisTimestamp: Date.now(),
    };

    this.emit('analyzed', analysis);
    return analysis;
  }

  /**
   * 比较多个计划
   */
  comparePlans(primaryPlan: ExecutionPlan, alternatives: ExecutionPlan[]): PlanComparisonResult {
    const primaryAnalysis = this.analyze(primaryPlan);
    const alternativeAnalyses = alternatives.map((alt) => this.analyze(alt));

    const primaryStrengths: string[] = [];
    const primaryWeaknesses: string[] = [];
    const alternativeComparisons: PlanComparisonResult['alternatives'] = [];

    // 比较每个替代方案
    for (let i = 0; i < alternatives.length; i++) {
      const altAnalysis = alternativeAnalyses[i];
      const betterAt: string[] = [];
      const worseAt: string[] = [];

      // 比较效率
      if (altAnalysis.efficiencyMetrics.automationLevel > primaryAnalysis.efficiencyMetrics.automationLevel) {
        betterAt.push('Higher automation level');
      } else if (altAnalysis.efficiencyMetrics.automationLevel < primaryAnalysis.efficiencyMetrics.automationLevel) {
        worseAt.push('Lower automation level');
      }

      // 比较风险
      const primaryRiskScore = this.calculateRiskScore(primaryAnalysis.risks);
      const altRiskScore = this.calculateRiskScore(altAnalysis.risks);
      if (altRiskScore < primaryRiskScore) {
        betterAt.push('Lower risk');
      } else if (altRiskScore > primaryRiskScore) {
        worseAt.push('Higher risk');
      }

      // 比较习惯匹配
      if (altAnalysis.habitAlignment.score > primaryAnalysis.habitAlignment.score) {
        betterAt.push('Better matches your habits');
      } else if (altAnalysis.habitAlignment.score < primaryAnalysis.habitAlignment.score) {
        worseAt.push('Conflicts with your habits');
      }

      // 比较用户交互
      if (altAnalysis.efficiencyMetrics.userInteractionCount < primaryAnalysis.efficiencyMetrics.userInteractionCount) {
        betterAt.push('Requires less interaction');
      } else if (altAnalysis.efficiencyMetrics.userInteractionCount > primaryAnalysis.efficiencyMetrics.userInteractionCount) {
        worseAt.push('Requires more interaction');
      }

      alternativeComparisons.push({
        id: alternatives[i].id,
        score: altAnalysis.overallScore,
        betterAt,
        worseAt,
      });
    }

    // 确定主方案优缺点
    primaryAnalysis.pros.forEach((p) => {
      if (p.importance === 'high') {
        primaryStrengths.push(p.point);
      }
    });
    primaryAnalysis.cons.forEach((c) => {
      if (c.severity === 'high') {
        primaryWeaknesses.push(c.point);
      }
    });

    // 生成推荐
    const bestAlt = alternativeComparisons.reduce((best, curr) =>
      curr.score > best.score ? curr : best,
      { score: 0, id: '', betterAt: [], worseAt: [] }
    );

    let recommendation: string;
    if (primaryAnalysis.overallScore >= bestAlt.score) {
      recommendation = 'The primary plan is recommended as the best option.';
    } else {
      const alt = alternatives.find((a) => a.id === bestAlt.id);
      recommendation = `Consider alternative "${alt?.title || bestAlt.id}" which scores higher.`;
    }

    return {
      primaryPlan: {
        id: primaryPlan.id,
        score: primaryAnalysis.overallScore,
        strengths: primaryStrengths,
        weaknesses: primaryWeaknesses,
      },
      alternatives: alternativeComparisons,
      recommendation,
    };
  }

  // ============ 分析方法 ============

  private analyzePros(plan: ExecutionPlan): ProPoint[] {
    const pros: ProPoint[] = [];

    // 分析已有的 pros
    if (plan.pros) {
      plan.pros.forEach((pro, index) => {
        pros.push({
          point: pro,
          importance: index === 0 ? 'high' : 'medium',
          explanation: `This benefit directly addresses your needs.`,
        });
      });
    }

    // 分析步骤得出额外优点
    const reversibleSteps = plan.steps.filter((s) => s.reversible).length;
    if (reversibleSteps === plan.steps.length) {
      pros.push({
        point: 'Fully reversible',
        importance: 'high',
        explanation: 'All actions can be undone if needed.',
      });
    } else if (reversibleSteps > plan.steps.length * 0.8) {
      pros.push({
        point: 'Mostly reversible',
        importance: 'medium',
        explanation: `${reversibleSteps} out of ${plan.steps.length} steps can be undone.`,
      });
    }

    // 检查自动化程度
    const automatedSteps = plan.steps.filter(
      (s) => !s.actionType.includes('notification') && !s.actionType.includes('wait')
    ).length;
    if (automatedSteps > plan.steps.length * 0.7) {
      pros.push({
        point: 'High automation',
        importance: 'high',
        explanation: 'Most of the work will be done automatically.',
      });
    }

    // 检查是否有风险检查步骤
    const hasValidation = plan.steps.some(
      (s) => s.description.toLowerCase().includes('验证') ||
             s.description.toLowerCase().includes('检查') ||
             s.description.toLowerCase().includes('validate') ||
             s.description.toLowerCase().includes('check')
    );
    if (hasValidation) {
      pros.push({
        point: 'Built-in validation',
        importance: 'medium',
        explanation: 'The plan includes steps to verify the results.',
      });
    }

    return pros;
  }

  private analyzeCons(plan: ExecutionPlan): ConPoint[] {
    const cons: ConPoint[] = [];

    // 分析已有的 cons
    if (plan.cons) {
      plan.cons.forEach((con, index) => {
        cons.push({
          point: con,
          severity: index === 0 ? 'medium' : 'low',
          explanation: `This limitation may affect the outcome.`,
        });
      });
    }

    // 检查高风险步骤
    const highRiskSteps = plan.steps.filter((s) => s.riskLevel === 'high');
    if (highRiskSteps.length > 0) {
      cons.push({
        point: `Contains ${highRiskSteps.length} high-risk step(s)`,
        severity: 'high',
        explanation: 'These steps may have significant consequences if something goes wrong.',
        mitigation: 'Review each high-risk step carefully before proceeding.',
      });
    }

    // 检查不可逆步骤
    const irreversibleSteps = plan.steps.filter((s) => !s.reversible);
    if (irreversibleSteps.length > 0) {
      cons.push({
        point: `${irreversibleSteps.length} step(s) cannot be undone`,
        severity: irreversibleSteps.length > 2 ? 'high' : 'medium',
        explanation: 'Some changes are permanent and cannot be reversed.',
        mitigation: 'Make sure to backup any important data before proceeding.',
      });
    }

    // 检查是否需要额外权限
    const shellCommands = plan.steps.filter((s) => s.actionType === 'shell');
    if (shellCommands.length > 3) {
      cons.push({
        point: 'Requires multiple shell commands',
        severity: 'medium',
        explanation: 'The plan needs to execute several shell commands.',
        mitigation: 'Review the commands in the steps section.',
      });
    }

    // 检查时间估算
    if (plan.impact?.estimatedDuration && plan.impact.estimatedDuration > 60) {
      cons.push({
        point: `Takes over ${Math.ceil(plan.impact.estimatedDuration / 60)} minutes`,
        severity: 'low',
        explanation: 'This plan may take a while to complete.',
      });
    }

    return cons;
  }

  private analyzeRisks(plan: ExecutionPlan): RiskAssessment[] {
    const risks: RiskAssessment[] = [];

    // 检查文件删除风险
    const deleteSteps = plan.steps.filter(
      (s) => s.actionType === 'file_delete' || s.actionType === 'folder_delete'
    );
    if (deleteSteps.length > 0) {
      risks.push({
        risk: 'Data loss from file deletion',
        probability: 0.2,
        impact: 'high',
        mitigation: 'Ensure backups exist or move to trash instead of permanent delete.',
      });
    }

    // 检查系统配置更改
    const systemSteps = plan.steps.filter(
      (s) => s.actionType === 'shell' &&
             (s.params?.command?.toString().includes('sudo') ||
              s.params?.command?.toString().includes('chmod') ||
              s.params?.command?.toString().includes('chown'))
    );
    if (systemSteps.length > 0) {
      risks.push({
        risk: 'System configuration changes',
        probability: 0.3,
        impact: 'high',
        mitigation: 'Review system-level commands carefully.',
      });
    }

    // 检查网络操作风险
    const networkSteps = plan.steps.filter(
      (s) => s.actionType === 'url_open' || s.actionType.includes('api')
    );
    if (networkSteps.length > 0) {
      risks.push({
        risk: 'Network dependency',
        probability: 0.1,
        impact: 'low',
        mitigation: 'Ensure stable network connection.',
      });
    }

    // 检查多步骤复杂度风险
    if (plan.steps.length > 10) {
      risks.push({
        risk: 'Complex multi-step execution',
        probability: 0.15,
        impact: 'medium',
        mitigation: 'Consider breaking into smaller tasks.',
      });
    }

    // 检查并行执行风险
    const hasParallel = plan.steps.some((s) => s.actionType === 'loop');
    if (hasParallel) {
      risks.push({
        risk: 'Parallel execution conflicts',
        probability: 0.1,
        impact: 'medium',
        mitigation: 'Monitor for resource conflicts during execution.',
      });
    }

    return risks;
  }

  private analyzeImpactScope(plan: ExecutionPlan): ImpactScope {
    const filesAffected: Set<string> = new Set();
    const appsAffected: Set<string> = new Set();
    const systemChanges: string[] = [];
    const dataChanges: string[] = [];

    for (const step of plan.steps) {
      // 收集受影响的文件
      if (
        ['file_read', 'file_write', 'file_move', 'file_delete', 'file_copy'].includes(
          step.actionType
        )
      ) {
        const path = step.params?.path || step.params?.source || step.params?.target;
        if (path) {
          filesAffected.add(String(path));
        }
      }

      // 收集受影响的应用
      if (step.actionType === 'app_open' || step.actionType === 'app_close') {
        const app = step.params?.app || step.params?.name;
        if (app) {
          appsAffected.add(String(app));
        }
      }

      // 检测系统变更
      if (step.actionType === 'shell') {
        const cmd = String(step.params?.command || '');
        if (cmd.includes('sudo') || cmd.includes('systemctl') || cmd.includes('launchctl')) {
          systemChanges.push(step.description);
        }
      }

      // 检测数据变更
      if (['file_write', 'file_delete', 'file_move'].includes(step.actionType)) {
        dataChanges.push(step.description);
      }
    }

    // 确定可逆性
    const irreversibleCount = plan.steps.filter((s) => !s.reversible).length;
    let reversibility: 'fully' | 'partially' | 'irreversible';
    if (irreversibleCount === 0) {
      reversibility = 'fully';
    } else if (irreversibleCount < plan.steps.length / 2) {
      reversibility = 'partially';
    } else {
      reversibility = 'irreversible';
    }

    return {
      filesAffected: Array.from(filesAffected),
      appsAffected: Array.from(appsAffected),
      systemChanges,
      dataChanges,
      reversibility,
    };
  }

  private analyzeHabitAlignment(plan: ExecutionPlan): HabitAlignment {
    if (!this.userProfile) {
      return {
        score: 0.5,
        alignedHabits: [],
        conflictingHabits: [],
      };
    }

    const alignedHabits: string[] = [];
    const conflictingHabits: string[] = [];
    let alignmentScore = 0.5;

    // 检查与工作流习惯的匹配
    for (const workflow of this.userProfile.workflowHabits) {
      const matchingSteps = plan.steps.filter((s) =>
        workflow.actions.some(
          (a) =>
            a.type === s.actionType ||
            s.description.toLowerCase().includes(workflow.name.toLowerCase())
        )
      );

      if (matchingSteps.length > 0) {
        alignedHabits.push(`Matches workflow: ${workflow.name}`);
        alignmentScore += 0.1;
      }
    }

    // 检查时间偏好
    const now = new Date();
    const hour = now.getHours();
    const { start, end } = this.userProfile.timePreferences.preferredWorkHours;

    if (hour >= start && hour < end) {
      alignedHabits.push('Within your preferred work hours');
      alignmentScore += 0.1;
    } else {
      conflictingHabits.push('Outside your usual work hours');
      alignmentScore -= 0.05;
    }

    // 检查应用使用习惯
    for (const step of plan.steps) {
      if (step.actionType === 'app_open') {
        const appName = String(step.params?.app || step.params?.name || '');
        const habit = this.userProfile.appUsageHabits.get(appName);
        if (habit && habit.usage.sessionCount > 10) {
          alignedHabits.push(`Uses familiar app: ${appName}`);
          alignmentScore += 0.05;
        }
      }
    }

    // 限制分数范围
    alignmentScore = Math.max(0, Math.min(1, alignmentScore));

    return {
      score: alignmentScore,
      alignedHabits,
      conflictingHabits,
    };
  }

  private calculateEfficiencyMetrics(plan: ExecutionPlan): EfficiencyMetrics {
    // 计算自动化程度
    const automatedActions = ['shell', 'file_read', 'file_write', 'file_move', 'file_copy', 'url_open', 'app_open'];
    const automatedSteps = plan.steps.filter((s) => automatedActions.includes(s.actionType));
    const automationLevel = plan.steps.length > 0 ? automatedSteps.length / plan.steps.length : 0;

    // 计算用户交互次数
    const interactionActions = ['notification', 'wait', 'condition'];
    const userInteractionCount = plan.steps.filter(
      (s) => interactionActions.includes(s.actionType) || s.params?.requiresConfirmation
    ).length;

    // 估算与手动操作相比节省的时间
    const estimatedAutomatedTime = plan.impact?.estimatedDuration || plan.steps.length * 2;
    const estimatedManualTime = plan.steps.length * 30; // 假设手动每步30秒
    const timeComparedToManual = 1 - (estimatedAutomatedTime / estimatedManualTime);

    return {
      automationLevel,
      userInteractionCount,
      timeComparedToManual: Math.max(0, Math.min(1, timeComparedToManual)),
    };
  }

  private calculateOverallScore(analysis: Omit<PlanAnalysis, 'overallScore' | 'recommendation' | 'analysisTimestamp'>): number {
    let score = 50;

    // 优点加分
    for (const pro of analysis.pros) {
      switch (pro.importance) {
        case 'high':
          score += 10;
          break;
        case 'medium':
          score += 5;
          break;
        case 'low':
          score += 2;
          break;
      }
    }

    // 缺点减分
    for (const con of analysis.cons) {
      switch (con.severity) {
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 7;
          break;
        case 'low':
          score -= 3;
          break;
      }
    }

    // 风险减分
    for (const risk of analysis.risks) {
      const riskImpact = risk.impact === 'high' ? 10 : risk.impact === 'medium' ? 5 : 2;
      score -= riskImpact * risk.probability;
    }

    // 效率加分
    score += analysis.efficiencyMetrics.automationLevel * 10;
    score += analysis.efficiencyMetrics.timeComparedToManual * 10;
    score -= analysis.efficiencyMetrics.userInteractionCount * 2;

    // 习惯匹配加分
    score += (analysis.habitAlignment.score - 0.5) * 20;

    // 可逆性加分
    if (analysis.impactScope.reversibility === 'fully') {
      score += 5;
    } else if (analysis.impactScope.reversibility === 'irreversible') {
      score -= 10;
    }

    // 限制分数范围
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private calculateRiskScore(risks: RiskAssessment[]): number {
    return risks.reduce((total, risk) => {
      const impactWeight = risk.impact === 'high' ? 3 : risk.impact === 'medium' ? 2 : 1;
      return total + risk.probability * impactWeight;
    }, 0);
  }

  private generateRecommendation(score: number, risks: RiskAssessment[]): 'proceed' | 'caution' | 'avoid' {
    const highRisks = risks.filter((r) => r.impact === 'high' && r.probability > 0.3);

    if (highRisks.length > 0) {
      return 'avoid';
    }

    if (score >= 70) {
      return 'proceed';
    } else if (score >= 40) {
      return 'caution';
    } else {
      return 'avoid';
    }
  }

  /**
   * 生成人类可读的分析报告
   */
  generateReport(analysis: PlanAnalysis): string {
    const lines: string[] = [];

    lines.push('## Plan Analysis Report');
    lines.push('');
    lines.push(`**Overall Score**: ${analysis.overallScore}/100`);
    lines.push(`**Recommendation**: ${analysis.recommendation.toUpperCase()}`);
    lines.push('');

    lines.push('### Pros');
    for (const pro of analysis.pros) {
      lines.push(`- **[${pro.importance.toUpperCase()}]** ${pro.point}`);
      lines.push(`  ${pro.explanation}`);
    }
    lines.push('');

    lines.push('### Cons');
    for (const con of analysis.cons) {
      lines.push(`- **[${con.severity.toUpperCase()}]** ${con.point}`);
      lines.push(`  ${con.explanation}`);
      if (con.mitigation) {
        lines.push(`  *Mitigation*: ${con.mitigation}`);
      }
    }
    lines.push('');

    lines.push('### Risks');
    for (const risk of analysis.risks) {
      lines.push(`- **${risk.risk}** (${Math.round(risk.probability * 100)}% probability, ${risk.impact} impact)`);
      lines.push(`  *Mitigation*: ${risk.mitigation}`);
    }
    lines.push('');

    lines.push('### Impact Scope');
    lines.push(`- Files affected: ${analysis.impactScope.filesAffected.length}`);
    lines.push(`- Apps affected: ${analysis.impactScope.appsAffected.length}`);
    lines.push(`- Reversibility: ${analysis.impactScope.reversibility}`);
    lines.push('');

    lines.push('### Efficiency');
    lines.push(`- Automation level: ${Math.round(analysis.efficiencyMetrics.automationLevel * 100)}%`);
    lines.push(`- User interactions needed: ${analysis.efficiencyMetrics.userInteractionCount}`);
    lines.push(`- Time saved vs manual: ${Math.round(analysis.efficiencyMetrics.timeComparedToManual * 100)}%`);

    return lines.join('\n');
  }
}
