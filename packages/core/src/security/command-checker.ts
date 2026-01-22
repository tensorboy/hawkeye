/**
 * CommandChecker - 命令安全检查器
 *
 * 基于 Open Interpreter 安全模式
 * 在执行系统命令前进行安全检查
 */

import type {
  CommandCheckerConfig,
  CommandCheckResult,
  CommandType,
  DangerousPattern,
  DangerousPatternDef,
  RiskLevel,
  SecurityLevel,
} from './types';

/**
 * 默认危险模式定义
 */
const DEFAULT_DANGEROUS_PATTERNS: DangerousPatternDef[] = [
  // 系统破坏性命令
  {
    name: 'rm_recursive_force',
    pattern: /rm\s+(-[rRf]+\s+)*[\/~]/i,
    description: '递归删除系统目录',
    riskLevel: 'critical',
    applicableTypes: ['shell'],
  },
  {
    name: 'format_disk',
    pattern: /mkfs|format\s+[a-z]:/i,
    description: '格式化磁盘',
    riskLevel: 'critical',
    applicableTypes: ['shell'],
  },
  {
    name: 'dd_disk',
    pattern: /dd\s+.*of=\/dev\//i,
    description: 'dd 写入磁盘设备',
    riskLevel: 'critical',
    applicableTypes: ['shell'],
  },
  // 权限提升
  {
    name: 'sudo_dangerous',
    pattern: /sudo\s+(rm|chmod\s+777|chown|dd|mkfs)/i,
    description: 'sudo 执行危险命令',
    riskLevel: 'critical',
    applicableTypes: ['shell'],
  },
  {
    name: 'chmod_recursive',
    pattern: /chmod\s+-[rR]\s+[0-7]{3,4}/i,
    description: '递归修改权限',
    riskLevel: 'high',
    applicableTypes: ['shell'],
  },
  // 网络相关
  {
    name: 'curl_execute',
    pattern: /curl\s+.*\|\s*(bash|sh|python)/i,
    description: '从网络下载并执行脚本',
    riskLevel: 'critical',
    applicableTypes: ['shell', 'network'],
  },
  {
    name: 'wget_execute',
    pattern: /wget\s+.*(-O\s*-|\|\s*(bash|sh|python))/i,
    description: 'wget 下载并执行',
    riskLevel: 'critical',
    applicableTypes: ['shell', 'network'],
  },
  {
    name: 'reverse_shell',
    pattern: /nc\s+.*-e|bash\s+-i\s+>&|\/dev\/tcp\//i,
    description: '可能的反向 shell',
    riskLevel: 'critical',
    applicableTypes: ['shell', 'network'],
  },
  // 进程管理
  {
    name: 'kill_all',
    pattern: /kill\s+-9\s+-1|killall\s+-9/i,
    description: '杀死所有进程',
    riskLevel: 'critical',
    applicableTypes: ['shell', 'process'],
  },
  {
    name: 'fork_bomb',
    pattern: /:\(\)\s*{\s*:\|:\s*&\s*}\s*;?\s*:/,
    description: 'Fork bomb 攻击',
    riskLevel: 'critical',
    applicableTypes: ['shell'],
  },
  // 敏感文件
  {
    name: 'sensitive_files',
    pattern: /\/(etc\/passwd|etc\/shadow|\.ssh\/|\.aws\/|\.gnupg\/)/i,
    description: '访问敏感系统文件',
    riskLevel: 'high',
    applicableTypes: ['shell', 'file_read', 'file_write'],
  },
  {
    name: 'env_secrets',
    pattern: /\$\{?(API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\}?/i,
    description: '可能泄露敏感环境变量',
    riskLevel: 'medium',
    applicableTypes: ['shell'],
  },
  // 编码混淆
  {
    name: 'base64_execute',
    pattern: /base64\s+(-d|--decode).*\|\s*(bash|sh|eval)/i,
    description: 'Base64 解码后执行',
    riskLevel: 'high',
    applicableTypes: ['shell'],
  },
  {
    name: 'eval_command',
    pattern: /eval\s+['"$]/i,
    description: 'eval 执行动态命令',
    riskLevel: 'medium',
    applicableTypes: ['shell'],
  },
  // 历史记录
  {
    name: 'history_clear',
    pattern: /history\s+-[cd]|rm\s+.*\.bash_history/i,
    description: '清除命令历史',
    riskLevel: 'medium',
    applicableTypes: ['shell'],
  },
];

/**
 * 默认黑名单命令
 */
const DEFAULT_BLACKLISTED_COMMANDS: string[] = [
  // 系统破坏
  'rm -rf /',
  'rm -rf ~',
  'rm -rf *',
  ':(){:|:&};:',
  '> /dev/sda',
  'mkfs.',
  // 权限
  'chmod -R 777',
  'chown -R',
  // 网络危险
  'nc -e',
  '/dev/tcp/',
];

/**
 * 默认配置
 */
const DEFAULT_CONFIG: CommandCheckerConfig = {
  securityLevel: 'standard',
  blacklistedCommands: DEFAULT_BLACKLISTED_COMMANDS,
  whitelistedCommands: [],
  allowSudo: false,
  allowNetwork: true,
  allowProcessManagement: false,
  maxCommandLength: 10000,
  customDangerousPatterns: [],
};

/**
 * 命令安全检查器
 */
export class CommandChecker {
  private config: CommandCheckerConfig;
  private dangerousPatterns: DangerousPatternDef[];

  constructor(config: Partial<CommandCheckerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dangerousPatterns = [
      ...DEFAULT_DANGEROUS_PATTERNS,
      ...this.config.customDangerousPatterns,
    ];
  }

  /**
   * 检查命令安全性
   */
  check(command: string): CommandCheckResult {
    // 安全级别为 off 时跳过检查
    if (this.config.securityLevel === 'off') {
      return this.createAllowedResult(command, 'safe', 'shell');
    }

    const normalizedCommand = this.normalizeCommand(command);
    const commandType = this.detectCommandType(normalizedCommand);
    const warnings: string[] = [];
    const detectedPatterns: DangerousPattern[] = [];

    // 长度检查
    if (normalizedCommand.length > this.config.maxCommandLength) {
      return this.createBlockedResult(
        'critical',
        commandType,
        `命令长度超过限制 (${this.config.maxCommandLength})`,
        detectedPatterns
      );
    }

    // 白名单优先
    if (this.isWhitelisted(normalizedCommand)) {
      return this.createAllowedResult(command, 'safe', commandType);
    }

    // 黑名单检查
    const blacklistMatch = this.checkBlacklist(normalizedCommand);
    if (blacklistMatch) {
      return this.createBlockedResult(
        'critical',
        commandType,
        `命令在黑名单中: ${blacklistMatch}`,
        detectedPatterns
      );
    }

    // 危险模式检测
    for (const patternDef of this.dangerousPatterns) {
      if (patternDef.applicableTypes && !patternDef.applicableTypes.includes(commandType)) {
        continue;
      }

      const match = normalizedCommand.match(patternDef.pattern);
      if (match) {
        detectedPatterns.push({
          name: patternDef.name,
          matched: match[0],
          description: patternDef.description,
          severity: patternDef.riskLevel,
        });
      }
    }

    // 根据检测到的模式确定风险等级
    if (detectedPatterns.length > 0) {
      const maxRisk = this.getMaxRiskLevel(detectedPatterns.map((p) => p.severity));

      // 严格模式下任何风险都阻止
      if (this.config.securityLevel === 'strict' && maxRisk !== 'safe') {
        return this.createBlockedResult(
          maxRisk,
          commandType,
          `检测到危险模式: ${detectedPatterns.map((p) => p.name).join(', ')}`,
          detectedPatterns
        );
      }

      // 标准模式下高风险及以上阻止
      if (this.config.securityLevel === 'standard' && this.isHighOrAbove(maxRisk)) {
        // critical 直接阻止
        if (maxRisk === 'critical') {
          return this.createBlockedResult(
            maxRisk,
            commandType,
            `检测到严重危险: ${detectedPatterns.map((p) => p.name).join(', ')}`,
            detectedPatterns
          );
        }
        // high 需要确认
        return this.createConfirmResult(
          maxRisk,
          commandType,
          `检测到高风险模式，需要确认: ${detectedPatterns.map((p) => p.name).join(', ')}`,
          detectedPatterns,
          warnings
        );
      }

      // 宽松模式下只阻止 critical
      if (this.config.securityLevel === 'permissive' && maxRisk === 'critical') {
        return this.createBlockedResult(
          maxRisk,
          commandType,
          `检测到严重危险: ${detectedPatterns.map((p) => p.name).join(', ')}`,
          detectedPatterns
        );
      }

      // 添加警告
      for (const pattern of detectedPatterns) {
        warnings.push(`[${pattern.severity}] ${pattern.description}`);
      }
    }

    // sudo 检查
    if (!this.config.allowSudo && this.containsSudo(normalizedCommand)) {
      if (this.config.securityLevel === 'strict') {
        return this.createBlockedResult(
          'high',
          commandType,
          'sudo 命令不被允许',
          detectedPatterns
        );
      }
      warnings.push('命令包含 sudo，可能需要管理员权限');
    }

    // 网络检查
    if (!this.config.allowNetwork && this.containsNetwork(normalizedCommand)) {
      return this.createBlockedResult(
        'medium',
        commandType,
        '网络访问不被允许',
        detectedPatterns
      );
    }

    // 进程管理检查
    if (!this.config.allowProcessManagement && this.containsProcessManagement(normalizedCommand)) {
      return this.createBlockedResult(
        'medium',
        commandType,
        '进程管理不被允许',
        detectedPatterns
      );
    }

    // 计算最终风险等级
    const finalRiskLevel = detectedPatterns.length > 0
      ? this.getMaxRiskLevel(detectedPatterns.map((p) => p.severity))
      : 'safe';

    // 中等风险需要确认 (标准模式)
    if (this.config.securityLevel === 'standard' && finalRiskLevel === 'medium') {
      return this.createConfirmResult(
        finalRiskLevel,
        commandType,
        '命令存在中等风险，建议确认',
        detectedPatterns,
        warnings
      );
    }

    return {
      allowed: true,
      riskLevel: finalRiskLevel,
      commandType,
      reason: warnings.length > 0 ? `允许执行，但有警告` : '命令安全',
      requiresConfirmation: false,
      warnings,
      detectedPatterns,
    };
  }

  /**
   * 批量检查多个命令
   */
  checkMultiple(commands: string[]): Map<string, CommandCheckResult> {
    const results = new Map<string, CommandCheckResult>();
    for (const command of commands) {
      results.set(command, this.check(command));
    }
    return results;
  }

  /**
   * 获取命令的安全建议
   */
  getSuggestion(command: string): string | undefined {
    const result = this.check(command);
    if (!result.allowed && result.detectedPatterns.length > 0) {
      // 为常见危险模式提供建议
      for (const pattern of result.detectedPatterns) {
        if (pattern.name === 'rm_recursive_force') {
          return '建议使用 trash-cli 或 mv 到临时目录';
        }
        if (pattern.name === 'curl_execute') {
          return '建议先下载文件检查内容，再手动执行';
        }
        if (pattern.name === 'chmod_recursive') {
          return '建议明确指定目标目录，避免意外影响';
        }
      }
    }
    return undefined;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<CommandCheckerConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.customDangerousPatterns) {
      this.dangerousPatterns = [
        ...DEFAULT_DANGEROUS_PATTERNS,
        ...config.customDangerousPatterns,
      ];
    }
  }

  /**
   * 添加到白名单
   */
  addToWhitelist(command: string): void {
    if (!this.config.whitelistedCommands.includes(command)) {
      this.config.whitelistedCommands.push(command);
    }
  }

  /**
   * 添加到黑名单
   */
  addToBlacklist(command: string): void {
    if (!this.config.blacklistedCommands.includes(command)) {
      this.config.blacklistedCommands.push(command);
    }
  }

  // ===== Private Methods =====

  private normalizeCommand(command: string): string {
    return command
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private detectCommandType(command: string): CommandType {
    // 文件操作
    if (/^(cat|head|tail|less|more|grep|find|ls|dir)\s/i.test(command)) {
      return 'file_read';
    }
    if (/^(echo|printf|tee|sed|awk|>|>>)\s/i.test(command) || />/.test(command)) {
      return 'file_write';
    }
    if (/^(rm|del|unlink|rmdir)\s/i.test(command)) {
      return 'file_delete';
    }
    // 网络
    if (/^(curl|wget|ssh|scp|rsync|nc|netcat|telnet|ftp|http)/i.test(command)) {
      return 'network';
    }
    // 进程
    if (/^(kill|pkill|killall|ps|top|htop|pgrep)\s/i.test(command)) {
      return 'process';
    }
    // 系统
    if (/^(sudo|su|chmod|chown|mount|umount|systemctl|service)/i.test(command)) {
      return 'system';
    }
    // GUI
    if (/^(open|xdg-open|start|osascript|xdotool|wmctrl)/i.test(command)) {
      return 'gui';
    }

    return 'shell';
  }

  private isWhitelisted(command: string): boolean {
    return this.config.whitelistedCommands.some(
      (wl) => command.includes(wl.toLowerCase())
    );
  }

  private checkBlacklist(command: string): string | null {
    for (const bl of this.config.blacklistedCommands) {
      if (command.includes(bl.toLowerCase())) {
        return bl;
      }
    }
    return null;
  }

  private containsSudo(command: string): boolean {
    return /\bsudo\b/i.test(command);
  }

  private containsNetwork(command: string): boolean {
    return /\b(curl|wget|ssh|scp|rsync|nc|netcat|telnet|ftp|http)\b/i.test(command);
  }

  private containsProcessManagement(command: string): boolean {
    return /\b(kill|pkill|killall)\b/i.test(command);
  }

  private getMaxRiskLevel(levels: RiskLevel[]): RiskLevel {
    const order: RiskLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];
    let maxIndex = 0;
    for (const level of levels) {
      const index = order.indexOf(level);
      if (index > maxIndex) {
        maxIndex = index;
      }
    }
    return order[maxIndex];
  }

  private isHighOrAbove(level: RiskLevel): boolean {
    return level === 'high' || level === 'critical';
  }

  private createAllowedResult(
    _command: string,
    riskLevel: RiskLevel,
    commandType: CommandType
  ): CommandCheckResult {
    return {
      allowed: true,
      riskLevel,
      commandType,
      reason: '命令安全',
      requiresConfirmation: false,
      warnings: [],
      detectedPatterns: [],
    };
  }

  private createBlockedResult(
    riskLevel: RiskLevel,
    commandType: CommandType,
    reason: string,
    detectedPatterns: DangerousPattern[]
  ): CommandCheckResult {
    return {
      allowed: false,
      riskLevel,
      commandType,
      reason,
      requiresConfirmation: false,
      warnings: [],
      detectedPatterns,
    };
  }

  private createConfirmResult(
    riskLevel: RiskLevel,
    commandType: CommandType,
    reason: string,
    detectedPatterns: DangerousPattern[],
    warnings: string[]
  ): CommandCheckResult {
    return {
      allowed: true,
      riskLevel,
      commandType,
      reason,
      requiresConfirmation: true,
      warnings,
      detectedPatterns,
    };
  }
}

// ===== Singleton Support =====

let globalCommandChecker: CommandChecker | null = null;

export function getCommandChecker(): CommandChecker {
  if (!globalCommandChecker) {
    globalCommandChecker = new CommandChecker();
  }
  return globalCommandChecker;
}

export function createCommandChecker(config?: Partial<CommandCheckerConfig>): CommandChecker {
  return new CommandChecker(config);
}

export function setCommandChecker(checker: CommandChecker): void {
  globalCommandChecker = checker;
}
