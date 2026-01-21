/**
 * 插件系统类型定义
 * Plugin System Type Definitions
 *
 * 定义 Hawkeye 插件的接口和数据结构
 */

import { PerceptionContext, TaskSuggestion, ExecutionResult } from '../types';
import { PlanStep } from '../ai';

// ============================================================================
// 插件基础类型 (Plugin Base Types)
// ============================================================================

/**
 * 插件状态
 */
export type PluginState = 'inactive' | 'loading' | 'active' | 'error' | 'disabled';

/**
 * 插件元数据
 */
export interface PluginMetadata {
  /** 插件唯一标识 */
  id: string;
  /** 插件名称 */
  name: string;
  /** 版本号 (遵循 semver) */
  version: string;
  /** 插件描述 */
  description?: string;
  /** 作者信息 */
  author?: {
    name: string;
    email?: string;
    url?: string;
  };
  /** 主页 URL */
  homepage?: string;
  /** 仓库 URL */
  repository?: string;
  /** 许可证 */
  license?: string;
  /** 关键词标签 */
  keywords?: string[];
  /** 分类 */
  category?: PluginCategory;
  /** 图标 URL */
  icon?: string;
  /** 最低 Hawkeye 版本要求 */
  minHawkeyeVersion?: string;
  /** 依赖的其他插件 */
  dependencies?: Record<string, string>;
}

/**
 * 插件分类
 */
export type PluginCategory =
  | 'perception'     // 感知类
  | 'reasoning'      // 推理类
  | 'execution'      // 执行类
  | 'integration'    // 集成类
  | 'workflow'       // 工作流类
  | 'ui'             // UI 扩展类
  | 'utility'        // 工具类
  | 'other';         // 其他

// ============================================================================
// 插件上下文 (Plugin Context)
// ============================================================================

/**
 * 自定义感知器接口
 */
export interface CustomPerception {
  /** 感知器名称 */
  name: string;
  /** 感知器描述 */
  description?: string;
  /** 执行感知 */
  perceive(): Promise<Record<string, unknown>>;
  /** 感知间隔 (毫秒) */
  interval?: number;
}

/**
 * 自定义执行器接口
 */
export interface CustomExecutor {
  /** 执行器处理的操作类型 */
  type: string;
  /** 执行器描述 */
  description?: string;
  /** 执行操作 */
  execute(step: PlanStep, context: PluginExecutionContext): Promise<ExecutionResult>;
  /** 是否可以处理该步骤 */
  canHandle?(step: PlanStep): boolean;
}

/**
 * 自定义意图处理器接口
 */
export interface CustomIntentHandler {
  /** 处理的意图类型 */
  intent: string;
  /** 描述 */
  description?: string;
  /** 优先级 (越高越先处理) */
  priority?: number;
  /** 处理意图 */
  handle(context: PerceptionContext): Promise<IntentHandlerResult>;
  /** 是否可以处理该上下文 */
  canHandle?(context: PerceptionContext): boolean;
}

/**
 * 意图处理结果
 */
export interface IntentHandlerResult {
  /** 生成的建议 */
  suggestions?: TaskSuggestion[];
  /** 是否已完全处理 (阻止后续处理器) */
  handled?: boolean;
  /** 附加数据 */
  data?: Record<string, unknown>;
}

/**
 * 自定义存储接口
 */
export interface CustomStorage {
  /** 存储命名空间 */
  namespace: string;
  /** 获取值 */
  get<T>(key: string): Promise<T | undefined>;
  /** 设置值 */
  set<T>(key: string, value: T): Promise<void>;
  /** 删除值 */
  delete(key: string): Promise<void>;
  /** 获取所有键 */
  keys(): Promise<string[]>;
  /** 清空命名空间 */
  clear(): Promise<void>;
}

/**
 * 插件执行上下文
 */
export interface PluginExecutionContext {
  /** 当前感知上下文 */
  perception?: PerceptionContext;
  /** 工作目录 */
  workingDirectory?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 用户 ID */
  userId?: string;
  /** 会话 ID */
  sessionId?: string;
}

/**
 * 插件上下文 - 提供给插件的 API
 */
export interface PluginContext {
  /** 插件元数据 */
  metadata: PluginMetadata;

  /** 插件配置 */
  config: PluginConfig;

  /** 日志记录 */
  logger: PluginLogger;

  /** 插件存储 */
  storage: CustomStorage;

  // =========================================================================
  // 注册 API
  // =========================================================================

  /** 注册自定义感知器 */
  registerPerception(perception: CustomPerception): void;

  /** 注册自定义执行器 */
  registerExecutor(executor: CustomExecutor): void;

  /** 注册自定义意图处理器 */
  registerIntentHandler(handler: CustomIntentHandler): void;

  /** 注册设置面板 */
  registerSettings(settings: PluginSettingsSchema): void;

  /** 注册命令 */
  registerCommand(command: PluginCommand): void;

  // =========================================================================
  // 事件 API
  // =========================================================================

  /** 订阅事件 */
  on<E extends keyof PluginEvents>(event: E, handler: PluginEvents[E]): void;

  /** 取消订阅 */
  off<E extends keyof PluginEvents>(event: E, handler: PluginEvents[E]): void;

  /** 触发事件 */
  emit<E extends keyof PluginEvents>(
    event: E,
    ...args: Parameters<PluginEvents[E]>
  ): void;

  // =========================================================================
  // 工具 API
  // =========================================================================

  /** 获取当前感知上下文 */
  getPerceptionContext(): Promise<PerceptionContext | null>;

  /** 执行操作 */
  executeAction(step: PlanStep): Promise<ExecutionResult>;

  /** 显示通知 */
  showNotification(notification: PluginNotification): void;

  /** 请求用户输入 */
  requestInput(request: InputRequest): Promise<string | null>;

  /** 请求用户确认 */
  requestConfirmation(request: ConfirmationRequest): Promise<boolean>;

  /** 获取其他插件 */
  getPlugin(pluginId: string): HawkeyePlugin | undefined;
}

// ============================================================================
// 插件配置 (Plugin Configuration)
// ============================================================================

/**
 * 插件配置
 */
export interface PluginConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 自定义配置 */
  settings: Record<string, unknown>;
}

/**
 * 插件设置项类型
 */
export type PluginSettingType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'color'
  | 'file'
  | 'folder';

/**
 * 插件设置项
 */
export interface PluginSettingItem {
  /** 设置项 key */
  key: string;
  /** 显示名称 */
  label: string;
  /** 描述 */
  description?: string;
  /** 类型 */
  type: PluginSettingType;
  /** 默认值 */
  default?: unknown;
  /** 是否必填 */
  required?: boolean;
  /** 下拉选项 (用于 select/multiselect) */
  options?: Array<{ label: string; value: unknown }>;
  /** 验证器 */
  validate?: (value: unknown) => string | null;
}

/**
 * 插件设置 Schema
 */
export interface PluginSettingsSchema {
  /** 设置项列表 */
  items: PluginSettingItem[];
  /** 分组 */
  groups?: Array<{
    id: string;
    label: string;
    items: string[];  // 设置项 key 列表
  }>;
}

// ============================================================================
// 插件命令 (Plugin Commands)
// ============================================================================

/**
 * 插件命令
 */
export interface PluginCommand {
  /** 命令 ID */
  id: string;
  /** 命令名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 快捷键 */
  shortcut?: string;
  /** 执行命令 */
  execute(context: PluginContext): Promise<void>;
  /** 是否可用 */
  isEnabled?(): boolean;
}

// ============================================================================
// 插件事件 (Plugin Events)
// ============================================================================

/**
 * 插件事件
 */
export interface PluginEvents {
  /** 感知上下文更新 */
  'perception:update': (context: PerceptionContext) => void;
  /** 建议生成 */
  'suggestion:created': (suggestion: TaskSuggestion) => void;
  /** 建议被接受 */
  'suggestion:accepted': (suggestion: TaskSuggestion) => void;
  /** 建议被拒绝 */
  'suggestion:rejected': (suggestion: TaskSuggestion) => void;
  /** 执行开始 */
  'execution:start': (step: PlanStep) => void;
  /** 执行完成 */
  'execution:complete': (step: PlanStep, result: ExecutionResult) => void;
  /** 执行失败 */
  'execution:error': (step: PlanStep, error: Error) => void;
  /** 插件消息 (跨插件通信) */
  'plugin:message': (fromPluginId: string, message: unknown) => void;
}

// ============================================================================
// 插件日志 (Plugin Logger)
// ============================================================================

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 插件日志记录器
 */
export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ============================================================================
// 插件通知 (Plugin Notifications)
// ============================================================================

/**
 * 通知类型
 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * 插件通知
 */
export interface PluginNotification {
  /** 标题 */
  title: string;
  /** 内容 */
  message: string;
  /** 类型 */
  type?: NotificationType;
  /** 持续时间 (毫秒, 0 表示不自动关闭) */
  duration?: number;
  /** 操作按钮 */
  actions?: Array<{
    label: string;
    onClick: () => void;
  }>;
}

/**
 * 输入请求
 */
export interface InputRequest {
  /** 标题 */
  title: string;
  /** 提示信息 */
  placeholder?: string;
  /** 默认值 */
  defaultValue?: string;
  /** 验证器 */
  validate?: (value: string) => string | null;
}

/**
 * 确认请求
 */
export interface ConfirmationRequest {
  /** 标题 */
  title: string;
  /** 内容 */
  message: string;
  /** 确认按钮文本 */
  confirmText?: string;
  /** 取消按钮文本 */
  cancelText?: string;
  /** 类型 */
  type?: 'info' | 'warning' | 'danger';
}

// ============================================================================
// 插件主接口 (Plugin Main Interface)
// ============================================================================

/**
 * Hawkeye 插件接口
 */
export interface HawkeyePlugin {
  /** 插件元数据 */
  metadata: PluginMetadata;

  /**
   * 插件激活
   * 当插件被加载时调用
   */
  activate?(context: PluginContext): Promise<void>;

  /**
   * 插件停用
   * 当插件被卸载时调用
   */
  deactivate?(): Promise<void>;

  /**
   * 配置变更
   * 当插件配置被修改时调用
   */
  onConfigChange?(config: PluginConfig): void;
}

// ============================================================================
// 插件管理器类型 (Plugin Manager Types)
// ============================================================================

/**
 * 插件管理器配置
 */
export interface PluginManagerConfig {
  /** 插件目录 */
  pluginDir: string;
  /** 是否启用沙箱 */
  enableSandbox: boolean;
  /** 沙箱超时 (毫秒) */
  sandboxTimeout: number;
  /** 最大插件数 */
  maxPlugins: number;
  /** 是否允许网络访问 */
  allowNetworkAccess: boolean;
  /** 是否允许文件系统访问 */
  allowFileSystemAccess: boolean;
}

/**
 * 默认插件管理器配置
 */
export const DEFAULT_PLUGIN_MANAGER_CONFIG: PluginManagerConfig = {
  pluginDir: '~/.hawkeye/plugins',
  enableSandbox: true,
  sandboxTimeout: 30000,
  maxPlugins: 50,
  allowNetworkAccess: true,
  allowFileSystemAccess: true,
};

/**
 * 已加载的插件信息
 */
export interface LoadedPlugin {
  /** 插件实例 */
  plugin: HawkeyePlugin;
  /** 当前状态 */
  state: PluginState;
  /** 插件上下文 */
  context?: PluginContext;
  /** 加载时间 */
  loadedAt: number;
  /** 错误信息 (如果有) */
  error?: string;
  /** 配置 */
  config: PluginConfig;
}

/**
 * 插件市场元数据
 */
export interface MarketplacePlugin {
  /** 插件元数据 */
  metadata: PluginMetadata;
  /** 下载链接 */
  downloadUrl: string;
  /** 下载次数 */
  downloads: number;
  /** 评分 (1-5) */
  rating: number;
  /** 评分数量 */
  ratingCount: number;
  /** 发布日期 */
  publishedAt: string;
  /** 更新日期 */
  updatedAt: string;
  /** 是否已验证 */
  verified: boolean;
  /** 截图 */
  screenshots?: string[];
  /** README 内容 */
  readme?: string;
  /** 更新日志 */
  changelog?: string;
}

/**
 * 插件安装选项
 */
export interface PluginInstallOptions {
  /** 是否自动启用 */
  autoEnable?: boolean;
  /** 是否覆盖已存在的插件 */
  overwrite?: boolean;
  /** 安装来源 */
  source?: 'marketplace' | 'local' | 'url';
}

/**
 * 插件搜索选项
 */
export interface PluginSearchOptions {
  /** 搜索关键词 */
  query?: string;
  /** 分类过滤 */
  category?: PluginCategory;
  /** 排序方式 */
  sortBy?: 'downloads' | 'rating' | 'updated' | 'name';
  /** 排序顺序 */
  sortOrder?: 'asc' | 'desc';
  /** 页码 */
  page?: number;
  /** 每页数量 */
  pageSize?: number;
  /** 只显示已验证插件 */
  verifiedOnly?: boolean;
}

/**
 * 插件搜索结果
 */
export interface PluginSearchResult {
  /** 插件列表 */
  plugins: MarketplacePlugin[];
  /** 总数 */
  total: number;
  /** 当前页 */
  page: number;
  /** 总页数 */
  totalPages: number;
}
