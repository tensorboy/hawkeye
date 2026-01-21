/**
 * MemOS 记忆管理器
 * MemOS Memory Manager
 *
 * 统一管理所有类型的记忆：情节、语义、程序性和工作记忆
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import {
  MemOSConfig,
  MemoryType,
  MemoryQuery,
  MemoryQueryResult,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  WorkingMemory,
  EventType,
  WindowInfo,
  RecordedAction,
  DEFAULT_MEMOS_CONFIG,
} from './types';
import {
  EpisodicMemoryManager,
  createEpisodicMemory,
} from './episodic-memory';
import {
  SemanticMemoryManager,
  createSemanticMemory,
} from './semantic-memory';
import {
  ProceduralMemoryManager,
  createProceduralMemory,
} from './procedural-memory';
import {
  WorkingMemoryManager,
  createWorkingMemory,
} from './working-memory';

/**
 * MemOS 事件
 */
export interface MemOSEvents {
  'memory:added': (type: MemoryType, id: string) => void;
  'memory:updated': (type: MemoryType, id: string) => void;
  'memory:removed': (type: MemoryType, id: string) => void;
  'pattern:detected': (pattern: ProceduralMemory) => void;
  'pattern:triggered': (pattern: ProceduralMemory) => void;
  'maintenance:started': () => void;
  'maintenance:completed': (stats: MaintenanceStats) => void;
  'backup:created': (path: string) => void;
  'error': (error: Error) => void;
}

/**
 * 维护统计
 */
export interface MaintenanceStats {
  episodicCleaned: number;
  semanticInferred: number;
  proceduralConsolidated: number;
  timestamp: number;
}

/**
 * 统一记忆查询结果
 */
export interface UnifiedMemoryResult {
  episodic: EpisodicMemory[];
  semantic: SemanticMemory[];
  procedural: ProceduralMemory[];
  working: WorkingMemory | null;
}

/**
 * MemOS 记忆管理器
 */
export class MemOSManager extends EventEmitter {
  private config: MemOSConfig;
  private episodic: EpisodicMemoryManager;
  private semantic: SemanticMemoryManager;
  private procedural: ProceduralMemoryManager;
  private working: WorkingMemoryManager;

  private maintenanceTimer: NodeJS.Timeout | null = null;
  private backupTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor(config?: Partial<MemOSConfig>) {
    super();

    this.config = this.mergeConfig(DEFAULT_MEMOS_CONFIG, config);

    // 创建子管理器
    this.episodic = createEpisodicMemory(this.config.memory.episodic);
    this.semantic = createSemanticMemory(this.config.memory.semantic);
    this.procedural = createProceduralMemory(this.config.memory.procedural);
    this.working = createWorkingMemory(this.config.memory.working);

    // 绑定事件
    this.bindEvents();
  }

  /**
   * 合并配置
   */
  private mergeConfig(
    defaults: MemOSConfig,
    overrides?: Partial<MemOSConfig>
  ): MemOSConfig {
    if (!overrides) return defaults;

    return {
      ...defaults,
      ...overrides,
      memory: {
        episodic: { ...defaults.memory.episodic, ...overrides.memory?.episodic },
        semantic: { ...defaults.memory.semantic, ...overrides.memory?.semantic },
        procedural: { ...defaults.memory.procedural, ...overrides.memory?.procedural },
        working: { ...defaults.memory.working, ...overrides.memory?.working },
      },
      retrieval: { ...defaults.retrieval, ...overrides.retrieval },
      maintenance: { ...defaults.maintenance, ...overrides.maintenance },
    };
  }

  /**
   * 绑定子管理器事件
   */
  private bindEvents(): void {
    // 情节记忆事件
    this.episodic.on('memory:added', (memory) => {
      this.emit('memory:added', 'episodic', memory.id);

      // 同时记录到程序性记忆
      if (memory.event.data.action) {
        this.procedural.recordAction({
          type: memory.event.type,
          target: memory.context.activeWindow?.appName ?? '',
          parameters: memory.event.data as Record<string, unknown>,
          timestamp: memory.timestamp,
          duration: 0,
        });
      }
    });

    this.episodic.on('memory:removed', (id) => {
      this.emit('memory:removed', 'episodic', id);
    });

    // 语义记忆事件
    this.semantic.on('node:added', (node) => {
      this.emit('memory:added', 'semantic', node.id);
    });

    this.semantic.on('node:removed', (id) => {
      this.emit('memory:removed', 'semantic', id);
    });

    // 程序性记忆事件
    this.procedural.on('pattern:detected', (pattern) => {
      this.emit('pattern:detected', pattern);
    });

    this.procedural.on('pattern:triggered', (pattern) => {
      this.emit('pattern:triggered', pattern);
    });
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // 确保存储目录存在
    const storagePath = this.resolveStoragePath();
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    // 加载持久化数据
    await this.loadFromDisk();

    // 启动工作记忆会话
    this.working.startSession();

    // 启动维护任务
    if (this.config.maintenance.autoCleanup) {
      this.startMaintenanceTimer();
    }

    // 启动备份任务
    if (this.config.maintenance.backupEnabled) {
      this.startBackupTimer();
    }

    this.isInitialized = true;
  }

  /**
   * 解析存储路径
   */
  private resolveStoragePath(): string {
    let storagePath = this.config.storagePath;

    // 替换 ~ 为用户目录
    if (storagePath.startsWith('~')) {
      storagePath = path.join(os.homedir(), storagePath.slice(1));
    }

    return storagePath;
  }

  // ============================================================================
  // 统一记忆操作 (Unified Memory Operations)
  // ============================================================================

  /**
   * 记录事件（自动分发到相关记忆类型）
   */
  recordEvent(params: {
    type: EventType;
    source: EpisodicMemory['event']['source'];
    data: Record<string, unknown>;
    context: {
      activeWindow: WindowInfo;
      recentClipboard?: string;
      openFiles?: string[];
      runningApps?: string[];
    };
    importance?: number;
    tags?: string[];
  }): void {
    // 记录到情节记忆
    const episodicMemory = this.episodic.recordEvent(params);

    // 更新工作记忆上下文
    this.working.setFocusedWindow(params.context.activeWindow);
    this.working.recordAction({
      type: params.type,
      target: params.context.activeWindow.appName,
      timestamp: Date.now(),
      result: 'success',
    });

    // 如果是重要事件，提取知识到语义记忆
    if ((params.importance ?? 0.5) >= 0.7) {
      this.extractKnowledge(episodicMemory);
    }
  }

  /**
   * 从情节记忆中提取知识
   */
  private extractKnowledge(memory: EpisodicMemory): void {
    // 提取应用使用知识
    const appName = memory.context.activeWindow.appName;
    if (appName) {
      this.semantic.addNode({
        type: 'entity',
        name: appName,
        description: `Application: ${appName}`,
        properties: {
          type: 'application',
          lastUsed: memory.timestamp,
        },
        source: 'inferred',
        confidence: 0.8,
      });
    }

    // 提取文件相关知识
    if (memory.context.openFiles.length > 0) {
      for (const file of memory.context.openFiles) {
        const fileName = path.basename(file);
        const fileNode = this.semantic.addNode({
          type: 'entity',
          name: fileName,
          description: `File: ${file}`,
          properties: {
            type: 'file',
            path: file,
            lastAccessed: memory.timestamp,
          },
          source: 'inferred',
          confidence: 0.9,
        });

        // 关联到应用
        const appNode = this.semantic.getByName(appName);
        if (appNode && fileNode) {
          this.semantic.addRelation(
            fileNode.id,
            appNode.id,
            'used_for' as any,
            0.7
          );
        }
      }
    }
  }

  /**
   * 统一查询
   */
  query(query: MemoryQuery): UnifiedMemoryResult {
    const result: UnifiedMemoryResult = {
      episodic: [],
      semantic: [],
      procedural: [],
      working: null,
    };

    const types = query.type ?? ['episodic', 'semantic', 'procedural', 'working'];

    if (types.includes('episodic')) {
      result.episodic = this.episodic.query(query).items;
    }

    if (types.includes('semantic') && query.keywords) {
      result.semantic = this.semantic.semanticSearch({
        text: query.keywords.join(' '),
        limit: query.limit,
      }).items;
    }

    if (types.includes('procedural') && query.keywords) {
      result.procedural = this.procedural.searchPatterns(query.keywords.join(' '));
    }

    if (types.includes('working')) {
      result.working = this.working.getSession();
    }

    return result;
  }

  /**
   * 语义搜索
   */
  semanticSearch(text: string, limit?: number): SemanticMemory[] {
    return this.semantic.semanticSearch({ text, limit }).items;
  }

  /**
   * 获取相关记忆
   */
  getRelatedMemories(context: {
    app?: string;
    file?: string;
    keywords?: string[];
    timeRange?: { start: number; end: number };
  }): UnifiedMemoryResult {
    const query: MemoryQuery = {
      keywords: context.keywords,
      timeRange: context.timeRange,
      limit: 50,
    };

    return this.query(query);
  }

  // ============================================================================
  // 子管理器访问 (Sub-manager Access)
  // ============================================================================

  /**
   * 获取情节记忆管理器
   */
  getEpisodicMemory(): EpisodicMemoryManager {
    return this.episodic;
  }

  /**
   * 获取语义记忆管理器
   */
  getSemanticMemory(): SemanticMemoryManager {
    return this.semantic;
  }

  /**
   * 获取程序性记忆管理器
   */
  getProceduralMemory(): ProceduralMemoryManager {
    return this.procedural;
  }

  /**
   * 获取工作记忆管理器
   */
  getWorkingMemory(): WorkingMemoryManager {
    return this.working;
  }

  // ============================================================================
  // 维护操作 (Maintenance Operations)
  // ============================================================================

  /**
   * 执行维护
   */
  async runMaintenance(): Promise<MaintenanceStats> {
    this.emit('maintenance:started');

    const stats: MaintenanceStats = {
      episodicCleaned: 0,
      semanticInferred: 0,
      proceduralConsolidated: 0,
      timestamp: Date.now(),
    };

    // 清理情节记忆
    stats.episodicCleaned = this.episodic.cleanup();

    // 语义记忆推理
    if (this.config.memory.semantic.autoInference) {
      stats.semanticInferred = this.semantic.inferRelations();
    }

    // 程序性记忆整合
    const consolidationResult = this.episodic.consolidate();
    stats.proceduralConsolidated = consolidationResult.consolidated;

    this.emit('maintenance:completed', stats);
    return stats;
  }

  /**
   * 启动维护定时器
   */
  private startMaintenanceTimer(): void {
    const intervalMs = this.config.maintenance.cleanupIntervalHours * 60 * 60 * 1000;

    this.maintenanceTimer = setInterval(() => {
      this.runMaintenance().catch(err => {
        this.emit('error', err);
      });
    }, intervalMs);
  }

  /**
   * 启动备份定时器
   */
  private startBackupTimer(): void {
    const intervalMs = this.config.maintenance.backupIntervalDays * 24 * 60 * 60 * 1000;

    this.backupTimer = setInterval(() => {
      this.createBackup().catch(err => {
        this.emit('error', err);
      });
    }, intervalMs);
  }

  // ============================================================================
  // 持久化操作 (Persistence Operations)
  // ============================================================================

  /**
   * 保存到磁盘
   */
  async saveToDisk(): Promise<void> {
    const storagePath = this.resolveStoragePath();

    // 确保目录存在
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    // 保存各类型记忆
    const data = {
      episodic: this.episodic.exportAll(),
      semantic: this.semantic.exportAll(),
      procedural: this.procedural.exportAll(),
      savedAt: Date.now(),
    };

    const filePath = path.join(storagePath, 'memory.json');

    // 如果启用加密，这里应该加密数据
    // 目前简单地写入 JSON
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * 从磁盘加载
   */
  async loadFromDisk(): Promise<void> {
    const storagePath = this.resolveStoragePath();
    const filePath = path.join(storagePath, 'memory.json');

    if (!fs.existsSync(filePath)) {
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      if (data.episodic) {
        this.episodic.importAll(data.episodic);
      }
      if (data.semantic) {
        this.semantic.importAll(data.semantic);
      }
      if (data.procedural) {
        this.procedural.importAll(data.procedural);
      }
    } catch (error) {
      this.emit('error', error as Error);
    }
  }

  /**
   * 创建备份
   */
  async createBackup(): Promise<string> {
    const storagePath = this.resolveStoragePath();
    const backupDir = path.join(storagePath, 'backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}.json`);

    // 导出所有数据
    const data = {
      episodic: this.episodic.exportAll(),
      semantic: this.semantic.exportAll(),
      procedural: this.procedural.exportAll(),
      working: this.working.export(),
      backupAt: Date.now(),
    };

    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));

    // 清理旧备份
    this.cleanupOldBackups(backupDir);

    this.emit('backup:created', backupPath);
    return backupPath;
  }

  /**
   * 清理旧备份
   */
  private cleanupOldBackups(backupDir: string): void {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(backupDir, f),
        stat: fs.statSync(path.join(backupDir, f)),
      }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    // 保留最大备份数
    const toDelete = files.slice(this.config.maintenance.maxBackups);
    for (const file of toDelete) {
      fs.unlinkSync(file.path);
    }
  }

  /**
   * 恢复备份
   */
  async restoreBackup(backupPath: string): Promise<void> {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupPath}`);
    }

    const data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

    // 清空现有数据
    this.episodic.clear();
    this.semantic.clear();
    this.procedural.clear();

    // 导入备份数据
    if (data.episodic) {
      this.episodic.importAll(data.episodic);
    }
    if (data.semantic) {
      this.semantic.importAll(data.semantic);
    }
    if (data.procedural) {
      this.procedural.importAll(data.procedural);
    }
    if (data.working) {
      this.working.import(data.working);
    }
  }

  // ============================================================================
  // 统计和状态 (Statistics and Status)
  // ============================================================================

  /**
   * 获取统计信息
   */
  getStatistics(): {
    episodic: ReturnType<EpisodicMemoryManager['getStatistics']>;
    semantic: ReturnType<SemanticMemoryManager['getStatistics']>;
    procedural: ReturnType<ProceduralMemoryManager['getStatistics']>;
    working: ReturnType<WorkingMemoryManager['getStatistics']>;
    total: {
      memories: number;
      patterns: number;
      knowledgeNodes: number;
    };
  } {
    const episodicStats = this.episodic.getStatistics();
    const semanticStats = this.semantic.getStatistics();
    const proceduralStats = this.procedural.getStatistics();
    const workingStats = this.working.getStatistics();

    return {
      episodic: episodicStats,
      semantic: semanticStats,
      procedural: proceduralStats,
      working: workingStats,
      total: {
        memories: episodicStats.totalMemories,
        patterns: proceduralStats.totalPatterns,
        knowledgeNodes: semanticStats.totalNodes,
      },
    };
  }

  /**
   * 获取配置
   */
  getConfig(): MemOSConfig {
    return { ...this.config };
  }

  /**
   * 销毁
   */
  async destroy(): Promise<void> {
    // 保存数据
    await this.saveToDisk();

    // 停止定时器
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }

    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }

    // 销毁子管理器
    this.episodic.destroy();
    this.working.destroy();

    this.isInitialized = false;
  }
}

// 单例实例
let memosInstance: MemOSManager | null = null;

/**
 * 获取 MemOS 单例
 */
export function getMemOS(): MemOSManager {
  if (!memosInstance) {
    memosInstance = new MemOSManager();
  }
  return memosInstance;
}

/**
 * 创建 MemOS 实例
 */
export function createMemOS(config?: Partial<MemOSConfig>): MemOSManager {
  return new MemOSManager(config);
}

/**
 * 设置 MemOS 单例
 */
export function setMemOS(manager: MemOSManager): void {
  memosInstance = manager;
}
