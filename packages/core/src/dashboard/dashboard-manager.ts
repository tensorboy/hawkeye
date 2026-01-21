/**
 * Dashboard 管理器
 * Dashboard Manager
 *
 * 管理主线任务、时间追踪和生产力统计
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import {
  MainTask,
  SubTask,
  MainTaskStatus,
  TaskPriority,
  TaskSource,
  TimeEntry,
  FocusSession,
  TaskFilter,
  TaskSort,
  TaskStatistics,
  ProductivityStats,
  ProductivityReport,
  TaskReminder,
  ReminderType,
  DashboardConfig,
  DashboardManagerConfig,
  DEFAULT_DASHBOARD_CONFIG,
  DEFAULT_DASHBOARD_MANAGER_CONFIG,
} from './types';

/**
 * Dashboard 管理器事件
 */
export interface DashboardManagerEvents {
  'task:created': (task: MainTask) => void;
  'task:updated': (task: MainTask) => void;
  'task:deleted': (taskId: string) => void;
  'task:completed': (task: MainTask) => void;
  'task:progress': (task: MainTask, progress: number) => void;
  'subtask:completed': (taskId: string, subtask: SubTask) => void;
  'time:started': (entry: TimeEntry) => void;
  'time:stopped': (entry: TimeEntry) => void;
  'focus:started': (session: FocusSession) => void;
  'focus:ended': (session: FocusSession) => void;
  'focus:interrupted': (session: FocusSession) => void;
  'reminder:triggered': (reminder: TaskReminder) => void;
  'stats:updated': (stats: TaskStatistics) => void;
}

/**
 * Dashboard 管理器
 */
export class DashboardManager extends EventEmitter {
  private config: DashboardManagerConfig;
  private dashboardConfig: DashboardConfig;
  private tasks: Map<string, MainTask> = new Map();
  private timeEntries: Map<string, TimeEntry> = new Map();
  private focusSessions: Map<string, FocusSession> = new Map();
  private reminders: Map<string, TaskReminder> = new Map();
  private productivityStats: Map<string, ProductivityStats> = new Map();

  private currentTimeEntry: TimeEntry | null = null;
  private currentFocusSession: FocusSession | null = null;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private reminderCheckTimer: NodeJS.Timeout | null = null;

  constructor(
    config?: Partial<DashboardManagerConfig>,
    dashboardConfig?: Partial<DashboardConfig>
  ) {
    super();
    this.config = { ...DEFAULT_DASHBOARD_MANAGER_CONFIG, ...config };
    this.dashboardConfig = { ...DEFAULT_DASHBOARD_CONFIG, ...dashboardConfig };

    this.ensureDataDir();
    this.startAutoSave();
    this.startReminderCheck();
  }

  /**
   * 确保数据目录存在
   */
  private ensureDataDir(): void {
    const dir = this.resolveDataDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 解析数据目录
   */
  private resolveDataDir(): string {
    if (this.config.dataDir.startsWith('~')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      return path.join(homeDir, this.config.dataDir.slice(1));
    }
    return this.config.dataDir;
  }

  // ============================================================================
  // 任务管理 (Task Management)
  // ============================================================================

  /**
   * 创建任务
   */
  createTask(
    title: string,
    options?: Partial<Omit<MainTask, 'id' | 'title' | 'createdAt' | 'updatedAt'>>
  ): MainTask {
    const now = Date.now();
    const task: MainTask = {
      id: uuidv4(),
      title,
      priority: options?.priority || 'medium',
      status: options?.status || 'not_started',
      source: options?.source || 'user',
      progress: options?.progress || 0,
      createdAt: now,
      updatedAt: now,
      ...options,
    };

    this.tasks.set(task.id, task);
    this.emit('task:created', task);
    this.updateStatistics();

    // 创建截止日期提醒
    if (task.dueDate) {
      this.createDueReminder(task);
    }

    return task;
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): MainTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(filter?: TaskFilter, sort?: TaskSort): MainTask[] {
    let tasks = Array.from(this.tasks.values());

    // 应用过滤
    if (filter) {
      tasks = this.filterTasks(tasks, filter);
    }

    // 应用排序
    if (sort) {
      tasks = this.sortTasks(tasks, sort);
    }

    return tasks;
  }

  /**
   * 更新任务
   */
  updateTask(taskId: string, updates: Partial<MainTask>): MainTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const updatedTask: MainTask = {
      ...task,
      ...updates,
      id: task.id,
      createdAt: task.createdAt,
      updatedAt: Date.now(),
    };

    this.tasks.set(taskId, updatedTask);
    this.emit('task:updated', updatedTask);
    this.updateStatistics();

    // 更新截止日期提醒
    if (updates.dueDate !== undefined) {
      this.removeDueReminder(taskId);
      if (updates.dueDate) {
        this.createDueReminder(updatedTask);
      }
    }

    return updatedTask;
  }

  /**
   * 删除任务
   */
  deleteTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    this.tasks.delete(taskId);
    this.removeDueReminder(taskId);
    this.emit('task:deleted', taskId);
    this.updateStatistics();
  }

  /**
   * 完成任务
   */
  completeTask(taskId: string): MainTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const completedTask = this.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      completedAt: Date.now(),
    });

    this.emit('task:completed', completedTask);
    this.updateDailyStats('tasksCompleted', 1);

    return completedTask;
  }

  /**
   * 开始任务
   */
  startTask(taskId: string): MainTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const startedTask = this.updateTask(taskId, {
      status: 'in_progress',
      startedAt: task.startedAt || Date.now(),
    });

    // 自动开始时间追踪
    if (this.config.enableAutoTimeTracking) {
      this.startTimeTracking(taskId);
    }

    return startedTask;
  }

  /**
   * 暂停任务
   */
  pauseTask(taskId: string): MainTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // 停止时间追踪
    if (this.currentTimeEntry?.taskId === taskId) {
      this.stopTimeTracking();
    }

    return this.updateTask(taskId, {
      status: 'paused',
    });
  }

  /**
   * 阻塞任务
   */
  blockTask(taskId: string, reason: string): MainTask {
    return this.updateTask(taskId, {
      status: 'blocked',
      blockedReason: reason,
    });
  }

  /**
   * 更新任务进度
   */
  updateProgress(taskId: string, progress: number): MainTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const clampedProgress = Math.max(0, Math.min(100, progress));
    const updatedTask = this.updateTask(taskId, {
      progress: clampedProgress,
      status: clampedProgress === 100 ? 'completed' : task.status,
      completedAt: clampedProgress === 100 ? Date.now() : task.completedAt,
    });

    this.emit('task:progress', updatedTask, clampedProgress);

    if (clampedProgress === 100) {
      this.emit('task:completed', updatedTask);
      this.updateDailyStats('tasksCompleted', 1);
    }

    return updatedTask;
  }

  // ============================================================================
  // 子任务管理 (Subtask Management)
  // ============================================================================

  /**
   * 添加子任务
   */
  addSubtask(taskId: string, title: string): SubTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const subtask: SubTask = {
      id: uuidv4(),
      title,
      completed: false,
      order: (task.subtasks?.length || 0) + 1,
    };

    const subtasks = [...(task.subtasks || []), subtask];
    this.updateTask(taskId, { subtasks });

    return subtask;
  }

  /**
   * 完成子任务
   */
  completeSubtask(taskId: string, subtaskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || !task.subtasks) {
      throw new Error(`Task or subtasks not found`);
    }

    const subtaskIndex = task.subtasks.findIndex(s => s.id === subtaskId);
    if (subtaskIndex === -1) {
      throw new Error(`Subtask ${subtaskId} not found`);
    }

    const subtask = task.subtasks[subtaskIndex];
    subtask.completed = true;
    subtask.completedAt = Date.now();

    // 更新主任务进度
    const completedCount = task.subtasks.filter(s => s.completed).length;
    const progress = Math.round((completedCount / task.subtasks.length) * 100);

    this.updateTask(taskId, {
      subtasks: task.subtasks,
      progress,
    });

    this.emit('subtask:completed', taskId, subtask);
    this.updateDailyStats('subtasksCompleted', 1);
  }

  /**
   * 删除子任务
   */
  deleteSubtask(taskId: string, subtaskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || !task.subtasks) {
      throw new Error(`Task or subtasks not found`);
    }

    const subtasks = task.subtasks.filter(s => s.id !== subtaskId);

    // 重新计算进度
    const completedCount = subtasks.filter(s => s.completed).length;
    const progress = subtasks.length > 0
      ? Math.round((completedCount / subtasks.length) * 100)
      : 0;

    this.updateTask(taskId, { subtasks, progress });
  }

  // ============================================================================
  // 时间追踪 (Time Tracking)
  // ============================================================================

  /**
   * 开始时间追踪
   */
  startTimeTracking(taskId?: string, description?: string): TimeEntry {
    // 停止之前的追踪
    if (this.currentTimeEntry) {
      this.stopTimeTracking();
    }

    const entry: TimeEntry = {
      id: uuidv4(),
      taskId: taskId || '',
      startTime: Date.now(),
      description,
      isAutomatic: this.config.enableAutoTimeTracking,
    };

    this.timeEntries.set(entry.id, entry);
    this.currentTimeEntry = entry;
    this.emit('time:started', entry);

    return entry;
  }

  /**
   * 停止时间追踪
   */
  stopTimeTracking(): TimeEntry | null {
    if (!this.currentTimeEntry) {
      return null;
    }

    const entry = this.currentTimeEntry;
    entry.endTime = Date.now();
    entry.duration = entry.endTime - entry.startTime;

    this.timeEntries.set(entry.id, entry);
    this.currentTimeEntry = null;
    this.emit('time:stopped', entry);

    // 更新任务的实际时间
    if (entry.taskId) {
      const task = this.tasks.get(entry.taskId);
      if (task) {
        const additionalMinutes = Math.round(entry.duration / 60000);
        this.updateTask(entry.taskId, {
          actualMinutes: (task.actualMinutes || 0) + additionalMinutes,
        });
      }
    }

    return entry;
  }

  /**
   * 获取任务的时间记录
   */
  getTimeEntries(taskId: string): TimeEntry[] {
    return Array.from(this.timeEntries.values())
      .filter(e => e.taskId === taskId)
      .sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * 获取今日时间统计
   */
  getTodayTimeStats(): { totalMinutes: number; byTask: Map<string, number> } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    let totalMinutes = 0;
    const byTask = new Map<string, number>();

    for (const entry of this.timeEntries.values()) {
      if (entry.startTime >= todayStart && entry.duration) {
        const minutes = Math.round(entry.duration / 60000);
        totalMinutes += minutes;

        if (entry.taskId) {
          byTask.set(entry.taskId, (byTask.get(entry.taskId) || 0) + minutes);
        }
      }
    }

    return { totalMinutes, byTask };
  }

  // ============================================================================
  // 专注模式 (Focus Mode)
  // ============================================================================

  /**
   * 开始专注时段
   */
  startFocusSession(taskId?: string, targetMinutes = 25): FocusSession {
    // 结束之前的专注时段
    if (this.currentFocusSession) {
      this.endFocusSession();
    }

    const session: FocusSession = {
      id: uuidv4(),
      taskId,
      startTime: Date.now(),
      targetMinutes,
      interrupted: false,
      interruptionCount: 0,
    };

    this.focusSessions.set(session.id, session);
    this.currentFocusSession = session;

    // 开始时间追踪
    if (taskId) {
      this.startTimeTracking(taskId, `Focus session: ${targetMinutes} minutes`);
    }

    this.emit('focus:started', session);

    return session;
  }

  /**
   * 结束专注时段
   */
  endFocusSession(): FocusSession | null {
    if (!this.currentFocusSession) {
      return null;
    }

    const session = this.currentFocusSession;
    session.endTime = Date.now();
    session.actualMinutes = Math.round((session.endTime - session.startTime) / 60000);

    this.focusSessions.set(session.id, session);
    this.currentFocusSession = null;

    // 停止时间追踪
    this.stopTimeTracking();

    // 更新统计
    this.updateDailyStats('focusMinutes', session.actualMinutes);

    this.emit('focus:ended', session);

    return session;
  }

  /**
   * 记录中断
   */
  recordInterruption(reason?: string): void {
    if (!this.currentFocusSession) {
      return;
    }

    this.currentFocusSession.interrupted = true;
    this.currentFocusSession.interruptionCount++;

    if (reason) {
      this.currentFocusSession.interruptionReasons =
        this.currentFocusSession.interruptionReasons || [];
      this.currentFocusSession.interruptionReasons.push(reason);
    }

    this.updateDailyStats('interruptions', 1);
    this.emit('focus:interrupted', this.currentFocusSession);
  }

  /**
   * 获取当前专注状态
   */
  getCurrentFocusSession(): FocusSession | null {
    return this.currentFocusSession;
  }

  // ============================================================================
  // 统计和分析 (Statistics & Analytics)
  // ============================================================================

  /**
   * 获取任务统计
   */
  getStatistics(filter?: TaskFilter): TaskStatistics {
    let tasks = Array.from(this.tasks.values());
    if (filter) {
      tasks = this.filterTasks(tasks, filter);
    }

    const now = Date.now();
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const todayEnd = today.getTime();
    const weekEnd = todayEnd + 7 * 24 * 60 * 60 * 1000;

    const byStatus: Record<MainTaskStatus, number> = {
      not_started: 0,
      in_progress: 0,
      paused: 0,
      blocked: 0,
      completed: 0,
      cancelled: 0,
    };

    const byPriority: Record<TaskPriority, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    let overdue = 0;
    let dueToday = 0;
    let dueThisWeek = 0;

    for (const task of tasks) {
      byStatus[task.status]++;
      byPriority[task.priority]++;

      if (task.dueDate && task.status !== 'completed' && task.status !== 'cancelled') {
        if (task.dueDate < now) {
          overdue++;
        } else if (task.dueDate <= todayEnd) {
          dueToday++;
        } else if (task.dueDate <= weekEnd) {
          dueThisWeek++;
        }
      }
    }

    const completed = byStatus.completed;
    const total = tasks.length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      byStatus,
      byPriority,
      completed,
      completionRate,
      overdue,
      dueToday,
      dueThisWeek,
    };
  }

  /**
   * 获取生产力报告
   */
  getProductivityReport(type: 'weekly' | 'monthly'): ProductivityReport {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (type === 'weekly') {
      // 本周
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // 本月
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const dailyStats: ProductivityStats[] = [];
    let totalTasksCompleted = 0;
    let totalFocusMinutes = 0;
    let mostProductiveDay = '';
    let maxCompleted = 0;

    // 收集每日数据
    const current = new Date(startDate);
    while (current <= endDate && current <= now) {
      const dateStr = this.formatDate(current);
      const stats = this.productivityStats.get(dateStr) || {
        date: dateStr,
        tasksCompleted: 0,
        tasksCreated: 0,
        focusMinutes: 0,
        interruptions: 0,
        subtasksCompleted: 0,
      };

      dailyStats.push(stats);
      totalTasksCompleted += stats.tasksCompleted;
      totalFocusMinutes += stats.focusMinutes;

      if (stats.tasksCompleted > maxCompleted) {
        maxCompleted = stats.tasksCompleted;
        mostProductiveDay = dateStr;
      }

      current.setDate(current.getDate() + 1);
    }

    // 统计标签和项目
    const tagCounts = new Map<string, number>();
    const projectCounts = new Map<string, number>();

    for (const task of this.tasks.values()) {
      if (task.status === 'completed' &&
          task.completedAt &&
          task.completedAt >= startDate.getTime() &&
          task.completedAt <= endDate.getTime()) {
        if (task.tags) {
          for (const tag of task.tags) {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          }
        }
        if (task.project) {
          projectCounts.set(task.project, (projectCounts.get(task.project) || 0) + 1);
        }
      }
    }

    const topTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topProjects = Array.from(projectCounts.entries())
      .map(([project, count]) => ({ project, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const activeDays = dailyStats.filter(s => s.tasksCompleted > 0).length;

    return {
      type,
      startDate: this.formatDate(startDate),
      endDate: this.formatDate(endDate),
      dailyStats,
      summary: {
        totalTasksCompleted,
        totalFocusMinutes,
        averageTasksPerDay: activeDays > 0 ? Math.round(totalTasksCompleted / activeDays * 10) / 10 : 0,
        completionRate: this.getStatistics().completionRate,
        mostProductiveDay,
        topTags,
        topProjects,
      },
    };
  }

  // ============================================================================
  // 过滤和排序 (Filtering & Sorting)
  // ============================================================================

  /**
   * 过滤任务
   */
  private filterTasks(tasks: MainTask[], filter: TaskFilter): MainTask[] {
    return tasks.filter(task => {
      if (filter.status && !filter.status.includes(task.status)) {
        return false;
      }
      if (filter.priority && !filter.priority.includes(task.priority)) {
        return false;
      }
      if (filter.project && task.project !== filter.project) {
        return false;
      }
      if (filter.tags && filter.tags.length > 0) {
        if (!task.tags || !filter.tags.some(t => task.tags!.includes(t))) {
          return false;
        }
      }
      if (filter.dateRange) {
        if (task.createdAt < filter.dateRange.start || task.createdAt > filter.dateRange.end) {
          return false;
        }
      }
      if (filter.search) {
        const search = filter.search.toLowerCase();
        if (!task.title.toLowerCase().includes(search) &&
            !task.description?.toLowerCase().includes(search)) {
          return false;
        }
      }
      if (filter.source && !filter.source.includes(task.source)) {
        return false;
      }
      if (filter.overdue) {
        const now = Date.now();
        if (!task.dueDate || task.dueDate >= now || task.status === 'completed') {
          return false;
        }
      }
      if (filter.hasDueDate !== undefined) {
        if (filter.hasDueDate && !task.dueDate) return false;
        if (!filter.hasDueDate && task.dueDate) return false;
      }
      return true;
    });
  }

  /**
   * 排序任务
   */
  private sortTasks(tasks: MainTask[], sort: TaskSort): MainTask[] {
    const priorityOrder: Record<TaskPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    return [...tasks].sort((a, b) => {
      let cmp = 0;
      switch (sort.field) {
        case 'priority':
          cmp = priorityOrder[a.priority] - priorityOrder[b.priority];
          break;
        case 'dueDate':
          cmp = (a.dueDate || Number.MAX_VALUE) - (b.dueDate || Number.MAX_VALUE);
          break;
        case 'createdAt':
          cmp = a.createdAt - b.createdAt;
          break;
        case 'updatedAt':
          cmp = a.updatedAt - b.updatedAt;
          break;
        case 'progress':
          cmp = a.progress - b.progress;
          break;
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
      }
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }

  // ============================================================================
  // 提醒管理 (Reminder Management)
  // ============================================================================

  /**
   * 创建截止日期提醒
   */
  private createDueReminder(task: MainTask): void {
    if (!task.dueDate) return;

    const remindAt = task.dueDate - this.config.dueReminderMinutes * 60000;
    if (remindAt <= Date.now()) return;

    const reminder: TaskReminder = {
      id: uuidv4(),
      taskId: task.id,
      type: 'due_soon',
      remindAt,
      triggered: false,
      read: false,
    };

    this.reminders.set(reminder.id, reminder);
  }

  /**
   * 移除截止日期提醒
   */
  private removeDueReminder(taskId: string): void {
    for (const [id, reminder] of this.reminders) {
      if (reminder.taskId === taskId && reminder.type === 'due_soon') {
        this.reminders.delete(id);
      }
    }
  }

  /**
   * 开始提醒检查
   */
  private startReminderCheck(): void {
    this.reminderCheckTimer = setInterval(() => {
      this.checkReminders();
    }, 60000); // 每分钟检查
  }

  /**
   * 检查提醒
   */
  private checkReminders(): void {
    const now = Date.now();
    for (const reminder of this.reminders.values()) {
      if (!reminder.triggered && reminder.remindAt <= now) {
        reminder.triggered = true;
        reminder.triggeredAt = now;
        this.emit('reminder:triggered', reminder);
      }
    }
  }

  // ============================================================================
  // 数据持久化 (Data Persistence)
  // ============================================================================

  /**
   * 开始自动保存
   */
  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(() => {
      this.saveAll();
    }, this.config.autoSaveInterval);
  }

  /**
   * 保存所有数据
   */
  saveAll(): void {
    const dir = this.resolveDataDir();

    // 保存任务
    const tasksFile = path.join(dir, 'tasks.json');
    fs.writeFileSync(tasksFile, JSON.stringify(Array.from(this.tasks.values()), null, 2));

    // 保存时间记录
    const timeFile = path.join(dir, 'time-entries.json');
    fs.writeFileSync(timeFile, JSON.stringify(Array.from(this.timeEntries.values()), null, 2));

    // 保存专注时段
    const focusFile = path.join(dir, 'focus-sessions.json');
    fs.writeFileSync(focusFile, JSON.stringify(Array.from(this.focusSessions.values()), null, 2));

    // 保存生产力统计
    const statsFile = path.join(dir, 'productivity-stats.json');
    fs.writeFileSync(statsFile, JSON.stringify(Array.from(this.productivityStats.entries()), null, 2));
  }

  /**
   * 加载所有数据
   */
  loadAll(): void {
    const dir = this.resolveDataDir();

    // 加载任务
    const tasksFile = path.join(dir, 'tasks.json');
    if (fs.existsSync(tasksFile)) {
      const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')) as MainTask[];
      for (const task of tasks) {
        this.tasks.set(task.id, task);
      }
    }

    // 加载时间记录
    const timeFile = path.join(dir, 'time-entries.json');
    if (fs.existsSync(timeFile)) {
      const entries = JSON.parse(fs.readFileSync(timeFile, 'utf-8')) as TimeEntry[];
      for (const entry of entries) {
        this.timeEntries.set(entry.id, entry);
      }
    }

    // 加载专注时段
    const focusFile = path.join(dir, 'focus-sessions.json');
    if (fs.existsSync(focusFile)) {
      const sessions = JSON.parse(fs.readFileSync(focusFile, 'utf-8')) as FocusSession[];
      for (const session of sessions) {
        this.focusSessions.set(session.id, session);
      }
    }

    // 加载生产力统计
    const statsFile = path.join(dir, 'productivity-stats.json');
    if (fs.existsSync(statsFile)) {
      const entries = JSON.parse(fs.readFileSync(statsFile, 'utf-8')) as [string, ProductivityStats][];
      for (const [date, stats] of entries) {
        this.productivityStats.set(date, stats);
      }
    }
  }

  // ============================================================================
  // 辅助方法 (Helper Methods)
  // ============================================================================

  /**
   * 更新统计
   */
  private updateStatistics(): void {
    const stats = this.getStatistics();
    this.emit('stats:updated', stats);
  }

  /**
   * 更新每日统计
   */
  private updateDailyStats(
    field: keyof Omit<ProductivityStats, 'date'>,
    value: number
  ): void {
    const today = this.formatDate(new Date());
    let stats = this.productivityStats.get(today);

    if (!stats) {
      stats = {
        date: today,
        tasksCompleted: 0,
        tasksCreated: 0,
        focusMinutes: 0,
        interruptions: 0,
        subtasksCompleted: 0,
      };
      this.productivityStats.set(today, stats);
    }

    (stats[field] as number) += value;
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * 获取 Dashboard 配置
   */
  getDashboardConfig(): DashboardConfig {
    return { ...this.dashboardConfig };
  }

  /**
   * 更新 Dashboard 配置
   */
  updateDashboardConfig(updates: Partial<DashboardConfig>): void {
    this.dashboardConfig = { ...this.dashboardConfig, ...updates };
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    if (this.reminderCheckTimer) {
      clearInterval(this.reminderCheckTimer);
    }

    this.saveAll();
    this.removeAllListeners();
  }
}

// ============================================================================
// 单例管理 (Singleton Management)
// ============================================================================

let dashboardManagerInstance: DashboardManager | null = null;

/**
 * 获取 Dashboard 管理器实例
 */
export function getDashboardManager(): DashboardManager {
  if (!dashboardManagerInstance) {
    dashboardManagerInstance = new DashboardManager();
  }
  return dashboardManagerInstance;
}

/**
 * 创建 Dashboard 管理器
 */
export function createDashboardManager(
  config?: Partial<DashboardManagerConfig>,
  dashboardConfig?: Partial<DashboardConfig>
): DashboardManager {
  dashboardManagerInstance = new DashboardManager(config, dashboardConfig);
  return dashboardManagerInstance;
}

/**
 * 设置 Dashboard 管理器实例
 */
export function setDashboardManager(manager: DashboardManager): void {
  dashboardManagerInstance = manager;
}
