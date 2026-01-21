/**
 * 插件系统
 * Plugin System
 *
 * 提供 Hawkeye 插件的加载、管理和市场功能
 */

// 类型导出
export * from './types';

// 插件管理器
export {
  PluginManager,
  getPluginManager,
  createPluginManager,
  setPluginManager,
  type PluginManagerEvents,
} from './plugin-manager';

// 插件市场
export {
  MarketplaceClient,
  createMarketplaceClient,
  type MarketplaceConfig,
  type MarketplaceEvents,
} from './marketplace';
