/**
 * AI Manager - 管理多个 AI Provider
 * 支持自动选择、故障转移、负载均衡
 */

import { EventEmitter } from 'events';
import type {
  IAIProvider,
  AIProviderType,
  AIProviderConfig,
  AIMessage,
  AIResponse,
  AIRetryConfig,
  AIStreamCallback,
  ProviderCapabilities,
  ProviderHealthStatus,
} from './types';
import { GeminiProvider, type GeminiConfig } from './providers/gemini';
import { OpenAICompatibleProvider, type OpenAICompatibleConfig } from './providers/openai-compatible';
import { LlamaCppProvider, type LlamaCppConfig } from './providers/llama-cpp';
import { calculateBackoffDelay, DEFAULT_RETRY_CONFIG } from '../utils/retry-strategy';

// ============ Provider 注册表 (LiteLLM 模式) ============

/**
 * Provider 工厂函数类型
 */
export type ProviderFactory = (config: AIProviderConfig) => IAIProvider;

/**
 * Provider 注册表 - 支持动态注册和扩展
 * 参考 Open Interpreter 的 LiteLLM 模式
 */
class ProviderRegistry {
  private factories: Map<string, ProviderFactory> = new Map();
  private static instance: ProviderRegistry | null = null;

  private constructor() {
    // 注册内置 Provider
    this.registerBuiltinProviders();
  }

  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * 注册 Provider 工厂
   */
  register(type: string, factory: ProviderFactory): void {
    this.factories.set(type, factory);
  }

  /**
   * 取消注册 Provider
   */
  unregister(type: string): boolean {
    return this.factories.delete(type);
  }

  /**
   * 检查 Provider 是否已注册
   */
  has(type: string): boolean {
    return this.factories.has(type);
  }

  /**
   * 获取所有已注册的 Provider 类型
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * 创建 Provider 实例
   */
  create(config: AIProviderConfig): IAIProvider {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new Error(
        `不支持的 Provider 类型: ${config.type}。` +
        `已注册的类型: ${this.getRegisteredTypes().join(', ')}`
      );
    }
    return factory(config);
  }

  /**
   * 注册内置 Provider
   */
  private registerBuiltinProviders(): void {
    // LlamaCpp - 本地 LLM (推荐)
    this.register('llama-cpp', (config) => new LlamaCppProvider(config as LlamaCppConfig));

    // Gemini - Google AI
    this.register('gemini', (config) => new GeminiProvider(config as GeminiConfig));

    // OpenAI Compatible - 通用 OpenAI 兼容接口
    this.register('openai', (config) => new OpenAICompatibleProvider(config as OpenAICompatibleConfig));

    // 其他常见 Provider 别名 (都使用 OpenAI Compatible)
    this.register('claude', (config) => new OpenAICompatibleProvider({
      ...config,
      baseUrl: (config as OpenAICompatibleConfig).baseUrl || 'https://api.anthropic.com/v1',
    } as OpenAICompatibleConfig));

    this.register('deepseek', (config) => new OpenAICompatibleProvider({
      ...config,
      baseUrl: (config as OpenAICompatibleConfig).baseUrl || 'https://api.deepseek.com/v1',
    } as OpenAICompatibleConfig));

    this.register('qwen', (config) => new OpenAICompatibleProvider({
      ...config,
      baseUrl: (config as OpenAICompatibleConfig).baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    } as OpenAICompatibleConfig));

    this.register('doubao', (config) => new OpenAICompatibleProvider({
      ...config,
      baseUrl: (config as OpenAICompatibleConfig).baseUrl || 'https://ark.cn-beijing.volces.com/api/v3',
    } as OpenAICompatibleConfig));

    // Groq - 快速推理
    this.register('groq', (config) => new OpenAICompatibleProvider({
      ...config,
      baseUrl: (config as OpenAICompatibleConfig).baseUrl || 'https://api.groq.com/openai/v1',
    } as OpenAICompatibleConfig));

    // Together AI
    this.register('together', (config) => new OpenAICompatibleProvider({
      ...config,
      baseUrl: (config as OpenAICompatibleConfig).baseUrl || 'https://api.together.xyz/v1',
    } as OpenAICompatibleConfig));

    // Fireworks AI
    this.register('fireworks', (config) => new OpenAICompatibleProvider({
      ...config,
      baseUrl: (config as OpenAICompatibleConfig).baseUrl || 'https://api.fireworks.ai/inference/v1',
    } as OpenAICompatibleConfig));

    // Mistral AI
    this.register('mistral', (config) => new OpenAICompatibleProvider({
      ...config,
      baseUrl: (config as OpenAICompatibleConfig).baseUrl || 'https://api.mistral.ai/v1',
    } as OpenAICompatibleConfig));
  }
}

/**
 * 获取全局 Provider 注册表
 */
export function getProviderRegistry(): ProviderRegistry {
  return ProviderRegistry.getInstance();
}

/**
 * 注册自定义 Provider
 */
export function registerProvider(type: string, factory: ProviderFactory): void {
  getProviderRegistry().register(type, factory);
}

/**
 * 获取所有已注册的 Provider 类型
 */
export function getRegisteredProviderTypes(): string[] {
  return getProviderRegistry().getRegisteredTypes();
}

export interface AIManagerConfig {
  /** Provider 配置列表 */
  providers: AIProviderConfig[];
  /** 首选 Provider */
  preferredProvider?: AIProviderType;
  /** 是否启用故障转移 */
  enableFailover?: boolean;
  /**
   * 重试策略配置 (指数退避)
   * 参考 steipete/wacli 的 ReconnectWithBackoff 模式
   */
  retry?: AIRetryConfig;
  /**
   * @deprecated 使用 retry.maxRetries 代替
   */
  retryCount?: number;
  /**
   * @deprecated 使用 retry.minDelay 代替
   */
  retryDelay?: number;
}

interface ProviderEntry {
  provider: IAIProvider;
  config: AIProviderConfig;
  failureCount: number;
  lastError?: Error;
}

/** 内部使用的完整配置类型 */
interface ResolvedAIManagerConfig {
  providers: AIProviderConfig[];
  preferredProvider: AIProviderType;
  enableFailover: boolean;
  retry: Required<AIRetryConfig>;
}

export class AIManager extends EventEmitter {
  private providers: Map<AIProviderType, ProviderEntry> = new Map();
  private config: ResolvedAIManagerConfig;
  private currentProvider: AIProviderType | null = null;
  private _isReady: boolean = false;

  constructor(config: AIManagerConfig) {
    super();
    // 合并重试配置，支持旧的 retryCount/retryDelay 兼容
    const retryConfig: Required<AIRetryConfig> = {
      minDelay: config.retry?.minDelay ?? config.retryDelay ?? DEFAULT_RETRY_CONFIG.minDelay,
      maxDelay: config.retry?.maxDelay ?? DEFAULT_RETRY_CONFIG.maxDelay,
      multiplier: config.retry?.multiplier ?? DEFAULT_RETRY_CONFIG.multiplier,
      jitter: config.retry?.jitter ?? DEFAULT_RETRY_CONFIG.jitter,
      maxRetries: config.retry?.maxRetries ?? config.retryCount ?? DEFAULT_RETRY_CONFIG.maxRetries,
    };

    this.config = {
      providers: config.providers,
      preferredProvider: config.preferredProvider ?? 'llama-cpp',
      enableFailover: config.enableFailover ?? true,
      retry: retryConfig,
    };
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get activeProvider(): AIProviderType | null {
    return this.currentProvider;
  }

  /**
   * 初始化所有配置的 Provider
   */
  async initialize(): Promise<void> {
    this.emit('initializing');

    const initPromises = this.config.providers.map(async (config) => {
      try {
        const provider = this.createProvider(config);
        await provider.initialize();

        this.providers.set(config.type, {
          provider,
          config,
          failureCount: 0,
        });

        this.emit('provider:ready', config.type);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Provider ${config.type} 初始化失败: ${message}`);
        this.emit('provider:error', { type: config.type, error });
      }
    });

    await Promise.all(initPromises);

    // 选择首选或第一个可用的 provider
    this.currentProvider = this.selectProvider();

    if (this.currentProvider) {
      this._isReady = true;
      this.emit('ready', this.currentProvider);
    } else {
      // No AI provider available - the app can still run with limited functionality
      console.warn('没有可用的 AI Provider，AI 功能已禁用');
      this._isReady = false;
      this.emit('no-provider');
    }
  }

  /**
   * 文本对话
   */
  async chat(messages: AIMessage[]): Promise<AIResponse> {
    return this.executeWithFailover('chat', messages);
  }

  /**
   * 带图像的对话
   */
  async chatWithVision(messages: AIMessage[], images: string[]): Promise<AIResponse> {
    return this.executeWithFailover('chatWithVision', messages, images);
  }

  /**
   * 分析感知上下文
   */
  async analyzeContext(context: {
    screenshot?: string;
    activeWindow?: { appName: string; title: string };
    clipboard?: string;
    ocrText?: string;
  }): Promise<string> {
    const parts: string[] = [];

    // 构建上下文描述
    if (context.activeWindow) {
      parts.push(`当前应用: ${context.activeWindow.appName}`);
      parts.push(`窗口标题: ${context.activeWindow.title}`);
    }

    if (context.clipboard) {
      const preview = context.clipboard.length > 200
        ? context.clipboard.slice(0, 200) + '...'
        : context.clipboard;
      parts.push(`剪贴板内容: ${preview}`);
    }

    if (context.ocrText) {
      const preview = context.ocrText.length > 500
        ? context.ocrText.slice(0, 500) + '...'
        : context.ocrText;
      parts.push(`屏幕文字: ${preview}`);
    }

    const contextDesc = parts.join('\n');

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `你是 Hawkeye 智能助手，负责分析用户当前的工作上下文。
请根据提供的信息，简洁地描述：
1. 用户正在做什么
2. 可能需要什么帮助
3. 是否有可以自动化的操作

保持回答简洁，用中文回答。`,
      },
      {
        role: 'user',
        content: context.screenshot
          ? [
              { type: 'text' as const, text: `请分析以下上下文：\n${contextDesc}` },
              { type: 'image' as const, imageBase64: context.screenshot, mimeType: 'image/png' },
            ]
          : `请分析以下上下文：\n${contextDesc}`,
      },
    ];

    const response = context.screenshot
      ? await this.chatWithVision(messages, [context.screenshot])
      : await this.chat(messages);

    return response.text;
  }

  /**
   * 获取所有可用的 Provider
   */
  getAvailableProviders(): AIProviderType[] {
    return Array.from(this.providers.entries())
      .filter(([, entry]) => entry.provider.isAvailable)
      .map(([type]) => type);
  }

  /**
   * 切换到指定 Provider
   */
  switchProvider(type: AIProviderType): boolean {
    const entry = this.providers.get(type);
    if (!entry || !entry.provider.isAvailable) {
      return false;
    }

    this.currentProvider = type;
    this.emit('provider:switched', type);
    return true;
  }

  /**
   * 获取 Provider 状态
   */
  getProviderStatus(): Record<AIProviderType, {
    available: boolean;
    failureCount: number;
    lastError?: string;
  }> {
    const status: Record<string, {
      available: boolean;
      failureCount: number;
      lastError?: string;
    }> = {};

    for (const [type, entry] of this.providers) {
      status[type] = {
        available: entry.provider.isAvailable,
        failureCount: entry.failureCount,
        lastError: entry.lastError?.message,
      };
    }

    return status;
  }

  /**
   * 流式对话 (通过当前 Provider)
   */
  async chatStream(messages: AIMessage[], callback: AIStreamCallback): Promise<void> {
    if (!this.currentProvider) {
      callback({ type: 'error', error: '没有可用的 AI Provider' });
      return;
    }

    const entry = this.providers.get(this.currentProvider);
    if (!entry?.provider.chatStream) {
      callback({ type: 'error', error: `Provider ${this.currentProvider} 不支持流式输出` });
      return;
    }

    await entry.provider.chatStream(messages, callback);
  }

  /**
   * 获取当前 Provider 能力
   */
  getCapabilities(): ProviderCapabilities | null {
    if (!this.currentProvider) return null;
    return this.providers.get(this.currentProvider)?.provider.capabilities || null;
  }

  /**
   * 获取所有 Provider 能力
   */
  getAllCapabilities(): Record<AIProviderType, ProviderCapabilities> {
    const result: Record<string, ProviderCapabilities> = {};
    for (const [type, entry] of this.providers) {
      result[type] = entry.provider.capabilities;
    }
    return result;
  }

  /**
   * 健康检查当前 Provider
   */
  async healthCheck(): Promise<ProviderHealthStatus | null> {
    if (!this.currentProvider) return null;
    const entry = this.providers.get(this.currentProvider);
    if (!entry?.provider.healthCheck) return null;
    return entry.provider.healthCheck();
  }

  /**
   * 健康检查所有 Provider
   */
  async healthCheckAll(): Promise<Record<AIProviderType, ProviderHealthStatus>> {
    const result: Record<string, ProviderHealthStatus> = {};
    const checks = Array.from(this.providers.entries()).map(async ([type, entry]) => {
      if (entry.provider.healthCheck) {
        result[type] = await entry.provider.healthCheck();
      } else {
        result[type] = {
          healthy: entry.provider.isAvailable,
          latencyMs: 0,
          message: entry.provider.isAvailable ? 'Available (no health check)' : 'Not available',
          checkedAt: Date.now(),
        };
      }
    });
    await Promise.all(checks);
    return result;
  }

  /**
   * 根据能力选择 Provider
   * 例如: findProviderWithCapability('vision') 返回支持视觉的 Provider
   */
  findProviderWithCapability(capability: keyof ProviderCapabilities): AIProviderType | null {
    for (const type of AIManager.DEFAULT_PRIORITY) {
      const entry = this.providers.get(type);
      if (entry?.provider.isAvailable && entry.provider.capabilities[capability]) {
        return type;
      }
    }
    return null;
  }

  /**
   * 终止所有 Provider
   */
  async terminate(): Promise<void> {
    const terminatePromises = Array.from(this.providers.values())
      .map(entry => entry.provider.terminate());

    await Promise.all(terminatePromises);

    this.providers.clear();
    this.currentProvider = null;
    this._isReady = false;

    this.emit('terminated');
  }

  // ============ 私有方法 ============

  /**
   * 使用注册表创建 Provider 实例
   * 支持动态注册的 Provider 类型
   */
  private createProvider(config: AIProviderConfig): IAIProvider {
    return getProviderRegistry().create(config);
  }

  /**
   * Provider 优先级列表 - 可通过配置扩展
   */
  private static readonly DEFAULT_PRIORITY: AIProviderType[] = [
    'llama-cpp', 'gemini', 'claude', 'openai', 'deepseek',
    'qwen', 'doubao', 'groq', 'together', 'fireworks', 'mistral'
  ];

  private selectProvider(): AIProviderType | null {
    // 优先选择首选 provider
    if (this.config.preferredProvider) {
      const preferred = this.providers.get(this.config.preferredProvider);
      if (preferred?.provider.isAvailable) {
        return this.config.preferredProvider;
      }
    }

    // 按优先级选择
    for (const type of AIManager.DEFAULT_PRIORITY) {
      const entry = this.providers.get(type);
      if (entry?.provider.isAvailable) {
        return type;
      }
    }

    // 如果优先级列表中没有，尝试任何已注册的 Provider
    for (const [type, entry] of this.providers) {
      if (entry.provider.isAvailable) {
        return type;
      }
    }

    return null;
  }

  private async executeWithFailover(
    method: 'chat' | 'chatWithVision',
    messages: AIMessage[],
    images?: string[]
  ): Promise<AIResponse> {
    if (!this.currentProvider) {
      throw new Error('没有可用的 AI Provider');
    }

    const triedProviders = new Set<AIProviderType>();
    let lastError: Error | null = null;

    while (triedProviders.size < this.providers.size) {
      const providerType = this.currentProvider!;
      triedProviders.add(providerType);

      const entry = this.providers.get(providerType);
      if (!entry || !entry.provider.isAvailable) {
        if (this.config.enableFailover) {
          this.currentProvider = this.selectNextProvider(triedProviders);
          continue;
        }
        break;
      }

      // 重试逻辑 (指数退避)
      const { maxRetries } = this.config.retry;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = method === 'chatWithVision'
            ? await entry.provider.chatWithVision(messages, images!)
            : await entry.provider.chat(messages);

          // 成功，重置失败计数
          entry.failureCount = 0;
          return response;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          entry.failureCount++;
          entry.lastError = lastError;

          // 计算指数退避延迟
          const delay = calculateBackoffDelay(attempt, this.config.retry);

          this.emit('provider:error', {
            type: providerType,
            error: lastError,
            attempt: attempt + 1,
            nextRetryDelay: attempt < maxRetries ? delay : undefined,
          });

          // 如果还有重试次数，等待后重试 (指数退避 + 抖动)
          if (attempt < maxRetries) {
            await this.delay(delay);
          }
        }
      }

      // 当前 provider 失败，尝试切换
      if (this.config.enableFailover) {
        this.currentProvider = this.selectNextProvider(triedProviders);
        if (this.currentProvider) {
          this.emit('provider:failover', {
            from: providerType,
            to: this.currentProvider,
          });
        }
      } else {
        break;
      }
    }

    throw lastError || new Error('所有 AI Provider 都不可用');
  }

  private selectNextProvider(exclude: Set<AIProviderType>): AIProviderType | null {
    // 按优先级选择下一个 Provider
    for (const type of AIManager.DEFAULT_PRIORITY) {
      if (exclude.has(type)) continue;

      const entry = this.providers.get(type);
      if (entry?.provider.isAvailable) {
        return type;
      }
    }

    // 如果优先级列表中没有，尝试任何已注册的 Provider
    for (const [type, entry] of this.providers) {
      if (exclude.has(type)) continue;
      if (entry.provider.isAvailable) {
        return type;
      }
    }

    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 单例
let aiManagerInstance: AIManager | null = null;

export function getAIManager(): AIManager | null {
  return aiManagerInstance;
}

export function createAIManager(config: AIManagerConfig): AIManager {
  aiManagerInstance = new AIManager(config);
  return aiManagerInstance;
}
