/**
 * MemuStore - 记忆状态管理
 * 基于 memu-cowork 的记忆状态管理模式
 *
 * 功能：
 * - 记忆项的 CRUD 操作
 * - 类别管理
 * - 搜索状态追踪
 * - 记忆统计
 */

import { existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type {
  MemoryItem,
  MemoryCategory,
  MemoryResource,
  MemoryType,
} from '../vector-memory/types';

// ============ 类型定义 ============

/**
 * 记忆视图模式
 */
export type MemoryViewMode = 'list' | 'graph' | 'timeline' | 'category';

/**
 * 记忆排序方式
 */
export type MemorySortBy =
  | 'updatedAt'
  | 'createdAt'
  | 'importance'
  | 'accessCount';

/**
 * 记忆过滤条件
 */
export interface MemoryFilter {
  categoryId?: string;
  resourceId?: string;
  memoryType?: MemoryType;
  searchQuery?: string;
  dateRange?: {
    start: number;
    end: number;
  };
  minImportance?: number;
}

/**
 * 搜索状态
 */
export interface SearchState {
  query: string;
  results: MemoryItem[];
  isSearching: boolean;
  lastSearchAt: number | null;
  totalResults: number;
}

/**
 * 记忆统计
 */
export interface MemoryStats {
  totalItems: number;
  totalCategories: number;
  totalResources: number;
  itemsByType: Record<MemoryType, number>;
  itemsByCategory: Record<string, number>;
  recentlyAdded: number; // 过去24小时
  recentlyAccessed: number; // 过去24小时
}

/**
 * 记忆操作历史
 */
export interface MemoryAction {
  id: string;
  type: 'create' | 'update' | 'delete' | 'merge' | 'link';
  targetId: string;
  targetType: 'item' | 'category' | 'resource';
  timestamp: number;
  /** 操作后的数据 (用于 redo) */
  data?: unknown;
  /** 操作前的数据 (用于 undo) */
  previousData?: unknown;
  undoable: boolean;
}

/**
 * 完整的 Memu 状态
 */
export interface MemuState {
  // 数据
  items: Map<string, MemoryItem>;
  categories: Map<string, MemoryCategory>;
  resources: Map<string, MemoryResource>;

  // UI 状态
  viewMode: MemoryViewMode;
  sortBy: MemorySortBy;
  sortDesc: boolean;
  filter: MemoryFilter;
  selectedIds: Set<string>;
  expandedCategoryIds: Set<string>;

  // 搜索状态
  search: SearchState;

  // 操作历史
  history: MemoryAction[];
  historyIndex: number;

  // 元数据
  lastSyncAt: number | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * 状态更新器类型
 */
export type StateUpdater = (state: MemuState) => Partial<MemuState>;

// ============ 输入验证 ============

const MAX_SUMMARY_LENGTH = 10000;
const MAX_ID_LENGTH = 100;

function validateId(id: string, fieldName = 'ID'): void {
  if (!id || typeof id !== 'string') {
    throw new Error(`${fieldName} is required and must be a string`);
  }
  if (id.length > MAX_ID_LENGTH) {
    throw new Error(`${fieldName} exceeds maximum length of ${MAX_ID_LENGTH}`);
  }
}

function validateMemoryItem(item: MemoryItem): void {
  validateId(item.id);
  if (!item.summary || typeof item.summary !== 'string') {
    throw new Error('Memory item summary is required');
  }
  if (item.summary.length > MAX_SUMMARY_LENGTH) {
    throw new Error(`Summary exceeds maximum length of ${MAX_SUMMARY_LENGTH}`);
  }
}

// ============ Debounce 辅助函数 ============

function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): T & { cancel: () => void; flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    lastArgs = args;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      if (lastArgs) {
        fn(...lastArgs);
        lastArgs = null;
      }
      timeoutId = null;
    }, delay);
  }) as T & { cancel: () => void; flush: () => void };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
      lastArgs = null;
    }
  };

  debounced.flush = () => {
    if (timeoutId && lastArgs) {
      clearTimeout(timeoutId);
      fn(...lastArgs);
      timeoutId = null;
      lastArgs = null;
    }
  };

  return debounced;
}

// ============ MemuStore 类 ============

/** 默认 debounce 延迟 (毫秒) */
const DEFAULT_SAVE_DELAY = 500;

export class MemuStore {
  private basePath: string;
  private statePath: string;

  // 状态
  private state: MemuState;

  // 监听器
  private listeners: Set<(state: MemuState) => void> = new Set();

  // 写入队列
  private writePromise: Promise<void> = Promise.resolve();

  // Debounced save function
  private debouncedSave: ReturnType<typeof debounce>;

  constructor(basePath: string, saveDelay = DEFAULT_SAVE_DELAY) {
    this.basePath = basePath;
    this.statePath = join(basePath, 'memu', 'state.json');

    // 初始状态
    this.state = this.createInitialState();

    // 创建 debounced save 函数
    this.debouncedSave = debounce(() => {
      this.saveState().catch((err) =>
        console.error('[MemuStore] Save state failed:', err)
      );
    }, saveDelay);
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    const memuDir = join(this.basePath, 'memu');

    if (!existsSync(memuDir)) {
      mkdirSync(memuDir, { recursive: true });
    }

    await this.loadState();
  }

  /**
   * 获取当前状态
   */
  getState(): MemuState {
    return this.state;
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: (state: MemuState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 更新状态
   */
  setState(updater: StateUpdater | Partial<MemuState>): void {
    const updates =
      typeof updater === 'function' ? updater(this.state) : updater;

    this.state = { ...this.state, ...updates };
    this.notifyListeners();
    this.saveStateAsync();
  }

  // --- 记忆项操作 ---

  /**
   * 添加记忆项
   */
  addItem(item: MemoryItem): void {
    // 输入验证
    validateMemoryItem(item);

    // 检查是否已存在
    if (this.state.items.has(item.id)) {
      throw new Error(`Memory item already exists: ${item.id}`);
    }

    const newItems = new Map(this.state.items);
    newItems.set(item.id, item);

    this.setState({
      items: newItems,
    });

    this.addToHistory({
      type: 'create',
      targetId: item.id,
      targetType: 'item',
      data: item,
      previousData: null,
      undoable: true,
    });
  }

  /**
   * 批量添加记忆项
   */
  addItems(items: MemoryItem[]): void {
    if (!Array.isArray(items)) {
      throw new Error('Items must be an array');
    }

    const newItems = new Map(this.state.items);
    for (const item of items) {
      validateMemoryItem(item);
      newItems.set(item.id, item);
    }

    this.setState({ items: newItems });
  }

  /**
   * 更新记忆项
   */
  updateItem(id: string, updates: Partial<MemoryItem>): void {
    validateId(id);

    const item = this.state.items.get(id);
    if (!item) return;

    // 验证更新内容
    if (updates.summary !== undefined) {
      if (typeof updates.summary !== 'string') {
        throw new Error('Summary must be a string');
      }
      if (updates.summary.length > MAX_SUMMARY_LENGTH) {
        throw new Error(`Summary exceeds maximum length of ${MAX_SUMMARY_LENGTH}`);
      }
    }

    // 保存原始数据用于撤销
    const previousItem = { ...item };

    const newItems = new Map(this.state.items);
    const updatedItem = {
      ...item,
      ...updates,
      updatedAt: Date.now(),
    };
    newItems.set(id, updatedItem);

    this.setState({ items: newItems });

    this.addToHistory({
      type: 'update',
      targetId: id,
      targetType: 'item',
      data: updatedItem,
      previousData: previousItem,
      undoable: true,
    });
  }

  /**
   * 删除记忆项
   */
  deleteItem(id: string): void {
    validateId(id);

    const item = this.state.items.get(id);
    if (!item) return;

    const newItems = new Map(this.state.items);
    newItems.delete(id);

    const newSelectedIds = new Set(this.state.selectedIds);
    newSelectedIds.delete(id);

    this.setState({
      items: newItems,
      selectedIds: newSelectedIds,
    });

    this.addToHistory({
      type: 'delete',
      targetId: id,
      targetType: 'item',
      data: null,
      previousData: item,
      undoable: true,
    });
  }

  /**
   * 获取记忆项
   */
  getItem(id: string): MemoryItem | undefined {
    return this.state.items.get(id);
  }

  /**
   * 获取所有记忆项
   */
  getAllItems(): MemoryItem[] {
    return Array.from(this.state.items.values());
  }

  /**
   * 获取过滤后的记忆项
   */
  getFilteredItems(): MemoryItem[] {
    let items = this.getAllItems();
    const filter = this.state.filter;

    // 按类别过滤
    if (filter.categoryId) {
      items = items.filter((item) => item.categoryId === filter.categoryId);
    }

    // 按资源过滤
    if (filter.resourceId) {
      items = items.filter((item) => item.resourceId === filter.resourceId);
    }

    // 按类型过滤
    if (filter.memoryType) {
      items = items.filter((item) => item.memoryType === filter.memoryType);
    }

    // 按日期范围过滤
    if (filter.dateRange) {
      items = items.filter(
        (item) =>
          item.createdAt >= filter.dateRange!.start &&
          item.createdAt <= filter.dateRange!.end
      );
    }

    // 按重要性过滤
    if (filter.minImportance !== undefined) {
      items = items.filter(
        (item) => (item.importance ?? 0) >= filter.minImportance!
      );
    }

    // 排序
    items.sort((a, b) => {
      let aVal: number, bVal: number;

      switch (this.state.sortBy) {
        case 'createdAt':
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        case 'importance':
          aVal = a.importance ?? 0;
          bVal = b.importance ?? 0;
          break;
        case 'accessCount':
          aVal = a.accessCount ?? 0;
          bVal = b.accessCount ?? 0;
          break;
        case 'updatedAt':
        default:
          aVal = a.updatedAt;
          bVal = b.updatedAt;
      }

      return this.state.sortDesc ? bVal - aVal : aVal - bVal;
    });

    return items;
  }

  // --- 类别操作 ---

  /**
   * 添加类别
   */
  addCategory(category: MemoryCategory): void {
    const newCategories = new Map(this.state.categories);
    newCategories.set(category.id, category);
    this.setState({ categories: newCategories });
  }

  /**
   * 更新类别
   */
  updateCategory(id: string, updates: Partial<MemoryCategory>): void {
    const category = this.state.categories.get(id);
    if (!category) return;

    const newCategories = new Map(this.state.categories);
    newCategories.set(id, {
      ...category,
      ...updates,
      updatedAt: Date.now(),
    });
    this.setState({ categories: newCategories });
  }

  /**
   * 删除类别
   */
  deleteCategory(id: string): void {
    const newCategories = new Map(this.state.categories);
    newCategories.delete(id);
    this.setState({ categories: newCategories });
  }

  /**
   * 获取所有类别
   */
  getAllCategories(): MemoryCategory[] {
    return Array.from(this.state.categories.values());
  }

  // --- 资源操作 ---

  /**
   * 添加资源
   */
  addResource(resource: MemoryResource): void {
    const newResources = new Map(this.state.resources);
    newResources.set(resource.id, resource);
    this.setState({ resources: newResources });
  }

  /**
   * 获取所有资源
   */
  getAllResources(): MemoryResource[] {
    return Array.from(this.state.resources.values());
  }

  // --- UI 状态 ---

  /**
   * 设置视图模式
   */
  setViewMode(mode: MemoryViewMode): void {
    this.setState({ viewMode: mode });
  }

  /**
   * 设置排序
   */
  setSorting(sortBy: MemorySortBy, sortDesc?: boolean): void {
    this.setState({
      sortBy,
      sortDesc: sortDesc ?? this.state.sortDesc,
    });
  }

  /**
   * 设置过滤条件
   */
  setFilter(filter: Partial<MemoryFilter>): void {
    this.setState({
      filter: { ...this.state.filter, ...filter },
    });
  }

  /**
   * 清除过滤条件
   */
  clearFilter(): void {
    this.setState({ filter: {} });
  }

  /**
   * 选择记忆项
   */
  selectItem(id: string, multi = false): void {
    const newSelectedIds = multi
      ? new Set(this.state.selectedIds)
      : new Set<string>();

    if (newSelectedIds.has(id)) {
      newSelectedIds.delete(id);
    } else {
      newSelectedIds.add(id);
    }

    this.setState({ selectedIds: newSelectedIds });
  }

  /**
   * 全选/取消全选
   */
  selectAll(select = true): void {
    if (select) {
      const ids = new Set(this.getFilteredItems().map((item) => item.id));
      this.setState({ selectedIds: ids });
    } else {
      this.setState({ selectedIds: new Set() });
    }
  }

  /**
   * 展开/折叠类别
   */
  toggleCategoryExpanded(categoryId: string): void {
    const newExpandedIds = new Set(this.state.expandedCategoryIds);
    if (newExpandedIds.has(categoryId)) {
      newExpandedIds.delete(categoryId);
    } else {
      newExpandedIds.add(categoryId);
    }
    this.setState({ expandedCategoryIds: newExpandedIds });
  }

  // --- 搜索 ---

  /**
   * 设置搜索状态
   */
  setSearchState(updates: Partial<SearchState>): void {
    this.setState({
      search: { ...this.state.search, ...updates },
    });
  }

  /**
   * 开始搜索
   */
  startSearch(query: string): void {
    this.setSearchState({
      query,
      isSearching: true,
      results: [],
    });
  }

  /**
   * 完成搜索
   */
  finishSearch(results: MemoryItem[]): void {
    this.setSearchState({
      results,
      isSearching: false,
      lastSearchAt: Date.now(),
      totalResults: results.length,
    });
  }

  /**
   * 清除搜索
   */
  clearSearch(): void {
    this.setSearchState({
      query: '',
      results: [],
      isSearching: false,
      totalResults: 0,
    });
  }

  // --- 统计 ---

  /**
   * 获取记忆统计
   */
  getStats(): MemoryStats {
    const items = this.getAllItems();
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const itemsByType: Record<string, number> = {};
    const itemsByCategory: Record<string, number> = {};
    let recentlyAdded = 0;
    let recentlyAccessed = 0;

    for (const item of items) {
      // 按类型统计
      const type = item.memoryType || 'unknown';
      itemsByType[type] = (itemsByType[type] || 0) + 1;

      // 按类别统计
      if (item.categoryId) {
        itemsByCategory[item.categoryId] =
          (itemsByCategory[item.categoryId] || 0) + 1;
      }

      // 最近添加
      if (item.createdAt >= dayAgo) {
        recentlyAdded++;
      }

      // 最近访问
      if (item.lastAccessedAt && item.lastAccessedAt >= dayAgo) {
        recentlyAccessed++;
      }
    }

    return {
      totalItems: items.length,
      totalCategories: this.state.categories.size,
      totalResources: this.state.resources.size,
      itemsByType: itemsByType as Record<MemoryType, number>,
      itemsByCategory,
      recentlyAdded,
      recentlyAccessed,
    };
  }

  // --- 历史操作 ---

  /**
   * 撤销
   */
  undo(): boolean {
    if (this.state.historyIndex <= 0) return false;

    const action = this.state.history[this.state.historyIndex - 1];
    if (!action?.undoable) return false;

    // 执行撤销
    this.executeUndo(action);
    this.setState({ historyIndex: this.state.historyIndex - 1 });

    return true;
  }

  /**
   * 重做
   */
  redo(): boolean {
    if (this.state.historyIndex >= this.state.history.length) return false;

    const action = this.state.history[this.state.historyIndex];
    if (!action) return false;

    // 执行重做
    this.executeRedo(action);
    this.setState({ historyIndex: this.state.historyIndex + 1 });

    return true;
  }

  // --- 私有方法 ---

  private createInitialState(): MemuState {
    return {
      items: new Map(),
      categories: new Map(),
      resources: new Map(),
      viewMode: 'list',
      sortBy: 'updatedAt',
      sortDesc: true,
      filter: {},
      selectedIds: new Set(),
      expandedCategoryIds: new Set(),
      search: {
        query: '',
        results: [],
        isSearching: false,
        lastSearchAt: null,
        totalResults: 0,
      },
      history: [],
      historyIndex: 0,
      lastSyncAt: null,
      isLoading: false,
      error: null,
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[MemuStore] Listener error:', err);
      }
    }
  }

  private addToHistory(
    action: Omit<MemoryAction, 'id' | 'timestamp'>
  ): void {
    const fullAction: MemoryAction = {
      ...action,
      id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    // 截断历史到当前位置
    const history = this.state.history.slice(0, this.state.historyIndex);
    history.push(fullAction);

    // 限制历史长度
    const maxHistory = 100;
    if (history.length > maxHistory) {
      history.splice(0, history.length - maxHistory);
    }

    this.setState({
      history,
      historyIndex: history.length,
    });
  }

  private executeUndo(action: MemoryAction): void {
    switch (action.type) {
      case 'create':
        // 撤销创建 = 删除
        if (action.targetType === 'item') {
          const newItems = new Map(this.state.items);
          newItems.delete(action.targetId);
          this.state = { ...this.state, items: newItems };
        } else if (action.targetType === 'category') {
          const newCategories = new Map(this.state.categories);
          newCategories.delete(action.targetId);
          this.state = { ...this.state, categories: newCategories };
        } else if (action.targetType === 'resource') {
          const newResources = new Map(this.state.resources);
          newResources.delete(action.targetId);
          this.state = { ...this.state, resources: newResources };
        }
        break;

      case 'delete':
        // 撤销删除 = 恢复 (使用 previousData)
        if (action.targetType === 'item' && action.previousData) {
          const newItems = new Map(this.state.items);
          newItems.set(action.targetId, action.previousData as MemoryItem);
          this.state = { ...this.state, items: newItems };
        } else if (action.targetType === 'category' && action.previousData) {
          const newCategories = new Map(this.state.categories);
          newCategories.set(action.targetId, action.previousData as MemoryCategory);
          this.state = { ...this.state, categories: newCategories };
        } else if (action.targetType === 'resource' && action.previousData) {
          const newResources = new Map(this.state.resources);
          newResources.set(action.targetId, action.previousData as MemoryResource);
          this.state = { ...this.state, resources: newResources };
        }
        break;

      case 'update':
        // 撤销更新 = 恢复原始值 (使用 previousData)
        if (action.targetType === 'item' && action.previousData) {
          const newItems = new Map(this.state.items);
          newItems.set(action.targetId, action.previousData as MemoryItem);
          this.state = { ...this.state, items: newItems };
        } else if (action.targetType === 'category' && action.previousData) {
          const newCategories = new Map(this.state.categories);
          newCategories.set(action.targetId, action.previousData as MemoryCategory);
          this.state = { ...this.state, categories: newCategories };
        }
        break;
    }

    this.notifyListeners();
    this.debouncedSave();
  }

  private executeRedo(action: MemoryAction): void {
    switch (action.type) {
      case 'create':
        // 重做创建 = 添加 (使用 data)
        if (action.targetType === 'item' && action.data) {
          const newItems = new Map(this.state.items);
          newItems.set(action.targetId, action.data as MemoryItem);
          this.state = { ...this.state, items: newItems };
        } else if (action.targetType === 'category' && action.data) {
          const newCategories = new Map(this.state.categories);
          newCategories.set(action.targetId, action.data as MemoryCategory);
          this.state = { ...this.state, categories: newCategories };
        } else if (action.targetType === 'resource' && action.data) {
          const newResources = new Map(this.state.resources);
          newResources.set(action.targetId, action.data as MemoryResource);
          this.state = { ...this.state, resources: newResources };
        }
        break;

      case 'delete':
        // 重做删除 = 删除
        if (action.targetType === 'item') {
          const newItems = new Map(this.state.items);
          newItems.delete(action.targetId);
          this.state = { ...this.state, items: newItems };
        } else if (action.targetType === 'category') {
          const newCategories = new Map(this.state.categories);
          newCategories.delete(action.targetId);
          this.state = { ...this.state, categories: newCategories };
        } else if (action.targetType === 'resource') {
          const newResources = new Map(this.state.resources);
          newResources.delete(action.targetId);
          this.state = { ...this.state, resources: newResources };
        }
        break;

      case 'update':
        // 重做更新 = 应用新值 (使用 data)
        if (action.targetType === 'item' && action.data) {
          const newItems = new Map(this.state.items);
          newItems.set(action.targetId, action.data as MemoryItem);
          this.state = { ...this.state, items: newItems };
        } else if (action.targetType === 'category' && action.data) {
          const newCategories = new Map(this.state.categories);
          newCategories.set(action.targetId, action.data as MemoryCategory);
          this.state = { ...this.state, categories: newCategories };
        }
        break;
    }

    this.notifyListeners();
    this.debouncedSave();
  }

  private async loadState(): Promise<void> {
    if (!existsSync(this.statePath)) {
      return;
    }

    try {
      const content = await readFile(this.statePath, 'utf-8');
      const saved = JSON.parse(content);

      // 恢复 Map 结构
      this.state = {
        ...this.createInitialState(),
        items: new Map(Object.entries(saved.items || {})),
        categories: new Map(Object.entries(saved.categories || {})),
        resources: new Map(Object.entries(saved.resources || {})),
        viewMode: saved.viewMode || 'list',
        sortBy: saved.sortBy || 'updatedAt',
        sortDesc: saved.sortDesc ?? true,
        lastSyncAt: saved.lastSyncAt,
      };
    } catch (err) {
      console.error('[MemuStore] Failed to load state:', err);
    }
  }

  private async saveState(): Promise<void> {
    await this.atomicWrite(this.statePath, async () => {
      // 转换 Map 为普通对象以便序列化
      const toSave = {
        items: Object.fromEntries(this.state.items),
        categories: Object.fromEntries(this.state.categories),
        resources: Object.fromEntries(this.state.resources),
        viewMode: this.state.viewMode,
        sortBy: this.state.sortBy,
        sortDesc: this.state.sortDesc,
        lastSyncAt: Date.now(),
      };
      return JSON.stringify(toSave, null, 2);
    });
  }

  private saveStateAsync(): void {
    // 使用 debounced save 来减少磁盘 I/O
    this.debouncedSave();
  }

  /**
   * 强制立即保存 (不等待 debounce)
   */
  async flush(): Promise<void> {
    this.debouncedSave.cancel();
    await this.saveState();
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    // 取消待处理的 debounced save
    this.debouncedSave.cancel();

    // 等待当前写入完成
    await this.writePromise.catch(() => {});

    // 清理监听器
    this.listeners.clear();
  }

  private async atomicWrite(
    filePath: string,
    getData: () => Promise<string>
  ): Promise<void> {
    const doWrite = async (): Promise<void> => {
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      try {
        const data = await getData();
        await writeFile(tempPath, data);
        renameSync(tempPath, filePath);
      } catch (err) {
        try {
          if (existsSync(tempPath)) {
            unlinkSync(tempPath);
          }
        } catch {
          // ignore
        }
        throw err;
      }
    };

    this.writePromise = this.writePromise.catch(() => {}).then(doWrite);
    return this.writePromise;
  }
}

// ============ 单例实例 ============

let memuStoreInstance: MemuStore | null = null;

/**
 * 获取 MemuStore 实例
 */
export function getMemuStore(): MemuStore | null {
  return memuStoreInstance;
}

/**
 * 设置 MemuStore 实例
 */
export function setMemuStore(store: MemuStore): void {
  memuStoreInstance = store;
}

/**
 * 创建并初始化 MemuStore
 */
export async function createMemuStore(basePath: string): Promise<MemuStore> {
  const store = new MemuStore(basePath);
  await store.initialize();
  memuStoreInstance = store;
  return store;
}
