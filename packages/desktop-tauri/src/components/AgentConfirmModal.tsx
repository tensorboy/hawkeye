/**
 * AgentConfirmModal — gate for risky desktop-control actions the LLM wants
 * to run.
 *
 * Lifecycle:
 *   1. Rust agent runner hits a tool in `RISKY_TOOLS` (click, type_text,
 *      press_key, scroll, launch_app).
 *   2. Runner emits `agent:confirm-needed` with {confirmId, name, args, summary}
 *      and blocks on a oneshot waiting for the user's decision.
 *   3. This component listens, shows a modal, and on accept/reject calls
 *      `agent_confirm` (returns true if the pending confirm was resolved).
 *   4. Backend resolves the oneshot → tool runs (accept) or is reported
 *      back to the model as `userDeclined` (reject).
 *
 * Auto-rejects via a 30s timeout on the backend, so even if the user
 * dismisses the window the agent doesn't hang.
 */

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTauriEvent } from '../hooks/useEvents';
import { agentConfirm, type AgentConfirmRequest } from '../hooks/useTauri';

const RISKY_TOOL_LABELS: Record<string, { emoji: string; tone: string }> = {
  click:       { emoji: '🖱️', tone: 'cursor click' },
  type_text:   { emoji: '⌨️', tone: 'keystrokes' },
  press_key:   { emoji: '⌨️', tone: 'hotkey' },
  scroll:      { emoji: '↕️', tone: 'scroll' },
  launch_app:  { emoji: '🚀', tone: 'launches an app' },
};

export const AgentConfirmModal: React.FC = () => {
  const [pending, setPending] = useState<AgentConfirmRequest | null>(null);
  const [resolving, setResolving] = useState(false);

  useTauriEvent<AgentConfirmRequest>('agent:confirm-needed', (req) => {
    setPending(req);
  });

  // Keyboard shortcuts: Enter accepts, Esc rejects.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') resolve(true);
      else if (e.key === 'Escape') resolve(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const resolve = async (accept: boolean) => {
    if (!pending || resolving) return;
    setResolving(true);
    try {
      await agentConfirm(pending.confirmId, accept);
    } catch (e) {
      console.warn('[AgentConfirmModal] resolve failed', e);
    } finally {
      setResolving(false);
      setPending(null);
    }
  };

  const meta = pending ? RISKY_TOOL_LABELS[pending.name] ?? { emoji: '⚙️', tone: pending.name } : null;

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 10100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(2px)',
          }}
          onClick={() => resolve(false)}
        >
          <motion.div
            initial={{ y: 12, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(440px, 92vw)',
              padding: '20px 22px',
              borderRadius: 16,
              background: 'rgba(20, 22, 28, 0.98)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)',
              color: '#f5f5f5',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 22 }}>{meta?.emoji ?? '⚙️'}</span>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.85)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Agent wants to act
                </div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  Round {pending.round} · {meta?.tone ?? pending.name}
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                marginBottom: 14,
              }}
            >
              {pending.summary}
            </div>

            <details style={{ marginBottom: 14 }}>
              <summary
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                show raw arguments
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  fontSize: 11,
                  background: 'rgba(0,0,0,0.35)',
                  borderRadius: 8,
                  maxHeight: 160,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  fontFamily: 'SF Mono, Menlo, monospace',
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                {JSON.stringify(pending.args, null, 2)}
              </pre>
            </details>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn text-xs"
                onClick={() => resolve(false)}
                disabled={resolving}
              >
                Cancel <span style={{ opacity: 0.5, marginLeft: 4 }}>esc</span>
              </button>
              <button
                className="btn btn-primary text-xs"
                onClick={() => resolve(true)}
                disabled={resolving}
                autoFocus
              >
                {resolving ? 'Sending…' : (
                  <>Allow <span style={{ opacity: 0.55, marginLeft: 4 }}>↵</span></>
                )}
              </button>
            </div>

            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 10, textAlign: 'center' }}>
              auto-cancels in 30s · click outside also cancels
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AgentConfirmModal;
