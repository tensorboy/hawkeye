/**
 * MCP Tool Types - MCP 工具类型定义
 * 定义符合 Model Context Protocol 的工具接口
 */

/**
 * JSON Schema 类型定义
 */
export interface JSONSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  description?: string;
  [key: string]: unknown;
}

/**
 * 工具权限配置
 */
export interface ToolPermission {
  scope: 'global' | 'project' | 'session';
  level: 'read' | 'write' | 'execute';
  domains?: string[];
}

/**
 * MCP 工具结果
 */
export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  isError?: boolean;
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  /** 工具名称 (e.g. "hawkeye__file__read") */
  name: string;

  /** 工具描述 */
  description: string;

  /** 输入参数 Schema */
  inputSchema: JSONSchema;

  /** 输出结果 Schema (可选) */
  outputSchema?: JSONSchema;

  /** 所需权限 */
  permissions?: ToolPermission[];

  /** 执行函数 */
  execute: (input: unknown, context?: unknown) => Promise<ToolResult>;
}

/**
 * MCP 资源定义
 */
export interface MCPResource {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
  read: () => Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }> }>;
}

/**
 * MCP Prompt 定义
 */
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  get: (args: Record<string, string>) => Promise<{
    messages: Array<{
      role: 'user' | 'assistant';
      content: { type: 'text' | 'image' | 'resource'; text?: string; data?: string; mimeType?: string; uri?: string } | string;
    }>;
  }>;
}
