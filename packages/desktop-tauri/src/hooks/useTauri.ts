import { invoke } from '@tauri-apps/api/core';

// Types matching Rust backend
export interface ScreenshotResult {
  success: boolean;
  dataUrl?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface OcrResult {
  success: boolean;
  text?: string;
  durationMs?: number;
  backend?: string;
  error?: string;
}

export interface WindowInfo {
  appName: string;
  title: string;
  bundleId?: string;
}

export interface AppConfig {
  aiProvider: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiBaseUrl?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  syncPort: number;
  autoStartSync: boolean;
  autoUpdate: boolean;
  localOnly: boolean;
  onboardingCompleted?: boolean;
}

export interface HawkeyeStatus {
  initialized: boolean;
  aiReady: boolean;
  aiProvider?: string;
  observeRunning: boolean;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatResponse {
  text: string;
  model: string;
  durationMs: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ObserveStatus {
  running: boolean;
  lastObservation?: ObservationResult;
}

export interface ObservationResult {
  screenshotBase64?: string;
  ocrText?: string;
  activeWindow?: WindowInfo;
  changeRatio: number;
  timestamp: number;
}

// Tauri command wrappers
export async function getStatus(): Promise<HawkeyeStatus> {
  return invoke('get_status');
}

export async function captureScreen(): Promise<ScreenshotResult> {
  return invoke('capture_screen');
}

export async function runOcr(imageBase64: string): Promise<OcrResult> {
  return invoke('run_ocr', { imageBase64 });
}

export async function getActiveWindow(): Promise<WindowInfo> {
  return invoke('get_active_window');
}

export async function getClipboard(): Promise<string> {
  return invoke('get_clipboard');
}

export async function loadConfig(): Promise<AppConfig> {
  return invoke('load_config');
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke('save_config', { config });
}

export async function openUrl(url: string): Promise<void> {
  return invoke('open_url', { url });
}

// AI commands
export async function initAi(): Promise<boolean> {
  return invoke('init_ai');
}

export async function chat(messages: ChatMessage[]): Promise<ChatResponse> {
  return invoke('chat', { messages });
}

// Observe commands
export async function startObserve(): Promise<boolean> {
  return invoke('start_observe');
}

export async function stopObserve(): Promise<boolean> {
  return invoke('stop_observe');
}

export async function getObserveStatus(): Promise<ObserveStatus> {
  return invoke('get_observe_status');
}

// Adaptive refresh types
export type ActivityEventType =
  | 'screen_change'
  | 'user_interaction'
  | 'window_switch'
  | 'clipboard_change'
  | 'ai_request'
  | 'plan_execution';

export type ActivityLevel = 'idle' | 'low' | 'normal' | 'high' | 'very_high';

export interface AdaptiveRefreshStatus {
  enabled: boolean;
  activityScore: number;
  activityLevel: ActivityLevel;
  currentIntervalMs: number;
  recentEventCount: number;
}

// Adaptive refresh commands
export async function recordActivity(eventType: ActivityEventType): Promise<void> {
  return invoke('record_activity', { eventType });
}

export async function getRefreshStatus(): Promise<AdaptiveRefreshStatus> {
  return invoke('get_refresh_status');
}

// Activity summarizer types
export interface ActivitySummary {
  summary: string;
  periodStart: number;
  periodEnd: number;
  entryCount: number;
  topApps: string[];
  generatedAt: number;
}

export interface ActivityStats {
  totalEntries: number;
  pendingEntries: number;
  oldestPending?: number;
  newestPending?: number;
}

// Activity summarizer commands
export async function generateSummary(): Promise<ActivitySummary> {
  return invoke('generate_summary');
}

export async function getRecentSummaries(count?: number): Promise<ActivitySummary[]> {
  return invoke('get_recent_summaries', { count });
}

export async function getActivityStats(): Promise<ActivityStats> {
  return invoke('get_activity_stats');
}

// Intent pipeline types
export type IntentType =
  | 'file_organize'
  | 'code_assist'
  | 'search'
  | 'communication'
  | 'automation'
  | 'data_process'
  | 'system_config'
  | 'unknown';

export interface IntentContext {
  currentApp?: string;
  currentTitle?: string;
  activityState: string;
}

export interface UserIntent {
  id: string;
  intentType: IntentType;
  description: string;
  confidence: number;
  context: IntentContext;
  createdAt: number;
}

// Intent pipeline commands
export async function recognizeIntent(): Promise<UserIntent[]> {
  return invoke('recognize_intent');
}

export async function recognizeIntentAi(): Promise<UserIntent[]> {
  return invoke('recognize_intent_ai');
}

export async function getRecentIntents(): Promise<UserIntent[]> {
  return invoke('get_recent_intents');
}

// Voice pipeline types
export interface SpeechResult {
  text: string;
  isFinal: boolean;
  confidence: number;
  language: string;
  durationMs: number;
}

export interface SpeechStatusInfo {
  available: boolean;
  authorized: boolean;
  locale: string;
}

// Voice pipeline commands
export async function speechStatus(): Promise<SpeechStatusInfo> {
  return invoke('speech_status');
}

export async function speechListen(durationSecs?: number): Promise<SpeechResult> {
  return invoke('speech_listen', { durationSecs });
}

export async function speechTranscribeFile(audioPath: string): Promise<SpeechResult> {
  return invoke('speech_transcribe_file', { audioPath });
}

// Model manager types
export type ModelType = 'text_llm' | 'vision_llm' | 'whisper' | 'tts' | 'vad' | 'embedding';

export type DownloadStatus = 'starting' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface ModelInfo {
  id: string;
  name: string;
  modelType: ModelType;
  description: string;
  sizeBytes: number;
  downloadUrl: string;
  filename: string;
}

export interface LocalModel {
  id: string;
  name: string;
  modelType: ModelType;
  filename: string;
  path: string;
  sizeBytes: number;
  downloadedAt: number;
}

export interface DownloadProgress {
  modelId: string;
  filename: string;
  downloadedBytes: number;
  totalBytes: number;
  progress: number;
  status: DownloadStatus;
}

// Model manager commands
export async function getModelsDir(): Promise<string> {
  return invoke('get_models_dir');
}

export async function listModels(): Promise<LocalModel[]> {
  return invoke('list_models');
}

export async function getRecommendedModels(): Promise<ModelInfo[]> {
  return invoke('get_recommended_models');
}

export async function getModelsByType(modelType: ModelType): Promise<ModelInfo[]> {
  return invoke('get_models_by_type', { modelType });
}

export async function modelExists(modelId: string): Promise<boolean> {
  return invoke('model_exists', { modelId });
}

export async function downloadModel(modelId: string): Promise<LocalModel> {
  return invoke('download_model', { modelId });
}

export async function cancelModelDownload(): Promise<void> {
  return invoke('cancel_model_download');
}

export async function deleteModel(modelId: string): Promise<void> {
  return invoke('delete_model', { modelId });
}

export async function getModelPath(modelId: string): Promise<string | null> {
  return invoke('get_model_path', { modelId });
}

// Life Tree types
export type LifeStage = 'career' | 'learning' | 'health' | 'relationships' | 'creativity' | 'finance' | 'safety';
export type NodeType = 'root' | 'stage' | 'goal' | 'task' | 'experiment';
export type NodeStatus = 'active' | 'completed' | 'paused' | 'failed';
export type ExperimentPhase = 'task_level' | 'goal_level' | 'automation_level';

export interface LifeTreeNode {
  id: string;
  nodeType: NodeType;
  label: string;
  description?: string;
  stage?: LifeStage;
  status: NodeStatus;
  confidence: number;
  children: string[];
  parent?: string;
  createdAt: number;
  updatedAt: number;
  experimentPhase?: ExperimentPhase;
  observationCount: number;
  relatedApps: string[];
}

export interface TreeStats {
  totalNodes: number;
  activeGoals: number;
  activeTasks: number;
  experimentsCompleted: number;
  mostActiveStage?: LifeStage;
}

export interface LifeTreeSnapshot {
  rootId: string;
  nodes: LifeTreeNode[];
  stats: TreeStats;
  generatedAt: number;
}

export interface ExperimentProposal {
  title: string;
  description: string;
  durationDays: number;
}

// Life Tree commands
export async function getLifeTree(): Promise<LifeTreeSnapshot> {
  return invoke('get_life_tree');
}

export async function rebuildLifeTree(): Promise<LifeTreeSnapshot> {
  return invoke('rebuild_life_tree');
}

export async function proposeExperiment(nodeId: string): Promise<ExperimentProposal> {
  return invoke('propose_experiment', { nodeId });
}

export async function startExperiment(
  nodeId: string,
  title: string,
  description: string,
  phase: ExperimentPhase
): Promise<string> {
  return invoke('start_experiment', { nodeId, title, description, phase });
}

export async function concludeExperiment(experimentId: string, succeeded: boolean): Promise<void> {
  return invoke('conclude_experiment', { experimentId, succeeded });
}

export async function getUnlockedPhase(): Promise<ExperimentPhase> {
  return invoke('get_unlocked_phase');
}

export async function getExperiments(): Promise<LifeTreeNode[]> {
  return invoke('get_experiments');
}

// Gesture control types
export type GestureAction =
  | 'click'
  | 'pause'
  | 'cursor_move'
  | 'cancel'
  | 'confirm'
  | 'screenshot'
  | 'quick_menu'
  | 'scroll_up'
  | 'scroll_down';

export interface GestureEvent {
  action: GestureAction;
  gesture: string;
  confidence: number;
  position?: { x: number; y: number };
  handedness?: string;
}

export interface GestureConfig {
  enabled: boolean;
  cursorSensitivity: number;
  clickHoldTime: number;
  scrollSpeed: number;
}

// Gesture control commands
export async function handleGesture(event: GestureEvent): Promise<boolean> {
  return invoke('handle_gesture', { event });
}

export async function getGestureStatus(): Promise<GestureConfig> {
  return invoke('get_gesture_status');
}

export async function setGestureConfig(newConfig: GestureConfig): Promise<GestureConfig> {
  return invoke('set_gesture_config', { newConfig });
}

export async function setGestureEnabled(enabled: boolean): Promise<boolean> {
  return invoke('set_gesture_enabled', { enabled });
}

// Auto-updater types
export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

// Auto-updater commands
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  return invoke('check_for_update');
}

export async function installUpdate(): Promise<void> {
  return invoke('install_update');
}

export async function getAppVersion(): Promise<string> {
  return invoke('get_app_version');
}

// Debug timeline types
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
  | 'error'
  | 'speech_segment'
  | 'gesture'
  | 'gaze_calibration'
  | 'observe'
  | 'system';

export interface DebugEvent {
  id: string;
  timestamp: number;
  eventType: DebugEventType;
  label: string;
  data: Record<string, unknown>;
  durationMs?: number;
  parentId?: string;
}

export interface DebugStatus {
  paused: boolean;
  count: number;
  maxEvents: number;
}

// Debug timeline commands
export async function getDebugEvents(
  eventTypes?: DebugEventType[],
  limit?: number
): Promise<DebugEvent[]> {
  return invoke('get_debug_events', { eventTypes, limit });
}

export async function getDebugEventsSince(sinceMs: number): Promise<DebugEvent[]> {
  return invoke('get_debug_events_since', { sinceMs });
}

export async function searchDebugEvents(query: string): Promise<DebugEvent[]> {
  return invoke('search_debug_events', { query });
}

export async function pushDebugEvent(
  eventType: DebugEventType,
  label: string,
  data: Record<string, unknown>,
  durationMs?: number
): Promise<DebugEvent | null> {
  return invoke('push_debug_event', { eventType, label, data, durationMs });
}

export async function getDebugStatus(): Promise<DebugStatus> {
  return invoke('get_debug_status');
}

export async function pauseDebug(): Promise<boolean> {
  return invoke('pause_debug');
}

export async function resumeDebug(): Promise<boolean> {
  return invoke('resume_debug');
}

export async function clearDebugEvents(): Promise<void> {
  return invoke('clear_debug_events');
}
