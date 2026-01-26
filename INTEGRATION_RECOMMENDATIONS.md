# Hawkeye Integration Recommendations

基于对 9 个 AI 桌面控制项目源代码的深入分析，本文档提供具体可移植的代码模式和功能建议。

---

## 目录

1. [优先级总览](#1-优先级总览)
2. [P0: AI Provider 统一抽象层](#2-p0-ai-provider-统一抽象层)
3. [P0: 坐标系统与 UI 元素定位](#3-p0-坐标系统与-ui-元素定位)
4. [P1: 增强的桌面控制模块](#4-p1-增强的桌面控制模块)
5. [P1: RAG 记忆系统](#5-p1-rag-记忆系统)
6. [P2: 自反思与错误恢复](#6-p2-自反思与错误恢复)
7. [P2: 技能/工具学习系统](#7-p2-技能工具学习系统)
8. [P3: Vision-Language-Action 模型集成](#8-p3-vision-language-action-模型集成)
9. [具体实现代码](#9-具体实现代码)

---

## 1. 优先级总览

| 优先级 | 功能模块 | 来源项目 | 复杂度 | 预期收益 |
|--------|----------|----------|--------|----------|
| **P0** | LiteLLM 风格 Provider 抽象 | Open Interpreter | 中 | 支持 100+ AI 模型 |
| **P0** | 归一化坐标系统 | OmniParser, UI-TARS | 低 | 跨分辨率兼容 |
| **P0** | YOLO UI 元素检测 | OmniParser, SOC | 中 | 精准元素定位 |
| **P1** | NutJS 桌面控制 | UI-TARS | 中 | 跨平台控制 |
| **P1** | RAG 向量记忆 | Cradle, Agent-S | 中 | 任务经验复用 |
| **P1** | 双智能体架构 | UFO, Agent-S | 高 | 复杂任务分解 |
| **P2** | 自反思机制 | Cradle, OS-Copilot | 中 | 失败自动恢复 |
| **P2** | 工具学习 | OS-Copilot | 中 | 自主能力扩展 |
| **P3** | ShowUI VLA 模型 | ShowUI | 高 | 端到端 UI 控制 |

---

## 2. P0: AI Provider 统一抽象层

### 2.1 现状分析

Hawkeye 当前只支持 Ollama 和 Gemini：

```typescript
// packages/core/src/ai/providers/index.ts (当前)
export { OllamaProvider, type OllamaConfig } from './ollama';
export { GeminiProvider, type GeminiConfig } from './gemini';
```

### 2.2 推荐方案：LiteLLM 风格统一接口

**来源**: Open Interpreter `/interpreter/core/llm/llm.py`

```typescript
// packages/core/src/ai/unified-provider.ts

import { EventEmitter } from 'events';

// 统一的消息格式
export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | AIMessageContent[];
  tool_calls?: ToolCall[];
}

export interface AIMessageContent {
  type: 'text' | 'image';
  text?: string;
  image_url?: { url: string };
}

// 模型能力检测
export interface ModelCapabilities {
  supportsVision: boolean;
  supportsFunctions: boolean;
  supportsStreaming: boolean;
  contextWindow: number;
  maxOutputTokens: number;
}

// Provider 配置
export interface UnifiedProviderConfig {
  model: string;           // "gpt-4o", "claude-3", "ollama/llama3", "deepseek-chat"
  apiKey?: string;
  apiBase?: string;
  temperature?: number;
  maxTokens?: number;
}

export class UnifiedAIProvider extends EventEmitter {
  private config: UnifiedProviderConfig;
  private capabilities: ModelCapabilities | null = null;

  // 模型到 Provider 的映射
  private static MODEL_PROVIDERS: Record<string, string> = {
    'gpt-4': 'openai',
    'gpt-4o': 'openai',
    'gpt-4o-mini': 'openai',
    'claude-3': 'anthropic',
    'claude-3.5': 'anthropic',
    'gemini': 'google',
    'ollama/': 'ollama',
    'deepseek': 'deepseek',
    'qwen': 'dashscope',
    'glm': 'zhipu',
  };

  // 自动检测模型能力
  async detectCapabilities(): Promise<ModelCapabilities> {
    const model = this.config.model;

    // Vision 支持检测
    const visionModels = ['gpt-4o', 'gpt-4-vision', 'claude-3', 'gemini-pro-vision', 'qwen-vl'];
    const supportsVision = visionModels.some(v => model.includes(v));

    // Function calling 支持检测
    const functionModels = ['gpt-4', 'gpt-3.5-turbo', 'claude-3', 'gemini'];
    const supportsFunctions = functionModels.some(f => model.includes(f));

    // Context window
    const contextWindows: Record<string, number> = {
      'gpt-4o': 128000,
      'gpt-4-turbo': 128000,
      'claude-3-opus': 200000,
      'claude-3-sonnet': 200000,
      'gemini-pro': 32000,
      'deepseek-chat': 64000,
    };

    const contextWindow = Object.entries(contextWindows)
      .find(([k]) => model.includes(k))?.[1] || 8000;

    this.capabilities = {
      supportsVision,
      supportsFunctions,
      supportsStreaming: true,
      contextWindow,
      maxOutputTokens: Math.min(4096, contextWindow / 4),
    };

    return this.capabilities;
  }

  // Ollama 模型自动下载 (来自 Open Interpreter)
  async ensureOllamaModel(): Promise<void> {
    if (!this.config.model.startsWith('ollama/')) return;

    const modelName = this.config.model.replace('ollama/', '');
    const apiBase = this.config.apiBase || 'http://localhost:11434';

    try {
      const response = await fetch(`${apiBase}/api/tags`);
      const data = await response.json();
      const installedModels = data.models?.map((m: any) => m.name) || [];

      if (!installedModels.includes(modelName)) {
        console.log(`Downloading Ollama model: ${modelName}...`);
        await fetch(`${apiBase}/api/pull`, {
          method: 'POST',
          body: JSON.stringify({ name: modelName }),
        });
      }

      // 获取 context window
      const showResponse = await fetch(`${apiBase}/api/show`, {
        method: 'POST',
        body: JSON.stringify({ name: modelName }),
      });
      const modelInfo = await showResponse.json();

      for (const [key, value] of Object.entries(modelInfo.model_info || {})) {
        if (key.includes('context_length')) {
          this.capabilities!.contextWindow = value as number;
          break;
        }
      }
    } catch (error) {
      console.warn('Ollama model check failed:', error);
    }
  }

  // 带重试的聊天完成 (来自 Open Interpreter)
  async *chat(
    messages: AIMessage[],
    options?: { tools?: ToolSchema[]; stream?: boolean }
  ): AsyncGenerator<string> {
    const maxAttempts = 4;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // 消息裁剪
        const trimmedMessages = this.trimMessages(messages);

        // 根据能力选择执行模式
        if (this.capabilities?.supportsFunctions && options?.tools) {
          yield* this.runToolCalling(trimmedMessages, options.tools);
        } else {
          yield* this.runTextCompletion(trimmedMessages);
        }
        return;

      } catch (error) {
        lastError = error as Error;

        // 认证错误处理
        if (error.message?.includes('auth') || error.message?.includes('api_key')) {
          if (attempt === 0) {
            // 尝试使用 dummy key (某些本地服务)
            this.config.apiKey = 'x';
            continue;
          }
        }

        // 第二次尝试：提升 temperature
        if (attempt === 1) {
          this.config.temperature = (this.config.temperature || 0) + 0.1;
        }

        // 指数退避
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }

    throw lastError;
  }

  // Context Window 管理 (来自 Open Interpreter)
  private trimMessages(messages: AIMessage[]): AIMessage[] {
    if (!this.capabilities) return messages;

    const maxTokens = this.capabilities.contextWindow - this.capabilities.maxOutputTokens - 100;
    let currentTokens = 0;
    const result: AIMessage[] = [];

    // 从最新消息向前保留
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateTokens(messages[i]);
      if (currentTokens + msgTokens <= maxTokens) {
        result.unshift(messages[i]);
        currentTokens += msgTokens;
      } else {
        break;
      }
    }

    return result;
  }

  private estimateTokens(message: AIMessage): number {
    const content = typeof message.content === 'string'
      ? message.content
      : message.content.map(c => c.text || '').join('');
    // 粗略估计: 1 token ≈ 3 字符
    return Math.ceil(content.length / 3);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 3. P0: 坐标系统与 UI 元素定位

### 3.1 归一化坐标系统

**来源**: OmniParser `/util/utils.py`, UI-TARS

所有坐标使用 0-1 归一化，解决跨分辨率兼容问题：

```typescript
// packages/core/src/perception/coordinates.ts

export interface BoundingBox {
  x1: number;  // 0-1 归一化
  y1: number;
  x2: number;
  y2: number;
}

export interface ScreenPoint {
  x: number;  // 0-1 归一化
  y: number;
}

export class CoordinateSystem {
  private screenWidth: number;
  private screenHeight: number;

  constructor(width: number, height: number) {
    this.screenWidth = width;
    this.screenHeight = height;
  }

  // 像素 -> 归一化
  pixelToNormalized(px: number, py: number): ScreenPoint {
    return {
      x: px / this.screenWidth,
      y: py / this.screenHeight,
    };
  }

  // 归一化 -> 像素
  normalizedToPixel(point: ScreenPoint): { x: number; y: number } {
    return {
      x: Math.round(point.x * this.screenWidth),
      y: Math.round(point.y * this.screenHeight),
    };
  }

  // BBox 归一化
  normalizeBBox(bbox: { x1: number; y1: number; x2: number; y2: number }): BoundingBox {
    return {
      x1: bbox.x1 / this.screenWidth,
      y1: bbox.y1 / this.screenHeight,
      x2: bbox.x2 / this.screenWidth,
      y2: bbox.y2 / this.screenHeight,
    };
  }

  // BBox 中心点
  getBBoxCenter(bbox: BoundingBox): ScreenPoint {
    return {
      x: (bbox.x1 + bbox.x2) / 2,
      y: (bbox.y1 + bbox.y2) / 2,
    };
  }

  // 从 OmniParser 结果转换
  static fromOmniParserResult(
    result: { bbox: [number, number, number, number] },
    screenWidth: number,
    screenHeight: number
  ): BoundingBox {
    // OmniParser 返回已归一化的坐标
    const [x1, y1, x2, y2] = result.bbox;
    return { x1, y1, x2, y2 };
  }
}
```

### 3.2 OmniParser 集成客户端

**来源**: OmniParser `/gradio_demo.py`

```typescript
// packages/core/src/perception/omniparser-client.ts

export interface OmniParserElement {
  id: number;
  bbox: [number, number, number, number];  // 归一化坐标
  label: string;
  type: 'icon' | 'text';
  content?: string;
  confidence: number;
}

export interface OmniParserResult {
  elements: OmniParserElement[];
  labeledImage: string;  // base64
  processingTime: number;
}

export class OmniParserClient {
  private baseUrl: string;
  private boxThreshold: number;
  private iouThreshold: number;

  constructor(config: {
    baseUrl?: string;
    boxThreshold?: number;
    iouThreshold?: number;
  } = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:7860';
    this.boxThreshold = config.boxThreshold || 0.05;
    this.iouThreshold = config.iouThreshold || 0.1;
  }

  async parse(imageBase64: string): Promise<OmniParserResult> {
    const startTime = Date.now();

    const response = await fetch(`${this.baseUrl}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: imageBase64,
        box_threshold: this.boxThreshold,
        iou_threshold: this.iouThreshold,
        use_paddleocr: true,
        imgsz: 1920,
      }),
    });

    if (!response.ok) {
      throw new Error(`OmniParser request failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      elements: this.parseElements(data),
      labeledImage: data.labeled_image,
      processingTime: Date.now() - startTime,
    };
  }

  private parseElements(data: any): OmniParserElement[] {
    const elements: OmniParserElement[] = [];

    // 解析 icon 检测结果
    if (data.parsed_content_list) {
      for (let i = 0; i < data.parsed_content_list.length; i++) {
        const content = data.parsed_content_list[i];
        const bbox = data.label_coordinates?.[i];

        if (bbox) {
          elements.push({
            id: i,
            bbox: bbox as [number, number, number, number],
            label: content.split(':')[0] || `element_${i}`,
            type: content.includes('Text Box') ? 'text' : 'icon',
            content: content,
            confidence: 1.0,
          });
        }
      }
    }

    return elements;
  }

  // 查找与描述匹配的元素
  async findElement(
    imageBase64: string,
    description: string,
    llm: any
  ): Promise<OmniParserElement | null> {
    const result = await this.parse(imageBase64);

    // 使用 LLM 进行语义匹配
    const prompt = `
Given these UI elements:
${result.elements.map(e => `[${e.id}] ${e.content}`).join('\n')}

Which element best matches the description: "${description}"?
Return only the element ID number, or -1 if no match.
`;

    const response = await llm.chat([{ role: 'user', content: prompt }]);
    const matchId = parseInt(response.trim());

    return result.elements.find(e => e.id === matchId) || null;
  }
}
```

### 3.3 Set-of-Mark (SOM) 标注

**来源**: Self-Operating Computer `/operate/utils/label.py`, Cradle

```typescript
// packages/core/src/perception/som-labeler.ts

import sharp from 'sharp';

export interface SOMResult {
  labeledImage: Buffer;
  labels: Map<string, { x: number; y: number; bbox: BoundingBox }>;
}

export class SOMLabeler {
  private omniParser: OmniParserClient;
  private labelStyle: {
    fontSize: number;
    fontColor: string;
    backgroundColor: string;
  };

  constructor(omniParser: OmniParserClient) {
    this.omniParser = omniParser;
    this.labelStyle = {
      fontSize: 14,
      fontColor: '#FF0000',
      backgroundColor: '#FFFF00',
    };
  }

  async labelImage(imageBuffer: Buffer): Promise<SOMResult> {
    const base64 = imageBuffer.toString('base64');
    const parseResult = await this.omniParser.parse(base64);

    const { width, height } = await sharp(imageBuffer).metadata();
    const coordSystem = new CoordinateSystem(width!, height!);

    const labels = new Map<string, { x: number; y: number; bbox: BoundingBox }>();
    const svgOverlays: string[] = [];

    for (const element of parseResult.elements) {
      const label = `~${element.id}`;
      const bbox = element.bbox;
      const center = coordSystem.getBBoxCenter({
        x1: bbox[0], y1: bbox[1], x2: bbox[2], y2: bbox[3]
      });

      const pixelCenter = coordSystem.normalizedToPixel(center);
      const pixelBBox = {
        x1: Math.round(bbox[0] * width!),
        y1: Math.round(bbox[1] * height!),
        x2: Math.round(bbox[2] * width!),
        y2: Math.round(bbox[3] * height!),
      };

      labels.set(label, {
        x: center.x,
        y: center.y,
        bbox: { x1: bbox[0], y1: bbox[1], x2: bbox[2], y2: bbox[3] },
      });

      // SVG 标注
      svgOverlays.push(`
        <rect x="${pixelBBox.x1}" y="${pixelBBox.y1}"
              width="${pixelBBox.x2 - pixelBBox.x1}"
              height="${pixelBBox.y2 - pixelBBox.y1}"
              fill="none" stroke="red" stroke-width="2"/>
        <text x="${pixelBBox.x1}" y="${pixelBBox.y1 - 4}"
              font-size="${this.labelStyle.fontSize}"
              fill="${this.labelStyle.fontColor}">
          ${label}
        </text>
      `);
    }

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${svgOverlays.join('')}
      </svg>
    `;

    const labeledImage = await sharp(imageBuffer)
      .composite([{
        input: Buffer.from(svg),
        blend: 'over',
      }])
      .toBuffer();

    return { labeledImage, labels };
  }
}
```

---

## 4. P1: 增强的桌面控制模块

### 4.1 NutJS 跨平台控制

**来源**: UI-TARS `/packages/ui-tars/operators/nut-js/src/index.ts`

```typescript
// packages/core/src/execution/desktop-control.ts

import {
  mouse,
  keyboard,
  screen,
  clipboard,
  Button,
  Key,
  Point,
  straightTo
} from '@nut-tree/nut-js';

export interface DesktopAction {
  type: 'click' | 'double_click' | 'right_click' | 'type' | 'hotkey' | 'scroll' | 'drag';
  x?: number;  // 归一化坐标
  y?: number;
  text?: string;
  keys?: string[];
  direction?: 'up' | 'down';
  amount?: number;
  endX?: number;
  endY?: number;
}

export class DesktopController {
  private screenWidth: number = 1920;
  private screenHeight: number = 1080;

  async initialize(): Promise<void> {
    const screenSize = await screen.width();
    this.screenWidth = screenSize;
    this.screenHeight = await screen.height();

    // 配置 nut-js
    mouse.config.autoDelayMs = 100;
    mouse.config.mouseSpeed = 1000;
  }

  async execute(action: DesktopAction): Promise<void> {
    const pixelX = action.x !== undefined ? Math.round(action.x * this.screenWidth) : undefined;
    const pixelY = action.y !== undefined ? Math.round(action.y * this.screenHeight) : undefined;

    switch (action.type) {
      case 'click':
        if (pixelX !== undefined && pixelY !== undefined) {
          await mouse.move(straightTo(new Point(pixelX, pixelY)));
        }
        await mouse.click(Button.LEFT);
        break;

      case 'double_click':
        if (pixelX !== undefined && pixelY !== undefined) {
          await mouse.move(straightTo(new Point(pixelX, pixelY)));
        }
        await mouse.doubleClick(Button.LEFT);
        break;

      case 'right_click':
        if (pixelX !== undefined && pixelY !== undefined) {
          await mouse.move(straightTo(new Point(pixelX, pixelY)));
        }
        await mouse.click(Button.RIGHT);
        break;

      case 'type':
        if (action.text) {
          await this.typeText(action.text);
        }
        break;

      case 'hotkey':
        if (action.keys && action.keys.length > 0) {
          await this.pressHotkey(action.keys);
        }
        break;

      case 'scroll':
        await this.scroll(action.direction || 'down', action.amount || 3);
        break;

      case 'drag':
        if (pixelX !== undefined && pixelY !== undefined &&
            action.endX !== undefined && action.endY !== undefined) {
          const endPixelX = Math.round(action.endX * this.screenWidth);
          const endPixelY = Math.round(action.endY * this.screenHeight);
          await this.drag(pixelX, pixelY, endPixelX, endPixelY);
        }
        break;
    }
  }

  // 智能输入 - Windows 使用剪贴板 (来自 UI-TARS)
  private async typeText(text: string): Promise<void> {
    if (process.platform === 'win32') {
      // Windows: 使用剪贴板避免输入法问题
      await clipboard.setContent(text);
      await keyboard.pressKey(Key.LeftControl, Key.V);
      await keyboard.releaseKey(Key.V, Key.LeftControl);
    } else {
      // macOS/Linux: 直接输入
      await keyboard.type(text);
    }
  }

  // 热键处理
  private async pressHotkey(keys: string[]): Promise<void> {
    const keyMap: Record<string, Key> = {
      'ctrl': process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl,
      'cmd': Key.LeftCmd,
      'alt': Key.LeftAlt,
      'shift': Key.LeftShift,
      'enter': Key.Enter,
      'tab': Key.Tab,
      'escape': Key.Escape,
      'backspace': Key.Backspace,
      'delete': Key.Delete,
      'up': Key.Up,
      'down': Key.Down,
      'left': Key.Left,
      'right': Key.Right,
      // ... 更多按键映射
    };

    const nutKeys = keys.map(k => keyMap[k.toLowerCase()] || Key[k as keyof typeof Key]);

    // 按下所有修饰键
    for (const key of nutKeys.slice(0, -1)) {
      await keyboard.pressKey(key);
    }

    // 按下并释放最后一个键
    await keyboard.pressKey(nutKeys[nutKeys.length - 1]);
    await keyboard.releaseKey(nutKeys[nutKeys.length - 1]);

    // 释放所有修饰键
    for (const key of nutKeys.slice(0, -1).reverse()) {
      await keyboard.releaseKey(key);
    }
  }

  // 平滑移动 (来自 Open Interpreter)
  private async smoothMove(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number = 500
  ): Promise<void> {
    const steps = Math.ceil(duration / 16);  // ~60fps

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // easeInOutSine 缓动
      const eased = (1 - Math.cos(t * Math.PI)) / 2;

      const x = Math.round(startX + (endX - startX) * eased);
      const y = Math.round(startY + (endY - startY) * eased);

      await mouse.setPosition(new Point(x, y));
      await new Promise(r => setTimeout(r, 16));
    }
  }

  private async scroll(direction: 'up' | 'down', amount: number): Promise<void> {
    const scrollAmount = direction === 'up' ? -amount : amount;
    await mouse.scrollDown(scrollAmount);
  }

  private async drag(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<void> {
    await mouse.move(straightTo(new Point(startX, startY)));
    await mouse.pressButton(Button.LEFT);
    await this.smoothMove(startX, startY, endX, endY, 300);
    await mouse.releaseButton(Button.LEFT);
  }
}
```

### 4.2 Windows UI Automation 集成

**来源**: UFO `/ufo/automator/ui_control/controller.py`

对于 Windows 平台，可以通过 native addon 调用 UI Automation API：

```typescript
// packages/core/src/execution/windows-automation.ts (概念设计)

export interface UIElement {
  name: string;
  automationId: string;
  className: string;
  controlType: string;
  boundingRect: { x: number; y: number; width: number; height: number };
  isEnabled: boolean;
  isKeyboardFocusable: boolean;
}

export interface WindowsAutomation {
  // 获取焦点窗口
  getActiveWindow(): Promise<UIElement>;

  // 查找元素
  findElement(criteria: {
    name?: string;
    automationId?: string;
    className?: string;
    controlType?: string;
  }): Promise<UIElement | null>;

  // 获取所有子元素
  getChildren(element: UIElement): Promise<UIElement[]>;

  // 元素操作
  click(element: UIElement): Promise<void>;
  type(element: UIElement, text: string): Promise<void>;
  setValue(element: UIElement, value: string): Promise<void>;

  // 特殊操作 - Office COM
  invokeOfficeCommand(appName: string, command: string): Promise<void>;
}

// 实现需要通过 N-API 调用 Windows COM API
// 参考: node-ui-automation 或 robotjs-windows
```

---

## 5. P1: RAG 记忆系统

### 5.1 短期记忆 (滑动窗口)

**来源**: Cradle `/cradle/memory/local_memory.py`

```typescript
// packages/core/src/memory/short-term-memory.ts

export interface MemoryEntry {
  id: string;
  timestamp: number;
  screenshot?: string;  // base64
  action: string;
  actionResult: 'success' | 'failure' | 'unknown';
  reasoning: string;
  taskDescription: string;
  screenDescription?: string;
}

export class ShortTermMemory {
  private maxSize: number;
  private memory: Map<string, MemoryEntry[]> = new Map();

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }

  add(bucket: string, entry: MemoryEntry): void {
    if (!this.memory.has(bucket)) {
      this.memory.set(bucket, []);
    }

    const bucketMemory = this.memory.get(bucket)!;
    bucketMemory.push(entry);

    // 滑动窗口裁剪
    while (bucketMemory.length > this.maxSize) {
      bucketMemory.shift();
    }
  }

  getRecent(bucket: string, k: number = 1): MemoryEntry[] {
    const bucketMemory = this.memory.get(bucket) || [];
    return bucketMemory.slice(-k);
  }

  getAll(bucket: string): MemoryEntry[] {
    return this.memory.get(bucket) || [];
  }

  // 格式化为 prompt
  formatForPrompt(bucket: string, k: number = 5): string {
    const entries = this.getRecent(bucket, k);

    return entries.map((e, i) => `
Step ${i + 1}:
- Action: ${e.action}
- Result: ${e.actionResult}
- Reasoning: ${e.reasoning}
`).join('\n');
  }
}
```

### 5.2 长期向量记忆

**来源**: Cradle `/cradle/memory/basic_vector_memory.py`, Agent-S

```typescript
// packages/core/src/memory/vector-memory.ts

import { ChromaClient } from 'chromadb';

export interface VectorMemoryEntry {
  id: string;
  task: string;
  solution: string;
  steps: string[];
  outcome: 'success' | 'failure';
  embedding?: number[];
  metadata: Record<string, any>;
}

export class VectorMemory {
  private client: ChromaClient;
  private collection: any;
  private embeddingProvider: EmbeddingProvider;

  constructor(embeddingProvider: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider;
    this.client = new ChromaClient();
  }

  async initialize(): Promise<void> {
    this.collection = await this.client.getOrCreateCollection({
      name: 'hawkeye_memory',
      metadata: { 'hnsw:space': 'cosine' },
    });
  }

  async add(entry: VectorMemoryEntry): Promise<void> {
    const embedding = await this.embeddingProvider.embed(entry.task + ' ' + entry.solution);

    await this.collection.add({
      ids: [entry.id],
      embeddings: [embedding],
      documents: [JSON.stringify(entry)],
      metadatas: [entry.metadata],
    });
  }

  async search(query: string, topK: number = 5): Promise<VectorMemoryEntry[]> {
    const queryEmbedding = await this.embeddingProvider.embed(query);

    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
    });

    return results.documents[0].map((doc: string) => JSON.parse(doc));
  }

  // RAG 检索增强
  async augmentPrompt(task: string, basePrompt: string): Promise<string> {
    const relevantMemories = await this.search(task, 3);

    if (relevantMemories.length === 0) {
      return basePrompt;
    }

    const memoryContext = relevantMemories.map(m => `
Previous similar task: ${m.task}
Solution: ${m.solution}
Steps taken: ${m.steps.join(' -> ')}
Outcome: ${m.outcome}
`).join('\n---\n');

    return `
${basePrompt}

## Relevant Past Experiences
${memoryContext}

Use these experiences to inform your approach, but adapt as needed for the current situation.
`;
  }
}
```

### 5.3 双重记忆系统

**来源**: Agent-S `/gui_agents/s2/memory/knowledge_base.py`

```typescript
// packages/core/src/memory/dual-memory.ts

export class DualMemorySystem {
  private episodicMemory: VectorMemory;    // 具体任务经验
  private semanticMemory: VectorMemory;    // 通用知识

  constructor(embeddingProvider: EmbeddingProvider) {
    this.episodicMemory = new VectorMemory(embeddingProvider);
    this.semanticMemory = new VectorMemory(embeddingProvider);
  }

  // 存储任务执行经验
  async storeExperience(
    task: string,
    trajectory: { action: string; observation: string }[],
    success: boolean
  ): Promise<void> {
    await this.episodicMemory.add({
      id: `exp_${Date.now()}`,
      task,
      solution: this.summarizeTrajectory(trajectory),
      steps: trajectory.map(t => t.action),
      outcome: success ? 'success' : 'failure',
      metadata: { type: 'experience', timestamp: Date.now() },
    });
  }

  // 存储通用知识
  async storeKnowledge(
    topic: string,
    knowledge: string,
    source: string
  ): Promise<void> {
    await this.semanticMemory.add({
      id: `know_${Date.now()}`,
      task: topic,
      solution: knowledge,
      steps: [],
      outcome: 'success',
      metadata: { type: 'knowledge', source },
    });
  }

  // 综合检索
  async retrieve(
    query: string,
    options: { episodic?: boolean; semantic?: boolean } = { episodic: true, semantic: true }
  ): Promise<{ episodic: VectorMemoryEntry[]; semantic: VectorMemoryEntry[] }> {
    const results = {
      episodic: [] as VectorMemoryEntry[],
      semantic: [] as VectorMemoryEntry[],
    };

    if (options.episodic) {
      results.episodic = await this.episodicMemory.search(query, 3);
    }
    if (options.semantic) {
      results.semantic = await this.semanticMemory.search(query, 3);
    }

    return results;
  }

  private summarizeTrajectory(trajectory: { action: string; observation: string }[]): string {
    return trajectory.map(t => `${t.action} -> ${t.observation}`).join('; ');
  }
}
```

---

## 6. P2: 自反思与错误恢复

### 6.1 自反思模块

**来源**: Cradle `/cradle/provider/module/self_reflection.py`

```typescript
// packages/core/src/ai/self-reflection.ts

export interface ReflectionInput {
  task: string;
  lastAction: string;
  actionCode?: string;
  errorReport?: string;
  beforeScreenshot: Buffer;
  afterScreenshot: Buffer;
  previousReasoning: string;
}

export interface ReflectionResult {
  wasSuccessful: boolean;
  reasoning: string;
  failureCause?: 'wrong_reasoning' | 'action_unavailable' | 'blocked' | 'error' | 'other';
  suggestedAdjustment?: string;
}

export class SelfReflection {
  private llm: VisionLLM;

  constructor(llm: VisionLLM) {
    this.llm = llm;
  }

  async reflect(input: ReflectionInput): Promise<ReflectionResult> {
    const prompt = `
You are analyzing whether the last action was successful.

## Current Task
${input.task}

## Last Action
${input.lastAction}

## Action Implementation
${input.actionCode || 'N/A'}

## Error Report
${input.errorReport || 'None'}

## Previous Reasoning
${input.previousReasoning}

## Screenshots
[Before Action] [After Action]

Please answer:
1. What was the last executed action?
2. Was it successful? Compare the screenshots:
   - For movement: Did the position/view change?
   - For interaction: Did the UI state change?
   - For typing: Did the text appear?
3. If not successful, what's the most probable cause?
   - The reasoning was wrong
   - The action was unavailable at current location
   - Movement was blocked by obstacles
   - There was a technical error

Respond in JSON format:
{
  "wasSuccessful": boolean,
  "reasoning": "detailed analysis...",
  "failureCause": "wrong_reasoning" | "action_unavailable" | "blocked" | "error" | null,
  "suggestedAdjustment": "what to try next..." | null
}
`;

    const response = await this.llm.chat([
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image', image_url: { url: `data:image/png;base64,${input.beforeScreenshot.toString('base64')}` } },
          { type: 'image', image_url: { url: `data:image/png;base64,${input.afterScreenshot.toString('base64')}` } },
        ],
      },
    ]);

    return JSON.parse(this.extractJSON(response));
  }

  private extractJSON(text: string): string {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : '{}';
  }
}
```

### 6.2 错误恢复策略

**来源**: OS-Copilot `/oscopilot/agents/friday_agent.py`

```typescript
// packages/core/src/execution/error-recovery.ts

export type RecoveryStrategy = 'amend' | 'replan' | 'retry' | 'skip' | 'abort';

export interface ErrorContext {
  action: string;
  error: Error;
  attemptCount: number;
  reflectionResult?: ReflectionResult;
}

export class ErrorRecovery {
  private maxRetries: number = 3;
  private llm: BaseLLM;

  constructor(llm: BaseLLM) {
    this.llm = llm;
  }

  async determineStrategy(context: ErrorContext): Promise<{
    strategy: RecoveryStrategy;
    amendment?: string;
    newPlan?: string[];
  }> {
    // 简单重试
    if (context.attemptCount < this.maxRetries && this.isTransientError(context.error)) {
      return { strategy: 'retry' };
    }

    // 基于反思结果决定
    if (context.reflectionResult) {
      switch (context.reflectionResult.failureCause) {
        case 'wrong_reasoning':
          // 需要重新规划
          const newPlan = await this.generateNewPlan(context);
          return { strategy: 'replan', newPlan };

        case 'action_unavailable':
          // 尝试修正动作
          const amendment = await this.generateAmendment(context);
          return { strategy: 'amend', amendment };

        case 'blocked':
          // 生成绕行方案
          const bypass = await this.generateBypass(context);
          return { strategy: 'amend', amendment: bypass };

        case 'error':
          // 技术错误，尝试修复代码
          const fixedCode = await this.fixCode(context);
          return { strategy: 'amend', amendment: fixedCode };
      }
    }

    // 默认：跳过并继续
    return { strategy: 'skip' };
  }

  private isTransientError(error: Error): boolean {
    const transientPatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /ECONNRESET/,
      /rate limit/i,
    ];
    return transientPatterns.some(p => p.test(error.message));
  }

  private async generateNewPlan(context: ErrorContext): Promise<string[]> {
    const prompt = `
The action "${context.action}" failed because the reasoning was wrong.
Error: ${context.error.message}

Generate a new plan to achieve the same goal with different approach.
Return as JSON array of steps.
`;
    const response = await this.llm.chat([{ role: 'user', content: prompt }]);
    return JSON.parse(response);
  }

  private async generateAmendment(context: ErrorContext): Promise<string> {
    const prompt = `
The action "${context.action}" was unavailable.
Error: ${context.error.message}

Suggest an alternative action that could achieve the same result.
`;
    return await this.llm.chat([{ role: 'user', content: prompt }]);
  }

  private async generateBypass(context: ErrorContext): Promise<string> {
    const prompt = `
Movement was blocked while trying: "${context.action}"

Suggest a bypass action (e.g., turn slightly and move forward).
`;
    return await this.llm.chat([{ role: 'user', content: prompt }]);
  }

  private async fixCode(context: ErrorContext): Promise<string> {
    const prompt = `
The following action failed with error:
Action: ${context.action}
Error: ${context.error.message}

Fix the action to avoid this error.
`;
    return await this.llm.chat([{ role: 'user', content: prompt }]);
  }
}
```

---

## 7. P2: 技能/工具学习系统

### 7.1 技能注册与检索

**来源**: Cradle `/cradle/environment/skill_registry.py`, OS-Copilot

```typescript
// packages/core/src/skills/skill-registry.ts

export interface Skill {
  name: string;
  description: string;
  parameters: {
    name: string;
    type: string;
    description: string;
    required: boolean;
  }[];
  code: string;
  embedding?: number[];
  usageCount: number;
  successRate: number;
}

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private embeddingProvider: EmbeddingProvider;
  private storePath: string;

  constructor(embeddingProvider: EmbeddingProvider, storePath: string) {
    this.embeddingProvider = embeddingProvider;
    this.storePath = storePath;
  }

  async register(skill: Omit<Skill, 'embedding' | 'usageCount' | 'successRate'>): Promise<void> {
    const embedding = await this.embeddingProvider.embed(
      `${skill.name}: ${skill.description}`
    );

    this.skills.set(skill.name, {
      ...skill,
      embedding,
      usageCount: 0,
      successRate: 0,
    });

    await this.save();
  }

  async retrieve(taskQuery: string, topK: number = 5): Promise<Skill[]> {
    const queryEmbedding = await this.embeddingProvider.embed(taskQuery);

    const scored = Array.from(this.skills.values())
      .map(skill => ({
        skill,
        score: this.cosineSimilarity(queryEmbedding, skill.embedding!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map(s => s.skill);
  }

  // 更新技能统计
  updateStats(skillName: string, success: boolean): void {
    const skill = this.skills.get(skillName);
    if (skill) {
      skill.usageCount++;
      // 移动平均计算成功率
      skill.successRate = (skill.successRate * (skill.usageCount - 1) + (success ? 1 : 0)) / skill.usageCount;
    }
  }

  // 格式化为 prompt
  formatForPrompt(skills: Skill[]): string {
    return skills.map(s => `
### ${s.name}
${s.description}

Parameters:
${s.parameters.map(p => `- ${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description}`).join('\n')}

Usage: ${s.usageCount} times, Success rate: ${(s.successRate * 100).toFixed(1)}%
`).join('\n');
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private async save(): Promise<void> {
    const data = Array.from(this.skills.entries());
    await fs.writeFile(this.storePath, JSON.stringify(data, null, 2));
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.storePath, 'utf-8');
      const entries = JSON.parse(data);
      this.skills = new Map(entries);
    } catch {
      // 文件不存在，使用空注册表
    }
  }
}
```

### 7.2 自动工具学习

**来源**: OS-Copilot `/oscopilot/tool_repository/manager/tool_manager.py`

```typescript
// packages/core/src/skills/tool-learning.ts

export class ToolLearning {
  private skillRegistry: SkillRegistry;
  private llm: BaseLLM;
  private scoreThreshold: number = 0.8;

  constructor(skillRegistry: SkillRegistry, llm: BaseLLM) {
    this.skillRegistry = skillRegistry;
    this.llm = llm;
  }

  // 从成功执行中学习新工具
  async learnFromExecution(
    task: string,
    code: string,
    executionResult: { success: boolean; output: string },
    score: number
  ): Promise<void> {
    // 只学习高分执行
    if (!executionResult.success || score < this.scoreThreshold) {
      return;
    }

    // 检查是否已存在类似工具
    const existingSkills = await this.skillRegistry.retrieve(task, 3);
    for (const skill of existingSkills) {
      if (this.isSimilarCode(skill.code, code)) {
        return;  // 已存在类似工具
      }
    }

    // 生成工具描述
    const description = await this.generateDescription(task, code);
    const parameters = await this.extractParameters(code);
    const toolName = await this.generateName(task);

    await this.skillRegistry.register({
      name: toolName,
      description,
      parameters,
      code,
    });

    console.log(`Learned new tool: ${toolName}`);
  }

  private async generateDescription(task: string, code: string): Promise<string> {
    const prompt = `
Given this task and code, generate a concise description of what this tool does:

Task: ${task}
Code:
\`\`\`
${code}
\`\`\`

Description (1-2 sentences):
`;
    return await this.llm.chat([{ role: 'user', content: prompt }]);
  }

  private async extractParameters(code: string): Promise<Skill['parameters']> {
    const prompt = `
Extract the parameters from this code and describe them:

\`\`\`
${code}
\`\`\`

Return as JSON array:
[{"name": "param1", "type": "string", "description": "...", "required": true}]
`;
    const response = await this.llm.chat([{ role: 'user', content: prompt }]);
    return JSON.parse(response);
  }

  private async generateName(task: string): Promise<string> {
    const prompt = `
Generate a concise function name for this task: "${task}"
Use snake_case, max 3 words. Return only the name.
`;
    return (await this.llm.chat([{ role: 'user', content: prompt }])).trim();
  }

  private isSimilarCode(code1: string, code2: string): boolean {
    // 简单的相似度检查
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const n1 = normalize(code1);
    const n2 = normalize(code2);

    // Jaccard 相似度
    const words1 = new Set(n1.split(' '));
    const words2 = new Set(n2.split(' '));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size > 0.7;
  }
}
```

---

## 8. P3: Vision-Language-Action 模型集成

### 8.1 ShowUI 轻量级部署

**来源**: ShowUI `/showui.py`

```typescript
// packages/core/src/ai/showui-client.ts

export interface ShowUIAction {
  type: 'click' | 'type' | 'scroll' | 'drag';
  coordinates?: { x: number; y: number };  // 归一化
  text?: string;
  direction?: 'up' | 'down';
}

export class ShowUIClient {
  private modelEndpoint: string;

  constructor(endpoint: string = 'http://localhost:8080') {
    this.modelEndpoint = endpoint;
  }

  async predict(
    screenshot: Buffer,
    instruction: string,
    history?: { action: string; screenshot: string }[]
  ): Promise<ShowUIAction> {
    const response = await fetch(`${this.modelEndpoint}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: screenshot.toString('base64'),
        instruction,
        history: history?.map(h => ({
          action: h.action,
          image: h.screenshot,
        })),
      }),
    });

    const result = await response.json();
    return this.parseAction(result.action);
  }

  private parseAction(actionStr: string): ShowUIAction {
    // ShowUI 输出格式: "click(0.5, 0.3)" 或 "type(hello world)"
    const clickMatch = actionStr.match(/click\(([\d.]+),\s*([\d.]+)\)/);
    if (clickMatch) {
      return {
        type: 'click',
        coordinates: {
          x: parseFloat(clickMatch[1]),
          y: parseFloat(clickMatch[2]),
        },
      };
    }

    const typeMatch = actionStr.match(/type\((.+)\)/);
    if (typeMatch) {
      return {
        type: 'type',
        text: typeMatch[1],
      };
    }

    const scrollMatch = actionStr.match(/scroll\((up|down)\)/);
    if (scrollMatch) {
      return {
        type: 'scroll',
        direction: scrollMatch[1] as 'up' | 'down',
      };
    }

    throw new Error(`Unknown action format: ${actionStr}`);
  }
}
```

### 8.2 UI-TARS 端到端集成

**来源**: UI-TARS `/packages/ui-tars/sdk/src/index.ts`

```typescript
// packages/core/src/ai/ui-tars-client.ts

export interface UITARSConfig {
  model: string;  // 'ui-tars-7b' | 'ui-tars-72b'
  endpoint?: string;
  maxHistory?: number;
}

export interface UITARSPrediction {
  thought: string;
  action: {
    type: string;
    parameters: Record<string, any>;
  };
  confidence: number;
}

export class UITARSClient {
  private config: UITARSConfig;
  private conversationHistory: {
    role: 'user' | 'assistant';
    content: { text?: string; image?: string }[];
  }[] = [];

  constructor(config: UITARSConfig) {
    this.config = {
      maxHistory: 5,
      ...config,
    };
  }

  async predict(
    screenshot: Buffer,
    instruction: string
  ): Promise<UITARSPrediction> {
    // 构建对话
    this.conversationHistory.push({
      role: 'user',
      content: [
        { text: instruction },
        { image: screenshot.toString('base64') },
      ],
    });

    // 裁剪历史
    while (this.conversationHistory.length > this.config.maxHistory! * 2) {
      this.conversationHistory.shift();
    }

    const response = await fetch(this.config.endpoint || 'http://localhost:8000/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: this.conversationHistory,
        temperature: 0.1,
      }),
    });

    const result = await response.json();
    const prediction = this.parseResponse(result.choices[0].message.content);

    // 记录 assistant 响应
    this.conversationHistory.push({
      role: 'assistant',
      content: [{ text: result.choices[0].message.content }],
    });

    return prediction;
  }

  private parseResponse(response: string): UITARSPrediction {
    // UI-TARS 输出格式:
    // Thought: ...
    // Action: click(start_box='(0.5, 0.3)')

    const thoughtMatch = response.match(/Thought:\s*(.+?)(?=Action:|$)/s);
    const actionMatch = response.match(/Action:\s*(.+)/);

    if (!actionMatch) {
      throw new Error('Failed to parse UI-TARS response');
    }

    const actionStr = actionMatch[1].trim();
    const action = this.parseAction(actionStr);

    return {
      thought: thoughtMatch?.[1]?.trim() || '',
      action,
      confidence: 1.0,  // UI-TARS 不直接输出置信度
    };
  }

  private parseAction(actionStr: string): UITARSPrediction['action'] {
    // 解析动作字符串
    const match = actionStr.match(/(\w+)\((.+)\)/);
    if (!match) {
      return { type: 'unknown', parameters: { raw: actionStr } };
    }

    const [, actionType, paramsStr] = match;
    const parameters: Record<string, any> = {};

    // 解析参数
    const paramMatches = paramsStr.matchAll(/(\w+)='([^']+)'/g);
    for (const [, key, value] of paramMatches) {
      if (key.includes('box') || key.includes('point')) {
        // 解析坐标
        const coords = value.match(/\(([\d.]+),\s*([\d.]+)\)/);
        if (coords) {
          parameters[key] = {
            x: parseFloat(coords[1]),
            y: parseFloat(coords[2]),
          };
        }
      } else {
        parameters[key] = value;
      }
    }

    return { type: actionType, parameters };
  }

  reset(): void {
    this.conversationHistory = [];
  }
}
```

---

## 9. 具体实现代码

### 9.1 完整的 Hawkeye 增强主循环

```typescript
// packages/core/src/hawkeye-enhanced.ts

import { EventEmitter } from 'events';

export interface HawkeyeConfig {
  aiProvider: UnifiedProviderConfig;
  enableReflection: boolean;
  enableMemory: boolean;
  enableSkillLearning: boolean;
  maxTurns: number;
}

export class HawkeyeEnhanced extends EventEmitter {
  private config: HawkeyeConfig;

  // 核心模块
  private aiProvider: UnifiedAIProvider;
  private screenCapture: EnhancedScreenCapture;
  private desktopController: DesktopController;
  private omniParser: OmniParserClient;

  // 增强模块
  private shortTermMemory: ShortTermMemory;
  private vectorMemory: VectorMemory;
  private skillRegistry: SkillRegistry;
  private selfReflection: SelfReflection;
  private errorRecovery: ErrorRecovery;
  private toolLearning: ToolLearning;

  constructor(config: HawkeyeConfig) {
    super();
    this.config = config;
    this.initializeModules();
  }

  private async initializeModules(): Promise<void> {
    // 初始化 AI Provider
    this.aiProvider = new UnifiedAIProvider();
    await this.aiProvider.setModel(this.config.aiProvider.model);

    // 初始化感知模块
    this.screenCapture = new EnhancedScreenCapture();
    this.omniParser = new OmniParserClient();

    // 初始化执行模块
    this.desktopController = new DesktopController();
    await this.desktopController.initialize();

    // 初始化记忆模块
    this.shortTermMemory = new ShortTermMemory(10);
    if (this.config.enableMemory) {
      this.vectorMemory = new VectorMemory(/* embedding provider */);
      await this.vectorMemory.initialize();
    }

    // 初始化技能模块
    this.skillRegistry = new SkillRegistry(/* embedding provider */, './skills.json');
    await this.skillRegistry.load();

    // 初始化反思模块
    if (this.config.enableReflection) {
      this.selfReflection = new SelfReflection(this.aiProvider);
      this.errorRecovery = new ErrorRecovery(this.aiProvider);
    }

    // 初始化工具学习
    if (this.config.enableSkillLearning) {
      this.toolLearning = new ToolLearning(this.skillRegistry, this.aiProvider);
    }
  }

  async run(task: string): Promise<void> {
    let turn = 0;
    let lastScreenshot: Buffer | null = null;
    let lastAction: string | null = null;

    this.emit('task:start', { task });

    while (turn < this.config.maxTurns) {
      try {
        // 1. 截图
        const screenshot = await this.screenCapture.capture();
        this.emit('turn:screenshot', { turn, screenshot });

        // 2. 自反思 (如果不是第一轮)
        if (this.config.enableReflection && turn > 0 && lastScreenshot && lastAction) {
          const reflection = await this.selfReflection.reflect({
            task,
            lastAction,
            beforeScreenshot: lastScreenshot,
            afterScreenshot: screenshot,
            previousReasoning: this.shortTermMemory.getRecent('reasoning', 1)[0]?.reasoning || '',
          });

          this.emit('turn:reflection', { turn, reflection });

          if (!reflection.wasSuccessful) {
            // 错误恢复
            const recovery = await this.errorRecovery.determineStrategy({
              action: lastAction,
              error: new Error(reflection.reasoning),
              attemptCount: 1,
              reflectionResult: reflection,
            });

            if (recovery.strategy === 'abort') {
              this.emit('task:abort', { turn, reason: reflection.reasoning });
              return;
            }

            // 应用恢复策略...
          }
        }

        // 3. UI 元素检测
        const uiElements = await this.omniParser.parse(screenshot.toString('base64'));
        this.emit('turn:perception', { turn, elements: uiElements.elements.length });

        // 4. 检索相关技能和记忆
        const relevantSkills = await this.skillRegistry.retrieve(task, 5);
        let memoryContext = '';
        if (this.config.enableMemory) {
          const memories = await this.vectorMemory.search(task, 3);
          memoryContext = memories.map(m => m.solution).join('\n');
        }

        // 5. 生成行动计划
        const prompt = this.buildActionPrompt(
          task,
          uiElements,
          relevantSkills,
          memoryContext,
          this.shortTermMemory.formatForPrompt('actions', 5)
        );

        const actionResponse = await this.aiProvider.chat([
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ]);

        const action = this.parseAction(actionResponse);
        this.emit('turn:action', { turn, action });

        // 6. 执行动作
        await this.desktopController.execute(action);

        // 7. 记录到短期记忆
        this.shortTermMemory.add('actions', {
          id: `turn_${turn}`,
          timestamp: Date.now(),
          action: JSON.stringify(action),
          actionResult: 'unknown',
          reasoning: actionResponse,
          taskDescription: task,
        });

        // 8. 工具学习
        if (this.config.enableSkillLearning) {
          // 在下一轮根据反思结果决定是否学习
        }

        lastScreenshot = screenshot;
        lastAction = JSON.stringify(action);
        turn++;

        // 检查任务完成
        if (await this.isTaskComplete(task, screenshot)) {
          this.emit('task:complete', { turn });

          // 存储成功经验
          if (this.config.enableMemory) {
            await this.vectorMemory.add({
              id: `task_${Date.now()}`,
              task,
              solution: this.shortTermMemory.formatForPrompt('actions'),
              steps: this.shortTermMemory.getAll('actions').map(a => a.action),
              outcome: 'success',
              metadata: { turns: turn },
            });
          }

          return;
        }

      } catch (error) {
        this.emit('turn:error', { turn, error });

        // 错误恢复
        if (this.config.enableReflection) {
          const recovery = await this.errorRecovery.determineStrategy({
            action: lastAction || 'unknown',
            error: error as Error,
            attemptCount: 1,
          });

          if (recovery.strategy === 'abort') {
            throw error;
          }
          // 应用恢复策略...
        }
      }
    }

    this.emit('task:timeout', { maxTurns: this.config.maxTurns });
  }

  private buildActionPrompt(
    task: string,
    uiElements: OmniParserResult,
    skills: Skill[],
    memoryContext: string,
    recentActions: string
  ): string {
    return `
## Task
${task}

## Detected UI Elements
${uiElements.elements.map(e => `[${e.id}] ${e.content} at (${e.bbox.join(', ')})`).join('\n')}

## Available Skills
${this.skillRegistry.formatForPrompt(skills)}

## Past Experiences
${memoryContext || 'No relevant past experiences.'}

## Recent Actions
${recentActions || 'This is the first action.'}

## Instructions
Based on the current screen state and available skills, determine the next action to progress toward completing the task.

Respond with a JSON object:
{
  "reasoning": "your thought process...",
  "action": {
    "type": "click" | "type" | "hotkey" | "scroll",
    "x": 0.5,  // normalized coordinate
    "y": 0.3,
    "text": "...",  // for type action
    "keys": ["ctrl", "s"]  // for hotkey action
  }
}
`;
  }

  private getSystemPrompt(): string {
    return `You are Hawkeye, an AI desktop automation agent. You can see the screen, understand UI elements, and execute actions to complete tasks.

Rules:
1. Always use normalized coordinates (0-1) for positions
2. Be precise with click targets - use the center of detected elements
3. When typing, first click on the input field
4. For complex operations, break them into simple steps
5. Learn from past experiences and adapt your approach
`;
  }

  private parseAction(response: string): DesktopAction {
    const json = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return json.action as DesktopAction;
  }

  private async isTaskComplete(task: string, screenshot: Buffer): Promise<boolean> {
    const prompt = `
Task: ${task}
[Current Screenshot]

Is this task complete? Answer with JSON: {"complete": true/false, "reason": "..."}
`;

    const response = await this.aiProvider.chat([
      { role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image', image_url: { url: `data:image/png;base64,${screenshot.toString('base64')}` } },
      ]},
    ]);

    const result = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{"complete": false}');
    return result.complete;
  }
}
```

---

## 总结

本文档基于对 9 个开源项目的深入分析，为 Hawkeye 提供了具体可落地的代码模式和功能建议。

**推荐实施顺序**:

1. **第一阶段 (P0)** - 基础能力增强
   - 统一 AI Provider 抽象层
   - 归一化坐标系统
   - OmniParser 集成

2. **第二阶段 (P1)** - 执行能力增强
   - NutJS 桌面控制
   - RAG 向量记忆系统

3. **第三阶段 (P2)** - 智能增强
   - 自反思与错误恢复
   - 技能/工具学习

4. **第四阶段 (P3)** - 端到端模型
   - ShowUI/UI-TARS 集成

每个模块都提供了完整的 TypeScript 代码示例，可直接用于 Hawkeye 项目的开发。
