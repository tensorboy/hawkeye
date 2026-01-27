/**
 * 文件操作执行器 - 集成 FileSystemGuard 进行路径安全校验
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ExecutionResult } from '../types';
import { getFileSystemGuard, type FileSystemGuard } from '../security/filesystem-guard';
import type { FileSystemOperation } from '../security/types';

export class FileExecutor {
  private guard: FileSystemGuard;

  constructor(guard?: FileSystemGuard) {
    this.guard = guard || getFileSystemGuard();
  }

  private checkAccess(targetPath: string, operation: FileSystemOperation): ExecutionResult | null {
    const result = this.guard.checkAccess(targetPath, operation);
    if (!result.allowed) {
      return {
        success: false,
        error: `Access denied: ${result.reason} (path: ${targetPath})`,
        duration: 0,
      };
    }
    return null;
  }

  /**
   * 读取文件
   */
  async read(filePath: string): Promise<ExecutionResult> {
    const denied = this.checkAccess(filePath, 'read');
    if (denied) return denied;

    const startTime = Date.now();
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        success: true,
        output: content,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 写入文件
   */
  async write(filePath: string, content: string): Promise<ExecutionResult> {
    const denied = this.checkAccess(filePath, 'write');
    if (denied) return denied;

    const startTime = Date.now();
    try {
      // 确保目录存在
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return {
        success: true,
        output: `文件已写入: ${filePath}`,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 追加内容到文件
   */
  async append(filePath: string, content: string): Promise<ExecutionResult> {
    const denied = this.checkAccess(filePath, 'write');
    if (denied) return denied;

    const startTime = Date.now();
    try {
      await fs.appendFile(filePath, content, 'utf-8');
      return {
        success: true,
        output: `内容已追加到: ${filePath}`,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 删除文件
   */
  async delete(filePath: string): Promise<ExecutionResult> {
    const denied = this.checkAccess(filePath, 'delete');
    if (denied) return denied;

    const startTime = Date.now();
    try {
      await fs.unlink(filePath);
      return {
        success: true,
        output: `文件已删除: ${filePath}`,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 复制文件
   */
  async copy(source: string, destination: string): Promise<ExecutionResult> {
    const deniedSrc = this.checkAccess(source, 'read');
    if (deniedSrc) return deniedSrc;
    const deniedDst = this.checkAccess(destination, 'write');
    if (deniedDst) return deniedDst;

    const startTime = Date.now();
    try {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(source, destination);
      return {
        success: true,
        output: `文件已复制: ${source} -> ${destination}`,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 移动/重命名文件
   */
  async move(source: string, destination: string): Promise<ExecutionResult> {
    const deniedSrc = this.checkAccess(source, 'move');
    if (deniedSrc) return deniedSrc;
    const deniedDst = this.checkAccess(destination, 'write');
    if (deniedDst) return deniedDst;

    const startTime = Date.now();
    try {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.rename(source, destination);
      return {
        success: true,
        output: `文件已移动: ${source} -> ${destination}`,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查文件是否存在
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 创建目录
   */
  async createDir(dirPath: string): Promise<ExecutionResult> {
    const denied = this.checkAccess(dirPath, 'create');
    if (denied) return denied;

    const startTime = Date.now();
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return {
        success: true,
        output: `目录已创建: ${dirPath}`,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 删除目录
   */
  async deleteDir(dirPath: string): Promise<ExecutionResult> {
    const denied = this.checkAccess(dirPath, 'delete');
    if (denied) return denied;

    const startTime = Date.now();
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      return {
        success: true,
        output: `目录已删除: ${dirPath}`,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 列出目录内容
   */
  async listDir(dirPath: string): Promise<ExecutionResult> {
    const denied = this.checkAccess(dirPath, 'list');
    if (denied) return denied;

    const startTime = Date.now();
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const list = entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }));
      return {
        success: true,
        output: JSON.stringify(list, null, 2),
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: (error as Error).message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }
}
