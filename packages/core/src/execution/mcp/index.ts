/**
 * MCP (Model Context Protocol) Module
 * Chrome DevTools 浏览器自动化集成
 */

// 类型导出
export * from './types';

// 客户端导出
export { ChromeDevToolsMCP } from './chrome-devtools';

// 高级 API 导出
export {
  BrowserActionsExecutor,
  createBrowserActionsExecutor,
  type BrowserActionsConfig,
} from './browser-actions';
