/**
 * Safety Module Types - 安全助手类型定义
 * 用于检测诈骗、钓鱼、恶意内容等安全威胁
 */

/**
 * 威胁类型
 */
export type ThreatType =
  | 'phishing'           // 钓鱼网站/邮件
  | 'scam'               // 诈骗
  | 'malware'            // 恶意软件
  | 'fake_website'       // 仿冒网站
  | 'suspicious_url'     // 可疑链接
  | 'fake_login'         // 假登录页面
  | 'cryptocurrency_scam' // 加密货币诈骗
  | 'investment_fraud'   // 投资诈骗
  | 'tech_support_scam'  // 技术支持诈骗
  | 'romance_scam'       // 情感诈骗
  | 'lottery_scam'       // 彩票/中奖诈骗
  | 'impersonation'      // 冒充身份
  | 'urgency_manipulation' // 紧迫感操纵
  | 'unknown';           // 未知威胁

/**
 * 风险等级
 */
export type SafetyRiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

/**
 * 威胁指标
 */
export interface ThreatIndicator {
  type: ThreatType;
  pattern: string;
  confidence: number;
  description: string;
  matchedContent?: string;
  location?: string;
}

/**
 * 安全分析结果
 */
export interface SafetyAnalysisResult {
  /** 是否安全 */
  isSafe: boolean;

  /** 风险等级 */
  riskLevel: SafetyRiskLevel;

  /** 总体置信度 (0-1) */
  confidence: number;

  /** 检测到的威胁 */
  threats: ThreatIndicator[];

  /** 分析摘要 */
  summary: string;

  /** 详细说明 */
  details: string[];

  /** 建议操作 */
  recommendations: string[];

  /** 来自网络搜索的依据信息 */
  groundingInfo?: GroundingInfo;

  /** 分析时间戳 */
  timestamp: number;
}

/**
 * 网络搜索依据信息
 */
export interface GroundingInfo {
  /** 搜索查询 */
  query: string;

  /** 搜索结果 */
  results: GroundingResult[];

  /** 是否找到已知威胁报告 */
  knownThreatReported: boolean;

  /** 相关报道摘要 */
  reportSummary?: string;
}

/**
 * 搜索结果
 */
export interface GroundingResult {
  title: string;
  url: string;
  content: string;
  source: string;
  relevanceScore: number;
}

/**
 * 安全检查输入
 */
export interface SafetyCheckInput {
  /** 要检查的 URL */
  url?: string;

  /** 要检查的文本内容 */
  text?: string;

  /** 要检查的邮件内容 */
  email?: {
    from: string;
    subject: string;
    body: string;
  };

  /** 截图中识别的内容 */
  screenContent?: string;

  /** 来源上下文 */
  context?: string;
}

/**
 * 安全分析器配置
 */
export interface SafetyAnalyzerConfig {
  /** 是否启用 URL 检查 */
  enableUrlCheck: boolean;

  /** 是否启用文本分析 */
  enableTextAnalysis: boolean;

  /** 是否启用邮件分析 */
  enableEmailAnalysis: boolean;

  /** 是否启用网络搜索验证 */
  enableWebGrounding: boolean;

  /** 最低置信度阈值 */
  minConfidence: number;

  /** 自定义威胁模式 */
  customPatterns?: ThreatPattern[];

  /** Tavily API Key (用于网络搜索) */
  tavilyApiKey?: string;
}

/**
 * 威胁检测模式
 */
export interface ThreatPattern {
  type: ThreatType;
  pattern: RegExp;
  confidence: number;
  description: string;
  category: 'url' | 'text' | 'email' | 'general';
}

/**
 * A2UI 安全警告卡片
 */
export interface A2UISafetyAlertCard {
  type: 'safety_alert';
  id: string;
  title: string;
  description?: string;
  icon: 'warning' | 'error';
  timestamp: number;

  /** 风险等级 */
  riskLevel: SafetyRiskLevel;

  /** 威胁类型 */
  threatType: ThreatType;

  /** 检测到的威胁 */
  threats: ThreatIndicator[];

  /** 详细信息 */
  details: string[];

  /** 建议操作 */
  recommendations: string[];

  /** 依据信息 */
  groundingInfo?: GroundingInfo;

  /** 操作按钮 */
  actions: Array<{
    id: string;
    label: string;
    type: 'primary' | 'secondary' | 'danger' | 'dismiss';
    icon?: string;
  }>;

  /** 元数据 */
  metadata?: {
    sourceUrl?: string;
    sourceText?: string;
    analyzedAt: number;
  };
}

/**
 * 已知诈骗数据库条目
 */
export interface KnownScamEntry {
  id: string;
  type: ThreatType;
  patterns: string[];
  domains?: string[];
  description: string;
  reportedAt: number;
  sources: string[];
}

/**
 * 安全历史记录
 */
export interface SafetyHistoryEntry {
  id: string;
  input: SafetyCheckInput;
  result: SafetyAnalysisResult;
  userAction?: 'dismissed' | 'reported' | 'blocked' | 'proceeded';
  timestamp: number;
}
