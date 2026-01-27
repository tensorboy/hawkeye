/**
 * 感知模块 - 获取屏幕、窗口、剪贴板等信息
 */

export { ScreenCapture, screenCapture } from './screen';
export type {
  ScreenCaptureConfig,
  VisionResult,
  UIElement,
  ExtendedScreenCapture,
  VisionAnalyzer,
} from './screen';

export { WindowTracker } from './window';
export { ClipboardWatcher } from './clipboard';
export { PerceptionEngine } from './engine';

export {
  OCRManager,
  ocrManager,
  PaddleOCRBackend,
  SystemOCRBackend,
  VisionAPIBackend,
} from './ocr';
export type {
  OCRConfig,
  OCRBackend,
  OCRResult,
  OCRRegion,
  IOCRBackend,
} from './ocr';

// Browser Perception (基于 agent-browser accessibility tree)
export {
  BrowserPerception,
  createBrowserPerception,
  getBrowserPerception,
  setBrowserPerception,
} from './browser';
export type {
  BrowserPerceptionConfig,
  BrowserContext,
  SimplifiedElement,
} from './browser';

// Screen Coordinate Scaling (Anthropic Computer Use pattern)
export {
  ScreenScaler,
  createScreenScaler,
  TARGET_RESOLUTIONS,
} from './screen-scaling';
export type {
  Point,
  Size,
  ScalingConfig,
  ScalingFactors,
  ResolutionPreset,
} from './screen-scaling';

// Accessibility API (macOS AXorcist-style)
export { AccessibilityService } from './accessibility';
export type {
  AXElement,
  AXWindow,
  AXApplication,
  FocusedElement,
} from './accessibility';
