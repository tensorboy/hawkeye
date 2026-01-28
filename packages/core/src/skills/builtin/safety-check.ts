/**
 * Safety Check Tool - 安全检查工具
 * 你的个人超级安全助手 MCP 工具
 * 检测诈骗、钓鱼、恶意内容等安全威胁
 */

import type { MCPTool, ToolResult } from '../../mcp/tool-types';
import {
  SafetyAnalyzer,
  type SafetyCheckInput,
  type SafetyAnalyzerConfig,
  THREAT_TYPE_DESCRIPTIONS,
  RISK_LEVEL_DESCRIPTIONS,
} from '../../safety';

export interface SafetyCheckConfig {
  tavilyApiKey?: string;
  enableWebGrounding?: boolean;
}

export const SafetyCheckTool: MCPTool = {
  name: 'safety_check',
  description: `你的个人超级安全助手。检测诈骗、钓鱼网站、恶意链接和其他安全威胁。
当你发现可疑的 URL、邮件或文本内容时，使用此工具进行安全分析。
会自动搜索网络验证威胁信息，并提供详细的风险评估和建议。`,
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要检查的 URL 链接',
      },
      text: {
        type: 'string',
        description: '要检查的文本内容（如短信、消息等）',
      },
      email_from: {
        type: 'string',
        description: '邮件发件人地址',
      },
      email_subject: {
        type: 'string',
        description: '邮件主题',
      },
      email_body: {
        type: 'string',
        description: '邮件正文内容',
      },
      screen_content: {
        type: 'string',
        description: '屏幕上识别的内容',
      },
      context: {
        type: 'string',
        description: '额外上下文信息',
      },
    },
  },
  execute: async (input: any, context?: any) => {
    const config = context?.config as SafetyCheckConfig;

    // 构建检查输入
    const checkInput: SafetyCheckInput = {};

    if (input.url) {
      checkInput.url = input.url;
    }

    if (input.text) {
      checkInput.text = input.text;
    }

    if (input.email_from || input.email_subject || input.email_body) {
      checkInput.email = {
        from: input.email_from || '',
        subject: input.email_subject || '',
        body: input.email_body || '',
      };
    }

    if (input.screen_content) {
      checkInput.screenContent = input.screen_content;
    }

    if (input.context) {
      checkInput.context = input.context;
    }

    // 检查是否有输入内容
    if (
      !checkInput.url &&
      !checkInput.text &&
      !checkInput.email &&
      !checkInput.screenContent
    ) {
      return {
        content: [
          {
            type: 'text',
            text: '错误：请提供要检查的内容（URL、文本、邮件或屏幕内容）',
          },
        ],
        isError: true,
      };
    }

    try {
      // 创建安全分析器
      const analyzerConfig: Partial<SafetyAnalyzerConfig> = {
        enableUrlCheck: true,
        enableTextAnalysis: true,
        enableEmailAnalysis: true,
        enableWebGrounding: config?.enableWebGrounding ?? true,
        tavilyApiKey: config?.tavilyApiKey,
      };

      const analyzer = new SafetyAnalyzer(analyzerConfig);

      // 执行分析
      const result = await analyzer.analyze(checkInput);

      // 格式化输出
      let output = '';

      // 风险等级标题
      const riskInfo = RISK_LEVEL_DESCRIPTIONS[result.riskLevel];
      if (result.isSafe) {
        output += `## ✅ 安全检查通过\n\n`;
        output += `未检测到明显的安全威胁。\n\n`;
      } else {
        const riskEmoji =
          result.riskLevel === 'critical'
            ? '🚨'
            : result.riskLevel === 'high'
              ? '⚠️'
              : result.riskLevel === 'medium'
                ? '⚡'
                : '⚡';
        output += `## ${riskEmoji} ${riskInfo.name}警告\n\n`;
        output += `${result.summary}\n\n`;
      }

      // 威胁详情
      if (result.threats.length > 0) {
        output += `### 检测到的威胁\n\n`;
        for (const threat of result.threats) {
          const typeInfo = THREAT_TYPE_DESCRIPTIONS[threat.type];
          output += `- **${typeInfo.name}** (置信度: ${Math.round(threat.confidence * 100)}%)\n`;
          output += `  ${threat.description}\n`;
          if (threat.matchedContent) {
            output += `  > 匹配内容: \`${threat.matchedContent.substring(0, 100)}\`\n`;
          }
        }
        output += '\n';
      }

      // 详细信息
      if (result.details.length > 0) {
        output += `### 分析详情\n\n`;
        for (const detail of result.details) {
          output += `- ${detail}\n`;
        }
        output += '\n';
      }

      // 建议操作
      if (result.recommendations.length > 0) {
        output += `### 建议操作\n\n`;
        for (const rec of result.recommendations) {
          output += `✓ ${rec}\n`;
        }
        output += '\n';
      }

      // 网络搜索验证
      if (result.groundingInfo) {
        output += `### 网络搜索验证\n\n`;

        if (result.groundingInfo.knownThreatReported) {
          output += `🔍 **已确认的安全威胁** - 网络搜索发现相关诈骗或安全警告报告。\n\n`;
        }

        if (result.groundingInfo.results.length > 0) {
          output += `相关来源:\n`;
          for (const source of result.groundingInfo.results.slice(0, 3)) {
            output += `- [${source.title}](${source.url})\n`;
            if (source.content) {
              output += `  ${source.content.substring(0, 150)}...\n`;
            }
          }
        }
      }

      // 元数据
      output += `\n---\n`;
      output += `分析时间: ${new Date(result.timestamp).toLocaleString()}\n`;
      output += `总体置信度: ${Math.round(result.confidence * 100)}%\n`;

      return {
        content: [{ type: 'text', text: output }],
        metadata: {
          riskLevel: result.riskLevel,
          isSafe: result.isSafe,
          threatCount: result.threats.length,
          hasGrounding: !!result.groundingInfo,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `安全检查失败: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * 快速 URL 安全检查
 */
export const QuickUrlCheckTool: MCPTool = {
  name: 'quick_url_check',
  description: '快速检查 URL 是否安全，不进行网络搜索验证（更快但信息较少）',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要检查的 URL',
      },
    },
    required: ['url'],
  },
  execute: async (input: any) => {
    const analyzer = new SafetyAnalyzer({
      enableWebGrounding: false,
    });

    const result = await analyzer.analyze({ url: input.url });

    const riskInfo = RISK_LEVEL_DESCRIPTIONS[result.riskLevel];
    let output = '';

    if (result.isSafe) {
      output = `✅ URL 看起来是安全的: ${input.url}`;
    } else {
      output = `${result.riskLevel === 'critical' || result.riskLevel === 'high' ? '🚨' : '⚠️'} ${riskInfo.name}: ${input.url}\n`;
      output += result.summary;
      if (result.recommendations.length > 0) {
        output += `\n建议: ${result.recommendations[0]}`;
      }
    }

    return {
      content: [{ type: 'text', text: output }],
      metadata: {
        riskLevel: result.riskLevel,
        isSafe: result.isSafe,
      },
    };
  },
};
