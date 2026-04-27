import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  chatWithAgent,
  getAgentStatus,
  startAgent,
  type AgentStatus,
  type AgentTurnResult,
  type ChatMessage,
  type ToolCallRecord,
} from './useTauri';

/// A streaming view of an in-progress agent turn — tool calls arrive via
/// Tauri events while we wait for `chatWithAgent` to resolve.
export interface AgentTurnInProgress {
  round: number;
  name: string;
  status: 'running' | 'ok' | 'error';
  summary?: string;
  args?: Record<string, unknown>;
}

interface AgentState {
  status: AgentStatus | null;
  inProgress: AgentTurnInProgress[];
  lastResult: AgentTurnResult | null;
  isLoading: boolean;
  error: string | null;
}

/// React hook for tool-using chat against cua-driver.
///
/// Returns the daemon status, a `runAgentTurn` function that calls
/// `chat_with_agent`, and live-streamed `inProgress` tool-call updates from
/// the Tauri event bus (so the UI can show "screenshot…", "click…", etc.
/// as the agent works).
export function useAgent() {
  const [state, setState] = useState<AgentState>({
    status: null,
    inProgress: [],
    lastResult: null,
    isLoading: false,
    error: null,
  });

  const inProgressRef = useRef(state.inProgress);
  inProgressRef.current = state.inProgress;

  // --- subscribe to tool-call events ---
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    listen<{ round: number; name: string; args: Record<string, unknown> }>(
      'agent:tool-call-start',
      (e) => {
        setState((s) => ({
          ...s,
          inProgress: [
            ...s.inProgress,
            {
              round: e.payload.round,
              name: e.payload.name,
              args: e.payload.args,
              status: 'running',
            },
          ],
        }));
      }
    ).then((u) => unsubs.push(u));

    listen<{ round: number; name: string; ok: boolean; summary: string }>(
      'agent:tool-call-end',
      (e) => {
        setState((s) => ({
          ...s,
          inProgress: s.inProgress.map((t) =>
            t.round === e.payload.round && t.name === e.payload.name && t.status === 'running'
              ? {
                  ...t,
                  status: e.payload.ok ? 'ok' : 'error',
                  summary: e.payload.summary,
                }
              : t
          ),
        }));
      }
    ).then((u) => unsubs.push(u));

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getAgentStatus();
      setState((st) => ({ ...st, status: s }));
      return s;
    } catch (e) {
      setState((st) => ({ ...st, error: String(e) }));
      return null;
    }
  }, []);

  // Refresh status on mount.
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const ensureRunning = useCallback(async () => {
    try {
      await startAgent();
      await refreshStatus();
      return true;
    } catch (e) {
      const msg = String(e);
      setState((s) => ({ ...s, error: msg }));
      return false;
    }
  }, [refreshStatus]);

  const runTurn = useCallback(
    async (history: ChatMessage[], userInput: string): Promise<AgentTurnResult | null> => {
      setState((s) => ({ ...s, isLoading: true, error: null, inProgress: [] }));
      try {
        const result = await chatWithAgent(history, userInput);
        setState((s) => ({ ...s, isLoading: false, lastResult: result }));
        return result;
      } catch (e) {
        setState((s) => ({ ...s, isLoading: false, error: String(e) }));
        return null;
      }
    },
    []
  );

  const clearInProgress = useCallback(() => {
    setState((s) => ({ ...s, inProgress: [] }));
  }, []);

  return {
    status: state.status,
    inProgress: state.inProgress,
    lastResult: state.lastResult,
    isLoading: state.isLoading,
    error: state.error,
    refreshStatus,
    ensureRunning,
    runTurn,
    clearInProgress,
  };
}

/// Convenience: turn a `ToolCallRecord` into a one-line UI label.
export function describeToolCall(rec: ToolCallRecord): string {
  const argSnippet = JSON.stringify(rec.args);
  const truncated = argSnippet.length > 60 ? argSnippet.slice(0, 60) + '…' : argSnippet;
  return `${rec.name}(${truncated})`;
}
