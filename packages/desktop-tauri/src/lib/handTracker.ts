/**
 * handTracker — app-wide hand tracking singleton.
 *
 * Runs MediaPipe GestureRecognizer (21 landmarks + canned gesture classes in
 * one inference) against the webcam, pipes raw results through
 * GestureSignalProcessor, and fans out three streams to subscribers:
 * raw frames (for skeleton overlays), continuous signals, discrete events.
 *
 * Camera strategy: if WebGazer is running it already owns a camera stream and
 * keeps a playing <video id="webgazerVideoFeed"> in the DOM — we read frames
 * from that element so gaze and gesture share one capture. Only when gaze is
 * off do we open our own getUserMedia stream.
 *
 * Module-level singleton on purpose: recognition must survive tab switches in
 * the panel UI; components subscribe/unsubscribe, they don't own the loop.
 */

import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import type { GestureRecognizerResult } from '@mediapipe/tasks-vision';
import {
  GestureSignalProcessor,
  type ContinuousSignals,
  type DiscreteEvent,
} from './gestureSignals';

const WASM_PATH = '/mediapipe/tasks-vision/wasm';
const MODEL_PATH = '/mediapipe/tasks-vision/gesture_recognizer.task';
const WEBGAZER_VIDEO_ID = 'webgazerVideoFeed';
const TARGET_FPS = 24;
const MIN_FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

export interface HandFrame {
  result: GestureRecognizerResult;
  signals: ContinuousSignals;
  events: DiscreteEvent[];
  timestamp: number;
  videoWidth: number;
  videoHeight: number;
}

type FrameListener = (frame: HandFrame) => void;
type EventListener = (event: DiscreteEvent) => void;

class HandTracker {
  private recognizer: GestureRecognizer | null = null;
  private processor = new GestureSignalProcessor();
  private video: HTMLVideoElement | null = null;
  private ownStream: MediaStream | null = null;
  private running = false;
  private rafId = 0;
  private lastVideoTime = -1;
  private lastDetectTs = 0;
  private frameListeners = new Set<FrameListener>();
  private eventListeners = new Set<EventListener>();
  private initPromise: Promise<void> | null = null;

  get isRunning(): boolean {
    return this.running;
  }

  /** True when reading frames from WebGazer's camera instead of our own. */
  get usingSharedCamera(): boolean {
    return this.running && this.ownStream === null;
  }

  /** The active MediaStream — lets a preview <video> mirror the same capture. */
  getStream(): MediaStream | null {
    return (this.video?.srcObject as MediaStream | null) ?? null;
  }

  /** Load WASM + model. Idempotent; GPU delegate with CPU fallback. */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit().catch((e) => {
        this.initPromise = null; // allow retry after failure
        throw e;
      });
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO' as const,
      numHands: 2,
    });
    try {
      this.recognizer = await GestureRecognizer.createFromOptions(vision, options('GPU'));
    } catch (e) {
      console.warn('[handTracker] GPU delegate failed, falling back to CPU:', e);
      this.recognizer = await GestureRecognizer.createFromOptions(vision, options('CPU'));
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.init();

    const shared = document.getElementById(WEBGAZER_VIDEO_ID) as HTMLVideoElement | null;
    if (shared && shared.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.video = shared;
    } else {
      this.ownStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      const video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.srcObject = this.ownStream;
      await video.play();
      this.video = video;
    }

    this.processor.reset();
    this.lastVideoTime = -1;
    this.lastDetectTs = 0;
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.ownStream) {
      this.ownStream.getTracks().forEach((t) => t.stop());
      this.ownStream = null;
    }
    this.video = null;
    this.processor.reset();
  }

  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const video = this.video;
    if (!video || !this.recognizer) return;
    // Shared video can be torn down if WebGazer stops; skip until it's back.
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;

    const now = performance.now();
    if (now - this.lastDetectTs < MIN_FRAME_INTERVAL_MS) return;
    if (video.currentTime === this.lastVideoTime) return; // no new frame yet
    this.lastVideoTime = video.currentTime;
    this.lastDetectTs = now;

    let result: GestureRecognizerResult;
    try {
      result = this.recognizer.recognizeForVideo(video, now);
    } catch (e) {
      console.warn('[handTracker] recognize failed:', e);
      return;
    }

    const { signals, events } = this.processor.process(result, now);
    const frame: HandFrame = {
      result,
      signals,
      events,
      timestamp: now,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    };

    this.frameListeners.forEach((l) => l(frame));
    for (const ev of events) {
      this.eventListeners.forEach((l) => l(ev));
    }
  };
}

export const handTracker = new HandTracker();
