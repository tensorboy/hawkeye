/**
 * Tool Registry - 工具注册表
 * 管理所有 MCP 工具的注册、查找和权限验证
 */

import type { MCPTool, ToolResult } from './tool-types';

export class ToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  private middlewares: Array<(tool: MCPTool, input: unknown, next: () => Promise<ToolResult>) => Promise<ToolResult>> = [];

  /**
   * 注册工具
   */
  registerTool(tool: MCPTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Tool ${tool.name} already registered, overwriting.`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 注册多个工具
   */
  registerTools(tools: MCPTool[]): void {
    tools.forEach(tool => this.registerTool(tool));
  }

  /**
   * 获取工具
   */
  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具
   */
  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 移除工具
   */
  removeTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 添加执行中间件 (用于日志、权限检查等)
   */
  use(middleware: (tool: MCPTool, input: unknown, next: () => Promise<ToolResult>) => Promise<ToolResult>): void {
    this.middlewares.push(middleware);
  }

  /**
   * 执行工具
   */
  async executeTool(name: string, input: unknown, context?: unknown): Promise<ToolResult> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    // 构建中间件链
    const dispatch = async (index: number): Promise<ToolResult> => {
      if (index >= this.middlewares.length) {
        return tool.execute(input, context);
      }

      const middleware = this.middlewares[index];
      return middleware(tool, input, () => dispatch(index + 1));
    };

    return dispatch(0);
  }
}

// 单例
let globalToolRegistry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!globalToolRegistry) {
    globalToolRegistry = new ToolRegistry();
  }
  return globalToolRegistry;
}
