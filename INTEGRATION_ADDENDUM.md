# Hawkeye Integration Addendum

深度探索补充文档 - 基于对 9 个项目源代码的进一步深入分析

---

## 目录

1. [Action Space 设计模式](#1-action-space-设计模式)
2. [UI Grounding 管道](#2-ui-grounding-管道)
3. [多模态融合引擎](#3-多模态融合引擎)
4. [Prompt 工程模板](#4-prompt-工程模板)
5. [状态管理模块](#5-状态管理模块)
6. [安全与沙箱系统](#6-安全与沙箱系统)
7. [实现路线图](#7-实现路线图)

---

## 1. Action Space 设计模式

**来源**: UI-TARS, Agent-S, UFO

### 1.1 完整的 GUI Action 类型系统

```typescript
// packages/core/src/execution/action-types.ts

// ============ 基础坐标类型 ============
export interface NormalizedPoint {
  x: number;  // 0-1 归一化
  y: number;
}

export interface NormalizedBBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ============ GUI Action 联合类型 ============

export interface ClickAction {
  type: 'click';
  position: NormalizedPoint;
  button?: 'left' | 'right' | 'middle';
}

export interface DoubleClickAction {
  type: 'double_click';
  position: NormalizedPoint;
}

export interface DragAction {
  type: 'drag';
  startPosition: NormalizedPoint;
  endPosition: NormalizedPoint;
  duration?: number;  // ms
}

export interface ScrollAction {
  type: 'scroll';
  position?: NormalizedPoint;  // 可选滚动位置
  direction: 'up' | 'down' | 'left' | 'right';
  amount: number;
}

export interface TypeAction {
  type: 'type';
  text: string;
  position?: NormalizedPoint;  // 可选先点击位置
}

export interface HotkeyAction {
  type: 'hotkey';
  keys: string[];  // ['ctrl', 'c'] 或 ['cmd', 'shift', 's']
}

export interface PressAction {
  type: 'press';
  key: string;
  hold?: number;  // 按住时长 ms
}

export interface ReleaseAction {
  type: 'release';
  key: string;
}

export interface OpenAppAction {
  type: 'open_app';
  appName: string;
}

export interface SwitchAppAction {
  type: 'switch_app';
  appName: string;
}

export interface WaitAction {
  type: 'wait';
  duration: number;  // ms
  condition?: string;  // 可选等待条件描述
}

export interface FinishedAction {
  type: 'finished';
  summary: string;
}

// 联合类型
export type GUIAction =
  | ClickAction
  | DoubleClickAction
  | DragAction
  | ScrollAction
  | TypeAction
  | HotkeyAction
  | PressAction
  | ReleaseAction
  | OpenAppAction
  | SwitchAppAction
  | WaitAction
  | FinishedAction;

// ============ 动作元数据 ============

export interface ActionMetadata {
  thought?: string;      // Agent 推理过程
  confidence?: number;   // 0-1 置信度
  targetElement?: string;  // 目标元素描述
  expectedOutcome?: string;  // 预期结果
}

export interface ActionWithMetadata {
  action: GUIAction;
  metadata: ActionMetadata;
  timestamp: number;
}
```

### 1.2 多格式 Action 解析器

```typescript
// packages/core/src/execution/action-parser.ts

import { GUIAction, NormalizedPoint, ActionWithMetadata, ActionMetadata } from './action-types';

// ============ 解析器接口 ============

interface ActionParser {
  name: string;
  canParse(input: string): boolean;
  parse(input: string): GUIAction | null;
}

// ============ UI-TARS 格式解析器 ============

class UITARSParser implements ActionParser {
  name = 'UI-TARS';

  canParse(input: string): boolean {
    return /Action:\s*\w+\(/.test(input);
  }

  parse(input: string): GUIAction | null {
    // 格式: click(start_box='(0.5, 0.3)')
    const match = input.match(/Action:\s*(\w+)\(([^)]*)\)/);
    if (!match) return null;

    const [, actionType, paramsStr] = match;
    const params = this.parseParams(paramsStr);

    switch (actionType.toLowerCase()) {
      case 'click':
        return {
          type: 'click',
          position: this.parseBox(params.start_box || params.point),
        };
      case 'type':
        return {
          type: 'type',
          text: params.content || params.text || '',
        };
      case 'scroll':
        return {
          type: 'scroll',
          direction: params.direction as any || 'down',
          amount: parseInt(params.amount) || 3,
        };
      case 'drag':
        return {
          type: 'drag',
          startPosition: this.parseBox(params.start_box),
          endPosition: this.parseBox(params.end_box),
        };
      case 'hotkey':
        return {
          type: 'hotkey',
          keys: (params.key || '').split('+').map((k: string) => k.trim().toLowerCase()),
        };
      case 'wait':
        return {
          type: 'wait',
          duration: parseInt(params.time) || 1000,
        };
      case 'finished':
        return {
          type: 'finished',
          summary: params.content || 'Task completed',
        };
      default:
        return null;
    }
  }

  private parseParams(str: string): Record<string, string> {
    const params: Record<string, string> = {};
    const regex = /(\w+)='([^']*)'/g;
    let match;
    while ((match = regex.exec(str)) !== null) {
      params[match[1]] = match[2];
    }
    return params;
  }

  private parseBox(boxStr: string): NormalizedPoint {
    if (!boxStr) return { x: 0.5, y: 0.5 };
    const match = boxStr.match(/\(([\d.]+),\s*([\d.]+)\)/);
    if (!match) return { x: 0.5, y: 0.5 };
    return {
      x: parseFloat(match[1]),
      y: parseFloat(match[2]),
    };
  }
}

// ============ JSON 格式解析器 ============

class JSONParser implements ActionParser {
  name = 'JSON';

  canParse(input: string): boolean {
    try {
      const obj = JSON.parse(input);
      return typeof obj === 'object' && obj.action;
    } catch {
      return input.includes('"action"') || input.includes('"type"');
    }
  }

  parse(input: string): GUIAction | null {
    try {
      // 提取 JSON 部分
      const jsonMatch = input.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const obj = JSON.parse(jsonMatch[0]);
      const action = obj.action || obj;

      // 验证并返回
      if (this.isValidAction(action)) {
        return action as GUIAction;
      }
      return null;
    } catch {
      return null;
    }
  }

  private isValidAction(obj: any): boolean {
    const validTypes = ['click', 'double_click', 'drag', 'scroll', 'type',
                        'hotkey', 'press', 'release', 'open_app', 'switch_app',
                        'wait', 'finished'];
    return obj && typeof obj.type === 'string' && validTypes.includes(obj.type);
  }
}

// ============ SOM (Set-of-Mark) 格式解析器 ============

class SOMParser implements ActionParser {
  name = 'SOM';
  private labelMap: Map<string, NormalizedPoint>;

  constructor(labelMap?: Map<string, NormalizedPoint>) {
    this.labelMap = labelMap || new Map();
  }

  setLabelMap(map: Map<string, NormalizedPoint>): void {
    this.labelMap = map;
  }

  canParse(input: string): boolean {
    // 匹配 ~1, ~2 等标签引用
    return /~\d+/.test(input);
  }

  parse(input: string): GUIAction | null {
    // 格式: "click on ~5" 或 "type 'hello' in ~3"
    const clickMatch = input.match(/click\s+(?:on\s+)?~(\d+)/i);
    if (clickMatch) {
      const label = `~${clickMatch[1]}`;
      const position = this.labelMap.get(label);
      if (position) {
        return { type: 'click', position };
      }
    }

    const typeMatch = input.match(/type\s+['"]([^'"]+)['"]\s+(?:in|into|at)\s+~(\d+)/i);
    if (typeMatch) {
      const label = `~${typeMatch[2]}`;
      const position = this.labelMap.get(label);
      if (position) {
        return { type: 'type', text: typeMatch[1], position };
      }
    }

    return null;
  }
}

// ============ 解析器链 ============

export class ActionParserChain {
  private parsers: ActionParser[] = [];

  constructor() {
    // 按优先级添加解析器
    this.parsers = [
      new JSONParser(),
      new UITARSParser(),
      new SOMParser(),
    ];
  }

  addParser(parser: ActionParser): void {
    this.parsers.push(parser);
  }

  setSOMLabels(labels: Map<string, NormalizedPoint>): void {
    const somParser = this.parsers.find(p => p.name === 'SOM') as SOMParser;
    if (somParser) {
      somParser.setLabelMap(labels);
    }
  }

  parse(input: string): ActionWithMetadata | null {
    // 提取思考过程
    const thoughtMatch = input.match(/Thought:\s*(.+?)(?=Action:|$)/s);
    const thought = thoughtMatch?.[1]?.trim();

    for (const parser of this.parsers) {
      if (parser.canParse(input)) {
        const action = parser.parse(input);
        if (action) {
          return {
            action,
            metadata: {
              thought,
              confidence: 1.0,
            },
            timestamp: Date.now(),
          };
        }
      }
    }

    return null;
  }
}
```

### 1.3 Action 执行器 (NutJS)

```typescript
// packages/core/src/execution/action-executor.ts

import {
  mouse,
  keyboard,
  screen,
  clipboard,
  Button,
  Key,
  Point,
  straightTo,
} from '@nut-tree-fork/nut-js';

import { GUIAction, ActionWithMetadata, NormalizedPoint } from './action-types';

export interface ExecutionResult {
  success: boolean;
  action: GUIAction;
  duration: number;
  error?: string;
  screenshot?: Buffer;
}

export class ActionExecutor {
  private screenWidth: number = 1920;
  private screenHeight: number = 1080;
  private actionDelay: number = 100;  // 动作间延迟

  async initialize(): Promise<void> {
    this.screenWidth = await screen.width();
    this.screenHeight = await screen.height();

    // 配置 nut-js
    mouse.config.autoDelayMs = 50;
    mouse.config.mouseSpeed = 1500;
    keyboard.config.autoDelayMs = 30;
  }

  async execute(actionWithMeta: ActionWithMetadata): Promise<ExecutionResult> {
    const { action } = actionWithMeta;
    const startTime = Date.now();

    try {
      switch (action.type) {
        case 'click':
          await this.executeClick(action);
          break;
        case 'double_click':
          await this.executeDoubleClick(action);
          break;
        case 'drag':
          await this.executeDrag(action);
          break;
        case 'scroll':
          await this.executeScroll(action);
          break;
        case 'type':
          await this.executeType(action);
          break;
        case 'hotkey':
          await this.executeHotkey(action);
          break;
        case 'press':
          await this.executePress(action);
          break;
        case 'release':
          await this.executeRelease(action);
          break;
        case 'open_app':
          await this.executeOpenApp(action);
          break;
        case 'switch_app':
          await this.executeSwitchApp(action);
          break;
        case 'wait':
          await this.executeWait(action);
          break;
        case 'finished':
          // 任务完成，无需执行
          break;
      }

      await this.delay(this.actionDelay);

      return {
        success: true,
        action,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        action,
        duration: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  private toPixel(point: NormalizedPoint): Point {
    return new Point(
      Math.round(point.x * this.screenWidth),
      Math.round(point.y * this.screenHeight)
    );
  }

  private async executeClick(action: { position: NormalizedPoint; button?: string }): Promise<void> {
    const point = this.toPixel(action.position);
    await mouse.move(straightTo(point));
    await mouse.click(this.getButton(action.button));
  }

  private async executeDoubleClick(action: { position: NormalizedPoint }): Promise<void> {
    const point = this.toPixel(action.position);
    await mouse.move(straightTo(point));
    await mouse.doubleClick(Button.LEFT);
  }

  private async executeDrag(action: { startPosition: NormalizedPoint; endPosition: NormalizedPoint; duration?: number }): Promise<void> {
    const start = this.toPixel(action.startPosition);
    const end = this.toPixel(action.endPosition);

    await mouse.move(straightTo(start));
    await mouse.pressButton(Button.LEFT);
    await this.smoothMove(start, end, action.duration || 300);
    await mouse.releaseButton(Button.LEFT);
  }

  private async executeScroll(action: { position?: NormalizedPoint; direction: string; amount: number }): Promise<void> {
    if (action.position) {
      const point = this.toPixel(action.position);
      await mouse.move(straightTo(point));
    }

    const scrollAmount = action.direction === 'up' || action.direction === 'left'
      ? -action.amount
      : action.amount;

    if (action.direction === 'up' || action.direction === 'down') {
      await mouse.scrollDown(scrollAmount);
    } else {
      await mouse.scrollRight(scrollAmount);
    }
  }

  private async executeType(action: { text: string; position?: NormalizedPoint }): Promise<void> {
    if (action.position) {
      await this.executeClick({ position: action.position });
      await this.delay(100);
    }

    // Windows: 使用剪贴板避免输入法问题
    if (process.platform === 'win32') {
      await clipboard.setContent(action.text);
      await keyboard.pressKey(Key.LeftControl, Key.V);
      await keyboard.releaseKey(Key.V, Key.LeftControl);
    } else {
      await keyboard.type(action.text);
    }
  }

  private async executeHotkey(action: { keys: string[] }): Promise<void> {
    const nutKeys = action.keys.map(k => this.mapKey(k));

    // 按下所有键
    for (const key of nutKeys) {
      await keyboard.pressKey(key);
    }

    // 释放所有键（逆序）
    for (const key of nutKeys.reverse()) {
      await keyboard.releaseKey(key);
    }
  }

  private async executePress(action: { key: string; hold?: number }): Promise<void> {
    const key = this.mapKey(action.key);
    await keyboard.pressKey(key);
    if (action.hold) {
      await this.delay(action.hold);
    }
  }

  private async executeRelease(action: { key: string }): Promise<void> {
    const key = this.mapKey(action.key);
    await keyboard.releaseKey(key);
  }

  private async executeOpenApp(action: { appName: string }): Promise<void> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    switch (process.platform) {
      case 'darwin':
        await execAsync(`open -a "${action.appName}"`);
        break;
      case 'win32':
        await execAsync(`start "" "${action.appName}"`);
        break;
      case 'linux':
        await execAsync(`xdg-open "${action.appName}" || ${action.appName}`);
        break;
    }
  }

  private async executeSwitchApp(action: { appName: string }): Promise<void> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    if (process.platform === 'darwin') {
      await execAsync(`osascript -e 'tell application "${action.appName}" to activate'`);
    } else if (process.platform === 'win32') {
      await execAsync(`powershell -Command "(New-Object -ComObject WScript.Shell).AppActivate('${action.appName}')"`);
    }
  }

  private async executeWait(action: { duration: number }): Promise<void> {
    await this.delay(action.duration);
  }

  private async smoothMove(start: Point, end: Point, duration: number): Promise<void> {
    const steps = Math.ceil(duration / 16);  // ~60fps

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // easeInOutSine
      const eased = (1 - Math.cos(t * Math.PI)) / 2;

      const x = Math.round(start.x + (end.x - start.x) * eased);
      const y = Math.round(start.y + (end.y - start.y) * eased);

      await mouse.setPosition(new Point(x, y));
      await this.delay(16);
    }
  }

  private getButton(button?: string): Button {
    switch (button) {
      case 'right': return Button.RIGHT;
      case 'middle': return Button.MIDDLE;
      default: return Button.LEFT;
    }
  }

  private mapKey(key: string): Key {
    const keyMap: Record<string, Key> = {
      'ctrl': process.platform === 'darwin' ? Key.LeftSuper : Key.LeftControl,
      'control': process.platform === 'darwin' ? Key.LeftSuper : Key.LeftControl,
      'cmd': Key.LeftSuper,
      'command': Key.LeftSuper,
      'alt': Key.LeftAlt,
      'option': Key.LeftAlt,
      'shift': Key.LeftShift,
      'enter': Key.Enter,
      'return': Key.Enter,
      'tab': Key.Tab,
      'escape': Key.Escape,
      'esc': Key.Escape,
      'backspace': Key.Backspace,
      'delete': Key.Delete,
      'space': Key.Space,
      'up': Key.Up,
      'down': Key.Down,
      'left': Key.Left,
      'right': Key.Right,
      'home': Key.Home,
      'end': Key.End,
      'pageup': Key.PageUp,
      'pagedown': Key.PageDown,
      // 功能键
      'f1': Key.F1, 'f2': Key.F2, 'f3': Key.F3, 'f4': Key.F4,
      'f5': Key.F5, 'f6': Key.F6, 'f7': Key.F7, 'f8': Key.F8,
      'f9': Key.F9, 'f10': Key.F10, 'f11': Key.F11, 'f12': Key.F12,
    };

    // 字母键
    if (key.length === 1 && /[a-zA-Z]/.test(key)) {
      return Key[key.toUpperCase() as keyof typeof Key] || Key.A;
    }

    return keyMap[key.toLowerCase()] || Key.Space;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 2. UI Grounding 管道

**来源**: OmniParser, ShowUI, SeeClick

### 2.1 NMS with OCR Priority

```typescript
// packages/core/src/perception/ui-grounding.ts

export interface UIElement {
  id: string;
  bbox: [number, number, number, number];  // [x1, y1, x2, y2] 归一化
  label: string;
  content: string;
  type: 'icon' | 'text' | 'button' | 'input' | 'link' | 'image' | 'unknown';
  confidence: number;
  source: 'yolo' | 'ocr' | 'merged';
}

export interface GroundingResult {
  elements: UIElement[];
  labeledImage?: Buffer;
  processingTime: number;
}

// ============ IoU 计算 ============

function calculateIoU(
  box1: [number, number, number, number],
  box2: [number, number, number, number]
): number {
  const [x1_1, y1_1, x2_1, y2_1] = box1;
  const [x1_2, y1_2, x2_2, y2_2] = box2;

  const xi1 = Math.max(x1_1, x1_2);
  const yi1 = Math.max(y1_1, y1_2);
  const xi2 = Math.min(x2_1, x2_2);
  const yi2 = Math.min(y2_1, y2_2);

  if (xi2 <= xi1 || yi2 <= yi1) {
    return 0;
  }

  const intersectionArea = (xi2 - xi1) * (yi2 - yi1);
  const box1Area = (x2_1 - x1_1) * (y2_1 - y1_1);
  const box2Area = (x2_2 - x1_2) * (y2_2 - y1_2);
  const unionArea = box1Area + box2Area - intersectionArea;

  return intersectionArea / unionArea;
}

// ============ OmniParser 风格 NMS with OCR Priority ============

export function removeOverlapWithOCRPriority(
  yoloBoxes: UIElement[],
  ocrBoxes: UIElement[],
  iouThreshold: number = 0.7
): UIElement[] {
  const result: UIElement[] = [];
  const usedOCR = new Set<number>();

  // OCR boxes have priority
  for (const ocrBox of ocrBoxes) {
    result.push({ ...ocrBox, source: 'ocr' });
  }

  // For each YOLO box, check overlap with OCR
  for (const yoloBox of yoloBoxes) {
    let maxIoU = 0;
    let matchedOCRIdx = -1;

    for (let i = 0; i < ocrBoxes.length; i++) {
      const iou = calculateIoU(yoloBox.bbox, ocrBoxes[i].bbox);
      if (iou > maxIoU) {
        maxIoU = iou;
        matchedOCRIdx = i;
      }
    }

    if (maxIoU >= iouThreshold && matchedOCRIdx >= 0) {
      // Merge: YOLO provides icon info, OCR provides text
      if (!usedOCR.has(matchedOCRIdx)) {
        const merged = result.find(r => r.id === ocrBoxes[matchedOCRIdx].id);
        if (merged) {
          merged.type = yoloBox.type !== 'unknown' ? yoloBox.type : merged.type;
          merged.label = yoloBox.label || merged.label;
          merged.source = 'merged';
        }
        usedOCR.add(matchedOCRIdx);
      }
    } else {
      // No overlap, add YOLO box
      result.push({ ...yoloBox, source: 'yolo' });
    }
  }

  return result;
}

// ============ ShowUI 风格 Union-Find for Token Selection ============

class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }

    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }

    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return;

    const rankX = this.rank.get(rootX) || 0;
    const rankY = this.rank.get(rootY) || 0;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  getGroups(): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(key);
    }

    return groups;
  }
}

export function groupUIElements(
  elements: UIElement[],
  proximityThreshold: number = 0.02  // 归一化距离阈值
): UIElement[][] {
  const uf = new UnionFind();

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const elem1 = elements[i];
      const elem2 = elements[j];

      // 计算中心点距离
      const cx1 = (elem1.bbox[0] + elem1.bbox[2]) / 2;
      const cy1 = (elem1.bbox[1] + elem1.bbox[3]) / 2;
      const cx2 = (elem2.bbox[0] + elem2.bbox[2]) / 2;
      const cy2 = (elem2.bbox[1] + elem2.bbox[3]) / 2;

      const distance = Math.sqrt(Math.pow(cx1 - cx2, 2) + Math.pow(cy1 - cy2, 2));

      if (distance < proximityThreshold) {
        uf.union(elem1.id, elem2.id);
      }
    }
  }

  const groups = uf.getGroups();
  const result: UIElement[][] = [];

  for (const [, memberIds] of groups) {
    const group = memberIds.map(id => elements.find(e => e.id === id)!);
    result.push(group);
  }

  return result;
}

// ============ 完整 UI Grounding 管道 ============

export class UIGroundingPipeline {
  private omniParserUrl: string;
  private ocrEngine: any;  // Tesseract 或 PaddleOCR

  constructor(config: {
    omniParserUrl?: string;
  } = {}) {
    this.omniParserUrl = config.omniParserUrl || 'http://localhost:7860';
  }

  async ground(imageBase64: string): Promise<GroundingResult> {
    const startTime = Date.now();

    // 1. 调用 OmniParser 获取 YOLO 检测结果
    const yoloResults = await this.runOmniParser(imageBase64);

    // 2. 调用 OCR 获取文本框
    const ocrResults = await this.runOCR(imageBase64);

    // 3. 使用 OCR 优先的 NMS 合并
    const mergedElements = removeOverlapWithOCRPriority(
      yoloResults,
      ocrResults,
      0.5
    );

    // 4. 按空间位置分组
    const groups = groupUIElements(mergedElements);

    // 5. 为每个元素分配唯一 ID
    let idCounter = 0;
    const finalElements: UIElement[] = [];

    for (const group of groups) {
      for (const elem of group) {
        finalElements.push({
          ...elem,
          id: `elem_${idCounter++}`,
        });
      }
    }

    return {
      elements: finalElements,
      processingTime: Date.now() - startTime,
    };
  }

  private async runOmniParser(imageBase64: string): Promise<UIElement[]> {
    try {
      const response = await fetch(`${this.omniParserUrl}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          box_threshold: 0.05,
          iou_threshold: 0.1,
        }),
      });

      const data = await response.json();
      return this.parseOmniParserResults(data);
    } catch (error) {
      console.warn('OmniParser 调用失败:', error);
      return [];
    }
  }

  private parseOmniParserResults(data: any): UIElement[] {
    const elements: UIElement[] = [];

    if (data.parsed_content_list && data.label_coordinates) {
      for (let i = 0; i < data.parsed_content_list.length; i++) {
        const content = data.parsed_content_list[i];
        const bbox = data.label_coordinates[i];

        elements.push({
          id: `yolo_${i}`,
          bbox: bbox as [number, number, number, number],
          label: this.extractLabel(content),
          content: content,
          type: this.inferType(content),
          confidence: 0.9,
          source: 'yolo',
        });
      }
    }

    return elements;
  }

  private async runOCR(imageBase64: string): Promise<UIElement[]> {
    // 使用 Tesseract.js 或 PaddleOCR
    // 这里提供接口，具体实现在 ocr.ts
    const { OCRManager } = await import('./ocr');
    const ocr = new OCRManager();
    await ocr.initialize();

    const buffer = Buffer.from(imageBase64, 'base64');
    const result = await ocr.recognize(buffer);

    return result.blocks.map((block, i) => ({
      id: `ocr_${i}`,
      bbox: block.bbox as [number, number, number, number],
      label: '',
      content: block.text,
      type: 'text' as const,
      confidence: block.confidence,
      source: 'ocr' as const,
    }));
  }

  private extractLabel(content: string): string {
    // 提取 "Icon: xxx" 或 "Text Box: xxx" 中的标签
    const match = content.match(/^(\w+):/);
    return match ? match[1] : '';
  }

  private inferType(content: string): UIElement['type'] {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('button')) return 'button';
    if (lowerContent.includes('input') || lowerContent.includes('text box')) return 'input';
    if (lowerContent.includes('link')) return 'link';
    if (lowerContent.includes('icon')) return 'icon';
    if (lowerContent.includes('image')) return 'image';

    return 'unknown';
  }
}
```

---

## 3. 多模态融合引擎

**来源**: Cradle, Agent-S, UI-TARS

### 3.1 动态权重管理器

```typescript
// packages/core/src/ai/multimodal-fusion.ts

import { EventEmitter } from 'events';

// ============ 类型定义 ============

export interface ModalityInput {
  screenshot?: Buffer;
  ocr?: {
    text: string;
    confidence: number;
  };
  uiElements?: UIElement[];
  clipboard?: string;
  windowInfo?: {
    appName: string;
    title: string;
  };
  history?: string[];
}

export interface FusedContext {
  textContext: string;
  images: Buffer[];
  weights: ModalityWeights;
  tokenBudget: TokenBudget;
}

export interface ModalityWeights {
  screenshot: number;
  ocr: number;
  uiElements: number;
  history: number;
  semantic: number;
}

export interface TokenBudget {
  total: number;
  screenshot: number;
  ocr: number;
  uiElements: number;
  history: number;
  system: number;
}

// ============ 动态权重管理器 ============

export class WeightManager {
  private baseWeights: ModalityWeights = {
    screenshot: 0.3,
    ocr: 0.25,
    uiElements: 0.2,
    history: 0.15,
    semantic: 0.1,
  };

  calculateWeights(input: ModalityInput, taskType: string): ModalityWeights {
    const weights = { ...this.baseWeights };

    // 根据任务类型调整
    switch (taskType) {
      case 'visual_search':
        weights.screenshot = 0.5;
        weights.ocr = 0.3;
        weights.uiElements = 0.15;
        break;
      case 'text_entry':
        weights.ocr = 0.4;
        weights.uiElements = 0.3;
        weights.screenshot = 0.2;
        break;
      case 'navigation':
        weights.uiElements = 0.4;
        weights.history = 0.25;
        weights.screenshot = 0.25;
        break;
    }

    // 根据数据质量调整
    if (input.ocr && input.ocr.confidence < 0.7) {
      weights.ocr *= 0.5;
      weights.screenshot += (this.baseWeights.ocr - weights.ocr);
    }

    if (!input.uiElements || input.uiElements.length === 0) {
      weights.uiElements = 0;
      weights.screenshot += this.baseWeights.uiElements * 0.5;
      weights.ocr += this.baseWeights.uiElements * 0.5;
    }

    // 归一化
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(weights) as (keyof ModalityWeights)[]) {
      weights[key] /= sum;
    }

    return weights;
  }
}

// ============ 上下文压缩器 ============

export class ContextCompressor {
  private maxTokens: number;

  constructor(maxTokens: number = 8000) {
    this.maxTokens = maxTokens;
  }

  allocateTokenBudget(weights: ModalityWeights): TokenBudget {
    const systemTokens = 500;  // 系统提示预留
    const available = this.maxTokens - systemTokens;

    return {
      total: this.maxTokens,
      screenshot: 0,  // 图片不计入文本 token
      ocr: Math.floor(available * weights.ocr),
      uiElements: Math.floor(available * weights.uiElements),
      history: Math.floor(available * weights.history),
      system: systemTokens,
    };
  }

  compressOCR(text: string, maxTokens: number): string {
    const estimatedTokens = Math.ceil(text.length / 3);

    if (estimatedTokens <= maxTokens) {
      return text;
    }

    // 保留最相关的部分
    const lines = text.split('\n').filter(l => l.trim());
    const maxChars = maxTokens * 3;

    let result = '';
    for (const line of lines) {
      if (result.length + line.length + 1 <= maxChars) {
        result += line + '\n';
      } else {
        break;
      }
    }

    return result.trim() + '\n[... truncated ...]';
  }

  compressUIElements(elements: UIElement[], maxTokens: number): string {
    // 按重要性排序
    const sorted = elements.sort((a, b) => b.confidence - a.confidence);

    const lines: string[] = [];
    let tokenCount = 0;

    for (const elem of sorted) {
      const line = `[${elem.id}] ${elem.type}: "${elem.content}" at (${elem.bbox.slice(0, 2).join(', ')})`;
      const lineTokens = Math.ceil(line.length / 3);

      if (tokenCount + lineTokens > maxTokens) {
        lines.push(`[... ${sorted.length - lines.length} more elements ...]`);
        break;
      }

      lines.push(line);
      tokenCount += lineTokens;
    }

    return lines.join('\n');
  }

  compressHistory(history: string[], maxTokens: number): string {
    // 保留最近的历史
    const reversed = [...history].reverse();
    const lines: string[] = [];
    let tokenCount = 0;

    for (const entry of reversed) {
      const tokens = Math.ceil(entry.length / 3);
      if (tokenCount + tokens > maxTokens) {
        break;
      }
      lines.unshift(entry);
      tokenCount += tokens;
    }

    return lines.join('\n');
  }
}

// ============ 多模态融合引擎 ============

export class MultimodalFusionEngine extends EventEmitter {
  private weightManager: WeightManager;
  private compressor: ContextCompressor;

  constructor(config: { maxTokens?: number } = {}) {
    super();
    this.weightManager = new WeightManager();
    this.compressor = new ContextCompressor(config.maxTokens);
  }

  fuse(input: ModalityInput, taskType: string = 'general'): FusedContext {
    // 1. 计算动态权重
    const weights = this.weightManager.calculateWeights(input, taskType);
    this.emit('weights:calculated', weights);

    // 2. 分配 token 预算
    const budget = this.compressor.allocateTokenBudget(weights);
    this.emit('budget:allocated', budget);

    // 3. 压缩各模态数据
    const textParts: string[] = [];

    // OCR 文本
    if (input.ocr) {
      const compressedOCR = this.compressor.compressOCR(input.ocr.text, budget.ocr);
      textParts.push(`## Screen Text (OCR)\n${compressedOCR}`);
    }

    // UI 元素
    if (input.uiElements && input.uiElements.length > 0) {
      const compressedElements = this.compressor.compressUIElements(input.uiElements, budget.uiElements);
      textParts.push(`## UI Elements\n${compressedElements}`);
    }

    // 历史记录
    if (input.history && input.history.length > 0) {
      const compressedHistory = this.compressor.compressHistory(input.history, budget.history);
      textParts.push(`## Recent Actions\n${compressedHistory}`);
    }

    // 窗口信息
    if (input.windowInfo) {
      textParts.push(`## Current Window\nApp: ${input.windowInfo.appName}\nTitle: ${input.windowInfo.title}`);
    }

    // 剪贴板
    if (input.clipboard) {
      const truncatedClip = input.clipboard.length > 500
        ? input.clipboard.slice(0, 500) + '...'
        : input.clipboard;
      textParts.push(`## Clipboard\n${truncatedClip}`);
    }

    // 4. 构建融合上下文
    const images: Buffer[] = [];
    if (input.screenshot) {
      images.push(input.screenshot);
    }

    return {
      textContext: textParts.join('\n\n'),
      images,
      weights,
      tokenBudget: budget,
    };
  }

  // 集成到 PerceptionEngine
  async integrateWithPerception(
    perceptionEngine: any,
    taskType: string = 'general'
  ): Promise<FusedContext> {
    const context = await perceptionEngine.perceive();

    const input: ModalityInput = {
      screenshot: context.screenshot?.imageData,
      ocr: context.ocr ? {
        text: context.ocr.text,
        confidence: context.ocr.confidence,
      } : undefined,
      clipboard: context.clipboard,
      windowInfo: context.activeWindow ? {
        appName: context.activeWindow.appName,
        title: context.activeWindow.title,
      } : undefined,
    };

    return this.fuse(input, taskType);
  }
}
```

---

## 4. Prompt 工程模板

**来源**: Cradle, Agent-S, OS-Copilot, Open Interpreter

### 4.1 可复用 Prompt 模板

```typescript
// packages/core/src/ai/prompt-templates.ts

export const PROMPT_TEMPLATES = {
  // ============ Cradle 风格：结构化占位符模板 ============
  CRADLE_ACTION_PLANNING: `
You are an intelligent AI assistant capable of operating a computer desktop.

## Current Task
<$task$>

## Environment State
- Application: <$app_name$>
- Window Title: <$window_title$>
- Screen Description: <$screen_description$>

## Previous Actions
<$previous_actions$>

## Available Actions
<$available_actions$>

## Current Screenshot
[Screenshot attached]

## Instructions
1. Analyze the current screen state
2. Determine the best next action to progress toward the task goal
3. Consider the history of previous actions to avoid repeating failed attempts

Respond with:
{
  "thought": "Your reasoning about the current state and what action to take...",
  "action": {
    "type": "click|type|scroll|hotkey|...",
    // action-specific parameters
  }
}
`,

  // ============ Agent-S 风格：DAG 任务分解 ============
  AGENT_S_TASK_DECOMPOSITION: `
You are a task decomposition expert. Your job is to break down complex tasks into subtasks.

## Main Task
<$main_task$>

## Context
- Current application: <$current_app$>
- User's working environment: <$environment$>

## Instructions
1. Analyze the main task and identify all required steps
2. Create a DAG (Directed Acyclic Graph) of subtasks
3. Identify dependencies between subtasks
4. Estimate complexity for each subtask (low/medium/high)

Output format:
{
  "subtasks": [
    {
      "id": "subtask_1",
      "description": "...",
      "dependencies": [],
      "complexity": "low|medium|high",
      "estimated_actions": 3
    }
  ],
  "execution_order": ["subtask_1", "subtask_2", ...]
}
`,

  // ============ Agent-S 风格：Manager Agent ============
  AGENT_S_MANAGER: `
You are a Manager Agent responsible for high-level task planning and delegation.

## Task
<$task$>

## Available Worker Agents
- UIAgent: Handles UI interactions (clicks, typing, scrolling)
- NavigationAgent: Handles app switching and window management
- FileAgent: Handles file operations
- SearchAgent: Handles search and information retrieval

## Current Progress
<$progress_summary$>

## Instructions
1. Review the current task and progress
2. Decide which worker agent should handle the next step
3. Provide clear instructions for the worker

Output:
{
  "next_worker": "UIAgent|NavigationAgent|FileAgent|SearchAgent",
  "instruction": "Detailed instruction for the worker...",
  "expected_outcome": "What should happen if successful",
  "fallback": "What to do if this step fails"
}
`,

  // ============ OS-Copilot 风格：代码生成与验证 ============
  OSCOPILOT_CODE_GENERATION: `
You are a code generation assistant. Generate Python code to accomplish the given task.

## Task
<$task$>

## Environment
- OS: <$os_platform$>
- Available tools: pyautogui, subprocess, os, shutil

## Constraints
- Code must be safe and reversible where possible
- Include error handling
- Use explicit waits where needed

Generate code:
\`\`\`python
# Your code here
\`\`\`
`,

  OSCOPILOT_CODE_VERIFICATION: `
You are a code verification assistant. Review the generated code for safety and correctness.

## Original Task
<$task$>

## Generated Code
\`\`\`python
<$generated_code$>
\`\`\`

## Verification Checklist
1. [ ] Code accomplishes the stated task
2. [ ] No destructive operations without confirmation
3. [ ] Proper error handling
4. [ ] No hardcoded sensitive data
5. [ ] Reasonable timeouts and waits

Provide your assessment:
{
  "is_safe": true|false,
  "is_correct": true|false,
  "issues": ["issue1", "issue2"],
  "suggested_fixes": "..."
}
`,

  // ============ 自反思模板 ============
  SELF_REFLECTION: `
You are analyzing whether the last action was successful by comparing before/after screenshots.

## Task Goal
<$task$>

## Last Executed Action
<$last_action$>

## Action Implementation
<$action_code$>

## Error Report (if any)
<$error_report$>

## Screenshots
[Before Action Screenshot]
[After Action Screenshot]

## Analysis Questions
1. What visual changes occurred between the screenshots?
2. Did the action achieve its intended effect?
3. If not successful, what is the most likely cause?
   - Wrong target element
   - Action timing issue
   - Application state changed
   - Technical error

Respond:
{
  "was_successful": true|false,
  "changes_observed": "Description of visual changes...",
  "reasoning": "Detailed analysis...",
  "failure_cause": "wrong_target|timing|state_changed|error|null",
  "suggested_adjustment": "What to try next..."
}
`,

  // ============ UI 元素匹配模板 ============
  UI_ELEMENT_MATCHING: `
Given the detected UI elements on screen, find the element that best matches the user's intent.

## User Intent
<$user_intent$>

## Detected Elements
<$elements_list$>

## Instructions
1. Analyze each element's label, content, and position
2. Consider the context and typical UI patterns
3. Select the most likely match

Respond:
{
  "matched_element_id": "elem_X",
  "confidence": 0.95,
  "reasoning": "Why this element matches the intent..."
}
`,
};

// ============ 模板渲染器 ============

export class PromptRenderer {
  render(template: string, variables: Record<string, string>): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `<$${key}$>`;
      result = result.replace(new RegExp(placeholder, 'g'), value || '');
    }

    // 清理未使用的占位符
    result = result.replace(/<\$\w+\$>/g, '[Not provided]');

    return result;
  }
}
```

---

## 5. 状态管理模块

**已实现**: 基于探索研究，以下文件已创建在 `packages/core/src/memory/`:

### 5.1 state-manager.ts
- **双重记忆系统**: 情节记忆 (Episodic) + 语义记忆 (Semantic)
- **工作区设计**: LocalMemory + recent_history (来自 Cradle)
- **对话历史管理**: 上下文裁剪和令牌预算
- **状态版本控制**: Checkpoint 和 Restore 功能
- **持久化支持**: 序列化和反序列化

### 5.2 memory-optimizer.ts
- **LRU Cache**: 支持 TTL 和压缩的缓存
- **增量更新管理器**: JSON Patch 支持
- **内存池**: Buffer 重用
- **内存压力监控**: 自动告警和清理

### 5.3 session-recovery.ts
- **任务生命周期管理**: PENDING → RUNNING → COMPLETED/FAILED
- **存档点 (Savepoint)**: 自动和手动创建
- **恢复策略**: RETRY_LAST, SKIP_FAILED, ROLLBACK, FULL_RESTART

使用示例：

```typescript
import {
  StateManager,
  createPersistentStateManager,
  SessionRecoveryManager,
  createAndRecover,
} from './memory';

// 创建持久化状态管理器
const stateManager = createPersistentStateManager('./state');
await stateManager.loadOrCreate('session_123');

// 添加记忆
stateManager.addEpisodicMemory('clicked_button', { element: 'Submit', position: { x: 0.5, y: 0.3 } });
stateManager.addSemanticMemory('form_structure', { fields: ['name', 'email', 'message'] });

// 创建检查点
stateManager.createCheckpoint('before_submit');

// 会话恢复
const recovery = await createAndRecover('./recovery', 'task_456');
if (recovery.lastSavepoint) {
  console.log('Resuming from:', recovery.lastSavepoint.id);
}
```

---

## 6. 安全与沙箱系统

**来源**: Open Interpreter, OS-Copilot

### 6.1 危险命令检测

```typescript
// packages/core/src/security/command-checker.ts

export const DANGEROUS_COMMANDS = {
  filesystem: [
    /rm\s+-rf\s+[\/~]/,           // rm -rf /
    /rm\s+-rf\s+\*/,              // rm -rf *
    /mkfs/,                        // 格式化磁盘
    /dd\s+if=.*of=\/dev/,          // dd 写入设备
    />\s*\/dev\/sd[a-z]/,          // 重定向到磁盘
    /chmod\s+-R\s+777\s+\//,       // 危险权限
    /chown\s+-R.*\//,              // 危险所有权变更
  ],

  system: [
    /shutdown/,
    /reboot/,
    /init\s+[06]/,
    /:(){:\|:&\s*};:/,             // Fork bomb
    />\s*\/dev\/null\s+2>&1\s*&/,  // 后台静默运行
    /kill\s+-9\s+-1/,              // Kill 所有进程
  ],

  network: [
    /curl.*\|\s*(ba)?sh/,          // Pipe to shell
    /wget.*\|\s*(ba)?sh/,
    /iptables\s+-F/,               // 清空防火墙规则
    /ufw\s+disable/,
    /nc\s+-l.*-e/,                 // Netcat reverse shell
  ],

  credentials: [
    /cat\s+.*\.ssh\/id_rsa/,
    /cat\s+.*\/etc\/shadow/,
    /cat\s+.*\/etc\/passwd/,
    /export\s+.*PASSWORD/,
    /export\s+.*SECRET/,
    /export\s+.*TOKEN/,
    /export\s+.*API_KEY/,
  ],

  sudo: [
    /sudo\s+rm/,
    /sudo\s+dd/,
    /sudo\s+mkfs/,
    /sudo\s+chmod/,
    /sudo\s+-i/,
    /sudo\s+su/,
  ],
};

export type DangerLevel = 'safe' | 'warning' | 'dangerous' | 'critical';

export interface CommandCheckResult {
  command: string;
  level: DangerLevel;
  category?: string;
  matchedPattern?: string;
  explanation?: string;
}

export class CommandChecker {
  check(command: string): CommandCheckResult {
    // 检查各类危险命令
    for (const [category, patterns] of Object.entries(DANGEROUS_COMMANDS)) {
      for (const pattern of patterns) {
        if (pattern.test(command)) {
          return {
            command,
            level: this.getCategoryLevel(category),
            category,
            matchedPattern: pattern.toString(),
            explanation: this.getExplanation(category, pattern),
          };
        }
      }
    }

    // 检查 sudo 前缀
    if (/^sudo\s+/.test(command)) {
      return {
        command,
        level: 'warning',
        category: 'sudo',
        explanation: 'Command requires elevated privileges',
      };
    }

    return { command, level: 'safe' };
  }

  private getCategoryLevel(category: string): DangerLevel {
    const levels: Record<string, DangerLevel> = {
      filesystem: 'critical',
      system: 'critical',
      network: 'dangerous',
      credentials: 'dangerous',
      sudo: 'warning',
    };
    return levels[category] || 'warning';
  }

  private getExplanation(category: string, pattern: RegExp): string {
    const explanations: Record<string, string> = {
      filesystem: 'This command can permanently delete or corrupt files',
      system: 'This command can affect system stability',
      network: 'This command may expose the system to network attacks',
      credentials: 'This command may expose sensitive credentials',
      sudo: 'This command requires elevated privileges',
    };
    return explanations[category] || 'This command requires caution';
  }
}
```

### 6.2 文件系统访问控制

```typescript
// packages/core/src/security/filesystem-access.ts

import * as path from 'path';
import * as os from 'os';

export interface AccessRule {
  path: string;
  permissions: ('read' | 'write' | 'execute')[];
  recursive: boolean;
}

export class FilesystemAccessController {
  private allowedPaths: AccessRule[] = [];
  private deniedPaths: string[] = [];

  constructor() {
    // 默认允许的路径
    this.allowedPaths = [
      { path: os.homedir(), permissions: ['read'], recursive: true },
      { path: path.join(os.homedir(), 'Documents'), permissions: ['read', 'write'], recursive: true },
      { path: path.join(os.homedir(), 'Downloads'), permissions: ['read', 'write'], recursive: true },
      { path: path.join(os.homedir(), 'Desktop'), permissions: ['read', 'write'], recursive: true },
      { path: '/tmp', permissions: ['read', 'write'], recursive: true },
    ];

    // 默认拒绝的路径
    this.deniedPaths = [
      path.join(os.homedir(), '.ssh'),
      path.join(os.homedir(), '.gnupg'),
      path.join(os.homedir(), '.aws'),
      path.join(os.homedir(), '.config'),
      '/etc',
      '/var',
      '/usr',
      '/bin',
      '/sbin',
    ];
  }

  checkAccess(filePath: string, permission: 'read' | 'write' | 'execute'): {
    allowed: boolean;
    reason?: string;
  } {
    const normalizedPath = path.resolve(filePath);

    // 检查拒绝列表
    for (const denied of this.deniedPaths) {
      if (normalizedPath.startsWith(denied)) {
        return { allowed: false, reason: `Access to ${denied} is restricted` };
      }
    }

    // 检查允许列表
    for (const rule of this.allowedPaths) {
      const rulePath = path.resolve(rule.path);
      const matches = rule.recursive
        ? normalizedPath.startsWith(rulePath)
        : normalizedPath === rulePath;

      if (matches && rule.permissions.includes(permission)) {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: 'Path not in allowed list' };
  }

  addAllowedPath(rule: AccessRule): void {
    this.allowedPaths.push(rule);
  }

  addDeniedPath(pathStr: string): void {
    this.deniedPaths.push(path.resolve(pathStr));
  }
}
```

### 6.3 用户确认服务

```typescript
// packages/core/src/security/user-confirmation.ts

import { EventEmitter } from 'events';

export interface ConfirmationRequest {
  id: string;
  type: 'command' | 'file_access' | 'network' | 'system';
  action: string;
  description: string;
  riskLevel: DangerLevel;
  timeout: number;  // ms
}

export interface ConfirmationResponse {
  id: string;
  approved: boolean;
  rememberedChoice?: 'always' | 'session' | 'once';
  timestamp: number;
}

export class UserConfirmationService extends EventEmitter {
  private pendingRequests: Map<string, ConfirmationRequest> = new Map();
  private rememberedChoices: Map<string, boolean> = new Map();
  private defaultTimeout: number = 30000;

  async requestConfirmation(request: Omit<ConfirmationRequest, 'id'>): Promise<boolean> {
    const id = `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 检查是否有记住的选择
    const actionKey = `${request.type}:${request.action}`;
    if (this.rememberedChoices.has(actionKey)) {
      return this.rememberedChoices.get(actionKey)!;
    }

    const fullRequest: ConfirmationRequest = {
      ...request,
      id,
      timeout: request.timeout || this.defaultTimeout,
    };

    this.pendingRequests.set(id, fullRequest);
    this.emit('confirmation:required', fullRequest);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Confirmation timeout'));
      }, fullRequest.timeout);

      const handler = (response: ConfirmationResponse) => {
        if (response.id === id) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          this.removeListener('confirmation:response', handler);

          if (response.rememberedChoice === 'always') {
            this.rememberedChoices.set(actionKey, response.approved);
          }

          resolve(response.approved);
        }
      };

      this.on('confirmation:response', handler);
    });
  }

  respond(response: ConfirmationResponse): void {
    this.emit('confirmation:response', response);
  }

  clearRememberedChoices(): void {
    this.rememberedChoices.clear();
  }
}
```

### 6.4 状态回滚管理器

```typescript
// packages/core/src/security/rollback-manager.ts

export interface StateSnapshot {
  id: string;
  timestamp: number;
  description: string;
  state: {
    clipboard?: string;
    openWindows?: string[];
    workingDirectory?: string;
    environmentVariables?: Record<string, string>;
  };
  actions: {
    type: string;
    timestamp: number;
    reversible: boolean;
    reverseAction?: string;
  }[];
}

export class RollbackManager {
  private snapshots: StateSnapshot[] = [];
  private maxSnapshots: number = 10;

  async createSnapshot(description: string): Promise<StateSnapshot> {
    const snapshot: StateSnapshot = {
      id: `snap_${Date.now()}`,
      timestamp: Date.now(),
      description,
      state: await this.captureCurrentState(),
      actions: [],
    };

    this.snapshots.push(snapshot);

    // 保持快照数量限制
    while (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  async rollback(snapshotId: string): Promise<boolean> {
    const snapshotIndex = this.snapshots.findIndex(s => s.id === snapshotId);
    if (snapshotIndex === -1) {
      return false;
    }

    const snapshot = this.snapshots[snapshotIndex];

    // 逆序执行回滚操作
    const actionsToReverse = this.snapshots
      .slice(snapshotIndex + 1)
      .flatMap(s => s.actions)
      .filter(a => a.reversible)
      .reverse();

    for (const action of actionsToReverse) {
      if (action.reverseAction) {
        // 执行逆向操作
        await this.executeReverseAction(action.reverseAction);
      }
    }

    // 恢复状态
    await this.restoreState(snapshot.state);

    // 移除已回滚的快照
    this.snapshots = this.snapshots.slice(0, snapshotIndex + 1);

    return true;
  }

  recordAction(action: StateSnapshot['actions'][0]): void {
    const currentSnapshot = this.snapshots[this.snapshots.length - 1];
    if (currentSnapshot) {
      currentSnapshot.actions.push(action);
    }
  }

  private async captureCurrentState(): Promise<StateSnapshot['state']> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const state: StateSnapshot['state'] = {};

    try {
      // 获取剪贴板
      if (process.platform === 'darwin') {
        const { stdout } = await execAsync('pbpaste');
        state.clipboard = stdout;
      }

      // 获取工作目录
      state.workingDirectory = process.cwd();

      // 获取关键环境变量
      state.environmentVariables = {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '',
      };
    } catch (error) {
      console.warn('Failed to capture some state:', error);
    }

    return state;
  }

  private async restoreState(state: StateSnapshot['state']): Promise<void> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      // 恢复剪贴板
      if (state.clipboard && process.platform === 'darwin') {
        await execAsync(`echo "${state.clipboard}" | pbcopy`);
      }

      // 恢复工作目录
      if (state.workingDirectory) {
        process.chdir(state.workingDirectory);
      }
    } catch (error) {
      console.warn('Failed to restore some state:', error);
    }
  }

  private async executeReverseAction(reverseAction: string): Promise<void> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      await execAsync(reverseAction);
    } catch (error) {
      console.warn('Failed to execute reverse action:', error);
    }
  }
}
```

---

## 7. 实现路线图

### 阶段 1: 基础增强 (已部分完成)
- [x] 状态管理模块 (state-manager.ts, memory-optimizer.ts, session-recovery.ts)
- [ ] Action 类型系统和解析器
- [ ] UI Grounding 管道

### 阶段 2: 执行能力
- [ ] NutJS Action 执行器
- [ ] 多模态融合引擎
- [ ] Prompt 模板系统

### 阶段 3: 安全与可靠性
- [ ] 危险命令检测
- [ ] 文件系统访问控制
- [ ] 用户确认服务
- [ ] 状态回滚管理器

### 阶段 4: 高级功能
- [ ] 自反思模块
- [ ] 技能学习系统
- [ ] VLA 模型集成 (ShowUI/UI-TARS)

---

## 附录: 项目源代码参考

| 功能模块 | 主要参考项目 | 关键文件/目录 |
|---------|------------|--------------|
| Action Space | UI-TARS | `/packages/ui-tars/sdk/src/index.ts` |
| | Agent-S | `/gui_agents/s2/core/actions.py` |
| | UFO | `/ufo/action/action_base.py` |
| UI Grounding | OmniParser | `/util/utils.py`, `/gradio_demo.py` |
| | ShowUI | `/showui.py` |
| 多模态融合 | Cradle | `/cradle/provider/module/` |
| | Agent-S | `/gui_agents/s2/agent/grounding.py` |
| Prompt 模板 | Cradle | `/cradle/environment/prompts/` |
| | Agent-S | `/gui_agents/s2/prompts/` |
| | OS-Copilot | `/oscopilot/prompts/` |
| 状态管理 | Agent-S | `/gui_agents/s2/memory/` |
| | Cradle | `/cradle/memory/` |
| | UI-TARS | Conversation management |
| 安全机制 | Open Interpreter | `/interpreter/core/computer/` |
| | OS-Copilot | `/oscopilot/utils/` |

---

*本文档基于对 Open Interpreter, OmniParser, Self-Operating Computer, Agent-S, UFO, Cradle, OS-Copilot, ShowUI, UI-TARS 九个项目的深度源代码分析。*
