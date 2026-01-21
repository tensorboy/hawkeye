# Hawkeye 实现规格文档

**版本**: 1.0
**最后更新**: 2026-01-20
**关联文档**: PRD.md

---

## 目录

1. [感知层实现](#1-感知层实现)
2. [推理层实现](#2-推理层实现)
3. [执行层实现](#3-执行层实现)
4. [存储层实现](#4-存储层实现)
5. [客户端实现](#5-客户端实现)
6. [AI集成实现](#6-ai集成实现)
7. [通信协议实现](#7-通信协议实现)
8. [安全实现](#8-安全实现)

---

## 1. 感知层实现

### 1.1 屏幕感知模块

#### 技术选型
```typescript
// 跨平台截图库
import { desktopCapturer } from 'electron';  // Desktop
import * as screenshot from 'screenshot-desktop'; // 备选

// OCR 引擎
import Tesseract from 'tesseract.js';  // 本地 OCR
// 或使用 PaddleOCR (更准确的中文识别)
```

#### 核心实现
```typescript
// packages/core/src/perception/screen.ts

interface ScreenCaptureConfig {
  interval: number;           // 截图间隔 (ms)
  quality: 'low' | 'medium' | 'high';
  enableOCR: boolean;
  ocrLanguages: string[];
  maxWidth: number;           // 最大宽度，用于压缩
  saveHistory: boolean;       // 是否保存历史截图
  historyRetention: number;   // 历史保留时间 (ms)
}

class ScreenPerception {
  private config: ScreenCaptureConfig;
  private captureTimer: NodeJS.Timer | null = null;
  private lastCapture: ScreenCapture | null = null;
  private changeDetector: ChangeDetector;

  constructor(config: Partial<ScreenCaptureConfig> = {}) {
    this.config = {
      interval: 5000,
      quality: 'medium',
      enableOCR: true,
      ocrLanguages: ['eng', 'chi_sim'],
      maxWidth: 1920,
      saveHistory: false,
      historyRetention: 3600000, // 1 hour
      ...config
    };
    this.changeDetector = new ChangeDetector();
  }

  async start(): Promise<void> {
    if (this.captureTimer) return;

    this.captureTimer = setInterval(async () => {
      try {
        const capture = await this.capture();

        // 检测是否有显著变化
        if (this.changeDetector.hasSignificantChange(this.lastCapture, capture)) {
          this.emit('screen:changed', capture);
        }

        this.lastCapture = capture;
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.interval);
  }

  async capture(): Promise<ScreenCapture> {
    const startTime = Date.now();

    // 1. 获取屏幕截图
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: this.config.maxWidth, height: 0 }
    });

    const primaryScreen = sources[0];
    const imageBuffer = primaryScreen.thumbnail.toPNG();

    // 2. 压缩图片 (根据质量设置)
    const compressedBuffer = await this.compressImage(imageBuffer);

    // 3. OCR 识别 (如果启用)
    let ocrResult: OCRResult | null = null;
    if (this.config.enableOCR) {
      ocrResult = await this.performOCR(compressedBuffer);
    }

    // 4. 构建截图对象
    return {
      id: generateId(),
      timestamp: startTime,
      duration: Date.now() - startTime,
      image: {
        buffer: compressedBuffer,
        width: primaryScreen.thumbnail.getSize().width,
        height: primaryScreen.thumbnail.getSize().height,
        format: 'png'
      },
      ocr: ocrResult,
      metadata: {
        screenId: primaryScreen.id,
        displayName: primaryScreen.name
      }
    };
  }

  private async performOCR(imageBuffer: Buffer): Promise<OCRResult> {
    const worker = await Tesseract.createWorker();
    await worker.loadLanguage(this.config.ocrLanguages.join('+'));
    await worker.initialize(this.config.ocrLanguages.join('+'));

    const { data } = await worker.recognize(imageBuffer);
    await worker.terminate();

    return {
      text: data.text,
      confidence: data.confidence,
      blocks: data.blocks?.map(block => ({
        text: block.text,
        bbox: block.bbox,
        confidence: block.confidence
      })) || []
    };
  }

  stop(): void {
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }
  }
}
```

#### 变化检测算法
```typescript
// packages/core/src/perception/change-detector.ts

class ChangeDetector {
  private threshold: number = 0.1; // 10% 变化阈值

  hasSignificantChange(prev: ScreenCapture | null, curr: ScreenCapture): boolean {
    if (!prev) return true;

    // 方法1: 图片哈希比较 (快速)
    const prevHash = this.calculateImageHash(prev.image.buffer);
    const currHash = this.calculateImageHash(curr.image.buffer);
    const hashDiff = this.hammingDistance(prevHash, currHash) / 64;

    if (hashDiff > this.threshold) return true;

    // 方法2: OCR 文本比较 (更准确)
    if (prev.ocr && curr.ocr) {
      const textSimilarity = this.calculateTextSimilarity(
        prev.ocr.text,
        curr.ocr.text
      );
      if (textSimilarity < 0.9) return true;
    }

    return false;
  }

  private calculateImageHash(buffer: Buffer): string {
    // 使用 pHash (感知哈希) 算法
    // 1. 缩小到 8x8
    // 2. 转灰度
    // 3. 计算平均值
    // 4. 生成64位哈希
    return phash(buffer);
  }

  private hammingDistance(hash1: string, hash2: string): number {
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    return distance;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Jaccard 相似度
    const set1 = new Set(text1.split(/\s+/));
    const set2 = new Set(text2.split(/\s+/));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  }
}
```

### 1.2 剪贴板监控模块

```typescript
// packages/core/src/perception/clipboard.ts

import { clipboard, nativeImage } from 'electron';

interface ClipboardConfig {
  checkInterval: number;      // 检查间隔 (ms)
  maxHistorySize: number;     // 历史记录最大数量
  enableContentAnalysis: boolean;
  sensitivePatterns: RegExp[]; // 敏感内容正则
}

class ClipboardMonitor {
  private config: ClipboardConfig;
  private lastContent: string = '';
  private lastImage: Buffer | null = null;
  private history: ClipboardEntry[] = [];
  private checkTimer: NodeJS.Timer | null = null;

  constructor(config: Partial<ClipboardConfig> = {}) {
    this.config = {
      checkInterval: 500,
      maxHistorySize: 100,
      enableContentAnalysis: true,
      sensitivePatterns: [
        /password\s*[:=]\s*\S+/i,
        /api[_-]?key\s*[:=]\s*\S+/i,
        /secret\s*[:=]\s*\S+/i,
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // 信用卡号
        /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      ],
      ...config
    };
  }

  start(): void {
    if (this.checkTimer) return;

    this.checkTimer = setInterval(() => {
      this.checkClipboard();
    }, this.config.checkInterval);
  }

  private async checkClipboard(): Promise<void> {
    // 检查文本
    const text = clipboard.readText();
    if (text && text !== this.lastContent) {
      this.lastContent = text;
      await this.processTextContent(text);
    }

    // 检查图片
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const imageBuffer = image.toPNG();
      if (!this.lastImage || !imageBuffer.equals(this.lastImage)) {
        this.lastImage = imageBuffer;
        await this.processImageContent(imageBuffer);
      }
    }
  }

  private async processTextContent(text: string): Promise<void> {
    // 检查敏感内容
    if (this.containsSensitiveData(text)) {
      this.emit('clipboard:sensitive', { text: '[REDACTED]' });
      return;
    }

    // 分析内容类型
    const contentType = this.analyzeContentType(text);

    const entry: ClipboardEntry = {
      id: generateId(),
      timestamp: Date.now(),
      type: 'text',
      content: text,
      contentType,
      metadata: {
        length: text.length,
        lineCount: text.split('\n').length
      }
    };

    this.addToHistory(entry);
    this.emit('clipboard:text', entry);
  }

  private analyzeContentType(text: string): ClipboardContentType {
    // 错误信息检测
    const errorPatterns = [
      /error:/i,
      /exception:/i,
      /traceback/i,
      /at\s+\S+\s+\(\S+:\d+:\d+\)/,  // JavaScript stack trace
      /File\s+"[^"]+",\s+line\s+\d+/,  // Python stack trace
      /^\s*at\s+\S+/m,  // Java/C# stack trace
    ];
    if (errorPatterns.some(p => p.test(text))) {
      return ClipboardContentType.CODE_ERROR;
    }

    // URL 检测
    if (/^https?:\/\/\S+$/i.test(text.trim())) {
      return ClipboardContentType.URL;
    }

    // JSON 检测
    try {
      JSON.parse(text);
      return ClipboardContentType.JSON_DATA;
    } catch {}

    // 代码检测
    const codePatterns = [
      /^(import|from|export|const|let|var|function|class|def|public|private)\s+/m,
      /[{}();]\s*$/m,
      /=>\s*{/,
    ];
    if (codePatterns.some(p => p.test(text))) {
      return ClipboardContentType.CODE_SNIPPET;
    }

    // 文件路径检测
    if (/^[\/~][\w\-\.\/\\]+$/.test(text.trim()) || /^[A-Z]:\\[\w\-\.\\]+$/i.test(text.trim())) {
      return ClipboardContentType.FILE_PATH;
    }

    // 命令检测
    const commandPatterns = [
      /^(npm|yarn|pnpm|pip|cargo|go|git|docker|kubectl)\s+/,
      /^\$\s+/,
      /^>\s+/,
    ];
    if (commandPatterns.some(p => p.test(text.trim()))) {
      return ClipboardContentType.COMMAND;
    }

    return ClipboardContentType.PLAIN_TEXT;
  }

  private containsSensitiveData(text: string): boolean {
    return this.config.sensitivePatterns.some(pattern => pattern.test(text));
  }

  getHistory(): ClipboardEntry[] {
    return [...this.history];
  }

  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }
}
```

### 1.3 窗口追踪模块

```typescript
// packages/core/src/perception/window.ts

import activeWin from 'active-win';

interface WindowConfig {
  trackInterval: number;
  trackHistory: boolean;
  historyRetention: number;
}

class WindowTracker {
  private config: WindowConfig;
  private currentWindow: WindowInfo | null = null;
  private windowHistory: WindowHistoryEntry[] = [];
  private appUsageStats: Map<string, AppUsageStats> = new Map();
  private trackTimer: NodeJS.Timer | null = null;
  private sessionStart: number = Date.now();

  constructor(config: Partial<WindowConfig> = {}) {
    this.config = {
      trackInterval: 1000,
      trackHistory: true,
      historyRetention: 86400000, // 24 hours
      ...config
    };
  }

  start(): void {
    if (this.trackTimer) return;

    this.trackTimer = setInterval(async () => {
      await this.trackActiveWindow();
    }, this.config.trackInterval);
  }

  private async trackActiveWindow(): Promise<void> {
    try {
      const window = await activeWin();
      if (!window) return;

      const windowInfo: WindowInfo = {
        id: window.id,
        title: window.title,
        owner: {
          name: window.owner.name,
          processId: window.owner.processId,
          bundleId: window.owner.bundleId,
          path: window.owner.path
        },
        bounds: window.bounds,
        memoryUsage: window.memoryUsage
      };

      // 检测窗口切换
      if (!this.currentWindow || this.currentWindow.id !== windowInfo.id) {
        const prevWindow = this.currentWindow;
        this.currentWindow = windowInfo;

        // 记录切换历史
        if (this.config.trackHistory && prevWindow) {
          this.recordWindowSwitch(prevWindow, windowInfo);
        }

        // 更新应用使用统计
        this.updateAppUsageStats(windowInfo);

        // 触发事件
        this.emit('window:switched', {
          from: prevWindow,
          to: windowInfo
        });
      }

      // 检测标题变化 (同一窗口)
      if (this.currentWindow &&
          this.currentWindow.id === windowInfo.id &&
          this.currentWindow.title !== windowInfo.title) {
        this.emit('window:titleChanged', {
          window: windowInfo,
          oldTitle: this.currentWindow.title,
          newTitle: windowInfo.title
        });
        this.currentWindow = windowInfo;
      }

    } catch (error) {
      this.emit('error', error);
    }
  }

  private recordWindowSwitch(from: WindowInfo, to: WindowInfo): void {
    const entry: WindowHistoryEntry = {
      timestamp: Date.now(),
      from: {
        app: from.owner.name,
        title: from.title
      },
      to: {
        app: to.owner.name,
        title: to.title
      }
    };

    this.windowHistory.push(entry);

    // 清理过期历史
    const cutoff = Date.now() - this.config.historyRetention;
    this.windowHistory = this.windowHistory.filter(e => e.timestamp > cutoff);
  }

  private updateAppUsageStats(window: WindowInfo): void {
    const appName = window.owner.name;
    const now = Date.now();

    if (!this.appUsageStats.has(appName)) {
      this.appUsageStats.set(appName, {
        appName,
        totalTime: 0,
        sessionCount: 0,
        lastActive: now,
        firstSeen: now
      });
    }

    const stats = this.appUsageStats.get(appName)!;
    stats.sessionCount++;
    stats.lastActive = now;
  }

  getCurrentWindow(): WindowInfo | null {
    return this.currentWindow;
  }

  getAppUsageStats(): AppUsageStats[] {
    return Array.from(this.appUsageStats.values());
  }

  getRecentWindowHistory(limit: number = 20): WindowHistoryEntry[] {
    return this.windowHistory.slice(-limit);
  }

  stop(): void {
    if (this.trackTimer) {
      clearInterval(this.trackTimer);
      this.trackTimer = null;
    }
  }
}
```

### 1.4 文件系统监控模块

```typescript
// packages/core/src/perception/filesystem.ts

import chokidar from 'chokidar';
import * as path from 'path';
import * as fs from 'fs/promises';

interface FileWatcherConfig {
  paths: string[];
  ignored: string[];
  depth: number;
  debounceMs: number;
  analyzeContent: boolean;
}

class FileSystemWatcher {
  private config: FileWatcherConfig;
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<FileWatcherConfig> = {}) {
    this.config = {
      paths: [
        process.env.HOME + '/Desktop',
        process.env.HOME + '/Downloads',
        process.env.HOME + '/Documents'
      ],
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.*',  // 隐藏文件
        '**/*.tmp',
        '**/*.log'
      ],
      depth: 3,
      debounceMs: 1000,
      analyzeContent: true,
      ...config
    };
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(this.config.paths, {
      ignored: this.config.ignored,
      depth: this.config.depth,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    this.watcher
      .on('add', (filePath) => this.handleFileEvent('created', filePath))
      .on('change', (filePath) => this.handleFileEvent('modified', filePath))
      .on('unlink', (filePath) => this.handleFileEvent('deleted', filePath))
      .on('addDir', (dirPath) => this.handleFileEvent('dirCreated', dirPath))
      .on('unlinkDir', (dirPath) => this.handleFileEvent('dirDeleted', dirPath))
      .on('error', (error) => this.emit('error', error));
  }

  private handleFileEvent(event: FileEventType, filePath: string): void {
    // 防抖处理
    const key = `${event}:${filePath}`;
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key)!);
    }

    this.debounceTimers.set(key, setTimeout(async () => {
      this.debounceTimers.delete(key);
      await this.processFileEvent(event, filePath);
    }, this.config.debounceMs));
  }

  private async processFileEvent(event: FileEventType, filePath: string): Promise<void> {
    const fileInfo = await this.getFileInfo(filePath);

    const fileEvent: FileEvent = {
      id: generateId(),
      timestamp: Date.now(),
      event,
      path: filePath,
      info: fileInfo,
      suggestion: this.generateSuggestion(event, fileInfo)
    };

    this.emit('file:event', fileEvent);
  }

  private async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();

      return {
        name: path.basename(filePath),
        path: filePath,
        directory: path.dirname(filePath),
        extension: ext,
        size: stats.size,
        isDirectory: stats.isDirectory(),
        created: stats.birthtime,
        modified: stats.mtime,
        type: this.getFileType(ext),
        mimeType: this.getMimeType(ext)
      };
    } catch {
      return {
        name: path.basename(filePath),
        path: filePath,
        directory: path.dirname(filePath),
        extension: path.extname(filePath),
        size: 0,
        isDirectory: false,
        created: new Date(),
        modified: new Date(),
        type: 'unknown',
        mimeType: 'application/octet-stream'
      };
    }
  }

  private getFileType(ext: string): FileType {
    const typeMap: Record<string, FileType> = {
      // 图片
      '.jpg': 'image', '.jpeg': 'image', '.png': 'image',
      '.gif': 'image', '.webp': 'image', '.svg': 'image',
      // 文档
      '.pdf': 'document', '.doc': 'document', '.docx': 'document',
      '.xls': 'spreadsheet', '.xlsx': 'spreadsheet',
      '.ppt': 'presentation', '.pptx': 'presentation',
      // 代码
      '.js': 'code', '.ts': 'code', '.py': 'code', '.java': 'code',
      '.cpp': 'code', '.c': 'code', '.go': 'code', '.rs': 'code',
      // 配置
      '.json': 'config', '.yaml': 'config', '.yml': 'config',
      '.toml': 'config', '.ini': 'config',
      // 压缩包
      '.zip': 'archive', '.tar': 'archive', '.gz': 'archive',
      '.rar': 'archive', '.7z': 'archive',
      // 视频
      '.mp4': 'video', '.mov': 'video', '.avi': 'video',
      // 音频
      '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio',
    };
    return typeMap[ext] || 'other';
  }

  private generateSuggestion(event: FileEventType, fileInfo: FileInfo): FileSuggestion | null {
    if (event !== 'created') return null;

    // 根据文件类型和位置生成整理建议
    const suggestions: FileSuggestion[] = [];

    // 下载文件夹的新文件
    if (fileInfo.directory.includes('Downloads')) {
      const targetDir = this.suggestTargetDirectory(fileInfo);
      if (targetDir) {
        return {
          type: 'move',
          reason: `将 ${fileInfo.type} 文件整理到合适的位置`,
          targetPath: path.join(targetDir, fileInfo.name),
          confidence: 0.8
        };
      }
    }

    return null;
  }

  private suggestTargetDirectory(fileInfo: FileInfo): string | null {
    const home = process.env.HOME!;

    const directoryMap: Record<FileType, string> = {
      'image': `${home}/Pictures`,
      'document': `${home}/Documents`,
      'spreadsheet': `${home}/Documents/Spreadsheets`,
      'presentation': `${home}/Documents/Presentations`,
      'code': `${home}/Projects`,
      'video': `${home}/Videos`,
      'audio': `${home}/Music`,
      'archive': `${home}/Downloads/Archives`,
      'config': null,
      'other': null
    };

    return directoryMap[fileInfo.type] || null;
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
  }
}
```

---

## 2. 推理层实现

### 2.1 意图理解引擎

```typescript
// packages/core/src/reasoning/intent.ts

interface IntentEngineConfig {
  aiProvider: AIProvider;
  confidenceThreshold: number;
  maxContextItems: number;
}

class IntentEngine {
  private config: IntentEngineConfig;
  private contextBuffer: ContextItem[] = [];

  constructor(config: Partial<IntentEngineConfig> = {}) {
    this.config = {
      aiProvider: new OllamaProvider(),
      confidenceThreshold: 0.6,
      maxContextItems: 10,
      ...config
    };
  }

  async analyzeIntent(perception: PerceptionEvent): Promise<IntentAnalysis> {
    // 1. 构建上下文
    const context = this.buildContext(perception);

    // 2. 构建 prompt
    const prompt = this.buildIntentPrompt(perception, context);

    // 3. 调用 AI 分析
    const response = await this.config.aiProvider.complete(prompt);

    // 4. 解析结果
    const analysis = this.parseIntentResponse(response);

    // 5. 更新上下文缓冲
    this.updateContextBuffer(perception, analysis);

    return analysis;
  }

  private buildContext(perception: PerceptionEvent): ContextSummary {
    return {
      recentEvents: this.contextBuffer.slice(-5),
      currentWindow: perception.context?.activeWindow,
      timestamp: Date.now(),
      sessionDuration: this.getSessionDuration()
    };
  }

  private buildIntentPrompt(perception: PerceptionEvent, context: ContextSummary): string {
    return `你是一个智能助手，需要分析用户当前的意图。

## 当前感知到的信息
- 事件类型: ${perception.type}
- 事件数据: ${JSON.stringify(perception.data, null, 2)}
- 当前窗口: ${context.currentWindow?.owner?.name || '未知'}
- 窗口标题: ${context.currentWindow?.title || '未知'}

## 最近的上下文
${context.recentEvents.map(e => `- ${e.type}: ${e.summary}`).join('\n')}

## 任务
请分析用户最可能的意图，并以 JSON 格式返回：
{
  "primaryIntent": {
    "type": "debug|organize|research|create|communicate|automate|navigate|review|unknown",
    "confidence": 0.0-1.0,
    "description": "简短描述"
  },
  "secondaryIntents": [...],
  "sentiment": {
    "frustration": 0.0-1.0,
    "urgency": 0.0-1.0,
    "complexity": 0.0-1.0
  },
  "suggestedAction": "建议的操作"
}`;
  }

  private parseIntentResponse(response: string): IntentAnalysis {
    try {
      // 提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        primaryIntent: parsed.primaryIntent,
        secondaryIntents: parsed.secondaryIntents || [],
        context: {
          currentActivity: parsed.suggestedAction || '',
          recentHistory: [],
          relatedTasks: []
        },
        sentiment: parsed.sentiment || {
          frustration: 0,
          urgency: 0,
          complexity: 0
        }
      };
    } catch (error) {
      // 返回默认分析
      return {
        primaryIntent: {
          type: IntentType.UNKNOWN,
          confidence: 0,
          description: '无法确定意图'
        },
        secondaryIntents: [],
        context: {
          currentActivity: '',
          recentHistory: [],
          relatedTasks: []
        },
        sentiment: {
          frustration: 0,
          urgency: 0,
          complexity: 0
        }
      };
    }
  }
}
```

### 2.2 计划生成引擎

```typescript
// packages/core/src/reasoning/planner.ts

interface PlannerConfig {
  aiProvider: AIProvider;
  maxSteps: number;
  includeAlternatives: boolean;
  maxAlternatives: number;
}

class PlanGenerator {
  private config: PlannerConfig;

  constructor(config: Partial<PlannerConfig> = {}) {
    this.config = {
      aiProvider: new OllamaProvider(),
      maxSteps: 10,
      includeAlternatives: true,
      maxAlternatives: 2,
      ...config
    };
  }

  async generatePlan(intent: IntentAnalysis, context: ContextSummary): Promise<TaskPlan> {
    // 1. 生成主计划
    const mainPlan = await this.generateMainPlan(intent, context);

    // 2. 分析优缺点
    const analysis = await this.analyzePlan(mainPlan);

    // 3. 生成替代方案 (如果需要)
    let alternatives: TaskPlan[] = [];
    if (this.config.includeAlternatives) {
      alternatives = await this.generateAlternatives(intent, context, mainPlan);
    }

    return {
      ...mainPlan,
      analysis,
      alternatives
    };
  }

  private async generateMainPlan(intent: IntentAnalysis, context: ContextSummary): Promise<TaskPlan> {
    const prompt = `你是一个任务规划专家。根据用户意图生成执行计划。

## 用户意图
- 类型: ${intent.primaryIntent.type}
- 描述: ${intent.primaryIntent.description}
- 置信度: ${intent.primaryIntent.confidence}

## 当前上下文
${JSON.stringify(context, null, 2)}

## 任务
生成一个详细的执行计划，以 JSON 格式返回：
{
  "title": "计划标题",
  "description": "计划描述",
  "steps": [
    {
      "order": 1,
      "action": {
        "type": "shell_command|file_read|file_write|file_move|app_launch|browser_navigate|api_call|notification",
        "command": "具体命令或操作",
        "parameters": {}
      },
      "description": "步骤描述",
      "requiresConfirmation": true/false,
      "riskLevel": "low|medium|high"
    }
  ],
  "estimates": {
    "duration": 秒数,
    "complexity": "low|medium|high",
    "riskLevel": "safe|moderate|risky"
  }
}`;

    const response = await this.config.aiProvider.complete(prompt);
    return this.parsePlanResponse(response);
  }

  private async analyzePlan(plan: TaskPlan): Promise<PlanAnalysis> {
    const prompt = `分析以下执行计划的优缺点和风险：

${JSON.stringify(plan, null, 2)}

以 JSON 格式返回：
{
  "pros": [
    {"point": "优点", "importance": "high|medium|low", "explanation": "解释"}
  ],
  "cons": [
    {"point": "缺点", "severity": "high|medium|low", "explanation": "解释", "mitigation": "缓解措施"}
  ],
  "risks": [
    {"risk": "风险描述", "probability": 0.0-1.0, "impact": "high|medium|low", "mitigation": "缓解措施"}
  ],
  "impactScope": {
    "filesAffected": ["文件列表"],
    "reversibility": "fully|partially|irreversible"
  }
}`;

    const response = await this.config.aiProvider.complete(prompt);
    return this.parseAnalysisResponse(response);
  }

  private async generateAlternatives(
    intent: IntentAnalysis,
    context: ContextSummary,
    mainPlan: TaskPlan
  ): Promise<TaskPlan[]> {
    const prompt = `为以下意图生成 ${this.config.maxAlternatives} 个替代方案，这些方案应该与主方案不同：

## 用户意图
${JSON.stringify(intent, null, 2)}

## 主方案
${JSON.stringify(mainPlan, null, 2)}

## 要求
- 提供不同的实现方式
- 说明与主方案的区别
- 说明各自的优劣势

以 JSON 数组格式返回替代方案。`;

    const response = await this.config.aiProvider.complete(prompt);
    return this.parseAlternativesResponse(response);
  }
}
```

---

## 3. 执行层实现

### 3.1 执行引擎

```typescript
// packages/core/src/execution/engine.ts

interface ExecutionEngineConfig {
  maxConcurrent: number;
  defaultTimeout: number;
  requireConfirmation: boolean;
  enableRollback: boolean;
}

class ExecutionEngine {
  private config: ExecutionEngineConfig;
  private executors: Map<ActionType, Executor> = new Map();
  private runningTasks: Map<string, RunningTask> = new Map();
  private executionHistory: ExecutionResult[] = [];

  constructor(config: Partial<ExecutionEngineConfig> = {}) {
    this.config = {
      maxConcurrent: 3,
      defaultTimeout: 30000,
      requireConfirmation: true,
      enableRollback: true,
      ...config
    };

    this.registerExecutors();
  }

  private registerExecutors(): void {
    this.executors.set(ActionType.SHELL_COMMAND, new ShellExecutor());
    this.executors.set(ActionType.FILE_READ, new FileReadExecutor());
    this.executors.set(ActionType.FILE_WRITE, new FileWriteExecutor());
    this.executors.set(ActionType.FILE_MOVE, new FileMoveExecutor());
    this.executors.set(ActionType.FILE_DELETE, new FileDeleteExecutor());
    this.executors.set(ActionType.APP_LAUNCH, new AppLaunchExecutor());
    this.executors.set(ActionType.BROWSER_NAVIGATE, new BrowserExecutor());
    this.executors.set(ActionType.API_CALL, new APIExecutor());
    this.executors.set(ActionType.NOTIFICATION, new NotificationExecutor());
  }

  async executePlan(plan: TaskPlan, options: ExecutionOptions = {}): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const step of plan.steps) {
      // 检查是否需要确认
      if (step.requiresConfirmation && this.config.requireConfirmation) {
        const confirmed = await this.requestConfirmation(step);
        if (!confirmed) {
          results.push({
            stepId: step.id,
            status: 'cancelled',
            details: { reason: 'User cancelled' }
          });
          break;
        }
      }

      // 执行步骤
      const result = await this.executeStep(step, plan.id);
      results.push(result);

      // 如果失败，根据策略处理
      if (result.status === 'failed') {
        if (step.onError?.strategy === 'abort') break;
        if (step.onError?.strategy === 'fallback' && step.onError.fallbackAction) {
          const fallbackResult = await this.executeStep(
            { ...step, action: step.onError.fallbackAction },
            plan.id
          );
          results.push(fallbackResult);
        }
      }
    }

    this.executionHistory.push(...results);
    return results;
  }

  private async executeStep(step: PlanStep, planId: string): Promise<ExecutionResult> {
    const executor = this.executors.get(step.action.type);
    if (!executor) {
      return {
        id: generateId(),
        planId,
        stepId: step.id,
        status: 'failed',
        details: {
          startTime: new Date(),
          endTime: new Date(),
          duration: 0,
          error: { code: 'EXECUTOR_NOT_FOUND', message: `No executor for ${step.action.type}` }
        },
        impact: { filesModified: [], filesCreated: [], filesDeleted: [], commandsRun: [] }
      };
    }

    const startTime = Date.now();
    const taskId = generateId();

    // 记录运行中的任务
    this.runningTasks.set(taskId, {
      id: taskId,
      step,
      startTime,
      status: 'running'
    });

    try {
      // 执行前创建回滚点 (如果启用)
      let rollbackInfo: RollbackInfo | undefined;
      if (this.config.enableRollback) {
        rollbackInfo = await executor.createRollbackPoint(step.action);
      }

      // 执行操作
      const output = await executor.execute(step.action, {
        timeout: this.config.defaultTimeout
      });

      const endTime = Date.now();

      return {
        id: taskId,
        planId,
        stepId: step.id,
        status: 'success',
        details: {
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          duration: endTime - startTime,
          output
        },
        impact: executor.getImpact(),
        rollback: rollbackInfo ? {
          canRollback: true,
          rollbackSteps: rollbackInfo.steps
        } : undefined
      };

    } catch (error) {
      const endTime = Date.now();

      return {
        id: taskId,
        planId,
        stepId: step.id,
        status: 'failed',
        details: {
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          duration: endTime - startTime,
          error: {
            code: error.code || 'EXECUTION_ERROR',
            message: error.message,
            stack: error.stack
          }
        },
        impact: { filesModified: [], filesCreated: [], filesDeleted: [], commandsRun: [] }
      };

    } finally {
      this.runningTasks.delete(taskId);
    }
  }

  async rollback(executionId: string): Promise<boolean> {
    const execution = this.executionHistory.find(e => e.id === executionId);
    if (!execution?.rollback?.canRollback) return false;

    for (const rollbackStep of execution.rollback.rollbackSteps) {
      await this.executeRollbackStep(rollbackStep);
    }

    return true;
  }

  private async requestConfirmation(step: PlanStep): Promise<boolean> {
    return new Promise((resolve) => {
      this.emit('confirmation:required', {
        step,
        callback: resolve
      });
    });
  }
}
```

### 3.2 Shell 执行器

```typescript
// packages/core/src/execution/executors/shell.ts

import { exec, spawn } from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(exec);

class ShellExecutor implements Executor {
  private allowedCommands: Set<string>;
  private blockedCommands: Set<string>;
  private impact: ExecutionImpact = { filesModified: [], filesCreated: [], filesDeleted: [], commandsRun: [] };

  constructor() {
    // 安全的命令白名单
    this.allowedCommands = new Set([
      'ls', 'cat', 'head', 'tail', 'grep', 'find', 'echo',
      'npm', 'yarn', 'pnpm', 'node', 'python', 'pip',
      'git', 'code', 'open', 'xdg-open',
      'mkdir', 'cp', 'mv', 'touch'
    ]);

    // 危险命令黑名单
    this.blockedCommands = new Set([
      'rm -rf /', 'rm -rf ~', 'rm -rf *',
      'dd', 'mkfs', 'fdisk',
      'shutdown', 'reboot', 'halt',
      ':(){:|:&};:', // fork bomb
      'chmod 777', 'chmod -R 777'
    ]);
  }

  async execute(action: TaskAction, options: ExecuteOptions): Promise<string> {
    const command = action.command!;

    // 安全检查
    this.validateCommand(command);

    // 记录执行的命令
    this.impact.commandsRun.push(command);

    // 执行命令
    const { stdout, stderr } = await execAsync(command, {
      timeout: options.timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      cwd: action.parameters?.cwd,
      env: { ...process.env, ...action.parameters?.env }
    });

    if (stderr && !action.parameters?.ignoreStderr) {
      console.warn('Command stderr:', stderr);
    }

    return stdout;
  }

  private validateCommand(command: string): void {
    // 检查黑名单
    for (const blocked of this.blockedCommands) {
      if (command.includes(blocked)) {
        throw new Error(`Blocked command detected: ${blocked}`);
      }
    }

    // 检查命令是否在白名单
    const baseCommand = command.split(/\s+/)[0];
    if (!this.allowedCommands.has(baseCommand)) {
      // 非白名单命令需要额外确认
      this.emit('command:needsApproval', { command, baseCommand });
    }

    // 检查危险模式
    const dangerousPatterns = [
      /rm\s+(-rf?|--recursive)\s+[\/~]/,
      />\s*\/dev\/sd/,
      /chmod\s+777/,
      /curl.*\|\s*(ba)?sh/,
      /wget.*\|\s*(ba)?sh/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Potentially dangerous command pattern detected`);
      }
    }
  }

  async createRollbackPoint(action: TaskAction): Promise<RollbackInfo> {
    // Shell 命令通常难以回滚，返回空
    return {
      steps: [],
      metadata: { type: 'shell', command: action.command }
    };
  }

  getImpact(): ExecutionImpact {
    return this.impact;
  }
}
```

### 3.3 文件操作执行器

```typescript
// packages/core/src/execution/executors/file.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

class FileMoveExecutor implements Executor {
  private impact: ExecutionImpact = { filesModified: [], filesCreated: [], filesDeleted: [], commandsRun: [] };

  async execute(action: TaskAction, options: ExecuteOptions): Promise<string> {
    const { source, destination } = action.parameters as { source: string; destination: string };

    // 验证源文件存在
    await fs.access(source);

    // 确保目标目录存在
    await fs.mkdir(path.dirname(destination), { recursive: true });

    // 移动文件
    await fs.rename(source, destination);

    this.impact.filesModified.push(source);
    this.impact.filesCreated.push(destination);

    return `Moved ${source} to ${destination}`;
  }

  async createRollbackPoint(action: TaskAction): Promise<RollbackInfo> {
    const { source, destination } = action.parameters as { source: string; destination: string };

    return {
      steps: [{
        action: {
          type: ActionType.FILE_MOVE,
          parameters: { source: destination, destination: source }
        },
        description: `Move file back from ${destination} to ${source}`
      }],
      metadata: {
        originalSource: source,
        originalDestination: destination
      }
    };
  }

  getImpact(): ExecutionImpact {
    return this.impact;
  }
}

class FileWriteExecutor implements Executor {
  private impact: ExecutionImpact = { filesModified: [], filesCreated: [], filesDeleted: [], commandsRun: [] };
  private backupDir: string = path.join(process.env.HOME!, '.hawkeye', 'backups');

  async execute(action: TaskAction, options: ExecuteOptions): Promise<string> {
    const { filePath, content, encoding = 'utf8' } = action.parameters as {
      filePath: string;
      content: string;
      encoding?: BufferEncoding;
    };

    // 确保目录存在
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // 检查文件是否存在
    let existed = false;
    try {
      await fs.access(filePath);
      existed = true;
    } catch {}

    // 写入文件
    await fs.writeFile(filePath, content, { encoding });

    if (existed) {
      this.impact.filesModified.push(filePath);
    } else {
      this.impact.filesCreated.push(filePath);
    }

    return `Written ${content.length} bytes to ${filePath}`;
  }

  async createRollbackPoint(action: TaskAction): Promise<RollbackInfo> {
    const { filePath } = action.parameters as { filePath: string };

    // 如果文件存在，创建备份
    try {
      const originalContent = await fs.readFile(filePath, 'utf8');
      const hash = createHash('md5').update(originalContent).digest('hex').slice(0, 8);
      const backupPath = path.join(this.backupDir, `${path.basename(filePath)}.${hash}.bak`);

      await fs.mkdir(this.backupDir, { recursive: true });
      await fs.writeFile(backupPath, originalContent);

      return {
        steps: [{
          action: {
            type: ActionType.FILE_WRITE,
            parameters: { filePath, content: originalContent }
          },
          description: `Restore original content of ${filePath}`
        }],
        metadata: {
          backupPath,
          originalHash: hash
        }
      };
    } catch {
      // 文件不存在，回滚就是删除
      return {
        steps: [{
          action: {
            type: ActionType.FILE_DELETE,
            parameters: { filePath }
          },
          description: `Delete newly created file ${filePath}`
        }],
        metadata: { fileWasNew: true }
      };
    }
  }

  getImpact(): ExecutionImpact {
    return this.impact;
  }
}
```

---

## 4. 存储层实现

### 4.1 SQLite 数据库

```typescript
// packages/core/src/storage/database.ts

import Database from 'better-sqlite3';
import * as path from 'path';

interface DatabaseConfig {
  path: string;
  enableWAL: boolean;
  busyTimeout: number;
}

class HawkeyeDatabase {
  private db: Database.Database;
  private config: DatabaseConfig;

  constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = {
      path: path.join(process.env.HOME!, '.hawkeye', 'db', 'hawkeye.db'),
      enableWAL: true,
      busyTimeout: 5000,
      ...config
    };

    this.db = new Database(this.config.path);

    if (this.config.enableWAL) {
      this.db.pragma('journal_mode = WAL');
    }
    this.db.pragma(`busy_timeout = ${this.config.busyTimeout}`);

    this.initializeTables();
  }

  private initializeTables(): void {
    // 情节记忆表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodic_memory (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        event_source TEXT NOT NULL,
        event_data TEXT NOT NULL,
        context TEXT,
        importance REAL DEFAULT 0.5,
        tags TEXT,
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_episodic_timestamp ON episodic_memory(timestamp);
      CREATE INDEX IF NOT EXISTS idx_episodic_type ON episodic_memory(event_type);
    `);

    // 语义记忆表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_memory (
        id TEXT PRIMARY KEY,
        node_type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        properties TEXT,
        embedding BLOB,
        confidence REAL DEFAULT 1.0,
        source TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_semantic_name ON semantic_memory(name);
      CREATE INDEX IF NOT EXISTS idx_semantic_type ON semantic_memory(node_type);
    `);

    // 语义关系表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_relations (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        bidirectional INTEGER DEFAULT 0,
        FOREIGN KEY (source_id) REFERENCES semantic_memory(id),
        FOREIGN KEY (target_id) REFERENCES semantic_memory(id)
      );
      CREATE INDEX IF NOT EXISTS idx_relation_source ON semantic_relations(source_id);
      CREATE INDEX IF NOT EXISTS idx_relation_target ON semantic_relations(target_id);
    `);

    // 程序性记忆表 (行为模式)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS procedural_memory (
        id TEXT PRIMARY KEY,
        pattern_name TEXT NOT NULL,
        description TEXT,
        trigger_conditions TEXT NOT NULL,
        action_sequence TEXT NOT NULL,
        occurrence_count INTEGER DEFAULT 1,
        success_rate REAL DEFAULT 1.0,
        average_duration REAL,
        last_occurrence INTEGER,
        first_occurrence INTEGER,
        is_automated INTEGER DEFAULT 0,
        automation_config TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_procedural_name ON procedural_memory(pattern_name);
    `);

    // 执行历史表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS execution_history (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        step_id TEXT,
        status TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration INTEGER,
        output TEXT,
        error TEXT,
        impact TEXT,
        rollback_info TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_execution_plan ON execution_history(plan_id);
      CREATE INDEX IF NOT EXISTS idx_execution_status ON execution_history(status);
      CREATE INDEX IF NOT EXISTS idx_execution_time ON execution_history(start_time);
    `);

    // 建议历史表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS suggestion_history (
        id TEXT PRIMARY KEY,
        plan_id TEXT,
        trigger_type TEXT NOT NULL,
        trigger_data TEXT,
        suggestion_type TEXT NOT NULL,
        suggestion_content TEXT NOT NULL,
        user_response TEXT,
        response_time INTEGER,
        feedback TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_suggestion_type ON suggestion_history(suggestion_type);
      CREATE INDEX IF NOT EXISTS idx_suggestion_response ON suggestion_history(user_response);
    `);

    // 用户偏好表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
    `);
  }

  // 情节记忆操作
  saveEpisodicMemory(memory: EpisodicMemory): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO episodic_memory
      (id, timestamp, event_type, event_source, event_data, context, importance, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memory.id,
      memory.timestamp.getTime(),
      memory.event.type,
      memory.event.source,
      JSON.stringify(memory.event.data),
      JSON.stringify(memory.context),
      memory.metadata.importance,
      JSON.stringify(memory.metadata.tags)
    );
  }

  queryEpisodicMemory(options: QueryOptions): EpisodicMemory[] {
    let sql = 'SELECT * FROM episodic_memory WHERE 1=1';
    const params: any[] = [];

    if (options.eventType) {
      sql += ' AND event_type = ?';
      params.push(options.eventType);
    }

    if (options.since) {
      sql += ' AND timestamp >= ?';
      params.push(options.since);
    }

    if (options.until) {
      sql += ' AND timestamp <= ?';
      params.push(options.until);
    }

    sql += ' ORDER BY timestamp DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params);
    return rows.map(this.rowToEpisodicMemory);
  }

  // 执行历史操作
  saveExecutionResult(result: ExecutionResult): void {
    const stmt = this.db.prepare(`
      INSERT INTO execution_history
      (id, plan_id, step_id, status, start_time, end_time, duration, output, error, impact, rollback_info)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      result.id,
      result.planId,
      result.stepId,
      result.status,
      result.details.startTime.getTime(),
      result.details.endTime?.getTime(),
      result.details.duration,
      result.details.output,
      result.details.error ? JSON.stringify(result.details.error) : null,
      JSON.stringify(result.impact),
      result.rollback ? JSON.stringify(result.rollback) : null
    );
  }

  // 建议历史操作
  saveSuggestion(suggestion: SuggestionRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO suggestion_history
      (id, plan_id, trigger_type, trigger_data, suggestion_type, suggestion_content)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      suggestion.id,
      suggestion.planId,
      suggestion.triggerType,
      JSON.stringify(suggestion.triggerData),
      suggestion.suggestionType,
      JSON.stringify(suggestion.suggestionContent)
    );
  }

  updateSuggestionResponse(id: string, response: string, feedback?: string): void {
    const stmt = this.db.prepare(`
      UPDATE suggestion_history
      SET user_response = ?, response_time = ?, feedback = ?
      WHERE id = ?
    `);

    stmt.run(response, Date.now(), feedback, id);
  }

  // 数据清理
  cleanup(retentionDays: number = 30): void {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    this.db.prepare('DELETE FROM episodic_memory WHERE timestamp < ?').run(cutoff);
    this.db.prepare('DELETE FROM execution_history WHERE start_time < ?').run(cutoff);
    this.db.prepare('DELETE FROM suggestion_history WHERE created_at < ?').run(cutoff);
  }

  close(): void {
    this.db.close();
  }
}
```

### 4.2 向量存储 (语义搜索)

```typescript
// packages/core/src/storage/vector-store.ts

interface VectorStoreConfig {
  dimensions: number;
  indexPath: string;
  metric: 'cosine' | 'euclidean' | 'dot';
}

class VectorStore {
  private config: VectorStoreConfig;
  private index: Map<string, { vector: number[]; metadata: any }> = new Map();

  constructor(config: Partial<VectorStoreConfig> = {}) {
    this.config = {
      dimensions: 384, // MiniLM 默认维度
      indexPath: path.join(process.env.HOME!, '.hawkeye', 'vectors'),
      metric: 'cosine',
      ...config
    };
  }

  async add(id: string, vector: number[], metadata: any): Promise<void> {
    if (vector.length !== this.config.dimensions) {
      throw new Error(`Vector dimension mismatch: expected ${this.config.dimensions}, got ${vector.length}`);
    }

    this.index.set(id, { vector, metadata });
  }

  async search(queryVector: number[], topK: number = 10): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const [id, { vector, metadata }] of this.index) {
      const similarity = this.calculateSimilarity(queryVector, vector);
      results.push({ id, similarity, metadata });
    }

    // 排序并返回 top K
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  private calculateSimilarity(a: number[], b: number[]): number {
    switch (this.config.metric) {
      case 'cosine':
        return this.cosineSimilarity(a, b);
      case 'euclidean':
        return 1 / (1 + this.euclideanDistance(a, b));
      case 'dot':
        return this.dotProduct(a, b);
      default:
        return this.cosineSimilarity(a, b);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = this.dotProduct(a, b);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (normA * normB);
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  private euclideanDistance(a: number[], b: number[]): number {
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
  }

  async save(): Promise<void> {
    const data = JSON.stringify(Array.from(this.index.entries()));
    await fs.writeFile(
      path.join(this.config.indexPath, 'vectors.json'),
      data
    );
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(
        path.join(this.config.indexPath, 'vectors.json'),
        'utf8'
      );
      this.index = new Map(JSON.parse(data));
    } catch {
      // 文件不存在，使用空索引
    }
  }
}
```

---

## 5. 客户端实现

### 5.1 Desktop 客户端 (Electron/Tauri)

```typescript
// packages/desktop/src/main/index.ts

import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import { HawkeyeCore } from '@hawkeye/core';

class HawkeyeDesktop {
  private mainWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private core: HawkeyeCore;
  private isQuitting = false;

  constructor() {
    this.core = new HawkeyeCore({
      platform: 'desktop',
      storagePath: app.getPath('userData')
    });
  }

  async initialize(): Promise<void> {
    await app.whenReady();

    // 初始化核心
    await this.core.initialize();

    // 创建托盘图标
    this.createTray();

    // 设置 IPC 处理器
    this.setupIPC();

    // 启动感知服务
    await this.startPerception();

    // 监听核心事件
    this.setupCoreListeners();
  }

  private createTray(): void {
    const iconPath = process.platform === 'darwin'
      ? 'assets/tray-icon-mac.png'
      : 'assets/tray-icon.png';

    this.tray = new Tray(nativeImage.createFromPath(iconPath));

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '🦅 Hawkeye 运行中',
        enabled: false
      },
      { type: 'separator' },
      {
        label: '📋 查看建议',
        click: () => this.showSuggestions()
      },
      {
        label: '📜 历史记录',
        click: () => this.showHistory()
      },
      { type: 'separator' },
      {
        label: '⏸️ 暂停 1 小时',
        click: () => this.pauseForDuration(3600000)
      },
      {
        label: '⚙️ 偏好设置',
        click: () => this.showPreferences()
      },
      { type: 'separator' },
      {
        label: '❌ 退出',
        click: () => this.quit()
      }
    ]);

    this.tray.setToolTip('Hawkeye - AI 智能助手');
    this.tray.setContextMenu(contextMenu);

    // 点击托盘图标显示/隐藏主窗口
    this.tray.on('click', () => {
      if (this.mainWindow?.isVisible()) {
        this.mainWindow.hide();
      } else {
        this.showMainWindow();
      }
    });
  }

  private setupIPC(): void {
    // 获取建议
    ipcMain.handle('get-suggestions', async () => {
      return this.core.getSuggestions();
    });

    // 接受建议
    ipcMain.handle('accept-suggestion', async (_, suggestionId: string) => {
      return this.core.acceptSuggestion(suggestionId);
    });

    // 拒绝建议
    ipcMain.handle('reject-suggestion', async (_, suggestionId: string, reason?: string) => {
      return this.core.rejectSuggestion(suggestionId, reason);
    });

    // 执行计划
    ipcMain.handle('execute-plan', async (_, planId: string) => {
      return this.core.executePlan(planId);
    });

    // 获取执行历史
    ipcMain.handle('get-execution-history', async (_, options) => {
      return this.core.getExecutionHistory(options);
    });

    // 回滚操作
    ipcMain.handle('rollback', async (_, executionId: string) => {
      return this.core.rollback(executionId);
    });

    // 获取/设置偏好
    ipcMain.handle('get-preferences', async () => {
      return this.core.getPreferences();
    });

    ipcMain.handle('set-preferences', async (_, prefs) => {
      return this.core.setPreferences(prefs);
    });
  }

  private setupCoreListeners(): void {
    // 新建议生成
    this.core.on('suggestion:new', (suggestion) => {
      this.showSuggestionNotification(suggestion);
    });

    // 执行完成
    this.core.on('execution:complete', (result) => {
      this.showExecutionResult(result);
    });

    // 需要确认
    this.core.on('confirmation:required', (data) => {
      this.showConfirmationDialog(data);
    });
  }

  private showSuggestionNotification(suggestion: TaskSuggestion): void {
    // 更新托盘图标 (显示有新建议)
    this.updateTrayIcon(true);

    // 显示通知气泡
    if (process.platform === 'darwin') {
      // macOS 原生通知
      new Notification({
        title: '🦅 Hawkeye',
        body: suggestion.summary,
        silent: true
      }).show();
    } else {
      // 显示自定义气泡窗口
      this.showBubbleWindow(suggestion);
    }
  }

  private async showBubbleWindow(suggestion: TaskSuggestion): Promise<void> {
    const bubbleWindow = new BrowserWindow({
      width: 400,
      height: 200,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // 定位到屏幕右下角
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    bubbleWindow.setPosition(screenWidth - 420, screenHeight - 220);

    await bubbleWindow.loadFile('bubble.html');
    bubbleWindow.webContents.send('suggestion', suggestion);

    // 5秒后自动关闭
    setTimeout(() => {
      if (!bubbleWindow.isDestroyed()) {
        bubbleWindow.close();
      }
    }, 5000);
  }

  private async startPerception(): Promise<void> {
    await this.core.startPerception({
      screen: { enabled: true, interval: 5000 },
      clipboard: { enabled: true, interval: 500 },
      window: { enabled: true, interval: 1000 },
      filesystem: { enabled: true, paths: this.getDefaultWatchPaths() }
    });
  }

  private getDefaultWatchPaths(): string[] {
    const home = app.getPath('home');
    return [
      path.join(home, 'Desktop'),
      path.join(home, 'Downloads'),
      path.join(home, 'Documents')
    ];
  }

  private quit(): void {
    this.isQuitting = true;
    this.core.shutdown();
    app.quit();
  }
}

// 启动应用
const hawkeye = new HawkeyeDesktop();
hawkeye.initialize().catch(console.error);
```

### 5.2 Chrome 扩展

```typescript
// packages/chrome-extension/src/background/index.ts

import { HawkeyeCore } from '@hawkeye/core';

class HawkeyeChromeExtension {
  private core: HawkeyeCore;
  private desktopConnection: WebSocket | null = null;

  constructor() {
    this.core = new HawkeyeCore({
      platform: 'chrome',
      storagePath: 'indexedDB'
    });
  }

  async initialize(): Promise<void> {
    // 初始化核心
    await this.core.initialize();

    // 连接到 Desktop 应用 (如果运行中)
    this.connectToDesktop();

    // 监听标签页变化
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
    chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this));

    // 监听右键菜单
    this.setupContextMenu();

    // 监听消息
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  private async handleTabUpdate(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ): Promise<void> {
    if (changeInfo.status === 'complete' && tab.url) {
      // 分析页面内容
      const pageContent = await this.getPageContent(tabId);

      this.core.emit('perception:page', {
        type: 'page_loaded',
        data: {
          url: tab.url,
          title: tab.title,
          content: pageContent
        }
      });
    }
  }

  private async getPageContent(tabId: number): Promise<PageContent> {
    return new Promise((resolve) => {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return {
            text: document.body.innerText.slice(0, 10000),
            title: document.title,
            meta: {
              description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
              keywords: document.querySelector('meta[name="keywords"]')?.getAttribute('content')
            },
            headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent),
            links: Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map(a => ({
              text: a.textContent,
              href: a.getAttribute('href')
            }))
          };
        }
      }, (results) => {
        resolve(results?.[0]?.result || { text: '', title: '' });
      });
    });
  }

  private setupContextMenu(): void {
    chrome.contextMenus.create({
      id: 'hawkeye-analyze',
      title: '🦅 Hawkeye: 分析选中内容',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'hawkeye-save',
      title: '🦅 Hawkeye: 保存到知识库',
      contexts: ['selection', 'page']
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'hawkeye-analyze' && info.selectionText) {
        this.analyzeSelection(info.selectionText, tab);
      }
      if (info.menuItemId === 'hawkeye-save') {
        this.saveToKnowledge(info, tab);
      }
    });
  }

  private async analyzeSelection(text: string, tab: chrome.tabs.Tab | undefined): Promise<void> {
    // 检测内容类型
    const contentType = this.core.perception.clipboard.analyzeContentType(text);

    // 生成建议
    const suggestion = await this.core.reasoning.generateSuggestion({
      type: 'selection_analysis',
      data: {
        text,
        contentType,
        pageUrl: tab?.url,
        pageTitle: tab?.title
      }
    });

    // 显示侧边栏
    chrome.sidePanel.open({ tabId: tab?.id });

    // 发送建议到侧边栏
    chrome.runtime.sendMessage({
      type: 'suggestion',
      data: suggestion
    });
  }

  private connectToDesktop(): void {
    // 尝试连接到 Desktop 应用的 WebSocket 服务器
    try {
      this.desktopConnection = new WebSocket('ws://localhost:31337');

      this.desktopConnection.onopen = () => {
        console.log('Connected to Hawkeye Desktop');
        this.syncWithDesktop();
      };

      this.desktopConnection.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleDesktopMessage(message);
      };

      this.desktopConnection.onclose = () => {
        console.log('Disconnected from Hawkeye Desktop');
        // 5秒后重连
        setTimeout(() => this.connectToDesktop(), 5000);
      };
    } catch (error) {
      // Desktop 未运行，独立工作
      console.log('Hawkeye Desktop not available, running standalone');
    }
  }

  private async syncWithDesktop(): Promise<void> {
    if (this.desktopConnection?.readyState === WebSocket.OPEN) {
      this.desktopConnection.send(JSON.stringify({
        type: 'sync',
        source: 'chrome',
        data: {
          suggestions: await this.core.getSuggestions(),
          recentHistory: await this.core.getExecutionHistory({ limit: 10 })
        }
      }));
    }
  }
}

// 初始化扩展
const extension = new HawkeyeChromeExtension();
extension.initialize().catch(console.error);
```

### 5.3 VS Code 扩展

```typescript
// packages/vscode-extension/src/extension.ts

import * as vscode from 'vscode';
import { HawkeyeCore } from '@hawkeye/core';

class HawkeyeVSCodeExtension {
  private core: HawkeyeCore;
  private statusBarItem: vscode.StatusBarItem;
  private diagnosticCollection: vscode.DiagnosticCollection;
  private desktopConnection: WebSocket | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.core = new HawkeyeCore({
      platform: 'vscode',
      storagePath: context.globalStorageUri.fsPath
    });

    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('hawkeye');
  }

  async activate(): Promise<void> {
    // 初始化核心
    await this.core.initialize();

    // 设置状态栏
    this.setupStatusBar();

    // 注册命令
    this.registerCommands();

    // 监听编辑器事件
    this.setupEditorListeners();

    // 监听诊断变化 (错误检测)
    this.setupDiagnosticListener();

    // 连接到 Desktop
    this.connectToDesktop();

    // 显示状态栏
    this.statusBarItem.show();
  }

  private setupStatusBar(): void {
    this.statusBarItem.text = '$(eye) Hawkeye';
    this.statusBarItem.tooltip = 'Hawkeye AI 助手';
    this.statusBarItem.command = 'hawkeye.showPanel';
  }

  private registerCommands(): void {
    // 显示 Hawkeye 面板
    this.context.subscriptions.push(
      vscode.commands.registerCommand('hawkeye.showPanel', () => {
        this.showPanel();
      })
    );

    // 分析当前文件
    this.context.subscriptions.push(
      vscode.commands.registerCommand('hawkeye.analyzeFile', () => {
        this.analyzeCurrentFile();
      })
    );

    // 分析选中代码
    this.context.subscriptions.push(
      vscode.commands.registerCommand('hawkeye.analyzeSelection', () => {
        this.analyzeSelection();
      })
    );

    // 修复当前错误
    this.context.subscriptions.push(
      vscode.commands.registerCommand('hawkeye.fixError', () => {
        this.fixCurrentError();
      })
    );

    // 生成代码
    this.context.subscriptions.push(
      vscode.commands.registerCommand('hawkeye.generateCode', () => {
        this.generateCode();
      })
    );
  }

  private setupEditorListeners(): void {
    // 文件保存时分析
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      await this.analyzeDocument(document);
    });

    // 活动编辑器变化
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor) {
        // 通知 Desktop 上下文变化
        this.notifyContextChange(editor);
      }
    });

    // 选择变化
    vscode.window.onDidChangeTextEditorSelection(async (event) => {
      if (event.selections.length > 0 && !event.selections[0].isEmpty) {
        // 用户选中了代码
        const selection = event.textEditor.document.getText(event.selections[0]);
        if (selection.length > 10) {
          this.core.emit('perception:selection', {
            text: selection,
            language: event.textEditor.document.languageId,
            file: event.textEditor.document.fileName
          });
        }
      }
    });
  }

  private setupDiagnosticListener(): void {
    vscode.languages.onDidChangeDiagnostics(async (event) => {
      for (const uri of event.uris) {
        const diagnostics = vscode.languages.getDiagnostics(uri);
        const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);

        if (errors.length > 0) {
          // 检测到错误，生成修复建议
          await this.handleErrors(uri, errors);
        }
      }
    });
  }

  private async handleErrors(uri: vscode.Uri, errors: vscode.Diagnostic[]): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);

    for (const error of errors.slice(0, 3)) { // 最多处理3个错误
      const errorContext = {
        message: error.message,
        code: error.code,
        source: error.source,
        range: {
          start: { line: error.range.start.line, character: error.range.start.character },
          end: { line: error.range.end.line, character: error.range.end.character }
        },
        surroundingCode: this.getSurroundingCode(document, error.range),
        language: document.languageId,
        file: document.fileName
      };

      // 生成修复建议
      const suggestion = await this.core.reasoning.generateSuggestion({
        type: 'code_error',
        data: errorContext
      });

      if (suggestion) {
        this.showErrorSuggestion(uri, error, suggestion);
      }
    }
  }

  private getSurroundingCode(document: vscode.TextDocument, range: vscode.Range): string {
    const startLine = Math.max(0, range.start.line - 5);
    const endLine = Math.min(document.lineCount - 1, range.end.line + 5);

    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const prefix = i === range.start.line ? '>>> ' : '    ';
      lines.push(`${prefix}${i + 1}: ${document.lineAt(i).text}`);
    }
    return lines.join('\n');
  }

  private async showErrorSuggestion(
    uri: vscode.Uri,
    error: vscode.Diagnostic,
    suggestion: TaskSuggestion
  ): Promise<void> {
    // 显示 CodeLens
    // 或者显示通知
    const action = await vscode.window.showInformationMessage(
      `🦅 Hawkeye: ${suggestion.summary}`,
      '查看方案',
      '忽略'
    );

    if (action === '查看方案') {
      this.showSuggestionPanel(suggestion);
    }
  }

  private showSuggestionPanel(suggestion: TaskSuggestion): void {
    const panel = vscode.window.createWebviewPanel(
      'hawkeyeSuggestion',
      '🦅 Hawkeye 建议',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true
      }
    );

    panel.webview.html = this.getSuggestionPanelHTML(suggestion);

    // 处理 webview 消息
    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'accept':
          await this.core.acceptSuggestion(suggestion.id);
          panel.dispose();
          break;
        case 'reject':
          await this.core.rejectSuggestion(suggestion.id);
          panel.dispose();
          break;
        case 'execute':
          await this.core.executePlan(suggestion.planId);
          panel.dispose();
          break;
      }
    });
  }

  private connectToDesktop(): void {
    try {
      this.desktopConnection = new WebSocket('ws://localhost:31337');

      this.desktopConnection.onopen = () => {
        this.updateStatusBar('connected');
        this.syncWithDesktop();
      };

      this.desktopConnection.onclose = () => {
        this.updateStatusBar('disconnected');
        setTimeout(() => this.connectToDesktop(), 5000);
      };

      this.desktopConnection.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleDesktopMessage(message);
      };
    } catch {
      this.updateStatusBar('standalone');
    }
  }

  private updateStatusBar(status: 'connected' | 'disconnected' | 'standalone'): void {
    switch (status) {
      case 'connected':
        this.statusBarItem.text = '$(eye) Hawkeye ✓';
        this.statusBarItem.tooltip = 'Hawkeye - 已连接到 Desktop';
        break;
      case 'disconnected':
        this.statusBarItem.text = '$(eye) Hawkeye';
        this.statusBarItem.tooltip = 'Hawkeye - 独立运行';
        break;
      case 'standalone':
        this.statusBarItem.text = '$(eye) Hawkeye';
        this.statusBarItem.tooltip = 'Hawkeye - 独立运行';
        break;
    }
  }

  deactivate(): void {
    this.core.shutdown();
    this.desktopConnection?.close();
    this.statusBarItem.dispose();
    this.diagnosticCollection.dispose();
  }
}

// 导出激活和停用函数
let extension: HawkeyeVSCodeExtension;

export function activate(context: vscode.ExtensionContext): void {
  extension = new HawkeyeVSCodeExtension(context);
  extension.activate().catch(console.error);
}

export function deactivate(): void {
  extension?.deactivate();
}
```

---

## 6. AI 集成实现

### 6.1 AI Provider 抽象

```typescript
// packages/core/src/ai/provider.ts

interface AIProviderConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

abstract class AIProvider {
  protected config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = {
      temperature: 0.7,
      maxTokens: 4096,
      timeout: 30000,
      ...config
    };
  }

  abstract complete(prompt: string, options?: CompletionOptions): Promise<string>;
  abstract embed(text: string): Promise<number[]>;
  abstract isAvailable(): Promise<boolean>;
}
```

### 6.2 Ollama Provider (本地 LLM)

```typescript
// packages/core/src/ai/providers/ollama.ts

class OllamaProvider extends AIProvider {
  private baseUrl: string;

  constructor(config: Partial<AIProviderConfig> & { baseUrl?: string } = {}) {
    super({
      model: 'llama3.2',
      ...config
    });
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? this.config.temperature,
          num_predict: options?.maxTokens ?? this.config.maxTokens
        }
      }),
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text', // 或 'mxbai-embed-large'
        prompt: text
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    const data = await response.json();
    return data.models.map((m: any) => m.name);
  }
}
```

### 6.3 Claude Provider (云端)

```typescript
// packages/core/src/ai/providers/claude.ts

import Anthropic from '@anthropic-ai/sdk';

class ClaudeProvider extends AIProvider {
  private client: Anthropic;

  constructor(config: Partial<AIProviderConfig> & { apiKey?: string } = {}) {
    super({
      model: 'claude-3-5-sonnet-20241022',
      ...config
    });

    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY
    });
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: options?.maxTokens ?? this.config.maxTokens!,
      temperature: options?.temperature ?? this.config.temperature,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock?.text || '';
  }

  async embed(text: string): Promise<number[]> {
    // Claude 没有原生 embedding API，使用替代方案
    // 可以使用 Voyage AI 或其他 embedding 服务
    throw new Error('Claude does not support native embeddings. Use a dedicated embedding provider.');
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.config.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }]
      });
      return true;
    } catch {
      return false;
    }
  }
}
```

### 6.4 AI 管理器 (智能后端选择)

```typescript
// packages/core/src/ai/manager.ts

class AIManager {
  private providers: Map<string, AIProvider> = new Map();
  private primaryProvider: AIProvider | null = null;
  private fallbackProvider: AIProvider | null = null;

  async initialize(): Promise<void> {
    // 1. 尝试 Ollama (本地优先)
    const ollama = new OllamaProvider();
    if (await ollama.isAvailable()) {
      this.providers.set('ollama', ollama);
      this.primaryProvider = ollama;
      console.log('Using Ollama as primary AI provider');
    }

    // 2. 尝试 Claude (作为备选)
    if (process.env.ANTHROPIC_API_KEY) {
      const claude = new ClaudeProvider();
      if (await claude.isAvailable()) {
        this.providers.set('claude', claude);
        if (!this.primaryProvider) {
          this.primaryProvider = claude;
          console.log('Using Claude as primary AI provider');
        } else {
          this.fallbackProvider = claude;
          console.log('Claude available as fallback');
        }
      }
    }

    // 3. 尝试其他国产大模型
    // ... 豆包、通义千问等

    if (!this.primaryProvider) {
      throw new Error('No AI provider available');
    }
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    try {
      return await this.primaryProvider!.complete(prompt, options);
    } catch (error) {
      if (this.fallbackProvider) {
        console.warn('Primary provider failed, using fallback');
        return await this.fallbackProvider.complete(prompt, options);
      }
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    // 优先使用支持 embedding 的 provider
    for (const [name, provider] of this.providers) {
      try {
        return await provider.embed(text);
      } catch {
        continue;
      }
    }
    throw new Error('No embedding provider available');
  }

  getProvider(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  setPreferredProvider(name: string): void {
    const provider = this.providers.get(name);
    if (provider) {
      this.primaryProvider = provider;
    }
  }
}
```

---

## 7. 通信协议实现

### 7.1 WebSocket 服务器 (Desktop)

```typescript
// packages/desktop/src/communication/server.ts

import { WebSocket, WebSocketServer } from 'ws';

interface HawkeyeMessage {
  type: 'context' | 'suggestion' | 'execution' | 'sync' | 'ping' | 'pong';
  source: 'desktop' | 'chrome' | 'vscode';
  payload: any;
  timestamp: number;
  messageId: string;
}

class HawkeyeCommunicationServer {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocket> = new Map();
  private messageHandlers: Map<string, (message: HawkeyeMessage, client: WebSocket) => void> = new Map();

  constructor(port: number = 31337) {
    this.wss = new WebSocketServer({ port });
    this.setupServer();
    this.registerHandlers();
  }

  private setupServer(): void {
    this.wss.on('connection', (ws, req) => {
      const clientId = generateId();
      this.clients.set(clientId, ws);

      console.log(`Client connected: ${clientId}`);

      ws.on('message', (data) => {
        try {
          const message: HawkeyeMessage = JSON.parse(data.toString());
          this.handleMessage(message, ws);
        } catch (error) {
          console.error('Invalid message:', error);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`Client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // 发送欢迎消息
      ws.send(JSON.stringify({
        type: 'welcome',
        payload: { clientId },
        timestamp: Date.now()
      }));
    });
  }

  private registerHandlers(): void {
    // 上下文同步
    this.messageHandlers.set('context', (message, client) => {
      // 广播给其他客户端
      this.broadcast(message, client);
    });

    // 建议同步
    this.messageHandlers.set('suggestion', (message, client) => {
      this.broadcast(message, client);
    });

    // 执行请求
    this.messageHandlers.set('execution', async (message, client) => {
      // 处理执行请求并返回结果
      const result = await this.handleExecution(message.payload);
      client.send(JSON.stringify({
        type: 'execution_result',
        payload: result,
        timestamp: Date.now(),
        messageId: message.messageId
      }));
    });

    // 完整同步
    this.messageHandlers.set('sync', (message, client) => {
      // 返回完整状态
      client.send(JSON.stringify({
        type: 'sync_response',
        payload: this.getFullState(),
        timestamp: Date.now()
      }));
    });

    // 心跳
    this.messageHandlers.set('ping', (message, client) => {
      client.send(JSON.stringify({
        type: 'pong',
        timestamp: Date.now()
      }));
    });
  }

  private handleMessage(message: HawkeyeMessage, client: WebSocket): void {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message, client);
    } else {
      console.warn(`Unknown message type: ${message.type}`);
    }
  }

  private broadcast(message: HawkeyeMessage, exclude?: WebSocket): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  sendToAll(message: Omit<HawkeyeMessage, 'timestamp' | 'messageId'>): void {
    const fullMessage: HawkeyeMessage = {
      ...message,
      timestamp: Date.now(),
      messageId: generateId()
    };
    this.broadcast(fullMessage);
  }

  close(): void {
    this.wss.close();
  }
}
```

---

## 8. 安全实现

### 8.1 权限管理

```typescript
// packages/core/src/security/permissions.ts

enum Permission {
  SCREEN_CAPTURE = 'screen_capture',
  CLIPBOARD_READ = 'clipboard_read',
  CLIPBOARD_WRITE = 'clipboard_write',
  FILE_READ = 'file_read',
  FILE_WRITE = 'file_write',
  FILE_DELETE = 'file_delete',
  SHELL_EXECUTE = 'shell_execute',
  NETWORK_ACCESS = 'network_access',
  BROWSER_CONTROL = 'browser_control',
  APP_CONTROL = 'app_control'
}

interface PermissionRequest {
  permission: Permission;
  reason: string;
  scope?: string;  // 例如文件路径
}

class PermissionManager {
  private grantedPermissions: Set<string> = new Set();
  private deniedPermissions: Set<string> = new Set();
  private permissionCallbacks: Map<string, (granted: boolean) => void> = new Map();

  async requestPermission(request: PermissionRequest): Promise<boolean> {
    const key = this.getPermissionKey(request);

    // 检查是否已授权
    if (this.grantedPermissions.has(key)) return true;
    if (this.deniedPermissions.has(key)) return false;

    // 请求用户授权
    return new Promise((resolve) => {
      this.emit('permission:request', {
        ...request,
        callback: (granted: boolean) => {
          if (granted) {
            this.grantedPermissions.add(key);
          } else {
            this.deniedPermissions.add(key);
          }
          resolve(granted);
        }
      });
    });
  }

  checkPermission(permission: Permission, scope?: string): boolean {
    const key = this.getPermissionKey({ permission, reason: '', scope });
    return this.grantedPermissions.has(key);
  }

  revokePermission(permission: Permission, scope?: string): void {
    const key = this.getPermissionKey({ permission, reason: '', scope });
    this.grantedPermissions.delete(key);
  }

  private getPermissionKey(request: PermissionRequest): string {
    return request.scope
      ? `${request.permission}:${request.scope}`
      : request.permission;
  }
}
```

### 8.2 数据加密

```typescript
// packages/core/src/security/encryption.ts

import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

class DataEncryption {
  private algorithm = 'aes-256-gcm';
  private keyLength = 32;
  private ivLength = 16;
  private saltLength = 32;
  private tagLength = 16;

  async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return (await scryptAsync(password, salt, this.keyLength)) as Buffer;
  }

  async encrypt(data: string, password: string): Promise<string> {
    const salt = randomBytes(this.saltLength);
    const iv = randomBytes(this.ivLength);
    const key = await this.deriveKey(password, salt);

    const cipher = createCipheriv(this.algorithm, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    // 格式: salt:iv:tag:encrypted
    return [
      salt.toString('hex'),
      iv.toString('hex'),
      tag.toString('hex'),
      encrypted
    ].join(':');
  }

  async decrypt(encryptedData: string, password: string): Promise<string> {
    const [saltHex, ivHex, tagHex, encrypted] = encryptedData.split(':');

    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const key = await this.deriveKey(password, salt);

    const decipher = createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

### 8.3 敏感数据过滤

```typescript
// packages/core/src/security/filter.ts

class SensitiveDataFilter {
  private patterns: RegExp[] = [
    // 密码
    /password\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,
    /pwd\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,

    // API Keys
    /api[_-]?key\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,
    /secret\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,
    /token\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,

    // AWS
    /AKIA[0-9A-Z]{16}/g,
    /aws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,

    // 信用卡
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,

    // SSN
    /\b\d{3}-\d{2}-\d{4}\b/g,

    // 私钥
    /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]+?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,

    // JWT
    /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g
  ];

  filter(text: string): string {
    let filtered = text;
    for (const pattern of this.patterns) {
      filtered = filtered.replace(pattern, '[REDACTED]');
    }
    return filtered;
  }

  containsSensitiveData(text: string): boolean {
    return this.patterns.some(pattern => pattern.test(text));
  }

  getSensitiveMatches(text: string): string[] {
    const matches: string[] = [];
    for (const pattern of this.patterns) {
      const found = text.match(pattern);
      if (found) {
        matches.push(...found);
      }
    }
    return matches;
  }
}
```

---

## 参考

此文档详细描述了 Hawkeye 各层的实现细节，作为 PRD 的技术补充文档。

**相关文档**:
- [PRD.md](./PRD.md) - 产品需求文档
- [zero-input-experience.md](./zero-input-experience.md) - 零输入体验设计
- [user-pain-points-research.md](./user-pain-points-research.md) - 用户痛点研究
