/**
 * 插件管理器
 * Plugin Manager
 *
 * 管理 Hawkeye 插件的加载、卸载、启用和禁用
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import {
  HawkeyePlugin,
  PluginMetadata,
  PluginConfig,
  PluginContext,
  PluginState,
  LoadedPlugin,
  PluginManagerConfig,
  DEFAULT_PLUGIN_MANAGER_CONFIG,
  CustomPerception,
  CustomExecutor,
  CustomIntentHandler,
  PluginSettingsSchema,
  PluginCommand,
  PluginEvents,
  PluginLogger,
  CustomStorage,
  PluginNotification,
  InputRequest,
  ConfirmationRequest,
  PluginInstallOptions,
} from './types';
import { PerceptionContext, ExecutionResult } from '../types';
import { PlanStep } from '../ai';

/**
 * 插件管理器事件
 */
export interface PluginManagerEvents {
  'plugin:loaded': (pluginId: string, plugin: HawkeyePlugin) => void;
  'plugin:activated': (pluginId: string) => void;
  'plugin:deactivated': (pluginId: string) => void;
  'plugin:unloaded': (pluginId: string) => void;
  'plugin:error': (pluginId: string, error: Error) => void;
  'plugin:config-changed': (pluginId: string, config: PluginConfig) => void;
}

/**
 * 插件管理器
 */
export class PluginManager extends EventEmitter {
  private config: PluginManagerConfig;
  private plugins: Map<string, LoadedPlugin> = new Map();

  // 注册的扩展点
  private perceptions: Map<string, CustomPerception> = new Map();
  private executors: Map<string, CustomExecutor> = new Map();
  private intentHandlers: Map<string, CustomIntentHandler[]> = new Map();
  private commands: Map<string, PluginCommand> = new Map();
  private settingsSchemas: Map<string, PluginSettingsSchema> = new Map();

  // 插件存储
  private pluginStorage: Map<string, Map<string, unknown>> = new Map();

  // 回调处理
  private notificationHandler?: (notification: PluginNotification) => void;
  private inputHandler?: (request: InputRequest) => Promise<string | null>;
  private confirmHandler?: (request: ConfirmationRequest) => Promise<boolean>;

  constructor(config?: Partial<PluginManagerConfig>) {
    super();
    this.config = { ...DEFAULT_PLUGIN_MANAGER_CONFIG, ...config };

    // 确保插件目录存在
    this.ensurePluginDir();
  }

  /**
   * 确保插件目录存在
   */
  private ensurePluginDir(): void {
    const pluginDir = this.resolvePluginDir();
    if (!fs.existsSync(pluginDir)) {
      fs.mkdirSync(pluginDir, { recursive: true });
    }
  }

  /**
   * 解析插件目录路径
   */
  private resolvePluginDir(): string {
    if (this.config.pluginDir.startsWith('~')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      return path.join(homeDir, this.config.pluginDir.slice(1));
    }
    return this.config.pluginDir;
  }

  // ============================================================================
  // 插件生命周期管理 (Plugin Lifecycle Management)
  // ============================================================================

  /**
   * 加载插件
   */
  async loadPlugin(plugin: HawkeyePlugin): Promise<void> {
    const pluginId = plugin.metadata.id;

    // 检查是否已加载
    if (this.plugins.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} is already loaded`);
    }

    // 检查插件数量限制
    if (this.plugins.size >= this.config.maxPlugins) {
      throw new Error(`Maximum plugin limit (${this.config.maxPlugins}) reached`);
    }

    // 验证元数据
    this.validateMetadata(plugin.metadata);

    // 创建加载记录
    const loadedPlugin: LoadedPlugin = {
      plugin,
      state: 'loading',
      loadedAt: Date.now(),
      config: {
        enabled: true,
        settings: {},
      },
    };

    this.plugins.set(pluginId, loadedPlugin);

    try {
      // 创建插件上下文
      const context = this.createPluginContext(plugin.metadata, loadedPlugin.config);
      loadedPlugin.context = context;

      // 激活插件
      if (plugin.activate) {
        await plugin.activate(context);
      }

      loadedPlugin.state = 'active';
      this.emit('plugin:loaded', pluginId, plugin);
      this.emit('plugin:activated', pluginId);
    } catch (error) {
      loadedPlugin.state = 'error';
      loadedPlugin.error = error instanceof Error ? error.message : String(error);
      this.emit('plugin:error', pluginId, error as Error);
      throw error;
    }
  }

  /**
   * 从文件加载插件
   */
  async loadPluginFromFile(filePath: string): Promise<void> {
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Plugin file not found: ${resolvedPath}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pluginModule = require(resolvedPath);
    const plugin: HawkeyePlugin = pluginModule.default || pluginModule;

    if (!plugin.metadata) {
      throw new Error('Invalid plugin: missing metadata');
    }

    await this.loadPlugin(plugin);
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const loadedPlugin = this.plugins.get(pluginId);
    if (!loadedPlugin) {
      throw new Error(`Plugin ${pluginId} is not loaded`);
    }

    try {
      // 停用插件
      if (loadedPlugin.plugin.deactivate) {
        await loadedPlugin.plugin.deactivate();
      }

      // 清理注册的扩展
      this.cleanupPluginExtensions(pluginId);

      // 移除插件
      this.plugins.delete(pluginId);

      this.emit('plugin:deactivated', pluginId);
      this.emit('plugin:unloaded', pluginId);
    } catch (error) {
      this.emit('plugin:error', pluginId, error as Error);
      throw error;
    }
  }

  /**
   * 启用插件
   */
  async enablePlugin(pluginId: string): Promise<void> {
    const loadedPlugin = this.plugins.get(pluginId);
    if (!loadedPlugin) {
      throw new Error(`Plugin ${pluginId} is not loaded`);
    }

    if (loadedPlugin.state === 'active') {
      return; // 已启用
    }

    loadedPlugin.config.enabled = true;

    if (loadedPlugin.plugin.activate && loadedPlugin.context) {
      await loadedPlugin.plugin.activate(loadedPlugin.context);
    }

    loadedPlugin.state = 'active';
    this.emit('plugin:activated', pluginId);
  }

  /**
   * 禁用插件
   */
  async disablePlugin(pluginId: string): Promise<void> {
    const loadedPlugin = this.plugins.get(pluginId);
    if (!loadedPlugin) {
      throw new Error(`Plugin ${pluginId} is not loaded`);
    }

    if (loadedPlugin.state === 'disabled') {
      return; // 已禁用
    }

    if (loadedPlugin.plugin.deactivate) {
      await loadedPlugin.plugin.deactivate();
    }

    loadedPlugin.config.enabled = false;
    loadedPlugin.state = 'disabled';
    this.emit('plugin:deactivated', pluginId);
  }

  /**
   * 重新加载插件
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    const loadedPlugin = this.plugins.get(pluginId);
    if (!loadedPlugin) {
      throw new Error(`Plugin ${pluginId} is not loaded`);
    }

    const plugin = loadedPlugin.plugin;
    await this.unloadPlugin(pluginId);
    await this.loadPlugin(plugin);
  }

  // ============================================================================
  // 插件配置管理 (Plugin Configuration Management)
  // ============================================================================

  /**
   * 获取插件配置
   */
  getPluginConfig(pluginId: string): PluginConfig | undefined {
    return this.plugins.get(pluginId)?.config;
  }

  /**
   * 更新插件配置
   */
  updatePluginConfig(pluginId: string, config: Partial<PluginConfig>): void {
    const loadedPlugin = this.plugins.get(pluginId);
    if (!loadedPlugin) {
      throw new Error(`Plugin ${pluginId} is not loaded`);
    }

    loadedPlugin.config = {
      ...loadedPlugin.config,
      ...config,
      settings: {
        ...loadedPlugin.config.settings,
        ...config.settings,
      },
    };

    // 通知插件配置变更
    if (loadedPlugin.plugin.onConfigChange) {
      loadedPlugin.plugin.onConfigChange(loadedPlugin.config);
    }

    this.emit('plugin:config-changed', pluginId, loadedPlugin.config);
  }

  /**
   * 获取插件设置 Schema
   */
  getPluginSettingsSchema(pluginId: string): PluginSettingsSchema | undefined {
    return this.settingsSchemas.get(pluginId);
  }

  // ============================================================================
  // 插件查询 (Plugin Query)
  // ============================================================================

  /**
   * 获取插件
   */
  getPlugin(pluginId: string): HawkeyePlugin | undefined {
    return this.plugins.get(pluginId)?.plugin;
  }

  /**
   * 获取所有已加载的插件
   */
  getLoadedPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 获取插件状态
   */
  getPluginState(pluginId: string): PluginState | undefined {
    return this.plugins.get(pluginId)?.state;
  }

  /**
   * 检查插件是否已加载
   */
  isPluginLoaded(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * 检查插件是否活动
   */
  isPluginActive(pluginId: string): boolean {
    return this.plugins.get(pluginId)?.state === 'active';
  }

  // ============================================================================
  // 扩展点访问 (Extension Point Access)
  // ============================================================================

  /**
   * 获取所有自定义感知器
   */
  getPerceptions(): CustomPerception[] {
    return Array.from(this.perceptions.values());
  }

  /**
   * 获取自定义执行器
   */
  getExecutor(actionType: string): CustomExecutor | undefined {
    return this.executors.get(actionType);
  }

  /**
   * 获取所有自定义执行器
   */
  getExecutors(): CustomExecutor[] {
    return Array.from(this.executors.values());
  }

  /**
   * 获取意图处理器
   */
  getIntentHandlers(intent: string): CustomIntentHandler[] {
    return this.intentHandlers.get(intent) || [];
  }

  /**
   * 获取所有命令
   */
  getCommands(): PluginCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * 执行命令
   */
  async executeCommand(commandId: string): Promise<void> {
    const command = this.commands.get(commandId);
    if (!command) {
      throw new Error(`Command ${commandId} not found`);
    }

    // 找到命令所属的插件
    for (const [, loadedPlugin] of this.plugins) {
      if (loadedPlugin.context) {
        await command.execute(loadedPlugin.context);
        return;
      }
    }
  }

  // ============================================================================
  // 回调设置 (Callback Setup)
  // ============================================================================

  /**
   * 设置通知处理器
   */
  setNotificationHandler(handler: (notification: PluginNotification) => void): void {
    this.notificationHandler = handler;
  }

  /**
   * 设置输入请求处理器
   */
  setInputHandler(handler: (request: InputRequest) => Promise<string | null>): void {
    this.inputHandler = handler;
  }

  /**
   * 设置确认请求处理器
   */
  setConfirmHandler(handler: (request: ConfirmationRequest) => Promise<boolean>): void {
    this.confirmHandler = handler;
  }

  // ============================================================================
  // 插件上下文创建 (Plugin Context Creation)
  // ============================================================================

  /**
   * 创建插件上下文
   */
  private createPluginContext(
    metadata: PluginMetadata,
    config: PluginConfig
  ): PluginContext {
    const pluginId = metadata.id;
    const eventEmitter = new EventEmitter();

    // 创建存储
    if (!this.pluginStorage.has(pluginId)) {
      this.pluginStorage.set(pluginId, new Map());
    }
    const storageMap = this.pluginStorage.get(pluginId)!;

    const storage: CustomStorage = {
      namespace: pluginId,
      async get<T>(key: string): Promise<T | undefined> {
        return storageMap.get(key) as T | undefined;
      },
      async set<T>(key: string, value: T): Promise<void> {
        storageMap.set(key, value);
      },
      async delete(key: string): Promise<void> {
        storageMap.delete(key);
      },
      async keys(): Promise<string[]> {
        return Array.from(storageMap.keys());
      },
      async clear(): Promise<void> {
        storageMap.clear();
      },
    };

    // 创建日志记录器
    const logger: PluginLogger = {
      debug: (message: string, ...args: unknown[]) => {
        console.debug(`[${pluginId}] ${message}`, ...args);
      },
      info: (message: string, ...args: unknown[]) => {
        console.info(`[${pluginId}] ${message}`, ...args);
      },
      warn: (message: string, ...args: unknown[]) => {
        console.warn(`[${pluginId}] ${message}`, ...args);
      },
      error: (message: string, ...args: unknown[]) => {
        console.error(`[${pluginId}] ${message}`, ...args);
      },
    };

    const context: PluginContext = {
      metadata,
      config,
      logger,
      storage,

      // 注册 API
      registerPerception: (perception: CustomPerception) => {
        const key = `${pluginId}:${perception.name}`;
        this.perceptions.set(key, perception);
      },

      registerExecutor: (executor: CustomExecutor) => {
        const key = `${pluginId}:${executor.type}`;
        this.executors.set(key, executor);
      },

      registerIntentHandler: (handler: CustomIntentHandler) => {
        const handlers = this.intentHandlers.get(handler.intent) || [];
        handlers.push(handler);
        // 按优先级排序
        handlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        this.intentHandlers.set(handler.intent, handlers);
      },

      registerSettings: (settings: PluginSettingsSchema) => {
        this.settingsSchemas.set(pluginId, settings);
      },

      registerCommand: (command: PluginCommand) => {
        const key = `${pluginId}:${command.id}`;
        this.commands.set(key, command);
      },

      // 事件 API
      on: <E extends keyof PluginEvents>(event: E, handler: PluginEvents[E]) => {
        eventEmitter.on(event, handler as (...args: unknown[]) => void);
      },

      off: <E extends keyof PluginEvents>(event: E, handler: PluginEvents[E]) => {
        eventEmitter.off(event, handler as (...args: unknown[]) => void);
      },

      emit: <E extends keyof PluginEvents>(
        event: E,
        ...args: Parameters<PluginEvents[E]>
      ) => {
        eventEmitter.emit(event, ...args);
      },

      // 工具 API
      getPerceptionContext: async (): Promise<PerceptionContext | null> => {
        // TODO: 从主引擎获取感知上下文
        return null;
      },

      executeAction: async (step: PlanStep): Promise<ExecutionResult> => {
        // TODO: 通过主引擎执行操作
        return {
          success: false,
          error: 'Not implemented',
        };
      },

      showNotification: (notification: PluginNotification) => {
        if (this.notificationHandler) {
          this.notificationHandler(notification);
        }
      },

      requestInput: async (request: InputRequest): Promise<string | null> => {
        if (this.inputHandler) {
          return this.inputHandler(request);
        }
        return null;
      },

      requestConfirmation: async (request: ConfirmationRequest): Promise<boolean> => {
        if (this.confirmHandler) {
          return this.confirmHandler(request);
        }
        return false;
      },

      getPlugin: (id: string): HawkeyePlugin | undefined => {
        return this.getPlugin(id);
      },
    };

    return context;
  }

  // ============================================================================
  // 辅助方法 (Helper Methods)
  // ============================================================================

  /**
   * 验证插件元数据
   */
  private validateMetadata(metadata: PluginMetadata): void {
    if (!metadata.id) {
      throw new Error('Plugin metadata must have an id');
    }
    if (!metadata.name) {
      throw new Error('Plugin metadata must have a name');
    }
    if (!metadata.version) {
      throw new Error('Plugin metadata must have a version');
    }

    // 验证版本号格式 (semver)
    const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
    if (!semverRegex.test(metadata.version)) {
      throw new Error(`Invalid version format: ${metadata.version}`);
    }
  }

  /**
   * 清理插件注册的扩展
   */
  private cleanupPluginExtensions(pluginId: string): void {
    // 清理感知器
    for (const key of this.perceptions.keys()) {
      if (key.startsWith(`${pluginId}:`)) {
        this.perceptions.delete(key);
      }
    }

    // 清理执行器
    for (const key of this.executors.keys()) {
      if (key.startsWith(`${pluginId}:`)) {
        this.executors.delete(key);
      }
    }

    // 清理意图处理器
    for (const [intent, handlers] of this.intentHandlers) {
      this.intentHandlers.set(
        intent,
        handlers.filter(h => !h.intent.startsWith(`${pluginId}:`))
      );
    }

    // 清理命令
    for (const key of this.commands.keys()) {
      if (key.startsWith(`${pluginId}:`)) {
        this.commands.delete(key);
      }
    }

    // 清理设置 Schema
    this.settingsSchemas.delete(pluginId);

    // 清理存储
    this.pluginStorage.delete(pluginId);
  }

  /**
   * 销毁插件管理器
   */
  async destroy(): Promise<void> {
    // 卸载所有插件
    const pluginIds = Array.from(this.plugins.keys());
    for (const pluginId of pluginIds) {
      await this.unloadPlugin(pluginId);
    }

    this.removeAllListeners();
  }
}

// ============================================================================
// 单例管理 (Singleton Management)
// ============================================================================

let pluginManagerInstance: PluginManager | null = null;

/**
 * 获取插件管理器实例
 */
export function getPluginManager(): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager();
  }
  return pluginManagerInstance;
}

/**
 * 创建插件管理器
 */
export function createPluginManager(
  config?: Partial<PluginManagerConfig>
): PluginManager {
  pluginManagerInstance = new PluginManager(config);
  return pluginManagerInstance;
}

/**
 * 设置插件管理器实例
 */
export function setPluginManager(manager: PluginManager): void {
  pluginManagerInstance = manager;
}
