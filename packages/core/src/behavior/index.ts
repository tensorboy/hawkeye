/**
 * 行为追踪模块
 * 提供用户行为追踪、模式识别和习惯学习功能
 */

// 类型导出
export * from './types';

// 事件收集器
export { BehaviorEventCollector, EventCollectorOptions } from './event-collector';

// 特征提取器
export {
  FeatureExtractor,
  TimeFeatures,
  FrequencyFeatures,
  SequenceFeatures,
  ContextFeatures,
  ExtractedFeatures,
} from './feature-extractor';

// 模式识别器
export {
  PatternRecognizer,
  RecognizedPattern,
  TemporalPatternResult,
  SequencePatternResult,
  AssociationPatternResult,
  AnomalyResult,
} from './pattern-recognizer';

// 习惯学习器
export {
  HabitLearner,
  WorkflowHabit,
  UserHabitProfile,
  HabitSuggestion,
} from './habit-learner';

// 行为追踪器 (主入口)
export {
  BehaviorTracker,
  BehaviorTrackerOptions,
  createBehaviorTracker,
} from './behavior-tracker';
