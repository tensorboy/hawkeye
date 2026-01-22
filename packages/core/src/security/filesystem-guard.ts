/**
 * FileSystemGuard - 文件系统访问保护
 *
 * 提供沙箱模式和路径访问控制
 * 防止恶意或意外的文件系统操作
 */

import * as path from 'path';
import * as os from 'os';
import type {
  FileSystemGuardConfig,
  FileSystemAccessResult,
  FileSystemOperation,
} from './types';

/**
 * 默认禁止访问的路径模式
 */
const DEFAULT_FORBIDDEN_PATTERNS: string[] = [
  // 系统关键目录
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/boot',
  '/sys',
  '/proc',
  // Windows 系统
  'C:\\Windows\\System32',
  'C:\\Windows\\SysWOW64',
  // 敏感用户目录
  '.ssh',
  '.gnupg',
  '.aws',
  '.azure',
  '.gcloud',
  '.config/gcloud',
  // 浏览器数据
  'Library/Application Support/Google/Chrome',
  'Library/Application Support/Firefox',
  'AppData/Local/Google/Chrome',
  'AppData/Roaming/Mozilla/Firefox',
  // 密钥和凭证
  '.env',
  '.env.local',
  '.env.production',
  'credentials.json',
  'secrets.json',
  'private_key',
  'id_rsa',
  'id_ed25519',
];

/**
 * 默认禁止的文件扩展名
 */
const DEFAULT_FORBIDDEN_EXTENSIONS: string[] = [
  '.exe',
  '.dll',
  '.sys',
  '.bat',
  '.cmd',
  '.ps1',
  '.vbs',
  '.wsf',
  '.msi',
  '.scr',
  '.pif',
  '.com',
];

/**
 * 默认配置
 */
const DEFAULT_CONFIG: FileSystemGuardConfig = {
  allowedRoots: [os.homedir()],
  forbiddenPatterns: DEFAULT_FORBIDDEN_PATTERNS,
  sandboxMode: false,
  sandboxRoot: undefined,
  allowCreateDirectories: true,
  allowDelete: false,
  maxFileSize: 100 * 1024 * 1024, // 100MB
  allowedExtensions: undefined, // undefined 表示不限制
  forbiddenExtensions: DEFAULT_FORBIDDEN_EXTENSIONS,
};

/**
 * 文件系统访问保护
 */
export class FileSystemGuard {
  private config: FileSystemGuardConfig;

  constructor(config: Partial<FileSystemGuardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 如果启用沙箱模式但没有指定沙箱根目录，创建默认沙箱
    if (this.config.sandboxMode && !this.config.sandboxRoot) {
      this.config.sandboxRoot = path.join(os.tmpdir(), 'hawkeye-sandbox');
    }
  }

  /**
   * 检查文件系统访问权限
   */
  checkAccess(
    targetPath: string,
    operation: FileSystemOperation
  ): FileSystemAccessResult {
    const normalizedPath = this.normalizePath(targetPath);
    const warnings: string[] = [];

    // 沙箱模式检查
    if (this.config.sandboxMode) {
      const sandboxResult = this.checkSandbox(normalizedPath, operation);
      if (!sandboxResult.allowed) {
        return sandboxResult;
      }
    }

    // 禁止路径模式检查
    const forbiddenMatch = this.matchForbiddenPattern(normalizedPath);
    if (forbiddenMatch) {
      return {
        allowed: false,
        reason: `路径匹配禁止模式: ${forbiddenMatch}`,
        operation,
        path: normalizedPath,
        inSandbox: this.isInSandbox(normalizedPath),
        warnings: [],
      };
    }

    // 扩展名检查
    const extension = path.extname(normalizedPath).toLowerCase();
    if (this.config.forbiddenExtensions.includes(extension)) {
      return {
        allowed: false,
        reason: `禁止的文件扩展名: ${extension}`,
        operation,
        path: normalizedPath,
        inSandbox: this.isInSandbox(normalizedPath),
        warnings: [],
      };
    }

    // 如果指定了允许的扩展名列表，检查是否在列表中
    if (
      this.config.allowedExtensions &&
      extension &&
      !this.config.allowedExtensions.includes(extension)
    ) {
      return {
        allowed: false,
        reason: `扩展名不在允许列表中: ${extension}`,
        operation,
        path: normalizedPath,
        inSandbox: this.isInSandbox(normalizedPath),
        warnings: [],
      };
    }

    // 非沙箱模式下检查允许的根目录
    if (!this.config.sandboxMode) {
      if (!this.isUnderAllowedRoot(normalizedPath)) {
        return {
          allowed: false,
          reason: `路径不在允许的根目录下`,
          operation,
          path: normalizedPath,
          inSandbox: false,
          warnings: [],
        };
      }
    }

    // 特定操作检查
    if (operation === 'delete' && !this.config.allowDelete) {
      return {
        allowed: false,
        reason: '删除操作不被允许',
        operation,
        path: normalizedPath,
        inSandbox: this.isInSandbox(normalizedPath),
        warnings: [],
      };
    }

    if (operation === 'create' && !this.config.allowCreateDirectories) {
      // 检查是否是创建目录
      if (normalizedPath.endsWith('/') || normalizedPath.endsWith(path.sep)) {
        return {
          allowed: false,
          reason: '创建目录不被允许',
          operation,
          path: normalizedPath,
          inSandbox: this.isInSandbox(normalizedPath),
          warnings: [],
        };
      }
    }

    // 路径遍历攻击检测
    if (this.detectPathTraversal(targetPath)) {
      warnings.push('检测到潜在的路径遍历模式');
    }

    // 符号链接警告
    if (normalizedPath.includes('->')) {
      warnings.push('路径可能包含符号链接');
    }

    return {
      allowed: true,
      reason: '访问允许',
      operation,
      path: normalizedPath,
      inSandbox: this.isInSandbox(normalizedPath),
      warnings,
    };
  }

  /**
   * 检查文件大小限制
   */
  checkFileSize(size: number): boolean {
    return size <= this.config.maxFileSize;
  }

  /**
   * 获取沙箱路径
   * 将外部路径映射到沙箱内
   */
  getSandboxPath(originalPath: string): string {
    if (!this.config.sandboxMode || !this.config.sandboxRoot) {
      return originalPath;
    }

    const normalizedOriginal = this.normalizePath(originalPath);
    const baseName = path.basename(normalizedOriginal);
    const hash = this.simpleHash(normalizedOriginal);

    return path.join(this.config.sandboxRoot, `${hash}_${baseName}`);
  }

  /**
   * 创建虚拟路径映射
   */
  createVirtualMapping(realPath: string, virtualPath: string): { real: string; virtual: string } {
    return {
      real: this.normalizePath(realPath),
      virtual: this.normalizePath(virtualPath),
    };
  }

  /**
   * 添加允许的根目录
   */
  addAllowedRoot(rootPath: string): void {
    const normalized = this.normalizePath(rootPath);
    if (!this.config.allowedRoots.includes(normalized)) {
      this.config.allowedRoots.push(normalized);
    }
  }

  /**
   * 移除允许的根目录
   */
  removeAllowedRoot(rootPath: string): void {
    const normalized = this.normalizePath(rootPath);
    this.config.allowedRoots = this.config.allowedRoots.filter(
      (r) => r !== normalized
    );
  }

  /**
   * 添加禁止模式
   */
  addForbiddenPattern(pattern: string): void {
    if (!this.config.forbiddenPatterns.includes(pattern)) {
      this.config.forbiddenPatterns.push(pattern);
    }
  }

  /**
   * 启用沙箱模式
   */
  enableSandbox(sandboxRoot?: string): void {
    this.config.sandboxMode = true;
    if (sandboxRoot) {
      this.config.sandboxRoot = sandboxRoot;
    } else if (!this.config.sandboxRoot) {
      this.config.sandboxRoot = path.join(os.tmpdir(), 'hawkeye-sandbox');
    }
  }

  /**
   * 禁用沙箱模式
   */
  disableSandbox(): void {
    this.config.sandboxMode = false;
  }

  /**
   * 获取沙箱根目录
   */
  getSandboxRoot(): string | undefined {
    return this.config.sandboxRoot;
  }

  /**
   * 检查路径是否在沙箱内
   */
  isInSandbox(targetPath: string): boolean {
    if (!this.config.sandboxRoot) {
      return false;
    }
    const normalizedPath = this.normalizePath(targetPath);
    const normalizedSandbox = this.normalizePath(this.config.sandboxRoot);
    return normalizedPath.startsWith(normalizedSandbox);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<FileSystemGuardConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): FileSystemGuardConfig {
    return { ...this.config };
  }

  // ===== Private Methods =====

  private normalizePath(targetPath: string): string {
    // 展开 ~ 为用户目录
    let normalized = targetPath;
    if (normalized.startsWith('~')) {
      normalized = normalized.replace('~', os.homedir());
    }

    // 解析为绝对路径
    normalized = path.resolve(normalized);

    // 规范化路径分隔符
    normalized = path.normalize(normalized);

    return normalized;
  }

  private checkSandbox(
    targetPath: string,
    operation: FileSystemOperation
  ): FileSystemAccessResult {
    if (!this.config.sandboxRoot) {
      return {
        allowed: false,
        reason: '沙箱模式已启用但未设置沙箱根目录',
        operation,
        path: targetPath,
        inSandbox: false,
        warnings: [],
      };
    }

    const normalizedSandbox = this.normalizePath(this.config.sandboxRoot);

    // 检查是否在沙箱内
    if (!targetPath.startsWith(normalizedSandbox)) {
      return {
        allowed: false,
        reason: `沙箱违规: 路径 ${targetPath} 不在沙箱 ${normalizedSandbox} 内`,
        operation,
        path: targetPath,
        inSandbox: false,
        warnings: [],
      };
    }

    return {
      allowed: true,
      reason: '在沙箱内',
      operation,
      path: targetPath,
      inSandbox: true,
      warnings: [],
    };
  }

  private matchForbiddenPattern(targetPath: string): string | null {
    const lowerPath = targetPath.toLowerCase();
    for (const pattern of this.config.forbiddenPatterns) {
      const lowerPattern = pattern.toLowerCase();
      if (lowerPath.includes(lowerPattern)) {
        return pattern;
      }
    }
    return null;
  }

  private isUnderAllowedRoot(targetPath: string): boolean {
    for (const root of this.config.allowedRoots) {
      const normalizedRoot = this.normalizePath(root);
      if (targetPath.startsWith(normalizedRoot)) {
        return true;
      }
    }
    return false;
  }

  private detectPathTraversal(targetPath: string): boolean {
    // 检测常见的路径遍历模式
    const traversalPatterns = [
      '../',
      '..\\',
      '%2e%2e%2f',
      '%2e%2e/',
      '..%2f',
      '%2e%2e%5c',
      '..%5c',
      '..../',
      '....\\',
    ];

    const lowerPath = targetPath.toLowerCase();
    for (const pattern of traversalPatterns) {
      if (lowerPath.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).slice(0, 8);
  }
}

// ===== Singleton Support =====

let globalFileSystemGuard: FileSystemGuard | null = null;

export function getFileSystemGuard(): FileSystemGuard {
  if (!globalFileSystemGuard) {
    globalFileSystemGuard = new FileSystemGuard();
  }
  return globalFileSystemGuard;
}

export function createFileSystemGuard(
  config?: Partial<FileSystemGuardConfig>
): FileSystemGuard {
  return new FileSystemGuard(config);
}

export function setFileSystemGuard(guard: FileSystemGuard): void {
  globalFileSystemGuard = guard;
}
