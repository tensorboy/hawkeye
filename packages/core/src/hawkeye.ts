/**
 * Hawkeye 统一引擎
 * 整合所有模块：感知、AI、推理、执行、存储、同步
 */

import { EventEmitter } from 'events';
import { PerceptionEngine, type PerceptionEngineConfig } from './perception/engine';
import { AIManager, createAIManager, type AIManagerConfig, type AIProviderConfig } from './ai';
import { IntentEngine, type IntentEngineConfig } from './reasoning/intent-engine';
import { PlanGenerator, type PlanGeneratorConfig } from './reasoning/plan-generator';
import { PlanExecutor, type PlanExecutorConfig, type PlanExecution } from './execution/plan-executor';
import { HawkeyeDatabase, type DatabaseConfig } from './storage/database';
import { VectorStore, type VectorStoreConfig, createAIEmbedFunction } from './storage/vector-store';
import { SyncServer, type SyncConfig } from './sync';
import type {
  UserIntent,
  ExecutionPlan,
  AIMessage,
} from './ai/types';

export interface HawkeyeConfig {
  /** AI Provider 配置 */
  ai: {
    providers: AIProviderConfig[];
    preferredProvider?: 'ollama' | 'gemini';
    enableFailover?: boolean;
  };

  /** 感知配置 */
  perception?: PerceptionEngineConfig;

  /** 存储配置 */
  storage?: {
    database?: DatabaseConfig;
    vectorStore?: VectorStoreConfig;
  };

  /** 同步配置 */
  sync?: SyncConfig;

  /** 是否自动启动 WebSocket 服务器 */
  autoStartSync?: boolean;

  /** 是否启用 AI 嵌入 */
  enableAIEmbedding?: boolean;
}

export interface HawkeyeStatus {
  initialized: boolean;
  aiReady: boolean;
  aiProvider: string | null;
  syncRunning: boolean;
  syncPort: number | null;
  connectedClients: number;
}

export class Hawkeye extends EventEmitter {
  private config: HawkeyeConfig;
  private perception: PerceptionEngine;
  private aiManager: AIManager | null = null;
  private intentEngine: IntentEngine;
  private planGenerator: PlanGenerator;
  private planExecutor: PlanExecutor;
  private database: HawkeyeDatabase;
  private vectorStore: VectorStore;
  private syncServer: SyncServer | null = null;

  private _initialized: boolean = false;
  private currentIntents: UserIntent[] = [];
  private currentPlan: ExecutionPlan | null = null;

  constructor(config: HawkeyeConfig) {
    super();
    this.config = config;

    // 初始化各模块（非 async 部分）
    this.perception = new PerceptionEngine(config.perception);
    this.intentEngine = new IntentEngine({});
    this.planGenerator = new PlanGenerator({});
    this.planExecutor = new PlanExecutor({});
    this.database = new HawkeyeDatabase(config.storage?.database);
    this.vectorStore = new VectorStore(config.storage?.vectorStore);

    if (config.sync) {
      this.syncServer = new SyncServer(config.sync);
    }
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * 初始化所有模块
   */
  async initialize(): Promise<void> {
    this.emit('initializing');

    try {
      // 1. 初始化数据库
      await this.database.initialize();
      this.emit('module:ready', 'database');

      // 2. 初始化向量存储
      await this.vectorStore.initialize();
      this.emit('module:ready', 'vectorStore');

      // 3. 初始化 AI Manager
      const aiConfig: AIManagerConfig = {
        providers: this.config.ai.providers,
        preferredProvider: this.config.ai.preferredProvider,
        enableFailover: this.config.ai.enableFailover ?? true,
      };
      this.aiManager = createAIManager(aiConfig);

      this.aiManager.on('provider:ready', (type) => {
        this.emit('ai:provider:ready', type);
      });

      this.aiManager.on('provider:error', (info) => {
        this.emit('ai:provider:error', info);
      });

      await this.aiManager.initialize();
      this.emit('module:ready', 'ai');

      // 4. 配置 Intent Engine 和 Plan Generator 使用 AI
      this.intentEngine = new IntentEngine({
        aiManager: this.aiManager,
        useAI: true,
      });

      this.planGenerator = new PlanGenerator({
        aiManager: this.aiManager,
        useAI: true,
      });

      // 5. 配置 AI 嵌入函数（如果启用）
      if (this.config.enableAIEmbedding && this.aiManager) {
        const embedFunction = createAIEmbedFunction(
          async (messages) => {
            const aiMessages: AIMessage[] = messages.map(m => ({
              role: m.role as 'system' | 'user' | 'assistant',
              content: m.content,
            }));
            return this.aiManager!.chat(aiMessages);
          }
        );
        this.vectorStore = new VectorStore({
          ...this.config.storage?.vectorStore,
          embedFunction,
        });
        await this.vectorStore.initialize();
      }

      // 6. 设置执行器事件监听
      this.setupExecutorEvents();

      // 7. 启动同步服务器（如果配置）
      if (this.syncServer && this.config.autoStartSync !== false) {
        await this.syncServer.start();
        this.emit('module:ready', 'sync');

        // 设置同步服务器事件
        this.setupSyncEvents();
      }

      this._initialized = true;
      this.emit('ready');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 完整的感知-推理流程
   * 返回识别到的意图列表
   */
  async perceiveAndRecognize(): Promise<UserIntent[]> {
    if (!this._initialized) {
      throw new Error('Hawkeye 尚未初始化');
    }

    this.emit('perceiving');

    // 1. 感知当前上下文
    const context = await this.perception.perceive();

    // 2. 保存上下文到数据库
    this.database.saveContext({
      id: `ctx_${Date.now()}`,
      timestamp: Date.now(),
      activeWindow: context.activeWindow,
      clipboard: context.clipboard,
      screenshot: context.screenshot,
    });

    // 3. 识别意图
    const intents = await this.intentEngine.recognize(context);
    this.currentIntents = intents;

    // 4. 保存意图到数据库
    for (const intent of intents) {
      this.database.saveIntent({
        id: intent.id,
        type: intent.type,
        description: intent.description,
        confidence: intent.confidence,
        contextId: `ctx_${Date.now()}`,
        createdAt: Date.now(),
      });
    }

    // 5. 广播意图到客户端
    if (this.syncServer) {
      this.syncServer.broadcastIntentDetected({
        intents: intents.map(i => ({
          id: i.id,
          type: i.type,
          description: i.description,
          confidence: i.confidence,
          entities: i.entities,
        })),
        contextId: `ctx_${Date.now()}`,
      });
    }

    this.emit('intents:detected', intents);
    return intents;
  }

  /**
   * 为指定意图生成执行计划
   */
  async generatePlan(intent: UserIntent): Promise<ExecutionPlan> {
    if (!this._initialized) {
      throw new Error('Hawkeye 尚未初始化');
    }

    const context = await this.perception.perceive();
    const plan = await this.planGenerator.generate(intent, context);

    this.currentPlan = plan;

    // 保存计划到数据库
    this.database.savePlan({
      id: plan.id,
      intentId: intent.id,
      title: plan.title,
      description: plan.description,
      steps: plan.steps,
      impact: plan.impact,
      status: 'pending',
      createdAt: Date.now(),
    });

    // 广播计划到客户端
    if (this.syncServer) {
      this.syncServer.broadcastPlanGenerated({
        plan: {
          id: plan.id,
          title: plan.title,
          description: plan.description,
          steps: plan.steps.map(s => ({
            order: s.order,
            description: s.description,
            actionType: s.actionType,
            riskLevel: s.riskLevel,
          })),
          pros: plan.pros,
          cons: plan.cons,
          alternatives: plan.alternatives,
          impact: plan.impact,
        },
        intentId: intent.id,
      });
    }

    this.emit('plan:generated', plan);
    return plan;
  }

  /**
   * 执行计划
   */
  async executePlan(plan: ExecutionPlan): Promise<PlanExecution> {
    if (!this._initialized) {
      throw new Error('Hawkeye 尚未初始化');
    }

    const execution = await this.planExecutor.execute(plan);

    // 更新数据库
    this.database.savePlan({
      id: plan.id,
      intentId: plan.id.replace('plan_', 'intent_'),
      title: plan.title,
      description: plan.description,
      steps: plan.steps,
      impact: plan.impact,
      status: execution.status === 'completed' ? 'completed' : 'failed',
      createdAt: Date.now(),
    });

    this.emit('execution:completed', execution);
    return execution;
  }

  /**
   * 暂停执行
   */
  pauseExecution(planId: string): boolean {
    return this.planExecutor.pause(planId);
  }

  /**
   * 恢复执行
   */
  async resumeExecution(planId: string): Promise<PlanExecution | null> {
    return this.planExecutor.resume(planId);
  }

  /**
   * 取消执行
   */
  cancelExecution(planId: string): boolean {
    return this.planExecutor.cancel(planId);
  }

  /**
   * 回滚执行
   */
  async rollbackExecution(execution: PlanExecution): Promise<void> {
    return this.planExecutor.rollback(execution);
  }

  /**
   * 提供意图反馈（用于学习）
   */
  async provideIntentFeedback(
    intentId: string,
    feedback: 'accept' | 'reject' | 'irrelevant'
  ): Promise<void> {
    const intent = this.currentIntents.find(i => i.id === intentId);
    if (!intent) return;

    // 保存学习数据
    this.database.saveLearningData(
      'intent_feedback',
      {
        intentId,
        intentType: intent.type,
        feedback,
      },
      feedback === 'accept' ? 1 : feedback === 'reject' ? -1 : 0
    );

    this.emit('feedback:intent', { intentId, feedback });
  }

  /**
   * AI 对话
   */
  async chat(messages: AIMessage[]): Promise<string> {
    if (!this.aiManager) {
      throw new Error('AI Manager 未初始化');
    }

    const response = await this.aiManager.chat(messages);
    return response.text;
  }

  /**
   * 语义搜索
   */
  async semanticSearch(query: string, limit: number = 5) {
    return this.vectorStore.search(query, limit);
  }

  /**
   * 获取当前状态
   */
  getStatus(): HawkeyeStatus {
    return {
      initialized: this._initialized,
      aiReady: this.aiManager?.isReady ?? false,
      aiProvider: this.aiManager?.activeProvider ?? null,
      syncRunning: this.syncServer?.isRunning ?? false,
      syncPort: this.syncServer?.port ?? null,
      connectedClients: this.syncServer?.clientCount ?? 0,
    };
  }

  /**
   * 获取可用的 AI Provider
   */
  getAvailableProviders(): string[] {
    return this.aiManager?.getAvailableProviders() ?? [];
  }

  /**
   * 切换 AI Provider
   */
  switchAIProvider(type: 'ollama' | 'gemini'): boolean {
    return this.aiManager?.switchProvider(type) ?? false;
  }

  /**
   * 获取当前意图列表
   */
  getCurrentIntents(): UserIntent[] {
    return this.currentIntents;
  }

  /**
   * 获取当前计划
   */
  getCurrentPlan(): ExecutionPlan | null {
    return this.currentPlan;
  }

  /**
   * 获取数据库统计
   */
  getDatabaseStats() {
    return this.database.getStats();
  }

  /**
   * 清理旧数据
   */
  cleanupOldData(olderThanDays: number = 30): number {
    return this.database.cleanup(olderThanDays);
  }

  /**
   * 关闭引擎
   */
  async shutdown(): Promise<void> {
    this.emit('shutting_down');

    if (this.syncServer) {
      this.syncServer.stop();
    }

    if (this.aiManager) {
      await this.aiManager.terminate();
    }

    this.database.close();

    this._initialized = false;
    this.emit('shutdown');
  }

  // ============ 私有方法 ============

  private setupExecutorEvents(): void {
    this.planExecutor.on('step:start', (data) => {
      this.emit('execution:step:start', data);

      if (this.syncServer) {
        this.syncServer.broadcastExecutionProgress({
          executionId: data.planId,
          currentStep: data.step.order,
          totalSteps: this.currentPlan?.steps.length ?? 0,
          stepDescription: data.step.description,
          progress: (data.step.order / (this.currentPlan?.steps.length ?? 1)) * 100,
        });
      }
    });

    this.planExecutor.on('step:complete', (data) => {
      this.emit('execution:step:complete', data);
    });

    this.planExecutor.on('step:error', (data) => {
      this.emit('execution:step:error', data);
    });
  }

  private setupSyncEvents(): void {
    if (!this.syncServer) return;

    this.syncServer.on('client:connected', (info) => {
      this.emit('sync:client:connected', info);
    });

    this.syncServer.on('client:disconnected', (info) => {
      this.emit('sync:client:disconnected', info);
    });

    // 处理来自客户端的消息
    this.syncServer.on('message', async (message) => {
      try {
        await this.handleSyncMessage(message);
      } catch (error) {
        console.error('处理同步消息失败:', error);
      }
    });
  }

  private async handleSyncMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'context_request':
        // 客户端请求当前上下文
        const context = await this.perception.perceive();
        this.syncServer?.broadcastContextUpdate({
          contextId: `ctx_${Date.now()}`,
          activeWindow: context.activeWindow,
          clipboard: context.clipboard,
        });
        break;

      case 'intent_feedback':
        // 客户端反馈意图
        await this.provideIntentFeedback(
          message.payload.intentId,
          message.payload.feedback
        );
        break;

      case 'plan_confirm':
        // 客户端确认计划
        if (this.currentPlan) {
          await this.executePlan(this.currentPlan);
        }
        break;

      case 'plan_reject':
        // 客户端拒绝计划
        this.currentPlan = null;
        this.emit('plan:rejected', message.payload);
        break;

      case 'execution_pause':
        // 暂停执行
        this.pauseExecution(message.payload.executionId);
        break;

      case 'execution_resume':
        // 恢复执行
        await this.resumeExecution(message.payload.executionId);
        break;

      case 'execution_cancel':
        // 取消执行
        this.cancelExecution(message.payload.executionId);
        break;

      case 'status_request':
        // 状态请求
        const status = this.getStatus();
        this.syncServer?.broadcast('status', {
          connected: true,
          lastSeen: Date.now(),
          clientType: 'desktop',
          aiProvider: status.aiProvider,
          aiProviderStatus: status.aiReady ? 'available' : 'unavailable',
        });
        break;
    }
  }
}

// 单例
let hawkeyeInstance: Hawkeye | null = null;

export function getHawkeye(): Hawkeye | null {
  return hawkeyeInstance;
}

export function createHawkeye(config: HawkeyeConfig): Hawkeye {
  hawkeyeInstance = new Hawkeye(config);
  return hawkeyeInstance;
}
