import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { startObserve, stopObserve, type ObservationResult } from '../hooks/useTauri';
import { useTauriEvent } from '../hooks/useEvents';

export function ObservePanel() {
  const [running, setRunning] = useState(false);
  const [observations, setObservations] = useState<ObservationResult[]>([]);
  const [changeCount, setChangeCount] = useState(0);

  // Listen for observe events
  const handleUpdate = useCallback((obs: ObservationResult) => {
    setObservations((prev) => [obs, ...prev].slice(0, 20)); // Keep last 20
  }, []);

  const handleChange = useCallback((_ratio: number) => {
    setChangeCount((c) => c + 1);
  }, []);

  const handleStopped = useCallback(() => {
    setRunning(false);
  }, []);

  useTauriEvent('observe:update', handleUpdate);
  useTauriEvent('observe:change-detected', handleChange);
  useTauriEvent('observe:stopped', handleStopped);

  const toggle = async () => {
    if (running) {
      await stopObserve();
      setRunning(false);
    } else {
      const started = await startObserve();
      setRunning(started);
      if (started) {
        setChangeCount(0);
        setObservations([]);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="p-3 border-b border-hawkeye-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`status-dot ${running ? '' : 'inactive'}`} />
            <span className="text-sm">
              {running ? 'Observing...' : 'Stopped'}
            </span>
            {running && (
              <span className="text-xs text-hawkeye-text-muted">
                {changeCount} changes
              </span>
            )}
          </div>
          <button
            className={`btn btn-sm ${running ? '' : 'btn-primary'}`}
            onClick={toggle}
          >
            {running ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {/* Observation stream */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {observations.length === 0 && (
          <div className="text-center text-hawkeye-text-muted text-sm mt-8">
            {running
              ? 'Waiting for screen changes...'
              : 'Start observing to capture screen changes.'}
          </div>
        )}

        {observations.map((obs, i) => (
          <motion.div
            key={obs.timestamp}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-2"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-hawkeye-text-muted">
                {new Date(obs.timestamp).toLocaleTimeString()}
              </div>
              <div className="text-xs text-hawkeye-text-muted">
                {(obs.changeRatio * 100).toFixed(1)}% changed
              </div>
            </div>

            {obs.activeWindow && (
              <div className="text-xs mb-1">
                <span className="font-medium">{obs.activeWindow.appName}</span>
                {obs.activeWindow.title && (
                  <span className="text-hawkeye-text-muted"> — {obs.activeWindow.title}</span>
                )}
              </div>
            )}

            {obs.ocrText && (
              <pre className="text-xs text-hawkeye-text-secondary whitespace-pre-wrap max-h-16 overflow-hidden font-mono">
                {obs.ocrText.slice(0, 200)}
                {obs.ocrText.length > 200 && '...'}
              </pre>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
