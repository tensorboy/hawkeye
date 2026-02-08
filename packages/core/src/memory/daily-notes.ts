/**
 * DailyNotesManager
 *
 * Manages daily notes organized by date.
 * Inspired by nanobot's daily notes system.
 *
 * Features:
 * - Automatic daily note creation
 * - Section-based organization
 * - Integration with Episodic Memory
 * - Search and retrieval
 * - Daily summary generation
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { loguru } from '../debug';
import type {
  DailyNote,
  DailyNoteMetadata,
  DailyNoteSections,
  DailyNotesConfig,
  DailyNotesEvents,
  DailyNotesSearchOptions,
  DailyNotesSearchResult,
  DailyNoteSectionId,
  TemplateVariables,
} from './daily-notes-types';
import {
  DEFAULT_DAILY_NOTES_CONFIG,
  DEFAULT_DAILY_NOTE_TEMPLATE,
} from './daily-notes-types';

const logger = loguru.scope('DailyNotes');

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get today's date in YYYY-MM-DD format
 */
function today(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get weekday name
 */
function getWeekday(date: Date): string {
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return weekdays[date.getDay()];
}

/**
 * Get month name
 */
function getMonthName(date: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return months[date.getMonth()];
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Extract tags from content (words starting with #)
 */
function extractTags(content: string): string[] {
  const tagRegex = /#(\w+)/g;
  const tags = new Set<string>();
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    tags.add(match[1].toLowerCase());
  }
  return Array.from(tags);
}

// ============================================================================
// DailyNotesManager Class
// ============================================================================

/**
 * DailyNotesManager - Manages daily notes
 */
export class DailyNotesManager extends EventEmitter {
  private config: DailyNotesConfig;
  private cache: Map<string, DailyNote> = new Map();

  // Callbacks for external integrations
  private getEpisodicMemoriesCallback?: (ids: string[]) => Promise<unknown[]>;
  private generateSummaryCallback?: (date: string, activities: unknown[]) => Promise<string>;

  constructor(config: Partial<DailyNotesConfig> = {}) {
    super();
    this.config = { ...DEFAULT_DAILY_NOTES_CONFIG, ...config };

    // Ensure directory exists
    if (this.config.directory && this.config.enabled) {
      this.ensureDirectory();
    }
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Ensure notes directory exists
   */
  private ensureDirectory(): void {
    if (!this.config.directory) return;

    try {
      if (!fs.existsSync(this.config.directory)) {
        fs.mkdirSync(this.config.directory, { recursive: true });
        logger.info(`Created notes directory: ${this.config.directory}`);
      }
    } catch (error) {
      logger.error('Failed to create notes directory:', error);
    }
  }

  // ============================================================================
  // Public API - Read Operations
  // ============================================================================

  /**
   * Get today's note
   */
  async getToday(): Promise<DailyNote | null> {
    return this.getNote(today());
  }

  /**
   * Get note for a specific date
   */
  async getNote(date: string): Promise<DailyNote | null> {
    // Check cache
    if (this.cache.has(date)) {
      return this.cache.get(date)!;
    }

    const filePath = this.getNotePath(date);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // Auto-create today's note if enabled
      if (this.config.autoCreate && date === today()) {
        return this.createNote(date);
      }
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const note = this.parseNote(date, filePath, content);

      // Cache the note
      this.cache.set(date, note);

      return note;
    } catch (error) {
      logger.error(`Failed to read note for ${date}:`, error);
      return null;
    }
  }

  /**
   * Get recent notes
   */
  async getRecentNotes(days: number = 7): Promise<DailyNote[]> {
    const notes: DailyNote[] = [];
    const todayDate = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(todayDate);
      date.setDate(date.getDate() - i);
      const dateStr = formatDate(date);

      const note = await this.getNote(dateStr);
      if (note) {
        notes.push(note);
      }
    }

    return notes;
  }

  /**
   * List all available notes
   */
  async listNotes(): Promise<string[]> {
    if (!this.config.directory || !fs.existsSync(this.config.directory)) {
      return [];
    }

    try {
      const files = fs.readdirSync(this.config.directory);
      const datePattern = /^(\d{4}-\d{2}-\d{2})\.md$/;

      return files
        .filter(f => datePattern.test(f))
        .map(f => f.replace('.md', ''))
        .sort()
        .reverse();
    } catch (error) {
      logger.error('Failed to list notes:', error);
      return [];
    }
  }

  // ============================================================================
  // Public API - Write Operations
  // ============================================================================

  /**
   * Create a new note for a date
   */
  async createNote(date: string): Promise<DailyNote> {
    const filePath = this.getNotePath(date);
    const content = this.generateTemplate(date);

    try {
      // Ensure directory exists
      this.ensureDirectory();

      // Write file
      fs.writeFileSync(filePath, content, 'utf-8');

      const note = this.parseNote(date, filePath, content);
      this.cache.set(date, note);

      logger.info(`Created note for ${date}`);
      this.emit('note:created', note);

      return note;
    } catch (error) {
      logger.error(`Failed to create note for ${date}:`, error);
      throw error;
    }
  }

  /**
   * Append content to today's note
   */
  async appendToday(content: string, section?: DailyNoteSectionId): Promise<void> {
    const date = today();
    let note = await this.getNote(date);

    if (!note) {
      note = await this.createNote(date);
    }

    await this.appendToNote(date, content, section);
  }

  /**
   * Append content to a specific note
   */
  async appendToNote(date: string, content: string, section?: DailyNoteSectionId): Promise<void> {
    let note = await this.getNote(date);

    if (!note) {
      if (this.config.autoCreate) {
        note = await this.createNote(date);
      } else {
        throw new Error(`Note for ${date} does not exist`);
      }
    }

    let newContent: string;

    if (section) {
      // Append to specific section
      newContent = this.appendToSection(note.content, section, content);
    } else {
      // Append to end of file
      newContent = note.content.trimEnd() + '\n\n' + content;
    }

    // Write updated content
    fs.writeFileSync(note.path, newContent, 'utf-8');

    // Update cache
    const updatedNote = this.parseNote(date, note.path, newContent);
    this.cache.set(date, updatedNote);

    logger.debug(`Appended to note ${date}${section ? ` (section: ${section})` : ''}`);
    this.emit('note:updated', updatedNote);
  }

  /**
   * Update note sections
   */
  async updateNote(date: string, updates: Partial<DailyNoteSections>): Promise<void> {
    let note = await this.getNote(date);

    if (!note) {
      throw new Error(`Note for ${date} does not exist`);
    }

    let newContent = note.content;

    for (const [sectionId, sectionContent] of Object.entries(updates)) {
      if (sectionContent !== undefined) {
        newContent = this.updateSection(newContent, sectionId as DailyNoteSectionId, sectionContent);
      }
    }

    // Write updated content
    fs.writeFileSync(note.path, newContent, 'utf-8');

    // Update cache
    const updatedNote = this.parseNote(date, note.path, newContent);
    this.cache.set(date, updatedNote);

    logger.debug(`Updated note ${date}`);
    this.emit('note:updated', updatedNote);
  }

  /**
   * Delete a note
   */
  async deleteNote(date: string): Promise<boolean> {
    const filePath = this.getNotePath(date);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      fs.unlinkSync(filePath);
      this.cache.delete(date);

      logger.info(`Deleted note for ${date}`);
      this.emit('note:deleted', date);

      return true;
    } catch (error) {
      logger.error(`Failed to delete note for ${date}:`, error);
      return false;
    }
  }

  // ============================================================================
  // Public API - Summary and Analysis
  // ============================================================================

  /**
   * Generate daily summary
   */
  async generateDailySummary(date?: string): Promise<string> {
    const targetDate = date ?? today();
    const note = await this.getNote(targetDate);

    if (!note) {
      return `No note found for ${targetDate}`;
    }

    // If callback is set, use it for AI-generated summary
    if (this.generateSummaryCallback && note.metadata.linkedMemories.length > 0) {
      try {
        const summary = await this.generateSummaryCallback(targetDate, note.metadata.linkedMemories);

        // Save summary to insights section
        await this.appendToNote(targetDate, summary, 'insights');

        this.emit('summary:generated', targetDate, summary);
        return summary;
      } catch (error) {
        logger.error('Failed to generate AI summary:', error);
      }
    }

    // Fallback: generate basic summary from content
    return this.generateBasicSummary(note);
  }

  /**
   * Search notes
   */
  async searchNotes(query: string, options?: DailyNotesSearchOptions): Promise<DailyNotesSearchResult[]> {
    const results: DailyNotesSearchResult[] = [];
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

    // Get all note dates
    let dates = await this.listNotes();

    // Apply date range filter
    if (options?.dateRange) {
      const [start, end] = options.dateRange;
      dates = dates.filter(d => d >= start && d <= end);
    }

    // Apply limit
    const limit = options?.limit ?? 50;

    for (const date of dates) {
      if (results.length >= limit) break;

      const note = await this.getNote(date);
      if (!note) continue;

      // Apply tag filter
      if (options?.tags && options.tags.length > 0) {
        const hasTag = options.tags.some(t => note.metadata.tags.includes(t.toLowerCase()));
        if (!hasTag) continue;
      }

      // Apply mood filter
      if (options?.mood && note.metadata.mood !== options.mood) {
        continue;
      }

      // Search content
      const contentLower = note.content.toLowerCase();
      const matchedKeywords = keywords.filter(k => contentLower.includes(k));

      if (matchedKeywords.length === 0 && keywords.length > 0) {
        continue;
      }

      // Calculate relevance
      const relevance = keywords.length > 0
        ? matchedKeywords.length / keywords.length
        : 1;

      // Find matched sections
      const matchedSections: string[] = [];
      for (const [sectionId, sectionContent] of Object.entries(note.sections)) {
        if (sectionContent && keywords.some(k => sectionContent.toLowerCase().includes(k))) {
          matchedSections.push(sectionId);
        }
      }

      results.push({
        note,
        relevance,
        matchedSections,
        matchedKeywords,
      });
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);

    return results;
  }

  // ============================================================================
  // Public API - Memory Integration
  // ============================================================================

  /**
   * Link an episodic memory to a note
   */
  async linkMemory(date: string, memoryId: string): Promise<void> {
    const note = await this.getNote(date);
    if (!note) {
      logger.warn(`Cannot link memory: note for ${date} does not exist`);
      return;
    }

    if (!note.metadata.linkedMemories.includes(memoryId)) {
      note.metadata.linkedMemories.push(memoryId);

      // Persist linked memories to file
      const newContent = this.saveLinkedMemories(note.path, note.content, note.metadata.linkedMemories);
      fs.writeFileSync(note.path, newContent, 'utf-8');

      // Update note content and cache
      note.content = newContent;
      this.cache.set(date, note);

      logger.debug(`Linked memory ${memoryId} to note ${date}`);
      this.emit('memory:linked', date, memoryId);
    }
  }

  /**
   * Get linked memories for a note
   */
  async getLinkedMemories(date: string): Promise<unknown[]> {
    const note = await this.getNote(date);
    if (!note || note.metadata.linkedMemories.length === 0) {
      return [];
    }

    if (this.getEpisodicMemoriesCallback) {
      return this.getEpisodicMemoriesCallback(note.metadata.linkedMemories);
    }

    return note.metadata.linkedMemories;
  }

  // ============================================================================
  // Public API - Cleanup
  // ============================================================================

  /**
   * Cleanup old notes beyond retention period
   */
  async cleanup(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    const cutoffStr = formatDate(cutoffDate);

    let removedCount = 0;
    const dates = await this.listNotes();

    for (const date of dates) {
      if (date < cutoffStr) {
        const deleted = await this.deleteNote(date);
        if (deleted) {
          removedCount++;
        }
      }
    }

    if (removedCount > 0) {
      logger.info(`Cleaned up ${removedCount} old notes`);
    }

    return removedCount;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ============================================================================
  // Callback Setters
  // ============================================================================

  /**
   * Set callback for getting episodic memories
   */
  setGetEpisodicMemories(callback: (ids: string[]) => Promise<unknown[]>): void {
    this.getEpisodicMemoriesCallback = callback;
  }

  /**
   * Set callback for generating summaries
   */
  setGenerateSummary(callback: (date: string, activities: unknown[]) => Promise<string>): void {
    this.generateSummaryCallback = callback;
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Get file path for a date
   */
  private getNotePath(date: string): string {
    const filename = this.config.filePattern.replace('{date}', date);
    return path.join(this.config.directory, filename);
  }

  /**
   * Generate template for a new note
   */
  private generateTemplate(date: string): string {
    const template = this.config.template ?? DEFAULT_DAILY_NOTE_TEMPLATE;
    const d = parseDate(date);

    const variables: TemplateVariables = {
      date,
      weekday: getWeekday(d),
      week: getWeekNumber(d),
      month: getMonthName(d),
      year: d.getFullYear(),
    };

    let content = template;
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }

    return content;
  }

  /**
   * Parse note content into structured object
   */
  private parseNote(date: string, filePath: string, content: string): DailyNote {
    const sections = this.parseSections(content);
    const tags = extractTags(content);
    const wordCount = countWords(content);

    // Get file stats for timestamps
    let createdAt = Date.now();
    let updatedAt = Date.now();

    try {
      const stats = fs.statSync(filePath);
      createdAt = stats.birthtime.getTime();
      updatedAt = stats.mtime.getTime();
    } catch {
      // Ignore stat errors
    }

    // Extract linked memories from metadata comment in file
    const linkedMemories = this.extractLinkedMemories(content);

    const metadata: DailyNoteMetadata = {
      createdAt,
      updatedAt,
      wordCount,
      linkedMemories,
      tags,
    };

    return {
      date,
      path: filePath,
      content,
      sections,
      metadata,
    };
  }

  /**
   * Extract linked memories from metadata comment
   */
  private extractLinkedMemories(content: string): string[] {
    const metadataMatch = content.match(/<!--\s*hawkeye-metadata:\s*({[^}]+})\s*-->/);
    if (metadataMatch) {
      try {
        const metadata = JSON.parse(metadataMatch[1]);
        return Array.isArray(metadata.linkedMemories) ? metadata.linkedMemories : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Save linked memories to metadata comment in file
   */
  private saveLinkedMemories(filePath: string, content: string, linkedMemories: string[]): string {
    const metadataComment = `<!-- hawkeye-metadata: ${JSON.stringify({ linkedMemories })} -->`;

    // Remove existing metadata comment
    const cleanContent = content.replace(/\n?<!--\s*hawkeye-metadata:[^>]+-->\n?/g, '');

    // Append new metadata comment at the end
    return cleanContent.trimEnd() + '\n\n' + metadataComment + '\n';
  }

  /**
   * Parse sections from content
   */
  private parseSections(content: string): DailyNoteSections {
    const sections: DailyNoteSections = {};
    const lines = content.split('\n');

    let currentSection: string | null = null;
    let currentContent: string[] = [];

    const sectionPattern = /^##\s+(.+)$/;

    for (const line of lines) {
      const match = line.match(sectionPattern);

      if (match) {
        // Save previous section
        if (currentSection) {
          sections[this.normalizeSectionId(currentSection)] = currentContent.join('\n').trim();
        }

        // Start new section
        currentSection = match[1];
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentSection) {
      sections[this.normalizeSectionId(currentSection)] = currentContent.join('\n').trim();
    }

    return sections;
  }

  /**
   * Normalize section header to ID
   */
  private normalizeSectionId(header: string): string {
    // Remove emoji and normalize
    const cleaned = header.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();

    const mapping: Record<string, DailyNoteSectionId> = {
      'activities': 'activities',
      'insights': 'insights',
      'todos': 'todos',
      'todo': 'todos',
      'tasks': 'todos',
      'notes': 'notes',
      'goals': 'goals',
      'reflections': 'reflections',
      'reflection': 'reflections',
    };

    const normalized = cleaned.toLowerCase();
    return mapping[normalized] ?? normalized;
  }

  /**
   * Append content to a specific section
   */
  private appendToSection(content: string, sectionId: DailyNoteSectionId, newContent: string): string {
    const lines = content.split('\n');
    const sectionPattern = /^##\s+(.+)$/;

    // Find section header patterns
    const sectionHeaders: Record<string, string[]> = {
      activities: ['Activities', '📊 Activities'],
      insights: ['Insights', '💡 Insights'],
      todos: ['Todos', '✅ Todos', 'Tasks'],
      notes: ['Notes', '📝 Notes'],
      goals: ['Goals', '🎯 Goals'],
      reflections: ['Reflections', '🌙 Reflections'],
    };

    const possibleHeaders = sectionHeaders[sectionId] ?? [sectionId];
    let insertIndex = -1;
    let nextSectionIndex = lines.length;

    // Find the section
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(sectionPattern);
      if (match) {
        const header = match[1].replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
        if (possibleHeaders.some(h => header.toLowerCase() === h.toLowerCase())) {
          insertIndex = i + 1;

          // Find next section
          for (let j = i + 1; j < lines.length; j++) {
            if (sectionPattern.test(lines[j])) {
              nextSectionIndex = j;
              break;
            }
          }
          break;
        }
      }
    }

    if (insertIndex === -1) {
      // Section not found, append to end
      return content.trimEnd() + '\n\n## ' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1) + '\n' + newContent;
    }

    // Insert before next section (or end)
    lines.splice(nextSectionIndex, 0, '', newContent);

    return lines.join('\n');
  }

  /**
   * Update a specific section
   */
  private updateSection(content: string, sectionId: DailyNoteSectionId, newContent: string): string {
    const lines = content.split('\n');
    const sectionPattern = /^##\s+(.+)$/;

    const sectionHeaders: Record<string, string[]> = {
      activities: ['Activities', '📊 Activities'],
      insights: ['Insights', '💡 Insights'],
      todos: ['Todos', '✅ Todos', 'Tasks'],
      notes: ['Notes', '📝 Notes'],
      goals: ['Goals', '🎯 Goals'],
      reflections: ['Reflections', '🌙 Reflections'],
    };

    const possibleHeaders = sectionHeaders[sectionId] ?? [sectionId];
    let sectionStart = -1;
    let sectionEnd = lines.length;

    // Find the section
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(sectionPattern);
      if (match) {
        const header = match[1].replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
        if (possibleHeaders.some(h => header.toLowerCase() === h.toLowerCase())) {
          sectionStart = i;

          // Find next section
          for (let j = i + 1; j < lines.length; j++) {
            if (sectionPattern.test(lines[j])) {
              sectionEnd = j;
              break;
            }
          }
          break;
        }
      }
    }

    if (sectionStart === -1) {
      // Section not found, append
      return content.trimEnd() + '\n\n## ' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1) + '\n' + newContent;
    }

    // Replace section content
    const before = lines.slice(0, sectionStart + 1);
    const after = lines.slice(sectionEnd);

    return [...before, newContent, '', ...after].join('\n');
  }

  /**
   * Generate basic summary from note content
   */
  private generateBasicSummary(note: DailyNote): string {
    const parts: string[] = [];

    parts.push(`# Summary for ${note.date}`);
    parts.push('');

    if (note.sections.activities) {
      parts.push('## Activities');
      parts.push(this.summarizeSection(note.sections.activities));
      parts.push('');
    }

    if (note.sections.todos) {
      const { completed, pending } = this.parseTodos(note.sections.todos);
      parts.push('## Tasks');
      parts.push(`- Completed: ${completed}`);
      parts.push(`- Pending: ${pending}`);
      parts.push('');
    }

    parts.push(`Word count: ${note.metadata.wordCount}`);
    if (note.metadata.tags.length > 0) {
      parts.push(`Tags: ${note.metadata.tags.join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Summarize a section (first few lines)
   */
  private summarizeSection(content: string): string {
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('<!--'));
    return lines.slice(0, 3).join('\n') + (lines.length > 3 ? '\n...' : '');
  }

  /**
   * Parse todo items
   */
  private parseTodos(content: string): { completed: number; pending: number } {
    const completedPattern = /^[-*]\s+\[x\]/gim;
    const pendingPattern = /^[-*]\s+\[\s\]/gim;

    const completed = (content.match(completedPattern) || []).length;
    const pending = (content.match(pendingPattern) || []).length;

    return { completed, pending };
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<{
    totalNotes: number;
    oldestDate: string | null;
    newestDate: string | null;
    totalWordCount: number;
    averageWordCount: number;
  }> {
    const dates = await this.listNotes();

    if (dates.length === 0) {
      return {
        totalNotes: 0,
        oldestDate: null,
        newestDate: null,
        totalWordCount: 0,
        averageWordCount: 0,
      };
    }

    let totalWordCount = 0;

    for (const date of dates) {
      const note = await this.getNote(date);
      if (note) {
        totalWordCount += note.metadata.wordCount;
      }
    }

    return {
      totalNotes: dates.length,
      oldestDate: dates[dates.length - 1],
      newestDate: dates[0],
      totalWordCount,
      averageWordCount: Math.round(totalWordCount / dates.length),
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a DailyNotesManager instance
 */
export function createDailyNotesManager(config?: Partial<DailyNotesConfig>): DailyNotesManager {
  return new DailyNotesManager(config);
}
