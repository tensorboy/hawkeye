import { spawn } from 'child_process';
import * as path from 'path';
import type { MCPTool, ToolResult } from '../../mcp/tool-types';

export interface WebSearchConfig {
  tavilyApiKey: string;
  pythonPath?: string;
  scriptPath?: string;
}

export const WebSearchTool: MCPTool = {
  name: 'web_search',
  description: 'Search the internet for real-time information, news, and images using Tavily API. Use this when you need up-to-date information.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query'
      },
      search_type: {
        type: 'string',
        enum: ['general', 'news', 'images'],
        description: 'Type of search to perform',
        default: 'general'
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results (1-10)',
        default: 5
      },
      search_depth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        description: 'Search depth (advanced is more thorough but slower)',
        default: 'basic'
      }
    },
    required: ['query']
  },
  execute: async (input: any, context?: any) => {
    const config = context?.config as WebSearchConfig;

    if (!config?.tavilyApiKey) {
      return {
        content: [{ type: 'text', text: 'Error: Tavily API key not configured.' }],
        isError: true
      };
    }

    const pythonPath = config.pythonPath || 'python3';
    // Locate the script relative to this file or project root
    // In production, this path needs to be resolved correctly relative to the bundled app
    const scriptPath = config.scriptPath || path.resolve(__dirname, '../../../scripts/web-search/inference.py');

    return new Promise<ToolResult>((resolve) => {
      const args = [
        scriptPath,
        '--api_key', config.tavilyApiKey,
        '--query', input.query,
        '--search_type', input.search_type || 'general',
        '--max_results', String(input.max_results || 5),
        '--search_depth', input.search_depth || 'basic'
      ];

      const process = spawn(pythonPath, args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          resolve({
            content: [{ type: 'text', text: `Search failed (code ${code}): ${stderr}` }],
            isError: true
          });
          return;
        }

        try {
          // Parse JSON output from the script
          const result = JSON.parse(stdout);

          if (result.is_error) {
             resolve({
              content: [{ type: 'text', text: `Search error: ${result.error}` }],
              isError: true
            });
            return;
          }

          // Format output for the LLM
          let outputText = `Search Results for "${result.query}":\n\n`;

          if (result.answer) {
            outputText += `Summary: ${result.answer}\n\n`;
          }

          if (result.results && result.results.length > 0) {
            result.results.forEach((item: any, index: number) => {
              outputText += `[${index + 1}] ${item.title}\n`;
              outputText += `URL: ${item.url}\n`;
              outputText += `Content: ${item.content.substring(0, 300)}...\n\n`;
            });
          } else if (result.images && result.images.length > 0) {
             result.images.forEach((img: any, index: number) => {
               outputText += `[Image ${index + 1}] ${img.url}\n`;
             });
          } else {
            outputText += "No results found.";
          }

          resolve({
            content: [{ type: 'text', text: outputText }]
          });

        } catch (e) {
          resolve({
            content: [{ type: 'text', text: `Failed to parse search results: ${(e as Error).message}\nRaw output: ${stdout}` }],
            isError: true
          });
        }
      });

      process.on('error', (err) => {
         resolve({
            content: [{ type: 'text', text: `Failed to spawn search process: ${err.message}` }],
            isError: true
          });
      });
    });
  }
};
