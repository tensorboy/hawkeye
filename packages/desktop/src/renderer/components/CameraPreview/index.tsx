/**
 * CameraPreview - Real-time webcam preview with MediaPipe ML
 * Supports: Face Detection, Hand Tracking with Gesture Recognition & Control, Pose Estimation
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  FaceDetector,
  FaceLandmarker,
  GestureRecognizer,
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import './CameraPreview.css';

type DetectionMode = 'none' | 'face' | 'hand' | 'pose' | 'face+hand';

// Gesture action types
type GestureAction =
  | 'screenshot'
  | 'toggle_recording'
  | 'pause'
  | 'confirm'
  | 'cancel'
  | 'scroll_up'
  | 'scroll_down'
  | 'click'
  | 'quick_menu'
  | 'cursor_move';

interface GestureEvent {
  action: GestureAction;
  gesture: string;
  confidence: number;
  position?: { x: number; y: number };
  handedness?: 'Left' | 'Right';
}

interface CameraPreviewProps {
  onClose?: () => void;
  minimized?: boolean;
  gestureControlEnabled?: boolean;
  onGestureAction?: (event: GestureEvent) => void;
}

// MediaPipe model URLs (from CDN)
const VISION_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

// Gesture to action mapping
const GESTURE_ACTIONS: Record<string, {
  icon: string;
  action: string;
  color: string;
  actionType: GestureAction;
}> = {
  'Closed_Fist': { icon: '✊', action: '点击/抓取', color: '#ef4444', actionType: 'click' },
  'Open_Palm': { icon: '🖐️', action: '暂停', color: '#22c55e', actionType: 'pause' },
  'Pointing_Up': { icon: '☝️', action: '光标控制', color: '#3b82f6', actionType: 'cursor_move' },
  'Thumb_Down': { icon: '👎', action: '取消/返回', color: '#f97316', actionType: 'cancel' },
  'Thumb_Up': { icon: '👍', action: '确认', color: '#22c55e', actionType: 'confirm' },
  'Victory': { icon: '✌️', action: '截图', color: '#a855f7', actionType: 'screenshot' },
  'ILoveYou': { icon: '🤟', action: '快捷菜单', color: '#ec4899', actionType: 'quick_menu' },
};

// Cooldown time for gesture actions (ms)
const GESTURE_COOLDOWN = 1000;
// Minimum hold time for gesture to trigger action (ms)
const GESTURE_HOLD_TIME = 500;

// ============ Advanced Gaze Direction Tracking ============
// Based on academic research and professional eye tracking systems

// Iris landmark indices (468-477 available when refineLandmarks=true)
const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];

// Full eye contour landmarks for precise boundary estimation (16 points per eye)
// These form a complete outline around each eye
const LEFT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE_CONTOUR = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

// Eye corner landmark indices
const LEFT_EYE_CORNERS = { outer: 33, inner: 133 };
const RIGHT_EYE_CORNERS = { outer: 362, inner: 263 };

// Additional eye landmarks for vertical gaze (upper and lower eyelids)
const LEFT_EYE_VERTICAL = {
  top: 159, bottom: 145,
  topOuter: 158, topInner: 160,
  bottomOuter: 153, bottomInner: 144
};
const RIGHT_EYE_VERTICAL = {
  top: 386, bottom: 374,
  topOuter: 387, topInner: 385,
  bottomOuter: 380, bottomInner: 373
};

// Landmarks for Eye Aspect Ratio (EAR) - 6 points per eye
// EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
const LEFT_EYE_EAR = {
  p1: 33,   // outer corner
  p2: 160,  // upper lid 1
  p3: 158,  // upper lid 2
  p4: 133,  // inner corner
  p5: 153,  // lower lid 1
  p6: 144   // lower lid 2
};
const RIGHT_EYE_EAR = {
  p1: 362,  // outer corner
  p2: 385,  // upper lid 1
  p3: 387,  // upper lid 2
  p4: 263,  // inner corner
  p5: 380,  // lower lid 1
  p6: 373   // lower lid 2
};

// Head pose landmarks for 3D estimation (extended set)
const HEAD_POSE_LANDMARKS = {
  noseTip: 1,
  chin: 199,
  leftEyeOuter: 33,
  rightEyeOuter: 362,
  leftMouth: 61,
  rightMouth: 291,
  foreHead: 10,
  noseBase: 2,
  leftTemple: 127,
  rightTemple: 356,
  leftCheek: 234,
  rightCheek: 454,
};

// Gaze direction type
type GazeDirection = 'center' | 'left' | 'right' | 'up' | 'down';

// ============ One Euro Filter - Adaptive Low-Pass Filter ============
// Based on: https://cristal.univ-lille.fr/~casiez/1euro/
// Provides smooth tracking with minimal lag for slow movements
// and responsive tracking for fast movements
class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev: number = 0;
  private tPrev: number | null = null;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;  // Minimum cutoff frequency
    this.beta = beta;            // Speed coefficient (higher = more responsive)
    this.dCutoff = dCutoff;      // Derivative cutoff frequency
  }

  private smoothingFactor(te: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  private exponentialSmoothing(a: number, x: number, xPrev: number): number {
    return a * x + (1 - a) * xPrev;
  }

  filter(x: number, timestamp?: number): number {
    const t = timestamp ?? performance.now() / 1000;

    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = t;
      return x;
    }

    const te = t - this.tPrev;
    if (te <= 0) return this.xPrev;

    // Estimate velocity
    const dx = (x - this.xPrev) / te;
    const adx = this.smoothingFactor(te, this.dCutoff);
    const dxSmooth = this.exponentialSmoothing(adx, dx, this.dxPrev);

    // Adaptive cutoff based on speed
    const cutoff = this.minCutoff + this.beta * Math.abs(dxSmooth);
    const a = this.smoothingFactor(te, cutoff);
    const xSmooth = this.exponentialSmoothing(a, x, this.xPrev);

    this.xPrev = xSmooth;
    this.dxPrev = dxSmooth;
    this.tPrev = t;

    return xSmooth;
  }

  reset() {
    this.xPrev = null;
    this.tPrev = null;
    this.dxPrev = 0;
  }
}

// Smoothing buffer for gaze stability (fallback/simple averaging)
class GazeBuffer {
  private buffer: number[] = [];
  private size: number;

  constructor(size = 5) {
    this.size = size;
  }

  add(value: number): number {
    this.buffer.push(value);
    if (this.buffer.length > this.size) {
      this.buffer.shift();
    }
    return this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length;
  }

  clear() {
    this.buffer = [];
  }
}

// ============ Advanced Gaze Filters ============
// Use One Euro Filter for smooth, responsive tracking
const leftEyeHFilter = new OneEuroFilter(1.0, 0.01, 1.0);
const leftEyeVFilter = new OneEuroFilter(1.0, 0.01, 1.0);
const rightEyeHFilter = new OneEuroFilter(1.0, 0.01, 1.0);
const rightEyeVFilter = new OneEuroFilter(1.0, 0.01, 1.0);
const finalGazeHFilter = new OneEuroFilter(0.8, 0.015, 1.0);
const finalGazeVFilter = new OneEuroFilter(0.8, 0.015, 1.0);

// Create global gaze buffers for smoothing (fallback)
const horizontalGazeBuffer = new GazeBuffer(8);
const verticalGazeBuffer = new GazeBuffer(8);

// Screen gaze point buffer for extra smoothing
const screenGazeXBuffer = new GazeBuffer(12);
const screenGazeYBuffer = new GazeBuffer(12);

// Calibration gaze indicator smoothing (increased for smoother movement)
const calibrationGazeXBuffer = new GazeBuffer(15);
const calibrationGazeYBuffer = new GazeBuffer(15);

// Gaze sensitivity multiplier for calibration indicator
const GAZE_SENSITIVITY = 200;

// ============ Eye Aspect Ratio (EAR) Calculation ============
// EAR is used to detect blinks and eye openness
// Lower EAR = more closed eye
function calculateEAR(
  landmarks: NormalizedLandmark[],
  earPoints: typeof LEFT_EYE_EAR
): number {
  const p1 = landmarks[earPoints.p1];
  const p2 = landmarks[earPoints.p2];
  const p3 = landmarks[earPoints.p3];
  const p4 = landmarks[earPoints.p4];
  const p5 = landmarks[earPoints.p5];
  const p6 = landmarks[earPoints.p6];

  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0.3; // Default

  // Calculate distances
  const dist = (a: NormalizedLandmark, b: NormalizedLandmark) =>
    Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

  const v1 = dist(p2, p6); // Upper to lower 1
  const v2 = dist(p3, p5); // Upper to lower 2
  const h = dist(p1, p4);  // Horizontal (corner to corner)

  if (h < 0.001) return 0.3;
  return (v1 + v2) / (2.0 * h);
}

// ============ Eye Contour Bounding Box ============
// Calculate precise eye boundaries using full contour
function getEyeContourBounds(
  landmarks: NormalizedLandmark[],
  contourIndices: number[]
): { minX: number; maxX: number; minY: number; maxY: number; centerX: number; centerY: number } {
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  let sumX = 0, sumY = 0, count = 0;

  for (const idx of contourIndices) {
    const p = landmarks[idx];
    if (p) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      sumX += p.x;
      sumY += p.y;
      count++;
    }
  }

  return {
    minX, maxX, minY, maxY,
    centerX: count > 0 ? sumX / count : 0.5,
    centerY: count > 0 ? sumY / count : 0.5
  };
}

// ============ Calibration System for Screen Gaze Tracking ============

interface CalibrationPoint {
  screenX: number;  // Screen position (0-1 normalized)
  screenY: number;
  gazeH: number;    // Gaze ratio at this point
  gazeV: number;
}

interface CalibrationData {
  points: CalibrationPoint[];
  coefficientsX: number[]; // Polynomial coefficients for X mapping
  coefficientsY: number[]; // Polynomial coefficients for Y mapping
  isCalibrated: boolean;
}

// 9-point calibration positions (normalized 0-1)
const CALIBRATION_POSITIONS = [
  { x: 0.1, y: 0.1 },   // Top-left
  { x: 0.5, y: 0.1 },   // Top-center
  { x: 0.9, y: 0.1 },   // Top-right
  { x: 0.1, y: 0.5 },   // Middle-left
  { x: 0.5, y: 0.5 },   // Center
  { x: 0.9, y: 0.5 },   // Middle-right
  { x: 0.1, y: 0.9 },   // Bottom-left
  { x: 0.5, y: 0.9 },   // Bottom-center
  { x: 0.9, y: 0.9 },   // Bottom-right
];

// Polynomial regression for gaze-to-screen mapping
// Uses quadratic polynomial: screenX = a0 + a1*gazeH + a2*gazeV + a3*gazeH^2 + a4*gazeV^2 + a5*gazeH*gazeV
function fitPolynomial(points: CalibrationPoint[]): { coefficientsX: number[]; coefficientsY: number[] } {
  if (points.length < 6) {
    // Not enough points, use simple linear mapping
    return {
      coefficientsX: [0, 1, 0, 0, 0, 0],
      coefficientsY: [0, 0, 1, 0, 0, 0],
    };
  }

  // Build design matrix A and target vectors bX, bY
  const n = points.length;
  const A: number[][] = [];
  const bX: number[] = [];
  const bY: number[] = [];

  for (const p of points) {
    const h = p.gazeH;
    const v = p.gazeV;
    A.push([1, h, v, h * h, v * v, h * v]);
    bX.push(p.screenX);
    bY.push(p.screenY);
  }

  // Solve using normal equations: (A^T * A) * x = A^T * b
  // This is a simple least squares solution
  const ATA = multiplyMatrices(transpose(A), A);
  const ATbX = multiplyMatrixVector(transpose(A), bX);
  const ATbY = multiplyMatrixVector(transpose(A), bY);

  const coefficientsX = solveLinearSystem(ATA, ATbX);
  const coefficientsY = solveLinearSystem(ATA, ATbY);

  return { coefficientsX, coefficientsY };
}

// Matrix helper functions
function transpose(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: number[][] = [];
  for (let j = 0; j < cols; j++) {
    result[j] = [];
    for (let i = 0; i < rows; i++) {
      result[j][i] = matrix[i][j];
    }
  }
  return result;
}

function multiplyMatrices(A: number[][], B: number[][]): number[][] {
  const rowsA = A.length;
  const colsA = A[0].length;
  const colsB = B[0].length;
  const result: number[][] = [];
  for (let i = 0; i < rowsA; i++) {
    result[i] = [];
    for (let j = 0; j < colsB; j++) {
      let sum = 0;
      for (let k = 0; k < colsA; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function multiplyMatrixVector(A: number[][], b: number[]): number[] {
  const rows = A.length;
  const cols = A[0].length;
  const result: number[] = [];
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    for (let j = 0; j < cols; j++) {
      sum += A[i][j] * b[j];
    }
    result[i] = sum;
  }
  return result;
}

// Simple Gaussian elimination solver
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const augmented: number[][] = A.map((row, i) => [...row, b[i]]);

  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    // Check for singularity
    if (Math.abs(augmented[i][i]) < 1e-10) {
      continue; // Skip singular column
    }

    // Eliminate column
    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }

  // Back substitution
  const x: number[] = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(augmented[i][i]) < 1e-10) {
      x[i] = 0;
      continue;
    }
    x[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= augmented[i][j] * x[j];
    }
    x[i] /= augmented[i][i];
  }

  return x;
}

// Apply polynomial to get screen coordinates from gaze ratio
function gazeToScreen(
  gazeH: number,
  gazeV: number,
  coefficientsX: number[],
  coefficientsY: number[]
): { x: number; y: number } {
  const features = [1, gazeH, gazeV, gazeH * gazeH, gazeV * gazeV, gazeH * gazeV];
  let x = 0, y = 0;
  for (let i = 0; i < 6; i++) {
    x += coefficientsX[i] * features[i];
    y += coefficientsY[i] * features[i];
  }
  // Clamp to valid range
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  return { x, y };
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  onClose,
  minimized = false,
  gestureControlEnabled = true,
  onGestureAction,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('face+hand');
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [fps, setFps] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const faceDetectorRef = useRef<FaceDetector | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const gestureRecognizerRef = useRef<GestureRecognizer | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  // Gesture control state
  const [currentGesture, setCurrentGesture] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [gestureControlActive, setGestureControlActive] = useState(gestureControlEnabled);
  const [lastActionFeedback, setLastActionFeedback] = useState<string | null>(null);

  // Gaze tracking state
  const [gazeDirection, setGazeDirection] = useState<GazeDirection>('center');
  const [gazeRatio, setGazeRatio] = useState<{ horizontal: number; vertical: number }>({ horizontal: 0.5, vertical: 0.5 });
  const [rawGazeRatio, setRawGazeRatio] = useState<{ horizontal: number; vertical: number }>({ horizontal: 0.5, vertical: 0.5 });
  const [gazeEnabled, setGazeEnabled] = useState(true);

  // Calibration state
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState(0);
  const [calibrationData, setCalibrationData] = useState<CalibrationData>({
    points: [],
    coefficientsX: [0, 1, 0, 0, 0, 0], // Default linear mapping
    coefficientsY: [0, 0, 1, 0, 0, 0],
    isCalibrated: false,
  });
  const [screenGazePoint, setScreenGazePoint] = useState<{ x: number; y: number } | null>(null);
  const [showScreenGaze, setShowScreenGaze] = useState(true);
  const [calibrationSamples, setCalibrationSamples] = useState<{ h: number; v: number }[]>([]);
  const calibrationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Split view state (camera + screen)
  const [splitViewEnabled, setSplitViewEnabled] = useState(false);
  const [screenCapture, setScreenCapture] = useState<string | null>(null);
  const screenCaptureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // Gesture tracking refs
  const lastGestureRef = useRef<string | null>(null);
  const gestureStartTimeRef = useRef<number>(0);
  const lastActionTimeRef = useRef<number>(0);
  const cursorPositionRef = useRef<{ x: number; y: number } | null>(null);

  // Get index finger tip position (landmark 8)
  const getFingerTipPosition = useCallback((landmarks: NormalizedLandmark[]) => {
    if (landmarks.length > 8) {
      const indexTip = landmarks[8];
      return {
        x: 1 - indexTip.x, // Mirror X for natural movement
        y: indexTip.y,
      };
    }
    return null;
  }, []);

  // ============ Gaze Calculation Functions ============

  // Get iris center from landmarks
  const getIrisCenter = useCallback((landmarks: NormalizedLandmark[], irisIndices: number[]) => {
    let x = 0, y = 0;
    for (const i of irisIndices) {
      if (landmarks[i]) {
        x += landmarks[i].x;
        y += landmarks[i].y;
      }
    }
    return { x: x / irisIndices.length, y: y / irisIndices.length };
  }, []);

  // Estimate head pose from face landmarks (yaw, pitch)
  const estimateHeadPose = useCallback((landmarks: NormalizedLandmark[]) => {
    const nose = landmarks[HEAD_POSE_LANDMARKS.noseTip];
    const chin = landmarks[HEAD_POSE_LANDMARKS.chin];
    const leftEye = landmarks[HEAD_POSE_LANDMARKS.leftEyeOuter];
    const rightEye = landmarks[HEAD_POSE_LANDMARKS.rightEyeOuter];
    const foreHead = landmarks[HEAD_POSE_LANDMARKS.foreHead];
    const noseBase = landmarks[HEAD_POSE_LANDMARKS.noseBase];

    if (!nose || !chin || !leftEye || !rightEye || !foreHead) {
      return { yaw: 0, pitch: 0 };
    }

    // Calculate yaw (horizontal head rotation) from eye positions
    // When looking right, right eye appears closer to nose
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeWidth = Math.abs(rightEye.x - leftEye.x);
    const noseOffsetX = nose.x - eyeMidX;
    // Yaw: -1 (looking left) to +1 (looking right)
    const yaw = eyeWidth > 0.01 ? (noseOffsetX / eyeWidth) * 2 : 0;

    // Calculate pitch (vertical head rotation) from nose-to-forehead vs nose-to-chin
    // When head tilts DOWN: chin moves up in video (smaller Y), forehead moves down (larger Y)
    // So noseToChin decreases, noseToForehead increases → pitch becomes NEGATIVE
    const noseToForehead = Math.abs(foreHead.y - nose.y);
    const noseToChin = Math.abs(chin.y - nose.y);
    // Pitch: POSITIVE when looking UP, NEGATIVE when looking DOWN (video coordinate system)
    const pitch = (noseToChin - noseToForehead) / (noseToChin + noseToForehead + 0.001);

    return { yaw, pitch };
  }, []);

  // ============ Advanced Gaze Calculation ============
  // Uses full eye contour, EAR-based weighting, head pose with roll, and One Euro filtering
  const calculateGazeRatio = useCallback((landmarks: NormalizedLandmark[]) => {
    // Check if we have enough landmarks
    // 478 = with iris, 468 = without iris
    if (landmarks.length < 468) {
      console.log(`[Gaze] Insufficient landmarks: ${landmarks.length}/468`);
      return null;
    }

    const hasIrisLandmarks = landmarks.length >= 478;

    // Debug: Log landmark count periodically
    if (Math.random() < 0.01) {
      console.log(`[Gaze DEBUG] Landmark count: ${landmarks.length}, hasIris: ${hasIrisLandmarks}`);
    }

    // ===== Step 1: Calculate Eye Aspect Ratio (EAR) for each eye =====
    // EAR indicates how open each eye is (higher = more open)
    const leftEAR = calculateEAR(landmarks, LEFT_EYE_EAR);
    const rightEAR = calculateEAR(landmarks, RIGHT_EYE_EAR);

    // Detect if user is blinking (EAR below threshold)
    const EAR_BLINK_THRESHOLD = 0.15;
    const isBlinking = leftEAR < EAR_BLINK_THRESHOLD && rightEAR < EAR_BLINK_THRESHOLD;
    if (isBlinking) {
      // Skip this frame during blink
      return null;
    }

    // Calculate eye openness weights (more open eye = more reliable)
    const totalEAR = leftEAR + rightEAR;
    const leftWeight = totalEAR > 0.01 ? leftEAR / totalEAR : 0.5;
    const rightWeight = totalEAR > 0.01 ? rightEAR / totalEAR : 0.5;

    // ===== Step 2: Get precise eye boundaries using full contour =====
    const leftEyeBounds = getEyeContourBounds(landmarks, LEFT_EYE_CONTOUR);
    const rightEyeBounds = getEyeContourBounds(landmarks, RIGHT_EYE_CONTOUR);

    // ===== Step 3: Get iris centers =====
    let leftIris: { x: number; y: number };
    let rightIris: { x: number; y: number };

    if (hasIrisLandmarks) {
      leftIris = getIrisCenter(landmarks, LEFT_IRIS);
      rightIris = getIrisCenter(landmarks, RIGHT_IRIS);
    } else {
      // Fallback: estimate from eye contour center
      leftIris = { x: leftEyeBounds.centerX, y: leftEyeBounds.centerY };
      rightIris = { x: rightEyeBounds.centerX, y: rightEyeBounds.centerY };
    }

    // ===== Step 4: Calculate per-eye gaze ratios using contour bounds =====
    const lWidth = leftEyeBounds.maxX - leftEyeBounds.minX;
    const rWidth = rightEyeBounds.maxX - rightEyeBounds.minX;
    const lHeight = leftEyeBounds.maxY - leftEyeBounds.minY;
    const rHeight = rightEyeBounds.maxY - rightEyeBounds.minY;

    // Debug: Check for invalid bounds
    if (lWidth <= 0 || rWidth <= 0 || lHeight <= 0 || rHeight <= 0) {
      console.warn(`[Gaze] Invalid eye bounds: lW=${lWidth.toFixed(4)} rW=${rWidth.toFixed(4)} lH=${lHeight.toFixed(4)} rH=${rHeight.toFixed(4)}`);
      return null;
    }

    // Horizontal gaze: iris position within eye (0 = looking left, 1 = looking right)
    // IMPORTANT: In a mirrored video display (CSS scaleX(-1)), we need to invert the horizontal
    // because MediaPipe processes the raw (non-mirrored) video
    const lRawH = lWidth > 0.001 ? (leftIris.x - leftEyeBounds.minX) / lWidth : 0.5;
    const rRawH = rWidth > 0.001 ? (rightIris.x - rightEyeBounds.minX) / rWidth : 0.5;

    // Debug log iris positions
    if (Math.random() < 0.02) {
      console.log(`[Gaze DEBUG Step4] LeftIris: (${leftIris.x.toFixed(4)}, ${leftIris.y.toFixed(4)}) in bounds [${leftEyeBounds.minX.toFixed(4)}, ${leftEyeBounds.maxX.toFixed(4)}]`);
      console.log(`[Gaze DEBUG Step4] lRawH=${lRawH.toFixed(3)}, rRawH=${rRawH.toFixed(3)}`);
    }

    // Vertical gaze: calculate offset from eye center and amplify
    const lIrisOffsetY = leftIris.y - leftEyeBounds.centerY;
    const rIrisOffsetY = rightIris.y - rightEyeBounds.centerY;

    // Adaptive vertical amplification based on EAR (more open = more amplification)
    const EAR_NORMAL = 0.3;
    const lVertAmp = 3.0 + (leftEAR / EAR_NORMAL) * 1.0;  // 3-4x amplification
    const rVertAmp = 3.0 + (rightEAR / EAR_NORMAL) * 1.0;

    const lRawV = lHeight > 0.001 ? 0.5 + (lIrisOffsetY / lHeight) * lVertAmp : 0.5;
    const rRawV = rHeight > 0.001 ? 0.5 + (rIrisOffsetY / rHeight) * rVertAmp : 0.5;

    // Apply One Euro Filter to each eye's gaze (reduces jitter while maintaining responsiveness)
    const lFilteredH = leftEyeHFilter.filter(lRawH);
    const lFilteredV = leftEyeVFilter.filter(lRawV);
    const rFilteredH = rightEyeHFilter.filter(rRawH);
    const rFilteredV = rightEyeVFilter.filter(rRawV);

    // ===== Step 5: Combine both eyes using EAR-based weighting =====
    // Eye that is more open contributes more to final gaze
    const irisGazeH = lFilteredH * leftWeight + rFilteredH * rightWeight;
    const irisGazeV = lFilteredV * leftWeight + rFilteredV * rightWeight;

    // ===== Step 6: Get enhanced head pose (including roll) =====
    const headPose = estimateHeadPose(landmarks);

    // Calculate head roll from eye corner positions
    const leftEyeOuter = landmarks[HEAD_POSE_LANDMARKS.leftEyeOuter];
    const rightEyeOuter = landmarks[HEAD_POSE_LANDMARKS.rightEyeOuter];
    let roll = 0;
    if (leftEyeOuter && rightEyeOuter) {
      const eyeDeltaY = rightEyeOuter.y - leftEyeOuter.y;
      const eyeDeltaX = rightEyeOuter.x - leftEyeOuter.x;
      roll = Math.atan2(eyeDeltaY, eyeDeltaX); // Radians
    }

    // Convert head pose to gaze contribution (0-1 scale)
    // HEAD POSE COORDINATE ANALYSIS:
    // - When user turns head LEFT: nose moves RIGHT in image, yaw > 0
    // - We want combinedH to be HIGH (so after inversion → indicator moves LEFT)
    // - So headGazeH = 0.5 + yaw (not minus)
    // - When user tilts head DOWN: pitch < 0 (nose closer to chin)
    // - We want indicator to move DOWN (higher top%), so combinedV should increase
    // - headGazeV = 0.5 - pitch = 0.5 - (-negative) = increases ✓
    const headGazeH = 0.5 + headPose.yaw * 0.4;  // Positive yaw (look left) → higher H → after inversion → moves left
    const headGazeV = 0.5 - headPose.pitch * 0.4; // Negative pitch (look down) → higher V → moves down

    // Apply roll compensation to gaze (rotate gaze vector by -roll)
    const cosRoll = Math.cos(-roll);
    const sinRoll = Math.sin(-roll);
    const centeredIrisH = irisGazeH - 0.5;
    const centeredIrisV = irisGazeV - 0.5;
    const rotatedIrisH = centeredIrisH * cosRoll - centeredIrisV * sinRoll + 0.5;
    const rotatedIrisV = centeredIrisH * sinRoll + centeredIrisV * cosRoll + 0.5;

    // ===== Step 7: Combine iris gaze with head pose (adaptive weighting) =====
    // When head is moving more, give more weight to head pose
    const headMovementMag = Math.abs(headPose.yaw) + Math.abs(headPose.pitch);
    const baseIrisWeight = 0.5;
    const adaptiveIrisWeight = Math.max(0.3, baseIrisWeight - headMovementMag * 0.5);
    const adaptiveHeadWeight = 1.0 - adaptiveIrisWeight;

    const combinedH = rotatedIrisH * adaptiveIrisWeight + headGazeH * adaptiveHeadWeight;
    const combinedV = rotatedIrisV * adaptiveIrisWeight + headGazeV * adaptiveHeadWeight;

    // ===== Step 8: Final One Euro filtering for smooth output =====
    // COORDINATE ANALYSIS for mirrored video (CSS scaleX(-1)):
    // - When user looks LEFT (their perspective), iris moves toward outer corner
    // - In camera image, outer corner has HIGHER x, so iris.x increases → combinedH increases
    // - Without inversion: indicator left% increases → moves RIGHT
    // - But user sees mirror, so they expect indicator to move LEFT with their gaze
    // - Therefore we INVERT horizontal to match mirror perception
    const invertedH = 1.0 - combinedH;
    const finalH = finalGazeHFilter.filter(Math.max(0, Math.min(1, invertedH)));
    const finalV = finalGazeVFilter.filter(Math.max(0, Math.min(1, combinedV)));

    // Also compute buffer-smoothed versions for compatibility
    const smoothedHorizontal = horizontalGazeBuffer.add(finalH);
    const smoothedVertical = verticalGazeBuffer.add(finalV);

    // Debug logging - log every ~5% of frames
    if (Math.random() < 0.05) {
      console.log(`[Gaze] ====== FRAME DEBUG ======`);
      console.log(`[Gaze] EAR: L=${leftEAR.toFixed(3)} R=${rightEAR.toFixed(3)} | Weights: L=${leftWeight.toFixed(2)} R=${rightWeight.toFixed(2)}`);
      console.log(`[Gaze] IrisGaze (EAR-weighted): H=${irisGazeH.toFixed(3)} V=${irisGazeV.toFixed(3)}`);
      console.log(`[Gaze] HeadPose: yaw=${headPose.yaw.toFixed(3)} pitch=${headPose.pitch.toFixed(3)} | headGaze: H=${headGazeH.toFixed(3)} V=${headGazeV.toFixed(3)}`);
      console.log(`[Gaze] Combined: H=${combinedH.toFixed(3)} V=${combinedV.toFixed(3)} | InvertedH=${invertedH.toFixed(3)}`);
      console.log(`[Gaze] Final (1Euro): H=${finalH.toFixed(3)} V=${finalV.toFixed(3)} | Smoothed: H=${smoothedHorizontal.toFixed(3)} V=${smoothedVertical.toFixed(3)}`);
    }

    // Determine direction using final smoothed values
    let direction: GazeDirection = 'center';
    if (smoothedHorizontal < 0.35) {
      direction = 'left';
    } else if (smoothedHorizontal > 0.65) {
      direction = 'right';
    } else if (smoothedVertical < 0.35) {
      direction = 'up';
    } else if (smoothedVertical > 0.65) {
      direction = 'down';
    }

    return {
      horizontal: smoothedHorizontal,
      vertical: smoothedVertical,
      rawHorizontal: finalH,
      rawVertical: finalV,
      direction,
      // Extra debug info
      leftEAR,
      rightEAR,
      roll: roll * 180 / Math.PI, // degrees
    };
  }, [getIrisCenter, estimateHeadPose]);

  // ============ Calibration Functions ============

  // Start calibration process
  const startCalibration = useCallback(() => {
    calibrationPointsRef.current = []; // Reset accumulated points
    setIsCalibrating(true);
    setCalibrationStep(0);
    setCalibrationSamples([]);
    setCalibrationData({
      points: [],
      coefficientsX: [0, 1, 0, 0, 0, 0],
      coefficientsY: [0, 0, 1, 0, 0, 0],
      isCalibrated: false,
    });
    console.log('[Calibration] Started - Move your gaze to each point');
  }, []);

  // Collect calibration samples for current point
  const collectCalibrationSample = useCallback((h: number, v: number) => {
    setCalibrationSamples(prev => [...prev, { h, v }]);
  }, []);

  // Accumulated points ref to avoid stale closure issues
  const calibrationPointsRef = useRef<CalibrationPoint[]>([]);

  // Finish calibration and compute polynomial coefficients
  const finishCalibration = useCallback((points: CalibrationPoint[]) => {
    console.log('[Calibration] Computing polynomial coefficients...');

    const { coefficientsX, coefficientsY } = fitPolynomial(points);

    setCalibrationData({
      points,
      coefficientsX,
      coefficientsY,
      isCalibrated: true,
    });

    setIsCalibrating(false);
    setCalibrationStep(0);
    setShowScreenGaze(true);

    console.log('[Calibration] Complete! Coefficients:', { coefficientsX, coefficientsY });
  }, []);

  // Move to next calibration point
  const nextCalibrationPoint = useCallback(() => {
    if (calibrationSamples.length === 0) return;

    // Average the collected samples
    const avgH = calibrationSamples.reduce((sum, s) => sum + s.h, 0) / calibrationSamples.length;
    const avgV = calibrationSamples.reduce((sum, s) => sum + s.v, 0) / calibrationSamples.length;

    const currentPos = CALIBRATION_POSITIONS[calibrationStep];
    const newPoint: CalibrationPoint = {
      screenX: currentPos.x,
      screenY: currentPos.y,
      gazeH: avgH,
      gazeV: avgV,
    };

    console.log(`[Calibration] Point ${calibrationStep + 1} collected: screen(${currentPos.x.toFixed(2)}, ${currentPos.y.toFixed(2)}) -> gaze(${avgH.toFixed(3)}, ${avgV.toFixed(3)})`);

    // Accumulate points in ref to avoid stale closure
    calibrationPointsRef.current = [...calibrationPointsRef.current, newPoint];

    setCalibrationData(prev => ({
      ...prev,
      points: calibrationPointsRef.current,
    }));

    setCalibrationSamples([]);

    if (calibrationStep + 1 >= CALIBRATION_POSITIONS.length) {
      // Calibration complete, compute coefficients using ref
      finishCalibration(calibrationPointsRef.current);
    } else {
      setCalibrationStep(prev => prev + 1);
    }
  }, [calibrationStep, calibrationSamples, finishCalibration]);

  // Cancel calibration
  const cancelCalibration = useCallback(() => {
    setIsCalibrating(false);
    setCalibrationStep(0);
    setCalibrationSamples([]);
    if (calibrationTimeoutRef.current) {
      clearTimeout(calibrationTimeoutRef.current);
    }
    console.log('[Calibration] Cancelled');
  }, []);

  // Update screen gaze point when calibrated
  useEffect(() => {
    if (calibrationData.isCalibrated && showScreenGaze && gazeEnabled) {
      // Apply smoothing to screen gaze point
      const rawPoint = gazeToScreen(
        gazeRatio.horizontal,
        gazeRatio.vertical,
        calibrationData.coefficientsX,
        calibrationData.coefficientsY
      );

      const smoothedX = screenGazeXBuffer.add(rawPoint.x);
      const smoothedY = screenGazeYBuffer.add(rawPoint.y);

      setScreenGazePoint({ x: smoothedX, y: smoothedY });
    } else if (!calibrationData.isCalibrated || !showScreenGaze) {
      setScreenGazePoint(null);
    }
  }, [gazeRatio, calibrationData, showScreenGaze, gazeEnabled]);

  // Check if gaze is close to target point
  const isGazeOnTarget = useCallback((gazeH: number, gazeV: number, targetX: number, targetY: number): boolean => {
    // Scale gaze ratio to screen coordinates (same formula as the indicator)
    // Scale gaze ratio to match calibration indicator position
    const scaledGazeX = 0.5 + (gazeH - 0.5) * (GAZE_SENSITIVITY / 100);
    const scaledGazeY = 0.5 + (gazeV - 0.5) * (GAZE_SENSITIVITY / 100);

    // Calculate distance to target (in normalized screen coordinates)
    const distance = Math.sqrt(
      Math.pow(scaledGazeX - targetX, 2) +
      Math.pow(scaledGazeY - targetY, 2)
    );

    // Threshold: 20% of screen size (fairly generous to make it easier)
    return distance < 0.20;
  }, []);

  // Auto-collect samples during calibration ONLY when gaze is on target
  // Use raw gaze values for target detection and sample collection
  useEffect(() => {
    if (isCalibrating && gazeEnabled && calibrationStep < CALIBRATION_POSITIONS.length) {
      const target = CALIBRATION_POSITIONS[calibrationStep];
      if (isGazeOnTarget(rawGazeRatio.horizontal, rawGazeRatio.vertical, target.x, target.y)) {
        collectCalibrationSample(rawGazeRatio.horizontal, rawGazeRatio.vertical);
      }
    }
  }, [isCalibrating, rawGazeRatio, gazeEnabled, collectCalibrationSample, calibrationStep, isGazeOnTarget]);

  // Auto-advance calibration points after collecting enough samples
  useEffect(() => {
    if (isCalibrating && calibrationSamples.length >= 30) {
      // Collected 30 samples (~1 second at 30fps), move to next point
      nextCalibrationPoint();
    }
  }, [isCalibrating, calibrationSamples.length, nextCalibrationPoint]);

  // ============ Screen Capture for Split View ============

  // Start screen capture stream
  const startScreenCapture = useCallback(async () => {
    try {
      // Use getDisplayMedia for screen capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
        } as MediaTrackConstraints,
        audio: false,
      });

      setScreenStream(stream);

      // Connect to video element
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
      }

      // Handle stream end (user stops sharing)
      stream.getVideoTracks()[0].onended = () => {
        stopScreenCapture();
        setSplitViewEnabled(false);
      };

      console.log('[CameraPreview] Screen capture started');
    } catch (err) {
      console.error('[CameraPreview] Failed to start screen capture:', err);
      setSplitViewEnabled(false);
    }
  }, []);

  // Stop screen capture
  const stopScreenCapture = useCallback(() => {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    console.log('[CameraPreview] Screen capture stopped');
  }, [screenStream]);

  // Toggle split view
  const toggleSplitView = useCallback(() => {
    if (splitViewEnabled) {
      stopScreenCapture();
      setSplitViewEnabled(false);
    } else {
      setSplitViewEnabled(true);
      startScreenCapture();
    }
  }, [splitViewEnabled, startScreenCapture, stopScreenCapture]);

  // Cleanup screen capture on unmount
  useEffect(() => {
    return () => {
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [screenStream]);

  // Check if fingers are pinched (thumb tip to index tip distance)
  const isPinching = useCallback((landmarks: NormalizedLandmark[]) => {
    if (landmarks.length > 8) {
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const distance = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
        Math.pow(thumbTip.y - indexTip.y, 2)
      );
      return distance < 0.05; // Threshold for pinch detection
    }
    return false;
  }, []);

  // Trigger gesture action
  const triggerGestureAction = useCallback((
    gesture: string,
    confidence: number,
    landmarks?: NormalizedLandmark[],
    handedness?: string
  ) => {
    if (!gestureControlActive) return;

    const now = Date.now();
    const gestureInfo = GESTURE_ACTIONS[gesture];
    if (!gestureInfo) return;

    // For pointing gesture, always update cursor position
    if (gesture === 'Pointing_Up' && landmarks) {
      const pos = getFingerTipPosition(landmarks);
      if (pos) {
        cursorPositionRef.current = pos;
        // Send cursor move event more frequently
        if (onGestureAction) {
          onGestureAction({
            action: 'cursor_move',
            gesture,
            confidence,
            position: pos,
            handedness: handedness as 'Left' | 'Right',
          });
        }
      }
      return; // Don't apply cooldown for cursor movement
    }

    // Check cooldown for other actions
    if (now - lastActionTimeRef.current < GESTURE_COOLDOWN) return;

    // Check hold time (gesture must be held for a minimum duration)
    if (lastGestureRef.current !== gesture) {
      lastGestureRef.current = gesture;
      gestureStartTimeRef.current = now;
      return;
    }

    if (now - gestureStartTimeRef.current < GESTURE_HOLD_TIME) return;

    // Trigger the action
    lastActionTimeRef.current = now;
    setLastActionFeedback(`${gestureInfo.icon} ${gestureInfo.action}`);

    // Clear feedback after 1 second
    setTimeout(() => setLastActionFeedback(null), 1000);

    // Call the callback
    if (onGestureAction) {
      const position = landmarks ? getFingerTipPosition(landmarks) : undefined;
      onGestureAction({
        action: gestureInfo.actionType,
        gesture,
        confidence,
        position: position || undefined,
        handedness: handedness as 'Left' | 'Right',
      });
    }

    // Also send via IPC if available
    if (window.hawkeye?.gestureControl) {
      window.hawkeye.gestureControl({
        action: gestureInfo.actionType,
        gesture,
        confidence,
        position: landmarks ? getFingerTipPosition(landmarks) : undefined,
        handedness,
      });
    }

    console.log(`[Gesture] Action triggered: ${gestureInfo.actionType} (${gesture})`);
  }, [gestureControlActive, onGestureAction, getFingerTipPosition]);

  // Initialize MediaPipe models
  const initializeModels = useCallback(async () => {
    if (detectionMode === 'none') {
      setModelReady(false);
      return;
    }

    setIsModelLoading(true);
    setModelReady(false);
    try {
      const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);

      // Load FaceLandmarker for 'face' or 'face+hand' mode (with iris landmarks for gaze tracking)
      if ((detectionMode === 'face' || detectionMode === 'face+hand') && !faceLandmarkerRef.current) {
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        console.log('[MediaPipe] FaceLandmarker initialized (478 landmarks with iris for gaze tracking)');
      }

      // Also load face detector for bounding box display
      if ((detectionMode === 'face' || detectionMode === 'face+hand') && !faceDetectorRef.current) {
        faceDetectorRef.current = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        });
        console.log('[MediaPipe] Face detector initialized');
      }

      // Load gesture recognizer for 'hand' or 'face+hand' mode
      if ((detectionMode === 'hand' || detectionMode === 'face+hand') && !gestureRecognizerRef.current) {
        gestureRecognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        console.log('[MediaPipe] Gesture recognizer initialized');
      }

      if (detectionMode === 'pose' && !poseLandmarkerRef.current) {
        poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        console.log('[MediaPipe] Pose landmarker initialized');
      }

      setModelReady(true);
    } catch (err) {
      console.error('[MediaPipe] Failed to initialize:', err);
      setModelReady(false);
    } finally {
      setIsModelLoading(false);
    }
  }, [detectionMode]);

  // Process frame with MediaPipe
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isActive) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Skip if video not ready
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // Update canvas size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const timestamp = performance.now();
    const drawingUtils = new DrawingUtils(ctx);

    try {
      // Face detection (for 'face' or 'face+hand' mode)
      if ((detectionMode === 'face' || detectionMode === 'face+hand') && faceDetectorRef.current) {
        const result = faceDetectorRef.current.detectForVideo(video, timestamp);
        if (result.detections) {
          for (const detection of result.detections) {
            const bbox = detection.boundingBox;
            if (bbox) {
              ctx.strokeStyle = '#00ff88';
              ctx.lineWidth = 3;
              ctx.strokeRect(bbox.originX, bbox.originY, bbox.width, bbox.height);

              const confidence = detection.categories?.[0]?.score ?? 0;
              ctx.fillStyle = '#00ff88';
              ctx.font = 'bold 14px sans-serif';
              ctx.fillText(
                `Face ${(confidence * 100).toFixed(0)}%`,
                bbox.originX,
                bbox.originY - 8
              );
            }

            if (detection.keypoints) {
              for (const keypoint of detection.keypoints) {
                ctx.beginPath();
                ctx.arc(keypoint.x * canvas.width, keypoint.y * canvas.height, 4, 0, 2 * Math.PI);
                ctx.fillStyle = '#ff4488';
                ctx.fill();
              }
            }
          }
        }
      }

      // Gaze tracking with FaceLandmarker (478 landmarks with iris)
      if ((detectionMode === 'face' || detectionMode === 'face+hand') && faceLandmarkerRef.current && gazeEnabled) {
        const faceLandmarkerResult = faceLandmarkerRef.current.detectForVideo(video, timestamp);
        if (faceLandmarkerResult.faceLandmarks && faceLandmarkerResult.faceLandmarks.length > 0) {
          const landmarks = faceLandmarkerResult.faceLandmarks[0];

          // Calculate gaze ratio and direction
          const gaze = calculateGazeRatio(landmarks);
          if (gaze) {
            setGazeDirection(gaze.direction);
            setGazeRatio({ horizontal: gaze.horizontal, vertical: gaze.vertical });
            setRawGazeRatio({ horizontal: gaze.rawHorizontal, vertical: gaze.rawVertical });

            // Debug: Log gaze values during calibration (every 10 frames)
            if (isCalibrating && frameCountRef.current % 10 === 0) {
              console.log(`[Gaze State Update] Setting rawGazeRatio: H=${gaze.rawHorizontal.toFixed(3)}, V=${gaze.rawVertical.toFixed(3)}, Landmarks: ${landmarks.length}`);
            }
            // Debug: Always log when value is extreme (near 0 or 1)
            if (gaze.rawHorizontal < 0.1 || gaze.rawHorizontal > 0.9 || gaze.rawVertical < 0.1 || gaze.rawVertical > 0.9) {
              console.warn(`[Gaze EXTREME] H=${gaze.rawHorizontal.toFixed(3)}, V=${gaze.rawVertical.toFixed(3)}, smoothedH=${gaze.horizontal.toFixed(3)}, smoothedV=${gaze.vertical.toFixed(3)}`);
            }

            // Draw iris landmarks (for visualization) - only if we have iris landmarks
            if (landmarks.length >= 478) {
              ctx.fillStyle = '#00ffff';
              for (const irisIndex of [...LEFT_IRIS, ...RIGHT_IRIS]) {
                if (landmarks[irisIndex]) {
                  const x = landmarks[irisIndex].x * canvas.width;
                  const y = landmarks[irisIndex].y * canvas.height;
                  ctx.beginPath();
                  ctx.arc(x, y, 2, 0, 2 * Math.PI);
                  ctx.fill();
                }
              }
            }

            // Draw iris centers
            let leftIrisCenter: { x: number; y: number };
            let rightIrisCenter: { x: number; y: number };

            if (landmarks.length >= 478) {
              leftIrisCenter = {
                x: LEFT_IRIS.reduce((sum, i) => sum + landmarks[i].x, 0) / LEFT_IRIS.length * canvas.width,
                y: LEFT_IRIS.reduce((sum, i) => sum + landmarks[i].y, 0) / LEFT_IRIS.length * canvas.height,
              };
              rightIrisCenter = {
                x: RIGHT_IRIS.reduce((sum, i) => sum + landmarks[i].x, 0) / RIGHT_IRIS.length * canvas.width,
                y: RIGHT_IRIS.reduce((sum, i) => sum + landmarks[i].y, 0) / RIGHT_IRIS.length * canvas.height,
              };
            } else {
              // Fallback: use eye corner centers
              const lOuter = landmarks[LEFT_EYE_CORNERS.outer];
              const lInner = landmarks[LEFT_EYE_CORNERS.inner];
              const rOuter = landmarks[RIGHT_EYE_CORNERS.outer];
              const rInner = landmarks[RIGHT_EYE_CORNERS.inner];

              leftIrisCenter = {
                x: (lOuter.x + lInner.x) / 2 * canvas.width,
                y: (landmarks[LEFT_EYE_VERTICAL.top].y + landmarks[LEFT_EYE_VERTICAL.bottom].y) / 2 * canvas.height,
              };
              rightIrisCenter = {
                x: (rOuter.x + rInner.x) / 2 * canvas.width,
                y: (landmarks[RIGHT_EYE_VERTICAL.top].y + landmarks[RIGHT_EYE_VERTICAL.bottom].y) / 2 * canvas.height,
              };
            }

            // Draw gaze direction indicator from iris centers
            const gazeLength = 30;
            const gazeAngleX = (gaze.horizontal - 0.5) * 2; // -1 to 1
            const gazeAngleY = (gaze.vertical - 0.5) * 2;   // -1 to 1

            ctx.strokeStyle = '#ff00ff';
            ctx.lineWidth = 2;

            // Left eye gaze line
            ctx.beginPath();
            ctx.moveTo(leftIrisCenter.x, leftIrisCenter.y);
            ctx.lineTo(
              leftIrisCenter.x + gazeAngleX * gazeLength,
              leftIrisCenter.y + gazeAngleY * gazeLength
            );
            ctx.stroke();

            // Right eye gaze line
            ctx.beginPath();
            ctx.moveTo(rightIrisCenter.x, rightIrisCenter.y);
            ctx.lineTo(
              rightIrisCenter.x + gazeAngleX * gazeLength,
              rightIrisCenter.y + gazeAngleY * gazeLength
            );
            ctx.stroke();

            // Draw iris center circles
            ctx.fillStyle = '#ff00ff';
            ctx.beginPath();
            ctx.arc(leftIrisCenter.x, leftIrisCenter.y, 4, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(rightIrisCenter.x, rightIrisCenter.y, 4, 0, 2 * Math.PI);
            ctx.fill();
          }

          // Optionally draw face mesh (subset of key landmarks)
          const keyFacePoints = [1, 33, 133, 362, 263, 61, 291, 199]; // nose, eyes, lips
          ctx.fillStyle = 'rgba(0, 255, 136, 0.5)';
          for (const idx of keyFacePoints) {
            if (landmarks[idx]) {
              ctx.beginPath();
              ctx.arc(landmarks[idx].x * canvas.width, landmarks[idx].y * canvas.height, 3, 0, 2 * Math.PI);
              ctx.fill();
            }
          }
        }
      }

      // Hand/Gesture detection (for 'hand' or 'face+hand' mode)
      if ((detectionMode === 'hand' || detectionMode === 'face+hand') && gestureRecognizerRef.current) {
        const result = gestureRecognizerRef.current.recognizeForVideo(video, timestamp);

        // Process gestures
        let detectedGesture: string | null = null;
        if (result.gestures && result.gestures.length > 0) {
          const gesture = result.gestures[0][0];
          if (gesture && gesture.score > 0.5) {
            detectedGesture = gesture.categoryName;

            // Trigger action
            const landmarks = result.landmarks?.[0];
            const handedness = result.handednesses?.[0]?.[0]?.categoryName;
            triggerGestureAction(gesture.categoryName, gesture.score, landmarks, handedness);
          }
        }
        setCurrentGesture(detectedGesture);

        // Draw hand landmarks
        if (result.landmarks) {
          for (let i = 0; i < result.landmarks.length; i++) {
            const landmarks = result.landmarks[i];
            const handedness = result.handednesses?.[i]?.[0];
            const gesture = result.gestures?.[i]?.[0];

            const gestureInfo = gesture ? GESTURE_ACTIONS[gesture.categoryName] : null;
            const handColor = gestureInfo?.color || (handedness?.categoryName === 'Left' ? '#00ccff' : '#ff6600');

            // Draw landmarks and connections
            drawingUtils.drawConnectors(
              landmarks,
              GestureRecognizer.HAND_CONNECTIONS,
              { color: handColor, lineWidth: 3 }
            );
            drawingUtils.drawLandmarks(landmarks, {
              color: '#ffffff',
              lineWidth: 1,
              radius: 4,
            });

            // Highlight index finger tip when pointing
            if (gesture?.categoryName === 'Pointing_Up' && landmarks[8]) {
              ctx.beginPath();
              ctx.arc(
                landmarks[8].x * canvas.width,
                landmarks[8].y * canvas.height,
                12, 0, 2 * Math.PI
              );
              ctx.strokeStyle = '#3b82f6';
              ctx.lineWidth = 3;
              ctx.stroke();
              ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
              ctx.fill();
            }

            // Draw pinch indicator
            if (isPinching(landmarks)) {
              const thumbTip = landmarks[4];
              const indexTip = landmarks[8];
              const midX = (thumbTip.x + indexTip.x) / 2 * canvas.width;
              const midY = (thumbTip.y + indexTip.y) / 2 * canvas.height;

              ctx.beginPath();
              ctx.arc(midX, midY, 15, 0, 2 * Math.PI);
              ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
              ctx.fill();
              ctx.strokeStyle = '#ef4444';
              ctx.lineWidth = 2;
              ctx.stroke();
            }

            // Draw hand label with gesture
            if (landmarks[0]) {
              const x = landmarks[0].x * canvas.width;
              const y = landmarks[0].y * canvas.height - 20;

              ctx.fillStyle = handColor;
              ctx.font = 'bold 14px sans-serif';

              if (gesture && gesture.score > 0.5 && gestureInfo) {
                ctx.fillText(
                  `${gestureInfo.icon} ${gestureInfo.action}`,
                  x, y - 20
                );
                ctx.fillText(
                  `${(gesture.score * 100).toFixed(0)}%`,
                  x, y
                );
              } else {
                ctx.fillText(
                  `${handedness?.categoryName || 'Hand'}`,
                  x, y
                );
              }
            }
          }
        }
      }

      if (detectionMode === 'pose' && poseLandmarkerRef.current) {
        const result = poseLandmarkerRef.current.detectForVideo(video, timestamp);
        if (result.landmarks) {
          for (const landmarks of result.landmarks) {
            drawingUtils.drawConnectors(
              landmarks,
              PoseLandmarker.POSE_CONNECTIONS,
              { color: '#00ff88', lineWidth: 3 }
            );
            drawingUtils.drawLandmarks(landmarks, {
              color: '#ff4488',
              lineWidth: 1,
              radius: 5,
            });
          }
        }
      }
    } catch (err) {
      console.error('[MediaPipe] Processing error:', err);
    }

    // Calculate FPS
    frameCountRef.current++;
    if (timestamp - lastFrameTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFrameTimeRef.current = timestamp;
    }

    animationRef.current = requestAnimationFrame(processFrame);
  }, [isActive, detectionMode, triggerGestureAction, isPinching, gazeEnabled, calculateGazeRatio, isCalibrating]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      cleanupModels();
    };
  }, []);

  useEffect(() => {
    if (isActive && detectionMode !== 'none') {
      initializeModels();
    }
  }, [isActive, detectionMode, initializeModels]);

  useEffect(() => {
    if (isActive) {
      animationRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, processFrame]);

  const cleanupModels = () => {
    faceDetectorRef.current?.close();
    faceLandmarkerRef.current?.close();
    gestureRecognizerRef.current?.close();
    poseLandmarkerRef.current?.close();
    faceDetectorRef.current = null;
    faceLandmarkerRef.current = null;
    gestureRecognizerRef.current = null;
    poseLandmarkerRef.current = null;
    setModelReady(false);
    setCurrentGesture(null);
    setGazeDirection('center');
    horizontalGazeBuffer.clear();
    verticalGazeBuffer.clear();
  };

  const startCamera = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsActive(true);
      }
    } catch (err) {
      console.error('[CameraPreview] Error accessing camera:', err);
      setError((err as Error).message || 'Failed to access camera');
      setIsActive(false);
    }
  };

  const stopCamera = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  };

  const toggleCamera = () => {
    if (isActive) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  const toggleGestureControl = () => {
    setGestureControlActive(!gestureControlActive);
  };

  const cycleDetectionMode = () => {
    // Cycle order: face+hand → hand → face → pose → none → face+hand...
    // Default is face+hand for simultaneous detection
    const modes: DetectionMode[] = ['face+hand', 'hand', 'face', 'pose', 'none'];
    const currentIndex = modes.indexOf(detectionMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setDetectionMode(modes[nextIndex]);
  };

  const getModeIcon = (mode: DetectionMode) => {
    switch (mode) {
      case 'face': return '😊';
      case 'hand': return '✋';
      case 'pose': return '🏃';
      case 'face+hand': return '😊✋';
      default: return '👁️';
    }
  };

  const getModeLabel = (mode: DetectionMode) => {
    switch (mode) {
      case 'face': return 'Face';
      case 'hand': return 'Hand';
      case 'pose': return 'Pose';
      case 'face+hand': return 'Face+Hand';
      default: return 'Off';
    }
  };

  if (error) {
    return (
      <div className={`camera-preview camera-preview-floating ${minimized ? 'minimized' : ''}`}>
        <div className="camera-preview-header">
          <span>📷 Camera</span>
          <div className="camera-preview-actions">
            <button className="btn-icon-small" onClick={startCamera} title="Retry">
              🔄
            </button>
            {onClose && (
              <button className="btn-close-small" onClick={onClose}>
                ×
              </button>
            )}
          </div>
        </div>
        <div className="camera-error">
          <span>⚠️</span>
          <p>{error}</p>
          <button className="btn btn-small" onClick={startCamera}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`camera-preview camera-preview-floating ${minimized ? 'minimized' : ''} ${splitViewEnabled ? 'split-view-mode' : ''}`}>
      <div className="camera-preview-header">
        <span>📷 {splitViewEnabled ? '分屏模式' : 'Camera'} {isActive ? '(Live)' : '(Paused)'}</span>
        <div className="camera-preview-actions">
          {(detectionMode === 'face' || detectionMode === 'face+hand') && gazeEnabled && (
            <>
              <button
                className={`btn-icon-small ${calibrationData.isCalibrated ? 'active' : ''}`}
                onClick={isCalibrating ? cancelCalibration : startCalibration}
                title={isCalibrating ? '取消校准' : (calibrationData.isCalibrated ? '重新校准' : '开始校准')}
              >
                {isCalibrating ? '❌' : '🎯'}
              </button>
              {calibrationData.isCalibrated && (
                <button
                  className={`btn-icon-small ${showScreenGaze ? 'active' : ''}`}
                  onClick={() => setShowScreenGaze(!showScreenGaze)}
                  title={showScreenGaze ? '隐藏屏幕视点' : '显示屏幕视点'}
                >
                  📍
                </button>
              )}
            </>
          )}
          {(detectionMode === 'face' || detectionMode === 'face+hand') && (
            <button
              className={`btn-icon-small ${gazeEnabled ? 'active' : ''}`}
              onClick={() => setGazeEnabled(!gazeEnabled)}
              title={gazeEnabled ? '视线追踪: 开启' : '视线追踪: 关闭'}
            >
              👁️
            </button>
          )}
          {/* Split View Toggle - Camera + Screen */}
          {calibrationData.isCalibrated && (
            <button
              className={`btn-icon-small ${splitViewEnabled ? 'active' : ''}`}
              onClick={toggleSplitView}
              title={splitViewEnabled ? '关闭分屏' : '分屏模式 (摄像头+屏幕)'}
            >
              🖥️
            </button>
          )}
          {(detectionMode === 'hand' || detectionMode === 'face+hand') && (
            <button
              className={`btn-icon-small ${gestureControlActive ? 'active' : ''}`}
              onClick={toggleGestureControl}
              title={gestureControlActive ? '手势控制: 开启' : '手势控制: 关闭'}
            >
              🎮
            </button>
          )}
          <button
            className={`btn-icon-small ${detectionMode !== 'none' ? 'active' : ''}`}
            onClick={cycleDetectionMode}
            title={`Detection: ${getModeLabel(detectionMode)}`}
          >
            {getModeIcon(detectionMode)}
          </button>
          <button
            className={`btn-icon-small ${isActive ? 'active' : ''}`}
            onClick={toggleCamera}
            title={isActive ? 'Pause' : 'Resume'}
          >
            {isActive ? '⏸️' : '▶️'}
          </button>
          {onClose && (
            <button className="btn-close-small" onClick={onClose}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* Split View Container: Camera + Screen side by side */}
      <div className={`camera-split-container ${splitViewEnabled ? 'split-enabled' : ''}`}>
        {/* Camera Section */}
        <div className={`camera-video-container ${splitViewEnabled ? 'split-camera' : ''}`}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`camera-video ${isActive ? 'active' : 'paused'}`}
          />
          <canvas
            ref={canvasRef}
            className="camera-overlay-canvas"
          />
          {!isActive && (
            <div className="camera-paused-overlay">
              <span>Camera Paused</span>
            </div>
          )}
          {isModelLoading && (
            <div className="camera-loading-overlay">
              <div className="camera-loading-spinner" />
              <span>Loading {getModeLabel(detectionMode)} Model...</span>
            </div>
          )}
          {isActive && detectionMode !== 'none' && (
            <div className="camera-mode-badge">
              <span>{getModeIcon(detectionMode)}</span>
              <span>{getModeLabel(detectionMode)}</span>
              {gestureControlActive && (detectionMode === 'hand' || detectionMode === 'face+hand') && (
                <span className="gesture-control-indicator">🎮</span>
              )}
              <span className="camera-fps">{fps} FPS</span>
            </div>
          )}
          {/* Gaze Direction Indicator */}
          {isActive && gazeEnabled && (detectionMode === 'face' || detectionMode === 'face+hand') && (
            <div className={`camera-gaze-badge gaze-${gazeDirection}`}>
              <span className="gaze-icon">
                {gazeDirection === 'left' && '👈'}
                {gazeDirection === 'right' && '👉'}
                {gazeDirection === 'up' && '👆'}
                {gazeDirection === 'down' && '👇'}
                {gazeDirection === 'center' && '👁️'}
              </span>
              <span className="gaze-label">
                {gazeDirection === 'left' && '看左边'}
                {gazeDirection === 'right' && '看右边'}
                {gazeDirection === 'up' && '看上面'}
                {gazeDirection === 'down' && '看下面'}
                {gazeDirection === 'center' && '看中间'}
              </span>
              <span className="gaze-ratio">
                H:{(gazeRatio.horizontal * 100).toFixed(0)}% V:{(gazeRatio.vertical * 100).toFixed(0)}%
              </span>
            </div>
          )}
          {/* Gesture Action Display */}
          {isActive && (detectionMode === 'hand' || detectionMode === 'face+hand') && currentGesture && GESTURE_ACTIONS[currentGesture] && (
            <div
              className="camera-gesture-badge"
              style={{
                background: `${GESTURE_ACTIONS[currentGesture].color}dd`,
                borderColor: GESTURE_ACTIONS[currentGesture].color
              }}
            >
              <span className="gesture-icon">{GESTURE_ACTIONS[currentGesture].icon}</span>
              <span className="gesture-action">{GESTURE_ACTIONS[currentGesture].action}</span>
            </div>
          )}
          {/* Action Feedback */}
          {lastActionFeedback && (
            <div className="camera-action-feedback">
              {lastActionFeedback}
            </div>
          )}
          {/* Gesture Control Status */}
          {(detectionMode === 'hand' || detectionMode === 'face+hand') && gestureControlActive && (
            <div className="camera-gesture-help">
              <div className="gesture-help-item">✌️ 截图</div>
              <div className="gesture-help-item">✊ 点击</div>
              <div className="gesture-help-item">☝️ 光标</div>
              <div className="gesture-help-item">🖐️ 暂停</div>
            </div>
          )}
          {/* Calibration Status Badge */}
          {calibrationData.isCalibrated && showScreenGaze && !splitViewEnabled && (
            <div className="camera-calibration-badge">
              <span>🎯</span>
              <span>已校准</span>
            </div>
          )}
          {/* Camera Label in Split View */}
          {splitViewEnabled && (
            <div className="split-view-label">📷 摄像头</div>
          )}
        </div>

        {/* Screen Capture Section (visible in split view) */}
        {splitViewEnabled && (
          <div className="screen-capture-container">
            <video
              ref={screenVideoRef}
              autoPlay
              playsInline
              muted
              className="screen-video"
            />
            {/* Gaze Point on Screen */}
            {screenGazePoint && calibrationData.isCalibrated && showScreenGaze && (
              <div
                className="screen-gaze-indicator"
                style={{
                  left: `${screenGazePoint.x * 100}%`,
                  top: `${screenGazePoint.y * 100}%`,
                }}
              >
                <div className="screen-gaze-dot" />
                <div className="screen-gaze-ring" />
              </div>
            )}
            {/* Screen Label */}
            <div className="split-view-label">🖥️ 屏幕 {screenGazePoint && `(${(screenGazePoint.x * 100).toFixed(0)}%, ${(screenGazePoint.y * 100).toFixed(0)}%)`}</div>
            {/* Waiting for screen share */}
            {!screenStream && (
              <div className="screen-waiting-overlay">
                <span>请选择要共享的屏幕</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Calibration Overlay - Fullscreen 9-point calibration */}
      {isCalibrating && (
        <div className="calibration-overlay">
          <div className="calibration-instructions">
            <h2>视线校准</h2>
            <p>移动眼睛，让蓝色圆点覆盖绿色目标点</p>
            <p>进度: {calibrationStep + 1} / {CALIBRATION_POSITIONS.length}</p>
            <p className="calibration-samples">采样: {calibrationSamples.length} / 30</p>
            {/* Debug display - shows raw gaze values */}
            <p style={{ fontFamily: 'monospace', fontSize: '14px', color: '#3b82f6', marginTop: '12px' }}>
              视线位置: H={((rawGazeRatio.horizontal - 0.5) * 100).toFixed(0)}% V={((rawGazeRatio.vertical - 0.5) * 100).toFixed(0)}%
            </p>
            <button className="calibration-cancel-btn" onClick={cancelCalibration}>
              取消校准
            </button>
          </div>
          {/* Real-time gaze indicator - shows where user is looking */}
          {/* Use raw gaze values for more responsive movement during calibration */}
          {/* Higher sensitivity (500x) for small eye movements */}
          <div
            className="calibration-gaze-indicator"
            style={{
              left: `${Math.max(0, Math.min(100, 50 + (calibrationGazeXBuffer.add(rawGazeRatio.horizontal) - 0.5) * GAZE_SENSITIVITY))}%`,
              top: `${Math.max(0, Math.min(100, 50 + (calibrationGazeYBuffer.add(rawGazeRatio.vertical) - 0.5) * GAZE_SENSITIVITY))}%`,
            }}
          >
            <div className="calibration-gaze-dot" />
            <div className="calibration-gaze-ring" />
            <div className="calibration-gaze-label">
              👁️ H:{(rawGazeRatio.horizontal * 100).toFixed(0)}% V:{(rawGazeRatio.vertical * 100).toFixed(0)}%
            </div>
          </div>
          {/* Calibration target points */}
          {CALIBRATION_POSITIONS.map((pos, index) => {
            // Check if current gaze is near this target (use raw values for responsive feedback)
            const isOnTarget = index === calibrationStep &&
              isGazeOnTarget(rawGazeRatio.horizontal, rawGazeRatio.vertical, pos.x, pos.y);

            return (
              <div
                key={index}
                className={`calibration-point ${index === calibrationStep ? 'active' : ''} ${index < calibrationStep ? 'completed' : ''} ${isOnTarget ? 'collecting' : ''}`}
                style={{
                  left: `${pos.x * 100}%`,
                  top: `${pos.y * 100}%`,
                }}
              >
                <div className="calibration-point-inner" />
                <div className="calibration-point-ring" />
                {index === calibrationStep && (
                  <div className="calibration-point-pulse" />
                )}
                <span className="calibration-point-label">
                  {index + 1}
                  {isOnTarget && ` ✓`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Screen Gaze Point Overlay - Shows where user is looking */}
      {screenGazePoint && calibrationData.isCalibrated && showScreenGaze && !isCalibrating && (
        <div className="screen-gaze-overlay">
          <div
            className="screen-gaze-point"
            style={{
              left: `${screenGazePoint.x * 100}%`,
              top: `${screenGazePoint.y * 100}%`,
            }}
          >
            <div className="gaze-point-core" />
            <div className="gaze-point-ring" />
            <div className="gaze-point-trail" />
          </div>
          <div className="screen-gaze-coords">
            X: {(screenGazePoint.x * 100).toFixed(1)}% Y: {(screenGazePoint.y * 100).toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraPreview;
