/**
 * Injection Detector - 注入检测器
 * 检测提示注入、命令注入等安全威胁
 */

import type {
  InjectionDetectionResult,
  InjectionType,
  ExecutionContext,
} from './permission-types';

export interface InjectionDetectorConfig {
  enablePromptInjection: boolean;
  enableCommandInjection: boolean;
  enablePathTraversal: boolean;
  enableSqlInjection: boolean;
  enableScriptInjection: boolean;
  enableDataExfiltration: boolean;
  customPatterns?: InjectionPattern[];
  minConfidence: number;
}

export interface InjectionPattern {
  type: InjectionType;
  pattern: RegExp;
  confidence: number;
  description: string;
}

const DEFAULT_CONFIG: InjectionDetectorConfig = {
  enablePromptInjection: true,
  enableCommandInjection: true,
  enablePathTraversal: true,
  enableSqlInjection: true,
  enableScriptInjection: true,
  enableDataExfiltration: true,
  minConfidence: 0.7,
};

/**
 * 内置检测模式
 */
const BUILTIN_PATTERNS: InjectionPattern[] = [
  // Prompt Injection Patterns
  {
    type: 'prompt_injection',
    pattern: /ignore\s+(previous|above|all)\s+(instructions?|prompts?|rules?)/i,
    confidence: 0.95,
    description: 'Attempt to override previous instructions',
  },
  {
    type: 'prompt_injection',
    pattern: /you\s+are\s+now\s+(in\s+)?("?\w+"?\s+)?mode/i,
    confidence: 0.85,
    description: 'Attempt to change assistant mode',
  },
  {
    type: 'prompt_injection',
    pattern: /disregard\s+(your\s+)?(safety|ethical|security)\s+(guidelines?|rules?|constraints?)/i,
    confidence: 0.95,
    description: 'Attempt to bypass safety guidelines',
  },
  {
    type: 'prompt_injection',
    pattern: /\[system\]|\[admin\]|\[override\]|\[sudo\]/i,
    confidence: 0.8,
    description: 'Fake system/admin tag injection',
  },
  {
    type: 'prompt_injection',
    pattern: /pretend\s+(to\s+be|you('re|r))\s+(a\s+)?(different|another|new)/i,
    confidence: 0.75,
    description: 'Attempt to change assistant identity',
  },
  {
    type: 'prompt_injection',
    pattern: /jailbreak|DAN|do\s+anything\s+now/i,
    confidence: 0.9,
    description: 'Known jailbreak attempt',
  },
  {
    type: 'prompt_injection',
    pattern: /```\s*(system|assistant|user)\s*\n/i,
    confidence: 0.85,
    description: 'Fake conversation role injection',
  },

  // Command Injection Patterns
  {
    type: 'command_injection',
    pattern: /;\s*(rm|cat|wget|curl|bash|sh|python|node|exec)\s+/i,
    confidence: 0.9,
    description: 'Command chaining attempt',
  },
  {
    type: 'command_injection',
    pattern: /\$\([^)]+\)|\`[^`]+\`/,
    confidence: 0.85,
    description: 'Command substitution',
  },
  {
    type: 'command_injection',
    pattern: /\|\s*(bash|sh|python|perl|ruby|node)/i,
    confidence: 0.9,
    description: 'Pipe to interpreter',
  },
  {
    type: 'command_injection',
    pattern: /&&\s*(rm|chmod|chown|mv|cp|wget|curl)\s+/i,
    confidence: 0.85,
    description: 'Chained dangerous command',
  },
  {
    type: 'command_injection',
    pattern: />\s*\/dev\/(sda|null|zero)|<\s*\/dev\//i,
    confidence: 0.95,
    description: 'Device file manipulation',
  },

  // Path Traversal Patterns
  {
    type: 'path_traversal',
    pattern: /\.\.\//g,
    confidence: 0.8,
    description: 'Directory traversal attempt',
  },
  {
    type: 'path_traversal',
    pattern: /%2e%2e%2f|%252e%252e%252f/i,
    confidence: 0.9,
    description: 'URL-encoded path traversal',
  },
  {
    type: 'path_traversal',
    pattern: /\/etc\/(passwd|shadow|hosts|sudoers)/i,
    confidence: 0.95,
    description: 'Access to sensitive system files',
  },
  {
    type: 'path_traversal',
    pattern: /~\/\.(ssh|aws|gnupg|config)/i,
    confidence: 0.9,
    description: 'Access to sensitive user config',
  },

  // SQL Injection Patterns (for query building)
  {
    type: 'sql_injection',
    pattern: /'\s*(or|and)\s+'?\d+'\s*=\s*'?\d+/i,
    confidence: 0.9,
    description: 'SQL boolean injection',
  },
  {
    type: 'sql_injection',
    pattern: /;\s*(drop|delete|truncate|update|insert)\s+/i,
    confidence: 0.95,
    description: 'SQL statement injection',
  },
  {
    type: 'sql_injection',
    pattern: /union\s+(all\s+)?select/i,
    confidence: 0.9,
    description: 'SQL UNION injection',
  },
  {
    type: 'sql_injection',
    pattern: /--\s*$|\/\*.*\*\//,
    confidence: 0.7,
    description: 'SQL comment injection',
  },

  // Script Injection Patterns
  {
    type: 'script_injection',
    pattern: /<script[^>]*>.*<\/script>/is,
    confidence: 0.95,
    description: 'Script tag injection',
  },
  {
    type: 'script_injection',
    pattern: /javascript:\s*[^"']+/i,
    confidence: 0.9,
    description: 'JavaScript URI injection',
  },
  {
    type: 'script_injection',
    pattern: /on(load|error|click|mouseover)\s*=/i,
    confidence: 0.85,
    description: 'Event handler injection',
  },
  {
    type: 'script_injection',
    pattern: /eval\s*\([^)]+\)|Function\s*\(/i,
    confidence: 0.9,
    description: 'Dynamic code execution',
  },

  // Data Exfiltration Patterns
  {
    type: 'data_exfiltration',
    pattern: /curl\s+.*(-d|--data|--data-raw)\s+.*@/i,
    confidence: 0.85,
    description: 'File upload via curl',
  },
  {
    type: 'data_exfiltration',
    pattern: /base64\s+.*\|\s*curl/i,
    confidence: 0.9,
    description: 'Encoded data exfiltration',
  },
  {
    type: 'data_exfiltration',
    pattern: /nc\s+-l|-e\s+\/bin\/(ba)?sh/i,
    confidence: 0.95,
    description: 'Reverse shell attempt',
  },
  {
    type: 'data_exfiltration',
    pattern: /\.(ssh\/id_|aws\/credentials|env)/i,
    confidence: 0.9,
    description: 'Credential file access',
  },
];

export class InjectionDetector {
  private config: InjectionDetectorConfig;
  private patterns: InjectionPattern[];

  constructor(config: Partial<InjectionDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.patterns = this.buildPatternList();
  }

  /**
   * 构建检测模式列表
   */
  private buildPatternList(): InjectionPattern[] {
    const patterns: InjectionPattern[] = [];

    // 添加启用的内置模式
    for (const pattern of BUILTIN_PATTERNS) {
      if (this.isPatternEnabled(pattern.type)) {
        patterns.push(pattern);
      }
    }

    // 添加自定义模式
    if (this.config.customPatterns) {
      patterns.push(...this.config.customPatterns);
    }

    return patterns;
  }

  /**
   * 检查模式类型是否启用
   */
  private isPatternEnabled(type: InjectionType): boolean {
    switch (type) {
      case 'prompt_injection':
        return this.config.enablePromptInjection;
      case 'command_injection':
        return this.config.enableCommandInjection;
      case 'path_traversal':
        return this.config.enablePathTraversal;
      case 'sql_injection':
        return this.config.enableSqlInjection;
      case 'script_injection':
        return this.config.enableScriptInjection;
      case 'data_exfiltration':
        return this.config.enableDataExfiltration;
      default:
        return true;
    }
  }

  /**
   * 检测输入中的注入
   */
  detect(input: string): InjectionDetectionResult {
    const results: Array<{
      pattern: InjectionPattern;
      match: RegExpMatchArray;
    }> = [];

    for (const pattern of this.patterns) {
      const match = input.match(pattern.pattern);
      if (match) {
        results.push({ pattern, match });
      }
    }

    if (results.length === 0) {
      return {
        detected: false,
        confidence: 0,
      };
    }

    // 取最高置信度的结果
    results.sort((a, b) => b.pattern.confidence - a.pattern.confidence);
    const topResult = results[0];

    // 检查是否达到最低置信度阈值
    if (topResult.pattern.confidence < this.config.minConfidence) {
      return {
        detected: false,
        confidence: topResult.pattern.confidence,
        type: topResult.pattern.type,
        recommendation: 'Low confidence detection, consider monitoring',
      };
    }

    return {
      detected: true,
      type: topResult.pattern.type,
      confidence: topResult.pattern.confidence,
      pattern: topResult.match[0],
      location: `position ${topResult.match.index}`,
      recommendation: this.getRecommendation(topResult.pattern.type),
    };
  }

  /**
   * 检测执行上下文中的注入
   */
  detectInContext(context: ExecutionContext): InjectionDetectionResult {
    // 检测 action
    let result = this.detect(context.action);
    if (result.detected) {
      return result;
    }

    // 检测参数
    for (const [key, value] of Object.entries(context.parameters)) {
      if (typeof value === 'string') {
        result = this.detect(value);
        if (result.detected) {
          result.location = `parameter: ${key}`;
          return result;
        }
      }
    }

    return { detected: false, confidence: 0 };
  }

  /**
   * 获取建议
   */
  private getRecommendation(type: InjectionType): string {
    switch (type) {
      case 'prompt_injection':
        return 'Block request and log attempt. Consider user intent verification.';
      case 'command_injection':
        return 'Sanitize input or use parameterized commands. Never execute directly.';
      case 'path_traversal':
        return 'Validate and normalize paths. Use allowlist for file access.';
      case 'sql_injection':
        return 'Use parameterized queries. Never concatenate user input.';
      case 'script_injection':
        return 'Sanitize output and use Content Security Policy.';
      case 'data_exfiltration':
        return 'Block network access for sensitive operations. Monitor data flow.';
      default:
        return 'Review and validate input before processing.';
    }
  }

  /**
   * 添加自定义检测模式
   */
  addPattern(pattern: InjectionPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * 移除检测模式
   */
  removePattern(type: InjectionType, patternStr: string): boolean {
    const index = this.patterns.findIndex(
      p => p.type === type && p.pattern.source === patternStr
    );
    if (index !== -1) {
      this.patterns.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 获取所有检测模式
   */
  getPatterns(): InjectionPattern[] {
    return [...this.patterns];
  }

  /**
   * 清理输入 (移除潜在的注入内容)
   */
  sanitize(input: string): string {
    let sanitized = input;

    // 移除命令替换
    sanitized = sanitized.replace(/\$\([^)]+\)/g, '');
    sanitized = sanitized.replace(/`[^`]+`/g, '');

    // 移除路径遍历
    sanitized = sanitized.replace(/\.\.\//g, '');

    // 编码特殊字符
    sanitized = sanitized.replace(/[;&|`$]/g, (char) => `\\${char}`);

    return sanitized;
  }
}

// 单例
let globalInjectionDetector: InjectionDetector | null = null;

export function getInjectionDetector(): InjectionDetector {
  if (!globalInjectionDetector) {
    globalInjectionDetector = new InjectionDetector();
  }
  return globalInjectionDetector;
}

export function setInjectionDetector(detector: InjectionDetector): void {
  globalInjectionDetector = detector;
}
