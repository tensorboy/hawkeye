/**
 * EventCollector - Debug Timeline Event Collection System
 * Collects and manages debug events for the timeline UI
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  DebugEvent,
  DebugEventType,
  DebugEventData,
  EventCollectorConfig,
  EventFilter,
  ScreenshotEventData,
  OCREventData,
  ClipboardEventData,
  WindowEventData,
  FileEventData,
  LLMInputEventData,
  LLMOutputEventData,
  IntentEventData,
  PlanEventData,
  ExecutionStartEventData,
  ExecutionStepEventData,
  ExecutionCompleteEventData,
  ErrorEventData,
} from './types';

const DEFAULT_CONFIG: EventCollectorConfig = {
  maxEvents: 500,
  enableScreenshots: true,
  screenshotThumbnailSize: 200,
  truncateTextAt: 5000,
};

export class EventCollector extends EventEmitter {
  private events: DebugEvent[] = [];
  private config: EventCollectorConfig;
  private paused: boolean = false;
  private eventCounter: number = 0;

  constructor(config: Partial<EventCollectorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add a new debug event
   */
  add(
    type: DebugEventType,
    data: DebugEventData,
    options: { duration?: number; parentId?: string } = {}
  ): DebugEvent {
    if (this.paused) {
      return this.createEvent(type, data, options);
    }

    const event = this.createEvent(type, data, options);
    this.events.push(event);
    this.eventCounter++;

    // Trim old events if over limit
    if (this.events.length > this.config.maxEvents) {
      const removed = this.events.shift();
      if (removed) {
        this.emit('event:removed', removed);
      }
    }

    this.emit('event:added', event);
    return event;
  }

  private createEvent(
    type: DebugEventType,
    data: DebugEventData,
    options: { duration?: number; parentId?: string }
  ): DebugEvent {
    return {
      id: uuidv4(),
      timestamp: Date.now(),
      type,
      data,
      duration: options.duration,
      parentId: options.parentId,
    };
  }

  // ============================================
  // Convenience methods for specific event types
  // ============================================

  /**
   * Record a screenshot capture event
   */
  addScreenshot(data: ScreenshotEventData): DebugEvent {
    return this.add('screenshot', data);
  }

  /**
   * Record an OCR recognition event
   */
  addOCR(data: OCREventData): DebugEvent {
    // Truncate text if too long
    const truncatedData = { ...data };
    if (truncatedData.text.length > this.config.truncateTextAt) {
      truncatedData.text =
        truncatedData.text.substring(0, this.config.truncateTextAt) + '... [truncated]';
    }
    return this.add('ocr', truncatedData, { duration: data.duration });
  }

  /**
   * Record a clipboard change event
   */
  addClipboard(data: ClipboardEventData): DebugEvent {
    const truncatedData = { ...data };
    if (typeof truncatedData.content === 'string') {
      if (truncatedData.content.length > this.config.truncateTextAt) {
        truncatedData.content =
          truncatedData.content.substring(0, this.config.truncateTextAt) + '... [truncated]';
        truncatedData.truncated = true;
      }
    }
    return this.add('clipboard', truncatedData);
  }

  /**
   * Record a window change event
   */
  addWindow(data: WindowEventData): DebugEvent {
    return this.add('window', data);
  }

  /**
   * Record a file system event
   */
  addFile(data: FileEventData): DebugEvent {
    return this.add('file', data);
  }

  /**
   * Record an LLM input (prompt) event
   */
  addLLMInput(data: LLMInputEventData): DebugEvent {
    const truncatedData = { ...data };
    if (truncatedData.systemPrompt && truncatedData.systemPrompt.length > this.config.truncateTextAt) {
      truncatedData.systemPrompt =
        truncatedData.systemPrompt.substring(0, this.config.truncateTextAt) + '... [truncated]';
    }
    if (truncatedData.userMessage.length > this.config.truncateTextAt) {
      truncatedData.userMessage =
        truncatedData.userMessage.substring(0, this.config.truncateTextAt) + '... [truncated]';
    }
    return this.add('llm_input', truncatedData);
  }

  /**
   * Record an LLM output (response) event
   */
  addLLMOutput(data: LLMOutputEventData, parentId?: string): DebugEvent {
    const truncatedData = { ...data };
    if (truncatedData.response.length > this.config.truncateTextAt) {
      truncatedData.response =
        truncatedData.response.substring(0, this.config.truncateTextAt) + '... [truncated]';
    }
    return this.add('llm_output', truncatedData, { duration: data.duration, parentId });
  }

  /**
   * Record an intent recognition event
   */
  addIntent(data: IntentEventData): DebugEvent {
    return this.add('intent', data);
  }

  /**
   * Record a plan generation event
   */
  addPlan(data: PlanEventData): DebugEvent {
    return this.add('plan', data);
  }

  /**
   * Record an execution start event
   */
  addExecutionStart(data: ExecutionStartEventData): DebugEvent {
    return this.add('execution_start', data);
  }

  /**
   * Record an execution step event
   */
  addExecutionStep(data: ExecutionStepEventData, parentId?: string): DebugEvent {
    return this.add('execution_step', data, { duration: data.duration, parentId });
  }

  /**
   * Record an execution complete event
   */
  addExecutionComplete(data: ExecutionCompleteEventData): DebugEvent {
    return this.add('execution_complete', data, { duration: data.totalDuration });
  }

  /**
   * Record an error event
   */
  addError(data: ErrorEventData): DebugEvent {
    return this.add('error', data);
  }

  // ============================================
  // Query methods
  // ============================================

  /**
   * Get all events
   */
  getAll(): DebugEvent[] {
    return [...this.events];
  }

  /**
   * Get events filtered by criteria
   */
  getFiltered(filter: EventFilter): DebugEvent[] {
    let result = [...this.events];

    if (filter.types && filter.types.length > 0) {
      result = result.filter((e) => filter.types!.includes(e.type));
    }

    if (filter.startTime) {
      result = result.filter((e) => e.timestamp >= filter.startTime!);
    }

    if (filter.endTime) {
      result = result.filter((e) => e.timestamp <= filter.endTime!);
    }

    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      result = result.filter((e) => {
        const dataStr = JSON.stringify(e.data).toLowerCase();
        return dataStr.includes(searchLower);
      });
    }

    return result;
  }

  /**
   * Get event by ID
   */
  getById(id: string): DebugEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  /**
   * Get recent events (last N)
   */
  getRecent(count: number = 50): DebugEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Get events since a timestamp
   */
  getSince(timestamp: number): DebugEvent[] {
    return this.events.filter((e) => e.timestamp > timestamp);
  }

  /**
   * Get total event count (including removed)
   */
  getTotalCount(): number {
    return this.eventCounter;
  }

  /**
   * Get current event count
   */
  getCount(): number {
    return this.events.length;
  }

  // ============================================
  // Control methods
  // ============================================

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
    this.emit('events:cleared');
  }

  /**
   * Pause event collection
   */
  pause(): void {
    this.paused = true;
    this.emit('collection:paused');
  }

  /**
   * Resume event collection
   */
  resume(): void {
    this.paused = false;
    this.emit('collection:resumed');
  }

  /**
   * Check if collection is paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EventCollectorConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config:updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): EventCollectorConfig {
    return { ...this.config };
  }

  /**
   * Export events to JSON
   */
  exportJSON(): string {
    return JSON.stringify(
      {
        exportedAt: Date.now(),
        totalEvents: this.eventCounter,
        events: this.events,
      },
      null,
      2
    );
  }

  /**
   * Import events from JSON
   */
  importJSON(json: string): number {
    try {
      const data = JSON.parse(json);
      if (data.events && Array.isArray(data.events)) {
        const imported = data.events as DebugEvent[];
        this.events = [...this.events, ...imported];
        this.emit('events:imported', imported.length);
        return imported.length;
      }
      return 0;
    } catch (error) {
      this.addError({
        message: 'Failed to import events',
        source: 'EventCollector.importJSON',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return 0;
    }
  }
}
