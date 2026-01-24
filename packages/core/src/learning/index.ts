/**
 * Learning Module - 学习模块
 *
 * 提供从任务执行中学习的能力:
 * - 轨迹学习 (参考 OS-Copilot)
 * - 语义轨迹管理 (参考 ShowUI-Aloha)
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

// 语义轨迹管理 (参考 ShowUI-Aloha)
export {
  SemanticTraceManager,
  createSemanticTraceManager,
  getSemanticTraceManager,
  setSemanticTraceManager,
  // 类型
  type SemanticActionType,
  type SemanticTraceStep,
  type SemanticTrace,
  type InContextStep,
  type InContextTrajectory,
  type SemanticTraceManagerConfig,
} from './semantic-trace-manager';
