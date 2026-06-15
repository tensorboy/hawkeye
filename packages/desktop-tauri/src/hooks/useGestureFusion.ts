/**
 * useGestureFusion — the single dispatcher for discrete hand-gesture events.
 *
 * Mount exactly once in App.tsx. Subscribes to the handTracker singleton and:
 *
 *   - Pinch        → gaze + pinch fusion: explain whatever the user is
 *                    currently looking at (the gazed entity from the store),
 *                    same flow as the ⌥E hotkey but hands-free.
 *   - Thumb_Up     → 'confirm' to the daemon — accepts proactive suggestions.
 *   - Thumb_Down   → 'cancel' — dismisses them.
 *   - other canned → their mapped GestureAction via the existing
 *                    /v1/gesture/event route (screenshot, pause, menu…).
 *
 * GesturePanel intentionally does NOT dispatch — it only previews and logs.
 * Keeping dispatch here means one code path whether or not the panel is open.
 */

import { useEffect, useRef } from 'react';
import { handTracker } from '../lib/handTracker';
import type { DiscreteEvent, DiscreteGestureType } from '../lib/gestureSignals';
import { handleGesture, type GestureAction } from './useTauri';
import { useHawkeyeStore } from '../store';
import { explainGazedEntity } from '../lib/explain';

/** Gesture → backend action. Pinch is null: it's handled locally as fusion. */
export const GESTURE_ACTIONS: Record<DiscreteGestureType, GestureAction | null> = {
  Pinch: null,
  Closed_Fist: 'click',
  Open_Palm: 'pause',
  Pointing_Up: 'cursor_move',
  Thumb_Down: 'cancel',
  Thumb_Up: 'confirm',
  Victory: 'screenshot',
  ILoveYou: 'quick_menu',
};

const PINCH_EXPLAIN_MODE = 'dictionary';

export function useGestureFusion(): void {
  const explainInFlight = useRef(false);

  useEffect(() => {
    return handTracker.onEvent(async (ev: DiscreteEvent) => {
      // ── Gaze + pinch → Look-to-Explain ─────────────────────────────────
      if (ev.type === 'Pinch') {
        if (explainInFlight.current) return;
        const entity = useHawkeyeStore.getState().gazedEntity;
        if (!entity) {
          console.warn('[gestureFusion] pinch with no gazed entity — is gaze tracking on?');
          return;
        }
        explainInFlight.current = true;
        try {
          await explainGazedEntity(entity, PINCH_EXPLAIN_MODE);
        } catch (err) {
          console.error('[gestureFusion] pinch-explain failed:', err);
        } finally {
          explainInFlight.current = false;
        }
        return;
      }

      // ── Canned gestures → existing daemon action pipeline ──────────────
      const action = GESTURE_ACTIONS[ev.type];
      if (!action) return;
      handleGesture({
        action,
        gesture: ev.type,
        confidence: ev.confidence,
        position: ev.position,
        handedness: ev.handedness,
      }).catch((err) => {
        console.warn('[gestureFusion] dispatch failed:', err);
      });
    });
  }, []);
}
