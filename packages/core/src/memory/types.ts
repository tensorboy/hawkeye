/**
 * MemOS 记忆系统类型定义
 * MemOS Memory System Types
 *
 * Based on PRD Section 5: 本地存储架构 (MemOS 集成)
 */

// ============================================================================
// 通用类型 (Common Types)
// ============================================================================

/**
 * 记忆类型
 */
export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'working';

/**
 * 窗口信息
 */
export interface WindowInfo {
  appName: string;
  title: string;
  pid?: number;
  bundleId?: string;
  path?: string;
}

/**
 * 衰减信息
 */
export interface DecayInfo {
  lastAccessed: number;      // timestamp
  accessCount: number;
  retentionScore: number;    // 0-1, 低于阈值可清理
}

// ============================================================================
// 情节记忆 (Episodic Memory)
// ============================================================================

/**
 * 事件类型
 */
export enum EventType {
  SCREEN_CAPTURE = 'screen_capture',
  CLIPBOARD_COPY = 'clipboard_copy',
  FILE_CREATED = 'file_created',
  FILE_MODIFIED = 'file_modified',
  FILE_MOVED = 'file_moved',
  FILE_DELETED = 'file_deleted',
  WINDOW_SWITCH = 'window_switch',
  APP_LAUNCH = 'app_launch',
  APP_CLOSE = 'app_close',
  SUGGESTION_SHOWN = 'suggestion_shown',
  SUGGESTION_ACCEPTED = 'suggestion_accepted',
  SUGGESTION_REJECTED = 'suggestion_rejected',
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  ERROR_DETECTED = 'error_detected',
  USER_INPUT = 'user_input',
  BROWSER_NAVIGATE = 'browser_navigate',
}

/**
 * 情节记忆
 */
export interface EpisodicMemory {
  id: string;
  timestamp: number;

  // 事件信息
  event: {
    type: EventType;
    source: 'screen' | 'clipboard' | 'file' | 'window' | 'keyboard' | 'browser';
    data: Record<string, unknown>;
  };

  // 上下文快照
  context: {
    activeWindow: WindowInfo;
    recentClipboard?: string;
    openFiles: string[];
    runningApps: string[];
  };

  // 元数据
  metadata: {
    importance: number;           // 重要性 0-1
    emotionalValence: number;     // 情感倾向 -1 到 1
    tags: string[];
  };

  // 关联
  associations: {
    relatedMemories: string[];    // 相关记忆 ID
    causalLinks: string[];        // 因果关联
  };

  // 衰减信息
  decay: DecayInfo;
}

// ============================================================================
// 语义记忆 (Semantic Memory)
// ============================================================================

/**
 * 关系类型
 */
export enum RelationType {
  IS_A = 'is_a',                  // 是一个
  PART_OF = 'part_of',            // 属于
  RELATED_TO = 'related_to',      // 相关
  CAUSES = 'causes',              // 导致
  DEPENDS_ON = 'depends_on',      // 依赖
  SIMILAR_TO = 'similar_to',      // 相似
  OPPOSITE_OF = 'opposite_of',    // 相反
  USED_FOR = 'used_for',          // 用于
  LOCATED_IN = 'located_in',      // 位于
  CREATED_BY = 'created_by',      // 由...创建
}

/**
 * 知识节点类型
 */
export type NodeType = 'concept' | 'entity' | 'relation' | 'fact';

/**
 * 知识来源
 */
export type ProvenanceSource = 'user_input' | 'inferred' | 'external';

/**
 * 语义记忆
 */
export interface SemanticMemory {
  id: string;
  createdAt: number;
  updatedAt: number;

  // 知识节点
  node: {
    type: NodeType;
    name: string;
    description: string;
    properties: Record<string, unknown>;
  };

  // 关系
  relations: Array<{
    type: RelationType;
    targetId: string;
    weight: number;               // 关系强度 0-1
    bidirectional: boolean;
  }>;

  // 来源
  provenance: {
    source: ProvenanceSource;
    confidence: number;
    evidence: string[];
  };

  // 向量嵌入 (用于语义搜索)
  embedding?: number[];
}

// ============================================================================
// 程序性记忆 (Procedural Memory)
// ============================================================================

/**
 * 触发条件类型
 */
export type TriggerType = 'time' | 'event' | 'context' | 'sequence';

/**
 * 触发条件
 */
export interface TriggerCondition {
  type: TriggerType;
  condition: Record<string, unknown>;
}

/**
 * 记录的动作
 */
export interface RecordedAction {
  type: string;
  target: string;
  parameters: Record<string, unknown>;
  timestamp: number;
  duration: number;
}

/**
 * 工作流配置
 */
export interface WorkflowConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  triggers: TriggerCondition[];
  actions: RecordedAction[];
  schedule?: {
    cron?: string;
    interval?: number;
  };
}

/**
 * 程序性记忆
 */
export interface ProceduralMemory {
  id: string;
  createdAt: number;
  updatedAt: number;

  // 模式定义
  pattern: {
    name: string;
    description: string;
    triggerConditions: TriggerCondition[];
    actionSequence: RecordedAction[];
  };

  // 统计信息
  statistics: {
    occurrenceCount: number;      // 出现次数
    successRate: number;          // 成功率
    averageDuration: number;      // 平均时长 (ms)
    lastOccurrence: number;       // timestamp
    firstOccurrence: number;      // timestamp
  };

  // 变体
  variants: Array<{
    actionSequence: RecordedAction[];
    frequency: number;
  }>;

  // 自动化状态
  automation: {
    isAutomated: boolean;
    automationConfig?: WorkflowConfig;
    lastAutoRun?: number;
  };
}

// ============================================================================
// 工作记忆 (Working Memory)
// ============================================================================

/**
 * 最近动作
 */
export interface RecentAction {
  id: string;
  type: string;
  target: string;
  timestamp: number;
  result?: 'success' | 'failure' | 'pending';
}

/**
 * 任务建议
 */
export interface TaskSuggestion {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  confidence: number;
  createdAt: number;
}

/**
 * 工作记忆
 */
export interface WorkingMemory {
  sessionId: string;
  startTime: number;

  // 当前上下文
  currentContext: {
    activeTask?: string;
    focusedWindow?: WindowInfo;
    recentActions: RecentAction[];
    pendingSuggestions: TaskSuggestion[];
  };

  // 注意力焦点
  attentionFocus: {
    primaryFocus?: string;        // 主要关注点
    secondaryFoci: string[];      // 次要关注点
    distractions: string[];       // 干扰项
  };

  // 临时状态
  temporaryState: {
    flags: Record<string, boolean>;
    counters: Record<string, number>;
    buffers: Record<string, unknown>;
  };

  // 容量信息
  capacity: {
    maxItems: number;             // 最大项目数
    currentItems: number;
    oldestItemAge: number;        // 最老项目年龄 (秒)
  };
}

// ============================================================================
// 配置类型 (Configuration Types)
// ============================================================================

/**
 * 情节记忆配置
 */
export interface EpisodicMemoryConfig {
  maxItems: number;               // 最大记录数
  retentionDays: number;          // 保留天数
  importanceThreshold: number;    // 重要性阈值 (低于此值会被清理)
  autoConsolidate: boolean;       // 自动整合相似记忆
  consolidationInterval: number;  // 整合间隔 (ms)
}

/**
 * 语义记忆配置
 */
export interface SemanticMemoryConfig {
  embeddingModel: string;         // 嵌入模型名称
  embeddingDimensions: number;    // 向量维度
  maxNodes: number;               // 最大节点数
  autoInference: boolean;         // 自动推理新关系
  inferenceThreshold: number;     // 推理置信度阈值
}

/**
 * 程序性记忆配置
 */
export interface ProceduralMemoryConfig {
  patternDetectionEnabled: boolean;
  minOccurrences: number;         // 最小出现次数才记录
  patternSimilarityThreshold: number;  // 模式相似度阈值
  maxPatterns: number;            // 最大模式数
}

/**
 * 工作记忆配置
 */
export interface WorkingMemoryConfig {
  maxItems: number;               // 最大项目数
  expirationMinutes: number;      // 过期时间 (分钟)
  maxRecentActions: number;       // 最大最近动作数
  maxSuggestions: number;         // 最大建议数
}

/**
 * 检索配置
 */
export interface RetrievalConfig {
  maxResults: number;             // 最大结果数
  similarityThreshold: number;    // 相似度阈值
  enableSemanticSearch: boolean;  // 启用语义搜索
  enableTemporalDecay: boolean;   // 启用时间衰减
  decayHalfLife: number;          // 衰减半衰期 (天)
}

/**
 * 维护配置
 */
export interface MaintenanceConfig {
  autoCleanup: boolean;           // 自动清理
  cleanupIntervalHours: number;   // 清理间隔 (小时)
  backupEnabled: boolean;         // 启用备份
  backupIntervalDays: number;     // 备份间隔 (天)
  maxBackups: number;             // 最大备份数
}

/**
 * MemOS 配置
 */
export interface MemOSConfig {
  // 基础配置
  storagePath: string;            // 存储路径
  encryptionEnabled: boolean;     // 是否加密
  encryptionKey?: string;         // 加密密钥

  // 记忆配置
  memory: {
    episodic: EpisodicMemoryConfig;
    semantic: SemanticMemoryConfig;
    procedural: ProceduralMemoryConfig;
    working: WorkingMemoryConfig;
  };

  // 检索配置
  retrieval: RetrievalConfig;

  // 维护配置
  maintenance: MaintenanceConfig;
}

// ============================================================================
// 查询类型 (Query Types)
// ============================================================================

/**
 * 记忆查询
 */
export interface MemoryQuery {
  type?: MemoryType[];            // 要查询的记忆类型
  keywords?: string[];            // 关键词
  timeRange?: {
    start: number;
    end: number;
  };
  importance?: {
    min?: number;
    max?: number;
  };
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'importance' | 'relevance';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 语义查询
 */
export interface SemanticQuery {
  text: string;                   // 查询文本
  embedding?: number[];           // 或直接提供向量
  limit?: number;
  threshold?: number;             // 相似度阈值
  nodeTypes?: NodeType[];         // 限制节点类型
}

/**
 * 查询结果
 */
export interface MemoryQueryResult<T> {
  items: T[];
  total: number;
  query: MemoryQuery | SemanticQuery;
  executionTime: number;          // 查询执行时间 (ms)
}

// ============================================================================
// 默认配置 (Default Configuration)
// ============================================================================

export const DEFAULT_EPISODIC_CONFIG: EpisodicMemoryConfig = {
  maxItems: 100000,
  retentionDays: 90,
  importanceThreshold: 0.1,
  autoConsolidate: true,
  consolidationInterval: 24 * 60 * 60 * 1000, // 24 hours
};

export const DEFAULT_SEMANTIC_CONFIG: SemanticMemoryConfig = {
  embeddingModel: 'local',
  embeddingDimensions: 384,
  maxNodes: 50000,
  autoInference: true,
  inferenceThreshold: 0.7,
};

export const DEFAULT_PROCEDURAL_CONFIG: ProceduralMemoryConfig = {
  patternDetectionEnabled: true,
  minOccurrences: 3,
  patternSimilarityThreshold: 0.8,
  maxPatterns: 1000,
};

export const DEFAULT_WORKING_CONFIG: WorkingMemoryConfig = {
  maxItems: 100,
  expirationMinutes: 30,
  maxRecentActions: 50,
  maxSuggestions: 10,
};

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  maxResults: 100,
  similarityThreshold: 0.7,
  enableSemanticSearch: true,
  enableTemporalDecay: true,
  decayHalfLife: 7,  // 7 days
};

export const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = {
  autoCleanup: true,
  cleanupIntervalHours: 24,
  backupEnabled: true,
  backupIntervalDays: 7,
  maxBackups: 4,
};

export const DEFAULT_MEMOS_CONFIG: MemOSConfig = {
  storagePath: '~/.hawkeye/memory',
  encryptionEnabled: false,
  memory: {
    episodic: DEFAULT_EPISODIC_CONFIG,
    semantic: DEFAULT_SEMANTIC_CONFIG,
    procedural: DEFAULT_PROCEDURAL_CONFIG,
    working: DEFAULT_WORKING_CONFIG,
  },
  retrieval: DEFAULT_RETRIEVAL_CONFIG,
  maintenance: DEFAULT_MAINTENANCE_CONFIG,
};
