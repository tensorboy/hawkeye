/**
 * Security 模块类型定义
 *
 * 基于 Open Interpreter 的安全模式设计
 * 提供命令检查、文件系统保护、状态回滚能力
 */

/**
 * 安全级别
 */
export type SecurityLevel = 'strict' | 'standard' | 'permissive' | 'off';

/**
 * 命令风险等级
 */
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

/**
 * 命令类型
 */
export type CommandType =
  | 'shell'
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'network'
  | 'system'
  | 'process'
  | 'gui'
  | 'unknown';

/**
 * 命令检查结果
 */
export interface CommandCheckResult {
  /** 是否允许执行 */
  allowed: boolean;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 命令类型 */
  commandType: CommandType;
  /** 原因说明 */
  reason: string;
  /** 是否需要确认 */
  requiresConfirmation: boolean;
  /** 警告信息 */
  warnings: string[];
  /** 建议的替代命令 */
  suggestedAlternative?: string;
  /** 检测到的危险模式 */
  detectedPatterns: DangerousPattern[];
}

/**
 * 危险模式
 */
export interface DangerousPattern {
  /** 模式名称 */
  name: string;
  /** 匹配的内容 */
  matched: string;
  /** 风险描述 */
  description: string;
  /** 严重程度 */
  severity: RiskLevel;
}

/**
 * 文件系统操作类型
 */
export type FileSystemOperation = 'read' | 'write' | 'delete' | 'create' | 'rename' | 'copy' | 'move' | 'list';

/**
 * 文件系统访问结果
 */
export interface FileSystemAccessResult {
  /** 是否允许 */
  allowed: boolean;
  /** 原因 */
  reason: string;
  /** 操作类型 */
  operation: FileSystemOperation;
  /** 目标路径 */
  path: string;
  /** 是否在沙箱内 */
  inSandbox: boolean;
  /** 警告 */
  warnings: string[];
}

/**
 * 文件系统保护配置
 */
export interface FileSystemGuardConfig {
  /** 允许的根目录列表 */
  allowedRoots: string[];
  /** 禁止访问的路径模式 */
  forbiddenPatterns: string[];
  /** 是否启用沙箱模式 */
  sandboxMode: boolean;
  /** 沙箱根目录 */
  sandboxRoot?: string;
  /** 是否允许创建目录 */
  allowCreateDirectories: boolean;
  /** 是否允许删除 */
  allowDelete: boolean;
  /** 最大文件大小限制 (bytes) */
  maxFileSize: number;
  /** 允许的文件扩展名 */
  allowedExtensions?: string[];
  /** 禁止的文件扩展名 */
  forbiddenExtensions: string[];
}

/**
 * 回滚点
 */
export interface RollbackPoint {
  /** 回滚点 ID */
  id: string;
  /** 创建时间 */
  timestamp: number;
  /** 描述 */
  description: string;
  /** 操作列表 */
  operations: RollbackOperation[];
  /** 元数据 */
  metadata: Record<string, unknown>;
}

/**
 * 可回滚操作
 */
export interface RollbackOperation {
  /** 操作 ID */
  id: string;
  /** 操作类型 */
  type: RollbackOperationType;
  /** 目标路径 */
  path?: string;
  /** 原始内容 (用于文件恢复) */
  originalContent?: string;
  /** 新内容 (用于对比) */
  newContent?: string;
  /** 原始路径 (用于移动/重命名) */
  originalPath?: string;
  /** 时间戳 */
  timestamp: number;
  /** 是否已回滚 */
  rolledBack: boolean;
}

/**
 * 回滚操作类型
 */
export type RollbackOperationType =
  | 'file_create'
  | 'file_modify'
  | 'file_delete'
  | 'file_rename'
  | 'file_move'
  | 'directory_create'
  | 'directory_delete'
  | 'command_execute'
  | 'state_change';

/**
 * 回滚结果
 */
export interface RollbackResult {
  /** 是否成功 */
  success: boolean;
  /** 回滚的操作数量 */
  operationsRolledBack: number;
  /** 失败的操作 */
  failures: RollbackFailure[];
  /** 回滚点 ID */
  rollbackPointId: string;
  /** 耗时 (ms) */
  duration: number;
}

/**
 * 回滚失败记录
 */
export interface RollbackFailure {
  /** 操作 ID */
  operationId: string;
  /** 错误信息 */
  error: string;
  /** 是否可恢复 */
  recoverable: boolean;
}

/**
 * 命令检查器配置
 */
export interface CommandCheckerConfig {
  /** 安全级别 */
  securityLevel: SecurityLevel;
  /** 自定义黑名单命令 */
  blacklistedCommands: string[];
  /** 自定义白名单命令 */
  whitelistedCommands: string[];
  /** 是否允许 sudo/admin */
  allowSudo: boolean;
  /** 是否允许网络访问 */
  allowNetwork: boolean;
  /** 是否允许进程管理 */
  allowProcessManagement: boolean;
  /** 最大命令长度 */
  maxCommandLength: number;
  /** 自定义危险模式 */
  customDangerousPatterns: DangerousPatternDef[];
}

/**
 * 危险模式定义
 */
export interface DangerousPatternDef {
  /** 模式名称 */
  name: string;
  /** 正则表达式 */
  pattern: RegExp;
  /** 描述 */
  description: string;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 适用的命令类型 */
  applicableTypes?: CommandType[];
}

/**
 * 安全审计日志
 */
export interface SecurityAuditLog {
  /** 日志 ID */
  id: string;
  /** 时间戳 */
  timestamp: number;
  /** 事件类型 */
  eventType: SecurityEventType;
  /** 操作描述 */
  description: string;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 是否被阻止 */
  blocked: boolean;
  /** 用户确认 */
  userConfirmed?: boolean;
  /** 原始命令/路径 */
  raw: string;
  /** 元数据 */
  metadata: Record<string, unknown>;
}

/**
 * 安全事件类型
 */
export type SecurityEventType =
  | 'command_blocked'
  | 'command_allowed'
  | 'command_confirmed'
  | 'file_access_blocked'
  | 'file_access_allowed'
  | 'rollback_created'
  | 'rollback_executed'
  | 'pattern_detected'
  | 'sandbox_violation';

/**
 * 安全管理器配置
 */
export interface SecurityManagerConfig {
  /** 命令检查器配置 */
  commandChecker: Partial<CommandCheckerConfig>;
  /** 文件系统保护配置 */
  fileSystemGuard: Partial<FileSystemGuardConfig>;
  /** 是否启用审计日志 */
  enableAuditLog: boolean;
  /** 审计日志保留数量 */
  auditLogMaxEntries: number;
  /** 是否启用回滚 */
  enableRollback: boolean;
  /** 最大回滚点数量 */
  maxRollbackPoints: number;
}
