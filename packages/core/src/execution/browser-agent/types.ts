/**
 * Browser Agent Types
 *
 * State-machine based browser automation with deterministic execution
 * and LLM fallback. Based on on-device-browser-agent architecture.
 *
 * Priority chain: State Machine (90%) → Rule Engine (8%) → LLM (2%)
 */

// ============================================================================
// State Machine Core
// ============================================================================

/** A state in the state machine */
export interface AgentState {
  id: string;
  /** Human-readable label */
  label: string;
  /** Entry action(s) to execute on entering this state */
  entryActions?: StateAction[];
  /** Conditions to check on state entry for validation */
  validationSelector?: string;
  /** Whether this is a terminal/final state */
  isFinal?: boolean;
  /** Whether this is the initial state */
  isInitial?: boolean;
  /** Maximum time (ms) to spend in this state before timeout */
  timeoutMs?: number;
}

/** A transition between states */
export interface StateTransition {
  id: string;
  /** Source state ID */
  from: string;
  /** Target state ID */
  to: string;
  /** What triggers this transition */
  trigger: TransitionTrigger;
  /** Guard condition (CSS selector that must exist) */
  guardSelector?: string;
  /** Guard condition (URL pattern that must match) */
  guardUrlPattern?: string;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Actions to execute during transition */
  actions?: StateAction[];
}

/** What triggers a transition */
export type TransitionTrigger =
  | { type: 'url_change'; pattern: string | RegExp }
  | { type: 'element_present'; selector: string }
  | { type: 'element_absent'; selector: string }
  | { type: 'dom_change'; selector?: string }
  | { type: 'timeout'; ms: number }
  | { type: 'event'; name: string }
  | { type: 'auto' };

/** An action to perform in a state or transition */
export interface StateAction {
  type: StateActionType;
  /** CSS selector for element-targeting actions */
  selector?: string;
  /** Value for type/fill actions */
  value?: string;
  /** URL for navigate actions */
  url?: string;
  /** Key for keyboard actions */
  key?: string;
  /** Wait time in ms */
  waitMs?: number;
  /** Template variable name (e.g., {{query}} becomes the user's search query) */
  templateVar?: string;
  /** Scroll direction */
  direction?: 'up' | 'down';
  /** Scroll amount in pixels */
  scrollAmount?: number;
  /** Description for logging */
  description?: string;
}

export type StateActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'fill'
  | 'press_key'
  | 'scroll'
  | 'wait'
  | 'wait_for_selector'
  | 'wait_for_url'
  | 'extract_text'
  | 'extract_links'
  | 'screenshot'
  | 'evaluate'
  | 'custom';

// ============================================================================
// State Machine Definition
// ============================================================================

/** Complete definition of a site-specific state machine */
export interface StateMachineDefinition {
  id: string;
  /** Human-readable name */
  name: string;
  /** Site domain(s) this machine handles */
  domains: string[];
  /** URL patterns to match (glob or regex) */
  urlPatterns: string[];
  /** Description of what this machine automates */
  description: string;
  /** Task types this machine can handle (e.g., 'search', 'purchase', 'play') */
  supportedTasks: string[];
  /** All states */
  states: AgentState[];
  /** All transitions */
  transitions: StateTransition[];
  /** Known obstacles for this site */
  obstacles?: ObstacleDefinition[];
  /** Template variables required (e.g., { query: 'search term' }) */
  requiredVariables: string[];
  /** Optional variables with defaults */
  optionalVariables?: Record<string, string>;
  /** Version of this machine definition */
  version: string;
}

// ============================================================================
// Obstacle Detection
// ============================================================================

/** Definition of a known obstacle (CAPTCHA, login wall, etc.) */
export interface ObstacleDefinition {
  id: string;
  type: ObstacleType;
  /** CSS selector(s) that indicate this obstacle is present */
  detectionSelectors: string[];
  /** URL patterns where this obstacle commonly appears */
  urlPatterns?: string[];
  /** Text patterns in page content */
  textPatterns?: string[];
  /** Whether user intervention is required */
  requiresUserAction: boolean;
  /** Auto-dismiss action if possible */
  dismissAction?: StateAction;
  /** Human-readable description for user notification */
  userMessage: string;
  /** Priority: higher priority obstacles are checked first */
  priority: number;
}

export type ObstacleType =
  | 'captcha'
  | 'login_wall'
  | 'cookie_consent'
  | 'age_gate'
  | 'paywall'
  | 'popup_overlay'
  | 'rate_limit'
  | 'bot_detection'
  | 'region_block'
  | 'other';

// ============================================================================
// DOM Snapshot & Change Detection
// ============================================================================

/** Lightweight DOM snapshot for change detection */
export interface DOMSnapshot {
  url: string;
  title: string;
  /** Hash of the full page content */
  contentHash: string;
  /** Hash of visible text only */
  textHash: string;
  /** Key element states (selector → exists/text/value) */
  elementStates: Record<string, ElementState>;
  /** Detected obstacles */
  obstacles: ObstacleType[];
  /** Timestamp */
  timestamp: number;
}

export interface ElementState {
  exists: boolean;
  text?: string;
  value?: string;
  visible?: boolean;
  checked?: boolean;
  href?: string;
}

/** Result of comparing two DOM snapshots */
export interface ChangeResult {
  /** Whether URL changed */
  urlChanged: boolean;
  /** Whether page content changed */
  contentChanged: boolean;
  /** Whether visible text changed */
  textChanged: boolean;
  /** Elements that changed state */
  changedElements: string[];
  /** New obstacles detected */
  newObstacles: ObstacleType[];
  /** Obstacles that were resolved */
  resolvedObstacles: ObstacleType[];
}

// ============================================================================
// Agent Context & Execution
// ============================================================================

/** Runtime context for the browser agent */
export interface AgentContext {
  /** Current task description from user */
  taskDescription: string;
  /** Task type (maps to StateMachineDefinition.supportedTasks) */
  taskType: string;
  /** Template variables resolved from task */
  variables: Record<string, string>;
  /** Current URL */
  currentUrl: string;
  /** Current state machine definition (if matched) */
  currentMachine?: StateMachineDefinition;
  /** Current state ID within the machine */
  currentStateId?: string;
  /** Previous state IDs (execution history) */
  stateHistory: string[];
  /** Extracted data so far */
  extractedData: Record<string, unknown>;
  /** Number of LLM fallback calls made */
  llmFallbackCount: number;
  /** Number of state machine transitions */
  transitionCount: number;
  /** Number of rule engine matches */
  ruleMatchCount: number;
  /** Start time */
  startedAt: number;
  /** Max execution time in ms */
  maxExecutionMs: number;
}

/** Result of executing a state machine */
export interface ExecutionResult {
  success: boolean;
  /** Final state reached */
  finalState: string;
  /** Extracted data */
  data: Record<string, unknown>;
  /** Execution metrics */
  metrics: ExecutionMetrics;
  /** Error if failed */
  error?: string;
  /** Whether user action was required */
  userActionRequired: boolean;
}

export interface ExecutionMetrics {
  /** Total execution time ms */
  totalMs: number;
  /** Number of state transitions */
  transitions: number;
  /** Number of LLM fallback calls */
  llmFallbacks: number;
  /** Number of rule engine matches */
  ruleMatches: number;
  /** Number of retries */
  retries: number;
  /** Number of obstacles encountered */
  obstaclesEncountered: number;
}

// ============================================================================
// Rule Engine
// ============================================================================

/** A rule for the fallback rule engine */
export interface AutomationRule {
  id: string;
  /** Human-readable name */
  name: string;
  /** Condition: CSS selector that must be present */
  conditionSelector?: string;
  /** Condition: URL must match this pattern */
  conditionUrlPattern?: string;
  /** Condition: page text must contain */
  conditionTextContains?: string;
  /** Action to take when condition matches */
  action: StateAction;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Domain(s) this rule applies to (empty = all) */
  domains?: string[];
}

// ============================================================================
// Events
// ============================================================================

/** Events emitted by the browser agent */
export interface BrowserAgentEvents {
  'state-changed': { from: string; to: string; machineId: string };
  'action-executed': { action: StateAction; success: boolean; duration: number };
  'obstacle-detected': { type: ObstacleType; message: string; requiresUser: boolean };
  'obstacle-resolved': { type: ObstacleType };
  'llm-fallback': { reason: string; stateId: string };
  'rule-matched': { ruleId: string; action: StateAction };
  'execution-complete': ExecutionResult;
  'user-action-required': { obstacle: ObstacleDefinition; context: AgentContext };
  'error': { message: string; stateId?: string; recoverable: boolean };
}

// ============================================================================
// Configuration
// ============================================================================

export interface BrowserAgentConfig {
  /** Maximum execution time per task (ms) */
  maxExecutionMs: number;
  /** Maximum retries for failed actions */
  maxRetries: number;
  /** Default wait between actions (ms) */
  actionDelayMs: number;
  /** Timeout for waiting for elements (ms) */
  elementTimeoutMs: number;
  /** Whether to take screenshots at each state */
  screenshotOnStateChange: boolean;
  /** Whether to enable LLM fallback */
  enableLLMFallback: boolean;
  /** Maximum LLM fallback calls per task */
  maxLLMFallbacks: number;
  /** DOM snapshot comparison interval (ms) */
  snapshotIntervalMs: number;
}

export const DEFAULT_BROWSER_AGENT_CONFIG: BrowserAgentConfig = {
  maxExecutionMs: 120_000, // 2 minutes
  maxRetries: 3,
  actionDelayMs: 500,
  elementTimeoutMs: 10_000,
  screenshotOnStateChange: false,
  enableLLMFallback: true,
  maxLLMFallbacks: 5,
  snapshotIntervalMs: 1000,
};
