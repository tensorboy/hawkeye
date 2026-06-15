/**
 * gestureSignals — turns raw MediaPipe hand output into two clean streams:
 *
 *   1. Continuous signals (per frame): normalized pinch strength, palm
 *      position, velocity, two-hand distance. These are the "TouchDesigner
 *      grammar" — geometry modulating a value, not firing a command.
 *   2. Discrete events (edge-triggered): the 7 canned gestures plus a
 *      synthetic Pinch, debounced by a hold + hysteresis + cooldown state
 *      machine so a single intentional gesture fires exactly once.
 *
 * All geometric quantities are normalized by hand scale (wrist → middle MCP)
 * so distance to the camera does not change thresholds.
 */

import type { GestureRecognizerResult } from '@mediapipe/tasks-vision';

// MediaPipe hand landmark indices (21-point model)
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;

export type Handedness = 'Left' | 'Right';

export type DiscreteGestureType =
  | 'Pinch'
  | 'Closed_Fist'
  | 'Open_Palm'
  | 'Pointing_Up'
  | 'Thumb_Down'
  | 'Thumb_Up'
  | 'Victory'
  | 'ILoveYou';

export interface HandSignal {
  /** The user's actual hand. MediaPipe assumes mirrored input; webcam frames
   *  are unmirrored, so the model's label is swapped here. */
  handedness: Handedness;
  /** Palm center in [0,1], x mirrored to match the user's perception
   *  (hand moves left → x decreases). */
  palm: { x: number; y: number };
  /** Thumb-tip ↔ index-tip distance / hand scale. ~0.1 fully pinched, ~1.0 open. */
  pinch: number;
  /** Hysteresis state — true between pinch-enter and pinch-exit thresholds. */
  pinching: boolean;
  /** Palm speed in normalized units/sec, EMA-smoothed. */
  velocity: number;
}

export interface ContinuousSignals {
  hands: HandSignal[];
  /** Distance between both palms when two hands are visible, else null. */
  twoHandDistance: number | null;
  timestamp: number;
}

export interface DiscreteEvent {
  type: DiscreteGestureType;
  handedness: Handedness;
  confidence: number;
  /** Mirrored palm position at fire time. */
  position: { x: number; y: number };
}

export interface SignalProcessorOptions {
  /** Gesture must persist this long before firing. */
  holdMs?: number;
  /** Refractory period per gesture type after firing. */
  cooldownMs?: number;
  /** Pinch enters below this normalized ratio… */
  pinchEnter?: number;
  /** …and exits above this one (hysteresis gap kills boundary flapping). */
  pinchExit?: number;
  /** Minimum classifier score for the canned gestures. */
  minGestureScore?: number;
  /** EMA factor for continuous values (higher = snappier, noisier). */
  smoothing?: number;
}

interface HandState {
  pinching: boolean;
  smoothPinch: number | null;
  smoothPalm: { x: number; y: number } | null;
  velocity: number;
  lastTs: number;
  candidate: DiscreteGestureType | null;
  candidateSince: number;
  lastFiredAt: Partial<Record<DiscreteGestureType, number>>;
}

const CANNED: ReadonlySet<string> = new Set([
  'Closed_Fist',
  'Open_Palm',
  'Pointing_Up',
  'Thumb_Down',
  'Thumb_Up',
  'Victory',
  'ILoveYou',
]);

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function freshHandState(): HandState {
  return {
    pinching: false,
    smoothPinch: null,
    smoothPalm: null,
    velocity: 0,
    lastTs: 0,
    candidate: null,
    candidateSince: 0,
    lastFiredAt: {},
  };
}

export class GestureSignalProcessor {
  private readonly holdMs: number;
  private readonly cooldownMs: number;
  private readonly pinchEnter: number;
  private readonly pinchExit: number;
  private readonly minGestureScore: number;
  private readonly smoothing: number;

  private states: Record<Handedness, HandState> = {
    Left: freshHandState(),
    Right: freshHandState(),
  };

  constructor(opts: SignalProcessorOptions = {}) {
    this.holdMs = opts.holdMs ?? 500;
    this.cooldownMs = opts.cooldownMs ?? 1000;
    this.pinchEnter = opts.pinchEnter ?? 0.35;
    this.pinchExit = opts.pinchExit ?? 0.55;
    this.minGestureScore = opts.minGestureScore ?? 0.6;
    this.smoothing = opts.smoothing ?? 0.35;
  }

  /** Reset all state (call when tracking stops/restarts). */
  reset(): void {
    this.states = { Left: freshHandState(), Right: freshHandState() };
  }

  process(
    result: GestureRecognizerResult,
    timestamp: number,
  ): { signals: ContinuousSignals; events: DiscreteEvent[] } {
    const hands: HandSignal[] = [];
    const events: DiscreteEvent[] = [];
    const seen = new Set<Handedness>();

    for (let i = 0; i < result.landmarks.length; i++) {
      const lm = result.landmarks[i];
      if (!lm || lm.length < 21) continue;

      // MediaPipe predicts handedness for mirrored (selfie) input; raw webcam
      // frames are unmirrored, so swap to get the user's actual hand.
      const rawLabel = result.handedness[i]?.[0]?.categoryName;
      const handedness: Handedness = rawLabel === 'Left' ? 'Right' : 'Left';
      if (seen.has(handedness)) continue; // defensive: one signal per hand
      seen.add(handedness);

      const st = this.states[handedness];
      const a = this.smoothing;

      // ── Continuous geometry, normalized by hand scale ────────────────
      const handScale = Math.max(dist(lm[WRIST], lm[MIDDLE_MCP]), 1e-6);
      const rawPinch = dist(lm[THUMB_TIP], lm[INDEX_TIP]) / handScale;
      const rawPalm = {
        x: (lm[WRIST].x + lm[INDEX_MCP].x + lm[PINKY_MCP].x) / 3,
        y: (lm[WRIST].y + lm[INDEX_MCP].y + lm[PINKY_MCP].y) / 3,
      };

      const pinch = st.smoothPinch === null ? rawPinch : a * rawPinch + (1 - a) * st.smoothPinch;
      const palm =
        st.smoothPalm === null
          ? rawPalm
          : {
              x: a * rawPalm.x + (1 - a) * st.smoothPalm.x,
              y: a * rawPalm.y + (1 - a) * st.smoothPalm.y,
            };

      if (st.smoothPalm && st.lastTs > 0 && timestamp > st.lastTs) {
        const dtSec = (timestamp - st.lastTs) / 1000;
        const rawVel = dist(palm, st.smoothPalm) / dtSec;
        st.velocity = a * rawVel + (1 - a) * st.velocity;
      }
      st.smoothPinch = pinch;
      st.smoothPalm = palm;
      st.lastTs = timestamp;

      // ── Pinch hysteresis ─────────────────────────────────────────────
      if (!st.pinching && pinch < this.pinchEnter) st.pinching = true;
      else if (st.pinching && pinch > this.pinchExit) st.pinching = false;

      const mirroredPalm = { x: 1 - palm.x, y: palm.y };
      hands.push({
        handedness,
        palm: mirroredPalm,
        pinch,
        pinching: st.pinching,
        velocity: st.velocity,
      });

      // ── Discrete candidate: canned classifier wins over synthetic pinch
      //    (a closing fist passes through pinch-like geometry; this ordering
      //    stops Pinch from pre-empting Closed_Fist). ──────────────────
      const canned = result.gestures[i]?.[0];
      let candidate: DiscreteGestureType | null = null;
      let confidence = 1.0;
      if (canned && CANNED.has(canned.categoryName) && canned.score >= this.minGestureScore) {
        candidate = canned.categoryName as DiscreteGestureType;
        confidence = canned.score;
      } else if (st.pinching) {
        candidate = 'Pinch';
      }

      // ── Hold + cooldown state machine ────────────────────────────────
      if (candidate !== st.candidate) {
        st.candidate = candidate;
        st.candidateSince = timestamp;
      } else if (candidate !== null && timestamp - st.candidateSince >= this.holdMs) {
        const last = st.lastFiredAt[candidate] ?? 0;
        if (timestamp - last >= this.cooldownMs) {
          st.lastFiredAt[candidate] = timestamp;
          events.push({ type: candidate, handedness, confidence, position: mirroredPalm });
        }
      }
    }

    // Hands that vanished this frame lose their candidate (not their cooldowns).
    for (const label of ['Left', 'Right'] as const) {
      if (!seen.has(label)) {
        this.states[label].candidate = null;
        this.states[label].pinching = false;
      }
    }

    const twoHandDistance =
      hands.length === 2 ? dist(hands[0].palm, hands[1].palm) : null;

    return { signals: { hands, twoHandDistance, timestamp }, events };
  }
}
