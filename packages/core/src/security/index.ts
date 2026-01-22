/**
 * Security 模块 - 安全保护能力
 *
 * 提供:
 * - 命令安全检查 (CommandChecker)
 * - 文件系统访问保护 (FileSystemGuard)
 * - 状态回滚管理 (RollbackManager)
 */

// 类型导出
export type {
  SecurityLevel,
  RiskLevel,
  CommandType,
  CommandCheckResult,
  DangerousPattern,
  DangerousPatternDef,
  CommandCheckerConfig,
  FileSystemOperation,
  FileSystemAccessResult,
  FileSystemGuardConfig,
  RollbackPoint,
  RollbackOperation,
  RollbackOperationType,
  RollbackResult,
  RollbackFailure,
  SecurityAuditLog,
  SecurityEventType,
  SecurityManagerConfig,
} from './types';

// 命令检查器
export {
  CommandChecker,
  getCommandChecker,
  createCommandChecker,
  setCommandChecker,
} from './command-checker';

// 文件系统保护
export {
  FileSystemGuard,
  getFileSystemGuard,
  createFileSystemGuard,
  setFileSystemGuard,
} from './filesystem-guard';

// 回滚管理器
export {
  RollbackManager,
  type RollbackManagerConfig,
  getRollbackManager,
  createRollbackManager,
  setRollbackManager,
} from './rollback-manager';
