/**
 * Security Permission Types - 安全权限类型定义
 * 定义工具权限、策略和条件
 */

/**
 * 权限级别
 */
export type PermissionLevel = 'allow' | 'prompt' | 'deny';

/**
 * 工具类别
 */
export type ToolCategory = 'shell' | 'file' | 'browser' | 'network' | 'system' | 'ai';

/**
 * 权限条件类型
 */
export type ConditionType =
  | 'path_match'      // 路径匹配
  | 'command_pattern' // 命令模式
  | 'rate_limit'      // 频率限制
  | 'time_window'     // 时间窗口
  | 'content_match';  // 内容匹配

/**
 * 权限条件
 */
export interface PermissionCondition {
  type: ConditionType;
  value: string | number | RegExp;
  negate?: boolean; // 是否取反
}

/**
 * 工具权限定义
 */
export interface ToolPermission {
  toolId: string;
  category: ToolCategory;
  level: PermissionLevel;
  conditions?: PermissionCondition[];
  reason?: string;
  expiresAt?: number; // 过期时间戳
  lastUsed?: number;
  usageCount: number;
}

/**
 * 策略规则
 */
export interface PolicyRule {
  id: string;
  pattern: string | RegExp;
  category?: ToolCategory;
  permission: PermissionLevel;
  reason?: string;
  priority: number;
}

/**
 * 权限策略
 */
export interface PermissionPolicy {
  id: string;
  name: string;
  description?: string;
  rules: PolicyRule[];
  enabled: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 权限检查结果
 */
export interface PermissionResult {
  allowed: boolean;
  level: PermissionLevel;
  reason?: string;
  matchedRule?: PolicyRule;
  requiresConfirmation: boolean;
}

/**
 * 执行上下文 (用于权限检查)
 */
export interface ExecutionContext {
  toolId: string;
  category: ToolCategory;
  action: string;
  parameters: Record<string, unknown>;
  source: 'user' | 'system' | 'plugin' | 'autonomous';
  timestamp: number;
  sessionId?: string;
}

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  toolId?: string;
  category?: ToolCategory;
  action: string;
  result: 'allowed' | 'denied' | 'prompted' | 'error';
  context: Partial<ExecutionContext>;
  details?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
}

/**
 * 审计事件类型
 */
export type AuditEventType =
  | 'permission_check'
  | 'permission_granted'
  | 'permission_denied'
  | 'permission_prompted'
  | 'policy_updated'
  | 'injection_detected'
  | 'rate_limit_exceeded'
  | 'sensitive_operation'
  | 'error';

/**
 * 注入检测结果
 */
export interface InjectionDetectionResult {
  detected: boolean;
  type?: InjectionType;
  confidence: number;
  pattern?: string;
  location?: string;
  recommendation?: string;
}

/**
 * 注入类型
 */
export type InjectionType =
  | 'prompt_injection'
  | 'command_injection'
  | 'path_traversal'
  | 'sql_injection'
  | 'script_injection'
  | 'data_exfiltration';

/**
 * MCP 工具验证结果
 */
export interface ToolValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedName?: string;
}

/**
 * 默认策略
 */
export const DEFAULT_POLICIES: PermissionPolicy[] = [
  {
    id: 'default-shell-policy',
    name: 'Shell Command Policy',
    description: 'Default policy for shell commands',
    enabled: true,
    priority: 100,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    rules: [
      {
        id: 'block-dangerous-commands',
        pattern: /^(rm\s+-rf|sudo\s+rm|mkfs|dd\s+if=|:(){ :|chmod\s+777)/i,
        category: 'shell',
        permission: 'deny',
        reason: 'Dangerous shell command blocked',
        priority: 1000,
      },
      {
        id: 'prompt-sudo',
        pattern: /^sudo\s+/i,
        category: 'shell',
        permission: 'prompt',
        reason: 'Sudo commands require confirmation',
        priority: 900,
      },
      {
        id: 'prompt-network',
        pattern: /^(curl|wget|nc|ssh|scp)\s+/i,
        category: 'shell',
        permission: 'prompt',
        reason: 'Network operations require confirmation',
        priority: 800,
      },
    ],
  },
  {
    id: 'default-file-policy',
    name: 'File Operation Policy',
    description: 'Default policy for file operations',
    enabled: true,
    priority: 100,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    rules: [
      {
        id: 'block-sensitive-paths',
        pattern: /^(\/etc\/passwd|\/etc\/shadow|~\/\.ssh|~\/\.gnupg)/i,
        category: 'file',
        permission: 'deny',
        reason: 'Access to sensitive paths blocked',
        priority: 1000,
      },
      {
        id: 'prompt-home-write',
        pattern: /^~\//,
        category: 'file',
        permission: 'prompt',
        reason: 'Writing to home directory requires confirmation',
        priority: 500,
      },
    ],
  },
];

/**
 * 危险命令黑名单
 */
export const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf *',
  'mkfs',
  'dd if=/dev/zero',
  ':(){:|:&};:',
  'chmod -R 777 /',
  'wget -O- | sh',
  'curl | sh',
  'eval',
  '> /dev/sda',
];

/**
 * 敏感路径列表
 */
export const SENSITIVE_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '~/.ssh',
  '~/.gnupg',
  '~/.aws',
  '~/.config/gcloud',
  '~/.kube',
  '/var/log',
  '/root',
];
