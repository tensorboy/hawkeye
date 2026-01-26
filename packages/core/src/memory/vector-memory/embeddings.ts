/**
 * Embedding Providers - 嵌入向量生成
 * 支持 OpenAI、Gemini、本地模型
 */

import type { EmbeddingProvider, EmbeddingConfig, EmbeddingProviderType } from './types';

// ============ OpenAI Provider ============

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions: number;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'text-embedding-3-small';
    this.dimensions = config.dimensions || 1536;
  }

  async embedQuery(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map(d => d.embedding);
  }
}

// ============ Gemini Provider ============

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini';
  readonly dimensions: number;
  private apiKey: string;
  private model: string;

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    this.model = config.model || 'text-embedding-004';
    this.dimensions = config.dimensions || 768;
  }

  async embedQuery(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const results: number[][] = [];

    // Gemini doesn't support batch embedding in the same way, process one by one
    for (const text of texts) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${this.model}:embedContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: `models/${this.model}`,
            content: {
              parts: [{ text }],
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini embedding failed: ${error}`);
      }

      const data = await response.json() as {
        embedding: { values: number[] };
      };

      results.push(data.embedding.values);
    }

    return results;
  }
}

// ============ Local Provider (简单词袋模型) ============

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local';
  readonly dimensions: number;

  constructor(config: EmbeddingConfig) {
    this.dimensions = config.dimensions || 384;
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(text => this.embed(text));
  }

  private embed(text: string): number[] {
    const vector = new Array(this.dimensions).fill(0);

    // 简单分词 (支持中文)
    const words = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);

    // 使用哈希将词映射到向量维度
    for (const word of words) {
      const hash = this.hashString(word);
      const index = Math.abs(hash) % this.dimensions;
      vector[index] += 1;
    }

    // L2 归一化
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }
}

// ============ Provider Factory ============

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  const providerType = resolveProviderType(config.provider);

  switch (providerType) {
    case 'openai':
      return new OpenAIEmbeddingProvider(config);
    case 'gemini':
      return new GeminiEmbeddingProvider(config);
    case 'local':
    default:
      return new LocalEmbeddingProvider(config);
  }
}

function resolveProviderType(type: EmbeddingProviderType): Exclude<EmbeddingProviderType, 'auto'> {
  if (type !== 'auto') {
    return type;
  }

  // Auto-detect: try OpenAI first, then Gemini, fallback to local
  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return 'gemini';
  }
  return 'local';
}

// ============ Embedding Cache ============

export class EmbeddingCache {
  private cache: Map<string, number[]> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize;
  }

  private getCacheKey(provider: string, model: string, text: string): string {
    // Use text hash for the key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${provider}:${model}:${hash}`;
  }

  get(provider: string, model: string, text: string): number[] | undefined {
    return this.cache.get(this.getCacheKey(provider, model, text));
  }

  set(provider: string, model: string, text: string, embedding: number[]): void {
    const key = this.getCacheKey(provider, model, text);

    // LRU eviction if over max size
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, embedding);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
