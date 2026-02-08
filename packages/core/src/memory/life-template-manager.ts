/**
 * Life Template Manager
 *
 * Manages dynamic life templates that evolve based on daily activities.
 * Integrates multiple psychological frameworks for holistic personal development tracking.
 *
 * Features:
 * - Big Five personality tracking
 * - Freudian psychodynamic analysis
 * - Wheel of Life assessment
 * - Ikigai discovery
 * - Erikson stage progression
 * - Life narrative construction
 * - Automatic template evolution from daily activities
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { loguru } from '../debug';
import type {
  LifeTemplate,
  LifeTemplateConfig,
  LifeTemplateEvents,
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateSummary,
  TemplateSnapshot,
  DailyActivitySummary,
  BigFivePersonality,
  PsychodynamicProfile,
  WheelOfLife,
  WheelOfLifeCategory,
  EriksonStageNumber,
  AppCategory,
  DefenseMechanism,
} from './life-template-types';
import {
  DEFAULT_LIFE_TEMPLATE_CONFIG,
  ERIKSON_STAGES,
  WHEEL_CATEGORIES,
} from './life-template-types';

const logger = loguru.scope('LifeTemplateManager');

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate unique ID
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `lt_${timestamp}_${random}`;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function today(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Calculate Erikson stage from age
 */
function calculateEriksonStage(age: number): EriksonStageNumber {
  if (age < 1) return 1;
  if (age < 3) return 2;
  if (age < 6) return 3;
  if (age < 12) return 4;
  if (age < 18) return 5;
  if (age < 40) return 6;
  if (age < 65) return 7;
  return 8;
}

/**
 * Categorize app behavior impact
 */
function categorizeAppImpact(category: AppCategory): 'id' | 'ego' | 'superego' {
  switch (category) {
    case 'entertainment':
    case 'gaming':
    case 'shopping':
      return 'id';
    case 'productivity':
    case 'education':
    case 'work':
      return 'superego';
    default:
      return 'ego';
  }
}

/**
 * Map goal category to wheel category
 */
function mapGoalToWheelCategory(goalCategory: string): WheelOfLifeCategory {
  const mapping: Record<string, WheelOfLifeCategory> = {
    health: 'health',
    fitness: 'health',
    career: 'career',
    work: 'career',
    finance: 'finance',
    money: 'finance',
    social: 'relationships',
    friends: 'relationships',
    family: 'family',
    love: 'family',
    learning: 'personalGrowth',
    growth: 'personalGrowth',
    hobby: 'funRecreation',
    fun: 'funRecreation',
    home: 'physicalEnvironment',
    environment: 'physicalEnvironment',
  };
  return mapping[goalCategory.toLowerCase()] || 'personalGrowth';
}

// ============================================================================
// Life Template Manager Class
// ============================================================================

export class LifeTemplateManager extends EventEmitter {
  private config: LifeTemplateConfig;
  private templates: Map<string, LifeTemplate> = new Map();
  private initialized: boolean = false;

  constructor(config: Partial<LifeTemplateConfig> = {}) {
    super();
    this.config = { ...DEFAULT_LIFE_TEMPLATE_CONFIG, ...config };

    // Set default storage path if not provided
    if (!this.config.storagePath) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      this.config.storagePath = path.join(homeDir, '.hawkeye', 'life-templates');
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Initialize the manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing LifeTemplateManager');

    // Ensure storage directory exists
    if (!fs.existsSync(this.config.storagePath)) {
      fs.mkdirSync(this.config.storagePath, { recursive: true });
      logger.info(`Created storage directory: ${this.config.storagePath}`);
    }

    // Load existing templates
    await this.loadTemplates();

    this.initialized = true;
    logger.info(`LifeTemplateManager initialized with ${this.templates.size} templates`);
  }

  /**
   * Load templates from storage
   */
  private async loadTemplates(): Promise<void> {
    const files = fs.readdirSync(this.config.storagePath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(this.config.storagePath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const template = JSON.parse(content) as LifeTemplate;
        this.templates.set(template.id, template);
      } catch (error) {
        logger.warn(`Failed to load template from ${file}:`, error);
      }
    }
  }

  /**
   * Save template to storage
   */
  private async saveTemplate(template: LifeTemplate): Promise<void> {
    const filePath = path.join(this.config.storagePath, `${template.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(template, null, 2), 'utf-8');
  }

  // ============================================================================
  // Template CRUD Operations
  // ============================================================================

  /**
   * Create a new life template
   */
  async createTemplate(input: CreateTemplateInput): Promise<LifeTemplate> {
    const now = Date.now();
    const id = input.id || generateId();

    const template: LifeTemplate = {
      ...input,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
      evolutionHistory: [],
    };

    // Calculate Erikson stage if age is provided
    if (template.age && !template.erikson.currentStage) {
      template.erikson.currentStage = calculateEriksonStage(template.age);
      const stage = ERIKSON_STAGES[template.erikson.currentStage];
      template.erikson.coreConflict = stage.conflict;
    }

    this.templates.set(id, template);
    await this.saveTemplate(template);

    this.emit('template:created', template);
    logger.info(`Created template: ${id} for user: ${template.userId}`);

    return template;
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): LifeTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get template by user ID
   */
  getTemplateByUser(userId: string): LifeTemplate | undefined {
    for (const template of this.templates.values()) {
      if (template.userId === userId) {
        return template;
      }
    }
    return undefined;
  }

  /**
   * Update template
   */
  async updateTemplate(id: string, updates: UpdateTemplateInput): Promise<LifeTemplate | null> {
    const template = this.templates.get(id);
    if (!template) {
      logger.warn(`Template not found: ${id}`);
      return null;
    }

    const changes: string[] = [];

    // Track changes for events
    if (updates.personality) changes.push('personality');
    if (updates.psychodynamic) changes.push('psychodynamic');
    if (updates.wheelOfLife) changes.push('wheelOfLife');
    if (updates.ikigai) changes.push('ikigai');
    if (updates.erikson) changes.push('erikson');
    if (updates.narrative) changes.push('narrative');

    // Apply updates
    Object.assign(template, updates, {
      updatedAt: Date.now(),
    });

    await this.saveTemplate(template);

    this.emit('template:updated', template, changes);
    logger.info(`Updated template: ${id}, changes: ${changes.join(', ')}`);

    return template;
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const template = this.templates.get(id);
    if (!template) return false;

    this.templates.delete(id);

    const filePath = path.join(this.config.storagePath, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    logger.info(`Deleted template: ${id}`);
    return true;
  }

  /**
   * List all templates
   */
  listTemplates(): LifeTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template summary
   */
  getTemplateSummary(id: string): TemplateSummary | null {
    const template = this.templates.get(id);
    if (!template) return null;

    const wheelScores = Object.values(template.wheelOfLife);
    const overallBalance = wheelScores.reduce((a, b) => a + b, 0) / wheelScores.length;

    // Find dominant personality trait
    const personality = template.personality;
    const traits = Object.entries(personality) as [keyof BigFivePersonality, number][];
    const dominantTrait = traits.reduce((a, b) => (a[1] > b[1] ? a : b))[0];

    return {
      id: template.id,
      userId: template.userId,
      overallBalance,
      dominantTrait,
      currentEriksonStage: template.erikson.currentStage,
      ikigaiProgress: template.ikigai.discoveryProgress,
      lastUpdated: template.updatedAt,
    };
  }

  // ============================================================================
  // Daily Activity Integration
  // ============================================================================

  /**
   * Update template from daily activity
   * This is the core method that makes templates evolve
   */
  async updateFromDailyActivity(
    templateId: string,
    activity: DailyActivitySummary
  ): Promise<LifeTemplate | null> {
    const template = this.templates.get(templateId);
    if (!template) {
      logger.warn(`Template not found for daily update: ${templateId}`);
      return null;
    }

    logger.info(`Updating template ${templateId} from daily activity: ${activity.date}`);

    // 1. Update Psychodynamic Profile from app usage
    const psychodynamicUpdates = this.analyzePsychodynamics(activity);
    template.psychodynamic = {
      ...template.psychodynamic,
      ...psychodynamicUpdates,
    };

    // 2. Update Wheel of Life from completed goals
    for (const goal of activity.completedGoals) {
      const category = goal.category || mapGoalToWheelCategory(goal.goalName);
      const currentScore = template.wheelOfLife[category];
      const newScore = Math.min(100, currentScore + goal.impact);
      template.wheelOfLife[category] = newScore;

      // Check for milestones
      if (currentScore < 75 && newScore >= 75) {
        this.emit('milestone:reached', `Reached 75% in ${category}`, category);
      }
      if (currentScore < 90 && newScore >= 90) {
        this.emit('milestone:reached', `Reached 90% in ${category}`, category);
      }
    }

    // 3. Update personality traits based on behavior patterns
    const personalityUpdates = this.analyzePersonalityFromActivity(activity);
    template.personality = this.blendPersonality(template.personality, personalityUpdates);

    // 4. Add significant events to narrative
    if (activity.significantEvents.length > 0) {
      for (const event of activity.significantEvents) {
        template.narrative.selfDefiningMemories.push({
          id: generateId(),
          date: activity.date,
          description: event,
          emotion: this.inferEmotionFromMood(activity.moodEntries),
          lesson: '',  // To be filled by AI or user
          linkedGoals: activity.completedGoals.map(g => g.goalId),
        });
      }
    }

    // 5. Check if snapshot is needed
    const daysSinceLastSnapshot = this.daysSinceLastSnapshot(template);
    if (daysSinceLastSnapshot >= this.config.snapshotFrequencyDays) {
      await this.createSnapshot(template, activity);
    }

    // Update timestamp
    template.updatedAt = Date.now();

    await this.saveTemplate(template);
    this.emit('template:updated', template, ['psychodynamic', 'wheelOfLife', 'personality']);

    return template;
  }

  /**
   * Analyze psychodynamics from daily activity
   */
  private analyzePsychodynamics(activity: DailyActivitySummary): Partial<PsychodynamicProfile> {
    let idTime = 0;
    let egoTime = 0;
    let superegoTime = 0;

    for (const app of activity.appUsage) {
      const impact = categorizeAppImpact(app.category);
      switch (impact) {
        case 'id':
          idTime += app.durationMinutes;
          break;
        case 'superego':
          superegoTime += app.durationMinutes;
          break;
        default:
          egoTime += app.durationMinutes;
      }
    }

    const totalTime = idTime + egoTime + superegoTime || 1;

    // Calculate ratios
    const idDriveRatio = Math.round((idTime / totalTime) * 100);
    const superegoRatio = Math.round((superegoTime / totalTime) * 100);

    // Ego balance: Higher when there's good balance between id and superego
    const imbalance = Math.abs(idDriveRatio - superegoRatio);
    const egoBalanceScore = Math.max(0, 100 - imbalance);

    // Superego pressure: Based on work/productivity time and completion anxiety
    const superegoBase = superegoRatio;
    const moodPenalty = activity.moodEntries.some(m => m.mood === 'bad' || m.mood === 'terrible') ? 10 : 0;
    const superegoPressure = Math.min(100, superegoBase + moodPenalty);

    return {
      idDriveRatio,
      egoBalanceScore,
      superegoPressure,
    };
  }

  /**
   * Analyze personality traits from activity patterns
   */
  private analyzePersonalityFromActivity(activity: DailyActivitySummary): Partial<BigFivePersonality> {
    const updates: Partial<BigFivePersonality> = {};

    // Conscientiousness: Based on productivity and goal completion
    if (activity.productivityScore > 70) {
      updates.conscientiousness = 5;  // Small positive adjustment
    } else if (activity.productivityScore < 30) {
      updates.conscientiousness = -2;  // Small negative adjustment
    }

    // Openness: Based on variety of activities
    const uniqueCategories = new Set(activity.appUsage.map(a => a.category));
    if (uniqueCategories.size >= 5) {
      updates.openness = 3;
    }

    // Extraversion: Based on communication app usage
    const socialTime = activity.appUsage
      .filter(a => a.category === 'social' || a.category === 'communication')
      .reduce((sum, a) => sum + a.durationMinutes, 0);
    if (socialTime > 60) {
      updates.extraversion = 2;
    }

    return updates;
  }

  /**
   * Blend personality updates (gradual change)
   */
  private blendPersonality(
    current: BigFivePersonality,
    updates: Partial<BigFivePersonality>
  ): BigFivePersonality {
    const result = { ...current };
    const blendFactor = 0.05;  // 5% influence per update

    for (const [key, delta] of Object.entries(updates)) {
      const trait = key as keyof BigFivePersonality;
      if (typeof delta === 'number') {
        const newValue = current[trait] + (delta * blendFactor);
        result[trait] = Math.max(0, Math.min(100, newValue));
      }
    }

    return result;
  }

  /**
   * Infer emotion from mood entries
   */
  private inferEmotionFromMood(moodEntries: DailyActivitySummary['moodEntries']): string {
    if (moodEntries.length === 0) return 'neutral';

    const moodScores = { great: 2, good: 1, okay: 0, bad: -1, terrible: -2 };
    const avgMood = moodEntries.reduce((sum, m) => sum + moodScores[m.mood], 0) / moodEntries.length;

    if (avgMood > 1) return 'joy';
    if (avgMood > 0) return 'contentment';
    if (avgMood < -1) return 'distress';
    if (avgMood < 0) return 'frustration';
    return 'neutral';
  }

  /**
   * Calculate days since last snapshot
   */
  private daysSinceLastSnapshot(template: LifeTemplate): number {
    if (template.evolutionHistory.length === 0) {
      return this.config.snapshotFrequencyDays;  // Trigger first snapshot
    }

    const lastSnapshot = template.evolutionHistory[template.evolutionHistory.length - 1];
    const lastDate = new Date(lastSnapshot.date);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Create evolution snapshot
   */
  private async createSnapshot(
    template: LifeTemplate,
    activity: DailyActivitySummary
  ): Promise<void> {
    const snapshot: TemplateSnapshot = {
      date: today(),
      wheelOfLifeScores: { ...template.wheelOfLife },
      personalityShifts: {},
      psychodynamicChanges: {
        idDriveRatio: template.psychodynamic.idDriveRatio,
        egoBalanceScore: template.psychodynamic.egoBalanceScore,
        superegoPressure: template.psychodynamic.superegoPressure,
      },
      significantEvents: activity.significantEvents,
      insights: [],
    };

    // Compare with previous snapshot for personality shifts
    if (template.evolutionHistory.length > 0) {
      // Calculate shifts (would need previous personality stored)
      // For now, just record current state
    }

    // Trim history if needed
    while (template.evolutionHistory.length >= this.config.maxSnapshots) {
      template.evolutionHistory.shift();
    }

    template.evolutionHistory.push(snapshot);
    template.version += 1;

    this.emit('snapshot:created', snapshot);
    logger.info(`Created snapshot for template ${template.id}, version ${template.version}`);
  }

  // ============================================================================
  // Wheel of Life Operations
  // ============================================================================

  /**
   * Update wheel of life category
   */
  async updateWheelCategory(
    templateId: string,
    category: WheelOfLifeCategory,
    score: number
  ): Promise<LifeTemplate | null> {
    const template = this.templates.get(templateId);
    if (!template) return null;

    const oldScore = template.wheelOfLife[category];
    template.wheelOfLife[category] = Math.max(0, Math.min(100, score));
    template.updatedAt = Date.now();

    await this.saveTemplate(template);

    // Check milestones
    if (oldScore < 75 && score >= 75) {
      this.emit('milestone:reached', `Reached 75% in ${category}`, category);
    }

    return template;
  }

  /**
   * Get wheel of life balance score
   */
  getWheelBalance(templateId: string): number {
    const template = this.templates.get(templateId);
    if (!template) return 0;

    const scores = Object.values(template.wheelOfLife);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Balance score: penalize for high standard deviation
    return Math.max(0, 100 - stdDev);
  }

  /**
   * Get wheel of life recommendations
   */
  getWheelRecommendations(templateId: string): { category: WheelOfLifeCategory; priority: number; message: string }[] {
    const template = this.templates.get(templateId);
    if (!template) return [];

    const recommendations: { category: WheelOfLifeCategory; priority: number; message: string }[] = [];

    // Find lowest scoring categories
    const entries = Object.entries(template.wheelOfLife) as [WheelOfLifeCategory, number][];
    const sorted = entries.sort((a, b) => a[1] - b[1]);

    for (const [category, score] of sorted.slice(0, 3)) {
      const meta = WHEEL_CATEGORIES.find(c => c.id === category);
      if (meta && score < 50) {
        recommendations.push({
          category,
          priority: 50 - score,
          message: `${meta.icon} ${meta.label} needs attention (${score}%)`,
        });
      }
    }

    return recommendations;
  }

  // ============================================================================
  // Ikigai Operations
  // ============================================================================

  /**
   * Add item to Ikigai quadrant
   */
  async addIkigaiItem(
    templateId: string,
    quadrant: 'whatYouLove' | 'whatYoureGoodAt' | 'whatWorldNeeds' | 'whatYouCanBePaidFor',
    item: string
  ): Promise<LifeTemplate | null> {
    const template = this.templates.get(templateId);
    if (!template) return null;

    if (!template.ikigai[quadrant].includes(item)) {
      template.ikigai[quadrant].push(item);
      template.ikigai.discoveryProgress = this.calculateIkigaiProgress(template.ikigai);
      template.updatedAt = Date.now();

      await this.saveTemplate(template);
    }

    return template;
  }

  /**
   * Calculate Ikigai discovery progress
   */
  private calculateIkigaiProgress(ikigai: LifeTemplate['ikigai']): number {
    const quadrants = [
      ikigai.whatYouLove,
      ikigai.whatYoureGoodAt,
      ikigai.whatWorldNeeds,
      ikigai.whatYouCanBePaidFor,
    ];

    // Progress based on items in each quadrant (max 5 per quadrant = 100%)
    let progress = 0;
    for (const q of quadrants) {
      progress += Math.min(5, q.length) * 5;  // 5 points per item, max 25 per quadrant
    }

    return Math.min(100, progress);
  }

  // ============================================================================
  // Factory Function
  // ============================================================================

  /**
   * Create a default template for a new user
   */
  createDefaultTemplate(userId: string, age?: number): CreateTemplateInput {
    const eriksonStage = age ? calculateEriksonStage(age) : 6;  // Default to young adult
    const stage = ERIKSON_STAGES[eriksonStage];

    return {
      userId,
      age,
      personality: {
        openness: 50,
        conscientiousness: 50,
        extraversion: 50,
        agreeableness: 50,
        neuroticism: 50,
      },
      psychodynamic: {
        idDriveRatio: 33,
        egoBalanceScore: 50,
        superegoPressure: 33,
        defenseMechanisms: [],
      },
      wheelOfLife: {
        health: 50,
        career: 50,
        finance: 50,
        relationships: 50,
        family: 50,
        personalGrowth: 50,
        funRecreation: 50,
        physicalEnvironment: 50,
      },
      ikigai: {
        whatYouLove: [],
        whatYoureGoodAt: [],
        whatWorldNeeds: [],
        whatYouCanBePaidFor: [],
        intersections: [],
        discoveryProgress: 0,
      },
      erikson: {
        currentStage: eriksonStage,
        coreConflict: stage.conflict,
        virtueProgress: 50,
        positiveIndicators: [],
        negativeIndicators: [],
      },
      narrative: {
        chapters: [],
        turningPoints: [],
        themes: [],
        selfDefiningMemories: [],
        coherenceScore: 0,
      },
    };
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let instance: LifeTemplateManager | null = null;

/**
 * Get the singleton instance
 */
export function getLifeTemplateManager(): LifeTemplateManager | null {
  return instance;
}

/**
 * Set the singleton instance
 */
export function setLifeTemplateManager(manager: LifeTemplateManager): void {
  instance = manager;
}

/**
 * Create and initialize a new manager
 */
export async function createLifeTemplateManager(
  config?: Partial<LifeTemplateConfig>
): Promise<LifeTemplateManager> {
  const manager = new LifeTemplateManager(config);
  await manager.initialize();
  instance = manager;
  return manager;
}
