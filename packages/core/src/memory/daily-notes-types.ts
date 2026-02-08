/**
 * Daily Notes Types
 *
 * Type definitions for DailyNotesManager.
 * Inspired by nanobot's daily notes system.
 */

// ============================================================================
// Daily Note Types
// ============================================================================

/**
 * Section identifiers for daily notes
 */
export type DailyNoteSectionId =
  | 'activities'
  | 'insights'
  | 'todos'
  | 'notes'
  | 'goals'
  | 'reflections';

/**
 * Daily note sections
 */
export interface DailyNoteSections {
  /**
   * Activities section - auto-generated from behavior tracking
   */
  activities?: string;

  /**
   * Insights section - AI-generated insights
   */
  insights?: string;

  /**
   * Todos section - pending tasks
   */
  todos?: string;

  /**
   * Notes section - user notes
   */
  notes?: string;

  /**
   * Goals section - daily goals from Life Tree
   */
  goals?: string;

  /**
   * Reflections section - end of day reflections
   */
  reflections?: string;

  /**
   * Custom sections
   */
  [key: string]: string | undefined;
}

/**
 * Daily note metadata
 */
export interface DailyNoteMetadata {
  /**
   * Creation timestamp
   */
  createdAt: number;

  /**
   * Last update timestamp
   */
  updatedAt: number;

  /**
   * Word count
   */
  wordCount: number;

  /**
   * Linked episodic memory IDs
   */
  linkedMemories: string[];

  /**
   * Tags extracted from content
   */
  tags: string[];

  /**
   * Mood/sentiment (optional)
   */
  mood?: 'positive' | 'neutral' | 'negative';

  /**
   * Productivity score (0-100)
   */
  productivityScore?: number;
}

/**
 * Daily note
 */
export interface DailyNote {
  /**
   * Date in YYYY-MM-DD format
   */
  date: string;

  /**
   * File path
   */
  path: string;

  /**
   * Raw content
   */
  content: string;

  /**
   * Parsed sections
   */
  sections: DailyNoteSections;

  /**
   * Metadata
   */
  metadata: DailyNoteMetadata;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * DailyNotes configuration
 */
export interface DailyNotesConfig {
  /**
   * Whether the service is enabled
   * @default true
   */
  enabled: boolean;

  /**
   * Directory for daily notes
   * @default ~/.hawkeye/notes/
   */
  directory: string;

  /**
   * File name pattern (supports {date} placeholder)
   * @default {date}.md
   */
  filePattern: string;

  /**
   * Auto-create today's note on first access
   * @default true
   */
  autoCreate: boolean;

  /**
   * Auto-generate daily summary
   * @default true
   */
  autoSummarize: boolean;

  /**
   * Retention period in days
   * @default 365
   */
  retentionDays: number;

  /**
   * Default template for new notes
   */
  template?: string;

  /**
   * Sections to include in auto-generated notes
   */
  sections: DailyNoteSectionId[];
}

/**
 * Default DailyNotes configuration
 */
export const DEFAULT_DAILY_NOTES_CONFIG: DailyNotesConfig = {
  enabled: true,
  directory: '',  // Will be set to ~/.hawkeye/notes/
  filePattern: '{date}.md',
  autoCreate: true,
  autoSummarize: true,
  retentionDays: 365,
  sections: ['activities', 'insights', 'todos', 'notes'],
};

// ============================================================================
// Event Types
// ============================================================================

/**
 * DailyNotes events
 */
export interface DailyNotesEvents {
  'note:created': (note: DailyNote) => void;
  'note:updated': (note: DailyNote) => void;
  'note:deleted': (date: string) => void;
  'memory:linked': (date: string, memoryId: string) => void;
  'summary:generated': (date: string, summary: string) => void;
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Search options for daily notes
 */
export interface DailyNotesSearchOptions {
  /**
   * Date range [start, end] in YYYY-MM-DD format
   */
  dateRange?: [string, string];

  /**
   * Search keywords
   */
  keywords?: string[];

  /**
   * Filter by tags
   */
  tags?: string[];

  /**
   * Filter by mood
   */
  mood?: 'positive' | 'neutral' | 'negative';

  /**
   * Maximum results
   */
  limit?: number;
}

/**
 * Search result
 */
export interface DailyNotesSearchResult {
  note: DailyNote;
  relevance: number;
  matchedSections: string[];
  matchedKeywords: string[];
}

// ============================================================================
// Template Types
// ============================================================================

/**
 * Default daily note template
 */
export const DEFAULT_DAILY_NOTE_TEMPLATE = `# {date}

## 📊 Activities
<!-- Auto-generated from behavior tracking -->

## 💡 Insights
<!-- AI-generated insights -->

## ✅ Todos
- [ ]

## 📝 Notes
<!-- User notes -->
`;

/**
 * Template variables
 */
export interface TemplateVariables {
  date: string;
  weekday: string;
  week: number;
  month: string;
  year: number;
}
