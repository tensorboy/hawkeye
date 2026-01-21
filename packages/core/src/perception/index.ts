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
