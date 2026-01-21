/**
 * Ollama Provider
 * 本地大模型，零成本，完全离线
 * https://ollama.ai
 */

import { EventEmitter } from 'events';
import type {
  IAIProvider,
  AIProviderConfig,
  AIMessage,
  AIResponse,
} from '../types';

export interface OllamaConfig extends AIProviderConfig {
  type: 'ollama';
  /** Ollama 服务地址，默认 http://localhost:11434 */
  baseUrl?: string;
  /** 模型名称，默认 llama3.2-vision (支持视觉) */
  model?: string;
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider extends EventEmitter implements IAIProvider {
  readonly name = 'ollama' as const;
  private config: Required<OllamaConfig>;
  private _isAvailable: boolean = false;

  constructor(config: OllamaConfig) {
    super();
    this.config = {
      type: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2-vision',  // 支持视觉的默认模型
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 60000,
      ...config,
    } as Required<OllamaConfig>;
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  /**
   * 初始化：检查 Ollama 服务是否运行
   */
  async initialize(): Promise<void> {
    try {
      // 检查 Ollama 服务
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error('Ollama 服务响应异常');
      }

      const data = await response.json();
      const models = data.models || [];

      // 检查是否有可用模型
      if (models.length === 0) {
        console.warn('Ollama 没有已安装的模型，请运行: ollama pull llama3.2-vision');
      }

      // 检查指定模型是否存在
      const hasModel = models.some((m: { name: string }) =>
        m.name.includes(this.config.model.split(':')[0])
      );

      if (!hasModel) {
        console.warn(
          `模型 ${this.config.model} 未找到，可用模型: ${models.map((m: { name: string }) => m.name).join(', ')}`
        );
        // 尝试使用第一个可用模型
        if (models.length > 0) {
          this.config.model = models[0].name;
          console.log(`使用模型: ${this.config.model}`);
        }
      }

      this._isAvailable = true;
      this.emit('initialized');
    } catch (error) {
      this._isAvailable = false;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Ollama 初始化失败: ${message}\n` +
        '请确保:\n' +
        '1. Ollama 已安装 (https://ollama.ai)\n' +
        '2. Ollama 服务正在运行 (ollama serve)\n' +
        '3. 已下载模型 (ollama pull llama3.2-vision)'
      );
    }
  }

  /**
   * 文本对话
   */
  async chat(messages: AIMessage[]): Promise<AIResponse> {
    const startTime = Date.now();

    const ollamaMessages = messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string'
        ? msg.content
        : msg.content.map(c => c.text || '').join('\n'),
    }));

    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama 请求失败: ${response.status} ${response.statusText}`);
    }

    const data: OllamaChatResponse = await response.json();

    return {
      text: data.message.content,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      model: data.model,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 带图像的对话（视觉理解）
   */
  async chatWithVision(messages: AIMessage[], images: string[]): Promise<AIResponse> {
    const startTime = Date.now();

    // 构建带图像的消息
    const ollamaMessages = messages.map(msg => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }

      // 处理多模态内容
      const textParts: string[] = [];
      const imageParts: string[] = [];

      for (const part of msg.content) {
        if (part.type === 'text' && part.text) {
          textParts.push(part.text);
        } else if (part.type === 'image' && part.imageBase64) {
          imageParts.push(part.imageBase64);
        }
      }

      return {
        role: msg.role,
        content: textParts.join('\n'),
        images: imageParts,
      };
    });

    // 如果有额外的图像，添加到最后一条用户消息
    if (images.length > 0) {
      const lastUserMsg = ollamaMessages.findLast(m => m.role === 'user');
      if (lastUserMsg) {
        (lastUserMsg as any).images = [
          ...((lastUserMsg as any).images || []),
          ...images,
        ];
      }
    }

    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama 视觉请求失败: ${response.status} ${response.statusText}`);
    }

    const data: OllamaChatResponse = await response.json();

    return {
      text: data.message.content,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      model: data.model,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 列出可用模型
   */
  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.config.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error('获取模型列表失败');
    }
    const data = await response.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  }

  /**
   * 下载模型
   */
  async pullModel(modelName: string): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: false }),
    });

    if (!response.ok) {
      throw new Error(`下载模型失败: ${response.statusText}`);
    }
  }

  async terminate(): Promise<void> {
    this._isAvailable = false;
    this.emit('terminated');
  }
}
