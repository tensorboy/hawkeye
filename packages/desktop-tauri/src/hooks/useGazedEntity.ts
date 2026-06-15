/**
 * useGazedEntity — Couples raw gaze coordinates with screen entities.
 *
 * This is the single hook that turns "the user's eye is here" into "the
 * user is looking at THIS specific text region with THIS knowledge type".
 * It implements Google DeepMind's "Show and Tell" + "This/That" principles
 * on top of Shadow's existing gaze + OCR pipeline.
 *
 * Lifecycle per fixation:
 *
 *   1. Each new `gazePoint` is hit-tested against the latest OCR regions.
 *   2. While the gaze stays inside the same region, dwell time accumulates.
 *   3. Once dwell crosses `dwellThresholdMs`, the region "promotes" to a
 *      gazed entity — emitted locally AND pushed into Rust AppState so
 *      voice/agent/chat can resolve "this/that" against it.
 *   4. When the gaze leaves the region (or there's no hit for a while),
 *      the entity is cleared.
 *
 * The classification (saccade / fixation / dwell) is also exposed so the
 * GazeOverlay can pick its visibility tier (Google's "Maintain the flow").
 */

import { useEffect, useRef, useState } from 'react';
import type { GazePoint } from './useWebGazer';
import type { GazedEntity, OcrRegion } from './useTauri';
import { clearGazedEntity, setGazedEntity } from './useTauri';
import { hitTestGaze } from '../lib/bbox';

export type GazeState = 'saccade' | 'fixation' | 'dwell';

export interface UseGazedEntityOptions {
  regions: OcrRegion[];
  screenshotWidth?: number;
  screenshotHeight?: number;
  /** Recognized window app name (e.g. "Google Chrome"). */
  appName?: string;
  /** Milliseconds inside the same region before it counts as "dwell". */
  dwellThresholdMs?: number;
  /** Pixel distance threshold below which gaze is considered "still". */
  fixationRadiusPx?: number;
  /** Push the entity into Rust state for voice/agent deixis. Default true. */
  syncToBackend?: boolean;
}

export interface UseGazedEntityReturn {
  /** The current gazed entity, or null if no dwell yet. */
  entity: GazedEntity | null;
  /** Coarse gaze motion state — drives 3-tier overlay visibility. */
  state: GazeState;
  /** How long the gaze has been inside the current region (ms). */
  dwellMs: number;
}

export function useGazedEntity(
  gazePoint: GazePoint | null,
  options: UseGazedEntityOptions,
): UseGazedEntityReturn {
  const {
    regions,
    screenshotWidth,
    screenshotHeight,
    appName,
    dwellThresholdMs = 500,
    fixationRadiusPx = 60,
    syncToBackend = true,
  } = options;

  const [entity, setEntity] = useState<GazedEntity | null>(null);
  const [gazeState, setGazeState] = useState<GazeState>('saccade');
  const [dwellMs, setDwellMs] = useState(0);

  // Refs avoid resubscribing on every gaze tick.
  const prevPointRef = useRef<GazePoint | null>(null);
  const currentRegionRef = useRef<OcrRegion | null>(null);
  const regionEnteredAtRef = useRef<number>(0);
  const lastPushedRef = useRef<string | null>(null); // entity dedup key

  // Latest regions/dims accessed from gaze handler without invalidating it.
  const regionsRef = useRef(regions);
  regionsRef.current = regions;
  const screenshotWRef = useRef(screenshotWidth);
  screenshotWRef.current = screenshotWidth;
  const screenshotHRef = useRef(screenshotHeight);
  screenshotHRef.current = screenshotHeight;
  const appNameRef = useRef(appName);
  appNameRef.current = appName;

  useEffect(() => {
    if (!gazePoint) return;

    const now = gazePoint.timestamp || Date.now();
    const prev = prevPointRef.current;
    prevPointRef.current = gazePoint;

    // ── 1. Motion classification ──────────────────────────────────────
    let nextState: GazeState = 'fixation';
    if (prev) {
      const dx = gazePoint.x - prev.x;
      const dy = gazePoint.y - prev.y;
      const dist = Math.hypot(dx, dy);
      if (dist > fixationRadiusPx) {
        nextState = 'saccade';
      }
    }

    // ── 2. Hit-test against OCR regions ───────────────────────────────
    const sw = screenshotWRef.current;
    const sh = screenshotHRef.current;
    const hit =
      sw && sh && regionsRef.current.length > 0
        ? hitTestGaze(gazePoint.x, gazePoint.y, regionsRef.current, sw, sh)
        : null;

    // Saccades reset the dwell timer regardless of hit.
    if (nextState === 'saccade') {
      if (currentRegionRef.current !== null) {
        currentRegionRef.current = null;
        regionEnteredAtRef.current = 0;
        setDwellMs(0);
      }
      if (entity !== null) {
        setEntity(null);
        if (syncToBackend && lastPushedRef.current) {
          lastPushedRef.current = null;
          clearGazedEntity().catch(() => {});
        }
      }
      setGazeState('saccade');
      return;
    }

    // Fixation but no entity under the gaze → clear any current entity.
    if (!hit) {
      if (currentRegionRef.current !== null) {
        currentRegionRef.current = null;
        regionEnteredAtRef.current = 0;
        setDwellMs(0);
      }
      if (entity !== null) {
        setEntity(null);
        if (syncToBackend && lastPushedRef.current) {
          lastPushedRef.current = null;
          clearGazedEntity().catch(() => {});
        }
      }
      setGazeState('fixation');
      return;
    }

    // ── 3. Dwell accounting on the hit region ─────────────────────────
    const sameRegion = currentRegionRef.current?.text === hit.region.text;
    if (!sameRegion) {
      currentRegionRef.current = hit.region;
      regionEnteredAtRef.current = now;
      setDwellMs(0);
      setGazeState('fixation');
      return;
    }

    const dwell = now - regionEnteredAtRef.current;
    setDwellMs(dwell);

    if (dwell < dwellThresholdMs) {
      setGazeState('fixation');
      return;
    }

    // ── 4. Dwell threshold crossed → promote to entity ────────────────
    setGazeState('dwell');

    const dedupKey = `${hit.region.text}@${appNameRef.current ?? ''}`;
    if (lastPushedRef.current === dedupKey) {
      // Already emitted/pushed; keep dwellMs increasing but don't spam.
      return;
    }
    lastPushedRef.current = dedupKey;

    const newEntity: GazedEntity = {
      text: hit.region.text,
      bboxPx: hit.bboxPx,
      confidence: hit.region.confidence,
      dwellMs: dwell,
      appName: appNameRef.current,
      timestamp: now,
    };

    setEntity(newEntity);

    if (syncToBackend) {
      setGazedEntity(newEntity).catch((e) => {
        console.warn('[useGazedEntity] backend sync failed:', e);
      });
    }
  }, [gazePoint, dwellThresholdMs, fixationRadiusPx, syncToBackend, entity]);

  return { entity, state: gazeState, dwellMs };
}
