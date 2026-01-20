/**
 * 文件监控器
 * 监控文件系统变化，追踪文件移动、创建、删除等事件
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface FileWatcherConfig {
  /** 监控的路径列表 */
  paths: string[];
  /** 是否递归监控子目录 */
  recursive?: boolean;
  /** 忽略的文件模式 */
  ignored?: (string | RegExp)[];
  /** 防抖延迟 (ms) */
  debounceDelay?: number;
}

export interface FileEvent {
  type: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  oldPath?: string; // 重命名时的旧路径
  timestamp: number;
  isDirectory: boolean;
}

export class FileWatcher extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private config: Required<FileWatcherConfig>;
  private recentEvents: Map<string, NodeJS.Timeout> = new Map();
  private fileCache: Map<string, { mtime: number; size: number }> = new Map();

  constructor(config: FileWatcherConfig) {
    super();
    this.config = {
      recursive: true,
      ignored: [/node_modules/, /\.git/, /\.DS_Store/],
      debounceDelay: 100,
      ...config,
    };
  }

  /**
   * 开始监控
   */
  start(): void {
    for (const watchPath of this.config.paths) {
      this.watchPath(watchPath);
    }
    this.emit('started');
  }

  /**
   * 停止监控
   */
  stop(): void {
    for (const [, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
    this.recentEvents.clear();
    this.emit('stopped');
  }

  /**
   * 添加监控路径
   */
  addPath(watchPath: string): void {
    if (!this.watchers.has(watchPath)) {
      this.watchPath(watchPath);
    }
  }

  /**
   * 移除监控路径
   */
  removePath(watchPath: string): void {
    const watcher = this.watchers.get(watchPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(watchPath);
    }
  }

  /**
   * 获取当前监控的路径
   */
  getWatchedPaths(): string[] {
    return Array.from(this.watchers.keys());
  }

  private watchPath(watchPath: string): void {
    const resolvedPath = path.resolve(watchPath.replace('~', process.env.HOME || ''));

    try {
      const watcher = fs.watch(
        resolvedPath,
        { recursive: this.config.recursive },
        (eventType, filename) => {
          if (!filename) return;

          const fullPath = path.join(resolvedPath, filename);

          if (this.shouldIgnore(fullPath)) return;

          // 防抖处理
          this.debounceEvent(fullPath, () => {
            this.handleEvent(eventType, fullPath);
          });
        }
      );

      watcher.on('error', (error) => {
        this.emit('error', error);
      });

      this.watchers.set(resolvedPath, watcher);

      // 初始化文件缓存
      this.scanDirectory(resolvedPath);
    } catch (error) {
      this.emit('error', error);
    }
  }

  private shouldIgnore(filePath: string): boolean {
    for (const pattern of this.config.ignored) {
      if (typeof pattern === 'string') {
        if (filePath.includes(pattern)) return true;
      } else if (pattern.test(filePath)) {
        return true;
      }
    }
    return false;
  }

  private debounceEvent(key: string, callback: () => void): void {
    const existing = this.recentEvents.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      this.recentEvents.delete(key);
      callback();
    }, this.config.debounceDelay);

    this.recentEvents.set(key, timeout);
  }

  private handleEvent(eventType: string, fullPath: string): void {
    const exists = fs.existsSync(fullPath);
    const cached = this.fileCache.get(fullPath);

    let event: FileEvent;

    if (eventType === 'rename') {
      if (exists && !cached) {
        // 新建文件
        event = this.createEvent('create', fullPath);
        this.updateCache(fullPath);
      } else if (!exists && cached) {
        // 删除文件
        event = this.createEvent('delete', fullPath);
        this.fileCache.delete(fullPath);
      } else if (exists && cached) {
        // 重命名（需要追踪）
        event = this.createEvent('modify', fullPath);
        this.updateCache(fullPath);
      } else {
        return;
      }
    } else {
      // change 事件
      event = this.createEvent('modify', fullPath);
      this.updateCache(fullPath);
    }

    this.emit('change', event);
    this.emit(event.type, event);
  }

  private createEvent(
    type: FileEvent['type'],
    filePath: string,
    oldPath?: string
  ): FileEvent {
    let isDirectory = false;
    try {
      const stat = fs.statSync(filePath);
      isDirectory = stat.isDirectory();
    } catch {
      // 文件可能已被删除
    }

    return {
      type,
      path: filePath,
      oldPath,
      timestamp: Date.now(),
      isDirectory,
    };
  }

  private updateCache(filePath: string): void {
    try {
      const stat = fs.statSync(filePath);
      this.fileCache.set(filePath, {
        mtime: stat.mtimeMs,
        size: stat.size,
      });
    } catch {
      this.fileCache.delete(filePath);
    }
  }

  private scanDirectory(dirPath: string): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (this.shouldIgnore(fullPath)) continue;

        if (entry.isFile()) {
          this.updateCache(fullPath);
        } else if (entry.isDirectory() && this.config.recursive) {
          this.scanDirectory(fullPath);
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }
}
