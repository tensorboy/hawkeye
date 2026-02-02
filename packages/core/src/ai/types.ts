/**
 * AI 模块类型定义
 */

// ============ AI Provider 类型 ============

export type AIProviderType =
  | 'llama-cpp'   // 本地 LLM (node-llama-cpp)
  | 'gemini'      // Google Gemini
  | 'claude'      // Anthropic Claude
  | 'openai'      // OpenAI GPT
  | 'deepseek'    // DeepSeek
  | 'qwen'        // 通义千问
  | 'doubao'      // 豆包
  | 'groq'        // Groq 快速推理
  | 'together'    // Together AI
  | 'fireworks'   // Fireworks AI
  | 'mistral';    // Mistral AI

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

  /** Provider 能力声明 (统一协议) */
  readonly capabilities: ProviderCapabilities;

  initialize(): Promise<void>;
  chat(messages: AIMessage[]): Promise<AIResponse>;
  chatWithVision(messages: AIMessage[], images: string[]): Promise<AIResponse>;
  terminate(): Promise<void>;

  /** 流式对话 (可选，根据 capabilities.streaming) */
  chatStream?(messages: AIMessage[], callback: AIStreamCallback): Promise<void>;

  /** 健康检查 (可选) */
  healthCheck?(): Promise<ProviderHealthStatus>;
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
  | 'voice_command'       // 语音指令
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
  /** 感知上下文（用于插件等高级功能）*/
  perceptionContext?: unknown;
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
  /** 步骤 ID (可选，用于标识) */
  id?: string;
  /** 步骤序号 */
  order?: number;
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
  riskLevel: 'safe' | 'low' | 'medium' | 'high';
  /** 预期状态 (用于视觉反馈) */
  expectedState?: {
    mustExist?: string[];
    mustNotExist?: string[];
    expectedText?: string[];
    visualSimilarityThreshold?: number;
    regionHash?: string;
  };
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
  | 'user_input'      // 用户输入
  // Agent Browser 动作 (基于 accessibility tree)
  | 'browser_open'    // 打开 URL (agent-browser)
  | 'browser_click'   // 点击元素 (ref)
  | 'browser_fill'    // 填写输入框 (ref + value)
  | 'browser_type'    // 输入文本 (逐字符)
  | 'browser_select'  // 选择下拉框
  | 'browser_check'   // 勾选复选框
  | 'browser_uncheck' // 取消勾选
  | 'browser_hover'   // 悬停元素
  | 'browser_find'    // 语义查找元素
  | 'browser_find_click'    // 查找并点击
  | 'browser_find_fill'     // 查找并填写
  | 'browser_wait'    // 等待条件
  | 'browser_snapshot'      // 获取 accessibility 快照
  | 'browser_screenshot'    // 截图
  | 'browser_eval'    // 执行 JS
  | 'browser_back'    // 返回
  | 'browser_forward' // 前进
  | 'browser_reload'  // 刷新
  // GUI 动作类型 (ShowUI-Aloha 风格, 桌面自动化)
  | 'gui_click'        // GUI 点击（指定坐标）
  | 'gui_double_click' // GUI 双击
  | 'gui_right_click'  // GUI 右键点击
  | 'gui_type'         // GUI 文本输入
  | 'gui_scroll'       // GUI 滚动
  | 'gui_drag'         // GUI 拖拽
  | 'gui_hotkey'       // GUI 快捷键
  | 'gui_wait'         // GUI 等待
  | 'gui_screenshot'   // GUI 截屏
  | 'gui_move';        // GUI 鼠标移动

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

// ============ Provider 统一协议 (参考 VibeMeter ProviderProtocol) ============

/**
 * Provider 能力声明
 * 每个 Provider 声明自己支持的功能，Manager 据此路由请求
 */
export interface ProviderCapabilities {
  /** 支持文本对话 */
  chat: boolean;
  /** 支持视觉（图像理解） */
  vision: boolean;
  /** 支持流式输出 */
  streaming: boolean;
  /** 支持函数/工具调用 */
  functionCalling: boolean;
  /** 支持 JSON 结构化输出 */
  jsonOutput: boolean;
  /** 支持嵌入生成 */
  embeddings: boolean;
  /** 最大上下文窗口 (tokens) */
  maxContextWindow: number;
  /** 支持的图像格式 */
  supportedImageFormats?: string[];
  /** 支持的语言 */
  supportedLanguages?: string[];
}

/**
 * Provider 健康检查结果
 */
export interface ProviderHealthStatus {
  /** 是否健康可用 */
  healthy: boolean;
  /** 响应延迟 (ms) */
  latencyMs: number;
  /** 状态消息 */
  message: string;
  /** 检查时间 */
  checkedAt: number;
  /** 额外指标 */
  metrics?: {
    remainingQuota?: number;
    rateLimitRemaining?: number;
    modelVersion?: string;
  };
}

/**
 * 流式响应事件
 */
export interface AIStreamEvent {
  type: 'token' | 'done' | 'error';
  token?: string;
  finishReason?: string;
  accumulated?: string;
  usage?: AIResponse['usage'];
  error?: string;
}

/**
 * 流式响应回调
 */
export type AIStreamCallback = (event: AIStreamEvent) => void;

/**
 * 默认 Provider 能力 (最小功能集)
 */
export const DEFAULT_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  chat: true,
  vision: false,
  streaming: false,
  functionCalling: false,
  jsonOutput: false,
  embeddings: false,
  maxContextWindow: 4096,
};

// ============ 重试策略类型 (参考 steipete/wacli) ============

/**
 * 指数退避重试配置
 * 参考 wacli 的 ReconnectWithBackoff 模式
 */
export interface AIRetryConfig {
  /** 最小延迟 (ms)，默认 100 */
  minDelay?: number;
  /** 最大延迟 (ms)，默认 30000 */
  maxDelay?: number;
  /** 退避乘数，默认 2 */
  multiplier?: number;
  /** 是否添加抖动 (防止雷群效应)，默认 true */
  jitter?: boolean;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
}
