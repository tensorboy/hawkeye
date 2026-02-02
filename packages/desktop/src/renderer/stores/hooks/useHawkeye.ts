import { useCallback, useEffect } from 'react';
import { useHawkeyeStore } from '../index';

export function useHawkeye() {
  const status = useHawkeyeStore((s) => s.status);
  const isLoading = useHawkeyeStore((s) => s.isLoading);
  const showSettings = useHawkeyeStore((s) => s.showSettings);
  const showOnboarding = useHawkeyeStore((s) => s.showOnboarding);
  const smartObserveWatching = useHawkeyeStore((s) => s.smartObserveWatching);

  const setStatus = useHawkeyeStore((s) => s.setStatus);
  const setIsLoading = useHawkeyeStore((s) => s.isLoading); // Read-only in this hook typically, but exposed just in case
  const setShowSettings = useHawkeyeStore((s) => s.setShowSettings);
  const setShowOnboarding = useHawkeyeStore((s) => s.setShowOnboarding);
  const setSmartObserveWatching = useHawkeyeStore((s) => s.setSmartObserveWatching);

  // Expose observe function via IPC
  const observe = useCallback(async () => {
    if (!window.hawkeye) return;
    // @ts-ignore - window.hawkeye is injected via preload
    await window.hawkeye.observe();
  }, []);

  useEffect(() => {
    // Guard: window.hawkeye only exists in Electron
    if (!window.hawkeye) return;

    // Listen for events from main process
    // @ts-ignore
    const cleanup = window.hawkeye.onHawkeyeReady((s: any) => {
      setStatus(s);
    });

    // @ts-ignore
    const cleanupStatus = window.hawkeye.onSmartObserveStatus((s: any) => {
      setSmartObserveWatching(s.watching);
    });

    return () => {
      cleanup();
      cleanupStatus();
    };
  }, [setStatus, setSmartObserveWatching]);

  return {
    status,
    isLoading,
    showSettings,
    showOnboarding,
    smartObserveWatching,
    setShowSettings,
    setShowOnboarding,
    observe,
  };
}
