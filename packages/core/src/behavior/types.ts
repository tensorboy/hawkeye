/**
 * 行为追踪类型定义
 * 根据 PRD 6.2 行为数据模型实现
 */

// ============ 行为事件类型 ============

/**
 * 行为事件类型枚举
 */
export enum BehaviorEventType {
  // 应用相关
  APP_LAUNCH = 'app_launch',
  APP_CLOSE = 'app_close',
  APP_SWITCH = 'app_switch',

  // 窗口相关
  WINDOW_FOCUS = 'window_focus',
  WINDOW_RESIZE = 'window_resize',
  WINDOW_MOVE = 'window_move',

  // 文件相关
  FILE_OPEN = 'file_open',
  FILE_SAVE = 'file_save',
  FILE_CREATE = 'file_create',
  FILE_DELETE = 'file_delete',
  FILE_MOVE = 'file_move',

  // 剪贴板相关
  CLIPBOARD_COPY = 'clipboard_copy',
  CLIPBOARD_PASTE = 'clipboard_paste',

  // Hawkeye 交互
  SUGGESTION_VIEW = 'suggestion_view',
  SUGGESTION_ACCEPT = 'suggestion_accept',
  SUGGESTION_REJECT = 'suggestion_reject',
  SUGGESTION_MODIFY = 'suggestion_modify',
  EXECUTION_START = 'execution_start',
  EXECUTION_COMPLETE = 'execution_complete',

  // 浏览器相关
  BROWSER_NAVIGATE = 'browser_navigate',
  BROWSER_SEARCH = 'browser_search',
  BROWSER_BOOKMARK = 'browser_bookmark',

  // 输入相关
  KEYBOARD_SHORTCUT = 'keyboard_shortcut',
  COMMAND_EXECUTE = 'command_execute',
}

/**
 * 用户行为事件
 */
export interface BehaviorEvent {
  id: string;
  timestamp: number;

  /** 事件类型 */
  eventType: BehaviorEventType;

  /** 事件数据 */
  data: {
    action: string;
    target: string;
    context: Record<string, unknown>;
    duration?: number;
    result?: 'success' | 'failure' | 'cancelled';
  };

  /** 环境信息 */
  environment: {
    platform: string;
    activeApp: string;
    windowTitle: string;
    screenResolution?: string;
  };

  /** 用户反馈 */
  feedback?: {
    type: 'accept' | 'reject' | 'modify' | 'ignore';
    reason?: string;
    modifiedAction?: string;
  };
}

// ============ 时序模式类型 ============

/**
 * 时序模式
 */
export interface TemporalPattern {
  id: string;
  name: string;

  /** 模式类型 */
  type: 'daily' | 'weekly' | 'monthly' | 'event_triggered';

  /** 时间规则 */
  temporal: {
    /** 对于周期性模式 */
    schedule?: {
      hour?: number;
      minute?: number;
      dayOfWeek?: number[];
      dayOfMonth?: number[];
    };

    /** 对于事件触发模式 */
    trigger?: {
      event: BehaviorEventType;
      condition?: Record<string, unknown>;
    };

    /** 时间容差 (分钟) */
    toleranceMinutes: number;
  };

  /** 动作序列 */
  actionSequence: Array<{
    action: string;
    expectedDuration?: number;
    optional: boolean;
  }>;

  /** 统计信息 */
  statistics: {
    confidence: number;
    frequency: number;
    lastOccurrence: number;
    occurrenceHistory: number[];
    variability: number;
  };
}

// ============ 应用使用习惯类型 ============

/**
 * 应用使用习惯
 */
export interface AppUsageHabit {
  appId: string;
  appName: string;

  /** 使用统计 */
  usage: {
    totalDuration: number;
    averageSessionDuration: number;
    sessionCount: number;
    lastUsed: number;
    hourlyDistribution: number[];
    weeklyDistribution: number[];
  };

  /** 使用上下文 */
  context: {
    frequentCompanions: Array<{
      appName: string;
      coOccurrenceRate: number;
    }>;
    commonWorkflows: Array<{
      sequence: string[];
      frequency: number;
    }>;
    fileTypeAssociations: Array<{
      fileType: string;
      frequency: number;
    }>;
  };

  /** 偏好设置 */
  preferences: {
    preferredWindowSize?: { width: number; height: number };
    preferredPosition?: { x: number; y: number };
    commonKeyboardShortcuts: string[];
  };
}

// ============ 文件组织习惯类型 ============

/**
 * 文件组织习惯
 */
export interface FileOrganizationHabit {
  /** 目录偏好 */
  directoryPreferences: Array<{
    fileType: string;
    preferredPath: string;
    namingPattern?: string;
    confidence: number;
    exampleFiles: string[];
  }>;

  /** 整理模式 */
  organizationPatterns: Array<{
    trigger: 'download' | 'create' | 'receive' | 'periodic';
    sourcePattern: string;
    targetPattern: string;
    frequency: number;
  }>;

  /** 命名习惯 */
  namingConventions: Array<{
    context: string;
    pattern: string;
    examples: string[];
  }>;

  /** 清理习惯 */
  cleanupHabits: {
    downloadsCleanupFrequency?: 'daily' | 'weekly' | 'monthly' | 'never';
    trashEmptyFrequency?: 'daily' | 'weekly' | 'monthly' | 'never';
    tempFileRetention?: number;
  };
}

// ============ 习惯学习配置类型 ============

/**
 * 习惯学习配置
 */
export interface HabitLearningConfig {
  /** 学习参数 */
  learning: {
    minDataPoints: number;
    learningRate: number;
    forgetRate: number;
    confidenceThreshold: number;
  };

  /** 模式检测 */
  patternDetection: {
    enabled: boolean;
    minOccurrences: number;
    timeWindowDays: number;
    similarityThreshold: number;
  };

  /** 自动化建议 */
  automationSuggestion: {
    enabled: boolean;
    minConfidence: number;
    minFrequency: number;
    cooldownHours: number;
  };

  /** 隐私保护 */
  privacy: {
    excludedApps: string[];
    excludedPaths: string[];
    anonymizeData: boolean;
    dataRetentionDays: number;
  };
}

// ============ 行为追踪器配置 ============

/**
 * 行为追踪器配置
 */
export interface BehaviorTrackerConfig {
  /** 是否启用追踪 */
  enabled: boolean;

  /** 事件批处理大小 */
  batchSize: number;

  /** 批处理间隔 (ms) */
  batchIntervalMs: number;

  /** 最大事件缓存数量 */
  maxEventCache: number;

  /** 习惯学习配置 */
  habitLearning: HabitLearningConfig;
}

/**
 * 默认行为追踪器配置
 */
export const DEFAULT_BEHAVIOR_CONFIG: BehaviorTrackerConfig = {
  enabled: true,
  batchSize: 50,
  batchIntervalMs: 5000,
  maxEventCache: 1000,
  habitLearning: {
    learning: {
      minDataPoints: 5,
      learningRate: 0.1,
      forgetRate: 0.01,
      confidenceThreshold: 0.7,
    },
    patternDetection: {
      enabled: true,
      minOccurrences: 3,
      timeWindowDays: 30,
      similarityThreshold: 0.8,
    },
    automationSuggestion: {
      enabled: true,
      minConfidence: 0.8,
      minFrequency: 3,
      cooldownHours: 24,
    },
    privacy: {
      excludedApps: [],
      excludedPaths: [],
      anonymizeData: false,
      dataRetentionDays: 90,
    },
  },
};
