/**
 * Chrome DevTools MCP Types
 * 基于 Model Context Protocol 的浏览器自动化类型定义
 */

// ============ MCP 连接配置 ============

/**
 * MCP 连接配置
 */
export interface MCPConfig {
  /** Chrome DevTools 调试端口 */
  debugPort?: number;
  /** Chrome 可执行文件路径 */
  chromePath?: string;
  /** 是否无头模式 */
  headless?: boolean;
  /** 默认超时时间 (ms) */
  timeout?: number;
  /** 视口大小 */
  viewport?: {
    width: number;
    height: number;
  };
}

/**
 * MCP 连接状态
 */
export type MCPConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

// ============ 浏览器操作类型 ============

/**
 * 浏览器导航参数
 */
export interface BrowserNavigateParams {
  /** 目标 URL */
  url: string;
  /** 等待条件 */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

/**
 * 元素点击参数
 */
export interface BrowserClickParams {
  /** 元素选择器或人类可读描述 */
  element: string;
  /** 精确的元素引用 (来自 snapshot) */
  ref?: string;
  /** 点击按钮 */
  button?: 'left' | 'right' | 'middle';
  /** 是否双击 */
  doubleClick?: boolean;
  /** 修饰键 */
  modifiers?: ('Alt' | 'Control' | 'Meta' | 'Shift')[];
}

/**
 * 文本输入参数
 */
export interface BrowserTypeParams {
  /** 元素描述 */
  element: string;
  /** 精确的元素引用 */
  ref?: string;
  /** 输入文本 */
  text: string;
  /** 是否逐字符输入 */
  slowly?: boolean;
  /** 输入后是否提交 (按 Enter) */
  submit?: boolean;
}

/**
 * 表单字段
 */
export interface FormField {
  /** 字段名称 */
  name: string;
  /** 字段类型 */
  type: 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider';
  /** 元素引用 */
  ref: string;
  /** 值 */
  value: string;
}

/**
 * 表单填写参数
 */
export interface BrowserFillFormParams {
  /** 表单字段列表 */
  fields: FormField[];
}

/**
 * 截图参数
 */
export interface BrowserScreenshotParams {
  /** 保存文件名 */
  filename?: string;
  /** 元素描述 (用于元素截图) */
  element?: string;
  /** 元素引用 */
  ref?: string;
  /** 是否全页截图 */
  fullPage?: boolean;
  /** 图片格式 */
  type?: 'png' | 'jpeg';
}

/**
 * 页面快照参数
 */
export interface BrowserSnapshotParams {
  /** 保存到文件 */
  filename?: string;
}

/**
 * 元素悬停参数
 */
export interface BrowserHoverParams {
  /** 元素描述 */
  element: string;
  /** 元素引用 */
  ref: string;
}

/**
 * 下拉选择参数
 */
export interface BrowserSelectParams {
  /** 元素描述 */
  element: string;
  /** 元素引用 */
  ref: string;
  /** 选中的值 */
  values: string[];
}

/**
 * 按键参数
 */
export interface BrowserPressKeyParams {
  /** 按键名称 */
  key: string;
}

/**
 * 等待参数
 */
export interface BrowserWaitParams {
  /** 等待出现的文本 */
  text?: string;
  /** 等待消失的文本 */
  textGone?: string;
  /** 等待时间 (秒) */
  time?: number;
}

/**
 * 拖拽参数
 */
export interface BrowserDragParams {
  /** 起始元素描述 */
  startElement: string;
  /** 起始元素引用 */
  startRef: string;
  /** 目标元素描述 */
  endElement: string;
  /** 目标元素引用 */
  endRef: string;
}

/**
 * JavaScript 执行参数
 */
export interface BrowserEvaluateParams {
  /** 要执行的函数 */
  function: string;
  /** 元素描述 (可选) */
  element?: string;
  /** 元素引用 (可选) */
  ref?: string;
}

/**
 * 标签页操作参数
 */
export interface BrowserTabsParams {
  /** 操作类型 */
  action: 'list' | 'new' | 'close' | 'select';
  /** 标签页索引 */
  index?: number;
}

/**
 * 文件上传参数
 */
export interface BrowserFileUploadParams {
  /** 文件路径列表 */
  paths?: string[];
}

/**
 * 对话框处理参数
 */
export interface BrowserDialogParams {
  /** 是否接受 */
  accept: boolean;
  /** prompt 对话框的文本 */
  promptText?: string;
}

// ============ 操作结果类型 ============

/**
 * MCP 操作结果
 */
export interface MCPResult<T = unknown> {
  /** 是否成功 */
  success: boolean;
  /** 结果数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
  /** 执行耗时 (ms) */
  duration: number;
}

/**
 * 页面快照结果
 */
export interface SnapshotResult {
  /** 页面标题 */
  title: string;
  /** 页面 URL */
  url: string;
  /** 可访问性树 (Markdown 格式) */
  accessibilityTree: string;
  /** 元素引用映射 */
  elementRefs: Map<string, string>;
}

/**
 * 截图结果
 */
export interface ScreenshotResult {
  /** 图片数据 (Base64) */
  imageData: string;
  /** 保存的文件路径 */
  filePath?: string;
}

/**
 * 控制台消息
 */
export interface ConsoleMessage {
  /** 消息级别 */
  level: 'error' | 'warning' | 'info' | 'debug';
  /** 消息内容 */
  text: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 网络请求
 */
export interface NetworkRequest {
  /** 请求 URL */
  url: string;
  /** 请求方法 */
  method: string;
  /** 状态码 */
  status?: number;
  /** 请求类型 */
  resourceType: string;
  /** 请求时间 */
  timestamp: number;
}

/**
 * 标签页信息
 */
export interface TabInfo {
  /** 标签页索引 */
  index: number;
  /** 标题 */
  title: string;
  /** URL */
  url: string;
  /** 是否活动 */
  active: boolean;
}

// ============ 浏览器动作统一类型 ============

/**
 * 浏览器动作类型
 */
export type BrowserActionType =
  | 'navigate'           // 导航到 URL
  | 'click'              // 点击元素
  | 'type'               // 输入文本
  | 'fill_form'          // 填写表单
  | 'screenshot'         // 截图
  | 'snapshot'           // 获取页面快照
  | 'hover'              // 悬停
  | 'select'             // 下拉选择
  | 'press_key'          // 按键
  | 'wait'               // 等待
  | 'drag'               // 拖拽
  | 'evaluate'           // 执行 JS
  | 'tabs'               // 标签页操作
  | 'file_upload'        // 文件上传
  | 'dialog'             // 对话框处理
  | 'navigate_back'      // 返回
  | 'close'              // 关闭页面
  | 'resize'             // 调整窗口大小
  | 'console_messages'   // 获取控制台消息
  | 'network_requests';  // 获取网络请求

/**
 * 浏览器动作参数映射
 */
export interface BrowserActionParamsMap {
  navigate: BrowserNavigateParams;
  click: BrowserClickParams;
  type: BrowserTypeParams;
  fill_form: BrowserFillFormParams;
  screenshot: BrowserScreenshotParams;
  snapshot: BrowserSnapshotParams;
  hover: BrowserHoverParams;
  select: BrowserSelectParams;
  press_key: BrowserPressKeyParams;
  wait: BrowserWaitParams;
  drag: BrowserDragParams;
  evaluate: BrowserEvaluateParams;
  tabs: BrowserTabsParams;
  file_upload: BrowserFileUploadParams;
  dialog: BrowserDialogParams;
  navigate_back: Record<string, never>;
  close: Record<string, never>;
  resize: { width: number; height: number };
  console_messages: { level?: 'error' | 'warning' | 'info' | 'debug' };
  network_requests: { includeStatic?: boolean };
}

/**
 * 浏览器动作
 */
export interface BrowserAction<T extends BrowserActionType = BrowserActionType> {
  /** 动作类型 */
  type: T;
  /** 动作参数 */
  params: BrowserActionParamsMap[T];
  /** 动作描述 */
  description?: string;
}

// ============ 执行计划相关 ============

/**
 * 浏览器执行步骤
 */
export interface BrowserExecutionStep {
  /** 步骤 ID */
  id: string;
  /** 步骤序号 */
  order: number;
  /** 浏览器动作 */
  action: BrowserAction;
  /** 前置条件 */
  precondition?: string;
  /** 后置验证 */
  postcondition?: string;
  /** 失败时的行为 */
  onFailure?: 'stop' | 'continue' | 'retry';
  /** 重试次数 */
  retryCount?: number;
}

/**
 * 浏览器执行计划
 */
export interface BrowserExecutionPlan {
  /** 计划 ID */
  id: string;
  /** 计划名称 */
  name: string;
  /** 计划描述 */
  description: string;
  /** 执行步骤 */
  steps: BrowserExecutionStep[];
  /** 起始 URL */
  startUrl?: string;
  /** 计划创建时间 */
  createdAt: number;
}

/**
 * 步骤执行结果
 */
export interface StepExecutionResult {
  /** 步骤 ID */
  stepId: string;
  /** 是否成功 */
  success: boolean;
  /** 结果数据 */
  result?: MCPResult;
  /** 执行耗时 */
  duration: number;
  /** 重试次数 */
  retries: number;
}

/**
 * 计划执行状态
 */
export interface BrowserPlanExecutionStatus {
  /** 计划 ID */
  planId: string;
  /** 执行状态 */
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  /** 当前步骤索引 */
  currentStepIndex: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 各步骤执行结果 */
  stepResults: StepExecutionResult[];
  /** 开始时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
  /** 错误信息 */
  error?: string;
}
