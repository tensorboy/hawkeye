/**
 * Vision Direct Executor - 视觉直接执行器
 *
 * 参考 UI-TARS 的端到端 Vision→Action 设计
 * 提供单次模型调用直接输出动作和坐标的能力
 *
 * 与传统管道的对比:
 * - 传统: Screenshot → OCR → Intent → Plan → Shell command (多阶段)
 * - Vision-Direct: Screenshot → VLM → {action, x, y} (单阶段)
 *
 * 优势:
 * - 更低延迟 (单次模型调用)
 * - 更少故障点
 * - 像素级精确
 *
 * 适用场景:
 * - 简单的点击任务
 * - 实时交互
 * - 视觉密集型操作
 */

import { EventEmitter } from 'events';
import type { IAIProvider, AIMessage } from '../ai/types';
import type { Point } from '../grounding/types';

// ============ 类型定义 ============

/**
 * 视觉动作类型
 */
export type VisionActionType =
  | 'click'        // 点击
  | 'double_click' // 双击
  | 'right_click'  // 右键点击
  | 'type'         // 输入文本
  | 'scroll'       // 滚动
  | 'drag'         // 拖拽
  | 'hover'        // 悬停
  | 'wait'         // 等待
  | 'done'         // 任务完成
  | 'fail';        // 无法完成

/**
 * 视觉动作
 */
export interface VisionAction {
  /** 动作类型 */
  type: VisionActionType;
  /** 坐标 (对于 click, hover, drag 等) */
  coordinate?: Point;
  /** 结束坐标 (对于 drag) */
  endCoordinate?: Point;
  /** 文本 (对于 type) */
  text?: string;
  /** 滚动方向和距离 */
  scroll?: {
    direction: 'up' | 'down' | 'left' | 'right';
    amount: number;
  };
  /** 等待时间 (ms) */
  waitTime?: number;
  /** 置信度 */
  confidence: number;
  /** 描述 */
  description: string;
  /** 目标元素描述 */
  targetElement?: string;
}

/**
 * 视觉执行结果
 */
export interface VisionExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 执行的动作 */
  action: VisionAction;
  /** 错误信息 */
  error?: string;
  /** 执行时间 (ms) */
  executionTime: number;
  /** 截图后状态 (base64) */
  afterScreenshot?: string;
}

/**
 * Vision Direct 配置
 */
export interface VisionDirectConfig {
  /** 使用的 AI Provider */
  provider?: IAIProvider;
  /** 最大重试次数 */
  maxRetries: number;
  /** 置信度阈值 */
  confidenceThreshold: number;
  /** 是否启用截图后验证 */
  enablePostValidation: boolean;
  /** 系统提示 */
  systemPrompt: string;
}

/**
 * 默认系统提示
 */
const DEFAULT_SYSTEM_PROMPT = `You are a vision-based computer control agent. Your task is to analyze screenshots and execute user tasks by generating precise actions.

IMPORTANT RULES:
1. Always output a valid JSON response
2. Coordinates should be in pixels from the top-left corner
3. Only suggest one action at a time
4. If you cannot complete the task, return type "fail" with an explanation

OUTPUT FORMAT:
{
  "type": "click" | "double_click" | "right_click" | "type" | "scroll" | "drag" | "hover" | "wait" | "done" | "fail",
  "coordinate": {"x": number, "y": number},  // for click, hover, drag start
  "endCoordinate": {"x": number, "y": number},  // for drag end
  "text": "string",  // for type action
  "scroll": {"direction": "up" | "down" | "left" | "right", "amount": number},
  "waitTime": number,  // milliseconds for wait
  "confidence": number,  // 0.0 to 1.0
  "description": "string",  // what this action does
  "targetElement": "string"  // description of target element
}`;

/**
 * 默认配置
 */
const DEFAULT_CONFIG: VisionDirectConfig = {
  maxRetries: 2,
  confidenceThreshold: 0.7,
  enablePostValidation: true,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

// ============ Vision Direct Executor ============

/**
 * VisionDirectExecutor - 视觉直接执行器
 *
 * 提供单次视觉模型调用直接生成动作的能力
 */
export class VisionDirectExecutor extends EventEmitter {
  private config: VisionDirectConfig;
  private provider: IAIProvider | null = null;

  constructor(config: Partial<VisionDirectConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config.provider) {
      this.provider = config.provider;
    }
  }

  /**
   * 设置 AI Provider
   */
  setProvider(provider: IAIProvider): void {
    this.provider = provider;
  }

  /**
   * 从视觉生成动作
   */
  async generateAction(
    screenshot: Buffer | string,
    task: string,
    context?: {
      previousActions?: VisionAction[];
      appName?: string;
      windowTitle?: string;
    }
  ): Promise<VisionAction> {
    if (!this.provider) {
      throw new Error('AI Provider not set. Call setProvider() first.');
    }

    const screenshotBase64 = Buffer.isBuffer(screenshot)
      ? screenshot.toString('base64')
      : screenshot;

    // 构建上下文信息
    let contextInfo = '';
    if (context) {
      if (context.appName) {
        contextInfo += `\nCurrent Application: ${context.appName}`;
      }
      if (context.windowTitle) {
        contextInfo += `\nWindow Title: ${context.windowTitle}`;
      }
      if (context.previousActions && context.previousActions.length > 0) {
        const recentActions = context.previousActions.slice(-3);
        contextInfo += `\nRecent Actions:\n${recentActions
          .map((a, i) => `${i + 1}. ${a.type}: ${a.description}`)
          .join('\n')}`;
      }
    }

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: this.config.systemPrompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Task: ${task}${contextInfo}\n\nAnalyze the screenshot and generate the next action to complete this task.`,
          },
          {
            type: 'image',
            imageBase64: screenshotBase64,
            mimeType: 'image/png',
          },
        ],
      },
    ];

    this.emit('generating', { task, context });

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.provider.chatWithVision(messages, [screenshotBase64]);
        const action = this.parseActionResponse(response.text);

        // 验证置信度
        if (action.confidence < this.config.confidenceThreshold) {
          console.warn(
            `[VisionDirect] Low confidence action (${action.confidence}): ${action.description}`
          );
        }

        this.emit('generated', { action, attempt });
        return action;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[VisionDirect] Attempt ${attempt + 1} failed:`, lastError.message);

        if (attempt < this.config.maxRetries) {
          await this.delay(1000 * (attempt + 1));
        }
      }
    }

    // 所有重试都失败
    this.emit('error', lastError);
    return {
      type: 'fail',
      confidence: 0,
      description: `Failed to generate action: ${lastError?.message}`,
    };
  }

  /**
   * 执行视觉任务 (生成 + 执行)
   *
   * 注意: 实际执行需要与 NutJS 或其他执行器配合
   * 这里只生成动作，由调用方执行
   */
  async planExecution(
    screenshot: Buffer | string,
    task: string,
    maxSteps: number = 10
  ): Promise<VisionAction[]> {
    const actions: VisionAction[] = [];

    for (let step = 0; step < maxSteps; step++) {
      const action = await this.generateAction(screenshot, task, {
        previousActions: actions,
      });

      actions.push(action);

      // 检查终止条件
      if (action.type === 'done' || action.type === 'fail') {
        break;
      }

      // 如果是等待动作，继续
      if (action.type === 'wait') {
        continue;
      }

      // 需要新截图才能继续 (由调用方处理)
      break;
    }

    return actions;
  }

  /**
   * 验证动作执行结果
   */
  async validateExecution(
    beforeScreenshot: Buffer | string,
    afterScreenshot: Buffer | string,
    action: VisionAction,
    expectedChange: string
  ): Promise<{
    success: boolean;
    confidence: number;
    explanation: string;
  }> {
    if (!this.provider) {
      throw new Error('AI Provider not set');
    }

    const beforeBase64 = Buffer.isBuffer(beforeScreenshot)
      ? beforeScreenshot.toString('base64')
      : beforeScreenshot;

    const afterBase64 = Buffer.isBuffer(afterScreenshot)
      ? afterScreenshot.toString('base64')
      : afterScreenshot;

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a validation agent. Compare before and after screenshots to determine if an action was successful.

OUTPUT FORMAT (JSON):
{
  "success": boolean,
  "confidence": number (0.0 to 1.0),
  "explanation": "string describing what changed or why it failed"
}`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Action performed: ${action.type} - ${action.description}
Expected change: ${expectedChange}

Compare the before and after screenshots to determine if the action was successful.`,
          },
          {
            type: 'image',
            imageBase64: beforeBase64,
            mimeType: 'image/png',
          },
          {
            type: 'image',
            imageBase64: afterBase64,
            mimeType: 'image/png',
          },
        ],
      },
    ];

    const response = await this.provider.chatWithVision(messages, [beforeBase64, afterBase64]);

    try {
      const result = JSON.parse(this.extractJSON(response.text));
      return {
        success: result.success ?? false,
        confidence: result.confidence ?? 0,
        explanation: result.explanation ?? 'Unknown',
      };
    } catch {
      return {
        success: false,
        confidence: 0,
        explanation: `Failed to parse validation response: ${response.text}`,
      };
    }
  }

  /**
   * 获取配置
   */
  getConfig(): VisionDirectConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<VisionDirectConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ============ 私有方法 ============

  private parseActionResponse(response: string): VisionAction {
    try {
      const jsonStr = this.extractJSON(response);
      const parsed = JSON.parse(jsonStr);

      return {
        type: parsed.type || 'fail',
        coordinate: parsed.coordinate,
        endCoordinate: parsed.endCoordinate,
        text: parsed.text,
        scroll: parsed.scroll,
        waitTime: parsed.waitTime,
        confidence: parsed.confidence ?? 0.5,
        description: parsed.description || 'No description',
        targetElement: parsed.targetElement,
      };
    } catch (error) {
      console.error('[VisionDirect] Failed to parse response:', response);
      return {
        type: 'fail',
        confidence: 0,
        description: `Failed to parse response: ${error}`,
      };
    }
  }

  private extractJSON(text: string): string {
    // 尝试直接解析
    try {
      JSON.parse(text);
      return text;
    } catch {
      // 尝试提取 JSON 块
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return jsonMatch[0];
      }
      throw new Error('No valid JSON found in response');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============ 单例支持 ============

let globalVisionDirectExecutor: VisionDirectExecutor | null = null;

export function getVisionDirectExecutor(): VisionDirectExecutor {
  if (!globalVisionDirectExecutor) {
    globalVisionDirectExecutor = new VisionDirectExecutor();
  }
  return globalVisionDirectExecutor;
}

export function createVisionDirectExecutor(
  config?: Partial<VisionDirectConfig>
): VisionDirectExecutor {
  return new VisionDirectExecutor(config);
}

export function setVisionDirectExecutor(executor: VisionDirectExecutor): void {
  globalVisionDirectExecutor = executor;
}
