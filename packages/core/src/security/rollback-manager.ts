/**
 * RollbackManager - 状态回滚管理器
 *
 * 提供操作的撤销和回滚能力
 * 记录文件变更、命令执行等操作用于恢复
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  RollbackPoint,
  RollbackOperation,
  RollbackOperationType,
  RollbackResult,
  RollbackFailure,
} from './types';

/**
 * 回滚管理器配置
 */
export interface RollbackManagerConfig {
  /** 最大回滚点数量 */
  maxRollbackPoints: number;
  /** 是否持久化回滚点 */
  persistRollbackPoints: boolean;
  /** 持久化存储路径 */
  storagePath: string;
  /** 是否自动创建回滚点 */
  autoCreateRollbackPoints: boolean;
  /** 回滚点自动过期时间 (ms) */
  rollbackPointTTL: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: RollbackManagerConfig = {
  maxRollbackPoints: 50,
  persistRollbackPoints: true,
  storagePath: path.join(os.homedir(), '.hawkeye', 'rollback'),
  autoCreateRollbackPoints: true,
  rollbackPointTTL: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * 回滚管理器
 */
export class RollbackManager {
  private config: RollbackManagerConfig;
  private rollbackPoints: Map<string, RollbackPoint>;
  private currentOperations: RollbackOperation[];
  private operationIdCounter: number;

  constructor(config: Partial<RollbackManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rollbackPoints = new Map();
    this.currentOperations = [];
    this.operationIdCounter = 0;

    // 初始化存储目录
    if (this.config.persistRollbackPoints) {
      this.initStorage();
      this.loadPersistedRollbackPoints();
    }
  }

  /**
   * 创建回滚点
   */
  createRollbackPoint(description: string, metadata: Record<string, unknown> = {}): RollbackPoint {
    const id = this.generateId();
    const rollbackPoint: RollbackPoint = {
      id,
      timestamp: Date.now(),
      description,
      operations: [...this.currentOperations],
      metadata,
    };

    this.rollbackPoints.set(id, rollbackPoint);

    // 清理当前操作列表
    this.currentOperations = [];

    // 限制回滚点数量
    this.pruneOldRollbackPoints();

    // 持久化
    if (this.config.persistRollbackPoints) {
      this.persistRollbackPoint(rollbackPoint);
    }

    return rollbackPoint;
  }

  /**
   * 记录文件创建操作
   */
  recordFileCreate(filePath: string, content?: string): RollbackOperation {
    const operation: RollbackOperation = {
      id: `op_${++this.operationIdCounter}`,
      type: 'file_create',
      path: filePath,
      newContent: content,
      timestamp: Date.now(),
      rolledBack: false,
    };

    this.currentOperations.push(operation);
    return operation;
  }

  /**
   * 记录文件修改操作
   */
  recordFileModify(
    filePath: string,
    originalContent: string,
    newContent: string
  ): RollbackOperation {
    const operation: RollbackOperation = {
      id: `op_${++this.operationIdCounter}`,
      type: 'file_modify',
      path: filePath,
      originalContent,
      newContent,
      timestamp: Date.now(),
      rolledBack: false,
    };

    this.currentOperations.push(operation);
    return operation;
  }

  /**
   * 记录文件删除操作
   */
  recordFileDelete(filePath: string, originalContent: string): RollbackOperation {
    const operation: RollbackOperation = {
      id: `op_${++this.operationIdCounter}`,
      type: 'file_delete',
      path: filePath,
      originalContent,
      timestamp: Date.now(),
      rolledBack: false,
    };

    this.currentOperations.push(operation);
    return operation;
  }

  /**
   * 记录文件重命名操作
   */
  recordFileRename(originalPath: string, newPath: string): RollbackOperation {
    const operation: RollbackOperation = {
      id: `op_${++this.operationIdCounter}`,
      type: 'file_rename',
      path: newPath,
      originalPath,
      timestamp: Date.now(),
      rolledBack: false,
    };

    this.currentOperations.push(operation);
    return operation;
  }

  /**
   * 记录文件移动操作
   */
  recordFileMove(originalPath: string, newPath: string): RollbackOperation {
    const operation: RollbackOperation = {
      id: `op_${++this.operationIdCounter}`,
      type: 'file_move',
      path: newPath,
      originalPath,
      timestamp: Date.now(),
      rolledBack: false,
    };

    this.currentOperations.push(operation);
    return operation;
  }

  /**
   * 记录目录创建操作
   */
  recordDirectoryCreate(dirPath: string): RollbackOperation {
    const operation: RollbackOperation = {
      id: `op_${++this.operationIdCounter}`,
      type: 'directory_create',
      path: dirPath,
      timestamp: Date.now(),
      rolledBack: false,
    };

    this.currentOperations.push(operation);
    return operation;
  }

  /**
   * 记录命令执行操作
   */
  recordCommandExecute(
    command: string,
    metadata?: Record<string, unknown>
  ): RollbackOperation {
    const operation: RollbackOperation = {
      id: `op_${++this.operationIdCounter}`,
      type: 'command_execute',
      path: command, // 使用 path 字段存储命令
      timestamp: Date.now(),
      rolledBack: false,
    };

    // 如果有元数据，存储在原始内容字段
    if (metadata) {
      operation.originalContent = JSON.stringify(metadata);
    }

    this.currentOperations.push(operation);
    return operation;
  }

  /**
   * 记录状态变更操作
   */
  recordStateChange(
    stateName: string,
    originalState: string,
    newState: string
  ): RollbackOperation {
    const operation: RollbackOperation = {
      id: `op_${++this.operationIdCounter}`,
      type: 'state_change',
      path: stateName,
      originalContent: originalState,
      newContent: newState,
      timestamp: Date.now(),
      rolledBack: false,
    };

    this.currentOperations.push(operation);
    return operation;
  }

  /**
   * 执行回滚到指定回滚点
   */
  async rollback(rollbackPointId: string): Promise<RollbackResult> {
    const startTime = Date.now();
    const rollbackPoint = this.rollbackPoints.get(rollbackPointId);

    if (!rollbackPoint) {
      return {
        success: false,
        operationsRolledBack: 0,
        failures: [
          {
            operationId: '',
            error: `找不到回滚点: ${rollbackPointId}`,
            recoverable: false,
          },
        ],
        rollbackPointId,
        duration: Date.now() - startTime,
      };
    }

    const failures: RollbackFailure[] = [];
    let rolledBackCount = 0;

    // 按时间倒序回滚操作
    const operations = [...rollbackPoint.operations].reverse();

    for (const operation of operations) {
      if (operation.rolledBack) {
        continue;
      }

      try {
        await this.rollbackOperation(operation);
        operation.rolledBack = true;
        rolledBackCount++;
      } catch (error) {
        failures.push({
          operationId: operation.id,
          error: error instanceof Error ? error.message : String(error),
          recoverable: this.isRecoverable(operation.type),
        });
      }
    }

    // 更新持久化
    if (this.config.persistRollbackPoints) {
      this.persistRollbackPoint(rollbackPoint);
    }

    return {
      success: failures.length === 0,
      operationsRolledBack: rolledBackCount,
      failures,
      rollbackPointId,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 回滚最近的一个操作
   */
  async rollbackLastOperation(): Promise<RollbackResult> {
    const startTime = Date.now();

    if (this.currentOperations.length === 0) {
      return {
        success: false,
        operationsRolledBack: 0,
        failures: [
          {
            operationId: '',
            error: '没有可回滚的操作',
            recoverable: false,
          },
        ],
        rollbackPointId: '',
        duration: Date.now() - startTime,
      };
    }

    const operation = this.currentOperations.pop()!;
    const failures: RollbackFailure[] = [];

    try {
      await this.rollbackOperation(operation);
      operation.rolledBack = true;
    } catch (error) {
      failures.push({
        operationId: operation.id,
        error: error instanceof Error ? error.message : String(error),
        recoverable: this.isRecoverable(operation.type),
      });
      // 恢复到操作列表
      this.currentOperations.push(operation);
    }

    return {
      success: failures.length === 0,
      operationsRolledBack: failures.length === 0 ? 1 : 0,
      failures,
      rollbackPointId: '',
      duration: Date.now() - startTime,
    };
  }

  /**
   * 获取所有回滚点
   */
  getRollbackPoints(): RollbackPoint[] {
    return Array.from(this.rollbackPoints.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }

  /**
   * 获取指定回滚点
   */
  getRollbackPoint(id: string): RollbackPoint | undefined {
    return this.rollbackPoints.get(id);
  }

  /**
   * 获取当前待提交的操作
   */
  getCurrentOperations(): RollbackOperation[] {
    return [...this.currentOperations];
  }

  /**
   * 清除当前操作 (不创建回滚点)
   */
  clearCurrentOperations(): void {
    this.currentOperations = [];
  }

  /**
   * 删除回滚点
   */
  deleteRollbackPoint(id: string): boolean {
    const deleted = this.rollbackPoints.delete(id);
    if (deleted && this.config.persistRollbackPoints) {
      this.deletePersistedRollbackPoint(id);
    }
    return deleted;
  }

  /**
   * 清除所有回滚点
   */
  clearAllRollbackPoints(): void {
    this.rollbackPoints.clear();
    this.currentOperations = [];
    if (this.config.persistRollbackPoints) {
      this.clearPersistedRollbackPoints();
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RollbackManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ===== Private Methods =====

  private generateId(): string {
    return `rp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private async rollbackOperation(operation: RollbackOperation): Promise<void> {
    switch (operation.type) {
      case 'file_create':
        // 删除创建的文件
        if (operation.path && fs.existsSync(operation.path)) {
          fs.unlinkSync(operation.path);
        }
        break;

      case 'file_modify':
        // 恢复原始内容
        if (operation.path && operation.originalContent !== undefined) {
          fs.writeFileSync(operation.path, operation.originalContent, 'utf-8');
        }
        break;

      case 'file_delete':
        // 恢复删除的文件
        if (operation.path && operation.originalContent !== undefined) {
          const dir = path.dirname(operation.path);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(operation.path, operation.originalContent, 'utf-8');
        }
        break;

      case 'file_rename':
      case 'file_move':
        // 恢复原始路径
        if (operation.path && operation.originalPath && fs.existsSync(operation.path)) {
          fs.renameSync(operation.path, operation.originalPath);
        }
        break;

      case 'directory_create':
        // 删除创建的目录 (仅空目录)
        if (operation.path && fs.existsSync(operation.path)) {
          const files = fs.readdirSync(operation.path);
          if (files.length === 0) {
            fs.rmdirSync(operation.path);
          }
        }
        break;

      case 'directory_delete':
        // 目录删除通常不可回滚
        throw new Error('目录删除操作不支持回滚');

      case 'command_execute':
        // 命令执行通常不可回滚
        throw new Error('命令执行操作不支持自动回滚');

      case 'state_change':
        // 状态变更需要外部处理
        // 这里只是标记，实际回滚由调用者处理
        break;

      default:
        throw new Error(`未知的操作类型: ${operation.type}`);
    }
  }

  private isRecoverable(type: RollbackOperationType): boolean {
    const nonRecoverable: RollbackOperationType[] = [
      'command_execute',
      'directory_delete',
    ];
    return !nonRecoverable.includes(type);
  }

  private pruneOldRollbackPoints(): void {
    const points = Array.from(this.rollbackPoints.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp);

    // 删除超过最大数量的
    while (points.length > this.config.maxRollbackPoints) {
      const [id] = points.pop()!;
      this.rollbackPoints.delete(id);
      if (this.config.persistRollbackPoints) {
        this.deletePersistedRollbackPoint(id);
      }
    }

    // 删除过期的
    const now = Date.now();
    for (const [id, point] of this.rollbackPoints) {
      if (now - point.timestamp > this.config.rollbackPointTTL) {
        this.rollbackPoints.delete(id);
        if (this.config.persistRollbackPoints) {
          this.deletePersistedRollbackPoint(id);
        }
      }
    }
  }

  private initStorage(): void {
    if (!fs.existsSync(this.config.storagePath)) {
      fs.mkdirSync(this.config.storagePath, { recursive: true });
    }
  }

  private loadPersistedRollbackPoints(): void {
    try {
      const files = fs.readdirSync(this.config.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.config.storagePath, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const rollbackPoint = JSON.parse(content) as RollbackPoint;
          this.rollbackPoints.set(rollbackPoint.id, rollbackPoint);
        }
      }
    } catch (error) {
      // 忽略加载错误
      console.warn('Failed to load persisted rollback points:', error);
    }
  }

  private persistRollbackPoint(rollbackPoint: RollbackPoint): void {
    try {
      const filePath = path.join(
        this.config.storagePath,
        `${rollbackPoint.id}.json`
      );
      fs.writeFileSync(filePath, JSON.stringify(rollbackPoint, null, 2), 'utf-8');
    } catch (error) {
      console.warn('Failed to persist rollback point:', error);
    }
  }

  private deletePersistedRollbackPoint(id: string): void {
    try {
      const filePath = path.join(this.config.storagePath, `${id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn('Failed to delete persisted rollback point:', error);
    }
  }

  private clearPersistedRollbackPoints(): void {
    try {
      const files = fs.readdirSync(this.config.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.config.storagePath, file));
        }
      }
    } catch (error) {
      console.warn('Failed to clear persisted rollback points:', error);
    }
  }
}

// ===== Singleton Support =====

let globalRollbackManager: RollbackManager | null = null;

export function getRollbackManager(): RollbackManager {
  if (!globalRollbackManager) {
    globalRollbackManager = new RollbackManager();
  }
  return globalRollbackManager;
}

export function createRollbackManager(
  config?: Partial<RollbackManagerConfig>
): RollbackManager {
  return new RollbackManager(config);
}

export function setRollbackManager(manager: RollbackManager): void {
  globalRollbackManager = manager;
}
