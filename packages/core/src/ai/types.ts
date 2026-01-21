/**
 * AI 模块类型定义
 */

// ============ AI Provider 类型 ============

export type AIProviderType =
  | 'ollama'      // 本地 Ollama
  | 'gemini'      // Google Gemini
  | 'claude'      // Anthropic Claude
  | 'openai'      // OpenAI GPT
  | 'deepseek'    // DeepSeek
  | 'qwen'        // 通义千问
  | 'doubao';     // 豆包

export interface AIProviderConfig {
  /** Provider 类型 */
  type: AIProviderType;
  /** API Key (云服务需要) */
  apiKey?: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** 模型名称 */
  model?: string;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
  /** 超时时间 (ms) */
  timeout?: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AIMessageContent[];
}

export interface AIMessageContent {
  type: 'text' | 'image';
  text?: string;
  imageBase64?: string;
  mimeType?: string;
}

export interface AIResponse {
  /** 响应文本 */
  text: string;
  /** 使用的 token 数 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 模型名称 */
  model: string;
  /** 耗时 (ms) */
  duration: number;
}

export interface IAIProvider {
  readonly name: AIProviderType;
  readonly isAvailable: boolean;

  initialize(): Promise<void>;
  chat(messages: AIMessage[]): Promise<AIResponse>;
  chatWithVision(messages: AIMessage[], images: string[]): Promise<AIResponse>;
  terminate(): Promise<void>;
}

// ============ 意图类型 ============

export interface UserIntent {
  /** 意图 ID */
  id: string;
  /** 意图类型 */
  type: IntentType;
  /** 意图描述 */
  description: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 相关实体 */
  entities: IntentEntity[];
  /** 上下文信息 */
  context: IntentContext;
  /** 创建时间 */
  createdAt: number;
}

export type IntentType =
  | 'file_organize'       // 文件整理
  | 'code_assist'         // 代码辅助
  | 'search'              // 搜索信息
  | 'automation'          // 自动化操作
  | 'learning'            // 学习/理解
  | 'communication'       // 沟通/写作
  | 'data_process'        // 数据处理
  | 'system_config'       // 系统配置
  | 'unknown';            // 未知

export interface IntentEntity {
  /** 实体类型 */
  type: 'file' | 'folder' | 'url' | 'text' | 'code' | 'app' | 'command';
  /** 实体值 */
  value: string;
  /** 在原文中的位置 */
  position?: { start: number; end: number };
}

export interface IntentContext {
  /** 当前应用 */
  currentApp?: string;
  /** 当前文件 */
  currentFile?: string;
  /** 剪贴板内容类型 */
  clipboardType?: 'text' | 'code' | 'url' | 'file' | 'image';
  /** 用户活动状态 */
  activityState?: 'coding' | 'browsing' | 'writing' | 'organizing' | 'idle';
}

// ============ 计划类型 ============

export interface ExecutionPlan {
  /** 计划 ID */
  id: string;
  /** 计划标题 */
  title: string;
  /** 计划描述 */
  description: string;
  /** 基于的意图 */
  intent: UserIntent;
  /** 执行步骤 */
  steps: PlanStep[];
  /** 优点分析 */
  pros: string[];
  /** 缺点/风险分析 */
  cons: string[];
  /** 替代方案 */
  alternatives?: AlternativePlan[];
  /** 预估影响 */
  impact: PlanImpact;
  /** 是否需要确认 */
  requiresConfirmation: boolean;
  /** 创建时间 */
  createdAt: number;
}

export interface PlanStep {
  /** 步骤序号 */
  order: number;
  /** 步骤描述 */
  description: string;
  /** 动作类型 */
  actionType: ActionType;
  /** 动作参数 */
  params: Record<string, unknown>;
  /** 是否可回滚 */
  reversible: boolean;
  /** 回滚动作（如果可回滚）*/
  rollback?: {
    actionType: ActionType;
    params: Record<string, unknown>;
  };
  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high';
}

export type ActionType =
  | 'shell'           // 执行 Shell 命令
  | 'file_read'       // 读取文件
  | 'file_write'      // 写入文件
  | 'file_move'       // 移动文件
  | 'file_delete'     // 删除文件
  | 'file_copy'       // 复制文件
  | 'folder_create'   // 创建文件夹
  | 'folder_delete'   // 删除文件夹
  | 'url_open'        // 打开 URL
  | 'browser_action'  // 浏览器动作
  | 'app_open'        // 打开应用
  | 'app_close'       // 关闭应用
  | 'app_action'      // 应用动作
  | 'clipboard_set'   // 设置剪贴板
  | 'clipboard_get'   // 获取剪贴板
  | 'notification'    // 发送通知
  | 'api_call'        // API 调用
  | 'wait'            // 等待
  | 'condition'       // 条件判断
  | 'loop'            // 循环
  | 'user_input';     // 用户输入

export interface AlternativePlan {
  /** 方案描述 */
  description: string;
  /** 与主方案的差异 */
  difference: string;
  /** 优点 */
  pros: string[];
  /** 缺点 */
  cons: string[];
}

export interface PlanImpact {
  /** 影响的文件数 */
  filesAffected: number;
  /** 是否修改系统设置 */
  systemChanges: boolean;
  /** 是否需要网络 */
  requiresNetwork: boolean;
  /** 是否可完全回滚 */
  fullyReversible: boolean;
  /** 预估耗时 (秒) */
  estimatedDuration: number;
}
