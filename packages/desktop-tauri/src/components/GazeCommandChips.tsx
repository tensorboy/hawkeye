/**
 * GazeCommandChips — floating context-action chips next to the gazed entity.
 *
 * Mirrors Google DeepMind's "Move this / Merge those / Add that" pill UI,
 * but anchored to a *gaze* target instead of a mouse pointer. The actions
 * use Shadow's `chat_with_gaze_context` IPC so the LLM sees the entity
 * substituted for "this" automatically.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { GazedEntity } from '../hooks/useTauri';
import { chatWithGazeContext } from '../hooks/useTauri';

interface GazeCommandChipsProps {
  entity: GazedEntity;
  /** Anchor below the entity bbox if there's room, else above. */
  preferBelow?: boolean;
  onResult?: (action: string, text: string) => void;
  /**
   * If true (default), pre-fetch the "explain" answer in the background as
   * soon as the entity dwell starts, so clicking the primary chip is
   * instant. Google DeepMind's article calls this "pre-fetch on dwell".
   */
  prefetch?: boolean;
}

const CHIPS: Array<{ id: string; label: string; prompt: string; primary?: boolean }> = [
  { id: 'explain', label: '解释这个', prompt: '简明扼要解释这个是什么。', primary: true },
  { id: 'remember', label: '记住', prompt: '把这个加入我的 life tree 记忆，标注上下文。' },
  { id: 'translate', label: '翻译', prompt: '把这个翻译成英文（如果已经是英文，翻译成中文）。' },
];

export const GazeCommandChips: React.FC<GazeCommandChipsProps> = ({
  entity,
  preferBelow = true,
  onResult,
  prefetch = true,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Pre-fetched results, keyed by chip id. Cleared on entity change.
  const cacheRef = useRef<Map<string, string>>(new Map());
  // Track in-flight pre-fetches so we don't double-fire.
  const inFlightRef = useRef<Set<string>>(new Set());
  // Entity dedup so prefetch only runs once per distinct entity.
  const lastEntityKeyRef = useRef<string | null>(null);

  // Choose anchor position after first paint so we can measure the chips bar.
  useEffect(() => {
    const margin = 8;
    const bx = entity.bboxPx.xPx;
    const by = entity.bboxPx.yPx;
    const bw = entity.bboxPx.widthPx;
    const bh = entity.bboxPx.heightPx;

    // Approximate: chips bar is ~36px tall, ~240px wide.
    const chipsH = 36;
    const chipsW = 240;

    let top: number;
    if (preferBelow && by + bh + chipsH + margin < window.innerHeight) {
      top = by + bh + margin;
    } else if (by - chipsH - margin > 0) {
      top = by - chipsH - margin;
    } else {
      top = Math.min(by + bh + margin, window.innerHeight - chipsH - margin);
    }

    let left = bx + bw / 2 - chipsW / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - chipsW - margin));

    setPosition({ left, top });
  }, [entity.bboxPx.xPx, entity.bboxPx.yPx, entity.bboxPx.widthPx, entity.bboxPx.heightPx, preferBelow]);

  // Reset cache + warm "explain" when entity changes.
  useEffect(() => {
    const key = `${entity.text}@${entity.appName ?? ''}`;
    if (lastEntityKeyRef.current === key) return;
    lastEntityKeyRef.current = key;
    cacheRef.current.clear();
    inFlightRef.current.clear();

    if (!prefetch) return;

    const primary = CHIPS.find((c) => c.primary) ?? CHIPS[0];
    if (!primary) return;

    inFlightRef.current.add(primary.id);
    chatWithGazeContext([
      { role: 'system', content: '你是 Shadow 的注视助手。回答要短、直接、聚焦。' },
      { role: 'user', content: primary.prompt },
    ])
      .then((reply) => {
        cacheRef.current.set(primary.id, reply.text);
      })
      .catch(() => {
        // Prefetch is best-effort — silently swallow.
      })
      .finally(() => {
        inFlightRef.current.delete(primary.id);
      });
  }, [entity.text, entity.appName, prefetch]);

  const runChip = async (id: string, prompt: string) => {
    // Serve from prefetch cache if warm.
    const cached = cacheRef.current.get(id);
    if (cached !== undefined) {
      onResult?.(id, cached);
      return;
    }

    setBusyId(id);
    try {
      const reply = await chatWithGazeContext([
        { role: 'system', content: '你是 Shadow 的注视助手。回答要短、直接、聚焦。' },
        { role: 'user', content: prompt },
      ]);
      cacheRef.current.set(id, reply.text);
      onResult?.(id, reply.text);
    } catch (e) {
      console.warn('[GazeCommandChips]', id, 'failed', e);
    } finally {
      setBusyId(null);
    }
  };

  if (!position) return null;

  return (
    <div className="gaze-chips" style={position}>
      {CHIPS.map((chip) => (
        <button
          key={chip.id}
          className={
            `gaze-chip` +
            (chip.primary ? ' gaze-chip--primary' : '') +
            (busyId === chip.id ? ' gaze-chip--busy' : '')
          }
          onClick={() => runChip(chip.id, chip.prompt)}
          disabled={busyId !== null}
          title={chip.prompt}
        >
          <span className="gaze-chip-icon">·</span>
          {chip.label}
        </button>
      ))}
    </div>
  );
};

export default GazeCommandChips;
