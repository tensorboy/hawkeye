/**
 * DebugTimeline — real-time event stream viewer for debugging
 *
 * Shows a chronological list of system events (screenshots, OCR, AI, etc.)
 * with filtering, search, pause/resume, and auto-scroll.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  getDebugEvents,
  getDebugEventsSince,
  searchDebugEvents,
  getDebugStatus,
  pushDebugEvent,
  pauseDebug,
  resumeDebug,
  clearDebugEvents,
  type DebugEvent,
  type DebugEventType,
  type DebugStatus,
} from '../hooks/useTauri';
import { listen } from '@tauri-apps/api/event';

// Event type display config
const EVENT_CONFIG: Record<
  DebugEventType,
  { icon: string; label: string; color: string }
> = {
  screenshot: { icon: '\ud83d\udcf7', label: 'Screenshot', color: '#60a5fa' },
  ocr: { icon: '\ud83d\udd24', label: 'OCR', color: '#34d399' },
  clipboard: { icon: '\ud83d\udccb', label: 'Clipboard', color: '#a78bfa' },
  window: { icon: '\ud83d\uddbc\ufe0f', label: 'Window', color: '#f472b6' },
  file: { icon: '\ud83d\udcc1', label: 'File', color: '#fb923c' },
  llm_input: { icon: '\u27a1\ufe0f', label: 'LLM In', color: '#22d3ee' },
  llm_output: { icon: '\u2b05\ufe0f', label: 'LLM Out', color: '#2dd4bf' },
  intent: { icon: '\ud83c\udfaf', label: 'Intent', color: '#e879f9' },
  plan: { icon: '\ud83d\udcdd', label: 'Plan', color: '#fbbf24' },
  execution_start: { icon: '\u25b6\ufe0f', label: 'Exec Start', color: '#4ade80' },
  execution_step: { icon: '\u23ed\ufe0f', label: 'Exec Step', color: '#86efac' },
  execution_complete: { icon: '\u2705', label: 'Exec Done', color: '#22c55e' },
  error: { icon: '\u274c', label: 'Error', color: '#ef4444' },
  speech_segment: { icon: '\ud83c\udf99\ufe0f', label: 'Speech', color: '#c084fc' },
  gesture: { icon: '\u270b', label: 'Gesture', color: '#fb7185' },
  gaze_calibration: { icon: '\ud83d\udc41\ufe0f', label: 'Gaze', color: '#38bdf8' },
  observe: { icon: '\ud83d\udd0d', label: 'Observe', color: '#a3e635' },
  system: { icon: '\u2699\ufe0f', label: 'System', color: '#94a3b8' },
};

const ALL_EVENT_TYPES = Object.keys(EVENT_CONFIG) as DebugEventType[];

const POLL_INTERVAL = 1000;

export const DebugTimeline: React.FC = () => {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [status, setStatus] = useState<DebugStatus | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<DebugEventType>>(
    new Set(ALL_EVENT_TYPES)
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<DebugEvent | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const lastTimestampRef = useRef<number>(0);
  const pollRef = useRef<number>(0);

  // Poll for new events
  const pollEvents = useCallback(async () => {
    try {
      const st = await getDebugStatus();
      setStatus(st);

      if (st.paused) return;

      if (searchQuery) {
        const results = await searchDebugEvents(searchQuery);
        setEvents(results);
      } else if (lastTimestampRef.current > 0) {
        const newEvents = await getDebugEventsSince(lastTimestampRef.current);
        if (newEvents.length > 0) {
          setEvents((prev) => {
            const combined = [...prev, ...newEvents];
            // Keep latest 500
            return combined.slice(-500);
          });
          lastTimestampRef.current = Math.max(
            ...newEvents.map((e) => e.timestamp)
          );
        }
      } else {
        const allEvents = await getDebugEvents(undefined, 100);
        // allEvents comes newest-first from backend, reverse for chronological display
        const chronological = allEvents.reverse();
        setEvents(chronological);
        if (chronological.length > 0) {
          lastTimestampRef.current = chronological[chronological.length - 1].timestamp;
        }
      }
    } catch (err) {
      console.error('Debug poll error:', err);
    }
  }, [searchQuery]);

  // Start polling
  useEffect(() => {
    pollEvents();
    pollRef.current = window.setInterval(pollEvents, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollEvents]);

  // Listen for real-time debug events via Tauri events
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    listen<DebugEvent>('debug:event', (event) => {
      setEvents((prev) => [...prev, event.payload].slice(-500));
      if (event.payload.timestamp > lastTimestampRef.current) {
        lastTimestampRef.current = event.payload.timestamp;
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenFn = fn;
      }
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const filteredEvents = events.filter((e) => enabledTypes.has(e.eventType));

  const toggleType = (type: DebugEventType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const selectAll = () => setEnabledTypes(new Set(ALL_EVENT_TYPES));
  const selectNone = () => setEnabledTypes(new Set());

  const handlePauseResume = async () => {
    if (status?.paused) {
      await resumeDebug();
    } else {
      await pauseDebug();
    }
    const st = await getDebugStatus();
    setStatus(st);
  };

  const handleClear = async () => {
    await clearDebugEvents();
    setEvents([]);
    lastTimestampRef.current = 0;
  };

  // Insert a test event for demo
  const handleTestEvent = async () => {
    await pushDebugEvent('system', 'Test event', {
      message: 'This is a test debug event',
      source: 'user',
    });
  };

  const formatTime = (ms: number) => {
    const d = new Date(ms);
    return d.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-2 border-b border-hawkeye-border space-y-2">
        {/* Controls row */}
        <div className="flex items-center gap-2">
          <button
            className={`btn text-xs ${status?.paused ? 'btn-primary' : ''}`}
            onClick={handlePauseResume}
          >
            {status?.paused ? '\u25b6 Resume' : '\u23f8 Pause'}
          </button>
          <button className="btn text-xs" onClick={handleClear}>
            Clear
          </button>
          <button className="btn text-xs" onClick={handleTestEvent}>
            + Test
          </button>
          <div className="flex-1" />
          <label className="flex items-center gap-1 text-xs text-hawkeye-text-muted">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
          <span className="text-xs text-hawkeye-text-muted">
            {filteredEvents.length}/{status?.count ?? 0} events
          </span>
        </div>

        {/* Search */}
        <input
          type="text"
          className="form-input text-xs w-full"
          placeholder="Search events..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            lastTimestampRef.current = 0; // Reset to re-fetch
          }}
        />

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1">
          <button
            className="text-[10px] px-1.5 py-0.5 rounded bg-hawkeye-surface hover:bg-hawkeye-surface-hover text-hawkeye-text-muted"
            onClick={selectAll}
          >
            All
          </button>
          <button
            className="text-[10px] px-1.5 py-0.5 rounded bg-hawkeye-surface hover:bg-hawkeye-surface-hover text-hawkeye-text-muted"
            onClick={selectNone}
          >
            None
          </button>
          {ALL_EVENT_TYPES.map((type) => {
            const cfg = EVENT_CONFIG[type];
            const active = enabledTypes.has(type);
            return (
              <button
                key={type}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-all ${
                  active
                    ? 'border-current opacity-100'
                    : 'border-transparent opacity-40'
                }`}
                style={{ color: cfg.color }}
                onClick={() => toggleType(type)}
                title={cfg.label}
              >
                {cfg.icon} {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Event list */}
      <div ref={listRef} className="flex-1 overflow-auto">
        {filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-hawkeye-text-muted">
            {status?.paused
              ? 'Paused — click Resume to continue collecting events'
              : 'No events yet — start observing or interact with the app'}
          </div>
        ) : (
          <div className="divide-y divide-hawkeye-border">
            {filteredEvents.map((event) => {
              const cfg = EVENT_CONFIG[event.eventType] ?? EVENT_CONFIG.system;
              const isSelected = selectedEvent?.id === event.id;

              return (
                <div
                  key={event.id}
                  className={`px-3 py-1.5 cursor-pointer hover:bg-hawkeye-surface transition-colors ${
                    isSelected ? 'bg-hawkeye-surface' : ''
                  }`}
                  onClick={() =>
                    setSelectedEvent(isSelected ? null : event)
                  }
                >
                  {/* Event row */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[10px] text-hawkeye-text-muted font-mono w-16 shrink-0">
                      {formatTime(event.timestamp)}
                    </span>
                    <span
                      className="w-5 text-center shrink-0"
                      style={{ color: cfg.color }}
                    >
                      {cfg.icon}
                    </span>
                    <span
                      className="text-[10px] w-16 shrink-0 font-medium"
                      style={{ color: cfg.color }}
                    >
                      {cfg.label}
                    </span>
                    <span className="truncate text-hawkeye-text-secondary">
                      {event.label}
                    </span>
                    {event.durationMs != null && (
                      <span className="text-[10px] text-hawkeye-text-muted shrink-0">
                        {event.durationMs}ms
                      </span>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isSelected && (
                    <div className="mt-1.5 ml-[5.5rem] text-[11px]">
                      <pre className="bg-black/30 rounded p-2 overflow-auto max-h-40 text-hawkeye-text-muted font-mono whitespace-pre-wrap">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                      {event.parentId && (
                        <div className="mt-1 text-hawkeye-text-muted">
                          Parent: {event.parentId}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-3 py-1 border-t border-hawkeye-border flex items-center gap-3 text-[10px] text-hawkeye-text-muted">
        <span className={`w-2 h-2 rounded-full ${status?.paused ? 'bg-yellow-500' : 'bg-green-500'}`} />
        <span>{status?.paused ? 'Paused' : 'Collecting'}</span>
        <span>|</span>
        <span>{status?.count ?? 0} total</span>
        <span>|</span>
        <span>Max: {status?.maxEvents ?? 500}</span>
      </div>
    </div>
  );
};

export default DebugTimeline;
