/**
 * Debug Timeline Types - Frontend type definitions
 */

export type DebugEventType =
  | 'screenshot'
  | 'ocr'
  | 'clipboard'
  | 'window'
  | 'file'
  | 'llm_input'
  | 'llm_output'
  | 'intent'
  | 'plan'
  | 'execution_start'
  | 'execution_step'
  | 'execution_complete'
  | 'error';

export interface DebugEvent {
  id: string;
  timestamp: number;
  type: DebugEventType;
  data: Record<string, unknown>;
  duration?: number;
  parentId?: string;
}

export interface EventFilter {
  types?: DebugEventType[];
  startTime?: number;
  endTime?: number;
  search?: string;
}

export interface DebugStatus {
  paused: boolean;
  count: number;
  totalCount: number;
  config?: {
    maxEvents: number;
    enableScreenshots: boolean;
    screenshotThumbnailSize: number;
    truncateTextAt: number;
  };
}

// Event type icons and labels
export const EVENT_TYPE_CONFIG: Record<DebugEventType, { icon: string; label: string; color: string }> = {
  screenshot: { icon: '📸', label: '截屏', color: '#10b981' },
  ocr: { icon: '🔤', label: 'OCR', color: '#3b82f6' },
  clipboard: { icon: '📋', label: '剪贴板', color: '#8b5cf6' },
  window: { icon: '🪟', label: '窗口切换', color: '#f59e0b' },
  file: { icon: '📁', label: '文件变化', color: '#6366f1' },
  llm_input: { icon: '🧠', label: 'LLM 输入', color: '#ec4899' },
  llm_output: { icon: '🤖', label: 'LLM 输出', color: '#14b8a6' },
  intent: { icon: '🎯', label: '意图识别', color: '#f97316' },
  plan: { icon: '📋', label: '执行计划', color: '#06b6d4' },
  execution_start: { icon: '▶️', label: '执行开始', color: '#22c55e' },
  execution_step: { icon: '⚙️', label: '执行步骤', color: '#64748b' },
  execution_complete: { icon: '✅', label: '执行完成', color: '#22c55e' },
  error: { icon: '❌', label: '错误', color: '#ef4444' },
};
