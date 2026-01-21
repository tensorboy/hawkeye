/**
 * 工作流系统
 * Workflow System
 *
 * 提供自定义工作流的创建、管理和执行功能
 */

// 类型导出
export * from './types';

// 工作流管理器
export {
  WorkflowManager,
  getWorkflowManager,
  createWorkflowManager,
  setWorkflowManager,
  type WorkflowManagerEvents,
} from './workflow-manager';
