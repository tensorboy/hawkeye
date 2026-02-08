/**
 * Chat DB — IndexedDB storage for chat sessions and agent events
 *
 * Stores chat sessions with their events for the side panel.
 * Sessions survive extension restart. Configurable retention (default 30 days).
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { ChatSession, AgentEvent, AgentTask } from '../agents/types';
import { generateId } from '../agents/types';

const DB_NAME = 'hawkeye-chat';
const DB_VERSION = 1;

const STORES = {
  sessions: 'sessions',
  events: 'events',
} as const;

export class ChatDB {
  private db: IDBPDatabase | null = null;
  private retentionDays: number;

  constructor(retentionDays = 30) {
    this.retentionDays = retentionDays;
  }

  /** Open the database connection */
  async open(): Promise<void> {
    if (this.db) return;

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Sessions store
        if (!db.objectStoreNames.contains(STORES.sessions)) {
          const sessionStore = db.createObjectStore(STORES.sessions, { keyPath: 'id' });
          sessionStore.createIndex('updatedAt', 'updatedAt');
          sessionStore.createIndex('archived', 'archived');
        }

        // Events store
        if (!db.objectStoreNames.contains(STORES.events)) {
          const eventStore = db.createObjectStore(STORES.events, { keyPath: 'id' });
          eventStore.createIndex('sessionId', 'sessionId');
          eventStore.createIndex('timestamp', 'timestamp');
          eventStore.createIndex('role', 'role');
        }
      },
    });
  }

  /** Close the database connection */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ============================================================================
  // Sessions
  // ============================================================================

  /** Create a new chat session */
  async createSession(title?: string, originUrl?: string): Promise<ChatSession> {
    await this.ensureOpen();
    const now = Date.now();

    const session: ChatSession = {
      id: generateId(),
      title: title || `Session ${new Date(now).toLocaleString()}`,
      createdAt: now,
      updatedAt: now,
      events: [],
      originUrl,
      archived: false,
    };

    await this.db!.put(STORES.sessions, session);
    return session;
  }

  /** Get a session by ID (with events loaded) */
  async getSession(sessionId: string): Promise<ChatSession | undefined> {
    await this.ensureOpen();
    const session = await this.db!.get(STORES.sessions, sessionId);
    if (!session) return undefined;

    // Load events for session
    const events = await this.getEventsForSession(sessionId);
    session.events = events;
    return session;
  }

  /** List all sessions (without events, sorted by updatedAt desc) */
  async listSessions(options?: {
    includeArchived?: boolean;
    limit?: number;
  }): Promise<ChatSession[]> {
    await this.ensureOpen();

    const sessions: ChatSession[] = [];
    const tx = this.db!.transaction(STORES.sessions, 'readonly');
    const store = tx.objectStore(STORES.sessions);
    const index = store.index('updatedAt');

    let cursor = await index.openCursor(null, 'prev'); // Newest first

    while (cursor) {
      const session = cursor.value as ChatSession;

      // Filter archived
      if (!options?.includeArchived && session.archived) {
        cursor = await cursor.continue();
        continue;
      }

      // Don't include events in list (for performance)
      sessions.push({ ...session, events: [] });

      if (options?.limit && sessions.length >= options.limit) break;
      cursor = await cursor.continue();
    }

    return sessions;
  }

  /** Update a session's metadata */
  async updateSession(
    sessionId: string,
    updates: Partial<Pick<ChatSession, 'title' | 'archived' | 'activeTask'>>
  ): Promise<void> {
    await this.ensureOpen();
    const session = await this.db!.get(STORES.sessions, sessionId);
    if (!session) return;

    const updated = { ...session, ...updates, updatedAt: Date.now() };
    await this.db!.put(STORES.sessions, updated);
  }

  /** Delete a session and its events */
  async deleteSession(sessionId: string): Promise<void> {
    await this.ensureOpen();

    // Use a single transaction covering both stores for atomicity
    const tx = this.db!.transaction([STORES.events, STORES.sessions], 'readwrite');

    // Delete events
    const eventStore = tx.objectStore(STORES.events);
    const index = eventStore.index('sessionId');
    let cursor = await index.openCursor(IDBKeyRange.only(sessionId));

    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    // Delete session within the same transaction
    tx.objectStore(STORES.sessions).delete(sessionId);

    await tx.done;
  }

  // ============================================================================
  // Events
  // ============================================================================

  /** Add an event to a session */
  async addEvent(event: AgentEvent): Promise<void> {
    await this.ensureOpen();

    // Use a single transaction covering both stores for atomicity
    const tx = this.db!.transaction([STORES.events, STORES.sessions], 'readwrite');
    await tx.objectStore(STORES.events).put(event);

    // Update session's updatedAt within the same transaction
    const session = await tx.objectStore(STORES.sessions).get(event.sessionId);
    if (session) {
      session.updatedAt = event.timestamp;
      await tx.objectStore(STORES.sessions).put(session);
    }

    await tx.done;
  }

  /** Add multiple events in a batch */
  async addEvents(events: AgentEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.ensureOpen();

    const tx = this.db!.transaction([STORES.events, STORES.sessions], 'readwrite');

    for (const event of events) {
      await tx.objectStore(STORES.events).put(event);
    }

    // Update session updatedAt to the latest event timestamp
    const lastEvent = events[events.length - 1];
    const session = await tx.objectStore(STORES.sessions).get(lastEvent.sessionId);
    if (session) {
      session.updatedAt = lastEvent.timestamp;
      await tx.objectStore(STORES.sessions).put(session);
    }

    await tx.done;
  }

  /** Get events for a session */
  async getEventsForSession(
    sessionId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<AgentEvent[]> {
    await this.ensureOpen();
    const events: AgentEvent[] = [];
    const tx = this.db!.transaction(STORES.events, 'readonly');
    const index = tx.objectStore(STORES.events).index('sessionId');
    let cursor = await index.openCursor(IDBKeyRange.only(sessionId));

    let skipped = 0;
    while (cursor) {
      if (options?.offset && skipped < options.offset) {
        skipped++;
        cursor = await cursor.continue();
        continue;
      }

      events.push(cursor.value as AgentEvent);

      if (options?.limit && events.length >= options.limit) break;
      cursor = await cursor.continue();
    }

    // Sort by timestamp
    events.sort((a, b) => a.timestamp - b.timestamp);
    return events;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /** Delete sessions older than retention period */
  async cleanupOldSessions(): Promise<number> {
    await this.ensureOpen();
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const oldSessions = await this.listSessions({ includeArchived: true });
    let deleted = 0;

    for (const session of oldSessions) {
      if (session.updatedAt < cutoff) {
        await this.deleteSession(session.id);
        deleted++;
      }
    }

    return deleted;
  }

  /** Get database stats */
  async getStats(): Promise<{ sessionCount: number; eventCount: number }> {
    await this.ensureOpen();
    const sessionCount = await this.db!.count(STORES.sessions);
    const eventCount = await this.db!.count(STORES.events);
    return { sessionCount, eventCount };
  }

  // ============================================================================
  // Internal
  // ============================================================================

  private async ensureOpen(): Promise<void> {
    if (!this.db) {
      await this.open();
    }
  }
}
