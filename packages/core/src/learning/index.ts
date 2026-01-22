/**
 * Learning Module - 学习模块
 *
 * 提供从任务执行中学习的能力:
 * - 轨迹学习 (参考 OS-Copilot)
 * - 动作模式识别
 * - 经验泛化
 */

// 轨迹学习 (参考 OS-Copilot)
export {
  TrajectoryLearning,
  createTrajectoryLearning,
  getTrajectoryLearning,
  setTrajectoryLearning,
  // 类型
  type TrajectoryActionType,
  type TrajectoryAction,
  type Trajectory,
  type TrajectoryPattern,
  type ActionPattern,
  type TrajectoryMatch,
  type TrajectoryAdaptation,
  type TrajectoryLearningConfig,
} from './trajectory-learning';
