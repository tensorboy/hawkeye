/**
 * Coordinate Persistence - 坐标持久化系统
 *
 * 参考 Self-Operating Computer 的坐标 Hash 系统
 * 提供基于历史成功率的坐标选择和持久化
 *
 * 功能:
 * - 坐标 Hash 生成和存储
 * - 成功率追踪
 * - 应用上下文分区
 * - SQLite 持久化
 */

import { createHash } from 'crypto';
import type { UIElement, BoundingBox, Point } from './types';
import { getBoxCenter } from './nms';

// ============ 类型定义 ============

/**
 * 坐标 Hash 记录
 */
export interface CoordinateHash {
  /** Hash ID */
  hash: string;
  /** 元素 ID */
  elementId: string;
  /** 元素类型 */
  elementType: string;
  /** 元素文本 */
  elementText?: string;
  /** 边界框 */
  bounds: BoundingBox;
  /** 中心点坐标 */
  center: Point;
  /** 应用上下文 */
  appContext: string;
  /** 窗口标题模式 */
  windowPattern?: string;
  /** 点击成功次数 */
  successCount: number;
  /** 点击失败次数 */
  failureCount: number;
  /** 成功率 */
  successRate: number;
  /** 最后使用时间 */
  lastUsed: number;
  /** 创建时间 */
  createdAt: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 坐标查询选项
 */
export interface CoordinateLookupOptions {
  /** 应用上下文 */
  appContext?: string;
  /** 窗口标题 */
  windowTitle?: string;
  /** 元素类型 */
  elementType?: string;
  /** 元素文本 */
  elementText?: string;
  /** 最小成功率阈值 */
  minSuccessRate?: number;
  /** 是否模糊匹配文本 */
  fuzzyMatch?: boolean;
}

/**
 * 坐标持久化配置
 */
export interface CoordinatePersistenceConfig {
  /** 最大缓存条目数 */
  maxCacheSize: number;
  /** 缓存过期时间 (ms) */
  cacheExpireTime: number;
  /** 最小成功次数才纳入计算 */
  minSuccessCountForRanking: number;
  /** 是否启用持久化 */
  enablePersistence: boolean;
  /** 持久化间隔 (ms) */
  persistenceInterval: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: CoordinatePersistenceConfig = {
  maxCacheSize: 10000,
  cacheExpireTime: 7 * 24 * 60 * 60 * 1000, // 7 天
  minSuccessCountForRanking: 3,
  enablePersistence: true,
  persistenceInterval: 60000, // 1 分钟
};

// ============ 坐标持久化管理器 ============

/**
 * CoordinatePersistence - 坐标持久化管理器
 *
 * 提供坐标 Hash 的生成、存储、查询和成功率追踪
 */
export class CoordinatePersistence {
  private config: CoordinatePersistenceConfig;
  private hashMap: Map<string, CoordinateHash> = new Map();
  private contextIndex: Map<string, Set<string>> = new Map(); // appContext -> hashes
  private persistenceTimer: NodeJS.Timeout | null = null;
  private dirty: boolean = false;

  // 持久化回调 (由外部设置，如 Database)
  private onPersist?: (records: CoordinateHash[]) => Promise<void>;
  private onLoad?: () => Promise<CoordinateHash[]>;

  constructor(config: Partial<CoordinatePersistenceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化 - 加载持久化数据
   */
  async initialize(): Promise<void> {
    if (this.onLoad) {
      try {
        const records = await this.onLoad();
        for (const record of records) {
          this.hashMap.set(record.hash, record);
          this.indexByContext(record.hash, record.appContext);
        }
        console.log(`[CoordinatePersistence] 加载 ${records.length} 条坐标记录`);
      } catch (error) {
        console.warn('[CoordinatePersistence] 加载持久化数据失败:', error);
      }
    }

    // 启动定时持久化
    if (this.config.enablePersistence && this.config.persistenceInterval > 0) {
      this.startPersistenceTimer();
    }
  }

  /**
   * 设置持久化回调
   */
  setPersistenceCallbacks(
    onPersist: (records: CoordinateHash[]) => Promise<void>,
    onLoad: () => Promise<CoordinateHash[]>
  ): void {
    this.onPersist = onPersist;
    this.onLoad = onLoad;
  }

  /**
   * 生成坐标 Hash
   */
  generateHash(element: UIElement, appContext: string): string {
    const data = [
      element.id,
      element.type,
      element.text || '',
      Math.round(element.bounds.x),
      Math.round(element.bounds.y),
      Math.round(element.bounds.width),
      Math.round(element.bounds.height),
      appContext,
    ].join('|');

    return createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  /**
   * 记录元素坐标
   */
  record(
    element: UIElement,
    appContext: string,
    windowTitle?: string
  ): CoordinateHash {
    const hash = this.generateHash(element, appContext);

    const existing = this.hashMap.get(hash);
    if (existing) {
      // 更新最后使用时间
      existing.lastUsed = Date.now();
      this.dirty = true;
      return existing;
    }

    // 创建新记录
    const record: CoordinateHash = {
      hash,
      elementId: element.id,
      elementType: element.type,
      elementText: element.text,
      bounds: { ...element.bounds },
      center: getBoxCenter(element.bounds),
      appContext,
      windowPattern: windowTitle ? this.extractPattern(windowTitle) : undefined,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      lastUsed: Date.now(),
      createdAt: Date.now(),
    };

    this.hashMap.set(hash, record);
    this.indexByContext(hash, appContext);
    this.dirty = true;

    // 检查缓存大小
    this.pruneCache();

    return record;
  }

  /**
   * 记录点击成功
   */
  recordSuccess(hash: string): void {
    const record = this.hashMap.get(hash);
    if (record) {
      record.successCount++;
      record.lastUsed = Date.now();
      record.successRate = this.calculateSuccessRate(record);
      this.dirty = true;
    }
  }

  /**
   * 记录点击失败
   */
  recordFailure(hash: string): void {
    const record = this.hashMap.get(hash);
    if (record) {
      record.failureCount++;
      record.lastUsed = Date.now();
      record.successRate = this.calculateSuccessRate(record);
      this.dirty = true;
    }
  }

  /**
   * 查找最佳坐标
   */
  findBest(
    element: UIElement,
    appContext: string,
    options: CoordinateLookupOptions = {}
  ): CoordinateHash | null {
    // 首先尝试精确匹配
    const hash = this.generateHash(element, appContext);
    const exact = this.hashMap.get(hash);
    if (exact && this.isValidRecord(exact, options)) {
      return exact;
    }

    // 然后尝试模糊匹配
    const candidates = this.findCandidates(element, appContext, options);
    if (candidates.length === 0) {
      return null;
    }

    // 按成功率排序
    candidates.sort((a, b) => {
      // 优先考虑成功率
      if (a.successRate !== b.successRate) {
        return b.successRate - a.successRate;
      }
      // 其次考虑成功次数
      if (a.successCount !== b.successCount) {
        return b.successCount - a.successCount;
      }
      // 最后考虑最近使用
      return b.lastUsed - a.lastUsed;
    });

    return candidates[0];
  }

  /**
   * 获取元素的最佳点击坐标
   */
  getBestCoordinate(
    element: UIElement,
    appContext: string,
    options: CoordinateLookupOptions = {}
  ): Point {
    const record = this.findBest(element, appContext, options);

    if (record && record.successRate > 0.7) {
      // 使用历史成功的坐标
      return record.center;
    }

    // 使用元素中心点
    return getBoxCenter(element.bounds);
  }

  /**
   * 获取应用上下文的所有坐标记录
   */
  getByContext(appContext: string): CoordinateHash[] {
    const hashes = this.contextIndex.get(appContext);
    if (!hashes) {
      return [];
    }

    return Array.from(hashes)
      .map((hash) => this.hashMap.get(hash))
      .filter((record): record is CoordinateHash => record !== undefined);
  }

  /**
   * 获取统计信息
   */
  getStatistics(): {
    totalRecords: number;
    totalContexts: number;
    averageSuccessRate: number;
    topElements: Array<{ hash: string; successRate: number; successCount: number }>;
  } {
    const records = Array.from(this.hashMap.values());
    const totalRecords = records.length;
    const totalContexts = this.contextIndex.size;

    const validRecords = records.filter(
      (r) => r.successCount >= this.config.minSuccessCountForRanking
    );

    const averageSuccessRate =
      validRecords.length > 0
        ? validRecords.reduce((sum, r) => sum + r.successRate, 0) / validRecords.length
        : 0;

    const topElements = validRecords
      .sort((a, b) => b.successRate - a.successRate || b.successCount - a.successCount)
      .slice(0, 10)
      .map((r) => ({
        hash: r.hash,
        successRate: r.successRate,
        successCount: r.successCount,
      }));

    return {
      totalRecords,
      totalContexts,
      averageSuccessRate,
      topElements,
    };
  }

  /**
   * 手动触发持久化
   */
  async persist(): Promise<void> {
    if (!this.dirty || !this.onPersist) {
      return;
    }

    const records = Array.from(this.hashMap.values());
    await this.onPersist(records);
    this.dirty = false;
    console.log(`[CoordinatePersistence] 持久化 ${records.length} 条记录`);
  }

  /**
   * 清除所有记录
   */
  clear(): void {
    this.hashMap.clear();
    this.contextIndex.clear();
    this.dirty = true;
  }

  /**
   * 停止持久化定时器
   */
  stop(): void {
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
      this.persistenceTimer = null;
    }
  }

  /**
   * 终止并保存
   */
  async terminate(): Promise<void> {
    this.stop();
    await this.persist();
  }

  // ============ 私有方法 ============

  private indexByContext(hash: string, appContext: string): void {
    let hashes = this.contextIndex.get(appContext);
    if (!hashes) {
      hashes = new Set();
      this.contextIndex.set(appContext, hashes);
    }
    hashes.add(hash);
  }

  private calculateSuccessRate(record: CoordinateHash): number {
    const total = record.successCount + record.failureCount;
    if (total === 0) {
      return 0;
    }
    return record.successCount / total;
  }

  private isValidRecord(
    record: CoordinateHash,
    options: CoordinateLookupOptions
  ): boolean {
    // 检查成功率阈值
    if (
      options.minSuccessRate !== undefined &&
      record.successRate < options.minSuccessRate
    ) {
      return false;
    }

    // 检查是否过期
    const age = Date.now() - record.lastUsed;
    if (age > this.config.cacheExpireTime) {
      return false;
    }

    return true;
  }

  private findCandidates(
    element: UIElement,
    appContext: string,
    options: CoordinateLookupOptions
  ): CoordinateHash[] {
    const candidates: CoordinateHash[] = [];
    const contextHashes = this.contextIndex.get(appContext);

    if (!contextHashes) {
      return candidates;
    }

    for (const hash of contextHashes) {
      const record = this.hashMap.get(hash);
      if (!record) continue;

      // 类型匹配
      if (record.elementType !== element.type) continue;

      // 文本匹配
      if (element.text && record.elementText) {
        if (options.fuzzyMatch) {
          // 模糊匹配
          if (!this.fuzzyTextMatch(element.text, record.elementText)) {
            continue;
          }
        } else {
          // 精确匹配
          if (element.text !== record.elementText) {
            continue;
          }
        }
      }

      // 位置相似性 (允许一定偏移)
      const centerDist = this.calculateDistance(
        getBoxCenter(element.bounds),
        record.center
      );
      if (centerDist > 100) {
        // 超过 100px 认为是不同元素
        continue;
      }

      // 验证记录有效性
      if (!this.isValidRecord(record, options)) {
        continue;
      }

      candidates.push(record);
    }

    return candidates;
  }

  private fuzzyTextMatch(text1: string, text2: string): boolean {
    const lower1 = text1.toLowerCase();
    const lower2 = text2.toLowerCase();

    // 包含匹配
    if (lower1.includes(lower2) || lower2.includes(lower1)) {
      return true;
    }

    // 相似度匹配 (简单实现)
    const similarity = this.calculateSimilarity(lower1, lower2);
    return similarity > 0.7;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {
      return 1.0;
    }

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
        }
      }
    }

    return dp[m][n];
  }

  private calculateDistance(p1: Point, p2: Point): number {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }

  private extractPattern(windowTitle: string): string {
    // 提取窗口标题模式 (移除动态部分)
    return windowTitle
      .replace(/\d+/g, '*') // 数字替换为 *
      .replace(/\s+/g, ' ') // 规范化空格
      .trim();
  }

  private pruneCache(): void {
    if (this.hashMap.size <= this.config.maxCacheSize) {
      return;
    }

    // 按最后使用时间排序，删除最旧的记录
    const records = Array.from(this.hashMap.entries()).sort(
      (a, b) => a[1].lastUsed - b[1].lastUsed
    );

    const toRemove = records.slice(0, this.hashMap.size - this.config.maxCacheSize);
    for (const [hash, record] of toRemove) {
      this.hashMap.delete(hash);

      // 更新上下文索引
      const contextHashes = this.contextIndex.get(record.appContext);
      if (contextHashes) {
        contextHashes.delete(hash);
        if (contextHashes.size === 0) {
          this.contextIndex.delete(record.appContext);
        }
      }
    }

    this.dirty = true;
  }

  private startPersistenceTimer(): void {
    this.persistenceTimer = setInterval(async () => {
      await this.persist();
    }, this.config.persistenceInterval);
  }
}

// ============ 单例支持 ============

let globalCoordinatePersistence: CoordinatePersistence | null = null;

export function getCoordinatePersistence(): CoordinatePersistence {
  if (!globalCoordinatePersistence) {
    globalCoordinatePersistence = new CoordinatePersistence();
  }
  return globalCoordinatePersistence;
}

export function createCoordinatePersistence(
  config?: Partial<CoordinatePersistenceConfig>
): CoordinatePersistence {
  return new CoordinatePersistence(config);
}

export function setCoordinatePersistence(persistence: CoordinatePersistence): void {
  globalCoordinatePersistence = persistence;
}
