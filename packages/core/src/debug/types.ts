/**
 * Debug Timeline Types
 * Types for the debug timeline event collection system
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
  data: DebugEventData;
  duration?: number;
  parentId?: string; // For grouping related events
}

export type DebugEventData =
  | ScreenshotEventData
  | OCREventData
  | ClipboardEventData
  | WindowEventData
  | FileEventData
  | LLMInputEventData
  | LLMOutputEventData
  | IntentEventData
  | PlanEventData
  | ExecutionStartEventData
  | ExecutionStepEventData
  | ExecutionCompleteEventData
  | ErrorEventData;

export interface ScreenshotEventData {
  width: number;
  height: number;
  size?: number; // bytes
  thumbnail?: string; // base64 data URL (small preview)
  fullImage?: string; // base64 data URL (full image, optional)
}

export interface OCREventData {
  text: string;
  charCount: number;
  confidence?: number;
  backend: 'system' | 'tesseract' | 'vision' | 'unknown';
  duration: number; // ms
  /** Screenshot thumbnail (base64 data URL) - the source image that was OCR'd */
  thumbnail?: string;
  /** Screenshot dimensions */
  screenshotWidth?: number;
  screenshotHeight?: number;
  /** OCR regions with bounding boxes for visualization */
  regions?: Array<{
    text: string;
    confidence: number;
    /** Bounding box [x, y, width, height] in pixels */
    bbox: [number, number, number, number];
  }>;
}

export interface ClipboardEventData {
  content: string;
  type: 'text' | 'image' | 'file' | 'unknown';
  truncated?: boolean;
}

export interface WindowEventData {
  appName: string;
  title: string;
  bundleId?: string;
  path?: string;
}

export interface FileEventData {
  path: string;
  operation: 'create' | 'modify' | 'delete' | 'rename';
  oldPath?: string; // for rename operations
}

export interface LLMInputEventData {
  systemPrompt?: string;
  userMessage: string;
  model?: string;
  provider?: string;
  contextLength?: number;
}

export interface LLMOutputEventData {
  response: string;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  duration: number; // ms
  finishReason?: string;
}

export interface IntentEventData {
  intents: Array<{
    id: string;
    type: string;
    description: string;
    confidence: number;
  }>;
  contextId?: string;
}

export interface PlanEventData {
  planId: string;
  title: string;
  description?: string;
  steps: Array<{
    order: number;
    description: string;
    actionType: string;
    riskLevel: string;
  }>;
  intentId?: string;
}

export interface ExecutionStartEventData {
  planId: string;
  executionId: string;
  planTitle: string;
  totalSteps: number;
}

export interface ExecutionStepEventData {
  planId: string;
  executionId: string;
  stepOrder: number;
  stepDescription: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
  duration?: number;
}

export interface ExecutionCompleteEventData {
  planId: string;
  executionId: string;
  status: 'completed' | 'failed' | 'cancelled';
  totalDuration: number;
  stepsCompleted: number;
  stepsFailed: number;
}

export interface ErrorEventData {
  message: string;
  code?: string;
  source?: string;
  stack?: string;
}

export interface EventCollectorConfig {
  maxEvents: number;
  enableScreenshots: boolean;
  screenshotThumbnailSize: number; // max dimension for thumbnails
  truncateTextAt: number; // max chars for text content
}

export interface EventFilter {
  types?: DebugEventType[];
  startTime?: number;
  endTime?: number;
  search?: string;
}
