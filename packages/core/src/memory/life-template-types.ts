/**
 * Life Template Types
 *
 * Type definitions for the dynamic Life Template system.
 * Integrates multiple psychological and philosophical frameworks:
 * - Freud's Structural Model (Id, Ego, Superego)
 * - Erikson's Psychosocial Stages
 * - Big Five Personality Traits (OCEAN)
 * - Wheel of Life Assessment
 * - Ikigai (Japanese Life Purpose)
 * - McAdams' Life Narrative Identity
 *
 * Inspired by research from:
 * - zien2/LifeTree (GitHub)
 * - Stanford Life Design Lab
 * - Quantified Self movement
 */

// ============================================================================
// Big Five Personality (OCEAN Model)
// ============================================================================

/**
 * Big Five personality traits
 * Each dimension scored 0-100
 */
export interface BigFivePersonality {
  /**
   * Openness to Experience
   * High: Creative, curious, open to new ideas
   * Low: Practical, conventional, prefers routine
   */
  openness: number;

  /**
   * Conscientiousness
   * High: Organized, disciplined, goal-oriented
   * Low: Flexible, spontaneous, carefree
   */
  conscientiousness: number;

  /**
   * Extraversion
   * High: Outgoing, energetic, talkative
   * Low: Reserved, solitary, introspective
   */
  extraversion: number;

  /**
   * Agreeableness
   * High: Cooperative, trusting, helpful
   * Low: Competitive, skeptical, challenging
   */
  agreeableness: number;

  /**
   * Neuroticism (Emotional Stability inverse)
   * High: Anxious, moody, emotionally reactive
   * Low: Calm, stable, emotionally resilient
   */
  neuroticism: number;
}

// ============================================================================
// Freudian Psychodynamic Model
// ============================================================================

/**
 * Freud's structural model of the psyche
 * Tracks behavioral tendencies based on psychodynamic theory
 */
export interface PsychodynamicProfile {
  /**
   * Id Drive Ratio (0-100)
   * Percentage of behavior driven by pleasure-seeking/instant gratification
   * Calculated from entertainment, gaming, social media usage
   */
  idDriveRatio: number;

  /**
   * Ego Balance Score (0-100)
   * How well the ego mediates between id and superego
   * Higher = better reality-based decision making
   */
  egoBalanceScore: number;

  /**
   * Superego Pressure (0-100)
   * Level of self-imposed moral/perfectionist pressure
   * Calculated from work hours, goal completion anxiety
   */
  superegoPressure: number;

  /**
   * Defense Mechanisms observed
   * Patterns detected from behavior analysis
   */
  defenseMechanisms: DefenseMechanism[];
}

/**
 * Common defense mechanisms (Freud/Anna Freud)
 */
export type DefenseMechanism =
  | 'denial'           // Refusing to accept reality
  | 'repression'       // Pushing uncomfortable thoughts away
  | 'projection'       // Attributing own feelings to others
  | 'displacement'     // Redirecting emotions to safer target
  | 'rationalization'  // Creating logical explanations for irrational behavior
  | 'sublimation'      // Channeling impulses into acceptable activities
  | 'regression'       // Reverting to earlier behavior patterns
  | 'intellectualization'; // Using abstract thinking to avoid emotions

// ============================================================================
// Erikson's Psychosocial Development
// ============================================================================

/**
 * Erikson's 8 stages of psychosocial development
 */
export type EriksonStageNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Erikson stage information
 */
export interface EriksonStage {
  /**
   * Stage number (1-8)
   */
  stage: EriksonStageNumber;

  /**
   * Stage name
   */
  name: string;

  /**
   * Age range
   */
  ageRange: string;

  /**
   * Core conflict to resolve
   */
  conflict: string;

  /**
   * Positive outcome (virtue)
   */
  virtue: string;

  /**
   * Negative outcome (maladaptation)
   */
  maladaptation: string;
}

/**
 * User's Erikson stage progress
 */
export interface EriksonProgress {
  /**
   * Current stage (determined by age or manual override)
   */
  currentStage: EriksonStageNumber;

  /**
   * Core conflict being faced
   */
  coreConflict: string;

  /**
   * Progress toward virtue (0-100)
   */
  virtueProgress: number;

  /**
   * Evidence of positive resolution
   */
  positiveIndicators: string[];

  /**
   * Warning signs of negative resolution
   */
  negativeIndicators: string[];
}

/**
 * Erikson stages reference data
 */
export const ERIKSON_STAGES: Record<EriksonStageNumber, EriksonStage> = {
  1: {
    stage: 1,
    name: 'Infancy',
    ageRange: '0-1',
    conflict: 'Trust vs Mistrust',
    virtue: 'Hope',
    maladaptation: 'Withdrawal',
  },
  2: {
    stage: 2,
    name: 'Early Childhood',
    ageRange: '1-3',
    conflict: 'Autonomy vs Shame/Doubt',
    virtue: 'Will',
    maladaptation: 'Compulsion',
  },
  3: {
    stage: 3,
    name: 'Play Age',
    ageRange: '3-6',
    conflict: 'Initiative vs Guilt',
    virtue: 'Purpose',
    maladaptation: 'Inhibition',
  },
  4: {
    stage: 4,
    name: 'School Age',
    ageRange: '6-12',
    conflict: 'Industry vs Inferiority',
    virtue: 'Competence',
    maladaptation: 'Inertia',
  },
  5: {
    stage: 5,
    name: 'Adolescence',
    ageRange: '12-18',
    conflict: 'Identity vs Role Confusion',
    virtue: 'Fidelity',
    maladaptation: 'Repudiation',
  },
  6: {
    stage: 6,
    name: 'Young Adulthood',
    ageRange: '18-40',
    conflict: 'Intimacy vs Isolation',
    virtue: 'Love',
    maladaptation: 'Exclusivity',
  },
  7: {
    stage: 7,
    name: 'Middle Adulthood',
    ageRange: '40-65',
    conflict: 'Generativity vs Stagnation',
    virtue: 'Care',
    maladaptation: 'Rejectivity',
  },
  8: {
    stage: 8,
    name: 'Late Adulthood',
    ageRange: '65+',
    conflict: 'Integrity vs Despair',
    virtue: 'Wisdom',
    maladaptation: 'Disdain',
  },
};

// ============================================================================
// Wheel of Life Assessment
// ============================================================================

/**
 * Wheel of Life categories
 * 8 core life dimensions, each scored 0-100
 */
export interface WheelOfLife {
  /**
   * Physical health, fitness, energy levels
   */
  health: number;

  /**
   * Career satisfaction, professional growth
   */
  career: number;

  /**
   * Financial stability, savings, investments
   */
  finance: number;

  /**
   * Friendships, social connections, community
   */
  relationships: number;

  /**
   * Family bonds, home life, partner relationship
   */
  family: number;

  /**
   * Learning, self-improvement, personal development
   */
  personalGrowth: number;

  /**
   * Hobbies, leisure, recreation, fun
   */
  funRecreation: number;

  /**
   * Living space, physical environment, surroundings
   */
  physicalEnvironment: number;
}

/**
 * Wheel of Life category identifiers
 */
export type WheelOfLifeCategory = keyof WheelOfLife;

/**
 * Category metadata
 */
export interface WheelCategoryMeta {
  id: WheelOfLifeCategory;
  label: string;
  description: string;
  icon: string;
  color: string;
}

/**
 * Wheel of Life category metadata
 */
export const WHEEL_CATEGORIES: WheelCategoryMeta[] = [
  {
    id: 'health',
    label: 'Health & Fitness',
    description: 'Physical health, exercise, nutrition, sleep, energy',
    icon: '💪',
    color: '#4CAF50',
  },
  {
    id: 'career',
    label: 'Career & Work',
    description: 'Job satisfaction, professional development, impact',
    icon: '💼',
    color: '#2196F3',
  },
  {
    id: 'finance',
    label: 'Finance & Wealth',
    description: 'Income, savings, investments, financial security',
    icon: '💰',
    color: '#FFC107',
  },
  {
    id: 'relationships',
    label: 'Relationships',
    description: 'Friendships, social connections, community',
    icon: '👥',
    color: '#E91E63',
  },
  {
    id: 'family',
    label: 'Family & Love',
    description: 'Partner, children, parents, home life',
    icon: '❤️',
    color: '#F44336',
  },
  {
    id: 'personalGrowth',
    label: 'Personal Growth',
    description: 'Learning, self-improvement, spiritual development',
    icon: '🌱',
    color: '#9C27B0',
  },
  {
    id: 'funRecreation',
    label: 'Fun & Recreation',
    description: 'Hobbies, leisure, entertainment, creativity',
    icon: '🎨',
    color: '#FF9800',
  },
  {
    id: 'physicalEnvironment',
    label: 'Environment',
    description: 'Living space, physical surroundings, nature',
    icon: '🏠',
    color: '#795548',
  },
];

// ============================================================================
// Ikigai (Japanese Life Purpose)
// ============================================================================

/**
 * Ikigai - Japanese concept of life purpose
 * Intersection of 4 elements
 */
export interface Ikigai {
  /**
   * Things you love doing (passion)
   */
  whatYouLove: string[];

  /**
   * Things you're skilled at (profession)
   */
  whatYoureGoodAt: string[];

  /**
   * Things the world needs (mission)
   */
  whatWorldNeeds: string[];

  /**
   * Things you can be paid for (vocation)
   */
  whatYouCanBePaidFor: string[];

  /**
   * Discovered intersections
   */
  intersections: IkigaiIntersection[];

  /**
   * Overall discovery progress (0-100)
   */
  discoveryProgress: number;
}

/**
 * Ikigai intersection types
 */
export type IkigaiIntersectionType =
  | 'passion'       // Love + Good At
  | 'mission'       // Love + World Needs
  | 'profession'    // Good At + Paid For
  | 'vocation';     // World Needs + Paid For

/**
 * Discovered Ikigai intersection
 */
export interface IkigaiIntersection {
  type: IkigaiIntersectionType;
  description: string;
  confidence: number;  // 0-100
  discoveredAt: number;
}

// ============================================================================
// Life Narrative (McAdams Theory)
// ============================================================================

/**
 * Life narrative - the story of one's life
 */
export interface LifeNarrative {
  /**
   * Key life chapters identified
   */
  chapters: LifeChapter[];

  /**
   * Significant turning points
   */
  turningPoints: TurningPoint[];

  /**
   * Core themes in the narrative
   */
  themes: NarrativeTheme[];

  /**
   * Self-defining memories
   */
  selfDefiningMemories: SelfDefiningMemory[];

  /**
   * Narrative coherence score (0-100)
   */
  coherenceScore: number;
}

/**
 * Life chapter
 */
export interface LifeChapter {
  id: string;
  title: string;
  dateRange: [string, string];  // [start, end] in YYYY-MM-DD
  summary: string;
  mood: 'positive' | 'negative' | 'mixed' | 'neutral';
  significance: number;  // 0-100
}

/**
 * Life turning point
 */
export interface TurningPoint {
  id: string;
  date: string;
  description: string;
  category: 'career' | 'relationship' | 'health' | 'personal' | 'spiritual' | 'other';
  impact: 'transformative' | 'significant' | 'moderate';
  linkedChapters: string[];
}

/**
 * Narrative theme
 */
export interface NarrativeTheme {
  name: string;
  description: string;
  frequency: number;  // How often it appears
  sentiment: 'positive' | 'negative' | 'neutral';
}

/**
 * Self-defining memory
 */
export interface SelfDefiningMemory {
  id: string;
  date: string;
  description: string;
  emotion: string;
  lesson: string;
  linkedGoals: string[];
}

// ============================================================================
// Life Template (Main Type)
// ============================================================================

/**
 * Complete Life Template
 * Dynamic template that evolves based on daily activities
 */
export interface LifeTemplate {
  /**
   * Unique template ID
   */
  id: string;

  /**
   * User ID
   */
  userId: string;

  /**
   * Template version (increments on major changes)
   */
  version: number;

  /**
   * Big Five personality profile
   */
  personality: BigFivePersonality;

  /**
   * Freudian psychodynamic profile
   */
  psychodynamic: PsychodynamicProfile;

  /**
   * Wheel of Life scores
   */
  wheelOfLife: WheelOfLife;

  /**
   * Ikigai discovery progress
   */
  ikigai: Ikigai;

  /**
   * Erikson developmental stage
   */
  erikson: EriksonProgress;

  /**
   * Life narrative
   */
  narrative: LifeNarrative;

  /**
   * User's age (for Erikson stage calculation)
   */
  age?: number;

  /**
   * User's birth date (optional, for precise age)
   */
  birthDate?: string;

  /**
   * Template creation timestamp
   */
  createdAt: number;

  /**
   * Last update timestamp
   */
  updatedAt: number;

  /**
   * Evolution history (snapshots over time)
   */
  evolutionHistory: TemplateSnapshot[];
}

/**
 * Template snapshot for tracking evolution
 */
export interface TemplateSnapshot {
  /**
   * Snapshot date
   */
  date: string;

  /**
   * Wheel of Life scores at this time
   */
  wheelOfLifeScores: Record<WheelOfLifeCategory, number>;

  /**
   * Personality shifts detected
   */
  personalityShifts: Partial<BigFivePersonality>;

  /**
   * Psychodynamic changes
   */
  psychodynamicChanges: Partial<PsychodynamicProfile>;

  /**
   * Significant events that triggered this snapshot
   */
  significantEvents: string[];

  /**
   * AI-generated insights
   */
  insights: string[];
}

// ============================================================================
// Daily Activity Analysis
// ============================================================================

/**
 * Daily activity summary for template updates
 */
export interface DailyActivitySummary {
  /**
   * Date
   */
  date: string;

  /**
   * App usage breakdown by category
   */
  appUsage: AppUsageEntry[];

  /**
   * Goals completed today
   */
  completedGoals: CompletedGoal[];

  /**
   * Mood entries
   */
  moodEntries: MoodEntry[];

  /**
   * Significant events detected
   */
  significantEvents: string[];

  /**
   * Total active time in minutes
   */
  activeTimeMinutes: number;

  /**
   * Productivity score (0-100)
   */
  productivityScore: number;
}

/**
 * App usage entry
 */
export interface AppUsageEntry {
  appName: string;
  category: AppCategory;
  durationMinutes: number;
  sessions: number;
}

/**
 * App categories for psychodynamic analysis
 */
export type AppCategory =
  | 'productivity'    // Superego-driven
  | 'education'       // Superego-driven
  | 'work'            // Superego-driven
  | 'communication'   // Ego-balanced
  | 'utilities'       // Ego-balanced
  | 'health'          // Ego-balanced
  | 'entertainment'   // Id-driven
  | 'social'          // Id-driven (depends on context)
  | 'gaming'          // Id-driven
  | 'shopping'        // Id-driven
  | 'other';

/**
 * Completed goal entry
 */
export interface CompletedGoal {
  goalId: string;
  goalName: string;
  category: WheelOfLifeCategory;
  impact: number;  // Impact on wheel score (positive delta)
  completedAt: number;
}

/**
 * Mood entry
 */
export interface MoodEntry {
  timestamp: number;
  mood: 'great' | 'good' | 'okay' | 'bad' | 'terrible';
  note?: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Life Template Manager configuration
 */
export interface LifeTemplateConfig {
  /**
   * Whether the service is enabled
   * @default true
   */
  enabled: boolean;

  /**
   * Storage path for templates
   * @default ~/.hawkeye/life-templates/
   */
  storagePath: string;

  /**
   * Auto-update template from daily activities
   * @default true
   */
  autoUpdate: boolean;

  /**
   * Snapshot frequency in days
   * @default 7 (weekly)
   */
  snapshotFrequencyDays: number;

  /**
   * Maximum snapshots to keep
   * @default 52 (1 year of weekly snapshots)
   */
  maxSnapshots: number;

  /**
   * Enable AI-powered insights
   * @default true
   */
  enableAIInsights: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_LIFE_TEMPLATE_CONFIG: LifeTemplateConfig = {
  enabled: true,
  storagePath: '',  // Will be set to ~/.hawkeye/life-templates/
  autoUpdate: true,
  snapshotFrequencyDays: 7,
  maxSnapshots: 52,
  enableAIInsights: true,
};

// ============================================================================
// Events
// ============================================================================

/**
 * Life Template events
 */
export interface LifeTemplateEvents {
  'template:created': (template: LifeTemplate) => void;
  'template:updated': (template: LifeTemplate, changes: string[]) => void;
  'snapshot:created': (snapshot: TemplateSnapshot) => void;
  'insight:generated': (insight: string) => void;
  'milestone:reached': (milestone: string, category: WheelOfLifeCategory) => void;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Input for creating a new template
 */
export type CreateTemplateInput = Omit<LifeTemplate, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'evolutionHistory'> & {
  id?: string;
};

/**
 * Input for updating a template
 */
export type UpdateTemplateInput = Partial<Omit<LifeTemplate, 'id' | 'userId' | 'createdAt'>>;

/**
 * Template summary for quick display
 */
export interface TemplateSummary {
  id: string;
  userId: string;
  overallBalance: number;  // Average of wheel scores
  dominantTrait: keyof BigFivePersonality;
  currentEriksonStage: EriksonStageNumber;
  ikigaiProgress: number;
  lastUpdated: number;
}
