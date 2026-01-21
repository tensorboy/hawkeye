/**
 * A2UI (Agent-to-User Interface) Protocol
 * 定义 AI 代理与用户之间的零输入交互协议
 *
 * 核心理念：用户通过点击卡片和按钮进行交互，无需输入文字
 */

// ============ 基础类型 ============

/**
 * A2UI 卡片类型
 */
export type A2UICardType =
  | 'suggestion'      // 建议卡片 - 可执行的建议
  | 'preview'         // 预览卡片 - 计划/文件预览
  | 'result'          // 结果卡片 - 执行结果
  | 'confirmation'    // 确认卡片 - 危险操作确认
  | 'progress'        // 进度卡片 - 执行进度
  | 'info'            // 信息卡片 - 状态/提示信息
  | 'error'           // 错误卡片 - 错误信息
  | 'choice';         // 选择卡片 - 多选项选择

/**
 * A2UI 操作类型
 */
export type A2UIActionType =
  | 'primary'         // 主要操作（推荐）
  | 'secondary'       // 次要操作
  | 'danger'          // 危险操作
  | 'dismiss';        // 关闭/忽略

/**
 * A2UI 图标类型
 */
export type A2UIIcon =
  | 'file'
  | 'folder'
  | 'terminal'
  | 'browser'
  | 'clipboard'
  | 'magic'
  | 'warning'
  | 'error'
  | 'success'
  | 'info'
  | 'question'
  | 'lightning'
  | 'clock'
  | 'trash'
  | 'move'
  | 'copy'
  | 'edit'
  | 'eye'
  | 'settings'
  | 'refresh'
  | 'download'
  | 'upload'
  | 'search'
  | 'filter'
  | 'sort'
  | 'check'
  | 'x'
  | 'arrow-right'
  | 'arrow-left'
  | 'chevron-down'
  | 'chevron-up'
  | 'external-link';

// ============ 卡片操作 ============

/**
 * 卡片操作按钮
 */
export interface A2UIAction {
  /** 操作 ID */
  id: string;

  /** 按钮显示文本 */
  label: string;

  /** 操作类型 */
  type: A2UIActionType;

  /** 图标 (可选) */
  icon?: A2UIIcon;

  /** 是否禁用 */
  disabled?: boolean;

  /** 是否加载中 */
  loading?: boolean;

  /** 键盘快捷键 (可选) */
  shortcut?: string;

  /** 提示文本 */
  tooltip?: string;
}

// ============ 卡片定义 ============

/**
 * A2UI 卡片基础接口
 */
export interface A2UICardBase {
  /** 卡片 ID */
  id: string;

  /** 卡片类型 */
  type: A2UICardType;

  /** 卡片标题 */
  title: string;

  /** 卡片描述 (可选) */
  description?: string;

  /** 卡片图标 */
  icon?: A2UIIcon;

  /** 操作按钮列表 */
  actions: A2UIAction[];

  /** 置信度 (0-1, 用于排序) */
  confidence?: number;

  /** 创建时间 */
  timestamp: number;

  /** 过期时间 (可选) */
  expiresAt?: number;

  /** 自定义元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 建议卡片 - 展示可执行的建议
 */
export interface A2UISuggestionCard extends A2UICardBase {
  type: 'suggestion';

  /** 建议类型 */
  suggestionType: 'file_organize' | 'error_fix' | 'automation' | 'shortcut' | 'custom';

  /** 预估影响 */
  impact?: {
    filesAffected?: number;
    riskLevel: 'low' | 'medium' | 'high';
    reversible: boolean;
    estimatedDuration?: number;
  };

  /** 关联的意图 ID */
  intentId?: string;
}

/**
 * 预览卡片 - 展示计划或文件预览
 */
export interface A2UIPreviewCard extends A2UICardBase {
  type: 'preview';

  /** 预览类型 */
  previewType: 'plan' | 'file' | 'diff' | 'list';

  /** 预览内容 */
  content: {
    /** 步骤列表 (用于 plan 类型) */
    steps?: Array<{
      order: number;
      description: string;
      actionType: string;
      riskLevel: 'low' | 'medium' | 'high';
    }>;

    /** 文件内容 (用于 file 类型) */
    fileContent?: string;

    /** Diff 内容 (用于 diff 类型) */
    diff?: {
      before: string;
      after: string;
    };

    /** 列表项 (用于 list 类型) */
    items?: Array<{
      icon?: A2UIIcon;
      text: string;
      subtext?: string;
    }>;
  };

  /** 优缺点 (用于 plan 类型) */
  analysis?: {
    pros: string[];
    cons: string[];
  };
}

/**
 * 结果卡片 - 展示执行结果
 */
export interface A2UIResultCard extends A2UICardBase {
  type: 'result';

  /** 结果状态 */
  status: 'success' | 'partial' | 'failed' | 'cancelled';

  /** 执行摘要 */
  summary: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    duration: number;
  };

  /** 影响详情 */
  impact?: {
    filesModified: string[];
    filesCreated: string[];
    filesDeleted: string[];
  };

  /** 错误信息 (如果失败) */
  error?: {
    message: string;
    code?: string;
    recoverable: boolean;
  };

  /** 回滚选项 */
  rollback?: {
    available: boolean;
    description?: string;
  };
}

/**
 * 确认卡片 - 请求用户确认
 */
export interface A2UIConfirmationCard extends A2UICardBase {
  type: 'confirmation';

  /** 确认类型 */
  confirmationType: 'delete' | 'overwrite' | 'system' | 'permission' | 'custom';

  /** 警告级别 */
  warningLevel: 'info' | 'warning' | 'danger';

  /** 详细说明 */
  details: string[];

  /** 需要额外确认 (例如输入文件名) */
  requiresInput?: {
    type: 'text' | 'checkbox';
    label: string;
    placeholder?: string;
    expectedValue?: string;
  };
}

/**
 * 进度卡片 - 展示执行进度
 */
export interface A2UIProgressCard extends A2UICardBase {
  type: 'progress';

  /** 当前步骤 */
  currentStep: number;

  /** 总步骤数 */
  totalSteps: number;

  /** 当前步骤描述 */
  stepDescription: string;

  /** 进度百分比 (0-100) */
  progress: number;

  /** 是否可暂停 */
  pausable: boolean;

  /** 是否可取消 */
  cancellable: boolean;

  /** 当前状态 */
  status: 'running' | 'paused' | 'completing';
}

/**
 * 信息卡片 - 展示状态或提示信息
 */
export interface A2UIInfoCard extends A2UICardBase {
  type: 'info';

  /** 信息类型 */
  infoType: 'status' | 'tip' | 'notification' | 'learning';

  /** 是否可关闭 */
  dismissible: boolean;

  /** 自动关闭时间 (ms, 可选) */
  autoHideAfter?: number;
}

/**
 * 错误卡片 - 展示错误信息
 */
export interface A2UIErrorCard extends A2UICardBase {
  type: 'error';

  /** 错误代码 */
  errorCode?: string;

  /** 错误详情 */
  errorDetails?: string;

  /** 是否可重试 */
  retryable: boolean;

  /** 帮助链接 */
  helpUrl?: string;
}

/**
 * 选择卡片 - 提供多个选项供选择
 */
export interface A2UIChoiceCard extends A2UICardBase {
  type: 'choice';

  /** 是否允许多选 */
  multiSelect: boolean;

  /** 选项列表 */
  options: Array<{
    id: string;
    label: string;
    description?: string;
    icon?: A2UIIcon;
    recommended?: boolean;
  }>;

  /** 默认选中的选项 */
  defaultSelected?: string[];
}

/**
 * A2UI 卡片联合类型
 */
export type A2UICard =
  | A2UISuggestionCard
  | A2UIPreviewCard
  | A2UIResultCard
  | A2UIConfirmationCard
  | A2UIProgressCard
  | A2UIInfoCard
  | A2UIErrorCard
  | A2UIChoiceCard;

// ============ 事件类型 ============

/**
 * 卡片操作事件
 */
export interface A2UIActionEvent {
  /** 卡片 ID */
  cardId: string;

  /** 操作 ID */
  actionId: string;

  /** 事件时间戳 */
  timestamp: number;

  /** 额外数据 (如选择的选项) */
  data?: Record<string, unknown>;
}

/**
 * 卡片显示事件
 */
export interface A2UIShowEvent {
  /** 卡片 ID */
  cardId: string;

  /** 事件时间戳 */
  timestamp: number;
}

/**
 * 卡片关闭事件
 */
export interface A2UIDismissEvent {
  /** 卡片 ID */
  cardId: string;

  /** 关闭原因 */
  reason: 'user' | 'timeout' | 'replaced' | 'completed';

  /** 事件时间戳 */
  timestamp: number;
}

// ============ 状态类型 ============

/**
 * A2UI 渲染器状态
 */
export interface A2UIState {
  /** 当前显示的卡片列表 */
  cards: A2UICard[];

  /** 最大同时显示的卡片数 */
  maxVisibleCards: number;

  /** 是否处于加载状态 */
  isLoading: boolean;

  /** 感知状态 */
  perceptionStatus: 'active' | 'paused' | 'idle';

  /** 上次更新时间 */
  lastUpdate: number;
}

// ============ 配置类型 ============

/**
 * A2UI 渲染器配置
 */
export interface A2UIConfig {
  /** 最大同时显示的卡片数 */
  maxVisibleCards: number;

  /** 卡片自动过期时间 (ms) */
  cardExpirationMs: number;

  /** 是否启用动画 */
  enableAnimations: boolean;

  /** 是否显示置信度 */
  showConfidence: boolean;

  /** 是否启用键盘快捷键 */
  enableShortcuts: boolean;

  /** 是否启用声音提示 */
  enableSounds: boolean;

  /** 主题 */
  theme: 'light' | 'dark' | 'system';
}

/**
 * 默认 A2UI 配置
 */
export const DEFAULT_A2UI_CONFIG: A2UIConfig = {
  maxVisibleCards: 5,
  cardExpirationMs: 5 * 60 * 1000, // 5 分钟
  enableAnimations: true,
  showConfidence: true,
  enableShortcuts: true,
  enableSounds: false,
  theme: 'system',
};

// ============ 工具函数类型 ============

/**
 * 创建建议卡片的参数
 */
export interface CreateSuggestionCardParams {
  title: string;
  description?: string;
  suggestionType: A2UISuggestionCard['suggestionType'];
  impact?: A2UISuggestionCard['impact'];
  confidence?: number;
  intentId?: string;
  primaryAction: { label: string; id?: string };
  secondaryAction?: { label: string; id?: string };
}

/**
 * 创建预览卡片的参数
 */
export interface CreatePreviewCardParams {
  title: string;
  description?: string;
  previewType: A2UIPreviewCard['previewType'];
  content: A2UIPreviewCard['content'];
  analysis?: A2UIPreviewCard['analysis'];
  primaryAction: { label: string; id?: string };
  rejectAction?: { label: string; id?: string };
}

/**
 * 创建结果卡片的参数
 */
export interface CreateResultCardParams {
  title: string;
  status: A2UIResultCard['status'];
  summary: A2UIResultCard['summary'];
  impact?: A2UIResultCard['impact'];
  error?: A2UIResultCard['error'];
  rollback?: A2UIResultCard['rollback'];
}

/**
 * 创建确认卡片的参数
 */
export interface CreateConfirmationCardParams {
  title: string;
  description: string;
  confirmationType: A2UIConfirmationCard['confirmationType'];
  warningLevel: A2UIConfirmationCard['warningLevel'];
  details: string[];
  requiresInput?: A2UIConfirmationCard['requiresInput'];
  confirmLabel?: string;
  cancelLabel?: string;
}
