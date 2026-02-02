/**
 * 感知引擎 - 整合所有感知能力
 * 统一管理屏幕、窗口、剪贴板、文件系统的监控
 */

import { EventEmitter } from 'events';
import { ScreenCapture, ExtendedScreenCapture, VisionAnalyzer } from './screen';
import { WindowTracker } from './window';
import { ClipboardWatcher } from './clipboard';
import { OCRManager, OCRResult } from './ocr';
import { getUIParserPipeline, UIParserPipeline } from './ui-parser';
import { FileWatcher, FileEvent } from '../watcher/file-watcher';
import type { PerceptionContext, WindowInfo } from '../types';

// ============ 类型定义 ============

export interface PerceptionEngineConfig {
  /** 是否启用屏幕感知 */
  enableScreen: boolean;
  /** 是否启用窗口追踪 */
  enableWindow: boolean;
  /** 是否启用剪贴板监听 */
  enableClipboard: boolean;
  /** 是否启用文件监控 */
  enableFileWatch: boolean;
  /** 是否启用 OCR */
  enableOCR: boolean;
  /** 是否启用 UI 解析 */
  enableUIParser: boolean;
  /** 是否启用 AI 视觉分析 */
  enableVision: boolean;
  /** 屏幕截图间隔 (ms) */
  screenInterval: number;
  /** 剪贴板检查间隔 (ms) */
  clipboardInterval: number;
  /** 监控的文件路径 */
  watchPaths: string[];
  /** 忽略的文件模式 */
  ignoredPatterns: (string | RegExp)[];
}

export interface ExtendedPerceptionContext extends PerceptionContext {
  /** OCR 结果 */
  ocr?: OCRResult;
  /** 文件变化事件 */
  fileEvents?: FileEvent[];
  /** 上下文 ID */
  contextId: string;
  /** 创建时间 */
  createdAt: number;

  // ============ 便捷属性 (从 activeWindow 派生) ============

  /** 当前活动应用名 (派生自 activeWindow.owner.name) */
  activeApp?: string;
  /** 当前窗口标题 (派生自 activeWindow.title) */
  windowTitle?: string;
  /** 当前页面 URL (如果是浏览器窗口) */
  url?: string;
  /** 最近使用的应用列表 */
  recentApps?: string[];

  // ============ ASR 语音转录 ============

  /** 最近的语音转录文字 */
  speechText?: string;
  /** 语音转录语言 */
  speechLanguage?: string;
}

// ============ 感知引擎 ============

export class PerceptionEngine extends EventEmitter {
  private config: PerceptionEngineConfig;

  // 感知模块
  private screenCapture: ScreenCapture;
  private windowTracker: WindowTracker;
  private clipboardWatcher: ClipboardWatcher;
  private ocrManager: OCRManager;
  private uiParser: UIParserPipeline;
  private fileWatcher: FileWatcher | null = null;

  // 状态
  private isRunning: boolean = false;
  private lastContext: ExtendedPerceptionContext | null = null;
  private lastClipboard: string = '';
  private lastWindow: WindowInfo | null = null;
  private recentFileEvents: FileEvent[] = [];

  // 定时器
  private windowCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<PerceptionEngineConfig> = {}) {
    super();
    this.config = {
      enableScreen: true,
      enableWindow: true,
      enableClipboard: true,
      enableFileWatch: true,
      enableOCR: true,  // 默认开启 OCR
      enableUIParser: true, // 默认开启 UI 解析
      enableVision: false,  // 默认关闭，需要 AI Manager 配置
      screenInterval: 5000,
      clipboardInterval: 1000,
      watchPaths: [
        '~/Downloads',
        '~/Desktop',
        '~/Documents',
      ],
      ignoredPatterns: [
        /node_modules/,
        /\.git/,
        /\.DS_Store/,
        /\.tmp$/,
        /~$/,
      ],
      ...config,
    };

    // 初始化感知模块
    this.screenCapture = new ScreenCapture({
      interval: this.config.screenInterval,
      enableVision: this.config.enableVision,
    });
    this.windowTracker = new WindowTracker();
    this.clipboardWatcher = new ClipboardWatcher();
    this.ocrManager = new OCRManager();
    this.uiParser = getUIParserPipeline();

    // 设置事件监听
    this.setupEventListeners();
  }

  /**
   * 启动感知引擎
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.emit('starting');

    const startPromises: Promise<void>[] = [];

    // 启动屏幕感知
    if (this.config.enableScreen) {
      startPromises.push(
        this.screenCapture.start().catch(err => {
          console.warn('屏幕感知启动失败:', err.message);
        })
      );
    }

    // 启动剪贴板监听
    if (this.config.enableClipboard) {
      this.clipboardWatcher.startWatching(
        (content) => this.onClipboardChange(content),
        this.config.clipboardInterval
      );
    }

    // 启动窗口追踪
    if (this.config.enableWindow) {
      this.startWindowTracking();
    }

    // 启动文件监控
    if (this.config.enableFileWatch && this.config.watchPaths.length > 0) {
      try {
        this.fileWatcher = new FileWatcher({
          paths: this.config.watchPaths,
          recursive: true,
          ignored: this.config.ignoredPatterns,
        });

        this.fileWatcher.on('change', (event: FileEvent) => {
          this.onFileChange(event);
        });

        this.fileWatcher.on('error', (err) => {
          console.warn('[Perception] 文件监控错误:', err.message);
        });

        this.fileWatcher.start();
      } catch (err) {
        console.warn('[Perception] 文件监控启动失败:', err instanceof Error ? err.message : err);
        this.fileWatcher = null;
      }
    }

    // 初始化 OCR
    if (this.config.enableOCR) {
      startPromises.push(
        this.ocrManager.initialize().catch(err => {
          console.warn('OCR 初始化失败:', err.message);
        })
      );
    }

    await Promise.all(startPromises);

    this.emit('started');
  }

  /**
   * 停止感知引擎
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.emit('stopping');

    // 停止所有感知模块
    await this.screenCapture.stop();
    this.clipboardWatcher.stopWatching();

    if (this.windowCheckTimer) {
      clearInterval(this.windowCheckTimer);
      this.windowCheckTimer = null;
    }

    if (this.fileWatcher) {
      this.fileWatcher.stop();
      this.fileWatcher = null;
    }

    await this.ocrManager.terminate();

    this.emit('stopped');
  }

  /**
   * 获取当前完整的感知上下文
   */
  async perceive(): Promise<ExtendedPerceptionContext> {
    const perceiveStart = Date.now();
    const contextId = this.generateId();

    console.log(`\n[Perception] ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓`);
    console.log(`[Perception] 🎯 开始感知流程`);
    console.log(`[Perception] ────────────────────────────────────────────────`);
    console.log(`[Perception] 上下文 ID: ${contextId}`);
    console.log(`[Perception] 时间: ${new Date().toISOString()}`);
    console.log(`[Perception] 启用模块: ${this.getStatus().enabledModules.join(', ')}`);
    console.log(`[Perception] ────────────────────────────────────────────────`);

    const context: ExtendedPerceptionContext = {
      contextId,
      createdAt: Date.now(),
      metadata: {
        timestamp: Date.now(),
        platform: process.platform,
      },
    };

    const promises: Promise<void>[] = [];

    // 获取屏幕截图
    if (this.config.enableScreen) {
      promises.push(
        this.screenCapture.capture().then(async (screenshot) => {
          context.screenshot = screenshot;
          console.log(`[Perception] 📸 截图完成: ${screenshot.id}`);

          // OCR 识别
          if ((this.config.enableOCR || this.config.enableUIParser) && screenshot.imageData) {
            try {
              let ocrText = '';

              if (this.config.enableOCR) {
                console.log(`[Perception] 🔤 开始 OCR 识别...`);
                const ocrStart = Date.now();
                context.ocr = await this.ocrManager.recognize(screenshot.imageData);
                const ocrDuration = Date.now() - ocrStart;
                ocrText = context.ocr.text;
                console.log(`[Perception] ✅ OCR 完成，耗时: ${ocrDuration}ms，识别 ${context.ocr.text.length} 字符`);

                // Emit OCR completed event for debug timeline
                this.emit('ocr:completed', {
                  text: context.ocr.text,
                  confidence: context.ocr.confidence,
                  backend: context.ocr.backend || 'unknown',
                  duration: ocrDuration,
                  regions: context.ocr.regions,
                });
              }

              // UI 解析
              if (this.config.enableUIParser) {
                console.log(`[Perception] 👁️ 开始 UI 解析...`);
                const uiStart = Date.now();
                const imageBuffer = Buffer.from(screenshot.imageData, 'base64');
                context.ui = await this.uiParser.parse(imageBuffer, ocrText);
                const uiDuration = Date.now() - uiStart;
                console.log(`[Perception] ✅ UI 解析完成，耗时: ${uiDuration}ms，识别 ${context.ui.elements.length} 元素`);

                this.emit('ui:parsed', {
                   elements: context.ui.elements.length,
                   duration: uiDuration,
                   stats: context.ui.stats
                });
              }
            } catch (err) {
              console.warn('[Perception] ❌ 视觉处理失败:', err);
            }
          }
        }).catch(err => {
          console.warn('[Perception] ❌ 屏幕截图失败:', err.message);
        })
      );
    }

    // 获取活动窗口
    if (this.config.enableWindow) {
      promises.push(
        this.windowTracker.getActiveWindow().then((window) => {
          context.activeWindow = window ?? undefined;
        }).catch(err => {
          console.warn('窗口追踪失败:', err.message);
        })
      );
    }

    // 获取剪贴板
    if (this.config.enableClipboard) {
      promises.push(
        this.clipboardWatcher.getContent().then((content) => {
          context.clipboard = content || undefined;
        }).catch(err => {
          console.warn('剪贴板获取失败:', err.message);
        })
      );
    }

    // 获取最近的文件变化
    if (this.config.enableFileWatch) {
      context.fileEvents = [...this.recentFileEvents];
      // 清空已获取的事件
      this.recentFileEvents = [];
    }

    await Promise.all(promises);

    const totalDuration = Date.now() - perceiveStart;
    console.log(`[Perception] ────────────────────────────────────────────────`);
    console.log(`[Perception] ✅ 感知流程完成`);
    console.log(`[Perception] 总耗时: ${totalDuration}ms`);
    console.log(`[Perception] 截图: ${context.screenshot ? '✓' : '✗'}`);
    console.log(`[Perception] OCR: ${context.ocr ? `✓ (${context.ocr.text.length}字)` : '✗'}`);
    console.log(`[Perception] UI: ${context.ui ? `✓ (${context.ui.elements.length}元素)` : '✗'}`);
    console.log(`[Perception] 窗口: ${context.activeWindow ? `✓ (${context.activeWindow.appName})` : '✗'}`);
    console.log(`[Perception] 剪贴板: ${context.clipboard ? `✓ (${context.clipboard.length}字)` : '✗'}`);
    console.log(`[Perception] ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓\n`);

    this.lastContext = context;
    this.emit('context', context);

    return context;
  }

  /**
   * 设置 AI 视觉分析器
   */
  setVisionAnalyzer(analyzer: VisionAnalyzer): void {
    this.screenCapture.setVisionAnalyzer(analyzer);
  }

  /**
   * 设置 Vision API 分析函数
   */
  setVisionAPIFunction(fn: (imageBase64: string) => Promise<string>): void {
    this.ocrManager.setVisionAnalyzer(fn);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PerceptionEngineConfig>): void {
    const wasRunning = this.isRunning;

    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...config };
    this.screenCapture.updateConfig({
      interval: this.config.screenInterval,
      enableVision: this.config.enableVision,
    });

    if (wasRunning) {
      this.start();
    }

    this.emit('config-updated', this.config);
  }

  /**
   * 获取最后的感知上下文
   */
  getLastContext(): ExtendedPerceptionContext | null {
    return this.lastContext;
  }

  /**
   * 获取当前活动窗口
   * @returns 活动窗口信息，如果获取失败返回 null 并触发 error 事件
   */
  async getActiveWindow(): Promise<WindowInfo | null> {
    try {
      return await this.windowTracker.getActiveWindow();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.warn('获取活动窗口失败:', error.message);
      this.emit('error', { module: 'window', error });
      return null;
    }
  }

  /**
   * 获取引擎状态
   */
  getStatus(): {
    isRunning: boolean;
    enabledModules: string[];
    lastContextTime: number | null;
  } {
    const enabledModules: string[] = [];
    if (this.config.enableScreen) enabledModules.push('screen');
    if (this.config.enableWindow) enabledModules.push('window');
    if (this.config.enableClipboard) enabledModules.push('clipboard');
    if (this.config.enableFileWatch) enabledModules.push('fileWatch');
    if (this.config.enableOCR) enabledModules.push('ocr');
    if (this.config.enableUIParser) enabledModules.push('uiParser');
    if (this.config.enableVision) enabledModules.push('vision');

    return {
      isRunning: this.isRunning,
      enabledModules,
      lastContextTime: this.lastContext?.createdAt ?? null,
    };
  }

  // ============ 私有方法 ============

  private setupEventListeners(): void {
    // 屏幕变化事件
    this.screenCapture.on('screen:changed', async (capture: ExtendedScreenCapture) => {
      this.emit('screen:changed', capture);

      // 如果启用 OCR，对截图进行 OCR 识别
      if (this.config.enableOCR && capture.imageData) {
        try {
          console.log(`[Perception] 🔤 对截图进行 OCR 识别...`);
          const ocrStart = Date.now();
          const ocrResult = await this.ocrManager.recognize(capture.imageData);
          const ocrDuration = Date.now() - ocrStart;
          console.log(`[Perception] ✅ 截图 OCR 完成，耗时: ${ocrDuration}ms，识别 ${ocrResult.text.length} 字符`);

          // Emit OCR completed event for debug timeline
          this.emit('ocr:completed', {
            text: ocrResult.text,
            confidence: ocrResult.confidence,
            backend: ocrResult.backend || 'unknown',
            duration: ocrDuration,
            regions: ocrResult.regions,
          });
        } catch (err) {
          console.warn('[Perception] ❌ 截图 OCR 失败:', err);
        }
      }
    });

    this.screenCapture.on('error', (error: Error) => {
      this.emit('error', { module: 'screen', error });
    });
  }

  private startWindowTracking(): void {
    // 定期检查活动窗口变化
    this.windowCheckTimer = setInterval(async () => {
      try {
        const currentWindow = await this.windowTracker.getActiveWindow();
        if (currentWindow && this.hasWindowChanged(currentWindow)) {
          this.lastWindow = currentWindow;
          this.emit('window:changed', currentWindow);
        }
      } catch (err) {
        // 忽略窗口追踪错误
      }
    }, 1000);
  }

  private hasWindowChanged(current: WindowInfo): boolean {
    if (!this.lastWindow) return true;
    return (
      this.lastWindow.appName !== current.appName ||
      this.lastWindow.title !== current.title
    );
  }

  private onClipboardChange(content: string): void {
    if (content !== this.lastClipboard) {
      this.lastClipboard = content;
      this.emit('clipboard:changed', content);
    }
  }

  private onFileChange(event: FileEvent): void {
    // 保存最近的文件事件（最多 100 个）
    this.recentFileEvents.push(event);
    if (this.recentFileEvents.length > 100) {
      this.recentFileEvents.shift();
    }

    this.emit('file:changed', event);
  }

  private generateId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
