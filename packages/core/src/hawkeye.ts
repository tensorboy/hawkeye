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
import { BehaviorTracker, type BehaviorTrackerOptions } from './behavior';
import { MemOSManager, type MemOSConfig } from './memory';
import { DashboardManager, type DashboardManagerConfig } from './dashboard';
import { WorkflowManager, type WorkflowManagerConfig } from './workflow';
import { PluginManager, type PluginManagerConfig } from './plugin';
import {
  SelfReflection,
  createSelfReflection,
  type SelfReflectionConfig,
} from './autonomous/self-reflection';
import {
  AutonomousManager,
  createAutonomousManager,
  type AutonomousConfig,
  type SuggestedAction,
  type AutonomousAnalysisResult,
} from './autonomous';
import { PermissionManager, AuditLogger } from './security';
import {
  ToolRegistry,
  getToolRegistry,
  MCPServer,
  registerBuiltinTools,
} from './mcp';
import {
  SkillManager,
} from './skills';
import {
  TaskQueue,
  createTaskQueue,
  TaskPriority,
  type TaskQueueConfig,
} from './queue';
import { EventCollector } from './debug';
import type {
  UserIntent,
  ExecutionPlan,
  AIMessage,
} from './ai/types';
import type { ExecutionResult } from './types';

export interface HawkeyeConfig {
  /** AI Provider 配置 */
  ai: {
    providers: AIProviderConfig[];
    preferredProvider?: 'llama-cpp' | 'gemini' | 'openai';
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

  /** 行为追踪配置 */
  behavior?: BehaviorTrackerOptions;

  /** 记忆系统配置 */
  memory?: MemOSConfig;

  /** Dashboard 配置 */
  dashboard?: DashboardManagerConfig;

  /** 工作流配置 */
  workflow?: WorkflowManagerConfig;

  /** 插件系统配置 */
  plugin?: PluginManagerConfig;

  /** 自主能力配置 */
  autonomous?: Partial<AutonomousConfig>;

  /** 是否自动启动 WebSocket 服务器 */
  autoStartSync?: boolean;

  /** 是否启用 AI 嵌入 */
  enableAIEmbedding?: boolean;

  /** 是否启用行为追踪 */
  enableBehaviorTracking?: boolean;

  /** 是否启用记忆系统 */
  enableMemory?: boolean;

  /** 是否启用 Dashboard */
  enableDashboard?: boolean;

  /** 是否启用工作流 */
  enableWorkflow?: boolean;

  /** 是否启用插件系统 */
  enablePlugins?: boolean;

  /** 是否启用自主能力 (无需 Prompt 的自动建议) */
  enableAutonomous?: boolean;

  /** 任务队列配置 */
  taskQueue?: Partial<TaskQueueConfig>;

  /** 是否启用任务队列 */
  enableTaskQueue?: boolean;
}

export interface HawkeyeStatus {
  initialized: boolean;
  aiReady: boolean;
  aiProvider: string | null;
  syncRunning: boolean;
  syncPort: number | null;
  connectedClients: number;
  behaviorTracking: boolean;
  memoryEnabled: boolean;
  dashboardEnabled: boolean;
  workflowEnabled: boolean;
  pluginsEnabled: boolean;
  loadedPlugins: number;
  autonomousEnabled: boolean;
  activeSuggestions: number;
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

  // 新增模块
  private behaviorTracker: BehaviorTracker | null = null;
  private memoryManager: MemOSManager | null = null;
  private dashboardManager: DashboardManager | null = null;
  private workflowManager: WorkflowManager | null = null;
  private pluginManager: PluginManager | null = null;
  private autonomousManager: AutonomousManager | null = null;
  private selfReflection: SelfReflection | null = null;
  private permissionManager: PermissionManager;
  private auditLogger: AuditLogger;
  private toolRegistry: ToolRegistry;
  private skillManager: SkillManager;
  private mcpServer: MCPServer | null = null;

  // 任务队列
  private taskQueue: TaskQueue | null = null;

  // 调试事件收集器
  private eventCollector: EventCollector;

  private _initialized: boolean = false;
  private _syncRunning: boolean = false;
  private _behaviorRunning: boolean = false;
  private currentIntents: UserIntent[] = [];
  private currentPlan: ExecutionPlan | null = null;

  constructor(config: HawkeyeConfig) {
    super();
    this.config = config;

    // 初始化核心模块（非 async 部分）
    this.perception = new PerceptionEngine(config.perception);
    this.intentEngine = new IntentEngine({});
    this.planGenerator = new PlanGenerator({});
    this.planExecutor = new PlanExecutor({}, this.perception);
    this.database = new HawkeyeDatabase(config.storage?.database);
    this.vectorStore = new VectorStore(config.storage?.vectorStore);

    // 初始化安全模块
    this.permissionManager = new PermissionManager();
    this.auditLogger = new AuditLogger();

    // 初始化 MCP 和 Skills
    this.toolRegistry = getToolRegistry();
    this.skillManager = new SkillManager(this.toolRegistry);

    // 初始化 MCP Server (如果配置)
    // 默认启用 stdio 模式，方便作为 MCP Server 运行
    this.mcpServer = new MCPServer(this.toolRegistry, {
      name: 'hawkeye',
      version: '1.0.0',
      transport: 'stdio'
    });

    // 初始化 SelfReflection (含 SEPO)
    this.selfReflection = createSelfReflection({}, this.vectorStore);

    if (config.sync) {
      this.syncServer = new SyncServer(config.sync);
    }

    // 初始化行为追踪器
    if (config.enableBehaviorTracking !== false) {
      this.behaviorTracker = new BehaviorTracker(config.behavior);
    }

    // 初始化记忆系统
    if (config.enableMemory !== false) {
      this.memoryManager = new MemOSManager(config.memory);
    }

    // 初始化 Dashboard
    if (config.enableDashboard !== false) {
      this.dashboardManager = new DashboardManager(config.dashboard);
    }

    // 初始化工作流管理器
    if (config.enableWorkflow !== false) {
      this.workflowManager = new WorkflowManager(config.workflow);
    }

    // 初始化插件管理器
    if (config.enablePlugins !== false) {
      this.pluginManager = new PluginManager(config.plugin);
    }

    // 初始化自主能力管理器
    if (config.enableAutonomous !== false) {
      this.autonomousManager = createAutonomousManager(config.autonomous);
    }

    // 初始化任务队列
    if (config.enableTaskQueue !== false) {
      this.taskQueue = createTaskQueue(config.taskQueue);
    }

    // 初始化调试事件收集器
    this.eventCollector = new EventCollector({
      maxEvents: 500,
      enableScreenshots: true,
      screenshotThumbnailSize: 200,
      truncateTextAt: 5000,
    });
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

      // 3.5 配置 Vision API OCR（使用已配置的 AI 提供商）
      if (this.aiManager && this.config.perception?.enableOCR !== false) {
        const ocrAnalyzeFunction = async (imageBase64: string): Promise<string> => {
          try {
            const messages: AIMessage[] = [{
              role: 'user',
              content: '请仔细识别并提取图片中的所有文字内容。只返回识别到的原始文字，按照从上到下、从左到右的顺序排列，每行文字单独一行。不要添加任何解释、标题或格式说明。如果图片中没有文字，返回空字符串。',
            }];
            const result = await this.aiManager!.chatWithVision(messages, [imageBase64]);
            return result.text || '';
          } catch (err) {
            console.warn('[Hawkeye] Vision API OCR failed:', err);
            return '';
          }
        };
        this.perception.setVisionAPIFunction(ocrAnalyzeFunction);
        console.log('[Hawkeye] ✓ Vision API OCR 已配置 (使用 AI Manager)');
      }

      // 3.6 启动感知引擎 (用于 Debug Timeline 事件收集)
      await this.perception.start();
      console.log('[Hawkeye] ✓ 感知引擎已启动');

      // 4. 配置 Intent Engine 和 Plan Generator 使用 AI
      this.intentEngine = new IntentEngine();
      this.intentEngine.setAIManager(this.aiManager);

      this.planGenerator = new PlanGenerator();
      this.planGenerator.setAIManager(this.aiManager);

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
        this._syncRunning = true;
        this.emit('module:ready', 'sync');

        // 设置同步服务器事件
        this.setupSyncEvents();
      }

      // 8. 初始化行为追踪器
      if (this.behaviorTracker) {
        await this.behaviorTracker.start();
        this._behaviorRunning = true;
        this.setupBehaviorEvents();
        this.emit('module:ready', 'behavior');
      }

      // 9. 初始化记忆系统
      if (this.memoryManager) {
        await this.memoryManager.initialize();
        this.setupMemoryEvents();
        this.emit('module:ready', 'memory');
      }

      // 10. 初始化 Dashboard (no async init needed, loads in constructor)
      if (this.dashboardManager) {
        this.dashboardManager.loadAll();
        this.setupDashboardEvents();
        this.emit('module:ready', 'dashboard');
      }

      // 11. 初始化工作流管理器 (no async init needed, loads in constructor)
      if (this.workflowManager) {
        this.workflowManager.loadAllWorkflows();
        this.setupWorkflowEvents();
        this.emit('module:ready', 'workflow');
      }

      // 12. 初始化插件系统
      if (this.pluginManager) {
        this.setupPluginEvents();
        this.emit('module:ready', 'plugin');
      }

      // 12.5 注册内置 MCP 工具并启动 MCP Server
      registerBuiltinTools(this.toolRegistry);
      console.log(`[Hawkeye] ✓ 已注册 ${this.toolRegistry.getAllTools().length} 个 MCP 工具`);

      if (this.mcpServer) {
        await this.mcpServer.start();
        this.emit('module:ready', 'mcp');
      }

      // 13. 初始化自主能力管理器
      if (this.autonomousManager) {
        this.autonomousManager.start();
        this.setupAutonomousEvents();
        this.emit('module:ready', 'autonomous');
      }

      // 14. 初始化任务队列
      if (this.taskQueue) {
        this.setupTaskQueue();
        this.emit('module:ready', 'taskQueue');
      }

      // 15. 设置调试事件收集
      this.setupDebugEvents();
      this.emit('module:ready', 'debug');

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

    // Generate context ID once to ensure foreign key consistency
    const now = Date.now();
    const contextId = `ctx_${now}`;

    // 1. 感知当前上下文
    const context = await this.perception.perceive();

    // 2. 保存上下文到数据库
    this.database.saveContext({
      id: contextId,
      timestamp: now,
      appName: context.activeWindow?.appName,
      windowTitle: context.activeWindow?.title,
      clipboard: context.clipboard,
      screenshot: context.screenshot?.imageData,
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
        contextId: contextId,
        createdAt: now,
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
        contextId: contextId,
      });
    }

    this.emit('intents:detected', intents);
    return intents;
  }

  /**
   * 获取最后的感知上下文
   * 包含截图和 OCR 结果
   */
  getLastContext(): {
    screenshot?: string;
    ocrText?: string;
    timestamp: number;
  } | null {
    const context = this.perception.getLastContext();
    if (!context) return null;

    return {
      screenshot: context.screenshot?.imageData,
      ocrText: context.ocr?.text,
      timestamp: context.createdAt,
    };
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
      steps: JSON.stringify(plan.steps),
      pros: JSON.stringify(plan.pros),
      cons: JSON.stringify(plan.cons),
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
          steps: plan.steps.map((s, index) => ({
            order: s.order ?? index + 1,
            description: s.description,
            actionType: s.actionType,
            riskLevel: s.riskLevel === 'safe' ? 'low' : s.riskLevel,
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
      steps: JSON.stringify(plan.steps),
      pros: JSON.stringify(plan.pros),
      cons: JSON.stringify(plan.cons),
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

    // Helper to convert AIMessageContent to string
    const contentToString = (content: string | import('./ai/types').AIMessageContent[] | undefined): string | undefined => {
      if (!content) return undefined;
      if (typeof content === 'string') return content;
      return content.map(c => c.type === 'text' ? c.text || '' : '[image]').join('');
    };

    // 记录 LLM 输入
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessage = messages.find(m => m.role === 'user');
    const llmInputEvent = this.eventCollector.addLLMInput({
      systemPrompt: contentToString(systemMessage?.content),
      userMessage: contentToString(userMessage?.content) || contentToString(messages[messages.length - 1]?.content) || '',
      model: this.aiManager.activeProvider || undefined,
      provider: this.aiManager.activeProvider || undefined,
    });

    const startTime = Date.now();
    const response = await this.aiManager.chat(messages);
    const duration = Date.now() - startTime;

    // 记录 LLM 输出
    this.eventCollector.addLLMOutput({
      response: response.text,
      model: response.model,
      provider: this.aiManager.activeProvider || undefined,
      inputTokens: response.usage?.promptTokens,
      outputTokens: response.usage?.completionTokens,
      totalTokens: response.usage?.totalTokens,
      duration,
    }, llmInputEvent.id);

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
    const autonomousStatus = this.autonomousManager?.getStatus();
    return {
      initialized: this._initialized,
      aiReady: this.aiManager?.isReady ?? false,
      aiProvider: this.aiManager?.activeProvider ?? null,
      syncRunning: this._syncRunning,
      syncPort: this.config.sync?.port ?? null,
      connectedClients: this.syncServer?.getClientCount() ?? 0,
      behaviorTracking: this._behaviorRunning,
      memoryEnabled: this.memoryManager !== null,
      dashboardEnabled: this.dashboardManager !== null,
      workflowEnabled: this.workflowManager !== null,
      pluginsEnabled: this.pluginManager !== null,
      loadedPlugins: this.pluginManager?.getLoadedPlugins().length ?? 0,
      autonomousEnabled: this.autonomousManager !== null,
      activeSuggestions: autonomousStatus?.suggestionsCount ?? 0,
    };
  }

  // ============ 行为追踪相关 ============

  /**
   * 获取行为追踪器
   */
  getBehaviorTracker(): BehaviorTracker | null {
    return this.behaviorTracker;
  }

  /**
   * 获取用户行为模式
   */
  async getBehaviorPatterns() {
    return this.behaviorTracker?.getPatterns() ?? [];
  }

  /**
   * 获取习惯建议
   */
  async getHabitSuggestions() {
    return this.behaviorTracker?.getSuggestions() ?? [];
  }

  // ============ 记忆系统相关 ============

  /**
   * 获取记忆管理器
   */
  getMemoryManager(): MemOSManager | null {
    return this.memoryManager;
  }

  /**
   * 记忆语义搜索
   */
  async memorySearch(query: string, options?: { limit?: number; types?: string[] }) {
    return this.memoryManager?.semanticSearch(query, options?.limit ?? 10) ?? [];
  }

  /**
   * 获取语义记忆
   */
  getSemanticMemories(query: string, limit = 10) {
    return this.memoryManager?.semanticSearch(query, limit) ?? [];
  }

  // ============ Dashboard 相关 ============

  /**
   * 获取 Dashboard 管理器
   */
  getDashboardManager(): DashboardManager | null {
    return this.dashboardManager;
  }

  /**
   * 获取今日时间统计
   */
  getTodayTimeStats() {
    return this.dashboardManager?.getTodayTimeStats();
  }

  /**
   * 获取生产力报告
   */
  getProductivityReport(type: 'weekly' | 'monthly') {
    return this.dashboardManager?.getProductivityReport(type);
  }

  // ============ 工作流相关 ============

  /**
   * 获取工作流管理器
   */
  getWorkflowManager(): WorkflowManager | null {
    return this.workflowManager;
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(workflowId: string, input?: Record<string, unknown>) {
    return this.workflowManager?.executeWorkflow(workflowId, input);
  }

  /**
   * 获取所有工作流
   */
  getWorkflows() {
    return this.workflowManager?.getAllWorkflows() ?? [];
  }

  // ============ 插件相关 ============

  /**
   * 获取插件管理器
   */
  getPluginManager(): PluginManager | null {
    return this.pluginManager;
  }

  /**
   * 从文件加载插件
   */
  async loadPluginFromFile(pluginPath: string) {
    return this.pluginManager?.loadPluginFromFile(pluginPath);
  }

  /**
   * 获取已加载的插件
   */
  getLoadedPlugins() {
    return this.pluginManager?.getLoadedPlugins() ?? [];
  }

  // ============ 自主能力相关 ============

  /**
   * 获取自主能力管理器
   */
  getAutonomousManager(): AutonomousManager | null {
    return this.autonomousManager;
  }

  // ============ 调试事件收集 ============

  /**
   * 获取任务队列
   */
  getTaskQueue(): TaskQueue | null {
    return this.taskQueue;
  }

  /**
   * 获取调试事件收集器
   */
  getEventCollector(): EventCollector {
    return this.eventCollector;
  }

  /**
   * 获取 MCP 工具注册表
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * 获取技能管理器
   */
  getSkillManager(): SkillManager {
    return this.skillManager;
  }

  /**
   * 分析上下文并获取自动建议 (无需 Prompt)
   */
  async analyzeAndSuggest(): Promise<AutonomousAnalysisResult | null> {
    if (!this.autonomousManager) return null;

    const context = await this.perception.perceive();
    return this.autonomousManager.analyze(context);
  }

  /**
   * 获取当前建议列表
   */
  getSuggestions(limit?: number): SuggestedAction[] {
    return this.autonomousManager?.getSuggestions(limit) ?? [];
  }

  /**
   * 执行建议
   */
  async executeSuggestion(suggestionId: string): Promise<void> {
    if (!this.autonomousManager) return;

    const result = await this.autonomousManager.executeSuggestion(suggestionId);
    if (result.metadata?.action) {
      // 使用 PlanExecutor 执行实际操作
      const step = result.metadata.action as any;
      const execResult = await this.planExecutor.executeSingleAction(step);

      // 提供反馈
      this.autonomousManager.provideFeedback(suggestionId, execResult.success, execResult);

      this.emit('suggestion:executed', { suggestionId, result: execResult });
    }
  }

  /**
   * 忽略建议
   */
  dismissSuggestion(suggestionId: string): void {
    this.autonomousManager?.dismissSuggestion(suggestionId);
  }

  /**
   * 获取检测到的行为模式
   */
  getDetectedPatterns() {
    return this.autonomousManager?.getPatterns() ?? [];
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
  switchAIProvider(type: 'llama-cpp' | 'gemini' | 'openai'): boolean {
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
   * 获取数据库实例
   */
  getDatabase(): HawkeyeDatabase {
    return this.database;
  }

  /**
   * 清理旧数据
   */
  cleanupOldData(olderThanDays: number = 30): number {
    return this.database.cleanup(olderThanDays);
  }

  /**
   * 获取执行历史记录
   */
  getExecutionHistory(limit: number = 20) {
    return this.database.getRecentExecutions(limit);
  }

  /**
   * 关闭引擎
   */
  async shutdown(): Promise<void> {
    this.emit('shutting_down');

    // 停止感知引擎
    await this.perception.stop();

    // 停止行为追踪
    if (this.behaviorTracker) {
      await this.behaviorTracker.stop();
      this._behaviorRunning = false;
    }

    // 保存记忆系统数据
    if (this.memoryManager) {
      await this.memoryManager.saveToDisk();
    }

    // 停止工作流
    if (this.workflowManager) {
      this.workflowManager.destroy();
    }

    // 卸载所有插件
    if (this.pluginManager) {
      await this.pluginManager.destroy();
    }

    // 停止自主能力
    if (this.autonomousManager) {
      this.autonomousManager.stop();
    }

    // 停止任务队列
    if (this.taskQueue) {
      this.taskQueue.destroy();
    }

    // 停止 MCP Server
    if (this.mcpServer) {
      await this.mcpServer.stop();
    }

    if (this.syncServer) {
      this.syncServer.stop();
      this._syncRunning = false;
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

  private setupBehaviorEvents(): void {
    if (!this.behaviorTracker) return;

    this.behaviorTracker.on('pattern:detected', (pattern) => {
      this.emit('behavior:pattern:detected', pattern);
    });

    this.behaviorTracker.on('habit:learned', (habit) => {
      this.emit('behavior:habit:learned', habit);
    });

    this.behaviorTracker.on('suggestion', (suggestion) => {
      this.emit('behavior:suggestion', suggestion);
    });
  }

  private setupMemoryEvents(): void {
    if (!this.memoryManager) return;

    this.memoryManager.on('memory:consolidated', (data) => {
      this.emit('memory:consolidated', data);
    });

    this.memoryManager.on('memory:pruned', (data) => {
      this.emit('memory:pruned', data);
    });

    this.memoryManager.on('recall', (data) => {
      this.emit('memory:recall', data);
    });
  }

  private setupDashboardEvents(): void {
    if (!this.dashboardManager) return;

    this.dashboardManager.on('task:created', (task) => {
      this.emit('dashboard:task:created', task);
    });

    this.dashboardManager.on('task:completed', (task) => {
      this.emit('dashboard:task:completed', task);
    });

    this.dashboardManager.on('focus:started', (session) => {
      this.emit('dashboard:focus:started', session);
    });

    this.dashboardManager.on('focus:ended', (session) => {
      this.emit('dashboard:focus:ended', session);
    });
  }

  private setupWorkflowEvents(): void {
    if (!this.workflowManager) return;

    this.workflowManager.on('workflow:started', (execution) => {
      this.emit('workflow:started', execution);
    });

    this.workflowManager.on('workflow:completed', (execution) => {
      this.emit('workflow:completed', execution);
    });

    this.workflowManager.on('workflow:failed', (execution) => {
      this.emit('workflow:failed', execution);
    });

    this.workflowManager.on('step:executed', (data) => {
      this.emit('workflow:step:executed', data);
    });
  }

  private setupPluginEvents(): void {
    if (!this.pluginManager) return;

    // 设置感知上下文提供者
    this.pluginManager.setPerceptionContextProvider(async () => {
      // 返回最近的感知上下文
      if (this.currentIntents.length > 0) {
        const lastIntent = this.currentIntents[this.currentIntents.length - 1];
        return lastIntent.context?.perceptionContext || null;
      }
      return null;
    });

    // 设置操作执行器
    this.pluginManager.setActionExecutor(async (step) => {
      try {
        const result = await this.planExecutor.executeSingleAction(step);
        return result;
      } catch (error: unknown) {
        return {
          success: false,
          error: (error as Error).message || String(error),
        };
      }
    });

    this.pluginManager.on('plugin:loaded', (plugin) => {
      this.emit('plugin:loaded', plugin);
    });

    this.pluginManager.on('plugin:activated', (plugin) => {
      this.emit('plugin:activated', plugin);
    });

    this.pluginManager.on('plugin:deactivated', (plugin) => {
      this.emit('plugin:deactivated', plugin);
    });

    this.pluginManager.on('plugin:error', (data) => {
      this.emit('plugin:error', data);
    });
  }

  private setupAutonomousEvents(): void {
    if (!this.autonomousManager) return;

    // 建议更新事件
    this.autonomousManager.on('suggestions:updated', (suggestions: SuggestedAction[]) => {
      this.emit('autonomous:suggestions', suggestions);

      // 广播到客户端
      if (this.syncServer) {
        this.syncServer.broadcast('suggestions', {
          suggestions: suggestions.map(s => ({
            id: s.id,
            type: s.type,
            title: s.title,
            description: s.description,
            confidence: s.confidence,
            priority: s.priority,
            riskLevel: s.riskLevel,
            autoExecutable: s.autoExecutable,
          })),
        });
      }
    });

    // 意图检测事件
    this.autonomousManager.on('intent:detected', (intent) => {
      this.emit('autonomous:intent', intent);

      // 如果置信度很高且可自动执行，考虑自动执行
      if (intent.autoExecute && intent.confidence >= 0.9) {
        this.emit('autonomous:auto-execute', intent);
      }
    });

    // 模式检测事件
    this.autonomousManager.on('pattern:detected', (pattern) => {
      this.emit('autonomous:pattern', pattern);
    });

    // 分析完成事件
    this.autonomousManager.on('analysis:complete', (result: AutonomousAnalysisResult) => {
      this.emit('autonomous:analysis', result);
    });
  }

  private setupTaskQueue(): void {
    if (!this.taskQueue) return;

    // 注册 AI 请求执行器
    this.taskQueue.registerExecutor('ai_request', async (task) => {
      if (!this.aiManager) throw new Error('AI Manager not initialized');
      const data = task.data as { messages: AIMessage[]; images?: string[] };
      if (data.images && data.images.length > 0) {
        return this.aiManager.chatWithVision(data.messages, data.images);
      }
      return this.aiManager.chat(data.messages);
    });

    // 注册感知任务执行器
    this.taskQueue.registerExecutor('perception', async () => {
      return this.perception.perceive();
    });

    // 注册计划执行任务执行器
    this.taskQueue.registerExecutor('plan_execution', async (task) => {
      const data = task.data as { plan: ExecutionPlan };
      return this.planExecutor.execute(data.plan);
    });

    // 注册文件操作执行器
    this.taskQueue.registerExecutor('file_operation', async (task) => {
      const step = task.data as import('./ai/types').PlanStep;
      return this.planExecutor.executeSingleAction(step);
    });

    // 注册系统动作执行器
    this.taskQueue.registerExecutor('system_action', async (task) => {
      const step = task.data as import('./ai/types').PlanStep;
      return this.planExecutor.executeSingleAction(step);
    });

    // 注册浏览器动作执行器
    this.taskQueue.registerExecutor('browser_action', async (task) => {
      const step = task.data as import('./ai/types').PlanStep;
      return this.planExecutor.executeSingleAction(step);
    });

    // 队列事件
    this.taskQueue.on('task:started', (task) => {
      this.emit('queue:task:started', task);
    });

    this.taskQueue.on('task:completed', (task, result) => {
      this.emit('queue:task:completed', { task, result });
    });

    this.taskQueue.on('task:failed', (task, error) => {
      this.emit('queue:task:failed', { task, error });
    });

    this.taskQueue.on('task:retry', (task, attempt) => {
      this.emit('queue:task:retry', { task, attempt });
    });

    this.taskQueue.on('queue:idle', () => {
      this.emit('queue:idle');
    });
  }

  // Store last screenshot for OCR events
  private lastScreenshotData: {
    thumbnail?: string;
    width?: number;
    height?: number;
  } | null = null;

  private setupDebugEvents(): void {
    // 感知模块事件
    this.perception.on('screen:changed', (data) => {
      // Store screenshot data for OCR events
      const thumbnail = data.imageData ? `data:image/${data.format || 'png'};base64,${data.imageData}` : undefined;
      this.lastScreenshotData = {
        thumbnail,
        width: data.dimensions?.width || 0,
        height: data.dimensions?.height || 0,
      };

      this.eventCollector.addScreenshot({
        width: data.dimensions?.width || 0,
        height: data.dimensions?.height || 0,
        size: data.imageData?.length,
        // Use the full image as thumbnail - can be resized in frontend
        thumbnail,
      });
    });

    this.perception.on('ocr:completed', (data) => {
      this.eventCollector.addOCR({
        text: data.text || '',
        charCount: data.text?.length || 0,
        confidence: data.confidence,
        backend: data.backend || 'unknown',
        duration: data.duration || 0,
        // Include screenshot data for visualization
        thumbnail: this.lastScreenshotData?.thumbnail,
        screenshotWidth: this.lastScreenshotData?.width,
        screenshotHeight: this.lastScreenshotData?.height,
        // Include OCR regions for bounding box visualization
        regions: data.regions?.map((r: any) => ({
          text: r.text,
          confidence: r.confidence,
          bbox: r.bbox,
        })),
      });
    });

    this.perception.on('clipboard:changed', (data) => {
      // data can be a string or an object
      const content = typeof data === 'string' ? data : (data.content || '');
      const type = typeof data === 'string' ? 'text' : (data.type || 'text');
      this.eventCollector.addClipboard({
        content,
        type,
      });
    });

    this.perception.on('window:changed', (data) => {
      this.eventCollector.addWindow({
        appName: data.appName || '',
        title: data.title || '',
        bundleId: data.bundleId,
        path: data.path,
      });
    });

    this.perception.on('file:changed', (data) => {
      this.eventCollector.addFile({
        path: data.path || '',
        operation: data.type || data.operation || 'modify',
        oldPath: data.oldPath,
      });
    });

    // 错误处理 - 防止 ERR_UNHANDLED_ERROR
    this.perception.on('error', (errorInfo) => {
      console.warn(`[Hawkeye] 感知模块错误 (${errorInfo?.module || 'unknown'}):`, errorInfo?.error?.message || errorInfo);
      // 不重新抛出，只记录日志，让应用继续运行
    });

    // 意图识别事件
    this.intentEngine.on('intents:recognized', (intents) => {
      this.eventCollector.addIntent({
        intents: intents.map((i: UserIntent) => ({
          id: i.id,
          type: i.type,
          description: i.description,
          confidence: i.confidence,
        })),
      });
    });

    // 计划生成事件
    this.planGenerator.on('generating', (data) => {
      this.eventCollector.addExecutionStart({
        planId: data.planId || `plan_${Date.now()}`,
        executionId: `exec_${Date.now()}`,
        planTitle: data.title || 'Generating plan...',
        totalSteps: 0,
      });
    });

    this.planGenerator.on('generated', (plan: ExecutionPlan) => {
      this.eventCollector.addPlan({
        planId: plan.id,
        title: plan.title,
        description: plan.description,
        steps: plan.steps.map((s, index) => ({
          order: s.order ?? index + 1,
          description: s.description,
          actionType: s.actionType,
          riskLevel: s.riskLevel === 'safe' ? 'low' : s.riskLevel,
        })),
        intentId: plan.intent?.id,
      });
    });

    // 执行器事件
    this.planExecutor.on('step:start', (data) => {
      this.eventCollector.addExecutionStep({
        planId: data.planId,
        executionId: data.executionId || data.planId,
        stepOrder: data.step?.order || 0,
        stepDescription: data.step?.description || '',
        status: 'started',
      });
    });

    this.planExecutor.on('step:complete', (data) => {
      this.eventCollector.addExecutionStep({
        planId: data.planId,
        executionId: data.executionId || data.planId,
        stepOrder: data.step?.order || 0,
        stepDescription: data.step?.description || '',
        status: 'completed',
        result: data.result,
        duration: data.duration,
      });
    });

    this.planExecutor.on('step:error', (data) => {
      this.eventCollector.addExecutionStep({
        planId: data.planId,
        executionId: data.executionId || data.planId,
        stepOrder: data.step?.order || 0,
        stepDescription: data.step?.description || '',
        status: 'failed',
        error: data.error,
      });
    });

    this.planExecutor.on('execution:complete', async (execution) => {
      this.eventCollector.addExecutionComplete({
        planId: execution.planId,
        executionId: execution.id,
        status: execution.status as 'completed' | 'failed' | 'cancelled',
        totalDuration: execution.duration || 0,
        stepsCompleted: execution.completedSteps?.length || 0,
        stepsFailed: execution.failedSteps?.length || 0,
      });

      // 触发 SEPO 优化
      if (this.selfReflection && execution.plan) {
        const result: ExecutionResult = {
          success: execution.status === 'completed',
          error: execution.error,
          duration: (execution.completedAt || Date.now()) - execution.startedAt,
        };
        await this.selfReflection.optimizeProcess(execution.plan, result);
      }
    });

    // 错误事件
    this.on('error', (error) => {
      this.eventCollector.addError({
        message: error instanceof Error ? error.message : String(error),
        source: 'Hawkeye',
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
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
