/**
 * ExplainCard — the floating HTML card shown in the explain-overlay window.
 *
 * Listens for `explain:render` (window-scoped, sent by `lib/explain.ts` in
 * the main window) and renders the AI-returned HTML. Close button hides
 * the window (reused across requests, never destroyed).
 */

import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { ExplainResponse, ExplainMode } from '../lib/explain';
import './ExplainCard.css';

const MODE_LABEL: Record<ExplainMode, string> = {
  dictionary: '📚 词典',
  troubleshoot: '🔧 故障排查',
  scene: '🧭 场景',
};

export function ExplainCard() {
  const [data, setData] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<ExplainResponse>('explain:render', (e) => {
      setData(e.payload);
      setLoading(false);
    }).then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, []);

  const close = async () => {
    const win = await WebviewWindow.getByLabel('explain-overlay');
    await win?.hide();
  };

  if (!data && !loading) {
    return (
      <div className="explain-card explain-empty">
        <p>等待解释请求…</p>
      </div>
    );
  }

  return (
    <div className="explain-card">
      <header className="explain-header">
        <span className="explain-mode">{data ? MODE_LABEL[data.mode] : ''}</span>
        <button className="explain-close" onClick={close} title="关闭 (Esc)">
          ✕
        </button>
      </header>
      <div
        className="explain-body"
        dangerouslySetInnerHTML={{ __html: data?.html ?? '' }}
      />
      {data && (
        <footer className="explain-footer">
          {data.durationMs}ms · {data.ocrText.length} chars OCR'd
        </footer>
      )}
    </div>
  );
}
