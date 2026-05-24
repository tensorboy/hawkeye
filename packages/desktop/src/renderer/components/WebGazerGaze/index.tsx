/**
 * WebGazerGaze - 基于 WebGazer.js 的注视追踪组件
 *
 * 特点：
 * - 隐式校准：用户点击时自动收集训练数据
 * - 无需显示校准界面
 * - 越用越准确
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [mousePosLocal, setMousePosLocal] = useState<{ x: number; y: number } | null>(null);

  // 追踪全局鼠标屏幕坐标（debug 数字显示）
  useEffect(() => {
    if (!showDebug) return;
    const getCursorPos = window.hawkeye?.globalClick?.getCursorPosition;
    if (!getCursorPos) return;
    let active = true;
    const poll = async () => {
      while (active) {
        try {
          const pos = await getCursorPos();
          if (active) setMousePos(pos);
        } catch {}
        await new Promise(r => setTimeout(r, 33));
      }
    };
    poll();
    return () => { active = false; };
  }, [showDebug]);

  // 追踪窗口内鼠标位置（可视化指示器定位）
  useEffect(() => {
    if (!showDebug) return;
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosLocal({ x: e.clientX, y: e.clientY });
      // 没有全局 API 时也更新 mousePos
      if (!window.hawkeye?.globalClick?.getCursorPosition) {
        setMousePos({ x: e.clientX, y: e.clientY });
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [showDebug]);

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

  // 将注视点数据发送到全屏覆盖窗口
  const overlayLogCountRef = useRef(0);
  useEffect(() => {
    if (!gazePoint || !isReady) {
      window.hawkeye?.gazeOverlay?.updateGaze(null);
      return;
    }
    // 将窗口内坐标转换为屏幕坐标
    const titleBarHeight = window.outerHeight - window.innerHeight;
    const screenGazeX = Math.round(gazePoint.x + window.screenX);
    const screenGazeY = Math.round(gazePoint.y + window.screenY + titleBarHeight);
    window.hawkeye?.gazeOverlay?.updateGaze({ x: screenGazeX, y: screenGazeY });
    if (overlayLogCountRef.current < 3) {
      overlayLogCountRef.current++;
      console.log(`[WebGazerGaze] Sent gaze to overlay #${overlayLogCountRef.current}: (${screenGazeX}, ${screenGazeY})`);
    }
  }, [gazePoint, isReady]);

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

      {/* 注视点指示器（蓝色） */}
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

      {/* 鼠标位置指示器（绿色） */}
      {isReady && showDebug && indicatorVisible && mousePosLocal && (
        <div
          className="webgazer-mouse-indicator"
          style={{
            left: mousePosLocal.x - 8,
            top: mousePosLocal.y - 8,
            width: 16,
            height: 16,
          }}
        />
      )}

      {/* 偏差连线 */}
      {isReady && showDebug && indicatorVisible && gazePoint && mousePosLocal && (
        <svg className="webgazer-deviation-line" style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9998 }}>
          <line
            x1={gazePoint.x}
            y1={gazePoint.y}
            x2={mousePosLocal.x}
            y2={mousePosLocal.y}
            stroke="rgba(255, 255, 0, 0.5)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <text
            x={(gazePoint.x + mousePosLocal.x) / 2 + 8}
            y={(gazePoint.y + mousePosLocal.y) / 2 - 8}
            fill="rgba(255, 255, 0, 0.8)"
            fontSize="11"
            fontFamily="SF Mono, Monaco, monospace"
          >
            {Math.round(Math.sqrt(
              Math.pow(gazePoint.x - mousePosLocal.x, 2) +
              Math.pow(gazePoint.y - mousePosLocal.y, 2)
            ))}px
          </text>
        </svg>
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
                <span>👁 注视 X:</span>
                <span className="webgazer-debug-value">{gazePoint.x.toFixed(0)}px</span>
              </div>
              <div className="webgazer-debug-row">
                <span>👁 注视 Y:</span>
                <span className="webgazer-debug-value">{gazePoint.y.toFixed(0)}px</span>
              </div>
            </>
          )}
          {mousePos && (
            <>
              <div className="webgazer-debug-row">
                <span>🖱 鼠标 X:</span>
                <span className="webgazer-debug-value">{mousePos.x}px</span>
              </div>
              <div className="webgazer-debug-row">
                <span>🖱 鼠标 Y:</span>
                <span className="webgazer-debug-value">{mousePos.y}px</span>
              </div>
            </>
          )}
          {gazePoint && mousePos && (
            <div className="webgazer-debug-row">
              <span>偏差:</span>
              <span className="webgazer-debug-value">
                {Math.round(Math.sqrt(
                  Math.pow(gazePoint.x - mousePos.x, 2) +
                  Math.pow(gazePoint.y - mousePos.y, 2)
                ))}px
              </span>
            </div>
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
