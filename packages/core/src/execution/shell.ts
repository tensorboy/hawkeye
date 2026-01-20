/**
 * Shell 命令执行器
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import type { ExecutionResult } from '../types';

const execAsync = promisify(exec);

export interface ShellExecutorConfig {
  /** 默认超时时间 (ms) */
  timeout?: number;
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 允许执行的命令白名单 (正则表达式) */
  allowedCommands?: RegExp[];
  /** 禁止执行的命令黑名单 (正则表达式) */
  blockedCommands?: RegExp[];
}

export class ShellExecutor {
  private config: ShellExecutorConfig;

  constructor(config: ShellExecutorConfig = {}) {
    this.config = {
      timeout: 30000, // 30 秒
      ...config,
    };
  }

  /**
   * 执行 Shell 命令
   */
  async execute(command: string, options?: { timeout?: number; cwd?: string }): Promise<ExecutionResult> {
    const startTime = Date.now();

    // 安全检查
    if (!this.isCommandAllowed(command)) {
      return {
        success: false,
        error: '命令被安全策略阻止',
        duration: Date.now() - startTime,
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: options?.timeout || this.config.timeout,
        cwd: options?.cwd || this.config.cwd,
        env: {
          ...process.env,
          ...this.config.env,
        },
      });

      return {
        success: true,
        output: stdout || stderr,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const err = error as { message?: string; stderr?: string; killed?: boolean };
      return {
        success: false,
        error: err.message || String(error),
        output: err.stderr,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 执行命令并实时输出
   */
  executeStream(
    command: string,
    onOutput: (data: string) => void,
    onError?: (data: string) => void
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      if (!this.isCommandAllowed(command)) {
        resolve({
          success: false,
          error: '命令被安全策略阻止',
          duration: Date.now() - startTime,
        });
        return;
      }

      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        cwd: this.config.cwd,
        env: {
          ...process.env,
          ...this.config.env,
        },
        shell: true,
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        const str = data.toString();
        output += str;
        onOutput(str);
      });

      child.stderr.on('data', (data) => {
        const str = data.toString();
        errorOutput += str;
        onError?.(str);
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          output: output || errorOutput,
          error: code !== 0 ? `退出码: ${code}` : undefined,
          duration: Date.now() - startTime,
        });
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          error: err.message,
          duration: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * 检查命令是否允许执行
   */
  private isCommandAllowed(command: string): boolean {
    // 检查黑名单
    if (this.config.blockedCommands) {
      for (const pattern of this.config.blockedCommands) {
        if (pattern.test(command)) {
          return false;
        }
      }
    }

    // 检查白名单（如果设置了白名单，则只允许白名单中的命令）
    if (this.config.allowedCommands && this.config.allowedCommands.length > 0) {
      return this.config.allowedCommands.some((pattern) => pattern.test(command));
    }

    return true;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ShellExecutorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
