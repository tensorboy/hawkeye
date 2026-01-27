/**
 * TimelineEvent - Single debug event component
 */

import React, { useState, useMemo } from 'react';
import { DebugEvent, EVENT_TYPE_CONFIG } from './types';

interface TimelineEventProps {
  event: DebugEvent;
  onSelect: (event: DebugEvent) => void;
  isSelected: boolean;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export const TimelineEvent: React.FC<TimelineEventProps> = ({ event, onSelect, isSelected }) => {
  const [expanded, setExpanded] = useState(false);
  const config = EVENT_TYPE_CONFIG[event.type];

  const summary = useMemo(() => {
    const data = event.data as Record<string, unknown>;
    switch (event.type) {
      case 'screenshot':
        return `${data.width}x${data.height}${data.size ? `, ${Math.round((data.size as number) / 1024)}KB` : ''}`;
      case 'ocr':
        return `识别 ${data.charCount} 字符, 耗时 ${formatDuration(data.duration as number)}, 后端: ${data.backend}`;
      case 'clipboard':
        return truncateText(String(data.content || ''), 50);
      case 'window':
        return `${data.appName} - ${truncateText(String(data.title || ''), 40)}`;
      case 'file':
        return `${data.operation}: ${truncateText(String(data.path || ''), 60)}`;
      case 'llm_input':
        return truncateText(String(data.userMessage || ''), 80);
      case 'llm_output':
        const tokens = data.totalTokens ? `${data.totalTokens} tokens, ` : '';
        return `${tokens}${formatDuration(data.duration as number)}`;
      case 'intent':
        const intents = (data.intents as Array<{ type: string; confidence: number }>) || [];
        return intents.map(i => `${i.type} (${(i.confidence * 100).toFixed(0)}%)`).join(', ');
      case 'plan':
        const steps = (data.steps as Array<unknown>) || [];
        return `${data.title} (${steps.length} 步骤)`;
      case 'execution_start':
        return `${data.planTitle} (${data.totalSteps} 步骤)`;
      case 'execution_step':
        return `Step ${data.stepOrder}: ${data.status} - ${truncateText(String(data.stepDescription || ''), 40)}`;
      case 'execution_complete':
        return `${data.status}: ${data.stepsCompleted}/${(data.stepsCompleted as number) + (data.stepsFailed as number)} 完成`;
      case 'error':
        return truncateText(String(data.message || ''), 80);
      case 'speech_segment':
        return truncateText(String(data.text || ''), 80);
      default:
        return JSON.stringify(data).substring(0, 80);
    }
  }, [event]);

  const detailContent = useMemo(() => {
    const data = event.data as Record<string, unknown>;
    switch (event.type) {
      case 'ocr':
        return data.text as string;
      case 'llm_input':
        return `System: ${truncateText(String(data.systemPrompt || 'N/A'), 200)}\n\nUser: ${data.userMessage}`;
      case 'llm_output':
        return data.response as string;
      case 'plan':
        const steps = (data.steps as Array<{ order: number; description: string; actionType: string }>) || [];
        return steps.map(s => `${s.order}. [${s.actionType}] ${s.description}`).join('\n');
      case 'error':
        return `${data.message}\n\nSource: ${data.source || 'unknown'}\n\n${data.stack || ''}`;
      case 'speech_segment':
        return `${data.text}${data.language ? `\n\nLanguage: ${data.language}` : ''}${data.speakerTurn ? '\n\n[Speaker Turn]' : ''}`;
      default:
        return JSON.stringify(data, null, 2);
    }
  }, [event]);

  return (
    <div
      className={`timeline-event ${isSelected ? 'selected' : ''}`}
      style={{ '--event-color': config.color } as React.CSSProperties}
      onClick={() => onSelect(event)}
    >
      <div className="event-header">
        <span className="event-time">{formatTime(event.timestamp)}</span>
        <span className="event-type">
          <span className="event-icon">{config.icon}</span>
          {config.label}
        </span>
        {event.duration && (
          <span className="event-duration">{formatDuration(event.duration)}</span>
        )}
        <button
          className="event-expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? '▼' : '▶'}
        </button>
      </div>
      <div className="event-summary">{summary}</div>
      {expanded && (
        <div className="event-detail">
          <pre>{detailContent}</pre>
        </div>
      )}
    </div>
  );
};
