/**
 * 主线任务 Dashboard 类型定义
 * Main Task Dashboard Type Definitions
 *
 * 定义主线任务管理和 Dashboard 展示的接口
 */

// ============================================================================
// 主线任务类型 (Main Task Types)
// ============================================================================

/**
 * 任务优先级
 */
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * 任务状态
 */
export type MainTaskStatus =
  | 'not_started'   // 未开始
  | 'in_progress'   // 进行中
  | 'paused'        // 暂停
  | 'blocked'       // 阻塞
  | 'completed'     // 已完成
  | 'cancelled';    // 已取消

/**
 * 任务来源
 */
export type TaskSource =
  | 'user'          // 用户手动创建
  | 'ai_suggested'  // AI 建议
  | 'workflow'      // 工作流生成
  | 'recurring'     // 周期性任务
  | 'imported';     // 外部导入

/**
 * 主线任务
 */
export interface MainTask {
  /** 唯一标识 */
  id: string;
  /** 任务标题 */
  title: string;
  /** 详细描述 */
  description?: string;
  /** 优先级 */
  priority: TaskPriority;
  /** 状态 */
  status: MainTaskStatus;
  /** 来源 */
  source: TaskSource;
  /** 标签 */
  tags?: string[];
  /** 分类/项目 */
  project?: string;
  /** 预估时间 (分钟) */
  estimatedMinutes?: number;
  /** 实际花费时间 (分钟) */
  actualMinutes?: number;
  /** 完成度 (0-100) */
  progress: number;
  /** 截止日期 */
  dueDate?: number;
  /** 提醒时间 */
  reminderAt?: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 开始时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
  /** 子任务 */
  subtasks?: SubTask[];
  /** 相关文件 */
  relatedFiles?: string[];
  /** 相关链接 */
  relatedLinks?: string[];
  /** 备注 */
  notes?: string;
  /** 阻塞原因 */
  blockedReason?: string;
  /** 依赖的其他任务 */
  dependencies?: string[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 子任务
 */
export interface SubTask {
  /** 唯一标识 */
  id: string;
  /** 标题 */
  title: string;
  /** 是否完成 */
  completed: boolean;
  /** 完成时间 */
  completedAt?: number;
  /** 顺序 */
  order: number;
}

// ============================================================================
// 时间追踪 (Time Tracking)
// ============================================================================

/**
 * 时间记录
 */
export interface TimeEntry {
  /** 唯一标识 */
  id: string;
  /** 关联的任务 ID */
  taskId: string;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 持续时间 (毫秒) */
  duration?: number;
  /** 描述 */
  description?: string;
  /** 是否自动记录 */
  isAutomatic: boolean;
}

/**
 * 专注时段
 */
export interface FocusSession {
  /** 唯一标识 */
  id: string;
  /** 关联的任务 ID */
  taskId?: string;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 目标时长 (分钟) */
  targetMinutes: number;
  /** 实际时长 (分钟) */
  actualMinutes?: number;
  /** 是否中断 */
  interrupted: boolean;
  /** 中断次数 */
  interruptionCount: number;
  /** 中断原因 */
  interruptionReasons?: string[];
}

// ============================================================================
// Dashboard 视图 (Dashboard Views)
// ============================================================================

/**
 * Dashboard 视图类型
 */
export type DashboardViewType =
  | 'list'          // 列表视图
  | 'kanban'        // 看板视图
  | 'calendar'      // 日历视图
  | 'timeline'      // 时间线视图
  | 'matrix';       // 优先级矩阵

/**
 * 任务过滤条件
 */
export interface TaskFilter {
  /** 状态过滤 */
  status?: MainTaskStatus[];
  /** 优先级过滤 */
  priority?: TaskPriority[];
  /** 项目过滤 */
  project?: string;
  /** 标签过滤 */
  tags?: string[];
  /** 时间范围 */
  dateRange?: {
    start: number;
    end: number;
  };
  /** 搜索关键词 */
  search?: string;
  /** 来源过滤 */
  source?: TaskSource[];
  /** 是否过期 */
  overdue?: boolean;
  /** 是否有截止日期 */
  hasDueDate?: boolean;
}

/**
 * 任务排序方式
 */
export interface TaskSort {
  /** 排序字段 */
  field: 'priority' | 'dueDate' | 'createdAt' | 'updatedAt' | 'progress' | 'title';
  /** 排序方向 */
  direction: 'asc' | 'desc';
}

/**
 * Dashboard 配置
 */
export interface DashboardConfig {
  /** 默认视图 */
  defaultView: DashboardViewType;
  /** 默认过滤条件 */
  defaultFilter?: TaskFilter;
  /** 默认排序 */
  defaultSort?: TaskSort;
  /** 是否显示已完成任务 */
  showCompleted: boolean;
  /** 已完成任务保留天数 */
  completedRetentionDays: number;
  /** 是否启用时间追踪 */
  enableTimeTracking: boolean;
  /** 是否启用专注模式 */
  enableFocusMode: boolean;
  /** 每日目标任务数 */
  dailyGoal?: number;
  /** 工作时间设置 */
  workingHours?: {
    start: string;  // HH:mm 格式
    end: string;
  };
}

/**
 * 默认 Dashboard 配置
 */
export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  defaultView: 'list',
  showCompleted: true,
  completedRetentionDays: 7,
  enableTimeTracking: true,
  enableFocusMode: true,
  dailyGoal: 5,
};

// ============================================================================
// 统计和分析 (Statistics & Analytics)
// ============================================================================

/**
 * 任务统计
 */
export interface TaskStatistics {
  /** 总任务数 */
  total: number;
  /** 按状态分组 */
  byStatus: Record<MainTaskStatus, number>;
  /** 按优先级分组 */
  byPriority: Record<TaskPriority, number>;
  /** 已完成数 */
  completed: number;
  /** 完成率 */
  completionRate: number;
  /** 过期数 */
  overdue: number;
  /** 今日到期数 */
  dueToday: number;
  /** 本周到期数 */
  dueThisWeek: number;
}

/**
 * 生产力统计
 */
export interface ProductivityStats {
  /** 统计日期 */
  date: string;  // YYYY-MM-DD
  /** 完成的任务数 */
  tasksCompleted: number;
  /** 创建的任务数 */
  tasksCreated: number;
  /** 专注时长 (分钟) */
  focusMinutes: number;
  /** 中断次数 */
  interruptions: number;
  /** 完成的子任务数 */
  subtasksCompleted: number;
  /** 平均完成时间 (分钟) */
  avgCompletionTime?: number;
  /** 最活跃时段 */
  mostActiveHour?: number;
}

/**
 * 周报/月报数据
 */
export interface ProductivityReport {
  /** 报告类型 */
  type: 'weekly' | 'monthly';
  /** 开始日期 */
  startDate: string;
  /** 结束日期 */
  endDate: string;
  /** 每日数据 */
  dailyStats: ProductivityStats[];
  /** 汇总数据 */
  summary: {
    totalTasksCompleted: number;
    totalFocusMinutes: number;
    averageTasksPerDay: number;
    completionRate: number;
    mostProductiveDay: string;
    topTags: Array<{ tag: string; count: number }>;
    topProjects: Array<{ project: string; count: number }>;
  };
  /** 与上期对比 */
  comparison?: {
    tasksCompletedChange: number;  // 百分比
    focusMinutesChange: number;
    completionRateChange: number;
  };
}

// ============================================================================
// 通知和提醒 (Notifications & Reminders)
// ============================================================================

/**
 * 提醒类型
 */
export type ReminderType =
  | 'due_soon'       // 即将到期
  | 'overdue'        // 已过期
  | 'scheduled'      // 定时提醒
  | 'focus_break'    // 专注休息
  | 'daily_review'   // 每日回顾
  | 'weekly_review'; // 每周回顾

/**
 * 任务提醒
 */
export interface TaskReminder {
  /** 唯一标识 */
  id: string;
  /** 关联的任务 ID */
  taskId: string;
  /** 提醒类型 */
  type: ReminderType;
  /** 提醒时间 */
  remindAt: number;
  /** 是否已触发 */
  triggered: boolean;
  /** 触发时间 */
  triggeredAt?: number;
  /** 是否已阅读 */
  read: boolean;
  /** 自定义消息 */
  message?: string;
}

// ============================================================================
// Dashboard 管理器配置 (Dashboard Manager Config)
// ============================================================================

/**
 * Dashboard 管理器配置
 */
export interface DashboardManagerConfig {
  /** 数据存储目录 */
  dataDir: string;
  /** 自动保存间隔 (毫秒) */
  autoSaveInterval: number;
  /** 是否启用自动时间追踪 */
  enableAutoTimeTracking: boolean;
  /** 过期任务提醒提前时间 (分钟) */
  dueReminderMinutes: number;
  /** 每日回顾时间 */
  dailyReviewTime?: string;  // HH:mm 格式
  /** 每周回顾日 */
  weeklyReviewDay?: number;  // 0-6, 0 = 周日
}

/**
 * 默认 Dashboard 管理器配置
 */
export const DEFAULT_DASHBOARD_MANAGER_CONFIG: DashboardManagerConfig = {
  dataDir: '~/.hawkeye/dashboard',
  autoSaveInterval: 30000,  // 30 秒
  enableAutoTimeTracking: true,
  dueReminderMinutes: 60,
  dailyReviewTime: '09:00',
  weeklyReviewDay: 1,  // 周一
};
