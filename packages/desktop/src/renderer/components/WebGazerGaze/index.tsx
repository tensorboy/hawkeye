/**
 * WebGazerGaze - 基于 WebGazer.js 的注视追踪组件
 *
 * 特点：
 * - 隐式校准：用户点击时自动收集训练数据
 * - 无需显示校准界面
 * - 越用越准确
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useWebGazer, GazePoint, CalibrationSample } from '../../hooks/useWebGazer';
import './WebGazerGaze.css';

interface WebGazerGazeProps {
  /** 是否启用 */
  enabled?: boolean;
  /** 是否显示注视点指示器 */
  showIndicator?: boolean;
  /** 指示器大小 */
  indicatorSize?: number;
  /** 注视点回调 */
  onGaze?: (point: GazePoint) => void;
  /** 是否显示调试信息 */
  showDebug?: boolean;
  /** 是否启用全局点击捕获（app外也能校准） */
  enableGlobalClick?: boolean;
}

export const WebGazerGaze: React.FC<WebGazerGazeProps> = ({
  enabled = true,
  showIndicator = true,
  indicatorSize = 30,
  onGaze,
  showDebug = false,
  enableGlobalClick = true,
}) => {
  const [indicatorVisible, setIndicatorVisible] = useState(true);
  const [globalClickEnabled, setGlobalClickEnabled] = useState(enableGlobalClick);
  const [globalClickRunning, setGlobalClickRunning] = useState(false);

  const handleGaze = useCallback((point: GazePoint) => {
    onGaze?.(point);
  }, [onGaze]);

  const {
    gazePoint,
    isReady,
    isLoading,
    error,
    sampleCount,
    calibrationSamples,
    clearCalibrationData,
    pause,
    resume,
    addCalibrationPoint,
  } = useWebGazer({
    enabled,
    onGaze: handleGaze,
    showPredictionPoint: false, // 我们自己绘制指示器
    saveAcrossSessions: true,
    useKalmanFilter: true,
  });

  const [showSamples, setShowSamples] = useState(true);

  // 全局点击监听
  useEffect(() => {
    if (!globalClickEnabled || !isReady) return;
    if (!window.hawkeye?.globalClick) {
      console.warn('[WebGazerGaze] globalClick API not available');
      return;
    }

    // 启动全局点击监听
    window.hawkeye.globalClick.start().then((result: { success: boolean }) => {
      if (result.success) {
        setGlobalClickRunning(true);
        console.log('[WebGazerGaze] Global click capture started');
      }
    });

    // 监听全局点击事件
    const cleanup = window.hawkeye.globalClick.onEvent((event: {
      x: number;
      y: number;
      button: number;
      timestamp: number;
      isInsideApp: boolean;
    }) => {
      // 只处理 app 外的点击（app 内的由 WebGazer 自己处理）
      if (!event.isInsideApp) {
        addCalibrationPoint(event.x, event.y, true);
        console.log(`[WebGazerGaze] Global click at (${event.x}, ${event.y})`);
      }
    });

    return () => {
      cleanup();
      window.hawkeye?.globalClick?.stop();
      setGlobalClickRunning(false);
    };
  }, [globalClickEnabled, isReady, addCalibrationPoint]);

  // 切换全局点击捕获
  const toggleGlobalClick = useCallback(async () => {
    if (!window.hawkeye?.globalClick) return;

    if (globalClickRunning) {
      await window.hawkeye.globalClick.stop();
      setGlobalClickRunning(false);
      setGlobalClickEnabled(false);
    } else {
      const result = await window.hawkeye.globalClick.start();
      if (result.success) {
        setGlobalClickRunning(true);
        setGlobalClickEnabled(true);
      }
    }
  }, [globalClickRunning]);

  // 如果未启用或出错，不渲染
  if (!enabled) return null;

  return (
    <>
      {/* 加载状态 */}
      {isLoading && (
        <div className="webgazer-loading">
          <div className="webgazer-loading-spinner" />
          <span>正在初始化眼动追踪...</span>
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div className="webgazer-error">
          <span>眼动追踪初始化失败: {error}</span>
        </div>
      )}

      {/* 注视点指示器 */}
      {isReady && showIndicator && indicatorVisible && gazePoint && (
        <div
          className="webgazer-indicator"
          style={{
            left: gazePoint.x - indicatorSize / 2,
            top: gazePoint.y - indicatorSize / 2,
            width: indicatorSize,
            height: indicatorSize,
          }}
        >
          <div className="webgazer-indicator-inner" />
          <div className="webgazer-indicator-ring" />
        </div>
      )}

      {/* 调试信息 */}
      {showDebug && isReady && (
        <div className="webgazer-debug">
          <div className="webgazer-debug-title">WebGazer Debug</div>
          <div className="webgazer-debug-row">
            <span>状态:</span>
            <span className="webgazer-debug-value">
              {isReady ? '就绪' : isLoading ? '加载中' : '未启动'}
            </span>
          </div>
          <div className="webgazer-debug-row">
            <span>训练样本:</span>
            <span className="webgazer-debug-value">{sampleCount}</span>
          </div>
          <div className="webgazer-debug-row">
            <span>全局捕获:</span>
            <span className={`webgazer-debug-value ${globalClickRunning ? 'active' : ''}`}>
              {globalClickRunning ? '已启用' : '已禁用'}
            </span>
          </div>
          {gazePoint && (
            <>
              <div className="webgazer-debug-row">
                <span>X:</span>
                <span className="webgazer-debug-value">{gazePoint.x.toFixed(0)}px</span>
              </div>
              <div className="webgazer-debug-row">
                <span>Y:</span>
                <span className="webgazer-debug-value">{gazePoint.y.toFixed(0)}px</span>
              </div>
              <div className="webgazer-debug-row">
                <span>归一化:</span>
                <span className="webgazer-debug-value">
                  ({gazePoint.normalizedX.toFixed(2)}, {gazePoint.normalizedY.toFixed(2)})
                </span>
              </div>
            </>
          )}
          <div className="webgazer-debug-actions">
            <button onClick={() => setIndicatorVisible(!indicatorVisible)}>
              {indicatorVisible ? '隐藏指示器' : '显示指示器'}
            </button>
            <button onClick={() => setShowSamples(!showSamples)}>
              {showSamples ? '隐藏样本' : '显示样本'}
            </button>
            <button
              onClick={toggleGlobalClick}
              className={globalClickRunning ? 'active' : ''}
            >
              {globalClickRunning ? '停止全局' : '全局捕获'}
            </button>
            <button onClick={clearCalibrationData}>清除数据</button>
            <button onClick={pause}>暂停</button>
            <button onClick={resume}>恢复</button>
          </div>
          <div className="webgazer-debug-tip">
            提示: 正常点击屏幕会自动收集校准数据
          </div>

          {/* 校准样本可视化 */}
          {showSamples && calibrationSamples.length > 0 && (
            <div className="webgazer-samples">
              <div className="webgazer-samples-title">
                校准样本 ({calibrationSamples.length})
              </div>
              <div className="webgazer-samples-grid">
                {calibrationSamples.slice().reverse().map((sample) => (
                  <div key={sample.id} className={`webgazer-sample-item ${sample.isGlobal ? 'global' : ''}`}>
                    <div className="webgazer-sample-face">
                      {sample.faceSnapshot ? (
                        <img src={sample.faceSnapshot} alt="Face" />
                      ) : (
                        <div className="webgazer-sample-no-face">无图像</div>
                      )}
                    </div>
                    <div className="webgazer-sample-info">
                      <span className="webgazer-sample-coords">
                        ({sample.x}, {sample.y})
                      </span>
                      {sample.isGlobal && (
                        <span className="webgazer-sample-global-badge">全局</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default WebGazerGaze;
