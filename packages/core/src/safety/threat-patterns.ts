/**
 * Threat Patterns - 威胁检测模式库
 * 包含各类诈骗、钓鱼、恶意内容的检测模式
 */

import type { ThreatPattern, ThreatType } from './types';

/**
 * URL 相关威胁模式
 */
export const URL_THREAT_PATTERNS: ThreatPattern[] = [
  // 钓鱼 URL 模式
  {
    type: 'phishing',
    pattern: /(?:paypal|apple|google|microsoft|amazon|facebook|instagram|netflix|bank)[-_.]?(?:secure|login|verify|update|account|support)/i,
    confidence: 0.85,
    description: '疑似仿冒知名品牌的钓鱼链接',
    category: 'url',
  },
  {
    type: 'phishing',
    pattern: /(?:login|signin|account|secure|verify)[-_.]?(?:paypal|apple|google|microsoft|amazon)/i,
    confidence: 0.85,
    description: '疑似仿冒登录页面',
    category: 'url',
  },
  {
    type: 'suspicious_url',
    pattern: /(?:bit\.ly|tinyurl|goo\.gl|t\.co|shorturl|tiny\.cc|is\.gd|v\.gd|clck\.ru|cutt\.ly)\/[a-zA-Z0-9]+/i,
    confidence: 0.5,
    description: '短链接可能隐藏真实目的地',
    category: 'url',
  },
  {
    type: 'suspicious_url',
    pattern: /(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/|$)/,
    confidence: 0.7,
    description: '直接使用 IP 地址的链接可能是恶意的',
    category: 'url',
  },
  {
    type: 'fake_website',
    pattern: /(?:amaz0n|g00gle|paypa1|micros0ft|faceb00k|app1e|netf1ix|0utlook)/i,
    confidence: 0.9,
    description: '使用数字替代字母的仿冒域名',
    category: 'url',
  },
  {
    type: 'fake_website',
    pattern: /(?:amazon|google|paypal|microsoft|facebook|apple|netflix)(?:-|\.)?(?:com|net|org)?\.[a-z]{2,}$/i,
    confidence: 0.8,
    description: '在知名品牌后添加额外域名后缀',
    category: 'url',
  },
  {
    type: 'malware',
    pattern: /\.(?:exe|msi|bat|cmd|scr|pif|com|vbs|js|jar|apk|dmg)(?:\?|$)/i,
    confidence: 0.7,
    description: '直接下载可执行文件链接',
    category: 'url',
  },

  // 加密货币诈骗 URL
  {
    type: 'cryptocurrency_scam',
    pattern: /(?:bitcoin|ethereum|crypto|btc|eth)[-_.]?(?:giveaway|double|free|bonus|airdrop)/i,
    confidence: 0.9,
    description: '加密货币赠送骗局',
    category: 'url',
  },
  {
    type: 'cryptocurrency_scam',
    pattern: /(?:elon|musk|tesla)[-_.]?(?:bitcoin|crypto|giveaway)/i,
    confidence: 0.95,
    description: '冒充名人的加密货币骗局',
    category: 'url',
  },
];

/**
 * 文本内容威胁模式
 */
export const TEXT_THREAT_PATTERNS: ThreatPattern[] = [
  // 紧迫感操纵
  {
    type: 'urgency_manipulation',
    pattern: /(?:urgent|immediately|right now|act now|last chance|expires? (?:today|in \d+)|limited time|don't miss|hurry)/i,
    confidence: 0.6,
    description: '使用紧迫感语言制造压力',
    category: 'text',
  },
  {
    type: 'urgency_manipulation',
    pattern: /(?:your account (?:will be|has been) (?:suspended|closed|locked|terminated)|verify within \d+|action required)/i,
    confidence: 0.8,
    description: '威胁账户状态制造恐慌',
    category: 'text',
  },

  // 中奖骗局
  {
    type: 'lottery_scam',
    pattern: /(?:congratulations|you(?:'ve| have)? (?:won|been selected)|winner|prize|lottery|jackpot|million (?:dollar|pound|euro))/i,
    confidence: 0.85,
    description: '声称中奖或获得奖金',
    category: 'text',
  },
  {
    type: 'lottery_scam',
    pattern: /(?:claim your (?:prize|reward|winnings)|winning notification|selected as (?:a )?winner)/i,
    confidence: 0.9,
    description: '要求领取奖品',
    category: 'text',
  },

  // 技术支持骗局
  {
    type: 'tech_support_scam',
    pattern: /(?:your (?:computer|device|pc) (?:has been|is) (?:infected|compromised|hacked)|virus (?:detected|alert)|call (?:microsoft|apple|tech support))/i,
    confidence: 0.9,
    description: '虚假病毒或安全警告',
    category: 'text',
  },
  {
    type: 'tech_support_scam',
    pattern: /(?:call (?:this number|us)|contact support|toll[- ]?free).{0,20}(?:\+?1[- ]?\d{3}[- ]?\d{3}[- ]?\d{4}|\d{3}[- ]?\d{4})/i,
    confidence: 0.8,
    description: '要求拨打可疑技术支持电话',
    category: 'text',
  },

  // 投资骗局
  {
    type: 'investment_fraud',
    pattern: /(?:guaranteed (?:return|profit|income)|risk[- ]?free investment|double your money|high yield|passive income)/i,
    confidence: 0.85,
    description: '承诺保证回报的投资骗局',
    category: 'text',
  },
  {
    type: 'investment_fraud',
    pattern: /(?:make \$?\d+(?:,\d{3})*(?:\.\d{2})? (?:per|a|every) (?:day|week|month)|earn from home|financial freedom)/i,
    confidence: 0.75,
    description: '不切实际的收入承诺',
    category: 'text',
  },

  // 身份冒充
  {
    type: 'impersonation',
    pattern: /(?:this is (?:the )?(?:irs|fbi|police|government|customs)|official notice from|legal action|arrest warrant)/i,
    confidence: 0.9,
    description: '冒充政府或执法机构',
    category: 'text',
  },
  {
    type: 'impersonation',
    pattern: /(?:i am (?:a )?(?:prince|princess|royalty)|nigerian|inheritance|beneficiary|deceased)/i,
    confidence: 0.95,
    description: '经典尼日利亚王子骗局',
    category: 'text',
  },

  // 加密货币骗局
  {
    type: 'cryptocurrency_scam',
    pattern: /(?:send (?:me )?(?:bitcoin|btc|eth|ethereum|crypto)|wallet address|double(?:d)? (?:your )?(?:bitcoin|btc|eth|crypto))/i,
    confidence: 0.9,
    description: '要求发送加密货币',
    category: 'text',
  },
  {
    type: 'cryptocurrency_scam',
    pattern: /(?:elon musk|tesla|spacex).{0,50}(?:bitcoin|btc|crypto|giveaway)/i,
    confidence: 0.95,
    description: '冒充名人的加密货币骗局',
    category: 'text',
  },

  // 钓鱼
  {
    type: 'phishing',
    pattern: /(?:verify your (?:account|identity|information)|confirm your (?:details|password|credentials)|update your (?:payment|billing))/i,
    confidence: 0.8,
    description: '要求验证或更新敏感信息',
    category: 'text',
  },
  {
    type: 'phishing',
    pattern: /(?:click (?:here|the link|below) to (?:verify|confirm|unlock|restore)|enter your (?:password|ssn|credit card|bank))/i,
    confidence: 0.85,
    description: '诱导点击链接或输入敏感信息',
    category: 'text',
  },

  // 情感骗局
  {
    type: 'romance_scam',
    pattern: /(?:i (?:love|miss) you|send (?:me )?money|western union|moneygram|gift cards?|stuck (?:abroad|overseas))/i,
    confidence: 0.7,
    description: '情感操纵或要求汇款',
    category: 'text',
  },
];

/**
 * 邮件特定威胁模式
 */
export const EMAIL_THREAT_PATTERNS: ThreatPattern[] = [
  // 发件人欺骗
  {
    type: 'phishing',
    pattern: /(?:noreply|no-reply|support|security|admin|service)@(?!(?:google|microsoft|apple|amazon|paypal|facebook)\.(com|net|org))/i,
    confidence: 0.6,
    description: '可疑的系统邮件地址',
    category: 'email',
  },
  {
    type: 'phishing',
    pattern: /(?:@(?:gmail|hotmail|yahoo|outlook)\.com).{0,30}(?:paypal|apple|google|microsoft|amazon|bank)/i,
    confidence: 0.85,
    description: '使用免费邮箱冒充官方',
    category: 'email',
  },

  // 主题行警告
  {
    type: 'phishing',
    pattern: /(?:account (?:suspended|locked|compromised)|password (?:reset|expired)|security (?:alert|warning|notice))/i,
    confidence: 0.75,
    description: '可疑的安全警告主题',
    category: 'email',
  },
  {
    type: 'scam',
    pattern: /(?:you(?:'ve| have)? (?:won|inherited)|prize notification|lottery winner|claim (?:your )?(?:prize|reward))/i,
    confidence: 0.9,
    description: '中奖通知主题',
    category: 'email',
  },
];

/**
 * 通用威胁模式
 */
export const GENERAL_THREAT_PATTERNS: ThreatPattern[] = [
  // 可疑付款方式
  {
    type: 'scam',
    pattern: /(?:gift card|wire transfer|western union|moneygram|bitcoin|cryptocurrency|zelle|venmo|cash app)/i,
    confidence: 0.6,
    description: '要求使用难以追踪的付款方式',
    category: 'general',
  },

  // 个人信息请求
  {
    type: 'phishing',
    pattern: /(?:social security|ssn|credit card|bank account|routing number|pin|cvv|date of birth)/i,
    confidence: 0.7,
    description: '请求敏感个人信息',
    category: 'general',
  },

  // 语法/拼写错误 (常见于诈骗)
  {
    type: 'scam',
    pattern: /(?:dear (?:customer|user|member|friend)|kindly|do the needful|revert back|please to)/i,
    confidence: 0.5,
    description: '诈骗邮件常见的不自然措辞',
    category: 'general',
  },
];

/**
 * 获取所有威胁模式
 */
export function getAllThreatPatterns(): ThreatPattern[] {
  return [
    ...URL_THREAT_PATTERNS,
    ...TEXT_THREAT_PATTERNS,
    ...EMAIL_THREAT_PATTERNS,
    ...GENERAL_THREAT_PATTERNS,
  ];
}

/**
 * 按类别获取威胁模式
 */
export function getThreatPatternsByCategory(
  category: 'url' | 'text' | 'email' | 'general'
): ThreatPattern[] {
  return getAllThreatPatterns().filter((p) => p.category === category);
}

/**
 * 按威胁类型获取威胁模式
 */
export function getThreatPatternsByType(type: ThreatType): ThreatPattern[] {
  return getAllThreatPatterns().filter((p) => p.type === type);
}

/**
 * 威胁类型描述映射
 */
export const THREAT_TYPE_DESCRIPTIONS: Record<ThreatType, { name: string; description: string }> = {
  phishing: {
    name: '钓鱼攻击',
    description: '试图通过伪装成可信来源来窃取您的敏感信息',
  },
  scam: {
    name: '诈骗',
    description: '试图通过欺骗手段骗取您的金钱或个人信息',
  },
  malware: {
    name: '恶意软件',
    description: '可能包含病毒、木马或其他恶意程序',
  },
  fake_website: {
    name: '仿冒网站',
    description: '伪装成知名网站以窃取您的信息',
  },
  suspicious_url: {
    name: '可疑链接',
    description: '链接可能指向不安全或恶意内容',
  },
  fake_login: {
    name: '虚假登录页面',
    description: '伪装成合法登录页面以窃取您的凭据',
  },
  cryptocurrency_scam: {
    name: '加密货币骗局',
    description: '利用加密货币进行的诈骗活动',
  },
  investment_fraud: {
    name: '投资诈骗',
    description: '承诺高回报的虚假投资机会',
  },
  tech_support_scam: {
    name: '技术支持骗局',
    description: '冒充技术支持人员进行诈骗',
  },
  romance_scam: {
    name: '情感诈骗',
    description: '利用情感操纵进行的诈骗',
  },
  lottery_scam: {
    name: '彩票/中奖骗局',
    description: '虚假的中奖或抽奖通知',
  },
  impersonation: {
    name: '身份冒充',
    description: '冒充他人或机构进行诈骗',
  },
  urgency_manipulation: {
    name: '紧迫感操纵',
    description: '制造虚假紧迫感迫使您做出草率决定',
  },
  unknown: {
    name: '未知威胁',
    description: '检测到可疑活动，但无法确定具体类型',
  },
};

/**
 * 风险等级描述
 */
export const RISK_LEVEL_DESCRIPTIONS: Record<string, { name: string; color: string; action: string }> = {
  safe: {
    name: '安全',
    color: '#22c55e',
    action: '未检测到威胁',
  },
  low: {
    name: '低风险',
    color: '#eab308',
    action: '建议保持警惕',
  },
  medium: {
    name: '中等风险',
    color: '#f97316',
    action: '建议谨慎操作',
  },
  high: {
    name: '高风险',
    color: '#ef4444',
    action: '强烈建议避免操作',
  },
  critical: {
    name: '严重威胁',
    color: '#dc2626',
    action: '请立即停止并举报',
  },
};
