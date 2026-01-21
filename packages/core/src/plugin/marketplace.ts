/**
 * 插件市场客户端
 * Plugin Marketplace Client
 *
 * 浏览、搜索、下载和安装社区插件
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import {
  MarketplacePlugin,
  PluginSearchOptions,
  PluginSearchResult,
  PluginInstallOptions,
  PluginCategory,
} from './types';
import { PluginManager } from './plugin-manager';

/**
 * 市场客户端配置
 */
export interface MarketplaceConfig {
  /** API 基础 URL */
  apiBaseUrl: string;
  /** 缓存目录 */
  cacheDir: string;
  /** 缓存过期时间 (毫秒) */
  cacheExpiry: number;
  /** 请求超时 (毫秒) */
  requestTimeout: number;
}

/**
 * 默认市场配置
 */
const DEFAULT_MARKETPLACE_CONFIG: MarketplaceConfig = {
  apiBaseUrl: 'https://marketplace.hawkeye.dev/api/v1',
  cacheDir: '~/.hawkeye/marketplace-cache',
  cacheExpiry: 3600000, // 1 小时
  requestTimeout: 30000, // 30 秒
};

/**
 * 市场客户端事件
 */
export interface MarketplaceEvents {
  'search:start': (options: PluginSearchOptions) => void;
  'search:complete': (result: PluginSearchResult) => void;
  'search:error': (error: Error) => void;
  'install:start': (pluginId: string) => void;
  'install:progress': (pluginId: string, progress: number) => void;
  'install:complete': (pluginId: string) => void;
  'install:error': (pluginId: string, error: Error) => void;
  'update:available': (pluginId: string, newVersion: string) => void;
}

/**
 * 插件市场客户端
 */
export class MarketplaceClient extends EventEmitter {
  private config: MarketplaceConfig;
  private pluginManager: PluginManager;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();

  constructor(
    pluginManager: PluginManager,
    config?: Partial<MarketplaceConfig>
  ) {
    super();
    this.pluginManager = pluginManager;
    this.config = { ...DEFAULT_MARKETPLACE_CONFIG, ...config };

    // 确保缓存目录存在
    this.ensureCacheDir();
  }

  /**
   * 确保缓存目录存在
   */
  private ensureCacheDir(): void {
    const cacheDir = this.resolvePath(this.config.cacheDir);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
  }

  /**
   * 解析路径 (支持 ~ 前缀)
   */
  private resolvePath(p: string): string {
    if (p.startsWith('~')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      return path.join(homeDir, p.slice(1));
    }
    return p;
  }

  // ============================================================================
  // 搜索与浏览 (Search & Browse)
  // ============================================================================

  /**
   * 搜索插件
   */
  async searchPlugins(options: PluginSearchOptions = {}): Promise<PluginSearchResult> {
    this.emit('search:start', options);

    try {
      // 构建查询参数
      const params = new URLSearchParams();
      if (options.query) params.set('q', options.query);
      if (options.category) params.set('category', options.category);
      if (options.sortBy) params.set('sort', options.sortBy);
      if (options.sortOrder) params.set('order', options.sortOrder);
      if (options.page) params.set('page', String(options.page));
      if (options.pageSize) params.set('limit', String(options.pageSize));
      if (options.verifiedOnly) params.set('verified', 'true');

      const cacheKey = `search:${params.toString()}`;

      // 检查缓存
      const cached = this.getFromCache<PluginSearchResult>(cacheKey);
      if (cached) {
        this.emit('search:complete', cached);
        return cached;
      }

      // 请求 API (这里使用模拟数据，实际应该调用 API)
      const result = await this.mockSearchPlugins(options);

      // 缓存结果
      this.setCache(cacheKey, result);

      this.emit('search:complete', result);
      return result;
    } catch (error) {
      this.emit('search:error', error as Error);
      throw error;
    }
  }

  /**
   * 获取插件详情
   */
  async getPluginDetails(pluginId: string): Promise<MarketplacePlugin | null> {
    const cacheKey = `plugin:${pluginId}`;

    // 检查缓存
    const cached = this.getFromCache<MarketplacePlugin>(cacheKey);
    if (cached) {
      return cached;
    }

    // 请求 API (模拟)
    const result = await this.mockGetPluginDetails(pluginId);

    if (result) {
      this.setCache(cacheKey, result);
    }

    return result;
  }

  /**
   * 获取热门插件
   */
  async getFeaturedPlugins(): Promise<MarketplacePlugin[]> {
    const result = await this.searchPlugins({
      sortBy: 'downloads',
      sortOrder: 'desc',
      pageSize: 10,
      verifiedOnly: true,
    });
    return result.plugins;
  }

  /**
   * 获取最新插件
   */
  async getLatestPlugins(): Promise<MarketplacePlugin[]> {
    const result = await this.searchPlugins({
      sortBy: 'updated',
      sortOrder: 'desc',
      pageSize: 10,
    });
    return result.plugins;
  }

  /**
   * 按分类获取插件
   */
  async getPluginsByCategory(category: PluginCategory): Promise<MarketplacePlugin[]> {
    const result = await this.searchPlugins({
      category,
      pageSize: 20,
    });
    return result.plugins;
  }

  // ============================================================================
  // 安装与更新 (Install & Update)
  // ============================================================================

  /**
   * 安装插件
   */
  async installPlugin(
    pluginId: string,
    options: PluginInstallOptions = {}
  ): Promise<void> {
    this.emit('install:start', pluginId);

    try {
      // 获取插件详情
      const pluginInfo = await this.getPluginDetails(pluginId);
      if (!pluginInfo) {
        throw new Error(`Plugin ${pluginId} not found in marketplace`);
      }

      // 检查是否已安装
      if (this.pluginManager.isPluginLoaded(pluginId) && !options.overwrite) {
        throw new Error(`Plugin ${pluginId} is already installed`);
      }

      // 下载插件
      this.emit('install:progress', pluginId, 0);
      const downloadPath = await this.downloadPlugin(pluginInfo);
      this.emit('install:progress', pluginId, 50);

      // 如果需要覆盖，先卸载
      if (this.pluginManager.isPluginLoaded(pluginId)) {
        await this.pluginManager.unloadPlugin(pluginId);
      }

      // 加载插件
      await this.pluginManager.loadPluginFromFile(downloadPath);
      this.emit('install:progress', pluginId, 100);

      // 如果不自动启用，禁用插件
      if (options.autoEnable === false) {
        await this.pluginManager.disablePlugin(pluginId);
      }

      this.emit('install:complete', pluginId);
    } catch (error) {
      this.emit('install:error', pluginId, error as Error);
      throw error;
    }
  }

  /**
   * 卸载插件
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    // 从插件管理器卸载
    if (this.pluginManager.isPluginLoaded(pluginId)) {
      await this.pluginManager.unloadPlugin(pluginId);
    }

    // 删除插件文件
    const pluginPath = path.join(
      this.resolvePath(this.config.cacheDir),
      'installed',
      pluginId
    );
    if (fs.existsSync(pluginPath)) {
      fs.rmSync(pluginPath, { recursive: true });
    }
  }

  /**
   * 检查更新
   */
  async checkForUpdates(): Promise<Map<string, string>> {
    const updates = new Map<string, string>();
    const loadedPlugins = this.pluginManager.getLoadedPlugins();

    for (const loadedPlugin of loadedPlugins) {
      const pluginId = loadedPlugin.plugin.metadata.id;
      const currentVersion = loadedPlugin.plugin.metadata.version;

      try {
        const marketplaceInfo = await this.getPluginDetails(pluginId);
        if (marketplaceInfo && this.isNewerVersion(currentVersion, marketplaceInfo.metadata.version)) {
          updates.set(pluginId, marketplaceInfo.metadata.version);
          this.emit('update:available', pluginId, marketplaceInfo.metadata.version);
        }
      } catch {
        // 忽略获取失败的插件
      }
    }

    return updates;
  }

  /**
   * 更新插件
   */
  async updatePlugin(pluginId: string): Promise<void> {
    await this.installPlugin(pluginId, { overwrite: true, autoEnable: true });
  }

  /**
   * 更新所有插件
   */
  async updateAllPlugins(): Promise<void> {
    const updates = await this.checkForUpdates();
    for (const pluginId of updates.keys()) {
      await this.updatePlugin(pluginId);
    }
  }

  // ============================================================================
  // 下载 (Download)
  // ============================================================================

  /**
   * 下载插件
   */
  private async downloadPlugin(pluginInfo: MarketplacePlugin): Promise<string> {
    const downloadDir = path.join(
      this.resolvePath(this.config.cacheDir),
      'downloads'
    );
    const installDir = path.join(
      this.resolvePath(this.config.cacheDir),
      'installed',
      pluginInfo.metadata.id
    );

    // 确保目录存在
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
    }

    const downloadPath = path.join(downloadDir, `${pluginInfo.metadata.id}.zip`);
    const installPath = path.join(installDir, 'index.js');

    // 模拟下载 (实际应该下载文件)
    // await this.httpDownload(pluginInfo.downloadUrl, downloadPath);

    // 模拟解压和安装 (实际应该解压 zip 文件)
    // 这里创建一个模拟的插件文件
    const mockPluginContent = `
module.exports = {
  metadata: {
    id: '${pluginInfo.metadata.id}',
    name: '${pluginInfo.metadata.name}',
    version: '${pluginInfo.metadata.version}',
    description: '${pluginInfo.metadata.description || ''}',
  },
  async activate(ctx) {
    ctx.logger.info('Plugin activated');
  },
  async deactivate() {
    // Cleanup
  },
};
`;
    fs.writeFileSync(installPath, mockPluginContent);

    return installPath;
  }

  // ============================================================================
  // 缓存管理 (Cache Management)
  // ============================================================================

  /**
   * 从缓存获取
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.config.cacheExpiry) {
      return cached.data as T;
    }
    return null;
  }

  /**
   * 设置缓存
   */
  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ============================================================================
  // 辅助方法 (Helper Methods)
  // ============================================================================

  /**
   * 比较版本号
   */
  private isNewerVersion(current: string, target: string): boolean {
    const currentParts = current.split('.').map(Number);
    const targetParts = target.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const c = currentParts[i] || 0;
      const t = targetParts[i] || 0;
      if (t > c) return true;
      if (t < c) return false;
    }
    return false;
  }

  // ============================================================================
  // 模拟数据 (Mock Data) - 用于开发和测试
  // ============================================================================

  /**
   * 模拟搜索插件
   */
  private async mockSearchPlugins(
    options: PluginSearchOptions
  ): Promise<PluginSearchResult> {
    // 模拟插件数据
    const allPlugins: MarketplacePlugin[] = [
      {
        metadata: {
          id: 'hawkeye-git-integration',
          name: 'Git Integration',
          version: '1.0.0',
          description: '自动检测 Git 操作并提供智能建议',
          author: { name: 'Hawkeye Team' },
          category: 'integration',
          keywords: ['git', 'version-control', 'automation'],
        },
        downloadUrl: 'https://marketplace.hawkeye.dev/plugins/git-integration.zip',
        downloads: 5000,
        rating: 4.8,
        ratingCount: 120,
        publishedAt: '2025-01-01',
        updatedAt: '2025-01-15',
        verified: true,
      },
      {
        metadata: {
          id: 'hawkeye-browser-sync',
          name: 'Browser Sync',
          version: '1.2.0',
          description: '同步浏览器状态和书签',
          author: { name: 'Community' },
          category: 'integration',
          keywords: ['browser', 'sync', 'bookmarks'],
        },
        downloadUrl: 'https://marketplace.hawkeye.dev/plugins/browser-sync.zip',
        downloads: 3000,
        rating: 4.5,
        ratingCount: 80,
        publishedAt: '2025-01-05',
        updatedAt: '2025-01-10',
        verified: true,
      },
      {
        metadata: {
          id: 'hawkeye-pomodoro',
          name: 'Pomodoro Timer',
          version: '1.0.1',
          description: '番茄工作法计时器',
          author: { name: 'Community' },
          category: 'workflow',
          keywords: ['pomodoro', 'timer', 'productivity'],
        },
        downloadUrl: 'https://marketplace.hawkeye.dev/plugins/pomodoro.zip',
        downloads: 2000,
        rating: 4.3,
        ratingCount: 50,
        publishedAt: '2025-01-08',
        updatedAt: '2025-01-12',
        verified: false,
      },
      {
        metadata: {
          id: 'hawkeye-code-snippets',
          name: 'Code Snippets',
          version: '2.0.0',
          description: '代码片段管理和快速插入',
          author: { name: 'DevTools' },
          category: 'utility',
          keywords: ['code', 'snippets', 'developer'],
        },
        downloadUrl: 'https://marketplace.hawkeye.dev/plugins/code-snippets.zip',
        downloads: 4500,
        rating: 4.7,
        ratingCount: 100,
        publishedAt: '2024-12-01',
        updatedAt: '2025-01-14',
        verified: true,
      },
      {
        metadata: {
          id: 'hawkeye-clipboard-history',
          name: 'Clipboard History',
          version: '1.1.0',
          description: '剪贴板历史记录和搜索',
          author: { name: 'Productivity Team' },
          category: 'utility',
          keywords: ['clipboard', 'history', 'search'],
        },
        downloadUrl: 'https://marketplace.hawkeye.dev/plugins/clipboard-history.zip',
        downloads: 6000,
        rating: 4.9,
        ratingCount: 150,
        publishedAt: '2024-11-15',
        updatedAt: '2025-01-13',
        verified: true,
      },
    ];

    // 过滤
    let filtered = allPlugins;

    if (options.query) {
      const query = options.query.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.metadata.name.toLowerCase().includes(query) ||
          p.metadata.description?.toLowerCase().includes(query) ||
          p.metadata.keywords?.some(k => k.toLowerCase().includes(query))
      );
    }

    if (options.category) {
      filtered = filtered.filter(p => p.metadata.category === options.category);
    }

    if (options.verifiedOnly) {
      filtered = filtered.filter(p => p.verified);
    }

    // 排序
    const sortBy = options.sortBy || 'downloads';
    const sortOrder = options.sortOrder || 'desc';
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'downloads':
          cmp = a.downloads - b.downloads;
          break;
        case 'rating':
          cmp = a.rating - b.rating;
          break;
        case 'updated':
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'name':
          cmp = a.metadata.name.localeCompare(b.metadata.name);
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    // 分页
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginated = filtered.slice(start, end);

    return {
      plugins: paginated,
      total: filtered.length,
      page,
      totalPages: Math.ceil(filtered.length / pageSize),
    };
  }

  /**
   * 模拟获取插件详情
   */
  private async mockGetPluginDetails(pluginId: string): Promise<MarketplacePlugin | null> {
    const result = await this.mockSearchPlugins({});
    return result.plugins.find(p => p.metadata.id === pluginId) || null;
  }
}

/**
 * 创建市场客户端
 */
export function createMarketplaceClient(
  pluginManager: PluginManager,
  config?: Partial<MarketplaceConfig>
): MarketplaceClient {
  return new MarketplaceClient(pluginManager, config);
}
