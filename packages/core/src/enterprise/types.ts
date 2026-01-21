/**
 * 企业版功能类型定义
 * Enterprise Features Type Definitions
 *
 * 定义团队管理、SSO、审计和合规相关的接口
 */

// ============================================================================
// 许可证类型 (License Types)
// ============================================================================

/**
 * 许可证类型
 */
export type LicenseType =
  | 'free'           // 免费版
  | 'pro'            // 专业版
  | 'team'           // 团队版
  | 'enterprise';    // 企业版

/**
 * 许可证状态
 */
export type LicenseStatus =
  | 'active'         // 有效
  | 'expired'        // 过期
  | 'suspended'      // 暂停
  | 'trial';         // 试用

/**
 * 许可证信息
 */
export interface License {
  /** 许可证 ID */
  id: string;
  /** 许可证类型 */
  type: LicenseType;
  /** 状态 */
  status: LicenseStatus;
  /** 组织 ID */
  organizationId: string;
  /** 座位数量 */
  seats: number;
  /** 已使用座位数 */
  usedSeats: number;
  /** 开始日期 */
  startDate: number;
  /** 到期日期 */
  expirationDate: number;
  /** 功能列表 */
  features: LicenseFeature[];
  /** 许可证密钥 */
  licenseKey: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 许可证功能
 */
export type LicenseFeature =
  | 'unlimited_workflows'
  | 'unlimited_plugins'
  | 'team_collaboration'
  | 'sso'
  | 'audit_logs'
  | 'custom_branding'
  | 'priority_support'
  | 'api_access'
  | 'analytics'
  | 'compliance'
  | 'data_retention'
  | 'custom_integrations';

// ============================================================================
// 组织和团队 (Organization & Team)
// ============================================================================

/**
 * 组织
 */
export interface Organization {
  /** 组织 ID */
  id: string;
  /** 组织名称 */
  name: string;
  /** Slug (用于 URL) */
  slug: string;
  /** 描述 */
  description?: string;
  /** Logo URL */
  logoUrl?: string;
  /** 域名 */
  domain?: string;
  /** 许可证信息 */
  license?: License;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 设置 */
  settings: OrganizationSettings;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 组织设置
 */
export interface OrganizationSettings {
  /** 是否强制 SSO */
  requireSso: boolean;
  /** 是否启用两步验证 */
  require2fa: boolean;
  /** 允许的邮箱域名 */
  allowedEmailDomains?: string[];
  /** 默认角色 */
  defaultRole: TeamRole;
  /** 会话超时 (分钟) */
  sessionTimeout: number;
  /** 是否允许外部共享 */
  allowExternalSharing: boolean;
  /** 数据保留天数 */
  dataRetentionDays: number;
  /** 自定义品牌 */
  branding?: {
    primaryColor?: string;
    logoUrl?: string;
    faviconUrl?: string;
    customCss?: string;
  };
}

/**
 * 团队
 */
export interface Team {
  /** 团队 ID */
  id: string;
  /** 组织 ID */
  organizationId: string;
  /** 团队名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 成员 ID 列表 */
  memberIds: string[];
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 团队成员
 */
export interface TeamMember {
  /** 用户 ID */
  userId: string;
  /** 组织 ID */
  organizationId: string;
  /** 角色 */
  role: TeamRole;
  /** 团队 ID 列表 */
  teamIds: string[];
  /** 加入时间 */
  joinedAt: number;
  /** 邀请者 ID */
  invitedBy?: string;
  /** 状态 */
  status: MemberStatus;
  /** 最后活跃时间 */
  lastActiveAt?: number;
}

/**
 * 团队角色
 */
export type TeamRole =
  | 'owner'          // 所有者
  | 'admin'          // 管理员
  | 'member'         // 成员
  | 'viewer';        // 只读访问者

/**
 * 成员状态
 */
export type MemberStatus =
  | 'active'         // 活跃
  | 'invited'        // 已邀请
  | 'suspended'      // 暂停
  | 'removed';       // 已移除

/**
 * 团队邀请
 */
export interface TeamInvite {
  /** 邀请 ID */
  id: string;
  /** 组织 ID */
  organizationId: string;
  /** 邀请邮箱 */
  email: string;
  /** 角色 */
  role: TeamRole;
  /** 团队 ID 列表 */
  teamIds?: string[];
  /** 邀请者 ID */
  invitedBy: string;
  /** 邀请令牌 */
  token: string;
  /** 创建时间 */
  createdAt: number;
  /** 过期时间 */
  expiresAt: number;
  /** 是否已使用 */
  used: boolean;
  /** 使用时间 */
  usedAt?: number;
}

// ============================================================================
// SSO 和认证 (SSO & Authentication)
// ============================================================================

/**
 * SSO 提供商类型
 */
export type SsoProviderType =
  | 'saml'           // SAML 2.0
  | 'oidc'           // OpenID Connect
  | 'oauth2'         // OAuth 2.0
  | 'ldap';          // LDAP/Active Directory

/**
 * SSO 配置
 */
export interface SsoConfig {
  /** 配置 ID */
  id: string;
  /** 组织 ID */
  organizationId: string;
  /** 提供商类型 */
  providerType: SsoProviderType;
  /** 是否启用 */
  enabled: boolean;
  /** 提供商名称 */
  providerName: string;
  /** 配置详情 */
  config: SamlConfig | OidcConfig | OAuth2Config | LdapConfig;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * SAML 配置
 */
export interface SamlConfig {
  /** Entity ID */
  entityId: string;
  /** SSO URL */
  ssoUrl: string;
  /** SLO URL */
  sloUrl?: string;
  /** 证书 */
  certificate: string;
  /** 名称 ID 格式 */
  nameIdFormat?: string;
  /** 属性映射 */
  attributeMapping?: Record<string, string>;
}

/**
 * OIDC 配置
 */
export interface OidcConfig {
  /** 发现端点 */
  discoveryUrl?: string;
  /** 授权端点 */
  authorizationUrl: string;
  /** 令牌端点 */
  tokenUrl: string;
  /** 用户信息端点 */
  userInfoUrl?: string;
  /** Client ID */
  clientId: string;
  /** Client Secret */
  clientSecret: string;
  /** 范围 */
  scopes: string[];
  /** 声明映射 */
  claimsMapping?: Record<string, string>;
}

/**
 * OAuth2 配置
 */
export interface OAuth2Config {
  /** 授权端点 */
  authorizationUrl: string;
  /** 令牌端点 */
  tokenUrl: string;
  /** Client ID */
  clientId: string;
  /** Client Secret */
  clientSecret: string;
  /** 范围 */
  scopes: string[];
  /** 回调 URL */
  callbackUrl: string;
}

/**
 * LDAP 配置
 */
export interface LdapConfig {
  /** 服务器 URL */
  serverUrl: string;
  /** 基础 DN */
  baseDn: string;
  /** 绑定 DN */
  bindDn: string;
  /** 绑定密码 */
  bindPassword: string;
  /** 用户搜索过滤器 */
  userSearchFilter: string;
  /** 用户搜索基础 */
  userSearchBase: string;
  /** 属性映射 */
  attributeMapping?: Record<string, string>;
  /** 是否使用 TLS */
  useTls: boolean;
  /** 组搜索配置 */
  groupSearch?: {
    baseDn: string;
    filter: string;
    memberAttribute: string;
  };
}

// ============================================================================
// 企业审计 (Enterprise Audit)
// ============================================================================

/**
 * 企业审计事件类型
 */
export type EnterpriseAuditEventType =
  // 组织事件
  | 'org_created'
  | 'org_updated'
  | 'org_settings_changed'
  | 'org_deleted'
  // 成员事件
  | 'member_invited'
  | 'member_joined'
  | 'member_role_changed'
  | 'member_removed'
  | 'member_suspended'
  // 团队事件
  | 'team_created'
  | 'team_updated'
  | 'team_deleted'
  | 'team_member_added'
  | 'team_member_removed'
  // SSO 事件
  | 'sso_config_created'
  | 'sso_config_updated'
  | 'sso_config_deleted'
  | 'sso_login'
  | 'sso_login_failed'
  // 许可证事件
  | 'license_activated'
  | 'license_updated'
  | 'license_expired'
  // 安全事件
  | 'security_2fa_enabled'
  | 'security_2fa_disabled'
  | 'security_password_changed'
  | 'security_api_key_created'
  | 'security_api_key_revoked'
  // 数据事件
  | 'data_exported'
  | 'data_deleted'
  | 'data_shared'
  | 'data_access_requested';

/**
 * 企业审计日志条目
 */
export interface EnterpriseAuditLogEntry {
  /** 条目 ID */
  id: string;
  /** 时间戳 */
  timestamp: number;
  /** 事件类型 */
  eventType: EnterpriseAuditEventType;
  /** 组织 ID */
  organizationId: string;
  /** 操作者 ID */
  actorId: string;
  /** 操作者类型 */
  actorType: 'user' | 'admin' | 'system' | 'api';
  /** 目标资源 */
  resource?: {
    type: string;
    id: string;
    name?: string;
  };
  /** 详细信息 */
  details?: Record<string, unknown>;
  /** IP 地址 */
  ipAddress?: string;
  /** 用户代理 */
  userAgent?: string;
  /** 结果 */
  result: 'success' | 'failure';
  /** 错误信息 */
  errorMessage?: string;
}

// ============================================================================
// 合规和数据治理 (Compliance & Data Governance)
// ============================================================================

/**
 * 合规标准
 */
export type ComplianceStandard =
  | 'gdpr'           // GDPR
  | 'hipaa'          // HIPAA
  | 'soc2'           // SOC 2
  | 'iso27001'       // ISO 27001
  | 'pci_dss';       // PCI DSS

/**
 * 合规配置
 */
export interface ComplianceConfig {
  /** 组织 ID */
  organizationId: string;
  /** 启用的合规标准 */
  enabledStandards: ComplianceStandard[];
  /** 数据分类 */
  dataClassification: {
    enabled: boolean;
    defaultLevel: DataClassificationLevel;
    autoClassify: boolean;
  };
  /** 数据保留策略 */
  dataRetention: {
    enabled: boolean;
    defaultRetentionDays: number;
    byDataType: Record<string, number>;
  };
  /** 数据主体请求配置 */
  subjectRequests: {
    enabled: boolean;
    autoProcess: boolean;
    notifyAdmin: boolean;
  };
}

/**
 * 数据分类级别
 */
export type DataClassificationLevel =
  | 'public'         // 公开
  | 'internal'       // 内部
  | 'confidential'   // 机密
  | 'restricted';    // 受限

/**
 * 数据主体请求
 */
export interface DataSubjectRequest {
  /** 请求 ID */
  id: string;
  /** 组织 ID */
  organizationId: string;
  /** 请求类型 */
  requestType: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction';
  /** 请求者邮箱 */
  requesterEmail: string;
  /** 状态 */
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  /** 创建时间 */
  createdAt: number;
  /** 处理时间 */
  processedAt?: number;
  /** 截止时间 */
  dueDate: number;
  /** 处理者 ID */
  processedBy?: string;
  /** 备注 */
  notes?: string;
}

// ============================================================================
// API 和集成 (API & Integrations)
// ============================================================================

/**
 * API 密钥
 */
export interface ApiKey {
  /** 密钥 ID */
  id: string;
  /** 组织 ID */
  organizationId: string;
  /** 创建者 ID */
  createdBy: string;
  /** 名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 密钥 (仅在创建时返回) */
  key?: string;
  /** 密钥前缀 (用于显示) */
  keyPrefix: string;
  /** 权限范围 */
  scopes: ApiScope[];
  /** 创建时间 */
  createdAt: number;
  /** 过期时间 */
  expiresAt?: number;
  /** 最后使用时间 */
  lastUsedAt?: number;
  /** 是否启用 */
  enabled: boolean;
  /** 速率限制 */
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
}

/**
 * API 权限范围
 */
export type ApiScope =
  | 'read:tasks'
  | 'write:tasks'
  | 'read:workflows'
  | 'write:workflows'
  | 'read:analytics'
  | 'read:audit'
  | 'admin:org'
  | 'admin:members'
  | 'admin:teams';

/**
 * Webhook 配置
 */
export interface WebhookConfig {
  /** Webhook ID */
  id: string;
  /** 组织 ID */
  organizationId: string;
  /** 名称 */
  name: string;
  /** URL */
  url: string;
  /** 密钥 */
  secret?: string;
  /** 订阅的事件 */
  events: string[];
  /** 是否启用 */
  enabled: boolean;
  /** 创建时间 */
  createdAt: number;
  /** 最后触发时间 */
  lastTriggeredAt?: number;
  /** 失败次数 */
  failureCount: number;
  /** 是否暂停 */
  paused: boolean;
}

// ============================================================================
// 企业管理器配置 (Enterprise Manager Config)
// ============================================================================

/**
 * 企业管理器配置
 */
export interface EnterpriseManagerConfig {
  /** 是否启用企业功能 */
  enabled: boolean;
  /** 许可证验证 URL */
  licenseValidationUrl?: string;
  /** 审计日志保留天数 */
  auditLogRetentionDays: number;
  /** 邀请过期天数 */
  inviteExpirationDays: number;
  /** API 密钥最大数量 */
  maxApiKeys: number;
  /** Webhook 最大数量 */
  maxWebhooks: number;
}

/**
 * 默认企业管理器配置
 */
export const DEFAULT_ENTERPRISE_CONFIG: EnterpriseManagerConfig = {
  enabled: false,
  auditLogRetentionDays: 365,
  inviteExpirationDays: 7,
  maxApiKeys: 10,
  maxWebhooks: 10,
};
