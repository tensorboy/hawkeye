/**
 * 简单的 JSON 文件存储
 * 后续可以替换为 SQLite 或其他数据库
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface StorageConfig {
  /** 存储目录 */
  dataDir?: string;
}

export class Storage {
  private dataDir: string;

  constructor(config: StorageConfig = {}) {
    this.dataDir = config.dataDir || path.join(os.homedir(), '.hawkeye');
  }

  /**
   * 初始化存储目录
   */
  async init(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  /**
   * 保存数据
   */
  async save<T>(key: string, data: T): Promise<void> {
    await this.init();
    const filePath = this.getFilePath(key);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 读取数据
   */
  async load<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const filePath = this.getFilePath(key);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return defaultValue;
    }
  }

  /**
   * 删除数据
   */
  async delete(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查数据是否存在
   */
  async exists(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出所有存储的键
   */
  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.dataDir);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));
    } catch {
      return [];
    }
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    const keys = await this.list();
    await Promise.all(keys.map((key) => this.delete(key)));
  }

  private getFilePath(key: string): string {
    // 安全处理键名
    const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.dataDir, `${safeKey}.json`);
  }
}
