/**
 * 眼力劲核心类型定义
 */

// ============ 感知相关类型 ============

/**
 * 屏幕截图结果
 */
export interface ScreenCapture {
  /** Base64 编码的图片数据 */
  imageData: string;
  /** 图片格式 */
  format: 'png' | 'jpeg';
  /** 截图时间戳 */
  timestamp: number;
  /** 屏幕/显示器索引 */
  displayIndex?: number;
}

/**
 * 窗口信息
 */
export interface WindowInfo {
  /** 窗口标题 */
  title: string;
  /** 应用名称 */
  appName: string;
  /** 应用包名/路径 */
  appPath?: string;
  /** 是否为活动窗口 */
  isActive: boolean;
  /** 窗口位置和大小 */
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * 感知上下文
 */
export interface PerceptionContext {
  /** 屏幕截图 */
  screenshot?: ScreenCapture;
  /** 当前窗口信息 */
  activeWindow?: WindowInfo;
  /** 剪贴板内容 */
  clipboard?: string;
  /** 额外的上下文信息 */
  metadata?: Record<string, unknown>;
}

// ============ 推理相关类型 ============

/**
 * 任务建议
 */
export interface TaskSuggestion {
  /** 唯一标识 */
  id: string;
  /** 建议标题 */
  title: string;
  /** 详细描述 */
  description: string;
  /** 任务类型 */
  type: TaskType;
  /** 置信度 (0-1) */
  confidence: number;
  /** 执行动作列表 */
  actions: TaskAction[];
  /** 创建时间 */
  createdAt: number;
}

/**
 * 任务类型
 */
export type TaskType =
  | 'shell'           // Shell 命令
  | 'file'            // 文件操作
  | 'browser'         // 浏览器操作
  | 'app'             // 应用操作
  | 'code'            // 代码修改
  | 'compound';       // 复合任务

/**
 * 任务动作
 */
export interface TaskAction {
  /** 动作类型 */
  type: ActionType;
  /** 动作参数 */
  params: Record<string, unknown>;
  /** 动作描述 */
  description: string;
}

/**
 * 动作类型
 */
export type ActionType =
  | 'run_shell'         // 执行 Shell 命令
  | 'read_file'         // 读取文件
  | 'write_file'        // 写入文件
  | 'edit_file'         // 编辑文件
  | 'open_url'          // 打开 URL
  | 'open_app'          // 打开应用
  | 'click'             // 鼠标点击
  | 'type_text'         // 键入文本
  // MCP 浏览器自动化动作
  | 'browser_navigate'  // 浏览器导航
  | 'browser_click'     // 浏览器元素点击
  | 'browser_type'      // 浏览器输入
  | 'browser_fill_form' // 浏览器填写表单
  | 'browser_screenshot'// 浏览器截图
  | 'browser_snapshot'  // 浏览器快照
  | 'browser_wait'      // 浏览器等待
  | 'browser_evaluate'  // 浏览器执行 JS
  | 'browser_scroll';   // 浏览器滚动

// ============ 执行相关类型 ============

/**
 * 执行结果
 */
export interface ExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 输出内容 */
  output?: string;
  /** 错误信息 */
  error?: string;
  /** 执行耗时 (ms) */
  duration: number;
}

/**
 * 任务状态
 */
export type TaskStatus =
  | 'pending'         // 待执行
  | 'running'         // 执行中
  | 'completed'       // 已完成
  | 'failed'          // 执行失败
  | 'cancelled';      // 已取消

/**
 * 任务执行记录
 */
export interface TaskExecution {
  /** 任务 ID */
  taskId: string;
  /** 建议 */
  suggestion: TaskSuggestion;
  /** 状态 */
  status: TaskStatus;
  /** 执行结果 */
  result?: ExecutionResult;
  /** 开始时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
}

// ============ 配置相关类型 ============

/**
 * 引擎配置
 */
export interface EngineConfig {
  /** Anthropic API Key */
  anthropicApiKey: string;
  /** 使用的模型 */
  model?: string;
  /** 感知配置 */
  perception?: {
    /** 截图间隔 (ms) */
    captureInterval?: number;
    /** 是否启用 OCR */
    enableOcr?: boolean;
  };
  /** 执行配置 */
  execution?: {
    /** 命令超时时间 (ms) */
    timeout?: number;
    /** 是否需要确认 */
    requireConfirmation?: boolean;
  };
}
