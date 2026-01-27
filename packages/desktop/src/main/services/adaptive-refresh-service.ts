/**
 * 自适应刷新率服务
 * 参考 steipete/VibeMeter 的 AdaptiveRefreshManager 模式
 *
 * 根据用户活动水平动态调整屏幕监控的刷新间隔，
 * 在保持响应性的同时优化资源使用。
 */

export interface AdaptiveRefreshConfig {
  /** 最小刷新间隔 (ms)，高活跃时使用 */
  minInterval: number;
  /** 最大刷新间隔 (ms)，空闲时使用 */
  maxInterval: number;
  /** 默认刷新间隔 (ms) */
  defaultInterval: number;
  /** 活动衰减系数 (每秒衰减比例) */
  activityDecayRate: number;
  /** 活动增益系数 (每次活动增加的分数) */
  activityGainRate: number;
  /** 是否启用自适应刷新 */
  enabled: boolean;
}

export const DEFAULT_ADAPTIVE_REFRESH_CONFIG: AdaptiveRefreshConfig = {
  minInterval: 1000,      // 1秒 - 高活跃
  maxInterval: 10000,     // 10秒 - 空闲
  defaultInterval: 3000,  // 3秒 - 默认
  activityDecayRate: 0.1, // 每秒衰减 10%
  activityGainRate: 20,   // 每次活动增加 20 分
  enabled: true,
};

/**
 * 活动等级阈值
 * 参考 VibeMeter 的 usageLevel 分级
 */
export enum ActivityLevel {
  /** 空闲 - 活动分数 < 20 */
  IDLE = 'idle',
  /** 低活跃 - 活动分数 20-50 */
  LOW = 'low',
  /** 正常 - 活动分数 50-70 */
  NORMAL = 'normal',
  /** 高活跃 - 活动分数 70-90 */
  HIGH = 'high',
  /** 非常活跃 - 活动分数 > 90 */
  VERY_HIGH = 'very_high',
}

/**
 * 活动事件类型
 */
export type ActivityEventType =
  | 'screen_change'     // 屏幕内容变化
  | 'user_interaction'  // 用户交互（点击、输入等）
  | 'window_switch'     // 窗口切换
  | 'clipboard_change'  // 剪贴板变化
  | 'ai_request'        // AI 请求
  | 'plan_execution';   // 计划执行

/**
 * 活动记录
 */
interface ActivityRecord {
  type: ActivityEventType;
  timestamp: number;
  weight: number;
}

/**
 * 自适应刷新率服务
 *
 * 核心算法：
 * 1. 维护一个活动分数 (0-100)
 * 2. 活动事件增加分数，时间流逝减少分数
 * 3. 根据分数映射到刷新间隔
 *
 * 分数 -> 间隔映射：
 * - > 90 分: 1000ms (非常活跃)
 * - 70-90 分: 2000ms (高活跃)
 * - 50-70 分: 3000ms (正常)
 * - 20-50 分: 5000ms (低活跃)
 * - < 20 分: 10000ms (空闲)
 */
export class AdaptiveRefreshService {
  private config: AdaptiveRefreshConfig;
  private activityScore: number = 50; // 初始为正常活跃
  private activityHistory: ActivityRecord[] = [];
  private decayTimer: NodeJS.Timeout | null = null;
  private lastUpdateTime: number = Date.now();
  private onIntervalChange?: (interval: number, level: ActivityLevel) => void;

  constructor(config: Partial<AdaptiveRefreshConfig> = {}) {
    this.config = { ...DEFAULT_ADAPTIVE_REFRESH_CONFIG, ...config };
  }

  /**
   * 启动自适应刷新服务
   */
  start(): void {
    if (!this.config.enabled) return;

    // 启动活动衰减定时器
    this.decayTimer = setInterval(() => {
      this.decayActivity();
    }, 1000); // 每秒更新一次
  }

  /**
   * 停止服务
   */
  stop(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
    }
  }

  /**
   * 记录活动事件
   * @param type 活动类型
   * @param weight 权重倍数 (默认 1.0)
   */
  recordActivity(type: ActivityEventType, weight: number = 1.0): void {
    if (!this.config.enabled) return;

    const record: ActivityRecord = {
      type,
      timestamp: Date.now(),
      weight,
    };

    this.activityHistory.push(record);

    // 保持历史记录在合理范围内
    if (this.activityHistory.length > 100) {
      this.activityHistory = this.activityHistory.slice(-50);
    }

    // 增加活动分数
    const gain = this.config.activityGainRate * weight * this.getEventWeight(type);
    this.activityScore = Math.min(100, this.activityScore + gain);

    // 通知间隔变化
    this.notifyIntervalChange();
  }

  /**
   * 获取当前推荐的刷新间隔
   */
  getCurrentInterval(): number {
    if (!this.config.enabled) {
      return this.config.defaultInterval;
    }

    return this.scoreToInterval(this.activityScore);
  }

  /**
   * 获取当前活动等级
   */
  getActivityLevel(): ActivityLevel {
    if (this.activityScore > 90) return ActivityLevel.VERY_HIGH;
    if (this.activityScore > 70) return ActivityLevel.HIGH;
    if (this.activityScore > 50) return ActivityLevel.NORMAL;
    if (this.activityScore > 20) return ActivityLevel.LOW;
    return ActivityLevel.IDLE;
  }

  /**
   * 获取当前活动分数
   */
  getActivityScore(): number {
    return Math.round(this.activityScore);
  }

  /**
   * 获取服务状态
   */
  getStatus(): {
    enabled: boolean;
    activityScore: number;
    activityLevel: ActivityLevel;
    currentInterval: number;
    recentActivityCount: number;
  } {
    const now = Date.now();
    const recentActivityCount = this.activityHistory.filter(
      r => now - r.timestamp < 60000 // 最近 1 分钟的活动数
    ).length;

    return {
      enabled: this.config.enabled,
      activityScore: this.getActivityScore(),
      activityLevel: this.getActivityLevel(),
      currentInterval: this.getCurrentInterval(),
      recentActivityCount,
    };
  }

  /**
   * 设置间隔变化回调
   */
  setOnIntervalChange(callback: (interval: number, level: ActivityLevel) => void): void {
    this.onIntervalChange = callback;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AdaptiveRefreshConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // 处理启用/禁用状态变化
    if (!wasEnabled && this.config.enabled) {
      this.start();
    } else if (wasEnabled && !this.config.enabled) {
      this.stop();
    }
  }

  /**
   * 重置活动状态
   */
  reset(): void {
    this.activityScore = 50;
    this.activityHistory = [];
    this.lastUpdateTime = Date.now();
  }

  // ============ 私有方法 ============

  /**
   * 活动衰减
   * 每秒调用，按配置的衰减率降低活动分数
   */
  private decayActivity(): void {
    const now = Date.now();
    const elapsed = (now - this.lastUpdateTime) / 1000; // 秒
    this.lastUpdateTime = now;

    // 指数衰减: score = score * (1 - decayRate) ^ elapsed
    const decayFactor = Math.pow(1 - this.config.activityDecayRate, elapsed);
    const previousScore = this.activityScore;
    this.activityScore = Math.max(0, this.activityScore * decayFactor);

    // 如果分数变化超过阈值，通知变化
    if (Math.abs(previousScore - this.activityScore) > 5) {
      this.notifyIntervalChange();
    }
  }

  /**
   * 根据活动分数计算刷新间隔
   * 使用分段线性映射
   */
  private scoreToInterval(score: number): number {
    const { minInterval, maxInterval } = this.config;

    // 分段映射：
    // 90-100 分 -> minInterval (1秒)
    // 70-90 分 -> 2秒
    // 50-70 分 -> 3秒
    // 20-50 分 -> 5秒
    // 0-20 分 -> maxInterval (10秒)

    if (score > 90) return minInterval;
    if (score > 70) return 2000;
    if (score > 50) return 3000;
    if (score > 20) return 5000;
    return maxInterval;
  }

  /**
   * 获取事件类型的权重
   * 不同类型的活动对活跃度的影响不同
   */
  private getEventWeight(type: ActivityEventType): number {
    switch (type) {
      case 'user_interaction':
        return 1.5;  // 用户交互权重最高
      case 'ai_request':
        return 1.2;  // AI 请求表示用户正在积极使用
      case 'plan_execution':
        return 1.0;  // 计划执行是正常活动
      case 'window_switch':
        return 0.8;  // 窗口切换频繁发生
      case 'screen_change':
        return 0.5;  // 屏幕变化可能是被动的
      case 'clipboard_change':
        return 0.7;  // 剪贴板操作
      default:
        return 1.0;
    }
  }

  /**
   * 通知间隔变化
   */
  private notifyIntervalChange(): void {
    if (this.onIntervalChange) {
      this.onIntervalChange(
        this.getCurrentInterval(),
        this.getActivityLevel()
      );
    }
  }
}

// 单例
let adaptiveRefreshInstance: AdaptiveRefreshService | null = null;

export function getAdaptiveRefreshService(): AdaptiveRefreshService {
  if (!adaptiveRefreshInstance) {
    adaptiveRefreshInstance = new AdaptiveRefreshService();
  }
  return adaptiveRefreshInstance;
}

export function createAdaptiveRefreshService(
  config?: Partial<AdaptiveRefreshConfig>
): AdaptiveRefreshService {
  adaptiveRefreshInstance = new AdaptiveRefreshService(config);
  return adaptiveRefreshInstance;
}
