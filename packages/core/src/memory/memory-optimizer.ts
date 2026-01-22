/**
 * 内存效率优化器
 * Memory Efficiency Optimizer
 *
 * 提供内存压缩、LRU 缓存、增量更新等优化策略
 */

import { EventEmitter } from 'events';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 缓存项元数据
 */
interface CacheItemMeta<T> {
  key: string;
  value: T;
  size: number;
  accessCount: number;
  lastAccess: number;
  createdAt: number;
  compressed: boolean;
}

/**
 * LRU 缓存配置
 */
export interface LRUCacheConfig {
  maxSize: number;           // 最大项目数
  maxMemory: number;         // 最大内存 (bytes)
  ttl: number;               // 生存时间 (ms)
  enableCompression: boolean;
  compressionThreshold: number; // 超过此大小时压缩 (bytes)
}

/**
 * 增量更新配置
 */
export interface IncrementalConfig {
  maxPatches: number;        // 最大补丁数
  snapshotInterval: number;  // 快照间隔
  enableDiff: boolean;
}

/**
 * 内存池配置
 */
export interface MemoryPoolConfig {
  poolSize: number;
  chunkSize: number;
  preAllocate: boolean;
}

// ============================================================================
// LRU 缓存实现
// ============================================================================

/**
 * 高性能 LRU 缓存
 */
export class LRUCache<T> extends EventEmitter {
  private cache: Map<string, CacheItemMeta<T>> = new Map();
  private config: LRUCacheConfig;
  private currentMemory: number = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<LRUCacheConfig>) {
    super();
    this.config = {
      maxSize: 1000,
      maxMemory: 100 * 1024 * 1024, // 100MB
      ttl: 30 * 60 * 1000, // 30 minutes
      enableCompression: true,
      compressionThreshold: 1024, // 1KB
      ...config,
    };

    // 启动定期清理
    this.startCleanup();
  }

  /**
   * 获取缓存项
   */
  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    // 检查 TTL
    if (Date.now() - item.createdAt > this.config.ttl) {
      this.delete(key);
      return undefined;
    }

    // 更新访问信息
    item.lastAccess = Date.now();
    item.accessCount++;

    // 移动到最新位置（Map 保持插入顺序）
    this.cache.delete(key);
    this.cache.set(key, item);

    return item.compressed ? this.decompress(item.value as unknown as string) as T : item.value;
  }

  /**
   * 设置缓存项
   */
  set(key: string, value: T): void {
    const size = this.estimateSize(value);
    const shouldCompress = this.config.enableCompression && size > this.config.compressionThreshold;

    // 检查是否需要驱逐
    while (
      (this.cache.size >= this.config.maxSize || this.currentMemory + size > this.config.maxMemory) &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }

    const storedValue = shouldCompress ? this.compress(value) as unknown as T : value;
    const storedSize = shouldCompress ? this.estimateSize(storedValue) : size;

    const item: CacheItemMeta<T> = {
      key,
      value: storedValue,
      size: storedSize,
      accessCount: 0,
      lastAccess: Date.now(),
      createdAt: Date.now(),
      compressed: shouldCompress,
    };

    // 如果已存在，先减去旧的大小
    const existing = this.cache.get(key);
    if (existing) {
      this.currentMemory -= existing.size;
    }

    this.cache.set(key, item);
    this.currentMemory += storedSize;

    this.emit('set', key, size);
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;

    this.cache.delete(key);
    this.currentMemory -= item.size;

    this.emit('delete', key);
    return true;
  }

  /**
   * 检查是否存在
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;

    // 检查 TTL
    if (Date.now() - item.createdAt > this.config.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 获取内存使用
   */
  get memoryUsage(): number {
    return this.currentMemory;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.currentMemory = 0;
    this.emit('clear');
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    size: number;
    memoryUsage: number;
    hitCount: number;
    compressionRatio: number;
  } {
    let hitCount = 0;
    let originalSize = 0;
    let compressedSize = 0;

    for (const item of this.cache.values()) {
      hitCount += item.accessCount;
      if (item.compressed) {
        // 估算原始大小
        originalSize += item.size * 2;
        compressedSize += item.size;
      } else {
        originalSize += item.size;
        compressedSize += item.size;
      }
    }

    return {
      size: this.cache.size,
      memoryUsage: this.currentMemory,
      hitCount,
      compressionRatio: originalSize > 0 ? compressedSize / originalSize : 1,
    };
  }

  /**
   * 驱逐最少使用的项
   */
  private evictLRU(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.delete(firstKey);
      this.emit('evict', firstKey);
    }
  }

  /**
   * 估算大小
   */
  private estimateSize(value: unknown): number {
    if (typeof value === 'string') {
      return value.length * 2;
    } else if (typeof value === 'number') {
      return 8;
    } else if (typeof value === 'boolean') {
      return 4;
    } else if (value === null || value === undefined) {
      return 0;
    } else if (Array.isArray(value)) {
      return value.reduce((sum, item) => sum + this.estimateSize(item), 0);
    } else if (typeof value === 'object') {
      return JSON.stringify(value).length * 2;
    }
    return 0;
  }

  /**
   * 压缩数据
   */
  private compress(value: T): string {
    const json = JSON.stringify(value);
    // 简单的 Base64 编码（实际应使用 zlib）
    return Buffer.from(json).toString('base64');
  }

  /**
   * 解压数据
   */
  private decompress(compressed: string): T {
    const json = Buffer.from(compressed, 'base64').toString('utf-8');
    return JSON.parse(json);
  }

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60000); // 每分钟清理
  }

  /**
   * 清理过期项
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, item] of this.cache) {
      if (now - item.createdAt > this.config.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.delete(key);
    }

    if (keysToDelete.length > 0) {
      this.emit('cleanup', keysToDelete.length);
    }
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
    this.removeAllListeners();
  }
}

// ============================================================================
// 增量更新管理器
// ============================================================================

/**
 * JSON 补丁操作
 */
interface JsonPatch {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy';
  path: string;
  value?: unknown;
  from?: string;
}

/**
 * 增量快照
 */
interface IncrementalSnapshot<T> {
  id: string;
  timestamp: number;
  isFullSnapshot: boolean;
  data?: T;
  patches?: JsonPatch[];
  parentId?: string;
}

/**
 * 增量更新管理器
 */
export class IncrementalUpdateManager<T extends object> extends EventEmitter {
  private snapshots: IncrementalSnapshot<T>[] = [];
  private currentState: T | null = null;
  private config: IncrementalConfig;
  private patchesSinceLastSnapshot: number = 0;

  constructor(config?: Partial<IncrementalConfig>) {
    super();
    this.config = {
      maxPatches: 100,
      snapshotInterval: 10, // 每 10 次更新创建完整快照
      enableDiff: true,
      ...config,
    };
  }

  /**
   * 初始化状态
   */
  initialize(initialState: T): void {
    this.currentState = this.deepClone(initialState);
    this.createSnapshot(initialState, true);
  }

  /**
   * 应用更新
   */
  update(newState: T): JsonPatch[] {
    if (!this.currentState) {
      this.initialize(newState);
      return [];
    }

    // 计算差异
    const patches = this.config.enableDiff
      ? this.computeDiff(this.currentState, newState)
      : [{ op: 'replace' as const, path: '/', value: newState }];

    // 应用补丁
    this.currentState = this.deepClone(newState);
    this.patchesSinceLastSnapshot += patches.length;

    // 决定是否创建完整快照
    if (this.patchesSinceLastSnapshot >= this.config.snapshotInterval) {
      this.createSnapshot(newState, true);
      this.patchesSinceLastSnapshot = 0;
    } else {
      this.createSnapshot(newState, false, patches);
    }

    this.emit('update', patches);
    return patches;
  }

  /**
   * 获取当前状态
   */
  getState(): T | null {
    return this.currentState ? this.deepClone(this.currentState) : null;
  }

  /**
   * 恢复到指定快照
   */
  restoreTo(snapshotId: string): T | null {
    const targetIndex = this.snapshots.findIndex(s => s.id === snapshotId);
    if (targetIndex === -1) return null;

    // 找到最近的完整快照
    let fullSnapshotIndex = targetIndex;
    while (fullSnapshotIndex >= 0 && !this.snapshots[fullSnapshotIndex].isFullSnapshot) {
      fullSnapshotIndex--;
    }

    if (fullSnapshotIndex < 0) return null;

    // 从完整快照开始重建
    let state = this.deepClone(this.snapshots[fullSnapshotIndex].data!);

    // 应用增量补丁
    for (let i = fullSnapshotIndex + 1; i <= targetIndex; i++) {
      const snapshot = this.snapshots[i];
      if (snapshot.patches) {
        state = this.applyPatches(state, snapshot.patches);
      }
    }

    this.currentState = state;
    this.emit('restore', snapshotId);
    return state;
  }

  /**
   * 获取快照历史
   */
  getHistory(): Array<{ id: string; timestamp: number; isFullSnapshot: boolean }> {
    return this.snapshots.map(s => ({
      id: s.id,
      timestamp: s.timestamp,
      isFullSnapshot: s.isFullSnapshot,
    }));
  }

  /**
   * 压缩历史
   */
  compactHistory(): void {
    if (this.snapshots.length < this.config.maxPatches) return;

    // 保留最后一个完整快照和之后的增量
    let lastFullIndex = this.snapshots.length - 1;
    while (lastFullIndex > 0 && !this.snapshots[lastFullIndex].isFullSnapshot) {
      lastFullIndex--;
    }

    // 创建新的完整快照
    if (this.currentState && lastFullIndex < this.snapshots.length - 1) {
      this.createSnapshot(this.currentState, true);
    }

    // 删除旧快照
    const keepCount = Math.min(this.config.maxPatches, 20);
    if (this.snapshots.length > keepCount) {
      this.snapshots = this.snapshots.slice(-keepCount);
    }

    this.emit('compact', this.snapshots.length);
  }

  /**
   * 创建快照
   */
  private createSnapshot(state: T, isFull: boolean, patches?: JsonPatch[]): void {
    const parentId = this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1].id
      : undefined;

    const snapshot: IncrementalSnapshot<T> = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      isFullSnapshot: isFull,
      data: isFull ? this.deepClone(state) : undefined,
      patches: isFull ? undefined : patches,
      parentId,
    };

    this.snapshots.push(snapshot);

    // 限制快照数量
    if (this.snapshots.length > this.config.maxPatches * 2) {
      this.compactHistory();
    }
  }

  /**
   * 计算差异
   */
  private computeDiff(oldState: T, newState: T): JsonPatch[] {
    const patches: JsonPatch[] = [];
    this.diffObjects(oldState, newState, '', patches);
    return patches;
  }

  /**
   * 递归比较对象
   */
  private diffObjects(
    oldObj: unknown,
    newObj: unknown,
    path: string,
    patches: JsonPatch[]
  ): void {
    // 类型不同
    if (typeof oldObj !== typeof newObj) {
      patches.push({ op: 'replace', path, value: newObj });
      return;
    }

    // null 检查
    if (oldObj === null || newObj === null) {
      if (oldObj !== newObj) {
        patches.push({ op: 'replace', path, value: newObj });
      }
      return;
    }

    // 数组
    if (Array.isArray(oldObj) && Array.isArray(newObj)) {
      this.diffArrays(oldObj, newObj, path, patches);
      return;
    }

    // 对象
    if (typeof oldObj === 'object' && typeof newObj === 'object') {
      const oldKeys = new Set(Object.keys(oldObj as object));
      const newKeys = new Set(Object.keys(newObj as object));

      // 删除的键
      for (const key of oldKeys) {
        if (!newKeys.has(key)) {
          patches.push({ op: 'remove', path: `${path}/${key}` });
        }
      }

      // 新增的键
      for (const key of newKeys) {
        if (!oldKeys.has(key)) {
          patches.push({ op: 'add', path: `${path}/${key}`, value: (newObj as Record<string, unknown>)[key] });
        }
      }

      // 修改的键
      for (const key of oldKeys) {
        if (newKeys.has(key)) {
          this.diffObjects(
            (oldObj as Record<string, unknown>)[key],
            (newObj as Record<string, unknown>)[key],
            `${path}/${key}`,
            patches
          );
        }
      }
      return;
    }

    // 原始值
    if (oldObj !== newObj) {
      patches.push({ op: 'replace', path, value: newObj });
    }
  }

  /**
   * 比较数组
   */
  private diffArrays(oldArr: unknown[], newArr: unknown[], path: string, patches: JsonPatch[]): void {
    const maxLen = Math.max(oldArr.length, newArr.length);

    for (let i = 0; i < maxLen; i++) {
      const itemPath = `${path}/${i}`;

      if (i >= oldArr.length) {
        patches.push({ op: 'add', path: itemPath, value: newArr[i] });
      } else if (i >= newArr.length) {
        patches.push({ op: 'remove', path: itemPath });
      } else {
        this.diffObjects(oldArr[i], newArr[i], itemPath, patches);
      }
    }
  }

  /**
   * 应用补丁
   */
  private applyPatches(state: T, patches: JsonPatch[]): T {
    let result = this.deepClone(state);

    for (const patch of patches) {
      result = this.applyPatch(result, patch);
    }

    return result;
  }

  /**
   * 应用单个补丁
   */
  private applyPatch(state: T, patch: JsonPatch): T {
    const pathParts = patch.path.split('/').filter(Boolean);

    if (pathParts.length === 0 && patch.op === 'replace') {
      return patch.value as T;
    }

    const result = this.deepClone(state);
    let current: unknown = result;
    const lastKey = pathParts.pop()!;

    for (const key of pathParts) {
      current = (current as Record<string, unknown>)[key];
    }

    switch (patch.op) {
      case 'add':
      case 'replace':
        (current as Record<string, unknown>)[lastKey] = patch.value;
        break;
      case 'remove':
        delete (current as Record<string, unknown>)[lastKey];
        break;
    }

    return result;
  }

  /**
   * 深拷贝
   */
  private deepClone<U>(obj: U): U {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.snapshots = [];
    this.currentState = null;
    this.removeAllListeners();
  }
}

// ============================================================================
// 内存池
// ============================================================================

/**
 * 内存池 - 减少频繁分配/释放
 */
export class MemoryPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (item: T) => void;
  private config: MemoryPoolConfig;

  constructor(
    factory: () => T,
    reset: (item: T) => void,
    config?: Partial<MemoryPoolConfig>
  ) {
    this.factory = factory;
    this.reset = reset;
    this.config = {
      poolSize: 100,
      chunkSize: 10,
      preAllocate: true,
      ...config,
    };

    if (this.config.preAllocate) {
      this.preAllocate();
    }
  }

  /**
   * 预分配
   */
  private preAllocate(): void {
    for (let i = 0; i < this.config.chunkSize; i++) {
      this.pool.push(this.factory());
    }
  }

  /**
   * 获取对象
   */
  acquire(): T {
    if (this.pool.length === 0) {
      // 批量分配
      for (let i = 0; i < this.config.chunkSize; i++) {
        this.pool.push(this.factory());
      }
    }
    return this.pool.pop()!;
  }

  /**
   * 归还对象
   */
  release(item: T): void {
    if (this.pool.length < this.config.poolSize) {
      this.reset(item);
      this.pool.push(item);
    }
    // 否则让 GC 回收
  }

  /**
   * 获取池大小
   */
  get size(): number {
    return this.pool.length;
  }

  /**
   * 清空池
   */
  clear(): void {
    this.pool = [];
  }
}

// ============================================================================
// 内存压力监控
// ============================================================================

/**
 * 内存压力级别
 */
export enum MemoryPressureLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 内存压力监控器
 */
export class MemoryPressureMonitor extends EventEmitter {
  private checkInterval: NodeJS.Timeout | null = null;
  private lastLevel: MemoryPressureLevel = MemoryPressureLevel.LOW;
  private thresholds: {
    medium: number;
    high: number;
    critical: number;
  };

  constructor(thresholds?: { medium?: number; high?: number; critical?: number }) {
    super();
    this.thresholds = {
      medium: thresholds?.medium ?? 0.5,
      high: thresholds?.high ?? 0.7,
      critical: thresholds?.critical ?? 0.9,
    };
  }

  /**
   * 开始监控
   */
  start(intervalMs: number = 5000): void {
    this.checkInterval = setInterval(() => {
      this.check();
    }, intervalMs);
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * 检查内存压力
   */
  check(): MemoryPressureLevel {
    const usage = process.memoryUsage();
    const heapUsed = usage.heapUsed;
    const heapTotal = usage.heapTotal;
    const ratio = heapUsed / heapTotal;

    let level: MemoryPressureLevel;
    if (ratio >= this.thresholds.critical) {
      level = MemoryPressureLevel.CRITICAL;
    } else if (ratio >= this.thresholds.high) {
      level = MemoryPressureLevel.HIGH;
    } else if (ratio >= this.thresholds.medium) {
      level = MemoryPressureLevel.MEDIUM;
    } else {
      level = MemoryPressureLevel.LOW;
    }

    if (level !== this.lastLevel) {
      this.emit('change', level, this.lastLevel, ratio);
      this.lastLevel = level;
    }

    if (level === MemoryPressureLevel.CRITICAL) {
      this.emit('critical', ratio);
    }

    return level;
  }

  /**
   * 获取当前级别
   */
  getCurrentLevel(): MemoryPressureLevel {
    return this.lastLevel;
  }

  /**
   * 获取内存使用情况
   */
  getMemoryUsage(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    ratio: number;
  } {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      ratio: usage.heapUsed / usage.heapTotal,
    };
  }
}

// ============================================================================
// 导出
// ============================================================================

export {
  CacheItemMeta,
  JsonPatch,
  IncrementalSnapshot,
};
