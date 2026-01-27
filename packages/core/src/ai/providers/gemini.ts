/**
 * Google Gemini Provider
 * 免费额度大，支持视觉，速度快
 * https://ai.google.dev/
 */

import { EventEmitter } from 'events';
import type {
  IAIProvider,
  AIProviderConfig,
  AIMessage,
  AIResponse,
  ProviderCapabilities,
  ProviderHealthStatus,
  AIStreamCallback,
} from '../types';

export interface GeminiConfig extends AIProviderConfig {
  type: 'gemini';
  /** Gemini API Key */
  apiKey: string;
  /** 模型名称，默认 gemini-2.0-flash */
  model?: string;
}

interface GeminiContent {
  parts: GeminiPart[];
  role?: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiResponse {
  candidates: {
    content: GeminiContent;
    finishReason: string;
    safetyRatings?: any[];
  }[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GeminiProvider extends EventEmitter implements IAIProvider {
  readonly name = 'gemini' as const;
  readonly capabilities: ProviderCapabilities = {
    chat: true,
    vision: true,
    streaming: true,
    functionCalling: true,
    jsonOutput: true,
    embeddings: false,
    maxContextWindow: 1048576, // Gemini 2.0 Flash: 1M tokens
    supportedImageFormats: ['png', 'jpeg', 'webp', 'gif'],
  };
  private config: Required<GeminiConfig>;
  private _isAvailable: boolean = false;
  private baseUrl: string;

  constructor(config: GeminiConfig) {
    super();
    this.config = {
      model: 'gemini-2.0-flash-exp',  // 最新免费模型
      maxTokens: 8192,
      temperature: 0.7,
      timeout: 60000,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      ...config,
    } as Required<GeminiConfig>;

    this.baseUrl = this.config.baseUrl;
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  /**
   * 初始化：验证 API Key
   */
  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('Gemini API Key 未配置');
    }

    try {
      // 验证 API Key（列出模型）
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.config.apiKey}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `API 验证失败: ${response.status}`);
      }

      this._isAvailable = true;
      this.emit('initialized');
    } catch (error) {
      this._isAvailable = false;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Gemini 初始化失败: ${message}\n` +
        '请确保:\n' +
        '1. API Key 正确 (获取: https://aistudio.google.com/apikey)\n' +
        '2. 网络连接正常'
      );
    }
  }

  /**
   * 文本对话
   */
  async chat(messages: AIMessage[]): Promise<AIResponse> {
    const startTime = Date.now();

    const contents = this.convertMessages(messages);

    const response = await fetch(
      `${this.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: this.config.temperature,
            maxOutputTokens: this.config.maxTokens,
          },
        }),
        signal: AbortSignal.timeout(this.config.timeout),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Gemini 请求失败: ${error.error?.message || response.statusText}`);
    }

    const data: GeminiResponse = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('Gemini 没有返回有效响应');
    }

    const text = data.candidates[0].content.parts
      .map(p => p.text || '')
      .join('');

    return {
      text,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined,
      model: this.config.model,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 带图像的对话（视觉理解）
   */
  async chatWithVision(messages: AIMessage[], images: string[]): Promise<AIResponse> {
    const startTime = Date.now();

    const contents = this.convertMessagesWithImages(messages, images);

    const response = await fetch(
      `${this.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: this.config.temperature,
            maxOutputTokens: this.config.maxTokens,
          },
        }),
        signal: AbortSignal.timeout(this.config.timeout),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Gemini 视觉请求失败: ${error.error?.message || response.statusText}`);
    }

    const data: GeminiResponse = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('Gemini 没有返回有效响应');
    }

    const text = data.candidates[0].content.parts
      .map(p => p.text || '')
      .join('');

    return {
      text,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined,
      model: this.config.model,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 转换消息格式
   */
  private convertMessages(messages: AIMessage[]): GeminiContent[] {
    const contents: GeminiContent[] = [];

    // Gemini 不支持 system role，需要特殊处理
    let systemPrompt = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = typeof msg.content === 'string'
          ? msg.content
          : msg.content.map(c => c.text || '').join('\n');
        continue;
      }

      const text = typeof msg.content === 'string'
        ? msg.content
        : msg.content.map(c => c.text || '').join('\n');

      // 将 system prompt 添加到第一条 user 消息
      const finalText = msg.role === 'user' && systemPrompt && contents.length === 0
        ? `${systemPrompt}\n\n${text}`
        : text;

      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: finalText }],
      });
    }

    return contents;
  }

  /**
   * 转换带图像的消息
   */
  private convertMessagesWithImages(messages: AIMessage[], images: string[]): GeminiContent[] {
    const contents: GeminiContent[] = [];
    let systemPrompt = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = typeof msg.content === 'string'
          ? msg.content
          : msg.content.map(c => c.text || '').join('\n');
        continue;
      }

      const parts: GeminiPart[] = [];

      if (typeof msg.content === 'string') {
        const text = msg.role === 'user' && systemPrompt && contents.length === 0
          ? `${systemPrompt}\n\n${msg.content}`
          : msg.content;
        parts.push({ text });
      } else {
        for (const item of msg.content) {
          if (item.type === 'text' && item.text) {
            const text = msg.role === 'user' && systemPrompt && contents.length === 0 && parts.length === 0
              ? `${systemPrompt}\n\n${item.text}`
              : item.text;
            parts.push({ text });
          } else if (item.type === 'image' && item.imageBase64) {
            parts.push({
              inlineData: {
                mimeType: item.mimeType || 'image/png',
                data: item.imageBase64,
              },
            });
          }
        }
      }

      // 添加额外的图像到 user 消息
      if (msg.role === 'user' && images.length > 0) {
        for (const img of images) {
          parts.push({
            inlineData: {
              mimeType: 'image/png',
              data: img,
            },
          });
        }
      }

      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      });
    }

    return contents;
  }

  /**
   * 流式对话
   */
  async chatStream(messages: AIMessage[], callback: AIStreamCallback): Promise<void> {
    const contents = this.convertMessages(messages);

    const response = await fetch(
      `${this.baseUrl}/models/${this.config.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: this.config.temperature,
            maxOutputTokens: this.config.maxTokens,
          },
        }),
        signal: AbortSignal.timeout(this.config.timeout),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      callback({ type: 'error', error: error.error?.message || response.statusText });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callback({ type: 'error', error: 'No response body' });
      return;
    }

    const decoder = new TextDecoder();
    let accumulated = '';
    let sseBuffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        // Keep the last (potentially incomplete) line in the buffer
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const data = JSON.parse(jsonStr);
            const text = data.candidates?.[0]?.content?.parts
              ?.map((p: any) => p.text || '')
              .join('') || '';

            if (text) {
              accumulated += text;
              callback({ type: 'token', token: text, accumulated });
            }

            if (data.candidates?.[0]?.finishReason) {
              callback({
                type: 'done',
                accumulated,
                finishReason: data.candidates[0].finishReason,
                usage: data.usageMetadata ? {
                  promptTokens: data.usageMetadata.promptTokenCount,
                  completionTokens: data.usageMetadata.candidatesTokenCount,
                  totalTokens: data.usageMetadata.totalTokenCount,
                } : undefined,
              });
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ProviderHealthStatus> {
    const start = Date.now();
    try {
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.config.apiKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const latencyMs = Date.now() - start;

      if (response.ok) {
        return {
          healthy: true,
          latencyMs,
          message: 'Gemini API is reachable',
          checkedAt: Date.now(),
          metrics: { modelVersion: this.config.model },
        };
      }
      return {
        healthy: false,
        latencyMs,
        message: `API returned ${response.status}`,
        checkedAt: Date.now(),
      };
    } catch (e: any) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: e.message,
        checkedAt: Date.now(),
      };
    }
  }

  async terminate(): Promise<void> {
    this._isAvailable = false;
    this.emit('terminated');
  }
}
