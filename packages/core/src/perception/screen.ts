/**
 * 屏幕感知模块
 * 支持屏幕截图、AI 视觉识别（使用 Gemini/Claude 等大模型）、变化检测
 */

import screenshot from 'screenshot-desktop';
import { EventEmitter } from 'events';
import type { ScreenCapture as ScreenCaptureResult } from '../types';

// ============ 类型定义 ============

export interface ScreenCaptureConfig {
  /** 截图间隔 (ms) */
  interval: number;
  /** 图片质量 */
  quality: 'low' | 'medium' | 'high';
  /** 是否启用 AI 视觉分析 */
  enableVision: boolean;
  /** 最大图片宽度 */
  maxWidth: number;
  /** 变化检测阈值 (0-1) */
  changeThreshold: number;
}

export interface VisionResult {
  /** 识别的文本内容 */
  text: string;
  /** 屏幕上的 UI 元素 */
  elements: UIElement[];
  /** AI 对屏幕内容的理解 */
  understanding: string;
  /** 检测到的用户意图 */
  possibleIntents: string[];
}

export interface UIElement {
  /** 元素类型 */
  type: 'button' | 'input' | 'text' | 'image' | 'menu' | 'dialog' | 'other';
  /** 元素文本 */
  text: string;
  /** 大致位置描述 */
  position: string;
}

export interface ExtendedScreenCapture extends ScreenCaptureResult {
  /** AI 视觉分析结果 */
  vision?: VisionResult;
  /** 截图 ID */
  id: string;
  /** 图片尺寸 */
  dimensions?: { width: number; height: number };
}

// AI 分析器接口
export interface VisionAnalyzer {
  analyze(imageBase64: string): Promise<VisionResult>;
}

// ============ 变化检测器 ============

class ChangeDetector {
  private threshold: number;

  constructor(threshold: number = 0.1) {
    this.threshold = threshold;
  }

  /**
   * 检测是否有显著变化
   */
  hasSignificantChange(
    prev: ExtendedScreenCapture | null,
    curr: ExtendedScreenCapture
  ): boolean {
    if (!prev) return true;

    // 方法 1: 比较 AI 分析结果
    if (prev.vision && curr.vision) {
      const similarity = this.calculateTextSimilarity(
        prev.vision.text + prev.vision.understanding,
        curr.vision.text + curr.vision.understanding
      );
      if (similarity < 1 - this.threshold) return true;
    }

    // 方法 2: 比较图片数据长度（粗略估计）
    const sizeDiff = Math.abs(
      prev.imageData.length - curr.imageData.length
    ) / Math.max(prev.imageData.length, 1);

    if (sizeDiff > this.threshold) return true;

    return false;
  }

  /**
   * 计算文本相似度 (Jaccard 相似度)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(Boolean));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(Boolean));

    if (words1.size === 0 && words2.size === 0) return 1;

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

// ============ 屏幕感知类 ============

export class ScreenCapture extends EventEmitter {
  private config: ScreenCaptureConfig;
  private captureTimer: NodeJS.Timeout | null = null;
  private lastCapture: ExtendedScreenCapture | null = null;
  private changeDetector: ChangeDetector;
  private captureCount: number = 0;
  private visionAnalyzer: VisionAnalyzer | null = null;

  constructor(config: Partial<ScreenCaptureConfig> = {}) {
    super();
    this.config = {
      interval: 5000,
      quality: 'medium',
      enableVision: false,  // 默认关闭，由 AI Manager 控制
      maxWidth: 1920,
      changeThreshold: 0.1,
      ...config,
    };
    this.changeDetector = new ChangeDetector(this.config.changeThreshold);
  }

  /**
   * 设置 AI 视觉分析器（由 AI Manager 注入）
   */
  setVisionAnalyzer(analyzer: VisionAnalyzer): void {
    this.visionAnalyzer = analyzer;
    this.emit('vision-analyzer-set');
  }

  /**
   * 开始持续截图
   */
  async start(): Promise<void> {
    if (this.captureTimer) return;

    this.emit('started');

    // 立即执行一次
    await this.captureAndEmit();

    // 定时执行
    this.captureTimer = setInterval(async () => {
      await this.captureAndEmit();
    }, this.config.interval);
  }

  /**
   * 停止持续截图
   */
  async stop(): Promise<void> {
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }

    this.emit('stopped');
  }

  /**
   * 捕获单次屏幕截图
   */
  async capture(displayIndex?: number): Promise<ExtendedScreenCapture> {
    const startTime = Date.now();
    const captureId = this.generateId();

    console.log(`\n[Screenshot] ====== 开始截图 #${this.captureCount + 1} ======`);
    console.log(`[Screenshot] 截图 ID: ${captureId}`);
    console.log(`[Screenshot] 时间: ${new Date().toISOString()}`);
    console.log(`[Screenshot] 显示器索引: ${displayIndex ?? '默认'}`);

    try {
      const imgBuffer = await screenshot({ format: 'png', screen: displayIndex });
      const base64Data = imgBuffer.toString('base64');
      const captureTime = Date.now() - startTime;

      console.log(`[Screenshot] 截图完成，耗时: ${captureTime}ms`);
      console.log(`[Screenshot] 图片大小: ${(imgBuffer.length / 1024).toFixed(2)} KB`);
      console.log(`[Screenshot] Base64 长度: ${(base64Data.length / 1024).toFixed(2)} KB`);

      const result: ExtendedScreenCapture = {
        id: captureId,
        imageData: base64Data,
        format: 'png',
        timestamp: Date.now(),
        displayIndex,
      };

      // AI 视觉分析
      if (this.config.enableVision && this.visionAnalyzer) {
        console.log(`[Screenshot] 开始 AI 视觉分析...`);
        const visionStart = Date.now();
        try {
          result.vision = await this.visionAnalyzer.analyze(base64Data);
          console.log(`[Screenshot] AI 视觉分析完成，耗时: ${Date.now() - visionStart}ms`);
        } catch (visionError) {
          console.error(`[Screenshot] AI 视觉分析失败:`, visionError);
          this.emit('vision-error', visionError);
        }
      }

      console.log(`[Screenshot] ====== 截图完成 ======\n`);
      this.emit('capture', result, Date.now() - startTime);

      return result;
    } catch (error) {
      console.error(`[Screenshot] ====== 截图失败 ======`);
      console.error(`[Screenshot] 错误: ${error instanceof Error ? error.message : String(error)}`);
      const err = new Error(`截图失败: ${error instanceof Error ? error.message : String(error)}`);
      // Don't emit error here - let captureAndEmit handle it to avoid double emission
      throw err;
    }
  }

  /**
   * 获取所有显示器列表
   */
  async listDisplays(): Promise<string[]> {
    try {
      const displays = await screenshot.listDisplays();
      return displays.map((d: { id: number; name: string }) => d.name || String(d.id));
    } catch (error) {
      throw new Error(`获取显示器列表失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ScreenCaptureConfig>): void {
    this.config = { ...this.config, ...config };
    this.changeDetector = new ChangeDetector(this.config.changeThreshold);
    this.emit('config-updated', this.config);
  }

  /**
   * 获取最后一次截图
   */
  getLastCapture(): ExtendedScreenCapture | null {
    return this.lastCapture;
  }

  /**
   * 获取截图统计
   */
  getStats(): { captureCount: number; lastCaptureTime: number | null } {
    return {
      captureCount: this.captureCount,
      lastCaptureTime: this.lastCapture?.timestamp ?? null,
    };
  }

  // ============ 私有方法 ============

  private async captureAndEmit(): Promise<void> {
    try {
      const capture = await this.capture();
      this.captureCount++;

      // 检测变化
      if (this.changeDetector.hasSignificantChange(this.lastCapture, capture)) {
        this.emit('screen:changed', capture, this.lastCapture);
      }

      this.lastCapture = capture;
    } catch (error) {
      this.emit('error', error);
    }
  }

  private generateId(): string {
    return `screen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// 导出默认实例
export const screenCapture = new ScreenCapture();
