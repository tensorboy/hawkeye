/**
 * Shadow HTTP client — the React app's only way to talk to the backend.
 *
 * Replaces the old `invoke()` IPC path. Every `useTauri.ts` function now
 * delegates here. The base URL + bearer token are bootstrapped once at
 * app startup via [`bootstrap`]; before that runs all calls will throw
 * with a clear "not bootstrapped" error.
 *
 * Endpoints under `/v1/*` come from the hawkeyed daemon (see HAWKEYED.md).
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core';

const DEFAULT_BASE = 'http://127.0.0.1:23789';

let baseUrl: string | null = null;
let token: string | null = null;
let bootstrapped: Promise<void> | null = null;

/**
 * Discover the daemon URL + token. Must be called (and awaited) once
 * before any other api.* call. Idempotent — subsequent calls reuse the
 * first promise.
 *
 * Order of resolution for `base`:
 *   1. `window.__HAWKEYE_API__` injected by Tauri webview init script
 *   2. `localStorage['hawkeyed_url']` (for non-Tauri / dev)
 *   3. `DEFAULT_BASE` (http://127.0.0.1:23789)
 *
 * Order of resolution for `token`:
 *   1. `window.__HAWKEYE_TOKEN__` injected by Tauri webview init script
 *   2. `localStorage['hawkeyed_token']` (for non-Tauri / dev)
 *   3. Tauri `get_daemon_token` IPC (last resort when running in webview
 *      but injection script didn't fire)
 */
export function bootstrap(): Promise<void> {
  if (bootstrapped) return bootstrapped;
  bootstrapped = (async () => {
    const w = window as unknown as { __HAWKEYE_API__?: string; __HAWKEYE_TOKEN__?: string };

    baseUrl = w.__HAWKEYE_API__ ?? localStorage.getItem('hawkeyed_url') ?? DEFAULT_BASE;

    token = w.__HAWKEYE_TOKEN__ ?? localStorage.getItem('hawkeyed_token') ?? null;
    if (!token) {
      try {
        token = await tauriInvoke<string>('get_daemon_token');
      } catch {
        // Non-Tauri (browser dev): caller has to set localStorage manually.
        token = null;
      }
    }
    // Keep dev-friendly: drop the token into localStorage so the Swagger
    // UI at /v1/docs picks it up automatically.
    if (token) localStorage.setItem('hawkeyed_token', token);
  })();
  return bootstrapped;
}

/** Get the current base URL (used by SSE etc). Throws if not bootstrapped. */
export function getBaseUrl(): string {
  if (!baseUrl) throw new Error('[api] not bootstrapped — await bootstrap() first');
  return baseUrl;
}

/** Get the current token. May be null if running without a daemon. */
export function getToken(): string | null {
  return token;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/** Re-fetch the daemon token from Tauri — heals a stale localStorage cache. */
async function refreshToken(): Promise<boolean> {
  try {
    const fresh = await tauriInvoke<string>('get_daemon_token');
    if (fresh && fresh !== token) {
      token = fresh;
      localStorage.setItem('hawkeyed_token', fresh);
      return true;
    }
  } catch {
    // Non-Tauri context — nothing to refresh from.
  }
  return false;
}

async function req<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  if (!baseUrl) {
    // Allow lazy bootstrap on first call so individual consumers don't
    // have to remember the dance. Tests will usually call bootstrap()
    // explicitly so this fallback rarely fires.
    await bootstrap();
  }
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const r = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 401 with a cached token usually means localStorage outlived a token
  // rotation — pull the authoritative token from Tauri and retry once.
  if (r.status === 401 && !retried) {
    if (await refreshToken()) {
      return req<T>(method, path, body, true);
    }
  }

  if (!r.ok) {
    let msg: string;
    try {
      const j = await r.json();
      msg = j.error ?? r.statusText;
    } catch {
      msg = r.statusText;
    }
    throw new ApiError(r.status, msg);
  }

  // Some routes return empty bodies; tolerate that.
  const text = await r.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

export const api = {
  get:  <T>(path: string) => req<T>('GET', path),
  post: <T>(path: string, body?: unknown) => req<T>('POST', path, body),
  put:  <T>(path: string, body?: unknown) => req<T>('PUT', path, body),
  del:  <T>(path: string) => req<T>('DELETE', path),
};

export { ApiError };
