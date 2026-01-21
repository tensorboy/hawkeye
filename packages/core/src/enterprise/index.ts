/**
 * 企业版功能
 * Enterprise Features
 *
 * 提供组织管理、团队协作、SSO、合规性等企业级功能
 */

// 类型导出
export * from './types';

// 企业管理器
export {
  EnterpriseManager,
  getEnterpriseManager,
  createEnterpriseManager,
  setEnterpriseManager,
  type EnterpriseManagerEvents,
} from './enterprise-manager';
