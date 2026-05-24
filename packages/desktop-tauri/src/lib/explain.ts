/**
 * Look-to-Explain helpers — orchestrate the hotkey → daemon → overlay flow.
 *
 * Architecture: Tauri global-shortcut plugin fires on the main window, the
 * `useExplain` hook (mounted once in App.tsx) catches it, reads the latest
 * gaze position from the store, POSTs `/v1/explain` to the hawkeyed daemon,
 * then opens the secondary `explain-overlay` window at the gaze point and
 * sends the rendered HTML payload via window-scoped emit.
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { api } from './api';

export type ExplainMode = 'dictionary' | 'troubleshoot' | 'scene';

export interface ExplainResponse {
  ok: boolean;
  html: string;
  mode: ExplainMode;
  anchor: { x: number; y: number };
  cropSize: { w: number; h: number };
  ocrText: string;
  durationMs: number;
}

/** POST to /v1/explain — the daemon does crop + OCR + AI. */
export async function fetchExplain(
  x: number,
  y: number,
  mode: ExplainMode,
): Promise<ExplainResponse> {
  return api.post<ExplainResponse>('/v1/explain', { x, y, mode });
}

const OVERLAY_LABEL = 'explain-overlay';
const OVERLAY_W = 380;
const OVERLAY_H = 260;
const EDGE_PADDING = 20;

/**
 * Show the overlay window near `(x, y)`, then push the response payload to it.
 *
 * Tauri 2's per-window event scope ensures only the overlay's React app
 * receives `explain:render`; the main window's listeners do not fire.
 */
export async function showExplainOverlay(resp: ExplainResponse): Promise<void> {
  const overlay = await WebviewWindow.getByLabel(OVERLAY_LABEL);
  if (!overlay) {
    console.error('[explain] overlay window not found — was it declared in tauri.conf.json?');
    return;
  }

  // Edge-flip: if the natural anchor (x+20, y+20) would push the window
  // off-screen, snap to the opposite side of the gaze point.
  const screenW = window.screen?.width ?? 1920;
  const screenH = window.screen?.height ?? 1080;
  let px = resp.anchor.x + EDGE_PADDING;
  let py = resp.anchor.y + EDGE_PADDING;
  if (px + OVERLAY_W > screenW) px = resp.anchor.x - OVERLAY_W - EDGE_PADDING;
  if (py + OVERLAY_H > screenH) py = resp.anchor.y - OVERLAY_H - EDGE_PADDING;
  px = Math.max(0, px);
  py = Math.max(0, py);

  await overlay.setSize(new LogicalSize(OVERLAY_W, OVERLAY_H));
  await overlay.setPosition(new LogicalPosition(px, py));
  await overlay.show();

  // The overlay listens for this on its own window scope.
  await overlay.emit('explain:render', resp);
}
