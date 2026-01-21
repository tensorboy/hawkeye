/**
 * 主线任务 Dashboard
 * Main Task Dashboard
 *
 * 提供任务管理、时间追踪和生产力统计功能
 */

// 类型导出
export * from './types';

// Dashboard 管理器
export {
  DashboardManager,
  getDashboardManager,
  createDashboardManager,
  setDashboardManager,
  type DashboardManagerEvents,
} from './dashboard-manager';
