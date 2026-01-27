/**
 * MCP Module - Model Context Protocol 模块
 * 提供标准化工具接口和服务器实现
 */

export * from './tool-types';
export * from './tool-registry';
export * from './mcp-server';
export {
  ALL_BUILTIN_TOOLS,
  TOOL_CATEGORIES,
  registerBuiltinTools,
  screenCaptureTool,
  ocrTool,
  windowInfoTool,
  clipboardReadTool,
  mouseClickTool,
  keyboardTypeTool,
  hotkeyTool,
  scrollTool,
  shellExecuteTool,
  fileReadTool,
  fileWriteTool,
  fileListTool,
  searchTool,
  queueStatusTool,
  aiChatTool,
} from './builtin-tools';
