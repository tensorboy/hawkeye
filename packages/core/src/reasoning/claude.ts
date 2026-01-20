/**
 * Claude API 客户端
 */

import Anthropic from '@anthropic-ai/sdk';
import type { PerceptionContext, TaskSuggestion } from '../types';

export interface ClaudeClientConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class ClaudeClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: ClaudeClientConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 4096;
  }

  /**
   * 分析感知上下文，生成任务建议
   */
  async analyze(context: PerceptionContext): Promise<TaskSuggestion[]> {
    const messages: Anthropic.MessageParam[] = [];

    // 构建消息内容
    const content: Anthropic.ContentBlockParam[] = [];

    // 添加系统提示
    const systemPrompt = this.buildSystemPrompt();

    // 添加图像（如果有屏幕截图）
    if (context.screenshot?.imageData) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: `image/${context.screenshot.format}`,
          data: context.screenshot.imageData,
        },
      });
    }

    // 添加文本上下文
    content.push({
      type: 'text',
      text: this.buildContextPrompt(context),
    });

    messages.push({
      role: 'user',
      content,
    });

    // 调用 Claude API
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages,
    });

    // 解析响应
    return this.parseResponse(response);
  }

  /**
   * 简单的文本分析（不带截图）
   */
  async analyzeText(text: string, additionalContext?: string): Promise<TaskSuggestion[]> {
    const systemPrompt = this.buildSystemPrompt();

    const userPrompt = additionalContext
      ? `上下文:\n${additionalContext}\n\n用户输入:\n${text}`
      : text;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    return this.parseResponse(response);
  }

  private buildSystemPrompt(): string {
    return `你是 Hawkeye，一个智能任务感知助手。你的职责是：

1. 分析用户当前的屏幕内容和上下文
2. 理解用户可能的意图和需求
3. 生成具体、可执行的任务建议

请以 JSON 格式返回建议列表，格式如下：
{
  "suggestions": [
    {
      "title": "简短的任务标题",
      "description": "详细描述",
      "type": "shell|file|browser|app|code|compound",
      "confidence": 0.0-1.0,
      "actions": [
        {
          "type": "run_shell|read_file|write_file|edit_file|open_url|open_app|click|type_text",
          "params": { ... },
          "description": "动作描述"
        }
      ]
    }
  ]
}

注意：
- 只返回 JSON，不要包含其他解释
- 建议应该具体且可执行
- 根据上下文推断用户最可能需要的操作
- 优先推荐最相关、最有帮助的任务`;
  }

  private buildContextPrompt(context: PerceptionContext): string {
    const parts: string[] = ['请分析以下上下文，给出任务建议：\n'];

    if (context.activeWindow) {
      parts.push(`当前窗口: ${context.activeWindow.appName}`);
      if (context.activeWindow.title) {
        parts.push(`窗口标题: ${context.activeWindow.title}`);
      }
    }

    if (context.clipboard) {
      parts.push(`剪贴板内容: ${context.clipboard.substring(0, 500)}${context.clipboard.length > 500 ? '...' : ''}`);
    }

    if (context.screenshot) {
      parts.push('\n[屏幕截图已附上，请分析其中的内容]');
    }

    return parts.join('\n');
  }

  private parseResponse(response: Anthropic.Message): TaskSuggestion[] {
    try {
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        return [];
      }

      const text = textBlock.text;

      // 尝试提取 JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('无法从响应中提取 JSON');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const suggestions = parsed.suggestions || [];

      // 添加 ID 和时间戳
      return suggestions.map((s: Omit<TaskSuggestion, 'id' | 'createdAt'>, index: number) => ({
        ...s,
        id: `suggestion-${Date.now()}-${index}`,
        createdAt: Date.now(),
      }));
    } catch (error) {
      console.error('解析 Claude 响应失败:', error);
      return [];
    }
  }
}
