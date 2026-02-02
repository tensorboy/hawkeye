import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import {
  Hawkeye,
  createHawkeye,
  type HawkeyeConfig,
  type HawkeyeStatus,
  type UserIntent,
  type ExecutionPlan,
  type HawkeyeDatabase,
  WebSearchTool,
} from '@hawkeye/core';
import { type AppConfig, LOCAL_ONLY_CONFIG } from './config-service';
import * as path from 'path';
import { app } from 'electron';

export class HawkeyeService extends EventEmitter {
  private hawkeye: Hawkeye | null = null;

  constructor(
    private mainWindowGetter: () => BrowserWindow | null,
    private debugLog: (msg: string) => void
  ) {
    super();
  }

  async initialize(config: AppConfig): Promise<void> {
    // 确定首选 provider
    const preferredProvider = config.localOnly ? 'llama-cpp' : config.aiProvider;

    const coreConfig: HawkeyeConfig = {
      ai: {
        providers: [],
        preferredProvider,
        enableFailover: !config.localOnly,
      },
      sync: {
        port: config.syncPort,
      },
      autoStartSync: config.autoStartSync,
    };

    if (config.localOnly) {
      // 本地模式: 使用 llama-cpp
      if (config.llamaCppModelPath) {
        coreConfig.ai.providers.push({
          type: 'llama-cpp',
          modelPath: config.llamaCppModelPath,
          contextSize: config.llamaCppContextSize || 4096,
          gpuLayers: config.llamaCppGpuLayers ?? -1,
          gpuAcceleration: config.llamaCppGpuAcceleration || 'auto',
        } as any);
      }
    } else {
      // 非本地模式: 根据配置选择 provider
      if (config.aiProvider === 'llama-cpp' && config.llamaCppModelPath) {
        coreConfig.ai.providers.push({
          type: 'llama-cpp',
          modelPath: config.llamaCppModelPath,
          contextSize: config.llamaCppContextSize || 4096,
          gpuLayers: config.llamaCppGpuLayers ?? -1,
          gpuAcceleration: config.llamaCppGpuAcceleration || 'auto',
        } as any);
      }
      if (config.aiProvider === 'gemini' && config.geminiApiKey) {
        coreConfig.ai.providers.push({
          type: 'gemini',
          apiKey: config.geminiApiKey,
          model: config.geminiModel || 'gemini-2.5-flash-preview-05-20',
          ...(config.geminiBaseUrl ? { baseUrl: config.geminiBaseUrl } : {}),
        } as any);
      }
      if (config.aiProvider === 'openai' && config.openaiBaseUrl && config.openaiApiKey) {
        coreConfig.ai.providers.push({
          type: 'openai',
          baseUrl: config.openaiBaseUrl,
          apiKey: config.openaiApiKey,
          model: config.openaiModel || 'gemini-3-flash-preview',
        } as any);
      }
      if (coreConfig.ai.providers.length === 0) {
        this.debugLog('No AI provider configured. Please configure one in Settings.');
      }
    }

    this.hawkeye = createHawkeye(coreConfig);

    // Register WebSearch Tool
    if (config.tavilyApiKey) {
        const registry = this.hawkeye.getToolRegistry();
        // Resolve script path for production (asar) vs dev
        const scriptPath = app.isPackaged
            ? path.join(process.resourcesPath, 'scripts', 'web-search', 'inference.py')
            : path.resolve(__dirname, '../../../../core/scripts/web-search/inference.py');

        // We override the execute method context to inject config
        const originalExecute = WebSearchTool.execute;
        WebSearchTool.execute = (input, context) => {
            return originalExecute(input, {
                ...(context as Record<string, unknown> || {}),
                config: {
                    tavilyApiKey: config.tavilyApiKey,
                    // We rely on 'python3' being in PATH or detected env
                    // In a full implementation, we'd inject the path from EnvCheckService
                    scriptPath: scriptPath
                }
            });
        };

        registry.registerTool(WebSearchTool);
        this.debugLog('WebSearch tool registered');
    }

    this.setupEvents();

    try {
      await this.hawkeye.initialize();
      this.safeSend('hawkeye-ready', this.getStatus());
    } catch (error) {
      this.debugLog(`Hawkeye init failed: ${error}`);
      this.safeSend('error', (error as Error).message);
    }
  }

  async shutdown() {
    if (this.hawkeye) {
      await this.hawkeye.shutdown();
      this.hawkeye = null;
    }
  }

  getInstance(): Hawkeye | null {
    return this.hawkeye;
  }

  getDatabase(): HawkeyeDatabase | null {
    return this.hawkeye?.getDatabase() || null;
  }

  getStatus(): HawkeyeStatus {
    return this.hawkeye?.getStatus() || {
      initialized: false,
      aiReady: false,
      aiProvider: null,
      syncRunning: false,
      syncPort: null,
      connectedClients: 0,
      behaviorTracking: false,
      memoryEnabled: false,
      dashboardEnabled: false,
      workflowEnabled: false,
      pluginsEnabled: false,
      loadedPlugins: 0,
      autonomousEnabled: false,
      activeSuggestions: 0,
    };
  }

  async perceiveAndRecognize(): Promise<UserIntent[]> {
    if (!this.hawkeye) throw new Error('Hawkeye not initialized');

    try {
      this.emit('analyzing');
      const intents = await this.hawkeye.perceiveAndRecognize();
      this.safeSend('intents', intents);
      this.emit('idle');
      return intents;
    } catch (error) {
      this.emit('error', (error as Error).message);
      throw error;
    }
  }

  async generatePlan(intentId: string): Promise<ExecutionPlan> {
    if (!this.hawkeye) throw new Error('Hawkeye not initialized');

    try {
      const intents = this.hawkeye.getCurrentIntents();
      const intent = intents.find(i => i.id === intentId);
      if (!intent) throw new Error('Intent not found');

      this.emit('executing', intent.description || 'Generating plan...');
      const plan = await this.hawkeye.generatePlan(intent);
      this.emit('idle');
      return plan;
    } catch (error) {
      this.emit('error', (error as Error).message);
      throw error;
    }
  }

  private setupEvents() {
    if (!this.hawkeye) return;

    this.hawkeye.on('module:ready', (m) => this.safeSend('module-ready', m));
    this.hawkeye.on('ai:provider:ready', (t) => this.safeSend('ai-provider-ready', t));
    this.hawkeye.on('ai:provider:error', (i) => this.safeSend('ai-provider-error', i));
    this.hawkeye.on('intents:detected', (i) => this.safeSend('intents', i));
    this.hawkeye.on('plan:generated', (p) => this.safeSend('plan', p));
    this.hawkeye.on('execution:step:start', (d) => this.safeSend('execution-progress', d));
    this.hawkeye.on('execution:completed', (e) => this.safeSend('execution-completed', e));
    this.hawkeye.on('error', (e) => this.safeSend('error', (e as Error).message));
  }

  private safeSend(channel: string, ...args: any[]) {
    const win = this.mainWindowGetter();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }
}
