/**
 * useExplain — main-window listener that bridges the global shortcut to
 * the daemon explain route and the overlay window.
 *
 * Mount this exactly once (in App.tsx). The Tauri-native `explain:requested`
 * event is fired by the backend's global-shortcut handler with `{mode}` in
 * the payload. We look up the latest gaze coords from the store, call the
 * daemon, then route the HTML to the overlay window.
 */

import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useHawkeyeStore } from '../store';
import { explainGazedEntity, type ExplainMode } from '../lib/explain';

interface ExplainRequestedPayload {
  mode: ExplainMode;
}

export function useExplain() {
  // Stable ref so the listener always sees fresh store reads.
  const gazedEntityRef = useRef(useHawkeyeStore.getState().gazedEntity);
  useEffect(
    () =>
      useHawkeyeStore.subscribe((s) => {
        gazedEntityRef.current = s.gazedEntity;
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;
    let inFlight = false;

    listen<ExplainRequestedPayload>('explain:requested', async (e) => {
      if (cancelled || inFlight) return; // de-dupe rapid hotkey presses
      inFlight = true;
      try {
        const entity = gazedEntityRef.current;
        if (!entity?.bboxPx) {
          console.warn('[explain] no gaze position available — calibrate the eye tracker first');
          return;
        }
        await explainGazedEntity(entity, e.payload.mode);
      } catch (err) {
        console.error('[explain] failed:', err);
      } finally {
        inFlight = false;
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);
}
