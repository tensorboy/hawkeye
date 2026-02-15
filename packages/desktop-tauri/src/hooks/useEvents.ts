import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

/**
 * Listen to a Tauri event with automatic cleanup.
 * Uses a ref for the handler to avoid re-subscribing when the handler changes.
 */
export function useTauriEvent<T>(eventName: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    listen<T>(eventName, (event) => {
      handlerRef.current(event.payload);
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
  }, [eventName]);
}
