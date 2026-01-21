/**
 * 权限认证系统类型定义
 * Permission and Authentication System Types
 *
 * Based on PRD Section 9.3
 */

// ============================================================================
// 权限定义 (Permission Definitions)
// ============================================================================

/**
 * 权限类别
 */
export type PermissionCategory =
  | 'file'      // 文件操作
  | 'shell'     // Shell 命令
  | 'app'       // 应用程序控制
  | 'browser'   // 浏览器操作
  | 'network'   // 网络访问
  | 'system';   // 系统级操作

/**
 * 风险等级
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * 权限作用域
 */
export interface PermissionScope {
  paths?: string[];      // 允许的路径
  commands?: string[];   // 允许的命令
  domains?: string[];    // 允许的域名
  apps?: string[];       // 允许的应用
}

/**
 * 权限定义
 */
export interface Permission {
  id: string;
  name: string;
  description: string;
  category: PermissionCategory;
  riskLevel: RiskLevel;
  scope?: PermissionScope;

  // 是否默认授予
  defaultGranted?: boolean;

  // 需要的父权限
  parentPermission?: string;
}

/**
 * 权限状态
 */
export type PermissionStatus =
  | 'granted'       // 已授权
  | 'denied'        // 已拒绝
  | 'pending'       // 等待授权
  | 'expired';      // 已过期

/**
 * 权限授权记录
 */
export interface PermissionGrant {
  permissionId: string;
  status: PermissionStatus;
  grantedAt?: number;
  expiresAt?: number;
  grantedBy: 'user' | 'system' | 'auto';
  scope?: PermissionScope;
  reason?: string;
}

// ============================================================================
// 角色定义 (Role Definitions)
// ============================================================================

/**
 * 角色定义
 */
export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];  // 权限 ID 列表
  inheritsFrom?: string;  // 继承的角色
}

/**
 * 内置角色
 */
export const BuiltinRoles = {
  OBSERVER: 'observer',     // 只能观察，不能执行
  EXECUTOR: 'executor',     // 可以执行低风险操作
  ADMIN: 'admin',          // 可以执行所有操作
} as const;

export type BuiltinRole = typeof BuiltinRoles[keyof typeof BuiltinRoles];

// ============================================================================
// 认证定义 (Authentication Definitions)
// ============================================================================

/**
 * 认证方式
 */
export type AuthMethod =
  | 'password'      // 密码认证
  | 'biometric'     // 生物识别
  | 'pin'           // PIN 码
  | 'none';         // 无认证

/**
 * 密码策略
 */
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge: number;           // 密码最大有效期（天）
  preventReuse: number;     // 防止重用的历史密码数量
}

/**
 * 会话信息
 */
export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  authMethod: AuthMethod;
  isLocked: boolean;
  deviceInfo?: {
    platform: string;
    hostname: string;
    ip?: string;
  };
}

/**
 * 用户信息
 */
export interface User {
  id: string;
  username: string;
  role: string;
  createdAt: number;
  lastLoginAt?: number;
  preferences: UserPreferences;
}

/**
 * 用户偏好设置
 */
export interface UserPreferences {
  autoLockEnabled: boolean;
  autoLockTimeout: number;          // 自动锁定超时（毫秒）
  requireAuthOnSensitive: boolean;  // 敏感操作需要认证
  defaultPermissionDuration: RememberDuration;
}

// ============================================================================
// 权限请求流程 (Permission Request Flow)
// ============================================================================

/**
 * 记住时长
 */
export type RememberDuration = 'session' | 'day' | 'week' | 'forever';

/**
 * 权限请求
 */
export interface PermissionRequest {
  id: string;
  permissionId: string;
  requestedAt: number;
  reason: string;
  scope?: PermissionScope;
  requiredBy: string;         // 请求来源（计划ID、操作ID等）

  // 请求上下文
  context: {
    planId?: string;
    stepId?: string;
    actionDescription: string;
    potentialImpact: string[];
  };
}

/**
 * 权限请求响应
 */
export interface PermissionResponse {
  requestId: string;
  granted: boolean;
  rememberDuration?: RememberDuration;
  scope?: PermissionScope;     // 可能被限制的作用域
  respondedAt: number;
  respondedBy: 'user' | 'system' | 'auto';
}

/**
 * 审批策略
 */
export interface ApprovalPolicy {
  autoApproveBelow: RiskLevel | 'none';   // 自动批准低于此风险等级的请求
  requireExplicitForHigh: boolean;         // 高风险需要明确确认
  requireReasonForCritical: boolean;       // 关键风险需要提供理由
}

/**
 * 紧急覆盖配置
 */
export interface EmergencyOverride {
  enabled: boolean;
  requirePassword: boolean;
  auditLog: boolean;
  maxDuration: number;        // 最大持续时间（毫秒）
}

// ============================================================================
// 审计日志 (Audit Log)
// ============================================================================

/**
 * 审计事件类型
 */
export type AuditEventType =
  | 'auth_login'
  | 'auth_logout'
  | 'auth_failed'
  | 'session_created'
  | 'session_expired'
  | 'session_locked'
  | 'session_unlocked'
  | 'permission_requested'
  | 'permission_granted'
  | 'permission_denied'
  | 'permission_revoked'
  | 'action_executed'
  | 'action_failed'
  | 'action_blocked'
  | 'emergency_override'
  | 'config_changed';

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  userId?: string;
  sessionId?: string;

  // 事件详情
  details: {
    action?: string;
    permissionId?: string;
    resourceType?: string;
    resourceId?: string;
    reason?: string;
    result?: 'success' | 'failure';
    errorMessage?: string;
  };

  // 元数据
  metadata: {
    ip?: string;
    userAgent?: string;
    platform?: string;
  };
}

// ============================================================================
// 配置类型 (Configuration Types)
// ============================================================================

/**
 * 认证系统配置
 */
export interface AuthConfig {
  // 认证配置
  authentication: {
    enabled: boolean;
    methods: AuthMethod[];
    passwordPolicy: PasswordPolicy;
    biometricEnabled: boolean;
    maxLoginAttempts: number;
    lockoutDuration: number;     // 锁定时长（毫秒）
  };

  // 会话配置
  session: {
    timeout: number;             // 会话超时（毫秒）
    autoLockEnabled: boolean;
    autoLockTimeout: number;     // 自动锁定超时（毫秒）
    maxConcurrentSessions: number;
  };

  // 权限配置
  authorization: {
    defaultRole: string;
    defaultPermissions: string[];
    approvalPolicy: ApprovalPolicy;
    emergencyOverride: EmergencyOverride;
  };

  // 审计配置
  audit: {
    enabled: boolean;
    logRetentionDays: number;
    logSensitiveData: boolean;
  };
}

/**
 * 权限管理器配置
 */
export interface PermissionManagerConfig {
  permissions: Permission[];
  roles: Role[];
  defaultPermissions: string[];
  approvalPolicy: ApprovalPolicy;
}

/**
 * 会话管理器配置
 */
export interface SessionManagerConfig {
  sessionTimeout: number;
  autoLockEnabled: boolean;
  autoLockTimeout: number;
  maxConcurrentSessions: number;
}

// ============================================================================
// 默认配置 (Default Configuration)
// ============================================================================

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: false,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
  maxAge: 90,
  preventReuse: 3,
};

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  autoApproveBelow: 'low',
  requireExplicitForHigh: true,
  requireReasonForCritical: true,
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  autoLockEnabled: true,
  autoLockTimeout: 5 * 60 * 1000,  // 5 分钟
  requireAuthOnSensitive: true,
  defaultPermissionDuration: 'session',
};

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  authentication: {
    enabled: true,
    methods: ['password'],
    passwordPolicy: DEFAULT_PASSWORD_POLICY,
    biometricEnabled: false,
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000,  // 15 分钟
  },
  session: {
    timeout: 24 * 60 * 60 * 1000,     // 24 小时
    autoLockEnabled: true,
    autoLockTimeout: 5 * 60 * 1000,   // 5 分钟
    maxConcurrentSessions: 3,
  },
  authorization: {
    defaultRole: BuiltinRoles.EXECUTOR,
    defaultPermissions: [],
    approvalPolicy: DEFAULT_APPROVAL_POLICY,
    emergencyOverride: {
      enabled: true,
      requirePassword: true,
      auditLog: true,
      maxDuration: 30 * 60 * 1000,    // 30 分钟
    },
  },
  audit: {
    enabled: true,
    logRetentionDays: 90,
    logSensitiveData: false,
  },
};
