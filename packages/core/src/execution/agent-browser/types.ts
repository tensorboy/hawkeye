/**
 * Agent Browser Types
 * 定义 agent-browser CLI 的类型接口
 */

/**
 * Agent Browser 配置
 */
export interface AgentBrowserConfig {
  /** 会话名称 */
  session?: string;
  /** Profile 路径 (用于持久化认证状态) */
  profile?: string;
  /** 是否使用 headless 模式 */
  headless?: boolean;
  /** 命令超时时间 (ms) */
  timeout?: number;
  /** 浏览器可执行文件路径 */
  browserPath?: string;
}

/**
 * Agent Browser 执行结果
 */
export interface AgentBrowserResult<T = unknown> {
  success: boolean;
  data?: T;
  output?: string;
  error?: string;
  duration: number;
}

/**
 * Accessibility Tree 元素
 */
export interface AccessibilityElement {
  /** 元素引用 (如 @e1, @e2) */
  ref: string;
  /** 角色 (button, link, textbox 等) */
  role: string;
  /** 名称/标签 */
  name?: string;
  /** 当前值 */
  value?: string;
  /** 描述 */
  description?: string;
  /** 是否可聚焦 */
  focusable?: boolean;
  /** 是否已选中 */
  checked?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否展开 */
  expanded?: boolean;
  /** 是否必填 */
  required?: boolean;
  /** 子元素 */
  children?: AccessibilityElement[];
}

/**
 * 页面快照结果
 */
export interface SnapshotResult {
  /** 页面 URL */
  url: string;
  /** 页面标题 */
  title: string;
  /** 可交互元素列表 */
  elements: AccessibilityElement[];
  /** 原始 accessibility tree */
  raw?: string;
}

/**
 * 截图结果
 */
export interface ScreenshotResult {
  /** 截图文件路径 */
  path: string;
  /** Base64 编码的图片数据 */
  data?: string;
  /** 图片宽度 */
  width?: number;
  /** 图片高度 */
  height?: number;
}

/**
 * 控制台消息
 */
export interface ConsoleMessage {
  type: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
}

/**
 * 网络请求
 */
export interface NetworkRequest {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  resourceType: string;
  responseSize?: number;
  timing?: {
    startTime: number;
    endTime: number;
    duration: number;
  };
}

/**
 * 标签页信息
 */
export interface TabInfo {
  index: number;
  url: string;
  title: string;
  active: boolean;
}

/**
 * 查找选项
 */
export interface FindOptions {
  /** 按角色查找 */
  role?: string;
  /** 按文本内容查找 */
  text?: string;
  /** 按标签查找 */
  label?: string;
  /** 按占位符查找 */
  placeholder?: string;
  /** 按 name 属性查找 */
  name?: string;
  /** 是否精确匹配 */
  exact?: boolean;
}

/**
 * 等待选项
 */
export interface WaitOptions {
  /** 等待文本出现 */
  text?: string;
  /** 等待文本消失 */
  textGone?: string;
  /** 等待 URL 匹配 */
  url?: string;
  /** 等待固定时间 (秒) */
  time?: number;
  /** 等待元素出现 */
  element?: string;
  /** 超时时间 (ms) */
  timeout?: number;
}

/**
 * 填写表单字段
 */
export interface FormField {
  /** 元素引用 */
  ref: string;
  /** 字段名 (描述) */
  name: string;
  /** 字段类型 */
  type: 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider';
  /** 要填写的值 */
  value: string;
}

/**
 * 设备模拟配置
 */
export interface DeviceEmulation {
  /** 设备名称 (如 "iPhone 14", "iPad Pro") */
  device?: string;
  /** 视口宽度 */
  width?: number;
  /** 视口高度 */
  height?: number;
  /** 设备像素比 */
  deviceScaleFactor?: number;
  /** 是否为移动设备 */
  isMobile?: boolean;
  /** 是否支持触摸 */
  hasTouch?: boolean;
}

/**
 * 网络模拟配置
 */
export interface NetworkEmulation {
  /** 预设条件 */
  preset?: 'Slow 3G' | 'Fast 3G' | 'Slow 4G' | 'Fast 4G' | 'Offline';
  /** 下载速度 (bytes/s) */
  downloadSpeed?: number;
  /** 上传速度 (bytes/s) */
  uploadSpeed?: number;
  /** 延迟 (ms) */
  latency?: number;
}

/**
 * 网络路由规则
 */
export interface NetworkRoute {
  /** URL 模式 (glob) */
  pattern: string;
  /** 响应状态码 */
  status?: number;
  /** 响应头 */
  headers?: Record<string, string>;
  /** 响应体 */
  body?: string;
  /** 是否阻止请求 */
  abort?: boolean;
}

/**
 * Agent Browser 命令类型
 */
export type AgentBrowserCommand =
  // 导航
  | 'open'
  | 'goto'
  | 'back'
  | 'forward'
  | 'reload'
  // 元素交互
  | 'click'
  | 'dblclick'
  | 'fill'
  | 'type'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'hover'
  | 'drag'
  // 信息获取
  | 'snapshot'
  | 'screenshot'
  | 'get'
  | 'find'
  // 等待
  | 'wait'
  // 标签页
  | 'tab'
  // 网络
  | 'network'
  // 执行 JS
  | 'eval'
  // 会话管理
  | 'session'
  | 'close';

/**
 * Agent Browser 动作
 */
export interface AgentBrowserAction {
  /** 命令类型 */
  command: AgentBrowserCommand;
  /** 命令参数 */
  args?: string[];
  /** 命令选项 */
  options?: Record<string, unknown>;
}

/**
 * 会话信息
 */
export interface SessionInfo {
  /** 会话名称 */
  name: string;
  /** 创建时间 */
  createdAt: number;
  /** 最后活动时间 */
  lastActivity: number;
  /** 当前 URL */
  currentUrl?: string;
  /** 标签页数量 */
  tabCount: number;
}

/**
 * 执行计划步骤
 */
export interface AgentBrowserStep {
  /** 步骤 ID */
  id: string;
  /** 步骤描述 */
  description: string;
  /** 要执行的动作 */
  action: AgentBrowserAction;
  /** 失败时的处理策略 */
  onFailure?: 'stop' | 'continue' | 'retry';
  /** 重试次数 */
  retryCount?: number;
  /** 执行前等待时间 (ms) */
  delay?: number;
}

/**
 * 执行计划
 */
export interface AgentBrowserPlan {
  /** 计划 ID */
  id: string;
  /** 计划名称 */
  name: string;
  /** 起始 URL */
  startUrl?: string;
  /** 执行步骤 */
  steps: AgentBrowserStep[];
  /** 会话配置 */
  session?: string;
  /** Profile 配置 */
  profile?: string;
}

/**
 * 计划执行状态
 */
export interface AgentBrowserPlanStatus {
  planId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentStepIndex: number;
  totalSteps: number;
  stepResults: Array<{
    stepId: string;
    success: boolean;
    duration: number;
    error?: string;
  }>;
  startedAt: number;
  completedAt?: number;
  error?: string;
}
