/**
 * 特征提取器
 * 从行为事件中提取时间特征、频率特征、序列特征等
 */

import { BehaviorEvent, BehaviorEventType } from './types';

// ============ 特征类型定义 ============

export interface TimeFeatures {
  /** 小时 (0-23) */
  hour: number;
  /** 分钟 (0-59) */
  minute: number;
  /** 星期几 (0-6, 0 = 周日) */
  dayOfWeek: number;
  /** 是否工作日 */
  isWeekday: boolean;
  /** 一天中的时段 */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  /** 是否为工作时间 (9-18) */
  isWorkingHours: boolean;
}

export interface FrequencyFeatures {
  /** 事件类型频率分布 */
  eventTypeDistribution: Map<BehaviorEventType, number>;
  /** 应用使用频率 */
  appUsageFrequency: Map<string, number>;
  /** 每小时事件数 */
  eventsPerHour: number[];
  /** 每天事件数 */
  eventsPerDay: number[];
  /** 总事件数 */
  totalEvents: number;
}

export interface SequenceFeatures {
  /** 常见事件序列 */
  commonSequences: Array<{
    sequence: BehaviorEventType[];
    count: number;
    avgDuration: number;
  }>;
  /** 应用切换模式 */
  appSwitchPatterns: Array<{
    from: string;
    to: string;
    count: number;
  }>;
  /** 事件转移概率 */
  transitionProbabilities: Map<BehaviorEventType, Map<BehaviorEventType, number>>;
}

export interface ContextFeatures {
  /** 应用-时间关联 */
  appTimeCorrelation: Map<string, number[]>;
  /** 应用-事件关联 */
  appEventCorrelation: Map<string, BehaviorEventType[]>;
  /** 文件类型偏好 */
  fileTypePreferences: Map<string, number>;
  /** 常用目录 */
  frequentDirectories: Map<string, number>;
}

export interface ExtractedFeatures {
  timeFeatures: TimeFeatures;
  frequencyFeatures: FrequencyFeatures;
  sequenceFeatures: SequenceFeatures;
  contextFeatures: ContextFeatures;
  extractedAt: number;
  eventCount: number;
  timeRange: {
    start: number;
    end: number;
  };
}

// ============ 特征提取器实现 ============

export class FeatureExtractor {
  private sequenceWindowSize: number;
  private minSequenceOccurrences: number;

  constructor(options: { sequenceWindowSize?: number; minSequenceOccurrences?: number } = {}) {
    this.sequenceWindowSize = options.sequenceWindowSize || 3;
    this.minSequenceOccurrences = options.minSequenceOccurrences || 2;
  }

  /**
   * 从事件列表中提取所有特征
   */
  extractFeatures(events: BehaviorEvent[]): ExtractedFeatures {
    if (events.length === 0) {
      return this.getEmptyFeatures();
    }

    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    return {
      timeFeatures: this.extractTimeFeatures(sortedEvents[sortedEvents.length - 1]),
      frequencyFeatures: this.extractFrequencyFeatures(sortedEvents),
      sequenceFeatures: this.extractSequenceFeatures(sortedEvents),
      contextFeatures: this.extractContextFeatures(sortedEvents),
      extractedAt: Date.now(),
      eventCount: events.length,
      timeRange: {
        start: sortedEvents[0].timestamp,
        end: sortedEvents[sortedEvents.length - 1].timestamp,
      },
    };
  }

  /**
   * 提取时间特征
   */
  extractTimeFeatures(event: BehaviorEvent): TimeFeatures {
    const date = new Date(event.timestamp);
    const hour = date.getHours();
    const dayOfWeek = date.getDay();

    return {
      hour,
      minute: date.getMinutes(),
      dayOfWeek,
      isWeekday: dayOfWeek >= 1 && dayOfWeek <= 5,
      timeOfDay: this.getTimeOfDay(hour),
      isWorkingHours: hour >= 9 && hour < 18,
    };
  }

  /**
   * 提取频率特征
   */
  extractFrequencyFeatures(events: BehaviorEvent[]): FrequencyFeatures {
    const eventTypeDistribution = new Map<BehaviorEventType, number>();
    const appUsageFrequency = new Map<string, number>();
    const eventsPerHour = new Array(24).fill(0);
    const eventsPerDay = new Array(7).fill(0);

    for (const event of events) {
      // 事件类型分布
      const typeCount = eventTypeDistribution.get(event.eventType) || 0;
      eventTypeDistribution.set(event.eventType, typeCount + 1);

      // 应用使用频率
      const app = event.environment.activeApp;
      const appCount = appUsageFrequency.get(app) || 0;
      appUsageFrequency.set(app, appCount + 1);

      // 每小时事件数
      const hour = new Date(event.timestamp).getHours();
      eventsPerHour[hour]++;

      // 每天事件数
      const day = new Date(event.timestamp).getDay();
      eventsPerDay[day]++;
    }

    return {
      eventTypeDistribution,
      appUsageFrequency,
      eventsPerHour,
      eventsPerDay,
      totalEvents: events.length,
    };
  }

  /**
   * 提取序列特征
   */
  extractSequenceFeatures(events: BehaviorEvent[]): SequenceFeatures {
    const sequenceCounts = new Map<string, { count: number; durations: number[] }>();
    const appSwitchCounts = new Map<string, number>();
    const transitions = new Map<BehaviorEventType, Map<BehaviorEventType, number>>();

    // 滑动窗口提取序列
    for (let i = 0; i <= events.length - this.sequenceWindowSize; i++) {
      const window = events.slice(i, i + this.sequenceWindowSize);
      const sequence = window.map((e) => e.eventType);
      const key = sequence.join('->');
      const duration = window[window.length - 1].timestamp - window[0].timestamp;

      const existing = sequenceCounts.get(key) || { count: 0, durations: [] };
      existing.count++;
      existing.durations.push(duration);
      sequenceCounts.set(key, existing);
    }

    // 提取事件转移概率和应用切换模式
    for (let i = 0; i < events.length - 1; i++) {
      const current = events[i];
      const next = events[i + 1];

      // 事件转移
      if (!transitions.has(current.eventType)) {
        transitions.set(current.eventType, new Map());
      }
      const transitionMap = transitions.get(current.eventType)!;
      const count = transitionMap.get(next.eventType) || 0;
      transitionMap.set(next.eventType, count + 1);

      // 应用切换
      if (current.eventType === BehaviorEventType.APP_SWITCH) {
        const fromApp = current.data.context.fromApp as string;
        const toApp = current.data.target;
        const switchKey = `${fromApp}->${toApp}`;
        const switchCount = appSwitchCounts.get(switchKey) || 0;
        appSwitchCounts.set(switchKey, switchCount + 1);
      }
    }

    // 转换为输出格式
    const commonSequences = Array.from(sequenceCounts.entries())
      .filter(([_, value]) => value.count >= this.minSequenceOccurrences)
      .map(([key, value]) => ({
        sequence: key.split('->') as BehaviorEventType[],
        count: value.count,
        avgDuration:
          value.durations.reduce((a, b) => a + b, 0) / value.durations.length,
      }))
      .sort((a, b) => b.count - a.count);

    const appSwitchPatterns = Array.from(appSwitchCounts.entries())
      .map(([key, count]) => {
        const [from, to] = key.split('->');
        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count);

    // 归一化转移概率
    const transitionProbabilities = new Map<
      BehaviorEventType,
      Map<BehaviorEventType, number>
    >();
    for (const [fromType, toMap] of transitions.entries()) {
      const total = Array.from(toMap.values()).reduce((a, b) => a + b, 0);
      const probMap = new Map<BehaviorEventType, number>();
      for (const [toType, count] of toMap.entries()) {
        probMap.set(toType, count / total);
      }
      transitionProbabilities.set(fromType, probMap);
    }

    return {
      commonSequences,
      appSwitchPatterns,
      transitionProbabilities,
    };
  }

  /**
   * 提取上下文特征
   */
  extractContextFeatures(events: BehaviorEvent[]): ContextFeatures {
    const appTimeCorrelation = new Map<string, number[]>();
    const appEventCorrelation = new Map<string, BehaviorEventType[]>();
    const fileTypePreferences = new Map<string, number>();
    const frequentDirectories = new Map<string, number>();

    for (const event of events) {
      const app = event.environment.activeApp;
      const hour = new Date(event.timestamp).getHours();

      // 应用-时间关联
      if (!appTimeCorrelation.has(app)) {
        appTimeCorrelation.set(app, new Array(24).fill(0));
      }
      appTimeCorrelation.get(app)![hour]++;

      // 应用-事件关联
      if (!appEventCorrelation.has(app)) {
        appEventCorrelation.set(app, []);
      }
      const eventTypes = appEventCorrelation.get(app)!;
      if (!eventTypes.includes(event.eventType)) {
        eventTypes.push(event.eventType);
      }

      // 文件类型偏好
      if (
        event.eventType === BehaviorEventType.FILE_OPEN ||
        event.eventType === BehaviorEventType.FILE_CREATE
      ) {
        const filePath = event.data.target;
        const ext = this.getFileExtension(filePath);
        if (ext) {
          const count = fileTypePreferences.get(ext) || 0;
          fileTypePreferences.set(ext, count + 1);
        }

        // 常用目录
        const dir = this.getDirectoryPath(filePath);
        if (dir) {
          const dirCount = frequentDirectories.get(dir) || 0;
          frequentDirectories.set(dir, dirCount + 1);
        }
      }
    }

    return {
      appTimeCorrelation,
      appEventCorrelation,
      fileTypePreferences,
      frequentDirectories,
    };
  }

  /**
   * 获取一天中的时段
   */
  private getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(filePath: string): string | null {
    const match = filePath.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * 获取目录路径
   */
  private getDirectoryPath(filePath: string): string | null {
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return lastSlash > 0 ? filePath.substring(0, lastSlash) : null;
  }

  /**
   * 获取空特征对象
   */
  private getEmptyFeatures(): ExtractedFeatures {
    return {
      timeFeatures: {
        hour: 0,
        minute: 0,
        dayOfWeek: 0,
        isWeekday: false,
        timeOfDay: 'morning',
        isWorkingHours: false,
      },
      frequencyFeatures: {
        eventTypeDistribution: new Map(),
        appUsageFrequency: new Map(),
        eventsPerHour: new Array(24).fill(0),
        eventsPerDay: new Array(7).fill(0),
        totalEvents: 0,
      },
      sequenceFeatures: {
        commonSequences: [],
        appSwitchPatterns: [],
        transitionProbabilities: new Map(),
      },
      contextFeatures: {
        appTimeCorrelation: new Map(),
        appEventCorrelation: new Map(),
        fileTypePreferences: new Map(),
        frequentDirectories: new Map(),
      },
      extractedAt: Date.now(),
      eventCount: 0,
      timeRange: {
        start: 0,
        end: 0,
      },
    };
  }
}
