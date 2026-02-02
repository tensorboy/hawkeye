/**
 * DebugTimeline - Main debug timeline component
 * Displays chronological debug events for development and troubleshooting
 * Uses @tanstack/react-virtual for performance with large event lists
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, AnimatePresence } from 'framer-motion';
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
  'execution_start', 'execution_step', 'execution_complete', 'error',
  'speech_segment'
];

// Virtualized event list for performance
interface VirtualizedEventListProps {
  events: DebugEvent[];
  selectedEvent: DebugEvent | null;
  onSelect: (event: DebugEvent) => void;
  autoScroll: boolean;
  parentRef: React.RefObject<HTMLDivElement | null>;
}

const VirtualizedEventList: React.FC<VirtualizedEventListProps> = ({
  events,
  selectedEvent,
  onSelect,
  autoScroll,
  parentRef,
}) => {
  const rowVirtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // Estimated row height
    overscan: 5, // Render 5 extra items above/below viewport
  });

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && events.length > 0) {
      rowVirtualizer.scrollToIndex(events.length - 1, { align: 'end', behavior: 'smooth' });
    }
  }, [events.length, autoScroll, rowVirtualizer]);

  return (
    <div
      style={{
        height: `${rowVirtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualItem) => {
        const event = events[virtualItem.index];
        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, delay: virtualItem.index * 0.01 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <TimelineEvent
              event={event}
              onSelect={onSelect}
              isSelected={selectedEvent?.id === event.id}
            />
          </motion.div>
        );
      })}
    </div>
  );
};

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
    if (!window.hawkeye?.debug) return;
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
    if (!window.hawkeye?.debug) return;
    try {
      const newStatus = await window.hawkeye.debug.getStatus();
      setStatus(newStatus);
    } catch (error) {
      console.error('Failed to fetch debug status:', error);
    }
  }, []);

  // Poll for new events
  const pollNewEvents = useCallback(async () => {
    if (!window.hawkeye?.debug) return;
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

  // Track if initial fetch has been done to prevent duplicate fetches
  const initialFetchDoneRef = useRef(false);

  // Initial load - runs once on mount
  useEffect(() => {
    fetchEvents();
    fetchStatus();
    initialFetchDoneRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Setup polling - separate from initial fetch
  useEffect(() => {
    pollIntervalRef.current = setInterval(pollNewEvents, 1000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [pollNewEvents]);

  // Refresh when filters change (but not on initial mount)
  useEffect(() => {
    if (initialFetchDoneRef.current) {
      // Reset timestamp when filters change to get fresh data
      lastTimestampRef.current = 0;
      fetchEvents();
    }
  }, [selectedTypes, searchText, fetchEvents]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && events.length > 0 && eventListRef.current) {
      eventListRef.current.scrollTop = eventListRef.current.scrollHeight;
    }
  }, [events.length, autoScroll]);

  // Handle clear events
  const handleClear = async () => {
    if (!window.hawkeye?.debug) return;
    await window.hawkeye.debug.clearEvents();
    setEvents([]);
    lastTimestampRef.current = 0;
    await fetchStatus();
  };

  // Handle pause/resume
  const handlePauseResume = async () => {
    if (!window.hawkeye?.debug) return;
    if (status.paused) {
      await window.hawkeye.debug.resume();
    } else {
      await window.hawkeye.debug.pause();
    }
    await fetchStatus();
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
        {/* Event list - simple scrolling for reliability */}
        <div className="event-list" ref={eventListRef}>
          {events.length === 0 ? (
            <motion.div
              className="empty-state"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <span className="empty-icon">📭</span>
              <span className="empty-text">暂无调试事件</span>
              <span className="empty-hint">操作应用后事件将在此显示</span>
            </motion.div>
          ) : (
            <div className="event-list-inner">
              {events.map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.5) }}
                >
                  <TimelineEvent
                    event={event}
                    onSelect={setSelectedEvent}
                    isSelected={selectedEvent?.id === event.id}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Event detail panel */}
        <AnimatePresence>
          {selectedEvent && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <EventDetail
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
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
