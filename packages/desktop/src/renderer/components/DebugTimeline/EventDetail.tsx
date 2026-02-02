/**
 * EventDetail - Event detail popup/panel
 */

import React, { useState } from 'react';
import { DebugEvent, EVENT_TYPE_CONFIG } from './types';

interface EventDetailProps {
  event: DebugEvent | null;
  onClose: () => void;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// Helper to safely convert unknown to string for display
const toStr = (val: unknown): string => {
  if (val === undefined || val === null) return '';
  return String(val);
};

export const EventDetail: React.FC<EventDetailProps> = ({ event, onClose }) => {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  if (!event) return null;

  const config = EVENT_TYPE_CONFIG[event.type];
  const data = event.data as Record<string, unknown>;

  const renderContent = () => {
    switch (event.type) {
      case 'screenshot':
        return (
          <div className="detail-content">
            <div className="detail-row">
              <span className="detail-label">尺寸:</span>
              <span className="detail-value">{toStr(data.width)}x{toStr(data.height)}</span>
            </div>
            {data.size && (
              <div className="detail-row">
                <span className="detail-label">大小:</span>
                <span className="detail-value">{Math.round((data.size as number) / 1024)} KB</span>
              </div>
            )}
            {data.thumbnail && (
              <div className="detail-thumbnail">
                <img src={data.thumbnail as string} alt="Screenshot thumbnail" />
              </div>
            )}
          </div>
        );

      case 'ocr':
        const ocrRegions = (data.regions as Array<{
          text: string;
          confidence: number;
          bbox: [number, number, number, number];
        }>) || [];
        const hasScreenshot = !!data.thumbnail;
        const screenshotWidth = (data.screenshotWidth as number) || 0;
        const screenshotHeight = (data.screenshotHeight as number) || 0;

        return (
          <div className="detail-content">
            <div className="detail-row">
              <span className="detail-label">后端:</span>
              <span className="detail-value">{toStr(data.backend)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">字符数:</span>
              <span className="detail-value">{toStr(data.charCount)}</span>
            </div>
            {data.confidence && (
              <div className="detail-row">
                <span className="detail-label">置信度:</span>
                <span className="detail-value">{((data.confidence as number) * 100).toFixed(1)}%</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">耗时:</span>
              <span className="detail-value">{formatDuration(data.duration as number)}</span>
            </div>

            {/* Screenshot thumbnail with OCR visualization */}
            {hasScreenshot && (
              <div className="detail-ocr-visualization">
                <span className="detail-label">原图 {screenshotWidth && screenshotHeight ? `(${screenshotWidth}×${screenshotHeight})` : ''} <span className="click-hint">(点击放大)</span>:</span>
                <div
                  className="ocr-image-container clickable"
                  onClick={() => setZoomedImage(data.thumbnail as string)}
                >
                  <img
                    src={data.thumbnail as string}
                    alt="OCR source screenshot"
                    className="ocr-source-image"
                  />
                  {/* OCR region overlays */}
                  {ocrRegions.length > 0 && screenshotWidth > 0 && (
                    <svg
                      className="ocr-regions-overlay"
                      viewBox={`0 0 ${screenshotWidth} ${screenshotHeight}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {ocrRegions.map((region, idx) => {
                        const [x, y, w, h] = region.bbox;
                        // Skip invalid bounding boxes
                        if (x === 0 && y === 0 && w === 0 && h === 0) return null;
                        return (
                          <g key={idx}>
                            <rect
                              x={x}
                              y={y}
                              width={w}
                              height={h}
                              fill="rgba(59, 130, 246, 0.15)"
                              stroke="rgba(59, 130, 246, 0.8)"
                              strokeWidth="2"
                            />
                            <title>{region.text} ({(region.confidence * 100).toFixed(1)}%)</title>
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>
                {ocrRegions.length > 0 && (
                  <div className="ocr-regions-count">
                    识别区域: {ocrRegions.filter(r => !(r.bbox[0] === 0 && r.bbox[1] === 0 && r.bbox[2] === 0 && r.bbox[3] === 0)).length} 个
                  </div>
                )}
              </div>
            )}

            <div className="detail-text">
              <span className="detail-label">识别文本:</span>
              <pre>{toStr(data.text)}</pre>
            </div>
          </div>
        );

      case 'clipboard':
        return (
          <div className="detail-content">
            <div className="detail-row">
              <span className="detail-label">类型:</span>
              <span className="detail-value">{toStr(data.type)}</span>
            </div>
            {data.truncated && (
              <div className="detail-row">
                <span className="detail-label">状态:</span>
                <span className="detail-value warning">内容已截断</span>
              </div>
            )}
            <div className="detail-text">
              <span className="detail-label">内容:</span>
              <pre>{toStr(data.content)}</pre>
            </div>
          </div>
        );

      case 'window':
        return (
          <div className="detail-content">
            <div className="detail-row">
              <span className="detail-label">应用名:</span>
              <span className="detail-value">{toStr(data.appName)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">窗口标题:</span>
              <span className="detail-value">{toStr(data.title)}</span>
            </div>
            {data.bundleId && (
              <div className="detail-row">
                <span className="detail-label">Bundle ID:</span>
                <span className="detail-value">{toStr(data.bundleId)}</span>
              </div>
            )}
            {data.path && (
              <div className="detail-row">
                <span className="detail-label">路径:</span>
                <span className="detail-value">{toStr(data.path)}</span>
              </div>
            )}
          </div>
        );

      case 'file':
        return (
          <div className="detail-content">
            <div className="detail-row">
              <span className="detail-label">操作:</span>
              <span className="detail-value">{toStr(data.operation)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">路径:</span>
              <span className="detail-value">{toStr(data.path)}</span>
            </div>
            {data.oldPath && (
              <div className="detail-row">
                <span className="detail-label">原路径:</span>
                <span className="detail-value">{toStr(data.oldPath)}</span>
              </div>
            )}
          </div>
        );

      case 'llm_input':
        return (
          <div className="detail-content">
            {data.model && (
              <div className="detail-row">
                <span className="detail-label">模型:</span>
                <span className="detail-value">{toStr(data.model)}</span>
              </div>
            )}
            {data.provider && (
              <div className="detail-row">
                <span className="detail-label">Provider:</span>
                <span className="detail-value">{toStr(data.provider)}</span>
              </div>
            )}
            {data.systemPrompt && (
              <div className="detail-text">
                <span className="detail-label">System Prompt:</span>
                <pre>{toStr(data.systemPrompt)}</pre>
              </div>
            )}
            <div className="detail-text">
              <span className="detail-label">User Message:</span>
              <pre>{toStr(data.userMessage)}</pre>
            </div>
          </div>
        );

      case 'llm_output':
        return (
          <div className="detail-content">
            {data.model && (
              <div className="detail-row">
                <span className="detail-label">模型:</span>
                <span className="detail-value">{toStr(data.model)}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">耗时:</span>
              <span className="detail-value">{formatDuration(data.duration as number)}</span>
            </div>
            {data.inputTokens && (
              <div className="detail-row">
                <span className="detail-label">输入 Tokens:</span>
                <span className="detail-value">{toStr(data.inputTokens)}</span>
              </div>
            )}
            {data.outputTokens && (
              <div className="detail-row">
                <span className="detail-label">输出 Tokens:</span>
                <span className="detail-value">{toStr(data.outputTokens)}</span>
              </div>
            )}
            {data.totalTokens && (
              <div className="detail-row">
                <span className="detail-label">总 Tokens:</span>
                <span className="detail-value">{toStr(data.totalTokens)}</span>
              </div>
            )}
            {data.finishReason && (
              <div className="detail-row">
                <span className="detail-label">结束原因:</span>
                <span className="detail-value">{toStr(data.finishReason)}</span>
              </div>
            )}
            <div className="detail-text">
              <span className="detail-label">响应:</span>
              <pre>{toStr(data.response)}</pre>
            </div>
          </div>
        );

      case 'intent':
        const intents = (data.intents as Array<{
          id: string;
          type: string;
          description: string;
          confidence: number;
        }>) || [];
        return (
          <div className="detail-content">
            {data.contextId && (
              <div className="detail-row">
                <span className="detail-label">上下文 ID:</span>
                <span className="detail-value">{toStr(data.contextId)}</span>
              </div>
            )}
            <div className="detail-intents">
              <span className="detail-label">识别的意图:</span>
              {intents.map((intent, index) => (
                <div key={index} className="intent-item">
                  <div className="intent-header">
                    <span className="intent-type">{intent.type}</span>
                    <span className="intent-confidence">{(intent.confidence * 100).toFixed(1)}%</span>
                  </div>
                  <div className="intent-description">{intent.description}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'plan':
        const steps = (data.steps as Array<{
          order: number;
          description: string;
          actionType: string;
          riskLevel: string;
        }>) || [];
        return (
          <div className="detail-content">
            <div className="detail-row">
              <span className="detail-label">计划 ID:</span>
              <span className="detail-value">{toStr(data.planId)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">标题:</span>
              <span className="detail-value">{toStr(data.title)}</span>
            </div>
            {data.description && (
              <div className="detail-text">
                <span className="detail-label">描述:</span>
                <p>{toStr(data.description)}</p>
              </div>
            )}
            <div className="detail-steps">
              <span className="detail-label">步骤:</span>
              {steps.map((step, index) => (
                <div key={index} className={`step-item risk-${step.riskLevel}`}>
                  <span className="step-order">{step.order}</span>
                  <span className="step-type">[{step.actionType}]</span>
                  <span className="step-description">{step.description}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'execution_start':
      case 'execution_step':
      case 'execution_complete':
        return (
          <div className="detail-content">
            <div className="detail-row">
              <span className="detail-label">计划 ID:</span>
              <span className="detail-value">{toStr(data.planId)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">执行 ID:</span>
              <span className="detail-value">{toStr(data.executionId)}</span>
            </div>
            {data.planTitle && (
              <div className="detail-row">
                <span className="detail-label">计划标题:</span>
                <span className="detail-value">{toStr(data.planTitle)}</span>
              </div>
            )}
            {data.status && (
              <div className="detail-row">
                <span className="detail-label">状态:</span>
                <span className={`detail-value status-${data.status}`}>{toStr(data.status)}</span>
              </div>
            )}
            {data.stepOrder !== undefined && (
              <div className="detail-row">
                <span className="detail-label">步骤:</span>
                <span className="detail-value">{toStr(data.stepOrder)}</span>
              </div>
            )}
            {data.stepDescription && (
              <div className="detail-row">
                <span className="detail-label">步骤描述:</span>
                <span className="detail-value">{toStr(data.stepDescription)}</span>
              </div>
            )}
            {data.totalDuration !== undefined && (
              <div className="detail-row">
                <span className="detail-label">总耗时:</span>
                <span className="detail-value">{formatDuration(data.totalDuration as number)}</span>
              </div>
            )}
            {data.result && (
              <div className="detail-text">
                <span className="detail-label">结果:</span>
                <pre>{toStr(data.result)}</pre>
              </div>
            )}
            {data.error && (
              <div className="detail-text error">
                <span className="detail-label">错误:</span>
                <pre>{toStr(data.error)}</pre>
              </div>
            )}
          </div>
        );

      case 'speech_segment':
        return (
          <div className="detail-content">
            {data.language && (
              <div className="detail-row">
                <span className="detail-label">语言:</span>
                <span className="detail-value">{toStr(data.language)}</span>
              </div>
            )}
            {data.duration && (
              <div className="detail-row">
                <span className="detail-label">音频时长:</span>
                <span className="detail-value">{formatDuration(data.duration as number)}</span>
              </div>
            )}
            {data.confidence && (
              <div className="detail-row">
                <span className="detail-label">置信度:</span>
                <span className="detail-value">{((data.confidence as number) * 100).toFixed(1)}%</span>
              </div>
            )}
            <div className="detail-text">
              <span className="detail-label">转录文本:</span>
              <pre>{toStr(data.text)}</pre>
            </div>
            {data.segments && Array.isArray(data.segments) && (
              <div className="detail-segments">
                <span className="detail-label">分段详情:</span>
                {(data.segments as Array<{ start: number; end: number; text: string }>).map((seg, idx) => (
                  <div key={idx} className="segment-item">
                    <span className="segment-time">[{(seg.start / 1000).toFixed(2)}s - {(seg.end / 1000).toFixed(2)}s]</span>
                    <span className="segment-text">{seg.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'error':
        return (
          <div className="detail-content">
            <div className="detail-row">
              <span className="detail-label">消息:</span>
              <span className="detail-value error">{toStr(data.message)}</span>
            </div>
            {data.code && (
              <div className="detail-row">
                <span className="detail-label">错误码:</span>
                <span className="detail-value">{toStr(data.code)}</span>
              </div>
            )}
            {data.source && (
              <div className="detail-row">
                <span className="detail-label">来源:</span>
                <span className="detail-value">{toStr(data.source)}</span>
              </div>
            )}
            {data.stack && (
              <div className="detail-text">
                <span className="detail-label">堆栈:</span>
                <pre>{toStr(data.stack)}</pre>
              </div>
            )}
          </div>
        );

      default:
        return (
          <div className="detail-content">
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </div>
        );
    }
  };

  return (
    <>
      <div className="event-detail-panel">
        <div className="detail-header">
          <span className="detail-icon" style={{ color: config.color }}>{config.icon}</span>
          <span className="detail-type">{config.label}</span>
          <span className="detail-timestamp">{formatTimestamp(event.timestamp)}</span>
          <button className="detail-close" onClick={onClose}>×</button>
        </div>
        <div className="detail-body">
          {renderContent()}
        </div>
        <div className="detail-footer">
          <span className="detail-id">ID: {event.id}</span>
          {event.parentId && <span className="detail-parent">Parent: {event.parentId}</span>}
        </div>
      </div>

      {/* Image zoom modal */}
      {zoomedImage && (
        <div className="image-zoom-overlay" onClick={() => setZoomedImage(null)}>
          <div className="image-zoom-container">
            <img src={zoomedImage} alt="Zoomed preview" className="zoomed-image" />
            <button className="zoom-close-btn" onClick={() => setZoomedImage(null)}>✕</button>
          </div>
        </div>
      )}
    </>
  );
};
