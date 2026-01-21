/**
 * 权限管理器
 * Permission Manager
 *
 * 管理权限定义、授权状态和权限请求流程
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  Permission,
  PermissionCategory,
  PermissionScope,
  PermissionGrant,
  PermissionStatus,
  PermissionRequest,
  PermissionResponse,
  PermissionManagerConfig,
  Role,
  RiskLevel,
  RememberDuration,
  ApprovalPolicy,
  DEFAULT_APPROVAL_POLICY,
} from './types';

/**
 * 内置权限定义
 */
export const BUILTIN_PERMISSIONS: Permission[] = [
  // 文件权限
  {
    id: 'file.read',
    name: '读取文件',
    description: '读取文件内容',
    category: 'file',
    riskLevel: 'low',
    defaultGranted: true,
  },
  {
    id: 'file.write',
    name: '写入文件',
    description: '创建或修改文件内容',
    category: 'file',
    riskLevel: 'medium',
  },
  {
    id: 'file.delete',
    name: '删除文件',
    description: '删除文件或目录',
    category: 'file',
    riskLevel: 'high',
  },
  {
    id: 'file.move',
    name: '移动文件',
    description: '移动或重命名文件',
    category: 'file',
    riskLevel: 'medium',
  },

  // Shell 权限
  {
    id: 'shell.read',
    name: '执行只读命令',
    description: '执行不会修改系统状态的命令',
    category: 'shell',
    riskLevel: 'low',
    defaultGranted: true,
  },
  {
    id: 'shell.write',
    name: '执行写入命令',
    description: '执行可能修改系统状态的命令',
    category: 'shell',
    riskLevel: 'high',
  },
  {
    id: 'shell.sudo',
    name: '执行管理员命令',
    description: '以管理员权限执行命令',
    category: 'shell',
    riskLevel: 'critical',
  },

  // 应用权限
  {
    id: 'app.launch',
    name: '启动应用',
    description: '启动应用程序',
    category: 'app',
    riskLevel: 'low',
  },
  {
    id: 'app.control',
    name: '控制应用',
    description: '控制应用程序行为（点击、输入等）',
    category: 'app',
    riskLevel: 'medium',
  },
  {
    id: 'app.terminate',
    name: '终止应用',
    description: '强制终止应用程序',
    category: 'app',
    riskLevel: 'high',
  },

  // 浏览器权限
  {
    id: 'browser.navigate',
    name: '浏览器导航',
    description: '在浏览器中打开网页',
    category: 'browser',
    riskLevel: 'low',
  },
  {
    id: 'browser.input',
    name: '浏览器输入',
    description: '在浏览器中输入文本',
    category: 'browser',
    riskLevel: 'medium',
  },
  {
    id: 'browser.download',
    name: '浏览器下载',
    description: '从浏览器下载文件',
    category: 'browser',
    riskLevel: 'high',
  },

  // 网络权限
  {
    id: 'network.fetch',
    name: '网络请求',
    description: '发送网络请求',
    category: 'network',
    riskLevel: 'low',
  },
  {
    id: 'network.upload',
    name: '上传数据',
    description: '上传数据到远程服务器',
    category: 'network',
    riskLevel: 'high',
  },

  // 系统权限
  {
    id: 'system.clipboard.read',
    name: '读取剪贴板',
    description: '读取系统剪贴板内容',
    category: 'system',
    riskLevel: 'low',
  },
  {
    id: 'system.clipboard.write',
    name: '写入剪贴板',
    description: '写入内容到系统剪贴板',
    category: 'system',
    riskLevel: 'low',
  },
  {
    id: 'system.notification',
    name: '系统通知',
    description: '发送系统通知',
    category: 'system',
    riskLevel: 'low',
    defaultGranted: true,
  },
  {
    id: 'system.screenshot',
    name: '屏幕截图',
    description: '捕获屏幕内容',
    category: 'system',
    riskLevel: 'medium',
  },
];

/**
 * 内置角色定义
 */
export const BUILTIN_ROLES: Role[] = [
  {
    id: 'observer',
    name: '观察者',
    description: '只能观察，不能执行任何操作',
    permissions: ['file.read', 'shell.read', 'system.clipboard.read'],
  },
  {
    id: 'executor',
    name: '执行者',
    description: '可以执行低风险操作',
    permissions: [
      'file.read',
      'file.write',
      'file.move',
      'shell.read',
      'app.launch',
      'app.control',
      'browser.navigate',
      'browser.input',
      'network.fetch',
      'system.clipboard.read',
      'system.clipboard.write',
      'system.notification',
    ],
  },
  {
    id: 'admin',
    name: '管理员',
    description: '可以执行所有操作',
    permissions: BUILTIN_PERMISSIONS.map(p => p.id),
  },
];

/**
 * 权限管理器事件
 */
export interface PermissionManagerEvents {
  'permission:requested': (request: PermissionRequest) => void;
  'permission:granted': (grant: PermissionGrant) => void;
  'permission:denied': (permissionId: string, reason?: string) => void;
  'permission:revoked': (permissionId: string) => void;
  'permission:expired': (permissionId: string) => void;
}

/**
 * 权限管理器
 */
export class PermissionManager extends EventEmitter {
  private permissions: Map<string, Permission> = new Map();
  private roles: Map<string, Role> = new Map();
  private grants: Map<string, PermissionGrant> = new Map();
  private pendingRequests: Map<string, PermissionRequest> = new Map();
  private approvalPolicy: ApprovalPolicy;
  private currentRole: string = 'executor';

  constructor(config?: Partial<PermissionManagerConfig>) {
    super();

    this.approvalPolicy = config?.approvalPolicy ?? DEFAULT_APPROVAL_POLICY;

    // 注册内置权限
    for (const permission of BUILTIN_PERMISSIONS) {
      this.permissions.set(permission.id, permission);
    }

    // 注册自定义权限
    if (config?.permissions) {
      for (const permission of config.permissions) {
        this.permissions.set(permission.id, permission);
      }
    }

    // 注册内置角色
    for (const role of BUILTIN_ROLES) {
      this.roles.set(role.id, role);
    }

    // 注册自定义角色
    if (config?.roles) {
      for (const role of config.roles) {
        this.roles.set(role.id, role);
      }
    }

    // 授予默认权限
    const defaultPerms = config?.defaultPermissions ?? [];
    for (const permId of defaultPerms) {
      this.grantPermission(permId, 'system');
    }

    // 授予默认授权的权限
    for (const [id, permission] of this.permissions) {
      if (permission.defaultGranted) {
        this.grantPermission(id, 'system');
      }
    }

    // 启动过期检查
    this.startExpirationCheck();
  }

  /**
   * 设置当前角色
   */
  setRole(roleId: string): void {
    if (!this.roles.has(roleId)) {
      throw new Error(`Role not found: ${roleId}`);
    }
    this.currentRole = roleId;
  }

  /**
   * 获取当前角色
   */
  getRole(): Role | undefined {
    return this.roles.get(this.currentRole);
  }

  /**
   * 获取权限定义
   */
  getPermission(permissionId: string): Permission | undefined {
    return this.permissions.get(permissionId);
  }

  /**
   * 获取所有权限
   */
  getAllPermissions(): Permission[] {
    return Array.from(this.permissions.values());
  }

  /**
   * 获取权限分类
   */
  getPermissionsByCategory(category: PermissionCategory): Permission[] {
    return this.getAllPermissions().filter(p => p.category === category);
  }

  /**
   * 检查是否有权限
   */
  hasPermission(permissionId: string, scope?: PermissionScope): boolean {
    // 检查角色是否包含此权限
    const role = this.getRole();
    if (role && !role.permissions.includes(permissionId)) {
      return false;
    }

    // 检查授权状态
    const grant = this.grants.get(permissionId);
    if (!grant) {
      return false;
    }

    if (grant.status !== 'granted') {
      return false;
    }

    // 检查是否过期
    if (grant.expiresAt && grant.expiresAt < Date.now()) {
      this.revokePermission(permissionId);
      this.emit('permission:expired', permissionId);
      return false;
    }

    // 检查作用域
    if (scope && grant.scope) {
      if (!this.isScopeAllowed(scope, grant.scope)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查作用域是否被允许
   */
  private isScopeAllowed(
    requested: PermissionScope,
    granted: PermissionScope
  ): boolean {
    // 检查路径
    if (requested.paths && granted.paths) {
      for (const path of requested.paths) {
        const allowed = granted.paths.some(grantedPath =>
          path.startsWith(grantedPath)
        );
        if (!allowed) return false;
      }
    }

    // 检查命令
    if (requested.commands && granted.commands) {
      for (const cmd of requested.commands) {
        if (!granted.commands.includes(cmd)) return false;
      }
    }

    // 检查域名
    if (requested.domains && granted.domains) {
      for (const domain of requested.domains) {
        const allowed = granted.domains.some(grantedDomain =>
          domain.endsWith(grantedDomain)
        );
        if (!allowed) return false;
      }
    }

    // 检查应用
    if (requested.apps && granted.apps) {
      for (const app of requested.apps) {
        if (!granted.apps.includes(app)) return false;
      }
    }

    return true;
  }

  /**
   * 授予权限
   */
  grantPermission(
    permissionId: string,
    grantedBy: 'user' | 'system' | 'auto',
    options?: {
      duration?: RememberDuration;
      scope?: PermissionScope;
      reason?: string;
    }
  ): void {
    const permission = this.permissions.get(permissionId);
    if (!permission) {
      throw new Error(`Permission not found: ${permissionId}`);
    }

    const now = Date.now();
    let expiresAt: number | undefined;

    // 计算过期时间
    if (options?.duration && options.duration !== 'forever') {
      switch (options.duration) {
        case 'session':
          // 会话结束时过期（由 SessionManager 管理）
          expiresAt = now + 24 * 60 * 60 * 1000; // 默认 24 小时
          break;
        case 'day':
          expiresAt = now + 24 * 60 * 60 * 1000;
          break;
        case 'week':
          expiresAt = now + 7 * 24 * 60 * 60 * 1000;
          break;
      }
    }

    const grant: PermissionGrant = {
      permissionId,
      status: 'granted',
      grantedAt: now,
      expiresAt,
      grantedBy,
      scope: options?.scope,
      reason: options?.reason,
    };

    this.grants.set(permissionId, grant);
    this.emit('permission:granted', grant);
  }

  /**
   * 拒绝权限
   */
  denyPermission(permissionId: string, reason?: string): void {
    const grant: PermissionGrant = {
      permissionId,
      status: 'denied',
      grantedBy: 'user',
      reason,
    };

    this.grants.set(permissionId, grant);
    this.emit('permission:denied', permissionId, reason);
  }

  /**
   * 撤销权限
   */
  revokePermission(permissionId: string): void {
    this.grants.delete(permissionId);
    this.emit('permission:revoked', permissionId);
  }

  /**
   * 请求权限
   */
  async requestPermission(
    permissionId: string,
    context: {
      reason: string;
      planId?: string;
      stepId?: string;
      actionDescription: string;
      potentialImpact: string[];
      scope?: PermissionScope;
    }
  ): Promise<PermissionResponse> {
    const permission = this.permissions.get(permissionId);
    if (!permission) {
      throw new Error(`Permission not found: ${permissionId}`);
    }

    // 检查是否已有权限
    if (this.hasPermission(permissionId, context.scope)) {
      return {
        requestId: uuidv4(),
        granted: true,
        respondedAt: Date.now(),
        respondedBy: 'system',
      };
    }

    // 检查是否可以自动批准
    const autoApproved = this.canAutoApprove(permission);
    if (autoApproved) {
      this.grantPermission(permissionId, 'auto', {
        duration: 'session',
        scope: context.scope,
        reason: 'Auto-approved based on risk level',
      });

      return {
        requestId: uuidv4(),
        granted: true,
        respondedAt: Date.now(),
        respondedBy: 'auto',
      };
    }

    // 创建权限请求
    const request: PermissionRequest = {
      id: uuidv4(),
      permissionId,
      requestedAt: Date.now(),
      reason: context.reason,
      scope: context.scope,
      requiredBy: context.planId ?? 'unknown',
      context: {
        planId: context.planId,
        stepId: context.stepId,
        actionDescription: context.actionDescription,
        potentialImpact: context.potentialImpact,
      },
    };

    this.pendingRequests.set(request.id, request);
    this.emit('permission:requested', request);

    // 返回一个 Promise，等待用户响应
    return new Promise((resolve) => {
      const handler = (response: PermissionResponse) => {
        if (response.requestId === request.id) {
          this.pendingRequests.delete(request.id);
          this.off('permission:response', handler);

          if (response.granted) {
            this.grantPermission(permissionId, 'user', {
              duration: response.rememberDuration,
              scope: response.scope,
            });
          } else {
            this.denyPermission(permissionId);
          }

          resolve(response);
        }
      };

      this.on('permission:response', handler);
    });
  }

  /**
   * 响应权限请求
   */
  respondToRequest(response: PermissionResponse): void {
    this.emit('permission:response', response);
  }

  /**
   * 获取待处理的权限请求
   */
  getPendingRequests(): PermissionRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * 检查是否可以自动批准
   */
  private canAutoApprove(permission: Permission): boolean {
    if (this.approvalPolicy.autoApproveBelow === 'none') {
      return false;
    }

    const riskOrder: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    const thresholdIndex = riskOrder.indexOf(this.approvalPolicy.autoApproveBelow);
    const permissionIndex = riskOrder.indexOf(permission.riskLevel);

    return permissionIndex <= thresholdIndex;
  }

  /**
   * 获取权限授权状态
   */
  getGrant(permissionId: string): PermissionGrant | undefined {
    return this.grants.get(permissionId);
  }

  /**
   * 获取所有授权
   */
  getAllGrants(): PermissionGrant[] {
    return Array.from(this.grants.values());
  }

  /**
   * 清除所有会话级权限
   */
  clearSessionPermissions(): void {
    for (const [id, grant] of this.grants) {
      if (grant.expiresAt) {
        this.grants.delete(id);
      }
    }
  }

  /**
   * 启动过期检查
   */
  private startExpirationCheck(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, grant] of this.grants) {
        if (grant.expiresAt && grant.expiresAt < now) {
          this.revokePermission(id);
          this.emit('permission:expired', id);
        }
      }
    }, 60 * 1000); // 每分钟检查一次
  }

  /**
   * 导出权限状态
   */
  exportState(): {
    grants: PermissionGrant[];
    currentRole: string;
  } {
    return {
      grants: this.getAllGrants(),
      currentRole: this.currentRole,
    };
  }

  /**
   * 导入权限状态
   */
  importState(state: {
    grants: PermissionGrant[];
    currentRole: string;
  }): void {
    this.currentRole = state.currentRole;

    for (const grant of state.grants) {
      // 跳过已过期的权限
      if (grant.expiresAt && grant.expiresAt < Date.now()) {
        continue;
      }
      this.grants.set(grant.permissionId, grant);
    }
  }
}

/**
 * 创建权限管理器
 */
export function createPermissionManager(
  config?: Partial<PermissionManagerConfig>
): PermissionManager {
  return new PermissionManager(config);
}
