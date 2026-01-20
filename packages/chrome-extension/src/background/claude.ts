/**
 * Claude API Client for Chrome Extension
 */

export interface ClaudeClientConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class ClaudeClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: ClaudeClientConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
  }

  async complete(prompt: string, maxTokens = 1024): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    return data.content[0]?.text || '';
  }
}
