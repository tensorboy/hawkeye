/**
 * useTauriEvent — subscribe to a backend event by name.
 *
 * (Kept the legacy name to avoid touching ~25 callers.) Backed by a single
 * shared `EventSource` connection to the hawkeyed daemon's `/v1/events`
 * SSE stream — multiple subscribers all dispatch off the same socket.
 *
 * `open-settings` is a special case: it's emitted directly by the Tauri
 * tray menu and doesn't go through the daemon's broadcast bus, so we fall
 * back to native Tauri events for that name. Everything else flows through
 * the daemon.
 */

import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { bootstrap, getBaseUrl, getToken } from '../lib/api';

const TAURI_ONLY_EVENTS = new Set(['open-settings']);

// ── Shared SSE singleton ──────────────────────────────────────────────
// One EventSource per app instance. Browsers cap concurrent SSE streams
// per origin (~6), so we MUST share — every useTauriEvent hook adds an
// addEventListener / removeEventListener pair on this single source.
let sharedSource: EventSource | null = null;
let sharedSourceReady: Promise<EventSource> | null = null;

function getSharedSource(): Promise<EventSource> {
  if (sharedSourceReady) return sharedSourceReady;
  sharedSourceReady = (async () => {
    await bootstrap();
    const base = getBaseUrl();
    const token = getToken();
    // Token via query string — EventSource can't send headers.
    // server.rs promotes ?token= to an Authorization header.
    const url = token
      ? `${base}/v1/events?token=${encodeURIComponent(token)}`
      : `${base}/v1/events`;

    const es = new EventSource(url);
    es.onerror = (e) => {
      // Browser auto-reconnects; just log so we can tell if the daemon
      // went away. Don't tear down — subscribers stay attached.
      console.warn('[useTauriEvent] SSE error (auto-reconnecting):', e);
    };
    sharedSource = es;
    return es;
  })();
  return sharedSourceReady;
}

export function useTauriEvent<T>(eventName: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    // Tauri-native events (tray menu, etc.) bypass the daemon.
    if (TAURI_ONLY_EVENTS.has(eventName)) {
      let unlistenFn: (() => void) | undefined;
      listen<T>(eventName, (event) => {
        handlerRef.current(event.payload);
      }).then((fn) => {
        if (cancelled) fn();
        else unlistenFn = fn;
      });
      return () => {
        cancelled = true;
        unlistenFn?.();
      };
    }

    // Everything else: SSE from the daemon.
    getSharedSource().then((es) => {
      if (cancelled) return;
      const listener = (e: MessageEvent) => {
        // SSE data frames are JSON-encoded by the daemon. Some payloads
        // (like /v1/agent/tool-call-end events with empty body) come
        // through as empty strings — guard against those.
        try {
          const data = e.data ? JSON.parse(e.data) : null;
          handlerRef.current(data as T);
        } catch (err) {
          console.warn(`[useTauriEvent] bad SSE frame for ${eventName}:`, err);
        }
      };
      es.addEventListener(eventName, listener as EventListener);
      cleanup = () => es.removeEventListener(eventName, listener as EventListener);
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [eventName]);
}

/** Close the shared SSE connection. Used by tests; production code should
 *  let the browser tear it down on page unload. */
export function closeSharedEventSource(): void {
  sharedSource?.close();
  sharedSource = null;
  sharedSourceReady = null;
}
