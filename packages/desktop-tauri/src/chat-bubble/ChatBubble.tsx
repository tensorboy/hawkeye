/**
 * ChatBubble — system-wide floating chat anchored to the bottom-right of the
 * screen. Collapsed: a 48px 🦅 dot. Expanded: a 360×500 conversation panel.
 *
 * The window resizes itself on toggle, keeping the bottom-right corner fixed
 * so the panel grows up-and-left like a speech bubble.
 *
 * Chat goes through `/v1/ai/chat-with-gaze-context`: the daemon rewrites
 * "this/that/这个/那个" in the message using the entity the user is currently
 * looking at (pushed into AppState by the main window's gaze pipeline). The
 * bubble itself needs zero gaze state — deixis resolution is server-side.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import {
  chatWithGazeContext,
  initAi,
  type ChatMessage,
} from '../hooks/useTauri';

const COLLAPSED = { w: 64, h: 64 };
const EXPANDED = { w: 360, h: 500 };
const MARGIN_RIGHT = 16;
const MARGIN_BOTTOM = 90; // clears the macOS Dock in its default size

/** Resize the window and re-anchor its bottom-right corner to the screen's. */
async function layoutWindow(expanded: boolean): Promise<void> {
  const win = getCurrentWindow();
  const monitor = await currentMonitor();
  if (!monitor) return;

  const sf = monitor.scaleFactor;
  const size = expanded ? EXPANDED : COLLAPSED;
  const screenRight = (monitor.position.x + monitor.size.width) / sf;
  const screenBottom = (monitor.position.y + monitor.size.height) / sf;

  await win.setSize(new LogicalSize(size.w, size.h));
  await win.setPosition(
    new LogicalPosition(
      screenRight - size.w - MARGIN_RIGHT,
      screenBottom - size.h - MARGIN_BOTTOM,
    ),
  );
}

export const ChatBubble: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aiInitRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Anchor the collapsed dot on first mount.
  useEffect(() => {
    layoutWindow(false).catch(() => {});
  }, []);

  // Keep the latest message in view.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const toggle = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    try {
      await layoutWindow(next);
      if (next) {
        await getCurrentWindow().setFocus();
        inputRef.current?.focus();
        if (!aiInitRef.current) {
          aiInitRef.current = true;
          initAi().catch(() => {
            aiInitRef.current = false; // retry on next expand
          });
        }
      }
    } catch (e) {
      console.warn('[chat-bubble] layout failed:', e);
    }
  }, [expanded]);

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const resp = await chatWithGazeContext(history);
      setMessages((prev) => [...prev, { role: 'assistant', content: resp.text }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, messages]);

  if (!expanded) {
    return (
      <div className="bubble-stage">
        <button className="bubble-dot" onClick={toggle} title="Shadow Chat">
          🦅
        </button>
      </div>
    );
  }

  return (
    <div className="bubble-panel">
      <header className="bubble-header" data-tauri-drag-region>
        <span className="bubble-header-title" data-tauri-drag-region>
          🦅 Shadow
        </span>
        <span className="bubble-header-hint" data-tauri-drag-region>
          说"这个"会自动指向你看着的内容
        </span>
        <button className="bubble-collapse" onClick={toggle} title="收起">
          —
        </button>
      </header>

      <div className="bubble-messages">
        {messages.length === 0 && !isLoading && (
          <div className="bubble-empty">
            看着屏幕上的内容，直接问"这个是什么"。
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble-msg bubble-msg--${m.role}`}>
            {m.content}
          </div>
        ))}
        {isLoading && (
          <div className="bubble-msg bubble-msg--assistant bubble-typing">
            <span /><span /><span />
          </div>
        )}
        {error && <div className="bubble-error">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="bubble-input-row">
        <input
          ref={inputRef}
          className="bubble-input"
          value={input}
          placeholder="问点什么…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) send();
          }}
        />
        <button
          className="bubble-send"
          onClick={send}
          disabled={!input.trim() || isLoading}
        >
          ↑
        </button>
      </div>
    </div>
  );
};
