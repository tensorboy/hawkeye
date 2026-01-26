import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface AppConfig {
  aiProvider: 'ollama' | 'gemini' | 'openai';
  ollamaHost?: string;
  ollamaModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiBaseUrl?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  syncPort: number;
  autoStartSync: boolean;
  autoUpdate: boolean;
  localOnly: boolean;
  smartObserve: boolean;
  smartObserveInterval: number;
  smartObserveThreshold: number;
  onboardingCompleted: boolean;

  // Skill Configs
  tavilyApiKey?: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  aiProvider: 'openai',
  ollamaHost: 'http://localhost:11434',
  ollamaModel: 'qwen2.5vl:7b',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash-preview-05-20',
  geminiBaseUrl: '',
  // Antigravity API configuration
  openaiBaseUrl: 'http://74.48.133.20:8045',
  openaiApiKey: 'sk-antigravity-pickfrom2026',
  openaiModel: 'gemini-3-flash-preview',
  syncPort: 23789,
  autoStartSync: true,
  autoUpdate: true,
  localOnly: false,
  smartObserve: true,
  smartObserveInterval: 3000,
  smartObserveThreshold: 0.05,
  onboardingCompleted: false,
  tavilyApiKey: '',
};

export const LOCAL_ONLY_CONFIG = {
  model: 'qwen3-vl:2b-q4_k_m',
  alternativeModels: [
    'qwen3-vl:2b',
    'qwen2.5vl:7b',
    'llava:7b',
  ],
};

export class ConfigService {
  private config: AppConfig;
  private configPath: string;
  private debugLogFn: (msg: string) => void;

  constructor(debugLogFn: (msg: string) => void = console.log) {
    this.debugLogFn = debugLogFn;
    this.configPath = path.join(os.homedir(), '.hawkeye', 'config.json');
    this.config = { ...DEFAULT_CONFIG, ...this.loadConfig() };
  }

  private loadConfig(): Partial<AppConfig> {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const config = JSON.parse(data);
        this.debugLogFn(`Config loaded from ${this.configPath}`);
        return config;
      }
    } catch (error) {
      this.debugLogFn(`Failed to load config: ${error}`);
    }
    return {};
  }

  getConfig(): AppConfig {
    return this.config;
  }

  saveConfig(newConfig: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...newConfig };

    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      this.debugLogFn(`Config saved to ${this.configPath}`);
    } catch (error) {
      this.debugLogFn(`Failed to save config: ${error}`);
    }

    return this.config;
  }
}
