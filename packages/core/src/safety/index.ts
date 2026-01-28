/**
 * Safety Module - 安全助手模块
 * 你的个人超级安全助手，检测诈骗、钓鱼和其他安全威胁
 *
 * 功能:
 * - URL 安全检查
 * - 文本内容分析
 * - 邮件钓鱼检测
 * - 网络搜索验证 (grounding)
 * - A2UI 安全警告卡片生成
 */

// 类型导出
export type {
  ThreatType,
  SafetyRiskLevel,
  ThreatIndicator,
  SafetyAnalysisResult,
  GroundingInfo,
  GroundingResult,
  SafetyCheckInput,
  SafetyAnalyzerConfig,
  ThreatPattern,
  A2UISafetyAlertCard,
  KnownScamEntry,
  SafetyHistoryEntry,
} from './types';

// 威胁模式
export {
  URL_THREAT_PATTERNS,
  TEXT_THREAT_PATTERNS,
  EMAIL_THREAT_PATTERNS,
  GENERAL_THREAT_PATTERNS,
  getAllThreatPatterns,
  getThreatPatternsByCategory,
  getThreatPatternsByType,
  THREAT_TYPE_DESCRIPTIONS,
  RISK_LEVEL_DESCRIPTIONS,
} from './threat-patterns';

// 安全分析器
export {
  SafetyAnalyzer,
  getSafetyAnalyzer,
  setSafetyAnalyzer,
  createSafetyAnalyzer,
} from './safety-analyzer';
