/**
 * useWebGazer - WebGazer.js 隐式校准集成 Hook
 *
 * 特点：
 * - 隐式校准：用户点击时自动收集训练数据，无需显示校准界面
 * - 岭回归模型：通过用户交互持续优化注视预测精度
 * - 纯客户端：所有数据处理在本地完成，不上传服务器
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// WebGazer 类型定义
interface WebGazerData {
  x: number;
  y: number;
}

interface WebGazerInstance {
  setRegression: (type: string) => WebGazerInstance;
  setTracker: (type: string) => WebGazerInstance;
  setGazeListener: (callback: (data: WebGazerData | null, clock: number) => void) => WebGazerInstance;
  begin: () => WebGazerInstance;
  end: () => void;
  pause: () => void;
  resume: () => void;
  isReady: () => boolean;
  showPredictionPoints: (show: boolean) => WebGazerInstance;
  showVideo: (show: boolean) => WebGazerInstance;
  showFaceOverlay: (show: boolean) => WebGazerInstance;
  showFaceFeedbackBox: (show: boolean) => WebGazerInstance;
  saveDataAcrossSessions: (save: boolean) => WebGazerInstance;
  applyKalmanFilter: (apply: boolean) => WebGazerInstance;
  clearData: () => void;
  // 校准相关
  recordScreenPosition: (x: number, y: number, type?: string) => void;
  params: {
    imgWidth: number;
    imgHeight: number;
    showVideo: boolean;
    showFaceOverlay: boolean;
    showFaceFeedbackBox: boolean;
  };
}

declare global {
  interface Window {
    webgazer: WebGazerInstance;
  }
}

export interface GazePoint {
  x: number; // 屏幕 X 坐标 (像素)
  y: number; // 屏幕 Y 坐标 (像素)
  normalizedX: number; // 归一化 X (0-1)
  normalizedY: number; // 归一化 Y (0-1)
  timestamp: number;
}

export interface CalibrationSample {
  id: string;
  x: number; // 点击的 X 坐标
  y: number; // 点击的 Y 坐标
  timestamp: number;
  faceSnapshot: string | null; // base64 图像数据
  isGlobal: boolean; // 是否是全局点击（app外）
}

export interface UseWebGazerOptions {
  /** 是否启用 */
  enabled?: boolean;
  /** 是否显示预测点（调试用） */
  showPredictionPoint?: boolean;
  /** 是否保存数据跨会话 */
  saveAcrossSessions?: boolean;
  /** 是否应用卡尔曼滤波平滑 */
  useKalmanFilter?: boolean;
  /** 注视点回调 */
  onGaze?: (point: GazePoint) => void;
}

export interface UseWebGazerReturn {
  /** 当前注视点 */
  gazePoint: GazePoint | null;
  /** WebGazer 是否已就绪 */
  isReady: boolean;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 暂停追踪 */
  pause: () => void;
  /** 恢复追踪 */
  resume: () => void;
  /** 清除校准数据 */
  clearCalibrationData: () => void;
  /** 手动添加校准点（可选：如果需要额外校准） */
  addCalibrationPoint: (x: number, y: number, isGlobal?: boolean) => void;
  /** 训练样本数量 */
  sampleCount: number;
  /** 校准样本列表（带人脸快照） */
  calibrationSamples: CalibrationSample[];
  /** 获取当前人脸快照 */
  captureFaceSnapshot: () => string | null;
}

export function useWebGazer(options: UseWebGazerOptions = {}): UseWebGazerReturn {
  const {
    enabled = true,
    showPredictionPoint = false,
    saveAcrossSessions = true,
    useKalmanFilter = true,
    onGaze,
  } = options;

  const [gazePoint, setGazePoint] = useState<GazePoint | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [calibrationSamples, setCalibrationSamples] = useState<CalibrationSample[]>([]);

  const webgazerRef = useRef<WebGazerInstance | null>(null);
  const onGazeRef = useRef(onGaze);
  const isPausedRef = useRef(false);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // 更新回调引用
  useEffect(() => {
    onGazeRef.current = onGaze;
  }, [onGaze]);

  // 初始化 WebGazer
  useEffect(() => {
    if (!enabled) return;

    let mounted = true;
    let checkReadyInterval: NodeJS.Timeout | null = null;

    const initWebGazer = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 动态导入 webgazer
        // 注意：webgazer 在 ESM 中可能通过 default export 导出，也可能挂载到 window
        const webgazerModule = await import('webgazer');

        if (!mounted) return;

        // 尝试从模块导出获取（ESM），然后回退到 window（UMD）
        const wg = (webgazerModule.default || webgazerModule || window.webgazer) as WebGazerInstance;

        if (!wg || typeof wg.begin !== 'function') {
          console.error('[WebGazer] Module loaded but invalid:', {
            hasDefault: !!webgazerModule.default,
            moduleKeys: Object.keys(webgazerModule),
            windowWebgazer: !!window.webgazer
          });
          throw new Error('WebGazer failed to load - invalid module structure');
        }

        // 同时也挂载到 window 以便其他地方使用
        if (!window.webgazer) {
          window.webgazer = wg;
        }

        webgazerRef.current = wg;

        // 配置 WebGazer
        wg.setRegression('ridge') // 岭回归
          .setGazeListener((data: WebGazerData | null, clock: number) => {
            if (!mounted || isPausedRef.current) return;

            if (data) {
              const point: GazePoint = {
                x: data.x,
                y: data.y,
                normalizedX: data.x / window.innerWidth,
                normalizedY: data.y / window.innerHeight,
                timestamp: clock,
              };

              setGazePoint(point);
              onGazeRef.current?.(point);
            }
          })
          .saveDataAcrossSessions(saveAcrossSessions)
          .applyKalmanFilter(useKalmanFilter)
          .showPredictionPoints(showPredictionPoint)
          .showVideo(false) // 隐藏视频预览
          .showFaceOverlay(false) // 隐藏人脸框
          .showFaceFeedbackBox(false); // 隐藏反馈框

        // 开始追踪
        wg.begin();

        // 检查就绪状态
        checkReadyInterval = setInterval(() => {
          if (wg.isReady()) {
            if (mounted) {
              setIsReady(true);
              setIsLoading(false);
              console.log('[WebGazer] Ready for gaze tracking');

              // 获取 WebGazer 的视频元素引用
              const videoEl = document.getElementById('webgazerVideoFeed') as HTMLVideoElement;
              if (videoEl) {
                videoElementRef.current = videoEl;
                console.log('[WebGazer] Video element captured for snapshots');
              }
            }
            if (checkReadyInterval) {
              clearInterval(checkReadyInterval);
            }
          }
        }, 100);

        // 捕获人脸快照的函数
        const captureFaceSnapshotInternal = (): string | null => {
          const videoEl = videoElementRef.current || document.getElementById('webgazerVideoFeed') as HTMLVideoElement;
          if (!videoEl || videoEl.readyState < 2) return null;

          try {
            const canvas = document.createElement('canvas');
            canvas.width = videoEl.videoWidth || 320;
            canvas.height = videoEl.videoHeight || 240;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.7);
          } catch (e) {
            console.warn('[WebGazer] Failed to capture face snapshot:', e);
            return null;
          }
        };

        // 监听点击事件来收集校准样本
        const handleClick = (event: MouseEvent) => {
          const snapshot = captureFaceSnapshotInternal();
          const sample: CalibrationSample = {
            id: `sample-${Date.now()}`,
            x: event.screenX, // 使用屏幕坐标
            y: event.screenY,
            timestamp: Date.now(),
            faceSnapshot: snapshot,
            isGlobal: false,
          };

          setSampleCount(prev => prev + 1);
          setCalibrationSamples(prev => [...prev.slice(-19), sample]); // 保留最近20个样本
        };
        window.addEventListener('click', handleClick);

        // 清理函数中移除监听器
        return () => {
          window.removeEventListener('click', handleClick);
        };

      } catch (err) {
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to initialize WebGazer';
          setError(errorMsg);
          setIsLoading(false);
          console.error('[WebGazer] Initialization error:', err);
        }
      }
    };

    initWebGazer();

    return () => {
      mounted = false;
      if (checkReadyInterval) {
        clearInterval(checkReadyInterval);
      }
      if (webgazerRef.current) {
        try {
          webgazerRef.current.end();
        } catch (e) {
          console.warn('[WebGazer] Error during cleanup:', e);
        }
      }
    };
  }, [enabled, showPredictionPoint, saveAcrossSessions, useKalmanFilter]);

  // 暂停追踪
  const pause = useCallback(() => {
    isPausedRef.current = true;
    webgazerRef.current?.pause();
  }, []);

  // 恢复追踪
  const resume = useCallback(() => {
    isPausedRef.current = false;
    webgazerRef.current?.resume();
  }, []);

  // 清除校准数据
  const clearCalibrationData = useCallback(() => {
    webgazerRef.current?.clearData();
    setSampleCount(0);
    setCalibrationSamples([]);
    console.log('[WebGazer] Calibration data cleared');
  }, []);

  // 捕获人脸快照
  const captureFaceSnapshot = useCallback((): string | null => {
    const videoEl = videoElementRef.current || document.getElementById('webgazerVideoFeed') as HTMLVideoElement;
    if (!videoEl || videoEl.readyState < 2) return null;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 320;
      canvas.height = videoEl.videoHeight || 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      console.warn('[WebGazer] Failed to capture face snapshot:', e);
      return null;
    }
  }, []);

  // 手动添加校准点（支持全局点击）
  const addCalibrationPoint = useCallback((x: number, y: number, isGlobal: boolean = false) => {
    webgazerRef.current?.recordScreenPosition(x, y);

    const snapshot = captureFaceSnapshot();
    const sample: CalibrationSample = {
      id: `sample-${Date.now()}`,
      x,
      y,
      timestamp: Date.now(),
      faceSnapshot: snapshot,
      isGlobal,
    };

    setSampleCount(prev => prev + 1);
    setCalibrationSamples(prev => [...prev.slice(-19), sample]);
  }, [captureFaceSnapshot]);

  return {
    gazePoint,
    isReady,
    isLoading,
    error,
    pause,
    resume,
    clearCalibrationData,
    addCalibrationPoint,
    sampleCount,
    calibrationSamples,
    captureFaceSnapshot,
  };
}

export default useWebGazer;
