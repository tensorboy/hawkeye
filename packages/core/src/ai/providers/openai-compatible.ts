/**
 * OpenAI Compatible Provider
 * 支持任何 OpenAI 兼容的 API（如 antigravity-tools, LiteLLM, OneAPI 等）
 */

import { EventEmitter } from 'events';
import type {
  IAIProvider,
  AIProviderConfig,
  AIMessage,
  AIResponse,
  AIMessageContent,
} from '../types';

export interface OpenAICompatibleConfig extends AIProviderConfig {
  type: 'openai';
  /** API 基础 URL */
  baseUrl: string;
  /** API Key */
  apiKey: string;
  /** 模型名称 */
  model?: string;
}

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAICompatibleProvider extends EventEmitter implements IAIProvider {
  readonly name = 'openai' as const;
  private config: Required<OpenAICompatibleConfig>;
  private _isAvailable: boolean = false;

  constructor(config: OpenAICompatibleConfig) {
    super();
    this.config = {
      type: 'openai',
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model || 'gemini-2.5-flash',
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 60000,
      ...config,
    } as Required<OpenAICompatibleConfig>;
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  /**
   * 初始化：检查 API 服务是否可用
   */
  async initialize(): Promise<void> {
    console.log(`[OpenAI Provider] 正在初始化，baseUrl: ${this.config.baseUrl}, model: ${this.config.model}`);

    try {
      // 检查 API 服务 - 获取模型列表
      const response = await fetch(`${this.config.baseUrl}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`API 服务响应异常: ${response.status}`);
      }

      const data = await response.json();
      const models = data.data || [];

      console.log(`[OpenAI Provider] 获取到 ${models.length} 个可用模型`);

      if (models.length === 0) {
        console.warn('[OpenAI Provider] API 没有可用的模型');
      }

      // 检查指定模型是否存在
      const hasModel = models.some((m: { id: string }) => m.id === this.config.model);
      if (!hasModel) {
        console.warn(`[OpenAI Provider] 指定的模型 ${this.config.model} 不在可用列表中，但仍然尝试使用`);
      }

      this._isAvailable = true;
      console.log('[OpenAI Provider] 初始化成功！');
      this.emit('ready');
    } catch (error) {
      this._isAvailable = false;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[OpenAI Provider] 初始化失败: ${message}`);
      throw new Error(`OpenAI Compatible API 初始化失败: ${message}`);
    }
  }

  /**
   * 聊天对话
   */
  async chat(messages: AIMessage[]): Promise<AIResponse> {
    if (!this._isAvailable) {
      throw new Error('OpenAI Compatible Provider 不可用');
    }

    const startTime = Date.now();

    try {
      const openaiMessages = this.convertMessages(messages);

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: openaiMessages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
        }),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
      }

      const data: OpenAIChatResponse = await response.json();
      const content = data.choices[0]?.message?.content || '';

      return {
        text: content,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
        model: data.model,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`聊天请求失败: ${message}`);
    }
  }

  /**
   * 带视觉的聊天（支持图片）
   */
  async chatWithVision(messages: AIMessage[], images: string[]): Promise<AIResponse> {
    if (!this._isAvailable) {
      throw new Error('OpenAI Compatible Provider 不可用');
    }

    const startTime = Date.now();

    try {
      // 构建包含图片的消息
      const openaiMessages = this.convertMessagesWithImages(messages, images);

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: openaiMessages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
        }),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
      }

      const data: OpenAIChatResponse = await response.json();
      const content = data.choices[0]?.message?.content || '';

      return {
        text: content,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
        model: data.model,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`视觉聊天请求失败: ${message}`);
    }
  }

  /**
   * 终止
   */
  async terminate(): Promise<void> {
    this._isAvailable = false;
    this.emit('terminated');
  }

  /**
   * 转换消息格式
   */
  private convertMessages(messages: AIMessage[]): OpenAIChatMessage[] {
    return messages.map(msg => {
      // 处理复合内容
      if (Array.isArray(msg.content)) {
        const textParts = msg.content
          .filter((c): c is AIMessageContent & { type: 'text' } => c.type === 'text')
          .map(c => c.text || '')
          .join('\n');
        return {
          role: msg.role,
          content: textParts,
        };
      }

      return {
        role: msg.role,
        content: msg.content,
      };
    });
  }

  /**
   * 转换带图片的消息格式
   */
  private convertMessagesWithImages(messages: AIMessage[], images: string[]): OpenAIChatMessage[] {
    const result: OpenAIChatMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'user' && images.length > 0) {
        // 为用户消息添加图片
        const content: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = [];

        // 添加文本内容
        if (typeof msg.content === 'string') {
          content.push({ type: 'text', text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const c of msg.content) {
            if (c.type === 'text' && c.text) {
              content.push({ type: 'text', text: c.text });
            }
          }
        }

        // 添加图片
        for (const imageBase64 of images) {
          content.push({
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${imageBase64}` },
          });
        }

        result.push({ role: msg.role, content });
      } else {
        // 非用户消息或没有图片
        result.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content :
            (msg.content as AIMessageContent[]).map(c => c.text || '').join('\n'),
        });
      }
    }

    return result;
  }
}
