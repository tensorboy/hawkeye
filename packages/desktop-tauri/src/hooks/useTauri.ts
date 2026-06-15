import { invoke } from '@tauri-apps/api/core';
import { api } from '../lib/api';

/**
 * Every wrapper in this file now talks to the hawkeyed HTTP daemon via
 * `api.*`. The public signatures and return types are preserved 1:1 with
 * the old `invoke()`-based versions so consumers don't need to change.
 *
 * Two exceptions still use `invoke()`:
 *   • `getDaemonToken` — the GUI bootstraps the API token via Tauri IPC
 *     before any fetch can fire.
 *   • `getDaemonInfo`  — Tauri populates this at startup; the daemon's
 *     /v1/info doesn't carry GUI-specific fields (spawnedByGui, etc).
 */

// Types matching Rust backend
export interface ScreenshotResult {
  success: boolean;
  dataUrl?: string;
  width?: number;
  height?: number;
  error?: string;
}

/**
 * Bounding box returned by macOS Vision — normalized 0-1 coords with origin
 * at BOTTOM-LEFT of the captured image. Use {@link bboxToScreenPx} to
 * convert into top-left screen pixels for UI / hit-testing.
 */
export interface OcrBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding box in screen pixel coords, top-left origin. */
export interface OcrBoundingBoxPx {
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
}

export interface OcrRegion {
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
}

export interface OcrResult {
  success: boolean;
  text?: string;
  regions?: OcrRegion[];
  durationMs?: number;
  backend?: string;
  error?: string;
}

/**
 * Entity the user is currently looking at, computed by the frontend's
 * useGazedEntity hook and mirrored into Rust AppState so voice/agent/chat
 * can use it for "this/that" resolution.
 */
export interface GazedEntity {
  text: string;
  entityType?: string;
  bboxPx: OcrBoundingBoxPx;
  confidence: number;
  dwellMs: number;
  appName?: string;
  timestamp: number;
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
  anthropicApiKey?: string;
  anthropicModel?: string;
  anthropicBaseUrl?: string;
  /** Custom OpenAI-compatible endpoint (vLLM / Ollama / proxies) */
  customBaseUrl?: string;
  customApiKey?: string;
  customModel?: string;
  /** GGUF model id (must exist in the registry) when aiProvider === 'local' */
  localModelId?: string;
  collectTrainingData?: boolean;

  /** Speech provider: 'apple' | 'whisper' | 'openai' | 'gemini' */
  speechProvider?: string;
  /** Whisper.cpp GGML model id when speechProvider === 'whisper' */
  whisperModelId?: string;

  /** Vision/OCR provider: 'apple' | 'gemini' | 'openai' */
  visionProvider?: string;

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
  ocrRegions?: OcrRegion[];
  screenshotWidth?: number;
  screenshotHeight?: number;
  activeWindow?: WindowInfo;
  changeRatio: number;
  timestamp: number;
}

// Tauri command wrappers
export async function getStatus(): Promise<HawkeyeStatus> {
  return api.get('/v1/status');
}

export interface DaemonInfo {
  url: string;
  port: number;
  running: boolean;
  spawnedByGui: boolean;
  token?: string;
}

/// Get info about the locally-running hawkeyed daemon (if any). Surfaced to
/// the Models tab so programmers can grab the URL+token without digging.
/// Stays on Tauri IPC because the daemon's /v1/info doesn't expose GUI-specific
/// fields like `spawnedByGui`.
export async function getDaemonInfo(): Promise<DaemonInfo | null> {
  return invoke('get_daemon_info');
}

export async function captureScreen(): Promise<ScreenshotResult> {
  // Daemon returns {dataUrl, width, height}; tag with `success` for backward compat.
  const r = await api.post<{ dataUrl?: string; width?: number; height?: number; error?: string; ok?: boolean }>(
    '/v1/perception/screenshot',
  );
  return {
    success: r.ok !== false && !r.error,
    dataUrl: r.dataUrl,
    width: r.width,
    height: r.height,
    error: r.error,
  };
}

export async function runOcr(imageBase64: string): Promise<OcrResult> {
  const r = await api.post<{ ok?: boolean; text?: string; regions?: OcrRegion[]; durationMs?: number; backend?: string; error?: string }>(
    '/v1/perception/ocr',
    { image_base64: imageBase64 },
  );
  return {
    success: r.ok !== false && !r.error,
    text: r.text,
    regions: r.regions,
    durationMs: r.durationMs,
    backend: r.backend,
    error: r.error,
  };
}

/// Vision analysis dispatcher — picks Apple Vision OCR (with bboxes) or
/// cloud chat_with_vision based on the user's `visionProvider` config.
export interface VisionAnalysisResult {
  success: boolean;
  provider: string;
  text?: string;
  regions?: OcrRegion[];
  durationMs: number;
  error?: string;
}

export async function analyzeScreen(
  imageBase64: string,
  prompt?: string,
): Promise<VisionAnalysisResult> {
  const r = await api.post<{ ok?: boolean; provider: string; text?: string; regions?: OcrRegion[]; durationMs: number; error?: string }>(
    '/v1/perception/analyze',
    { image_base64: imageBase64, prompt },
  );
  return {
    success: r.ok !== false && !r.error,
    provider: r.provider,
    text: r.text,
    regions: r.regions,
    durationMs: r.durationMs,
    error: r.error,
  };
}

/// Speech dispatcher — picks Apple / Whisper.cpp / cloud Whisper / Gemini
/// audio based on the user's `speechProvider` config. Use this instead of
/// `speechListen` so the Models-tab choice actually has an effect.
export async function speechListenDispatch(durationSecs?: number): Promise<SpeechResult> {
  return api.post('/v1/speech/listen', { duration_secs: durationSecs });
}

export async function getActiveWindow(): Promise<WindowInfo> {
  return api.get('/v1/perception/window');
}

export async function getClipboard(): Promise<string> {
  const r = await api.get<{ content: string | null }>('/v1/clipboard');
  return r.content ?? '';
}

export async function loadConfig(): Promise<AppConfig> {
  return api.get('/v1/config');
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await api.put('/v1/config', config);
}

export async function openUrl(url: string): Promise<void> {
  await api.post('/v1/util/open-url', { url });
}

// AI commands
export async function initAi(): Promise<boolean> {
  const r = await api.post<{ ok?: boolean }>('/v1/ai/init');
  return r.ok === true;
}

export async function chat(messages: ChatMessage[]): Promise<ChatResponse> {
  return api.post('/v1/ai/chat', { messages });
}

/**
 * Chat with deictic resolution: backend rewrites "this/that/这个/那个" in
 * the last user message using the currently-gazed entity. Use this for any
 * UI flow where the user is talking about what they're looking at.
 */
export async function chatWithGazeContext(
  messages: ChatMessage[]
): Promise<ChatResponse> {
  return api.post('/v1/ai/chat-with-gaze-context', { messages });
}

// Gaze deixis commands
export async function setGazedEntity(entity: GazedEntity): Promise<void> {
  await api.put('/v1/gaze/entity', entity);
}

export async function getGazedEntity(): Promise<GazedEntity | null> {
  return api.get('/v1/gaze/entity');
}

export async function clearGazedEntity(): Promise<void> {
  await api.del('/v1/gaze/entity');
}

// --- Agent (cua-driver desktop control) ---

export interface AgentStatus {
  binaryInstalled: boolean;
  binaryPath?: string;
  daemonRunning: boolean;
  socketPath: string;
}

export interface ToolCallRecord {
  round: number;
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
}

export interface AgentTurnResult {
  text: string;
  rounds: number;
  toolCalls: ToolCallRecord[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/// Inspect cua-driver state — whether binary is installed and daemon is running.
export async function getAgentStatus(): Promise<AgentStatus> {
  return api.get('/v1/agent/status');
}

/// Spawn the cua-driver daemon (no-op if already running). Throws if binary missing.
export async function startAgent(): Promise<boolean> {
  const r = await api.post<{ ok?: boolean }>('/v1/agent/start');
  return r.ok === true;
}

/// Tool-using chat. `history` is the prior conversation, `userInput` is the new message.
export async function chatWithAgent(
  history: ChatMessage[],
  userInput: string
): Promise<AgentTurnResult> {
  return api.post('/v1/agent/chat', {
    history,
    user_input: userInput,
    require_confirmation: true,
  });
}

/// Direct tool invocation (debugging only — bypasses the LLM).
export async function invokeCuaTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ name: string; response: Record<string, unknown> }> {
  const r = await api.post<{ ok: boolean; summary: string; hasImage: boolean }>(
    `/v1/agent/tool/${encodeURIComponent(name)}`,
    { args },
  );
  return { name, response: r as unknown as Record<string, unknown> };
}

/// Resolve a pending agent confirmation. Called from the confirmation modal
/// when the user accepts or rejects a risky tool the LLM wants to invoke.
export async function agentConfirm(confirmId: string, accept: boolean): Promise<boolean> {
  const r = await api.post<{ ok?: boolean }>('/v1/agent/confirm', {
    confirm_id: confirmId,
    accept,
  });
  return r.ok === true;
}

/// Payload of the `agent:confirm-needed` Tauri event.
export interface AgentConfirmRequest {
  confirmId: string;
  round: number;
  name: string;
  args: Record<string, unknown>;
  summary: string;
}

// Observe commands
export async function startObserve(): Promise<boolean> {
  const r = await api.post<{ ok?: boolean }>('/v1/observe/start', {});
  return r.ok === true;
}

export async function stopObserve(): Promise<boolean> {
  const r = await api.post<{ ok?: boolean }>('/v1/observe/stop');
  return r.ok === true;
}

export async function getObserveStatus(): Promise<ObserveStatus> {
  return api.get('/v1/observe/status');
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
  await api.post('/v1/adaptive/record-activity', { event_type: eventType });
}

export async function getRefreshStatus(): Promise<AdaptiveRefreshStatus> {
  return api.get('/v1/adaptive/refresh-status');
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
  return api.post('/v1/summary/generate');
}

export async function getRecentSummaries(count?: number): Promise<ActivitySummary[]> {
  const qs = count !== undefined ? `?count=${count}` : '';
  return api.get(`/v1/summary/recent${qs}`);
}

export async function getActivityStats(): Promise<ActivityStats> {
  return api.get('/v1/summary/activity-stats');
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
  return api.post('/v1/intent/recognize');
}

export async function recognizeIntentAi(): Promise<UserIntent[]> {
  return api.post('/v1/intent/recognize-ai');
}

export async function getRecentIntents(): Promise<UserIntent[]> {
  return api.get('/v1/intent/recent');
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
  return api.get('/v1/speech/status');
}

export async function speechListen(durationSecs?: number): Promise<SpeechResult> {
  return api.post('/v1/speech/listen-apple', { duration_secs: durationSecs });
}

export async function speechTranscribeFile(audioPath: string): Promise<SpeechResult> {
  return api.post('/v1/speech/transcribe-file', { audio_path: audioPath });
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
  const r = await api.get<{ dir: string }>('/v1/models/dir');
  return r.dir;
}

export async function listModels(): Promise<LocalModel[]> {
  return api.get('/v1/models');
}

export async function getRecommendedModels(): Promise<ModelInfo[]> {
  return api.get('/v1/models/recommended');
}

export async function getModelsByType(modelType: ModelType): Promise<ModelInfo[]> {
  return api.get(`/v1/models/by-type/${encodeURIComponent(modelType)}`);
}

export async function modelExists(modelId: string): Promise<boolean> {
  const r = await api.get<{ exists: boolean }>(`/v1/models/${encodeURIComponent(modelId)}/exists`);
  return r.exists;
}

export async function downloadModel(modelId: string): Promise<LocalModel> {
  return api.post(`/v1/models/${encodeURIComponent(modelId)}/download`);
}

export async function cancelModelDownload(): Promise<void> {
  await api.post('/v1/models/download/cancel');
}

export async function deleteModel(modelId: string): Promise<void> {
  await api.del(`/v1/models/${encodeURIComponent(modelId)}`);
}

export async function getModelPath(modelId: string): Promise<string | null> {
  const r = await api.get<{ path: string | null }>(`/v1/models/${encodeURIComponent(modelId)}/path`);
  return r.path;
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
  entityIds?: string[];
}

export interface TreeStats {
  totalNodes: number;
  activeGoals: number;
  activeTasks: number;
  experimentsCompleted: number;
  mostActiveStage?: LifeStage;
  entityCount?: number;
}

export interface LifeTreeSnapshot {
  rootId: string;
  nodes: LifeTreeNode[];
  stats: TreeStats;
  generatedAt: number;
  knowledgeEntities?: KnowledgeEntity[];
  knowledgeEdges?: KnowledgeEdge[];
  crossEdges?: KnowledgeCrossEdge[];
}

export interface ExperimentProposal {
  title: string;
  description: string;
  durationDays: number;
}

// Knowledge graph types
export type KnowledgeNodeType = 'person' | 'project' | 'technology' | 'concept' | 'place';

export interface KnowledgeEntity {
  id: string;
  label: string;
  type: KnowledgeNodeType;
  aliases: string[];
  sourceNodeIds: string[];
  firstSeen: number;
  lastSeen: number;
  frequency: number;
}

export interface KnowledgeEdge {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relation: string;
  strength: number;
  sourceNodeIds: string[];
}

export interface KnowledgeCrossEdge {
  fromNodeId: string;
  toNodeId: string;
  entityLabel: string;
  strength: number;
}

// Life Tree commands
export async function getLifeTree(): Promise<LifeTreeSnapshot> {
  return api.get('/v1/life-tree');
}

export async function rebuildLifeTree(): Promise<LifeTreeSnapshot> {
  return api.post('/v1/life-tree/rebuild');
}

export async function proposeExperiment(nodeId: string): Promise<ExperimentProposal> {
  return api.post(`/v1/life-tree/nodes/${encodeURIComponent(nodeId)}/propose-experiment`);
}

export async function startExperiment(
  nodeId: string,
  title: string,
  description: string,
  phase: ExperimentPhase
): Promise<string> {
  const r = await api.post<{ ok: boolean; experimentId: string }>(
    '/v1/life-tree/experiments',
    { node_id: nodeId, title, description, phase },
  );
  return r.experimentId;
}

export async function concludeExperiment(experimentId: string, succeeded: boolean): Promise<void> {
  await api.post(
    `/v1/life-tree/experiments/${encodeURIComponent(experimentId)}/conclude`,
    { succeeded },
  );
}

export async function getUnlockedPhase(): Promise<ExperimentPhase> {
  const r = await api.get<{ phase: ExperimentPhase }>('/v1/life-tree/unlocked-phase');
  return r.phase;
}

export async function getExperiments(): Promise<LifeTreeNode[]> {
  return api.get('/v1/life-tree/experiments');
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
  const r = await api.post<{ ok?: boolean; handled?: boolean }>('/v1/gesture/event', event);
  return r.handled === true;
}

export async function getGestureStatus(): Promise<GestureConfig> {
  return api.get('/v1/gesture/status');
}

export async function setGestureConfig(newConfig: GestureConfig): Promise<GestureConfig> {
  return api.put('/v1/gesture/config', newConfig);
}

export async function setGestureEnabled(enabled: boolean): Promise<boolean> {
  const r = await api.post<{ enabled: boolean }>('/v1/gesture/enabled', { enabled });
  return r.enabled === true;
}

// Auto-updater types
export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

// Auto-updater commands.
// NOTE: the Tauri updater plugin requires AppHandle, so these stay on Tauri
// IPC. The daemon returns 501 for /v1/updater/check and /install.
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  return invoke('check_for_update');
}

export async function installUpdate(): Promise<void> {
  return invoke('install_update');
}

export async function getAppVersion(): Promise<string> {
  const r = await api.get<{ version: string }>('/v1/updater/version');
  return r.version;
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
  const qs = new URLSearchParams();
  if (eventTypes && eventTypes.length > 0) qs.set('types', eventTypes.join(','));
  if (limit !== undefined) qs.set('limit', String(limit));
  const tail = qs.toString();
  return api.get(`/v1/debug/events${tail ? `?${tail}` : ''}`);
}

export async function getDebugEventsSince(sinceMs: number): Promise<DebugEvent[]> {
  return api.get(`/v1/debug/events/since/${sinceMs}`);
}

export async function searchDebugEvents(query: string): Promise<DebugEvent[]> {
  return api.get(`/v1/debug/events/search?q=${encodeURIComponent(query)}`);
}

export async function pushDebugEvent(
  eventType: DebugEventType,
  label: string,
  data: Record<string, unknown>,
  durationMs?: number
): Promise<DebugEvent | null> {
  const r = await api.post<{ ok: boolean; event: DebugEvent | null }>(
    '/v1/debug/events',
    { event_type: eventType, label, data, duration_ms: durationMs },
  );
  return r.event;
}

export async function getDebugStatus(): Promise<DebugStatus> {
  return api.get('/v1/debug/status');
}

export async function pauseDebug(): Promise<boolean> {
  const r = await api.post<{ ok?: boolean; paused?: boolean }>('/v1/debug/pause');
  return r.paused === true || r.ok === true;
}

export async function resumeDebug(): Promise<boolean> {
  const r = await api.post<{ ok?: boolean; paused?: boolean }>('/v1/debug/resume');
  return r.paused === false || r.ok === true;
}

export async function clearDebugEvents(): Promise<void> {
  await api.del('/v1/debug/events');
}

// Gaze ANE types
export interface GazeSample {
  features: number[];
  targetX: number;
  targetY: number;
  timestamp: number;
}

export interface GazeTrainingStatus {
  sampleCount: number;
  newSampleCount: number;
  isTraining: boolean;
  trainLoss: number | null;
  modelReady: boolean;
  aneAvailable: boolean;
}

export interface GazePrediction {
  x: number;
  y: number;
  confidence: number;
  latencyUs: number;
}

// Gaze ANE commands
export async function submitGazeSample(sample: GazeSample): Promise<number> {
  const r = await api.post<{ count: number }>('/v1/gaze/sample', sample);
  return r.count;
}

export async function triggerGazeTraining(): Promise<boolean> {
  const r = await api.post<{ ok?: boolean; started?: boolean }>('/v1/gaze/training/trigger');
  return r.started === true || r.ok === true;
}

export async function predictGaze(features: number[]): Promise<GazePrediction> {
  return api.post('/v1/gaze/predict', { features });
}

export async function getGazeTrainingStatus(): Promise<GazeTrainingStatus> {
  return api.get('/v1/gaze/training-status');
}

export async function clearGazeModel(): Promise<void> {
  await api.del('/v1/gaze/model');
}

export async function loadGazeWeights(): Promise<boolean> {
  const r = await api.post<{ loaded?: boolean }>('/v1/gaze/load-weights');
  return r.loaded === true;
}
