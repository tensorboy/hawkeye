/**
 * 模式识别器
 * 从特征数据中识别时序模式、周期模式、关联规则等
 */

import { v4 as uuidv4 } from 'uuid';
import {
  BehaviorEvent,
  BehaviorEventType,
  TemporalPattern,
  HabitLearningConfig,
} from './types';
import { ExtractedFeatures, SequenceFeatures } from './feature-extractor';

// ============ 识别结果类型 ============

export interface RecognizedPattern {
  id: string;
  type: 'temporal' | 'sequence' | 'association' | 'anomaly';
  name: string;
  description: string;
  confidence: number;
  occurrences: number;
  details: Record<string, unknown>;
  createdAt: number;
}

export interface TemporalPatternResult extends RecognizedPattern {
  type: 'temporal';
  details: {
    patternType: 'daily' | 'weekly' | 'monthly' | 'event_triggered';
    schedule?: {
      hour?: number;
      minute?: number;
      dayOfWeek?: number[];
    };
    triggerEvent?: BehaviorEventType;
    actionSequence: string[];
    toleranceMinutes: number;
    variability: number;
  };
}

export interface SequencePatternResult extends RecognizedPattern {
  type: 'sequence';
  details: {
    sequence: BehaviorEventType[];
    avgDuration: number;
    medianDuration: number;
    transitionProbability: number;
  };
}

export interface AssociationPatternResult extends RecognizedPattern {
  type: 'association';
  details: {
    antecedent: string[];
    consequent: string[];
    support: number;
    lift: number;
  };
}

export interface AnomalyResult extends RecognizedPattern {
  type: 'anomaly';
  details: {
    anomalyType: 'time' | 'sequence' | 'frequency';
    expectedValue: unknown;
    actualValue: unknown;
    deviation: number;
  };
}

// ============ 模式识别器实现 ============

export class PatternRecognizer {
  private config: HabitLearningConfig['patternDetection'];
  private historicalPatterns: Map<string, RecognizedPattern> = new Map();

  constructor(config?: Partial<HabitLearningConfig['patternDetection']>) {
    this.config = {
      enabled: true,
      minOccurrences: 3,
      timeWindowDays: 30,
      similarityThreshold: 0.8,
      ...config,
    };
  }

  /**
   * 识别所有模式
   */
  recognizePatterns(
    features: ExtractedFeatures,
    events: BehaviorEvent[]
  ): RecognizedPattern[] {
    if (!this.config.enabled) {
      return [];
    }

    const patterns: RecognizedPattern[] = [];

    // 识别时序模式
    const temporalPatterns = this.recognizeTemporalPatterns(events);
    patterns.push(...temporalPatterns);

    // 识别序列模式
    const sequencePatterns = this.recognizeSequencePatterns(features.sequenceFeatures);
    patterns.push(...sequencePatterns);

    // 识别关联模式
    const associationPatterns = this.recognizeAssociationPatterns(events);
    patterns.push(...associationPatterns);

    // 检测异常
    const anomalies = this.detectAnomalies(features, events);
    patterns.push(...anomalies);

    // 更新历史模式
    this.updateHistoricalPatterns(patterns);

    return patterns;
  }

  /**
   * 识别时序模式 (每日/每周重复的行为)
   */
  recognizeTemporalPatterns(events: BehaviorEvent[]): TemporalPatternResult[] {
    const patterns: TemporalPatternResult[] = [];
    const dailyPatterns = new Map<string, BehaviorEvent[]>();
    const weeklyPatterns = new Map<string, BehaviorEvent[]>();

    // 按时间分组事件
    for (const event of events) {
      const date = new Date(event.timestamp);
      const hour = date.getHours();
      const dayOfWeek = date.getDay();

      // 每日模式 (按小时+事件类型分组)
      const dailyKey = `${hour}:${event.eventType}:${event.environment.activeApp}`;
      if (!dailyPatterns.has(dailyKey)) {
        dailyPatterns.set(dailyKey, []);
      }
      dailyPatterns.get(dailyKey)!.push(event);

      // 每周模式 (按星期几+小时+事件类型分组)
      const weeklyKey = `${dayOfWeek}:${hour}:${event.eventType}`;
      if (!weeklyPatterns.has(weeklyKey)) {
        weeklyPatterns.set(weeklyKey, []);
      }
      weeklyPatterns.get(weeklyKey)!.push(event);
    }

    // 检测每日模式
    for (const [key, groupedEvents] of dailyPatterns.entries()) {
      if (groupedEvents.length >= this.config.minOccurrences) {
        const [hour, eventType, app] = key.split(':');
        const uniqueDays = new Set(
          groupedEvents.map((e) => new Date(e.timestamp).toDateString())
        ).size;

        if (uniqueDays >= this.config.minOccurrences) {
          // 计算时间变异性
          const minutes = groupedEvents.map((e) => new Date(e.timestamp).getMinutes());
          const avgMinute = minutes.reduce((a, b) => a + b, 0) / minutes.length;
          const variability = Math.sqrt(
            minutes.reduce((sum, m) => sum + Math.pow(m - avgMinute, 2), 0) /
              minutes.length
          );

          patterns.push({
            id: uuidv4(),
            type: 'temporal',
            name: `Daily ${eventType} in ${app}`,
            description: `User tends to ${eventType} in ${app} around ${hour}:00`,
            confidence: Math.min(uniqueDays / 10, 1),
            occurrences: groupedEvents.length,
            createdAt: Date.now(),
            details: {
              patternType: 'daily',
              schedule: {
                hour: parseInt(hour),
                minute: Math.round(avgMinute),
              },
              actionSequence: [eventType],
              toleranceMinutes: Math.ceil(variability * 2),
              variability,
            },
          });
        }
      }
    }

    // 检测每周模式
    for (const [key, groupedEvents] of weeklyPatterns.entries()) {
      if (groupedEvents.length >= this.config.minOccurrences) {
        const [dayOfWeek, hour, eventType] = key.split(':');
        const uniqueWeeks = new Set(
          groupedEvents.map((e) => this.getWeekNumber(new Date(e.timestamp)))
        ).size;

        if (uniqueWeeks >= this.config.minOccurrences) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

          patterns.push({
            id: uuidv4(),
            type: 'temporal',
            name: `Weekly ${eventType} on ${dayNames[parseInt(dayOfWeek)]}`,
            description: `User tends to ${eventType} on ${dayNames[parseInt(dayOfWeek)]}s around ${hour}:00`,
            confidence: Math.min(uniqueWeeks / 4, 1),
            occurrences: groupedEvents.length,
            createdAt: Date.now(),
            details: {
              patternType: 'weekly',
              schedule: {
                hour: parseInt(hour),
                dayOfWeek: [parseInt(dayOfWeek)],
              },
              actionSequence: [eventType],
              toleranceMinutes: 30,
              variability: 0,
            },
          });
        }
      }
    }

    return patterns;
  }

  /**
   * 识别序列模式 (常见的操作序列)
   */
  recognizeSequencePatterns(sequenceFeatures: SequenceFeatures): SequencePatternResult[] {
    return sequenceFeatures.commonSequences
      .filter((seq) => seq.count >= this.config.minOccurrences)
      .map((seq) => ({
        id: uuidv4(),
        type: 'sequence' as const,
        name: `Sequence: ${seq.sequence.join(' → ')}`,
        description: `Common sequence of ${seq.sequence.length} actions`,
        confidence: Math.min(seq.count / 10, 1),
        occurrences: seq.count,
        createdAt: Date.now(),
        details: {
          sequence: seq.sequence,
          avgDuration: seq.avgDuration,
          medianDuration: seq.avgDuration, // 简化处理
          transitionProbability: seq.count / (seq.count + 1),
        },
      }));
  }

  /**
   * 识别关联模式 (使用 Apriori 思想)
   */
  recognizeAssociationPatterns(events: BehaviorEvent[]): AssociationPatternResult[] {
    const patterns: AssociationPatternResult[] = [];
    const appPairs = new Map<string, number>();
    const appCounts = new Map<string, number>();
    const totalSessions = new Set(
      events.map((e) => new Date(e.timestamp).toDateString())
    ).size;

    // 计算应用出现频率和共现频率
    const sessionApps = new Map<string, Set<string>>();
    for (const event of events) {
      const session = new Date(event.timestamp).toDateString();
      const app = event.environment.activeApp;

      if (!sessionApps.has(session)) {
        sessionApps.set(session, new Set());
      }
      sessionApps.get(session)!.add(app);
    }

    // 统计单个应用和应用对
    for (const apps of sessionApps.values()) {
      const appList = Array.from(apps);
      for (const app of appList) {
        appCounts.set(app, (appCounts.get(app) || 0) + 1);
      }

      for (let i = 0; i < appList.length; i++) {
        for (let j = i + 1; j < appList.length; j++) {
          const pair = [appList[i], appList[j]].sort().join('|');
          appPairs.set(pair, (appPairs.get(pair) || 0) + 1);
        }
      }
    }

    // 计算关联规则
    for (const [pair, coCount] of appPairs.entries()) {
      if (coCount < this.config.minOccurrences) continue;

      const [app1, app2] = pair.split('|');
      const app1Count = appCounts.get(app1) || 0;
      const app2Count = appCounts.get(app2) || 0;

      const support = coCount / totalSessions;
      const confidence1 = coCount / app1Count;
      const confidence2 = coCount / app2Count;
      const expectedCoCount = (app1Count * app2Count) / totalSessions;
      const lift = coCount / expectedCoCount;

      if (lift > 1.5 && confidence1 > 0.5) {
        patterns.push({
          id: uuidv4(),
          type: 'association',
          name: `${app1} → ${app2}`,
          description: `When using ${app1}, user often also uses ${app2}`,
          confidence: confidence1,
          occurrences: coCount,
          createdAt: Date.now(),
          details: {
            antecedent: [app1],
            consequent: [app2],
            support,
            lift,
          },
        });
      }

      if (lift > 1.5 && confidence2 > 0.5) {
        patterns.push({
          id: uuidv4(),
          type: 'association',
          name: `${app2} → ${app1}`,
          description: `When using ${app2}, user often also uses ${app1}`,
          confidence: confidence2,
          occurrences: coCount,
          createdAt: Date.now(),
          details: {
            antecedent: [app2],
            consequent: [app1],
            support,
            lift,
          },
        });
      }
    }

    return patterns;
  }

  /**
   * 检测异常行为
   */
  detectAnomalies(
    features: ExtractedFeatures,
    events: BehaviorEvent[]
  ): AnomalyResult[] {
    const anomalies: AnomalyResult[] = [];
    const recentEvents = events.filter(
      (e) => e.timestamp > Date.now() - 24 * 60 * 60 * 1000
    );

    if (recentEvents.length === 0) return anomalies;

    // 检测时间异常 (非常规工作时间的活动)
    const lateNightEvents = recentEvents.filter((e) => {
      const hour = new Date(e.timestamp).getHours();
      return hour >= 0 && hour < 6;
    });

    if (lateNightEvents.length > 5) {
      anomalies.push({
        id: uuidv4(),
        type: 'anomaly',
        name: 'Late Night Activity',
        description: 'Unusual activity detected during late night hours',
        confidence: 0.8,
        occurrences: lateNightEvents.length,
        createdAt: Date.now(),
        details: {
          anomalyType: 'time',
          expectedValue: '6:00 - 24:00',
          actualValue: '0:00 - 6:00',
          deviation: lateNightEvents.length / recentEvents.length,
        },
      });
    }

    // 检测频率异常 (事件数量突然增加)
    const hourlyEventCounts = features.frequencyFeatures.eventsPerHour;
    const avgHourlyEvents =
      hourlyEventCounts.reduce((a, b) => a + b, 0) / 24;
    const maxHourlyEvents = Math.max(...hourlyEventCounts);

    if (maxHourlyEvents > avgHourlyEvents * 3 && avgHourlyEvents > 0) {
      const peakHour = hourlyEventCounts.indexOf(maxHourlyEvents);
      anomalies.push({
        id: uuidv4(),
        type: 'anomaly',
        name: 'Activity Spike',
        description: `Unusual spike in activity at ${peakHour}:00`,
        confidence: 0.7,
        occurrences: maxHourlyEvents,
        createdAt: Date.now(),
        details: {
          anomalyType: 'frequency',
          expectedValue: avgHourlyEvents,
          actualValue: maxHourlyEvents,
          deviation: (maxHourlyEvents - avgHourlyEvents) / avgHourlyEvents,
        },
      });
    }

    return anomalies;
  }

  /**
   * 更新历史模式
   */
  private updateHistoricalPatterns(patterns: RecognizedPattern[]): void {
    for (const pattern of patterns) {
      // 查找相似的历史模式
      const existingPattern = this.findSimilarPattern(pattern);

      if (existingPattern) {
        // 更新置信度和出现次数
        existingPattern.confidence = Math.min(
          (existingPattern.confidence + pattern.confidence) / 2 + 0.05,
          1
        );
        existingPattern.occurrences += pattern.occurrences;
      } else {
        this.historicalPatterns.set(pattern.id, pattern);
      }
    }

    // 清理旧模式 (置信度衰减)
    const cutoff = Date.now() - this.config.timeWindowDays * 24 * 60 * 60 * 1000;
    for (const [id, pattern] of this.historicalPatterns.entries()) {
      if (pattern.createdAt < cutoff) {
        pattern.confidence *= 0.9;
        if (pattern.confidence < 0.1) {
          this.historicalPatterns.delete(id);
        }
      }
    }
  }

  /**
   * 查找相似模式
   */
  private findSimilarPattern(pattern: RecognizedPattern): RecognizedPattern | null {
    for (const existing of this.historicalPatterns.values()) {
      if (existing.type !== pattern.type) continue;

      // 简单的名称相似度检查
      if (existing.name === pattern.name) {
        return existing;
      }
    }
    return null;
  }

  /**
   * 获取周数
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * 获取所有历史模式
   */
  getHistoricalPatterns(): RecognizedPattern[] {
    return Array.from(this.historicalPatterns.values());
  }

  /**
   * 将模式转换为 TemporalPattern 格式
   */
  toTemporalPattern(pattern: TemporalPatternResult): TemporalPattern {
    return {
      id: pattern.id,
      name: pattern.name,
      type: pattern.details.patternType,
      temporal: {
        schedule: pattern.details.schedule,
        trigger: pattern.details.triggerEvent
          ? { event: pattern.details.triggerEvent }
          : undefined,
        toleranceMinutes: pattern.details.toleranceMinutes,
      },
      actionSequence: pattern.details.actionSequence.map((action) => ({
        action,
        optional: false,
      })),
      statistics: {
        confidence: pattern.confidence,
        frequency: pattern.occurrences,
        lastOccurrence: pattern.createdAt,
        occurrenceHistory: [],
        variability: pattern.details.variability,
      },
    };
  }
}
