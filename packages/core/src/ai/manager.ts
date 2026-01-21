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
} from './types';
import { OllamaProvider, type OllamaConfig } from './providers/ollama';
import { GeminiProvider, type GeminiConfig } from './providers/gemini';
import { OpenAICompatibleProvider, type OpenAICompatibleConfig } from './providers/openai-compatible';

export interface AIManagerConfig {
  /** Provider 配置列表 */
  providers: AIProviderConfig[];
  /** 首选 Provider */
  preferredProvider?: AIProviderType;
  /** 是否启用故障转移 */
  enableFailover?: boolean;
  /** 重试次数 */
  retryCount?: number;
  /** 重试延迟 (ms) */
  retryDelay?: number;
}

interface ProviderEntry {
  provider: IAIProvider;
  config: AIProviderConfig;
  failureCount: number;
  lastError?: Error;
}

export class AIManager extends EventEmitter {
  private providers: Map<AIProviderType, ProviderEntry> = new Map();
  private config: Required<AIManagerConfig>;
  private currentProvider: AIProviderType | null = null;
  private _isReady: boolean = false;

  constructor(config: AIManagerConfig) {
    super();
    this.config = {
      preferredProvider: 'ollama',
      enableFailover: true,
      retryCount: 2,
      retryDelay: 1000,
      ...config,
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

  private createProvider(config: AIProviderConfig): IAIProvider {
    switch (config.type) {
      case 'ollama':
        return new OllamaProvider(config as OllamaConfig);
      case 'gemini':
        return new GeminiProvider(config as GeminiConfig);
      case 'openai':
        return new OpenAICompatibleProvider(config as OpenAICompatibleConfig);
      default:
        throw new Error(`不支持的 Provider 类型: ${config.type}`);
    }
  }

  private selectProvider(): AIProviderType | null {
    // 优先选择首选 provider
    if (this.config.preferredProvider) {
      const preferred = this.providers.get(this.config.preferredProvider);
      if (preferred?.provider.isAvailable) {
        return this.config.preferredProvider;
      }
    }

    // 按优先级选择: ollama > gemini > 其他
    const priority: AIProviderType[] = ['ollama', 'gemini', 'claude', 'openai', 'deepseek', 'qwen', 'doubao'];

    for (const type of priority) {
      const entry = this.providers.get(type);
      if (entry?.provider.isAvailable) {
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

      // 重试逻辑
      for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
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

          this.emit('provider:error', {
            type: providerType,
            error: lastError,
            attempt: attempt + 1,
          });

          // 如果还有重试次数，等待后重试
          if (attempt < this.config.retryCount) {
            await this.delay(this.config.retryDelay * (attempt + 1));
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
    const priority: AIProviderType[] = ['ollama', 'gemini', 'claude', 'openai', 'deepseek', 'qwen', 'doubao'];

    for (const type of priority) {
      if (exclude.has(type)) continue;

      const entry = this.providers.get(type);
      if (entry?.provider.isAvailable) {
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
