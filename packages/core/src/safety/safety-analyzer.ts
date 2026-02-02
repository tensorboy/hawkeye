/**
 * Safety Analyzer - 安全分析器
 * 你的个人超级安全助手，检测诈骗、钓鱼和其他安全威胁
 */

import type {
  SafetyAnalysisResult,
  SafetyAnalyzerConfig,
  SafetyCheckInput,
  SafetyRiskLevel,
  ThreatIndicator,
  ThreatType,
  GroundingInfo,
  GroundingResult,
  A2UISafetyAlertCard,
} from './types';
import {
  getAllThreatPatterns,
  getThreatPatternsByCategory,
  THREAT_TYPE_DESCRIPTIONS,
  RISK_LEVEL_DESCRIPTIONS,
} from './threat-patterns';
import { WebSearchTool, type WebSearchConfig } from '../skills/builtin/web-search';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: SafetyAnalyzerConfig = {
  enableUrlCheck: true,
  enableTextAnalysis: true,
  enableEmailAnalysis: true,
  enableWebGrounding: true,
  minConfidence: 0.6,
};

/**
 * Safety Analyzer - 安全分析器类
 */
export class SafetyAnalyzer {
  private config: SafetyAnalyzerConfig;

  constructor(config: Partial<SafetyAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 执行完整安全分析
   */
  async analyze(input: SafetyCheckInput): Promise<SafetyAnalysisResult> {
    const threats: ThreatIndicator[] = [];
    const details: string[] = [];
    const recommendations: string[] = [];

    // 1. URL 检查
    if (this.config.enableUrlCheck && input.url) {
      const urlThreats = this.analyzeUrl(input.url);
      threats.push(...urlThreats);
      if (urlThreats.length > 0) {
        details.push(`URL 分析发现 ${urlThreats.length} 个潜在威胁`);
      }
    }

    // 2. 文本分析
    if (this.config.enableTextAnalysis && input.text) {
      const textThreats = this.analyzeText(input.text);
      threats.push(...textThreats);
      if (textThreats.length > 0) {
        details.push(`文本分析发现 ${textThreats.length} 个可疑内容`);
      }
    }

    // 3. 邮件分析
    if (this.config.enableEmailAnalysis && input.email) {
      const emailThreats = this.analyzeEmail(input.email);
      threats.push(...emailThreats);
      if (emailThreats.length > 0) {
        details.push(`邮件分析发现 ${emailThreats.length} 个潜在威胁`);
      }
    }

    // 4. 屏幕内容分析
    if (input.screenContent) {
      const screenThreats = this.analyzeText(input.screenContent);
      threats.push(...screenThreats);
      if (screenThreats.length > 0) {
        details.push(`屏幕内容分析发现 ${screenThreats.length} 个可疑内容`);
      }
    }

    // 过滤低置信度威胁
    const filteredThreats = threats.filter(
      (t) => t.confidence >= this.config.minConfidence
    );

    // 计算风险等级
    const riskLevel = this.calculateRiskLevel(filteredThreats);

    // 生成建议
    recommendations.push(...this.generateRecommendations(filteredThreats, riskLevel));

    // 5. 网络搜索验证（如果有高风险威胁）
    let groundingInfo: GroundingInfo | undefined;
    if (
      this.config.enableWebGrounding &&
      this.config.tavilyApiKey &&
      riskLevel !== 'safe' &&
      (input.url || filteredThreats.length > 0)
    ) {
      groundingInfo = await this.searchForGrounding(input, filteredThreats);
      if (groundingInfo?.knownThreatReported) {
        details.push('网络搜索确认这是已知的安全威胁');
      }
    }

    // 生成摘要
    const summary = this.generateSummary(filteredThreats, riskLevel, groundingInfo);

    // 添加威胁详情
    for (const threat of filteredThreats) {
      const typeInfo = THREAT_TYPE_DESCRIPTIONS[threat.type];
      details.push(`${typeInfo.name}: ${threat.description}`);
    }

    return {
      isSafe: riskLevel === 'safe',
      riskLevel,
      confidence: this.calculateOverallConfidence(filteredThreats),
      threats: filteredThreats,
      summary,
      details,
      recommendations,
      groundingInfo,
      timestamp: Date.now(),
    };
  }

  /**
   * 分析 URL
   */
  private analyzeUrl(url: string): ThreatIndicator[] {
    const threats: ThreatIndicator[] = [];
    const patterns = getThreatPatternsByCategory('url');

    // 检查 URL 模式
    for (const pattern of patterns) {
      const match = url.match(pattern.pattern);
      if (match) {
        threats.push({
          type: pattern.type,
          pattern: pattern.pattern.source,
          confidence: pattern.confidence,
          description: pattern.description,
          matchedContent: match[0],
          location: 'URL',
        });
      }
    }

    // 额外 URL 分析
    try {
      const urlObj = new URL(url);

      // 检查可疑的子域名
      const subdomain = urlObj.hostname.split('.').slice(0, -2).join('.');
      if (subdomain && /(?:secure|login|account|verify|update)/.test(subdomain)) {
        threats.push({
          type: 'phishing',
          pattern: 'suspicious_subdomain',
          confidence: 0.7,
          description: '可疑的子域名可能表示钓鱼网站',
          matchedContent: subdomain,
          location: 'subdomain',
        });
      }

      // 检查过长的域名
      if (urlObj.hostname.length > 50) {
        threats.push({
          type: 'suspicious_url',
          pattern: 'long_hostname',
          confidence: 0.5,
          description: '异常长的域名可能用于混淆真实目的',
          matchedContent: urlObj.hostname,
          location: 'hostname',
        });
      }

      // 检查大量连字符
      if ((urlObj.hostname.match(/-/g) || []).length > 3) {
        threats.push({
          type: 'suspicious_url',
          pattern: 'many_hyphens',
          confidence: 0.6,
          description: '域名中包含多个连字符可能是仿冒网站',
          matchedContent: urlObj.hostname,
          location: 'hostname',
        });
      }

      // 检查数据 URI
      if (url.startsWith('data:')) {
        threats.push({
          type: 'suspicious_url',
          pattern: 'data_uri',
          confidence: 0.8,
          description: 'Data URI 可能用于绕过安全检查',
          matchedContent: url.substring(0, 50),
          location: 'protocol',
        });
      }
    } catch {
      // URL 解析失败，可能是恶意格式
      threats.push({
        type: 'suspicious_url',
        pattern: 'invalid_url',
        confidence: 0.6,
        description: '无法解析的 URL 格式可能是恶意的',
        matchedContent: url.substring(0, 100),
        location: 'URL',
      });
    }

    return threats;
  }

  /**
   * 分析文本内容
   */
  private analyzeText(text: string): ThreatIndicator[] {
    const threats: ThreatIndicator[] = [];
    const patterns = [
      ...getThreatPatternsByCategory('text'),
      ...getThreatPatternsByCategory('general'),
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern.pattern);
      if (match) {
        threats.push({
          type: pattern.type,
          pattern: pattern.pattern.source,
          confidence: pattern.confidence,
          description: pattern.description,
          matchedContent: match[0],
          location: 'text content',
        });
      }
    }

    // 检测多个威胁指标组合
    const urgencyCount = (text.match(/urgent|immediately|act now|limited time/gi) || []).length;
    const moneyCount = (text.match(/\$\d+|money|payment|transfer|send/gi) || []).length;

    if (urgencyCount >= 2 && moneyCount >= 1) {
      threats.push({
        type: 'scam',
        pattern: 'urgency_money_combo',
        confidence: 0.85,
        description: '紧迫感与金钱请求的组合是典型的诈骗特征',
        location: 'text content',
      });
    }

    return threats;
  }

  /**
   * 分析邮件
   */
  private analyzeEmail(email: { from: string; subject: string; body: string }): ThreatIndicator[] {
    const threats: ThreatIndicator[] = [];
    const emailPatterns = getThreatPatternsByCategory('email');

    // 检查发件人
    for (const pattern of emailPatterns) {
      const fromMatch = email.from.match(pattern.pattern);
      if (fromMatch) {
        threats.push({
          type: pattern.type,
          pattern: pattern.pattern.source,
          confidence: pattern.confidence,
          description: pattern.description,
          matchedContent: fromMatch[0],
          location: 'sender address',
        });
      }
    }

    // 检查主题
    const subjectThreats = this.analyzeText(email.subject);
    threats.push(
      ...subjectThreats.map((t) => ({ ...t, location: 'email subject' }))
    );

    // 检查正文
    const bodyThreats = this.analyzeText(email.body);
    threats.push(
      ...bodyThreats.map((t) => ({ ...t, location: 'email body' }))
    );

    // 检查发件人与声称身份不匹配
    const claimedBrands = email.body.match(
      /(?:paypal|apple|google|microsoft|amazon|facebook|bank of america|wells fargo)/gi
    );
    if (claimedBrands) {
      const fromDomain = email.from.split('@')[1]?.toLowerCase();
      const brandDomains: Record<string, string[]> = {
        paypal: ['paypal.com'],
        apple: ['apple.com', 'icloud.com'],
        google: ['google.com', 'gmail.com'],
        microsoft: ['microsoft.com', 'outlook.com'],
        amazon: ['amazon.com', 'amazon.co.uk'],
        facebook: ['facebook.com', 'fb.com', 'meta.com'],
      };

      for (const brand of claimedBrands) {
        const validDomains = brandDomains[brand.toLowerCase()];
        if (validDomains && fromDomain && !validDomains.includes(fromDomain)) {
          threats.push({
            type: 'impersonation',
            pattern: 'brand_domain_mismatch',
            confidence: 0.9,
            description: `邮件声称来自 ${brand}，但发件人域名不匹配`,
            matchedContent: `${brand} from ${fromDomain}`,
            location: 'sender verification',
          });
        }
      }
    }

    return threats;
  }

  /**
   * 计算风险等级
   */
  private calculateRiskLevel(threats: ThreatIndicator[]): SafetyRiskLevel {
    if (threats.length === 0) {
      return 'safe';
    }

    const maxConfidence = Math.max(...threats.map((t) => t.confidence));
    const threatCount = threats.length;

    // 检查是否有严重威胁类型
    const criticalTypes: ThreatType[] = [
      'malware',
      'fake_login',
      'cryptocurrency_scam',
      'impersonation',
    ];
    const hasCriticalThreat = threats.some(
      (t) => criticalTypes.includes(t.type) && t.confidence >= 0.85
    );

    if (hasCriticalThreat || (maxConfidence >= 0.9 && threatCount >= 2)) {
      return 'critical';
    }

    if (maxConfidence >= 0.85 || threatCount >= 3) {
      return 'high';
    }

    if (maxConfidence >= 0.7 || threatCount >= 2) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * 计算总体置信度
   */
  private calculateOverallConfidence(threats: ThreatIndicator[]): number {
    if (threats.length === 0) {
      return 0;
    }

    // 使用加权平均，高置信度威胁权重更大
    const weights = threats.map((t) => t.confidence * t.confidence);
    const weightedSum = threats.reduce(
      (sum, t, i) => sum + t.confidence * weights[i],
      0
    );
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    return Math.min(1, weightedSum / totalWeight);
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    threats: ThreatIndicator[],
    riskLevel: SafetyRiskLevel
  ): string[] {
    const recommendations: string[] = [];
    const riskInfo = RISK_LEVEL_DESCRIPTIONS[riskLevel];
    recommendations.push(riskInfo.action);

    const threatTypes = new Set(threats.map((t) => t.type));

    if (threatTypes.has('phishing') || threatTypes.has('fake_login')) {
      recommendations.push('不要在此页面输入任何个人信息或密码');
      recommendations.push('直接访问官方网站而不是点击链接');
    }

    if (threatTypes.has('scam') || threatTypes.has('lottery_scam')) {
      recommendations.push('不要汇款或提供银行信息');
      recommendations.push('合法机构不会要求通过邮件或电话提供敏感信息');
    }

    if (threatTypes.has('malware')) {
      recommendations.push('不要下载或运行任何文件');
      recommendations.push('确保您的防病毒软件已更新');
    }

    if (threatTypes.has('cryptocurrency_scam')) {
      recommendations.push('不要向任何人发送加密货币');
      recommendations.push('没有人会免费赠送加密货币');
    }

    if (threatTypes.has('tech_support_scam')) {
      recommendations.push('不要拨打屏幕上显示的电话号码');
      recommendations.push('Microsoft/Apple 不会主动联系您');
    }

    if (threatTypes.has('urgency_manipulation')) {
      recommendations.push('不要因为紧迫感而做出草率决定');
      recommendations.push('合法请求会给您足够的时间');
    }

    if (riskLevel === 'critical' || riskLevel === 'high') {
      recommendations.push('考虑向相关部门报告此威胁');
      recommendations.push('如果您已提供信息，立即更改密码并监控账户');
    }

    return recommendations;
  }

  /**
   * 生成摘要
   */
  private generateSummary(
    threats: ThreatIndicator[],
    riskLevel: SafetyRiskLevel,
    groundingInfo?: GroundingInfo
  ): string {
    const riskInfo = RISK_LEVEL_DESCRIPTIONS[riskLevel];

    if (threats.length === 0) {
      return '未检测到明显的安全威胁。';
    }

    const mainThreat = threats.sort((a, b) => b.confidence - a.confidence)[0];
    const typeInfo = THREAT_TYPE_DESCRIPTIONS[mainThreat.type];

    let summary = `检测到${riskInfo.name}级别的安全威胁。主要威胁类型：${typeInfo.name}。`;

    if (groundingInfo?.knownThreatReported) {
      summary += ' 网络搜索确认这是已知的安全威胁。';
    }

    return summary;
  }

  /**
   * 搜索网络获取依据信息
   */
  private async searchForGrounding(
    input: SafetyCheckInput,
    threats: ThreatIndicator[]
  ): Promise<GroundingInfo | undefined> {
    try {
      // 构建搜索查询
      let query = '';
      if (input.url) {
        // 提取域名进行搜索
        try {
          const urlObj = new URL(input.url);
          query = `"${urlObj.hostname}" scam fraud phishing`;
        } catch {
          query = `"${input.url.substring(0, 50)}" scam fraud`;
        }
      } else if (threats.length > 0) {
        const mainThreat = threats[0];
        query = `${mainThreat.matchedContent || mainThreat.description} scam fraud`;
      }

      if (!query) {
        return undefined;
      }

      // 执行搜索
      const searchResult = await WebSearchTool.execute(
        {
          query,
          search_type: 'general',
          max_results: 5,
          search_depth: 'basic',
        },
        {
          config: {
            tavilyApiKey: this.config.tavilyApiKey,
          } as WebSearchConfig,
        }
      );

      if (searchResult.isError) {
        return undefined;
      }

      // 解析搜索结果
      const content = searchResult.content[0];
      if (content.type !== 'text' || !content.text) {
        return undefined;
      }

      // 检查是否找到已知威胁报告
      const textContent = content.text;
      const resultText = textContent.toLowerCase();
      const scamKeywords = [
        'scam',
        'fraud',
        'phishing',
        'fake',
        'warning',
        'alert',
        'reported',
        'malicious',
        '诈骗',
        '欺诈',
        '钓鱼',
        '警告',
      ];
      const knownThreatReported = scamKeywords.some((keyword) =>
        resultText.includes(keyword)
      );

      return {
        query,
        results: this.parseSearchResults(textContent),
        knownThreatReported,
        reportSummary: knownThreatReported
          ? '网络搜索发现相关的诈骗或安全警告报告。'
          : undefined,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * 解析搜索结果
   */
  private parseSearchResults(text: string): GroundingResult[] {
    const results: GroundingResult[] = [];
    const lines = text.split('\n');

    let currentResult: Partial<GroundingResult> = {};
    for (const line of lines) {
      if (line.startsWith('[')) {
        // 新结果开始
        if (currentResult.title) {
          results.push(currentResult as GroundingResult);
        }
        currentResult = {
          title: line.replace(/^\[\d+\]\s*/, ''),
          relevanceScore: 0.5,
          source: '',
          url: '',
          content: '',
        };
      } else if (line.startsWith('URL:')) {
        currentResult.url = line.replace('URL:', '').trim();
        try {
          currentResult.source = new URL(currentResult.url).hostname;
        } catch {
          currentResult.source = currentResult.url;
        }
      } else if (line.startsWith('Content:')) {
        currentResult.content = line.replace('Content:', '').trim();
      }
    }

    if (currentResult.title) {
      results.push(currentResult as GroundingResult);
    }

    return results;
  }

  /**
   * 创建 A2UI 安全警告卡片
   */
  createAlertCard(result: SafetyAnalysisResult, input: SafetyCheckInput): A2UISafetyAlertCard {
    const mainThreat = result.threats[0];
    const typeInfo = mainThreat
      ? THREAT_TYPE_DESCRIPTIONS[mainThreat.type]
      : { name: '安全警告', description: '' };
    const riskInfo = RISK_LEVEL_DESCRIPTIONS[result.riskLevel];

    return {
      type: 'safety_alert',
      id: `safety-alert-${Date.now()}`,
      title: `${riskInfo.name}: ${typeInfo.name}`,
      description: result.summary,
      icon: result.riskLevel === 'critical' || result.riskLevel === 'high' ? 'error' : 'warning',
      timestamp: result.timestamp,
      riskLevel: result.riskLevel,
      threatType: mainThreat?.type || 'unknown',
      threats: result.threats,
      details: result.details,
      recommendations: result.recommendations,
      groundingInfo: result.groundingInfo,
      actions: [
        {
          id: 'view_details',
          label: '查看详情',
          type: 'primary',
          icon: 'info',
        },
        {
          id: 'report_threat',
          label: '举报威胁',
          type: 'secondary',
          icon: 'warning',
        },
        {
          id: 'dismiss',
          label: '忽略',
          type: 'dismiss',
        },
      ],
      metadata: {
        sourceUrl: input.url,
        sourceText: input.text?.substring(0, 200),
        analyzedAt: result.timestamp,
      },
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SafetyAnalyzerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): SafetyAnalyzerConfig {
    return { ...this.config };
  }
}

// 单例
let globalSafetyAnalyzer: SafetyAnalyzer | null = null;

export function getSafetyAnalyzer(): SafetyAnalyzer {
  if (!globalSafetyAnalyzer) {
    globalSafetyAnalyzer = new SafetyAnalyzer();
  }
  return globalSafetyAnalyzer;
}

export function setSafetyAnalyzer(analyzer: SafetyAnalyzer): void {
  globalSafetyAnalyzer = analyzer;
}

export function createSafetyAnalyzer(
  config?: Partial<SafetyAnalyzerConfig>
): SafetyAnalyzer {
  return new SafetyAnalyzer(config);
}
