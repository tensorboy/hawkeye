/**
 * Tool Validator - MCP 工具验证器
 * 验证工具名称格式、权限声明和安全约束
 */

import type { ToolValidationResult, ToolCategory } from './permission-types';

export interface ToolDefinition {
  name: string;
  description?: string;
  category?: ToolCategory;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  permissions?: string[];
  dangerous?: boolean;
}

export interface ToolValidatorConfig {
  allowedPrefixes: string[];
  maxNameLength: number;
  requireDescription: boolean;
  requireCategory: boolean;
  requireSchema: boolean;
  forbiddenPatterns: RegExp[];
}

const DEFAULT_CONFIG: ToolValidatorConfig = {
  allowedPrefixes: ['hawkeye', 'mcp', 'plugin'],
  maxNameLength: 64,
  requireDescription: true,
  requireCategory: false,
  requireSchema: false,
  forbiddenPatterns: [
    /^(eval|exec|system|shell)$/i,
    /[<>|&;`$]/,
    /\s/,
  ],
};

/**
 * MCP 工具命名规范
 * 格式: prefix__namespace__action
 * 例如: hawkeye__file__read, mcp__browser__click
 */
const MCP_NAME_PATTERN = /^[a-z][a-z0-9]*(__[a-z][a-z0-9_]*){1,3}$/;

/**
 * 简单命名规范
 * 格式: namespace.action 或 action
 * 例如: file.read, generatePlan
 */
const SIMPLE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/;

export class ToolValidator {
  private config: ToolValidatorConfig;
  private registeredTools: Map<string, ToolDefinition> = new Map();

  constructor(config: Partial<ToolValidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 验证工具名称
   */
  validateName(name: string): ToolValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查空名称
    if (!name || name.trim() === '') {
      return {
        valid: false,
        errors: ['Tool name cannot be empty'],
        warnings: [],
      };
    }

    // 检查长度
    if (name.length > this.config.maxNameLength) {
      errors.push(`Tool name exceeds maximum length of ${this.config.maxNameLength}`);
    }

    // 检查禁止的模式
    for (const pattern of this.config.forbiddenPatterns) {
      if (pattern.test(name)) {
        errors.push(`Tool name matches forbidden pattern: ${pattern.source}`);
      }
    }

    // 检查命名规范
    const isMCPFormat = MCP_NAME_PATTERN.test(name);
    const isSimpleFormat = SIMPLE_NAME_PATTERN.test(name);

    if (!isMCPFormat && !isSimpleFormat) {
      errors.push('Tool name does not follow naming conventions (MCP: prefix__namespace__action or Simple: namespace.action)');
    }

    // 检查前缀
    if (isMCPFormat) {
      const prefix = name.split('__')[0];
      if (!this.config.allowedPrefixes.includes(prefix)) {
        warnings.push(`Tool prefix "${prefix}" is not in the allowed list: ${this.config.allowedPrefixes.join(', ')}`);
      }
    }

    // 规范化名称
    let normalizedName = name;
    if (isSimpleFormat && !isMCPFormat) {
      // 转换简单格式为 MCP 格式
      normalizedName = `hawkeye__${name.replace(/\./g, '__').toLowerCase()}`;
      warnings.push(`Consider using MCP format: ${normalizedName}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      normalizedName: isMCPFormat ? name : normalizedName,
    };
  }

  /**
   * 验证完整工具定义
   */
  validateTool(tool: ToolDefinition): ToolValidationResult {
    const nameResult = this.validateName(tool.name);
    const errors = [...nameResult.errors];
    const warnings = [...nameResult.warnings];

    // 检查描述
    if (this.config.requireDescription && !tool.description) {
      errors.push('Tool description is required');
    } else if (tool.description && tool.description.length < 10) {
      warnings.push('Tool description is very short, consider adding more detail');
    }

    // 检查类别
    if (this.config.requireCategory && !tool.category) {
      errors.push('Tool category is required');
    }

    // 检查 Schema
    if (this.config.requireSchema) {
      if (!tool.inputSchema) {
        errors.push('Input schema is required');
      }
      if (!tool.outputSchema) {
        warnings.push('Output schema is recommended');
      }
    }

    // 检查危险标记
    if (tool.dangerous && !tool.permissions?.length) {
      warnings.push('Dangerous tool should declare required permissions');
    }

    // 检查权限声明
    if (tool.permissions) {
      for (const perm of tool.permissions) {
        if (!this.isValidPermission(perm)) {
          warnings.push(`Unknown permission: ${perm}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      normalizedName: nameResult.normalizedName,
    };
  }

  /**
   * 验证权限格式
   */
  private isValidPermission(permission: string): boolean {
    const validPermissions = [
      'file:read',
      'file:write',
      'file:delete',
      'shell:execute',
      'network:request',
      'browser:navigate',
      'browser:click',
      'browser:input',
      'system:info',
      'ai:chat',
    ];
    return validPermissions.includes(permission) || /^[a-z]+:[a-z]+$/.test(permission);
  }

  /**
   * 注册工具
   */
  registerTool(tool: ToolDefinition): ToolValidationResult {
    const result = this.validateTool(tool);

    if (result.valid) {
      const normalizedName = result.normalizedName || tool.name;
      this.registeredTools.set(normalizedName, {
        ...tool,
        name: normalizedName,
      });
    }

    return result;
  }

  /**
   * 检查工具是否已注册
   */
  isRegistered(name: string): boolean {
    return this.registeredTools.has(name);
  }

  /**
   * 获取已注册的工具
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.registeredTools.get(name);
  }

  /**
   * 获取所有已注册的工具
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.registeredTools.values());
  }

  /**
   * 按类别获取工具
   */
  getToolsByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAllTools().filter(t => t.category === category);
  }

  /**
   * 移除工具
   */
  unregisterTool(name: string): boolean {
    return this.registeredTools.delete(name);
  }

  /**
   * 解析工具名称组成部分
   */
  parseToolName(name: string): {
    prefix?: string;
    namespace?: string;
    action?: string;
    raw: string;
  } {
    const parts = name.split('__');

    if (parts.length >= 3) {
      return {
        prefix: parts[0],
        namespace: parts[1],
        action: parts.slice(2).join('__'),
        raw: name,
      };
    } else if (parts.length === 2) {
      return {
        prefix: parts[0],
        action: parts[1],
        raw: name,
      };
    }

    // 尝试解析简单格式
    const simpleParts = name.split('.');
    if (simpleParts.length >= 2) {
      return {
        namespace: simpleParts[0],
        action: simpleParts.slice(1).join('.'),
        raw: name,
      };
    }

    return { action: name, raw: name };
  }

  /**
   * 检查工具是否危险
   */
  isDangerous(name: string): boolean {
    const tool = this.registeredTools.get(name);
    if (tool?.dangerous) return true;

    // 检查名称中的危险关键词
    const dangerousKeywords = [
      'delete', 'remove', 'drop', 'truncate', 'format',
      'exec', 'eval', 'shell', 'sudo', 'admin',
    ];

    const parsed = this.parseToolName(name);
    const action = parsed.action?.toLowerCase() || '';

    return dangerousKeywords.some(kw => action.includes(kw));
  }

  /**
   * 获取工具类别建议
   */
  suggestCategory(name: string): ToolCategory | undefined {
    const parsed = this.parseToolName(name);
    const namespace = (parsed.namespace || parsed.action || '').toLowerCase();

    const categoryMap: Record<string, ToolCategory> = {
      file: 'file',
      fs: 'file',
      path: 'file',
      dir: 'file',
      shell: 'shell',
      cmd: 'shell',
      exec: 'shell',
      terminal: 'shell',
      browser: 'browser',
      web: 'browser',
      page: 'browser',
      http: 'network',
      fetch: 'network',
      request: 'network',
      api: 'network',
      system: 'system',
      os: 'system',
      process: 'system',
      ai: 'ai',
      llm: 'ai',
      chat: 'ai',
    };

    for (const [key, category] of Object.entries(categoryMap)) {
      if (namespace.includes(key)) {
        return category;
      }
    }

    return undefined;
  }
}

// 单例
let globalToolValidator: ToolValidator | null = null;

export function getToolValidator(): ToolValidator {
  if (!globalToolValidator) {
    globalToolValidator = new ToolValidator();
  }
  return globalToolValidator;
}

export function setToolValidator(validator: ToolValidator): void {
  globalToolValidator = validator;
}
