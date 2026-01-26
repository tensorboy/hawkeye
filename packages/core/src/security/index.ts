/**
 * Security 模块 - 安全保护能力
 *
 * 提供:
 * - 命令安全检查 (CommandChecker)
 * - 文件系统访问保护 (FileSystemGuard)
 * - 状态回滚管理 (RollbackManager)
 * - 权限管理 (PermissionManager)
 * - 审计日志 (AuditLogger)
 * - 注入检测 (InjectionDetector)
 * - 工具验证 (ToolValidator)
 */

// 原有类型导出
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

// 新增权限类型导出
export type {
  PermissionLevel,
  ToolCategory,
  ConditionType,
  PermissionCondition,
  ToolPermission,
  PolicyRule,
  PermissionPolicy,
  PermissionResult,
  ExecutionContext,
  AuditLogEntry,
  AuditEventType,
  InjectionDetectionResult,
  InjectionType,
  ToolValidationResult,
} from './permission-types';

export {
  DEFAULT_POLICIES,
  DANGEROUS_COMMANDS,
  SENSITIVE_PATHS,
} from './permission-types';

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

// 权限管理器
export {
  PermissionManager,
  getPermissionManager,
  setPermissionManager,
  type PermissionManagerConfig,
} from './permission-manager';

// 审计日志
export {
  AuditLogger,
  getAuditLogger,
  setAuditLogger,
  type AuditLoggerConfig,
  type QueryOptions,
  type AuditStats,
} from './audit-logger';

// 注入检测器
export {
  InjectionDetector,
  getInjectionDetector,
  setInjectionDetector,
  type InjectionDetectorConfig,
  type InjectionPattern,
} from './injection-detector';

// 工具验证器
export {
  ToolValidator,
  getToolValidator,
  setToolValidator,
  type ToolDefinition,
  type ToolValidatorConfig,
} from './tool-validator';

// ============ Security Manager (统一门面) ============

import { PermissionManager, getPermissionManager } from './permission-manager';
import { AuditLogger, getAuditLogger } from './audit-logger';
import { InjectionDetector, getInjectionDetector } from './injection-detector';
import { ToolValidator, getToolValidator } from './tool-validator';
import type {
  ExecutionContext,
  PermissionResult,
  InjectionDetectionResult,
} from './permission-types';

export interface UnifiedSecurityConfig {
  enablePermissions: boolean;
  enableAudit: boolean;
  enableInjectionDetection: boolean;
  enableToolValidation: boolean;
}

const DEFAULT_UNIFIED_CONFIG: UnifiedSecurityConfig = {
  enablePermissions: true,
  enableAudit: true,
  enableInjectionDetection: true,
  enableToolValidation: true,
};

/**
 * Unified Security Manager - 统一安全管理器
 * 整合所有安全组件，提供统一接口
 */
export class UnifiedSecurityManager {
  private config: UnifiedSecurityConfig;
  private permissionManager: PermissionManager;
  private auditLogger: AuditLogger;
  private injectionDetector: InjectionDetector;
  private toolValidator: ToolValidator;

  constructor(config: Partial<UnifiedSecurityConfig> = {}) {
    this.config = { ...DEFAULT_UNIFIED_CONFIG, ...config };
    this.permissionManager = getPermissionManager();
    this.auditLogger = getAuditLogger();
    this.injectionDetector = getInjectionDetector();
    this.toolValidator = getToolValidator();
  }

  /**
   * 执行完整安全检查
   */
  async checkSecurity(context: ExecutionContext): Promise<SecurityCheckResult> {
    const result: SecurityCheckResult = {
      allowed: true,
      checks: {
        injection: { passed: true },
        permission: { passed: true },
        toolValidation: { passed: true },
      },
    };

    // 1. 注入检测
    if (this.config.enableInjectionDetection) {
      const injectionResult = this.injectionDetector.detectInContext(context);
      result.checks.injection = {
        passed: !injectionResult.detected,
        details: injectionResult,
      };

      if (injectionResult.detected) {
        result.allowed = false;
        result.reason = `Injection detected: ${injectionResult.type}`;

        if (this.config.enableAudit) {
          this.auditLogger.logInjectionDetected(
            context,
            injectionResult.type!,
            injectionResult.pattern
          );
        }

        return result;
      }
    }

    // 2. 工具验证
    if (this.config.enableToolValidation) {
      const validationResult = this.toolValidator.validateName(context.toolId);
      result.checks.toolValidation = {
        passed: validationResult.valid,
        details: validationResult,
      };

      if (!validationResult.valid) {
        result.allowed = false;
        result.reason = `Invalid tool: ${validationResult.errors.join(', ')}`;
        return result;
      }
    }

    // 3. 权限检查
    if (this.config.enablePermissions) {
      const permissionResult = await this.permissionManager.checkPermission(context);
      result.checks.permission = {
        passed: permissionResult.allowed,
        details: permissionResult,
      };

      if (!permissionResult.allowed) {
        result.allowed = false;
        result.reason = permissionResult.reason || 'Permission denied';

        if (this.config.enableAudit) {
          this.auditLogger.logPermissionCheck(context, 'denied');
        }

        return result;
      }

      if (this.config.enableAudit) {
        this.auditLogger.logPermissionCheck(
          context,
          permissionResult.requiresConfirmation ? 'prompted' : 'allowed'
        );
      }
    }

    return result;
  }

  /**
   * 记录敏感操作
   */
  logSensitiveOperation(
    context: ExecutionContext,
    operationType: string,
    details?: Record<string, unknown>
  ): void {
    if (this.config.enableAudit) {
      this.auditLogger.logSensitiveOperation(context, operationType, details);
    }
  }

  /**
   * 获取审计统计
   */
  getAuditStats() {
    return this.auditLogger.getStats();
  }

  /**
   * 导出审计日志
   */
  exportAuditLogs(format: 'json' | 'csv' = 'json'): string {
    return this.auditLogger.export(format);
  }

  /**
   * 设置权限请求处理器
   */
  setPermissionRequestHandler(
    handler: (context: ExecutionContext) => Promise<boolean>
  ): void {
    this.permissionManager.setPermissionRequestHandler(handler);
  }

  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }

  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  getInjectionDetector(): InjectionDetector {
    return this.injectionDetector;
  }

  getToolValidator(): ToolValidator {
    return this.toolValidator;
  }
}

export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  checks: {
    injection: CheckDetail;
    permission: CheckDetail;
    toolValidation: CheckDetail;
  };
}

export interface CheckDetail {
  passed: boolean;
  details?: unknown;
}

// 单例
let globalUnifiedSecurityManager: UnifiedSecurityManager | null = null;

export function getUnifiedSecurityManager(): UnifiedSecurityManager {
  if (!globalUnifiedSecurityManager) {
    globalUnifiedSecurityManager = new UnifiedSecurityManager();
  }
  return globalUnifiedSecurityManager;
}

export function setUnifiedSecurityManager(manager: UnifiedSecurityManager): void {
  globalUnifiedSecurityManager = manager;
}

export function createUnifiedSecurityManager(
  config?: Partial<UnifiedSecurityConfig>
): UnifiedSecurityManager {
  return new UnifiedSecurityManager(config);
}
