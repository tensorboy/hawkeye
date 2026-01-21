/**
 * 企业管理器
 * Enterprise Manager
 *
 * 管理组织、团队、SSO 和企业级功能
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  Organization,
  OrganizationSettings,
  Team,
  TeamMember,
  TeamRole,
  MemberStatus,
  TeamInvite,
  License,
  LicenseType,
  LicenseFeature,
  SsoConfig,
  SsoProviderType,
  ApiKey,
  ApiScope,
  WebhookConfig,
  EnterpriseAuditLogEntry,
  EnterpriseAuditEventType,
  ComplianceConfig,
  DataSubjectRequest,
  EnterpriseManagerConfig,
  DEFAULT_ENTERPRISE_CONFIG,
} from './types';

/**
 * 企业管理器事件
 */
export interface EnterpriseManagerEvents {
  'org:created': (org: Organization) => void;
  'org:updated': (org: Organization) => void;
  'org:deleted': (orgId: string) => void;
  'team:created': (team: Team) => void;
  'team:updated': (team: Team) => void;
  'team:deleted': (teamId: string) => void;
  'member:invited': (invite: TeamInvite) => void;
  'member:joined': (member: TeamMember) => void;
  'member:removed': (memberId: string, orgId: string) => void;
  'member:role_changed': (member: TeamMember) => void;
  'sso:configured': (config: SsoConfig) => void;
  'sso:enabled': (orgId: string) => void;
  'sso:disabled': (orgId: string) => void;
  'license:activated': (license: License) => void;
  'license:expired': (license: License) => void;
  'audit:logged': (entry: EnterpriseAuditLogEntry) => void;
  'api_key:created': (key: ApiKey) => void;
  'api_key:revoked': (keyId: string) => void;
  'webhook:triggered': (webhookId: string, event: string) => void;
}

/**
 * 企业管理器
 */
export class EnterpriseManager extends EventEmitter {
  private config: EnterpriseManagerConfig;
  private organizations: Map<string, Organization> = new Map();
  private teams: Map<string, Team> = new Map();
  private members: Map<string, TeamMember> = new Map();
  private invites: Map<string, TeamInvite> = new Map();
  private licenses: Map<string, License> = new Map();
  private ssoConfigs: Map<string, SsoConfig> = new Map();
  private apiKeys: Map<string, ApiKey> = new Map();
  private webhooks: Map<string, WebhookConfig> = new Map();
  private auditLogs: EnterpriseAuditLogEntry[] = [];
  private complianceConfigs: Map<string, ComplianceConfig> = new Map();
  private dataRequests: Map<string, DataSubjectRequest> = new Map();

  constructor(config?: Partial<EnterpriseManagerConfig>) {
    super();
    this.config = { ...DEFAULT_ENTERPRISE_CONFIG, ...config };
  }

  // ============================================================================
  // 组织管理 (Organization Management)
  // ============================================================================

  /**
   * 创建组织
   */
  createOrganization(
    name: string,
    slug: string,
    options?: Partial<Omit<Organization, 'id' | 'name' | 'slug' | 'createdAt' | 'updatedAt'>>
  ): Organization {
    // 检查 slug 唯一性
    for (const org of this.organizations.values()) {
      if (org.slug === slug) {
        throw new Error(`Organization with slug '${slug}' already exists`);
      }
    }

    const now = Date.now();
    const org: Organization = {
      id: uuidv4(),
      name,
      slug,
      createdAt: now,
      updatedAt: now,
      settings: options?.settings || this.getDefaultOrgSettings(),
      ...options,
    };

    this.organizations.set(org.id, org);
    this.emit('org:created', org);
    this.logAudit('org_created', org.id, 'system', {
      resource: { type: 'organization', id: org.id, name: org.name },
    });

    return org;
  }

  /**
   * 获取组织
   */
  getOrganization(orgId: string): Organization | undefined {
    return this.organizations.get(orgId);
  }

  /**
   * 通过 slug 获取组织
   */
  getOrganizationBySlug(slug: string): Organization | undefined {
    for (const org of this.organizations.values()) {
      if (org.slug === slug) {
        return org;
      }
    }
    return undefined;
  }

  /**
   * 更新组织
   */
  updateOrganization(orgId: string, updates: Partial<Organization>): Organization {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization ${orgId} not found`);
    }

    const updatedOrg: Organization = {
      ...org,
      ...updates,
      id: org.id,
      createdAt: org.createdAt,
      updatedAt: Date.now(),
    };

    this.organizations.set(orgId, updatedOrg);
    this.emit('org:updated', updatedOrg);
    this.logAudit('org_updated', orgId, 'admin', {
      resource: { type: 'organization', id: org.id, name: org.name },
    });

    return updatedOrg;
  }

  /**
   * 更新组织设置
   */
  updateOrganizationSettings(
    orgId: string,
    settings: Partial<OrganizationSettings>
  ): Organization {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization ${orgId} not found`);
    }

    return this.updateOrganization(orgId, {
      settings: { ...org.settings, ...settings },
    });
  }

  /**
   * 删除组织
   */
  deleteOrganization(orgId: string): void {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization ${orgId} not found`);
    }

    // 删除关联的团队
    for (const [teamId, team] of this.teams) {
      if (team.organizationId === orgId) {
        this.teams.delete(teamId);
      }
    }

    // 删除关联的成员
    for (const [memberId, member] of this.members) {
      if (member.organizationId === orgId) {
        this.members.delete(memberId);
      }
    }

    // 删除关联的邀请
    for (const [inviteId, invite] of this.invites) {
      if (invite.organizationId === orgId) {
        this.invites.delete(inviteId);
      }
    }

    // 删除 SSO 配置
    for (const [configId, config] of this.ssoConfigs) {
      if (config.organizationId === orgId) {
        this.ssoConfigs.delete(configId);
      }
    }

    this.organizations.delete(orgId);
    this.emit('org:deleted', orgId);
    this.logAudit('org_deleted', orgId, 'admin', {
      resource: { type: 'organization', id: org.id, name: org.name },
    });
  }

  /**
   * 获取默认组织设置
   */
  private getDefaultOrgSettings(): OrganizationSettings {
    return {
      requireSso: false,
      require2fa: false,
      defaultRole: 'member',
      sessionTimeout: 1440, // 24 hours
      allowExternalSharing: false,
      dataRetentionDays: 365,
    };
  }

  // ============================================================================
  // 团队管理 (Team Management)
  // ============================================================================

  /**
   * 创建团队
   */
  createTeam(orgId: string, name: string, description?: string): Team {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization ${orgId} not found`);
    }

    const now = Date.now();
    const team: Team = {
      id: uuidv4(),
      organizationId: orgId,
      name,
      description,
      memberIds: [],
      createdAt: now,
      updatedAt: now,
    };

    this.teams.set(team.id, team);
    this.emit('team:created', team);
    this.logAudit('team_created', orgId, 'admin', {
      resource: { type: 'team', id: team.id, name: team.name },
    });

    return team;
  }

  /**
   * 获取团队
   */
  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  /**
   * 获取组织的所有团队
   */
  getOrganizationTeams(orgId: string): Team[] {
    return Array.from(this.teams.values())
      .filter(team => team.organizationId === orgId);
  }

  /**
   * 更新团队
   */
  updateTeam(teamId: string, updates: Partial<Team>): Team {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const updatedTeam: Team = {
      ...team,
      ...updates,
      id: team.id,
      organizationId: team.organizationId,
      createdAt: team.createdAt,
      updatedAt: Date.now(),
    };

    this.teams.set(teamId, updatedTeam);
    this.emit('team:updated', updatedTeam);
    this.logAudit('team_updated', team.organizationId, 'admin', {
      resource: { type: 'team', id: team.id, name: team.name },
    });

    return updatedTeam;
  }

  /**
   * 删除团队
   */
  deleteTeam(teamId: string): void {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    // 从成员中移除团队关联
    for (const member of this.members.values()) {
      if (member.teamIds.includes(teamId)) {
        member.teamIds = member.teamIds.filter(id => id !== teamId);
      }
    }

    this.teams.delete(teamId);
    this.emit('team:deleted', teamId);
    this.logAudit('team_deleted', team.organizationId, 'admin', {
      resource: { type: 'team', id: team.id, name: team.name },
    });
  }

  /**
   * 添加团队成员
   */
  addTeamMember(teamId: string, userId: string): void {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const member = this.getMemberByUserId(userId, team.organizationId);
    if (!member) {
      throw new Error(`User ${userId} is not a member of the organization`);
    }

    if (!team.memberIds.includes(userId)) {
      team.memberIds.push(userId);
      team.updatedAt = Date.now();
    }

    if (!member.teamIds.includes(teamId)) {
      member.teamIds.push(teamId);
    }

    this.logAudit('team_member_added', team.organizationId, 'admin', {
      resource: { type: 'team', id: team.id, name: team.name },
      details: { userId },
    });
  }

  /**
   * 移除团队成员
   */
  removeTeamMember(teamId: string, userId: string): void {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    team.memberIds = team.memberIds.filter(id => id !== userId);
    team.updatedAt = Date.now();

    const member = this.getMemberByUserId(userId, team.organizationId);
    if (member) {
      member.teamIds = member.teamIds.filter(id => id !== teamId);
    }

    this.logAudit('team_member_removed', team.organizationId, 'admin', {
      resource: { type: 'team', id: team.id, name: team.name },
      details: { userId },
    });
  }

  // ============================================================================
  // 成员管理 (Member Management)
  // ============================================================================

  /**
   * 邀请成员
   */
  inviteMember(
    orgId: string,
    email: string,
    role: TeamRole,
    invitedBy: string,
    teamIds?: string[]
  ): TeamInvite {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization ${orgId} not found`);
    }

    // 检查邮箱域名限制
    if (org.settings.allowedEmailDomains?.length) {
      const domain = email.split('@')[1];
      if (!org.settings.allowedEmailDomains.includes(domain)) {
        throw new Error(`Email domain ${domain} is not allowed`);
      }
    }

    const invite: TeamInvite = {
      id: uuidv4(),
      organizationId: orgId,
      email,
      role,
      teamIds,
      invitedBy,
      token: crypto.randomBytes(32).toString('hex'),
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.inviteExpirationDays * 24 * 60 * 60 * 1000,
      used: false,
    };

    this.invites.set(invite.id, invite);
    this.emit('member:invited', invite);
    this.logAudit('member_invited', orgId, invitedBy, {
      details: { email, role },
    });

    return invite;
  }

  /**
   * 接受邀请
   */
  acceptInvite(token: string, userId: string): TeamMember {
    // 查找邀请
    let invite: TeamInvite | undefined;
    for (const inv of this.invites.values()) {
      if (inv.token === token) {
        invite = inv;
        break;
      }
    }

    if (!invite) {
      throw new Error('Invalid invitation token');
    }

    if (invite.used) {
      throw new Error('Invitation has already been used');
    }

    if (invite.expiresAt < Date.now()) {
      throw new Error('Invitation has expired');
    }

    // 创建成员
    const member: TeamMember = {
      userId,
      organizationId: invite.organizationId,
      role: invite.role,
      teamIds: invite.teamIds || [],
      joinedAt: Date.now(),
      invitedBy: invite.invitedBy,
      status: 'active',
    };

    this.members.set(`${invite.organizationId}:${userId}`, member);

    // 添加到团队
    for (const teamId of member.teamIds) {
      const team = this.teams.get(teamId);
      if (team && !team.memberIds.includes(userId)) {
        team.memberIds.push(userId);
      }
    }

    // 标记邀请已使用
    invite.used = true;
    invite.usedAt = Date.now();

    // 更新许可证使用量
    const org = this.organizations.get(invite.organizationId);
    if (org?.license) {
      org.license.usedSeats++;
    }

    this.emit('member:joined', member);
    this.logAudit('member_joined', invite.organizationId, userId, {
      details: { role: member.role },
    });

    return member;
  }

  /**
   * 获取成员
   */
  getMember(memberId: string): TeamMember | undefined {
    return this.members.get(memberId);
  }

  /**
   * 通过用户 ID 获取成员
   */
  getMemberByUserId(userId: string, orgId: string): TeamMember | undefined {
    return this.members.get(`${orgId}:${userId}`);
  }

  /**
   * 获取组织的所有成员
   */
  getOrganizationMembers(orgId: string): TeamMember[] {
    return Array.from(this.members.values())
      .filter(member => member.organizationId === orgId);
  }

  /**
   * 更新成员角色
   */
  updateMemberRole(orgId: string, userId: string, role: TeamRole): TeamMember {
    const member = this.getMemberByUserId(userId, orgId);
    if (!member) {
      throw new Error(`Member not found`);
    }

    const oldRole = member.role;
    member.role = role;

    this.emit('member:role_changed', member);
    this.logAudit('member_role_changed', orgId, 'admin', {
      details: { userId, oldRole, newRole: role },
    });

    return member;
  }

  /**
   * 移除成员
   */
  removeMember(orgId: string, userId: string): void {
    const memberId = `${orgId}:${userId}`;
    const member = this.members.get(memberId);
    if (!member) {
      throw new Error(`Member not found`);
    }

    // 从所有团队中移除
    for (const team of this.teams.values()) {
      if (team.organizationId === orgId) {
        team.memberIds = team.memberIds.filter(id => id !== userId);
      }
    }

    // 更新许可证使用量
    const org = this.organizations.get(orgId);
    if (org?.license && org.license.usedSeats > 0) {
      org.license.usedSeats--;
    }

    this.members.delete(memberId);
    this.emit('member:removed', userId, orgId);
    this.logAudit('member_removed', orgId, 'admin', {
      details: { userId },
    });
  }

  /**
   * 暂停成员
   */
  suspendMember(orgId: string, userId: string): void {
    const member = this.getMemberByUserId(userId, orgId);
    if (!member) {
      throw new Error(`Member not found`);
    }

    member.status = 'suspended';
    this.logAudit('member_suspended', orgId, 'admin', {
      details: { userId },
    });
  }

  // ============================================================================
  // 许可证管理 (License Management)
  // ============================================================================

  /**
   * 激活许可证
   */
  activateLicense(
    orgId: string,
    licenseKey: string,
    type: LicenseType,
    seats: number,
    features: LicenseFeature[],
    expirationDate: number
  ): License {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization ${orgId} not found`);
    }

    const license: License = {
      id: uuidv4(),
      type,
      status: 'active',
      organizationId: orgId,
      seats,
      usedSeats: this.getOrganizationMembers(orgId).length,
      startDate: Date.now(),
      expirationDate,
      features,
      licenseKey,
    };

    this.licenses.set(license.id, license);
    org.license = license;

    this.emit('license:activated', license);
    this.logAudit('license_activated', orgId, 'admin', {
      details: { type, seats, features },
    });

    return license;
  }

  /**
   * 检查许可证功能
   */
  hasFeature(orgId: string, feature: LicenseFeature): boolean {
    const org = this.organizations.get(orgId);
    if (!org?.license) {
      return false;
    }

    if (org.license.status !== 'active') {
      return false;
    }

    if (org.license.expirationDate < Date.now()) {
      org.license.status = 'expired';
      this.emit('license:expired', org.license);
      return false;
    }

    return org.license.features.includes(feature);
  }

  /**
   * 检查座位数
   */
  hasAvailableSeats(orgId: string): boolean {
    const org = this.organizations.get(orgId);
    if (!org?.license) {
      return false;
    }

    return org.license.usedSeats < org.license.seats;
  }

  // ============================================================================
  // SSO 管理 (SSO Management)
  // ============================================================================

  /**
   * 配置 SSO
   */
  configureSso(
    orgId: string,
    providerType: SsoProviderType,
    providerName: string,
    config: SsoConfig['config']
  ): SsoConfig {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization ${orgId} not found`);
    }

    if (!this.hasFeature(orgId, 'sso')) {
      throw new Error('SSO feature is not available for this organization');
    }

    const ssoConfig: SsoConfig = {
      id: uuidv4(),
      organizationId: orgId,
      providerType,
      providerName,
      enabled: false,
      config,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.ssoConfigs.set(ssoConfig.id, ssoConfig);
    this.emit('sso:configured', ssoConfig);
    this.logAudit('sso_config_created', orgId, 'admin', {
      details: { providerType, providerName },
    });

    return ssoConfig;
  }

  /**
   * 启用 SSO
   */
  enableSso(orgId: string): void {
    const config = this.getSsoConfig(orgId);
    if (!config) {
      throw new Error('SSO is not configured');
    }

    config.enabled = true;
    config.updatedAt = Date.now();

    this.emit('sso:enabled', orgId);
    this.logAudit('sso_config_updated', orgId, 'admin', {
      details: { enabled: true },
    });
  }

  /**
   * 禁用 SSO
   */
  disableSso(orgId: string): void {
    const config = this.getSsoConfig(orgId);
    if (!config) {
      return;
    }

    config.enabled = false;
    config.updatedAt = Date.now();

    this.emit('sso:disabled', orgId);
    this.logAudit('sso_config_updated', orgId, 'admin', {
      details: { enabled: false },
    });
  }

  /**
   * 获取 SSO 配置
   */
  getSsoConfig(orgId: string): SsoConfig | undefined {
    for (const config of this.ssoConfigs.values()) {
      if (config.organizationId === orgId) {
        return config;
      }
    }
    return undefined;
  }

  // ============================================================================
  // API 密钥管理 (API Key Management)
  // ============================================================================

  /**
   * 创建 API 密钥
   */
  createApiKey(
    orgId: string,
    createdBy: string,
    name: string,
    scopes: ApiScope[],
    options?: {
      description?: string;
      expiresAt?: number;
      rateLimit?: { requestsPerMinute: number; requestsPerDay: number };
    }
  ): ApiKey {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization ${orgId} not found`);
    }

    if (!this.hasFeature(orgId, 'api_access')) {
      throw new Error('API access is not available for this organization');
    }

    // 检查 API 密钥数量限制
    const existingKeys = Array.from(this.apiKeys.values())
      .filter(k => k.organizationId === orgId && k.enabled);
    if (existingKeys.length >= this.config.maxApiKeys) {
      throw new Error(`Maximum API key limit (${this.config.maxApiKeys}) reached`);
    }

    // 生成密钥
    const key = `hk_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = key.substring(0, 10);

    const apiKey: ApiKey = {
      id: uuidv4(),
      organizationId: orgId,
      createdBy,
      name,
      description: options?.description,
      key, // 只在创建时返回
      keyPrefix,
      scopes,
      createdAt: Date.now(),
      expiresAt: options?.expiresAt,
      enabled: true,
      rateLimit: options?.rateLimit,
    };

    // 存储时移除完整密钥
    const storedKey = { ...apiKey };
    delete storedKey.key;
    this.apiKeys.set(apiKey.id, storedKey);

    this.emit('api_key:created', storedKey);
    this.logAudit('security_api_key_created', orgId, createdBy, {
      details: { name, scopes },
    });

    return apiKey;
  }

  /**
   * 撤销 API 密钥
   */
  revokeApiKey(keyId: string): void {
    const key = this.apiKeys.get(keyId);
    if (!key) {
      throw new Error(`API key ${keyId} not found`);
    }

    key.enabled = false;

    this.emit('api_key:revoked', keyId);
    this.logAudit('security_api_key_revoked', key.organizationId, 'admin', {
      details: { keyId, name: key.name },
    });
  }

  /**
   * 获取组织的 API 密钥
   */
  getOrganizationApiKeys(orgId: string): ApiKey[] {
    return Array.from(this.apiKeys.values())
      .filter(key => key.organizationId === orgId);
  }

  /**
   * 验证 API 密钥
   */
  validateApiKey(keyValue: string): ApiKey | null {
    const keyPrefix = keyValue.substring(0, 10);

    for (const key of this.apiKeys.values()) {
      if (key.keyPrefix === keyPrefix && key.enabled) {
        // 检查过期
        if (key.expiresAt && key.expiresAt < Date.now()) {
          return null;
        }

        key.lastUsedAt = Date.now();
        return key;
      }
    }

    return null;
  }

  // ============================================================================
  // Webhook 管理 (Webhook Management)
  // ============================================================================

  /**
   * 创建 Webhook
   */
  createWebhook(
    orgId: string,
    name: string,
    url: string,
    events: string[],
    secret?: string
  ): WebhookConfig {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization ${orgId} not found`);
    }

    const webhook: WebhookConfig = {
      id: uuidv4(),
      organizationId: orgId,
      name,
      url,
      secret,
      events,
      enabled: true,
      createdAt: Date.now(),
      failureCount: 0,
      paused: false,
    };

    this.webhooks.set(webhook.id, webhook);
    return webhook;
  }

  /**
   * 触发 Webhook
   */
  async triggerWebhooks(orgId: string, event: string, payload: unknown): Promise<void> {
    const webhooks = Array.from(this.webhooks.values())
      .filter(w => w.organizationId === orgId && w.enabled && !w.paused && w.events.includes(event));

    for (const webhook of webhooks) {
      try {
        // 实际实现中应该发送 HTTP 请求
        webhook.lastTriggeredAt = Date.now();
        this.emit('webhook:triggered', webhook.id, event);
      } catch {
        webhook.failureCount++;
        if (webhook.failureCount >= 5) {
          webhook.paused = true;
        }
      }
    }
  }

  // ============================================================================
  // 审计日志 (Audit Logging)
  // ============================================================================

  /**
   * 记录审计日志
   */
  logAudit(
    eventType: EnterpriseAuditEventType,
    orgId: string,
    actorId: string,
    options?: {
      actorType?: 'user' | 'admin' | 'system' | 'api';
      resource?: { type: string; id: string; name?: string };
      details?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
      result?: 'success' | 'failure';
      errorMessage?: string;
    }
  ): EnterpriseAuditLogEntry {
    const entry: EnterpriseAuditLogEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      eventType,
      organizationId: orgId,
      actorId,
      actorType: options?.actorType || 'user',
      resource: options?.resource,
      details: options?.details,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      result: options?.result || 'success',
      errorMessage: options?.errorMessage,
    };

    this.auditLogs.push(entry);

    // 限制日志数量
    const maxLogs = 100000;
    if (this.auditLogs.length > maxLogs) {
      this.auditLogs = this.auditLogs.slice(-maxLogs);
    }

    this.emit('audit:logged', entry);
    return entry;
  }

  /**
   * 搜索审计日志
   */
  searchAuditLogs(query: {
    organizationId?: string;
    eventTypes?: EnterpriseAuditEventType[];
    actorId?: string;
    startTime?: number;
    endTime?: number;
    result?: 'success' | 'failure';
  }): EnterpriseAuditLogEntry[] {
    return this.auditLogs.filter(entry => {
      if (query.organizationId && entry.organizationId !== query.organizationId) {
        return false;
      }
      if (query.eventTypes && !query.eventTypes.includes(entry.eventType)) {
        return false;
      }
      if (query.actorId && entry.actorId !== query.actorId) {
        return false;
      }
      if (query.startTime && entry.timestamp < query.startTime) {
        return false;
      }
      if (query.endTime && entry.timestamp > query.endTime) {
        return false;
      }
      if (query.result && entry.result !== query.result) {
        return false;
      }
      return true;
    });
  }

  // ============================================================================
  // 合规管理 (Compliance Management)
  // ============================================================================

  /**
   * 配置合规设置
   */
  configureCompliance(orgId: string, config: Partial<ComplianceConfig>): ComplianceConfig {
    const existing = this.complianceConfigs.get(orgId);

    const complianceConfig: ComplianceConfig = {
      organizationId: orgId,
      enabledStandards: config.enabledStandards || [],
      dataClassification: {
        enabled: config.dataClassification?.enabled ?? false,
        defaultLevel: config.dataClassification?.defaultLevel ?? 'internal',
        autoClassify: config.dataClassification?.autoClassify ?? false,
      },
      dataRetention: {
        enabled: config.dataRetention?.enabled ?? false,
        defaultRetentionDays: config.dataRetention?.defaultRetentionDays ?? 365,
        byDataType: config.dataRetention?.byDataType ?? {},
      },
      subjectRequests: {
        enabled: config.subjectRequests?.enabled ?? false,
        autoProcess: config.subjectRequests?.autoProcess ?? false,
        notifyAdmin: config.subjectRequests?.notifyAdmin ?? true,
      },
      ...existing,
      ...config,
    };

    this.complianceConfigs.set(orgId, complianceConfig);
    return complianceConfig;
  }

  /**
   * 创建数据主体请求
   */
  createDataSubjectRequest(
    orgId: string,
    requesterEmail: string,
    requestType: DataSubjectRequest['requestType']
  ): DataSubjectRequest {
    const request: DataSubjectRequest = {
      id: uuidv4(),
      organizationId: orgId,
      requestType,
      requesterEmail,
      status: 'pending',
      createdAt: Date.now(),
      dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    };

    this.dataRequests.set(request.id, request);
    this.logAudit('data_access_requested', orgId, 'system', {
      details: { requestType, requesterEmail },
    });

    return request;
  }

  /**
   * 处理数据主体请求
   */
  processDataSubjectRequest(requestId: string, processedBy: string, notes?: string): void {
    const request = this.dataRequests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    request.status = 'completed';
    request.processedAt = Date.now();
    request.processedBy = processedBy;
    request.notes = notes;
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.removeAllListeners();
  }
}

// ============================================================================
// 单例管理 (Singleton Management)
// ============================================================================

let enterpriseManagerInstance: EnterpriseManager | null = null;

/**
 * 获取企业管理器实例
 */
export function getEnterpriseManager(): EnterpriseManager {
  if (!enterpriseManagerInstance) {
    enterpriseManagerInstance = new EnterpriseManager();
  }
  return enterpriseManagerInstance;
}

/**
 * 创建企业管理器
 */
export function createEnterpriseManager(
  config?: Partial<EnterpriseManagerConfig>
): EnterpriseManager {
  enterpriseManagerInstance = new EnterpriseManager(config);
  return enterpriseManagerInstance;
}

/**
 * 设置企业管理器实例
 */
export function setEnterpriseManager(manager: EnterpriseManager): void {
  enterpriseManagerInstance = manager;
}
