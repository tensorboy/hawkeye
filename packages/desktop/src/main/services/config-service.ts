import { app, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { AppConfig } from '../../shared/types';

export type { AppConfig } from '../../shared/types';

export const DEFAULT_CONFIG: AppConfig = {
  aiProvider: 'openai',
  // LlamaCpp 默认配置
  llamaCppModelPath: '',
  llamaCppContextSize: 4096,
  llamaCppGpuLayers: -1,
  llamaCppGpuAcceleration: 'auto',
  // Gemini 配置
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash-preview-05-20',
  geminiBaseUrl: '',
  // OpenAI-compatible API configuration
  openaiBaseUrl: '',
  openaiApiKey: '',
  openaiModel: '',
  // 通用配置
  syncPort: 23789,
  autoStartSync: true,
  autoUpdate: true,
  localOnly: false,
  hasGemini: false,
  smartObserve: true,
  smartObserveInterval: 20000,
  smartObserveThreshold: 0.05,
  onboardingCompleted: false,
  whisperEnabled: false,
  whisperModelPath: '',
  whisperLanguage: 'auto',
  tavilyApiKey: '',
};

// 本地模式推荐模型配置
export const LOCAL_ONLY_CONFIG = {
  // 推荐的 GGUF 模型 (用于 llama-cpp)
  recommendedModels: [
    { id: 'Qwen/Qwen2.5-7B-Instruct-GGUF', name: 'Qwen 2.5 7B', type: 'text' as const },
    { id: 'lmstudio-community/Llama-3.2-3B-Instruct-GGUF', name: 'Llama 3.2 3B', type: 'text' as const },
    { id: 'cjpais/llava-1.6-mistral-7b-gguf', name: 'LLaVA 1.6 7B', type: 'vision' as const },
  ],
};

/** Keys that contain secrets and should be encrypted at rest. */
const SENSITIVE_KEYS: ReadonlyArray<keyof AppConfig> = [
  'geminiApiKey',
  'openaiApiKey',
  'tavilyApiKey',
];

export class ConfigService {
  private config: AppConfig;
  private configPath: string;
  private secretsPath: string;
  private debugLogFn: (msg: string) => void;

  constructor(debugLogFn: (msg: string) => void = console.log) {
    this.debugLogFn = debugLogFn;
    const configDir = path.join(os.homedir(), '.hawkeye');
    this.configPath = path.join(configDir, 'config.json');
    this.secretsPath = path.join(configDir, 'secrets.enc');
    this.config = { ...DEFAULT_CONFIG, ...this.loadConfig() };
  }

  private loadConfig(): Partial<AppConfig> {
    let config: Partial<AppConfig> = {};
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        config = JSON.parse(data);
        this.debugLogFn(`Config loaded from ${this.configPath}`);
      }
    } catch (error) {
      this.debugLogFn(`Failed to load config: ${error}`);
    }

    // Merge decrypted secrets on top of plain config
    const secrets = this.loadSecrets();
    Object.assign(config, secrets);

    // Migrate: if plain config still has cleartext secrets, move them to encrypted storage
    this.migrateCleartextSecrets(config);

    return config;
  }

  private loadSecrets(): Partial<AppConfig> {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        this.debugLogFn('safeStorage encryption not available, secrets stored in plain config');
        return {};
      }
      if (!fs.existsSync(this.secretsPath)) return {};

      const encrypted = fs.readFileSync(this.secretsPath);
      const decrypted = safeStorage.decryptString(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      this.debugLogFn(`Failed to load secrets: ${error}`);
      return {};
    }
  }

  private saveSecrets(secrets: Partial<AppConfig>): void {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        this.debugLogFn('safeStorage encryption not available, skipping secret encryption');
        return;
      }
      const dir = path.dirname(this.secretsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const encrypted = safeStorage.encryptString(JSON.stringify(secrets));
      fs.writeFileSync(this.secretsPath, encrypted);
      this.debugLogFn('Secrets saved (encrypted)');
    } catch (error) {
      this.debugLogFn(`Failed to save secrets: ${error}`);
    }
  }

  /**
   * One-time migration: move cleartext API keys from config.json to encrypted storage.
   */
  private migrateCleartextSecrets(config: Partial<AppConfig>): void {
    if (!safeStorage.isEncryptionAvailable()) return;

    let needsRewrite = false;
    try {
      if (!fs.existsSync(this.configPath)) return;
      const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));

      const secrets: Partial<AppConfig> = {};
      for (const key of SENSITIVE_KEYS) {
        if (raw[key] && typeof raw[key] === 'string' && raw[key].length > 0) {
          (secrets as any)[key] = raw[key];
          delete raw[key];
          needsRewrite = true;
        }
      }

      if (needsRewrite) {
        // Save secrets to encrypted file
        const existingSecrets = this.loadSecrets();
        this.saveSecrets({ ...existingSecrets, ...secrets });

        // Rewrite config.json without sensitive keys
        const dir = path.dirname(this.configPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.configPath, JSON.stringify(raw, null, 2), 'utf-8');
        this.debugLogFn('Migrated cleartext secrets to encrypted storage');
      }
    } catch (error) {
      this.debugLogFn(`Failed to migrate secrets: ${error}`);
    }
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

      // Separate sensitive keys from plain config
      const plainConfig = { ...this.config };
      const secrets: Partial<AppConfig> = {};

      if (safeStorage.isEncryptionAvailable()) {
        for (const key of SENSITIVE_KEYS) {
          if (plainConfig[key] !== undefined) {
            (secrets as any)[key] = plainConfig[key];
            delete (plainConfig as any)[key];
          }
        }
        // Save secrets encrypted
        const existingSecrets = this.loadSecrets();
        this.saveSecrets({ ...existingSecrets, ...secrets });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(plainConfig, null, 2), 'utf-8');
      this.debugLogFn(`Config saved to ${this.configPath}`);
    } catch (error) {
      this.debugLogFn(`Failed to save config: ${error}`);
    }

    return this.config;
  }
}
