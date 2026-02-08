/**
 * Browser Agent — State-machine based browser automation
 *
 * Priority chain: State Machine (90%) → Rule Engine (8%) → LLM (2%)
 */

// Types
export * from './types';

// Core
export { SiteRouter } from './site-router';
export { StateMachineExecutor } from './state-machine-executor';
export { ChangeObserver } from './change-observer';
export { ObstacleDetector } from './obstacle-detector';
export { RuleEngine } from './rule-engine';

// Site-specific machines
export { AMAZON_MACHINE } from './machines/amazon';
export { YOUTUBE_MACHINE } from './machines/youtube';
export { GOOGLE_SEARCH_MACHINE } from './machines/google-search';
export { TAOBAO_MACHINE } from './machines/taobao';
