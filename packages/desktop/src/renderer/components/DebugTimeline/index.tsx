/**
 * DebugTimeline - Main debug timeline component
 * Displays chronological debug events for development and troubleshooting
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TimelineEvent } from './TimelineEvent';
import { EventDetail } from './EventDetail';
import { DebugEvent, DebugEventType, DebugStatus, EVENT_TYPE_CONFIG } from './types';
import './DebugTimeline.css';

interface DebugTimelineProps {
  onClose?: () => void;
}

const ALL_EVENT_TYPES: DebugEventType[] = [
  'screenshot', 'ocr', 'clipboard', 'window', 'file',
  'llm_input', 'llm_output', 'intent', 'plan',
  'execution_start', 'execution_step', 'execution_complete', 'error'
];

export const DebugTimeline: React.FC<DebugTimelineProps> = ({ onClose }) => {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [status, setStatus] = useState<DebugStatus>({ paused: false, count: 0, totalCount: 0 });
  const [selectedEvent, setSelectedEvent] = useState<DebugEvent | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<DebugEventType>>(new Set(ALL_EVENT_TYPES));
  const [searchText, setSearchText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const eventListRef = useRef<HTMLDivElement>(null);
  const lastTimestampRef = useRef<number>(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    try {
      const filter: { types?: string[]; search?: string } = {};
      if (selectedTypes.size < ALL_EVENT_TYPES.length) {
        filter.types = Array.from(selectedTypes);
      }
      if (searchText.trim()) {
        filter.search = searchText.trim();
      }

      const newEvents = await window.hawkeye.debug.getEvents(
        Object.keys(filter).length > 0 ? filter : undefined
      );
      // Cast the events to DebugEvent[] - the API returns string types but they match DebugEventType
      setEvents(newEvents as DebugEvent[]);

      if (newEvents.length > 0) {
        lastTimestampRef.current = newEvents[newEvents.length - 1].timestamp;
      }
    } catch (error) {
      console.error('Failed to fetch debug events:', error);
    }
  }, [selectedTypes, searchText]);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const newStatus = await window.hawkeye.debug.getStatus();
      setStatus(newStatus);
    } catch (error) {
      console.error('Failed to fetch debug status:', error);
    }
  }, []);

  // Poll for new events
  const pollNewEvents = useCallback(async () => {
    if (status.paused) return;

    try {
      const newEvents = await window.hawkeye.debug.getSince(lastTimestampRef.current);
      if (newEvents.length > 0) {
        // Cast to DebugEvent[] - the API returns string types but they match DebugEventType
        const typedEvents = newEvents as DebugEvent[];
        // Filter by selected types
        const filteredEvents = selectedTypes.size < ALL_EVENT_TYPES.length
          ? typedEvents.filter(e => selectedTypes.has(e.type))
          : typedEvents;

        // Filter by search text
        const searchFiltered = searchText.trim()
          ? filteredEvents.filter(e =>
              JSON.stringify(e.data).toLowerCase().includes(searchText.toLowerCase())
            )
          : filteredEvents;

        if (searchFiltered.length > 0) {
          setEvents(prev => [...prev, ...searchFiltered]);
          lastTimestampRef.current = newEvents[newEvents.length - 1].timestamp;
        }
      }
      await fetchStatus();
    } catch (error) {
      console.error('Failed to poll new events:', error);
    }
  }, [status.paused, selectedTypes, searchText, fetchStatus]);

  // Initial load and setup polling
  useEffect(() => {
    fetchEvents();
    fetchStatus();

    pollIntervalRef.current = setInterval(pollNewEvents, 1000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchEvents, fetchStatus, pollNewEvents]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && eventListRef.current) {
      eventListRef.current.scrollTop = eventListRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Refresh when filters change
  useEffect(() => {
    fetchEvents();
  }, [selectedTypes, searchText, fetchEvents]);

  // Handle clear events
  const handleClear = async () => {
    await window.hawkeye.debug.clearEvents();
    setEvents([]);
    lastTimestampRef.current = 0;
    await fetchStatus();
  };

  // Handle pause/resume
  const handlePauseResume = async () => {
    if (status.paused) {
      await window.hawkeye.debug.resume();
    } else {
      await window.hawkeye.debug.pause();
    }
    await fetchStatus();
  };

  // Handle export
  const handleExport = async () => {
    const json = await window.hawkeye.debug.export();
    if (json) {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hawkeye-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Toggle event type filter
  const toggleEventType = (type: DebugEventType) => {
    setSelectedTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  // Select all / none
  const selectAllTypes = () => setSelectedTypes(new Set(ALL_EVENT_TYPES));
  const selectNoneTypes = () => setSelectedTypes(new Set());

  return (
    <div className="debug-timeline">
      {/* Header */}
      <div className="timeline-header">
        <div className="header-title">
          <span className="header-icon">🔧</span>
          <span>调试时间线</span>
          <span className="event-count">({status.count}/{status.totalCount})</span>
        </div>
        <div className="header-actions">
          <button className="action-btn" onClick={handleClear} title="清空">
            🗑️ 清空
          </button>
          <button
            className={`action-btn ${status.paused ? 'paused' : ''}`}
            onClick={handlePauseResume}
            title={status.paused ? '恢复' : '暂停'}
          >
            {status.paused ? '▶️ 恢复' : '⏸️ 暂停'}
          </button>
          <button className="action-btn" onClick={handleExport} title="导出">
            📤 导出
          </button>
          {onClose && (
            <button className="action-btn close-btn" onClick={onClose} title="关闭">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="timeline-filters">
        <div className="filter-types">
          <button
            className="filter-select-btn"
            onClick={selectAllTypes}
            title="全选"
          >
            全部
          </button>
          <button
            className="filter-select-btn"
            onClick={selectNoneTypes}
            title="取消全选"
          >
            无
          </button>
          {ALL_EVENT_TYPES.map(type => (
            <button
              key={type}
              className={`filter-type-btn ${selectedTypes.has(type) ? 'active' : ''}`}
              onClick={() => toggleEventType(type)}
              style={{ '--type-color': EVENT_TYPE_CONFIG[type].color } as React.CSSProperties}
              title={EVENT_TYPE_CONFIG[type].label}
            >
              {EVENT_TYPE_CONFIG[type].icon}
            </button>
          ))}
        </div>
        <div className="filter-search">
          <input
            type="text"
            placeholder="搜索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div className="filter-options">
          <label>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            自动滚动
          </label>
        </div>
      </div>

      {/* Main content */}
      <div className="timeline-content">
        {/* Event list */}
        <div className="event-list" ref={eventListRef}>
          {events.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📭</span>
              <span className="empty-text">暂无调试事件</span>
              <span className="empty-hint">操作应用后事件将在此显示</span>
            </div>
          ) : (
            events.map(event => (
              <TimelineEvent
                key={event.id}
                event={event}
                onSelect={setSelectedEvent}
                isSelected={selectedEvent?.id === event.id}
              />
            ))
          )}
        </div>

        {/* Event detail panel */}
        {selectedEvent && (
          <EventDetail
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="timeline-statusbar">
        <span className={`status-indicator ${status.paused ? 'paused' : 'running'}`}>
          {status.paused ? '⏸️ 已暂停' : '🟢 运行中'}
        </span>
        <span className="status-stats">
          已收集 {status.count} 事件 | 总计 {status.totalCount} 事件
        </span>
        {status.config && (
          <span className="status-config">
            最大 {status.config.maxEvents} 事件
          </span>
        )}
      </div>
    </div>
  );
};

export default DebugTimeline;
