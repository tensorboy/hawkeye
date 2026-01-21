/**
 * 认证与权限模块
 * Authentication and Permission Module
 *
 * 提供完整的认证、权限管理和审计日志功能
 */

// 类型导出
export * from './types';

// 权限管理
export {
  PermissionManager,
  createPermissionManager,
  BUILTIN_PERMISSIONS,
  BUILTIN_ROLES,
  type PermissionManagerEvents,
} from './permissions';

// 会话管理
export {
  SessionManager,
  createSessionManager,
  type SessionManagerEvents,
} from './session';

// 审计日志
export {
  AuditLogManager,
  createAuditLogManager,
  type AuditLogConfig,
  type AuditLogManagerEvents,
} from './audit';

// 统一认证管理器
export {
  AuthManager,
  createAuthManager,
  getAuthManager,
  setAuthManager,
  type AuthManagerEvents,
} from './auth-manager';
