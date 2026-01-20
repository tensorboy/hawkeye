/**
 * Chrome Extension Types
 */

export interface TaskSuggestion {
  id: string;
  title: string;
  description: string;
  type: 'navigate' | 'extract' | 'summarize' | 'search' | 'action';
  confidence: number;
  timestamp: number;
  actions?: TaskAction[];
}

export interface TaskAction {
  type: string;
  params: Record<string, unknown>;
}

export interface PageContext {
  url: string;
  title: string;
  content: string;
  selection?: string;
}
