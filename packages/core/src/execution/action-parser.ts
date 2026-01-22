/**
 * Action Parser - 动作解析器
 *
 * 将多种格式的动作描述解析为 GUIAction
 * 支持:
 * - 自然语言描述
 * - JSON 格式
 * - PyAutoGUI 格式
 * - UFO/Agent-S 格式
 */

import type {
  GUIAction,
  ClickAction,
  TypeAction,
  HotkeyAction,
  ScrollAction,
  DragAction,
  WaitAction,
  ScrollDirection,
  ModifierKey,
} from './action-types';

/**
 * 解析上下文
 */
export interface ParseContext {
  /** 当前鼠标位置 */
  mousePosition?: { x: number; y: number };
  /** 屏幕尺寸 */
  screenSize?: { width: number; height: number };
  /** 最后一个动作 */
  lastAction?: GUIAction;
  /** 元素位置映射 */
  elementPositions?: Map<string, { x: number; y: number }>;
}

/**
 * 解析结果
 */
export interface ParseResult {
  /** 解析的动作 */
  action: GUIAction | null;
  /** 置信度 (0-1) */
  confidence: number;
  /** 解析方法 */
  method: 'json' | 'natural' | 'pyautogui' | 'ufo' | 'agents';
  /** 原始输入 */
  original: string;
  /** 警告信息 */
  warnings?: string[];
}

/**
 * ActionParser - 动作解析器
 */
export class ActionParser {
  private context: ParseContext;

  constructor(context: ParseContext = {}) {
    this.context = context;
  }

  /**
   * 解析动作描述
   */
  parse(input: string): ParseResult {
    const trimmed = input.trim();

    // 尝试 JSON 解析
    const jsonResult = this.parseJSON(trimmed);
    if (jsonResult.action) {
      return jsonResult;
    }

    // 尝试 PyAutoGUI 格式
    const pyautoguiResult = this.parsePyAutoGUI(trimmed);
    if (pyautoguiResult.action) {
      return pyautoguiResult;
    }

    // 尝试 UFO/Agent-S 格式
    const ufoResult = this.parseUFOFormat(trimmed);
    if (ufoResult.action) {
      return ufoResult;
    }

    // 尝试自然语言解析
    const naturalResult = this.parseNaturalLanguage(trimmed);
    return naturalResult;
  }

  /**
   * 解析 JSON 格式
   */
  parseJSON(input: string): ParseResult {
    try {
      const parsed = JSON.parse(input);

      if (typeof parsed !== 'object' || !parsed.type) {
        return { action: null, confidence: 0, method: 'json', original: input };
      }

      // 验证动作类型
      const validTypes = [
        'click', 'double_click', 'right_click', 'drag', 'move',
        'scroll', 'type', 'hotkey', 'key_press', 'wait', 'screenshot',
        'focus', 'hover',
      ];

      if (!validTypes.includes(parsed.type)) {
        return {
          action: null,
          confidence: 0,
          method: 'json',
          original: input,
          warnings: [`Unknown action type: ${parsed.type}`],
        };
      }

      return {
        action: parsed as GUIAction,
        confidence: 1.0,
        method: 'json',
        original: input,
      };
    } catch {
      return { action: null, confidence: 0, method: 'json', original: input };
    }
  }

  /**
   * 解析 PyAutoGUI 格式
   * 如: pyautogui.click(100, 200)
   */
  parsePyAutoGUI(input: string): ParseResult {
    const patterns: Array<{
      regex: RegExp;
      parser: (match: RegExpMatchArray) => GUIAction | null;
    }> = [
      // click(x, y)
      {
        regex: /pyautogui\.click\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i,
        parser: (match) => ({
          type: 'click',
          x: parseInt(match[1]),
          y: parseInt(match[2]),
        }),
      },
      // doubleClick(x, y)
      {
        regex: /pyautogui\.doubleClick\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i,
        parser: (match) => ({
          type: 'double_click',
          x: parseInt(match[1]),
          y: parseInt(match[2]),
        }),
      },
      // rightClick(x, y)
      {
        regex: /pyautogui\.rightClick\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i,
        parser: (match) => ({
          type: 'right_click',
          x: parseInt(match[1]),
          y: parseInt(match[2]),
        }),
      },
      // moveTo(x, y)
      {
        regex: /pyautogui\.moveTo\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i,
        parser: (match) => ({
          type: 'move',
          x: parseInt(match[1]),
          y: parseInt(match[2]),
        }),
      },
      // write(text) or typewrite(text)
      {
        regex: /pyautogui\.(?:write|typewrite)\s*\(\s*['"](.+)['"]\s*\)/i,
        parser: (match) => ({
          type: 'type',
          text: match[1],
        }),
      },
      // press(key)
      {
        regex: /pyautogui\.press\s*\(\s*['"](\w+)['"]\s*\)/i,
        parser: (match) => ({
          type: 'key_press',
          key: match[1],
        }),
      },
      // hotkey(keys...)
      {
        regex: /pyautogui\.hotkey\s*\(\s*(.+)\s*\)/i,
        parser: (match) => {
          const keys = match[1]
            .split(',')
            .map((k) => k.trim().replace(/['"]/g, ''));
          return {
            type: 'hotkey',
            keys,
          };
        },
      },
      // scroll(amount)
      {
        regex: /pyautogui\.scroll\s*\(\s*(-?\d+)\s*\)/i,
        parser: (match) => {
          const amount = parseInt(match[1]);
          return {
            type: 'scroll',
            direction: amount > 0 ? 'up' : 'down',
            amount: Math.abs(amount),
          } as ScrollAction;
        },
      },
      // drag(fromX, fromY, toX, toY)
      {
        regex: /pyautogui\.drag\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i,
        parser: (match) => ({
          type: 'drag',
          from: { x: parseInt(match[1]), y: parseInt(match[2]) },
          to: { x: parseInt(match[3]), y: parseInt(match[4]) },
        }),
      },
      // sleep(seconds)
      {
        regex: /(?:pyautogui\.sleep|time\.sleep)\s*\(\s*([\d.]+)\s*\)/i,
        parser: (match) => ({
          type: 'wait',
          duration: Math.round(parseFloat(match[1]) * 1000),
        }),
      },
    ];

    for (const { regex, parser } of patterns) {
      const match = input.match(regex);
      if (match) {
        const action = parser(match);
        if (action) {
          return {
            action,
            confidence: 0.95,
            method: 'pyautogui',
            original: input,
          };
        }
      }
    }

    return { action: null, confidence: 0, method: 'pyautogui', original: input };
  }

  /**
   * 解析 UFO/Agent-S 格式
   * 如: CLICK(element_id) 或 TYPE(text)
   */
  parseUFOFormat(input: string): ParseResult {
    const patterns: Array<{
      regex: RegExp;
      parser: (match: RegExpMatchArray) => GUIAction | null;
    }> = [
      // CLICK(x, y) or CLICK(element_id)
      {
        regex: /CLICK\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i,
        parser: (match) => ({
          type: 'click',
          x: parseInt(match[1]),
          y: parseInt(match[2]),
        }),
      },
      // CLICK(element_id) - 需要元素位置映射
      {
        regex: /CLICK\s*\(\s*['"]?(\w+)['"]?\s*\)/i,
        parser: (match) => {
          const elementId = match[1];
          const position = this.context.elementPositions?.get(elementId);
          if (position) {
            return { type: 'click', x: position.x, y: position.y };
          }
          return null;
        },
      },
      // TYPE(text)
      {
        regex: /TYPE\s*\(\s*['"](.+)['"]\s*\)/i,
        parser: (match) => ({
          type: 'type',
          text: match[1],
        }),
      },
      // SCROLL(direction, amount)
      {
        regex: /SCROLL\s*\(\s*['"]?(up|down|left|right)['"]?\s*,?\s*(\d+)?\s*\)/i,
        parser: (match) => ({
          type: 'scroll',
          direction: match[1].toLowerCase() as ScrollDirection,
          amount: parseInt(match[2] || '3'),
        }),
      },
      // HOTKEY(keys)
      {
        regex: /HOTKEY\s*\(\s*(.+)\s*\)/i,
        parser: (match) => {
          const keys = match[1]
            .split(/[,+]/)
            .map((k) => k.trim().replace(/['"]/g, ''));
          return { type: 'hotkey', keys };
        },
      },
      // WAIT(ms)
      {
        regex: /WAIT\s*\(\s*(\d+)\s*\)/i,
        parser: (match) => ({
          type: 'wait',
          duration: parseInt(match[1]),
        }),
      },
      // DRAG(fromX, fromY, toX, toY)
      {
        regex: /DRAG\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i,
        parser: (match) => ({
          type: 'drag',
          from: { x: parseInt(match[1]), y: parseInt(match[2]) },
          to: { x: parseInt(match[3]), y: parseInt(match[4]) },
        }),
      },
    ];

    for (const { regex, parser } of patterns) {
      const match = input.match(regex);
      if (match) {
        const action = parser(match);
        if (action) {
          return {
            action,
            confidence: 0.9,
            method: 'ufo',
            original: input,
          };
        }
      }
    }

    return { action: null, confidence: 0, method: 'ufo', original: input };
  }

  /**
   * 解析自然语言
   */
  parseNaturalLanguage(input: string): ParseResult {
    const lower = input.toLowerCase();
    const warnings: string[] = [];

    // 点击
    const clickMatch = lower.match(
      /(?:click|tap|press)\s+(?:at\s+|on\s+)?\(?\s*(\d+)\s*,\s*(\d+)\s*\)?/i
    );
    if (clickMatch) {
      return {
        action: {
          type: 'click',
          x: parseInt(clickMatch[1]),
          y: parseInt(clickMatch[2]),
        },
        confidence: 0.85,
        method: 'natural',
        original: input,
      };
    }

    // 双击
    const doubleClickMatch = lower.match(
      /double\s*click\s+(?:at\s+|on\s+)?\(?\s*(\d+)\s*,\s*(\d+)\s*\)?/i
    );
    if (doubleClickMatch) {
      return {
        action: {
          type: 'double_click',
          x: parseInt(doubleClickMatch[1]),
          y: parseInt(doubleClickMatch[2]),
        },
        confidence: 0.85,
        method: 'natural',
        original: input,
      };
    }

    // 右键点击
    const rightClickMatch = lower.match(
      /right\s*click\s+(?:at\s+|on\s+)?\(?\s*(\d+)\s*,\s*(\d+)\s*\)?/i
    );
    if (rightClickMatch) {
      return {
        action: {
          type: 'right_click',
          x: parseInt(rightClickMatch[1]),
          y: parseInt(rightClickMatch[2]),
        },
        confidence: 0.85,
        method: 'natural',
        original: input,
      };
    }

    // 输入文本
    const typeMatch = input.match(
      /(?:type|input|enter|write)\s+['"]?(.+?)['"]?$/i
    );
    if (typeMatch) {
      return {
        action: {
          type: 'type',
          text: typeMatch[1],
        },
        confidence: 0.8,
        method: 'natural',
        original: input,
      };
    }

    // 滚动
    const scrollMatch = lower.match(
      /scroll\s+(up|down|left|right)\s*(\d+)?/i
    );
    if (scrollMatch) {
      return {
        action: {
          type: 'scroll',
          direction: scrollMatch[1] as ScrollDirection,
          amount: parseInt(scrollMatch[2] || '3'),
        },
        confidence: 0.85,
        method: 'natural',
        original: input,
      };
    }

    // 快捷键
    const hotkeyMatch = lower.match(
      /(?:press|hit|hotkey)\s+((?:ctrl|alt|shift|cmd|command|meta|super)[+\s])+(\w+)/i
    );
    if (hotkeyMatch) {
      const keys = input
        .match(/(?:ctrl|alt|shift|cmd|command|meta|super|\w+)/gi)
        ?.slice(1) || [];
      return {
        action: {
          type: 'hotkey',
          keys: keys.map((k) => this.normalizeModifier(k)),
        },
        confidence: 0.75,
        method: 'natural',
        original: input,
      };
    }

    // 按键
    const keyMatch = lower.match(
      /press\s+(enter|return|escape|esc|tab|space|backspace|delete|up|down|left|right|home|end|pageup|pagedown|\w)/i
    );
    if (keyMatch) {
      return {
        action: {
          type: 'key_press',
          key: keyMatch[1],
        },
        confidence: 0.8,
        method: 'natural',
        original: input,
      };
    }

    // 等待
    const waitMatch = lower.match(
      /(?:wait|sleep|delay)\s*(?:for\s+)?(\d+)\s*(?:ms|milliseconds|s|seconds?)?/i
    );
    if (waitMatch) {
      let duration = parseInt(waitMatch[1]);
      // 如果单位是秒，转换为毫秒
      if (lower.includes('second') || (lower.includes('s') && !lower.includes('ms'))) {
        duration *= 1000;
      }
      return {
        action: {
          type: 'wait',
          duration,
        },
        confidence: 0.9,
        method: 'natural',
        original: input,
      };
    }

    // 移动
    const moveMatch = lower.match(
      /move\s+(?:to\s+|mouse\s+to\s+)?\(?\s*(\d+)\s*,\s*(\d+)\s*\)?/i
    );
    if (moveMatch) {
      return {
        action: {
          type: 'move',
          x: parseInt(moveMatch[1]),
          y: parseInt(moveMatch[2]),
        },
        confidence: 0.85,
        method: 'natural',
        original: input,
      };
    }

    // 拖拽
    const dragMatch = lower.match(
      /drag\s+(?:from\s+)?\(?\s*(\d+)\s*,\s*(\d+)\s*\)?\s+(?:to\s+)?\(?\s*(\d+)\s*,\s*(\d+)\s*\)?/i
    );
    if (dragMatch) {
      return {
        action: {
          type: 'drag',
          from: { x: parseInt(dragMatch[1]), y: parseInt(dragMatch[2]) },
          to: { x: parseInt(dragMatch[3]), y: parseInt(dragMatch[4]) },
        },
        confidence: 0.85,
        method: 'natural',
        original: input,
      };
    }

    // 无法解析
    return {
      action: null,
      confidence: 0,
      method: 'natural',
      original: input,
      warnings: ['Could not parse action from natural language'],
    };
  }

  /**
   * 批量解析
   */
  parseMultiple(inputs: string[]): ParseResult[] {
    return inputs.map((input) => this.parse(input));
  }

  /**
   * 更新上下文
   */
  updateContext(context: Partial<ParseContext>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * 设置元素位置
   */
  setElementPosition(elementId: string, position: { x: number; y: number }): void {
    if (!this.context.elementPositions) {
      this.context.elementPositions = new Map();
    }
    this.context.elementPositions.set(elementId, position);
  }

  // ============ 私有方法 ============

  private normalizeModifier(key: string): string {
    const lower = key.toLowerCase();
    const map: Record<string, string> = {
      cmd: 'meta',
      command: 'meta',
      super: 'meta',
      ctrl: 'ctrl',
      control: 'ctrl',
      alt: 'alt',
      option: 'alt',
      shift: 'shift',
    };
    return map[lower] || lower;
  }
}

/**
 * 创建动作解析器
 */
export function createActionParser(context?: ParseContext): ActionParser {
  return new ActionParser(context);
}

// ============ 单例支持 ============

let globalActionParser: ActionParser | null = null;

/**
 * 获取全局动作解析器实例
 */
export function getActionParser(): ActionParser {
  if (!globalActionParser) {
    globalActionParser = createActionParser();
  }
  return globalActionParser;
}

/**
 * 设置全局动作解析器实例
 */
export function setActionParser(parser: ActionParser): void {
  globalActionParser = parser;
}
