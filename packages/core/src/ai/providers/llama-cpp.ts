/**
 * LlamaCpp Provider
 * 使用 node-llama-cpp 直接在 Electron 主进程中运行本地 LLM
 * 完全离线，零成本，支持 Metal GPU 加速
 * https://github.com/withcatai/node-llama-cpp
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

export interface LlamaCppConfig extends AIProviderConfig {
  type: 'llama-cpp';
  /** GGUF 模型文件路径 */
  modelPath: string;
  /** GPU 加速模式: 'metal' | 'cuda' | 'auto' | 'disabled' */
  gpuAcceleration?: 'metal' | 'cuda' | 'auto' | 'disabled';
  /** 上下文大小，默认 4096 */
  contextSize?: number;
  /** GPU Layers，-1 表示全部 */
  gpuLayers?: number;
}

// node-llama-cpp 类型（动态导入）
interface LlamaModule {
  getLlama: (options?: { gpu?: 'metal' | 'cuda' | 'auto' | false }) => Promise<LlamaInstance>;
}

interface LlamaInstance {
  loadModel: (options: { modelPath: string }) => Promise<LlamaModel>;
}

interface LlamaModel {
  createContext: (options?: { contextSize?: number }) => Promise<LlamaContext>;
  dispose: () => Promise<void>;
}

interface LlamaContext {
  getSequence: () => LlamaContextSequence;
  dispose: () => Promise<void>;
}

interface LlamaContextSequence {
  // Sequence methods
}

interface LlamaChatSession {
  prompt: (text: string, options?: {
    onTextChunk?: (text: string) => void;
    maxTokens?: number;
  }) => Promise<string>;
}

interface LlamaChatSessionClass {
  new (options: { contextSequence: LlamaContextSequence; systemPrompt?: string }): LlamaChatSession;
}

export class LlamaCppProvider extends EventEmitter implements IAIProvider {
  readonly name = 'llama-cpp' as const;
  readonly capabilities: ProviderCapabilities = {
    chat: true,
    vision: false, // depends on loaded model (LLaVA etc.)
    streaming: true,
    functionCalling: false,
    jsonOutput: false,
    embeddings: false,
    maxContextWindow: 4096,
  };
  private config: Required<LlamaCppConfig>;
  private _isAvailable: boolean = false;

  // node-llama-cpp 实例（延迟加载）
  private llama: LlamaInstance | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private LlamaChatSessionClass: LlamaChatSessionClass | null = null;

  constructor(config: LlamaCppConfig) {
    super();
    this.config = {
      gpuAcceleration: 'auto',
      contextSize: 4096,
      gpuLayers: -1,
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 120000,
      baseUrl: '',
      ...config,
    } as Required<LlamaCppConfig>;
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  /**
   * 初始化：加载 node-llama-cpp 模块和模型
   */
  async initialize(): Promise<void> {
    try {
      // 检查模型文件路径
      if (!this.config.modelPath) {
        throw new Error('模型路径未配置');
      }

      // 动态导入 node-llama-cpp（ESM 模块）
      const nodeLlamaCpp = await import('node-llama-cpp') as unknown as LlamaModule & {
        LlamaChatSession: LlamaChatSessionClass;
      };

      // 确定 GPU 加速模式
      let gpuOption: 'metal' | 'cuda' | 'auto' | false;
      switch (this.config.gpuAcceleration) {
        case 'metal':
          gpuOption = 'metal';
          break;
        case 'cuda':
          gpuOption = 'cuda';
          break;
        case 'disabled':
          gpuOption = false;
          break;
        case 'auto':
        default:
          gpuOption = 'auto';
      }

      // 获取 Llama 实例
      this.llama = await nodeLlamaCpp.getLlama({ gpu: gpuOption });

      // 加载模型
      console.log(`[LlamaCpp] 正在加载模型: ${this.config.modelPath}`);
      this.model = await this.llama.loadModel({
        modelPath: this.config.modelPath,
      });

      // 创建上下文
      this.context = await this.model.createContext({
        contextSize: this.config.contextSize,
      });

      // 保存 LlamaChatSession 类引用
      this.LlamaChatSessionClass = nodeLlamaCpp.LlamaChatSession;

      this._isAvailable = true;
      this.emit('initialized');
      console.log('[LlamaCpp] 模型加载完成');
    } catch (error) {
      this._isAvailable = false;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `LlamaCpp 初始化失败: ${message}\n` +
        '请确保:\n' +
        '1. 模型文件存在且为有效的 GGUF 格式\n' +
        '2. node-llama-cpp 已正确安装\n' +
        '3. 系统支持所选的 GPU 加速模式'
      );
    }
  }

  /**
   * 文本对话
   */
  async chat(messages: AIMessage[]): Promise<AIResponse> {
    if (!this.context || !this.LlamaChatSessionClass) {
      throw new Error('LlamaCpp 未初始化');
    }

    const startTime = Date.now();

    // 提取 system prompt 和用户消息
    const { systemPrompt, userPrompt } = this.extractPrompts(messages);

    // 创建聊天会话
    const session = new this.LlamaChatSessionClass({
      contextSequence: this.context.getSequence(),
      systemPrompt,
    });

    // 执行推理
    let responseText = '';

    try {
      responseText = await session.prompt(userPrompt, {
        maxTokens: this.config.maxTokens,
        onTextChunk: (text) => {
          this.emit('token', text);
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`LlamaCpp 推理失败: ${message}`);
    } finally {
      // 释放会话资源，防止内存泄漏
      if (typeof (session as any).dispose === 'function') {
        (session as any).dispose();
      }
    }

    // 粗略估算 token 数（按 4 字符 ≈ 1 token）
    const estimatedTokens = Math.ceil(responseText.length / 4);

    return {
      text: responseText,
      usage: {
        promptTokens: 0,
        completionTokens: estimatedTokens,
        totalTokens: estimatedTokens,
      },
      model: this.config.modelPath.split('/').pop() || 'local-model',
      duration: Date.now() - startTime,
    };
  }

  /**
   * 带图像的对话（视觉理解）
   * 注意：需要加载支持视觉的模型（如 LLaVA）
   */
  async chatWithVision(messages: AIMessage[], images: string[]): Promise<AIResponse> {
    if (!this.context || !this.LlamaChatSessionClass) {
      throw new Error('LlamaCpp 未初始化');
    }

    const startTime = Date.now();

    // 提取 system prompt 和用户消息
    const { systemPrompt, userPrompt } = this.extractPromptsWithImages(messages, images);

    // 创建聊天会话
    const session = new this.LlamaChatSessionClass({
      contextSequence: this.context.getSequence(),
      systemPrompt,
    });

    // 执行推理
    let responseText = '';

    try {
      // 对于视觉模型，图像数据需要特殊处理
      // node-llama-cpp 3.x 支持通过 prompt 中嵌入图像
      responseText = await session.prompt(userPrompt, {
        maxTokens: this.config.maxTokens,
        onTextChunk: (text) => {
          this.emit('token', text);
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`LlamaCpp 视觉推理失败: ${message}`);
    } finally {
      // 释放会话资源，防止内存泄漏
      if (typeof (session as any).dispose === 'function') {
        (session as any).dispose();
      }
    }

    const estimatedTokens = Math.ceil(responseText.length / 4);

    return {
      text: responseText,
      usage: {
        promptTokens: 0,
        completionTokens: estimatedTokens,
        totalTokens: estimatedTokens,
      },
      model: this.config.modelPath.split('/').pop() || 'local-model',
      duration: Date.now() - startTime,
    };
  }

  /**
   * 列出推荐模型
   */
  static getRecommendedModels(): { id: string; name: string; type: 'text' | 'vision'; size: string }[] {
    return [
      { id: 'Qwen/Qwen2.5-7B-Instruct-GGUF', name: 'Qwen 2.5 7B', type: 'text', size: '4.7GB' },
      { id: 'lmstudio-community/Llama-3.2-3B-Instruct-GGUF', name: 'Llama 3.2 3B', type: 'text', size: '2.0GB' },
      { id: 'microsoft/Phi-3-mini-4k-instruct-gguf', name: 'Phi-3 Mini', type: 'text', size: '2.4GB' },
      { id: 'cjpais/llava-1.6-mistral-7b-gguf', name: 'LLaVA 1.6 7B', type: 'vision', size: '4.5GB' },
    ];
  }

  /**
   * 流式对话
   */
  async chatStream(messages: AIMessage[], callback: AIStreamCallback): Promise<void> {
    if (!this.context || !this.LlamaChatSessionClass) {
      callback({ type: 'error', error: 'LlamaCpp 未初始化' });
      return;
    }

    const { systemPrompt, userPrompt } = this.extractPrompts(messages);
    const session = new this.LlamaChatSessionClass({
      contextSequence: this.context.getSequence(),
      systemPrompt,
    });

    let accumulated = '';

    try {
      await session.prompt(userPrompt, {
        maxTokens: this.config.maxTokens,
        onTextChunk: (text) => {
          accumulated += text;
          callback({ type: 'token', token: text, accumulated });
        },
      });
      callback({ type: 'done', accumulated });
    } catch (e: any) {
      callback({ type: 'error', error: e.message });
    } finally {
      if (typeof (session as any).dispose === 'function') {
        (session as any).dispose();
      }
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ProviderHealthStatus> {
    const start = Date.now();
    const healthy = this._isAvailable && this.model !== null && this.context !== null;
    return {
      healthy,
      latencyMs: Date.now() - start,
      message: healthy ? 'Local model loaded and ready' : 'Model not loaded',
      checkedAt: Date.now(),
      metrics: {
        modelVersion: this.config.modelPath.split('/').pop() || 'unknown',
      },
    };
  }

  /**
   * 终止并释放资源
   */
  async terminate(): Promise<void> {
    try {
      if (this.context) {
        await this.context.dispose();
        this.context = null;
      }
      if (this.model) {
        await this.model.dispose();
        this.model = null;
      }
      this.llama = null;
      this.LlamaChatSessionClass = null;
    } catch (error) {
      console.warn('[LlamaCpp] 资源释放时出错:', error);
    }

    this._isAvailable = false;
    this.emit('terminated');
  }

  // ============ 私有方法 ============

  /**
   * 从消息列表中提取 system prompt 和用户 prompt
   */
  private extractPrompts(messages: AIMessage[]): { systemPrompt: string; userPrompt: string } {
    let systemPrompt = '';
    const userParts: string[] = [];

    for (const msg of messages) {
      const content = typeof msg.content === 'string'
        ? msg.content
        : msg.content.map(c => c.text || '').join('\n');

      if (msg.role === 'system') {
        systemPrompt = content;
      } else if (msg.role === 'user') {
        userParts.push(content);
      } else if (msg.role === 'assistant') {
        // 将 assistant 消息作为对话历史的一部分
        userParts.push(`Assistant: ${content}`);
      }
    }

    return {
      systemPrompt,
      userPrompt: userParts.join('\n\nUser: '),
    };
  }

  /**
   * 从消息列表中提取 prompt（包含图像）
   *
   * TODO: 实现真正的视觉模型支持
   * node-llama-cpp 3.x 需要使用 LlamaImage 类来处理图像：
   *
   * ```typescript
   * import { LlamaImage } from 'node-llama-cpp';
   * const image = await LlamaImage.create(imageBuffer);
   * const response = await session.prompt([image, 'Describe this image']);
   * ```
   *
   * 当前实现仅支持文本模型，图像会被忽略
   */
  private extractPromptsWithImages(
    messages: AIMessage[],
    images: string[]
  ): { systemPrompt: string; userPrompt: string } {
    let systemPrompt = '';
    const userParts: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = typeof msg.content === 'string'
          ? msg.content
          : msg.content.map(c => c.text || '').join('\n');
      } else if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          userParts.push(msg.content);
        } else {
          for (const part of msg.content) {
            if (part.type === 'text' && part.text) {
              userParts.push(part.text);
            }
            // TODO: 使用 LlamaImage 处理图像
            // 需要将 base64 图像转换为 Buffer，然后创建 LlamaImage 实例
          }
        }
      }
    }

    // 警告：图像未被实际处理
    if (images.length > 0) {
      console.warn(`[LlamaCpp] 警告: 当前版本暂不支持视觉模型，${images.length} 张图像将被忽略`);
      userParts.push(`[系统提示: 用户发送了 ${images.length} 张图像，但当前模型不支持视觉处理]`);
    }

    return {
      systemPrompt,
      userPrompt: userParts.join('\n'),
    };
  }
}
