import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useChat } from '../hooks/useChat';
import { useAgent, describeToolCall } from '../hooks/useAgent';
import type { ChatMessage } from '../hooks/useTauri';
import type { ToolCallRecord } from '../hooks/useTauri';

/// One thread entry — either a chat message or the audit trail of an agent
/// turn's tool calls. Rendered inline in the conversation so users see
/// exactly what the agent did.
type ThreadEntry =
  | { kind: 'msg'; msg: ChatMessage }
  | { kind: 'tools'; calls: ToolCallRecord[] };

export function ChatPanel() {
  const chat = useChat();
  const agent = useAgent();

  const [input, setInput] = useState('');
  const [agentMode, setAgentMode] = useState(false);
  const [agentEntries, setAgentEntries] = useState<ThreadEntry[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-init AI on mount
  useEffect(() => {
    chat.initialize();
  }, [chat.initialize]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages, agentEntries, agent.inProgress]);

  // Resolve the assembled thread (chat history is canonical, agent entries
  // are interleaved by recency so users see in-order).
  const thread: ThreadEntry[] = agentMode
    ? agentEntries
    : chat.messages.map((m) => ({ kind: 'msg' as const, msg: m }));

  const handleSend = async () => {
    const text = input.trim();
    if (!text || chat.isLoading || agent.isLoading) return;
    setInput('');

    if (agentMode) {
      // Pre-flight: ensure daemon running.
      if (!agent.status?.daemonRunning) {
        const ok = await agent.ensureRunning();
        if (!ok) return;
      }

      // Build the history we send to the backend (text-only ChatMessages).
      const priorMessages: ChatMessage[] = agentEntries
        .filter((e): e is { kind: 'msg'; msg: ChatMessage } => e.kind === 'msg')
        .map((e) => e.msg);

      // Optimistically show the user message.
      const userMsg: ChatMessage = { role: 'user', content: text };
      setAgentEntries((es) => [...es, { kind: 'msg', msg: userMsg }]);

      const result = await agent.runTurn(priorMessages, text);
      if (result) {
        const updates: ThreadEntry[] = [];
        if (result.toolCalls.length > 0) {
          updates.push({ kind: 'tools', calls: result.toolCalls });
        }
        if (result.text) {
          updates.push({ kind: 'msg', msg: { role: 'assistant', content: result.text } });
        }
        setAgentEntries((es) => [...es, ...updates]);
      }
      agent.clearInProgress();
    } else {
      await chat.sendMessage(text);
    }

    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    if (agentMode) {
      setAgentEntries([]);
      agent.clearInProgress();
    } else {
      chat.clearChat();
    }
  };

  if (!chat.aiReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <div className="text-4xl">🤖</div>
        <div className="text-hawkeye-text-secondary text-sm">
          No AI configured. Add a Gemini API key in Settings.
        </div>
        <button className="btn btn-primary btn-sm" onClick={chat.initialize}>
          Retry
        </button>
      </div>
    );
  }

  const isLoading = chat.isLoading || agent.isLoading;
  const error = chat.error || agent.error;

  return (
    <div className="flex flex-col h-full">
      {/* Mode toggle bar */}
      <div className="flex items-center gap-2 border-b border-hawkeye-border px-3 py-1.5 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={agentMode}
            onChange={(e) => setAgentMode(e.target.checked)}
            disabled={isLoading}
          />
          <span className="font-medium">Agent</span>
        </label>
        {agentMode && <AgentStatusBadge agent={agent} />}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {thread.length === 0 && (
          <div className="text-center text-hawkeye-text-muted text-sm mt-8">
            {agentMode
              ? 'Tell the agent what to do (e.g., "open Safari and search for hawkeye")'
              : 'Ask Hawkeye anything...'}
          </div>
        )}

        {thread.map((entry, i) =>
          entry.kind === 'msg' ? (
            <MessageBubble key={i} msg={entry.msg} />
          ) : (
            <ToolCallTrail key={i} calls={entry.calls} />
          )
        )}

        {/* Live tool-call stream while waiting on a turn */}
        {agent.inProgress.length > 0 && (
          <LiveToolStream entries={agent.inProgress} />
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-hawkeye-surface-elevated rounded-xl px-3 py-2 text-sm">
              <span className="loading loading-dots loading-xs" />
            </div>
          </div>
        )}

        {error && (
          <div className="text-center text-error text-xs px-4">{error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-hawkeye-border p-2 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          className="form-input flex-1 text-sm"
          placeholder={agentMode ? 'Tell the agent…' : 'Message…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
        >
          Send
        </button>
        {thread.length > 0 && (
          <button className="btn btn-sm" onClick={handleClear} title="Clear">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// --- subcomponents --------------------------------------------------------

function MessageBubble({ msg }: { msg: ChatMessage }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
          msg.role === 'user'
            ? 'bg-hawkeye-primary text-white rounded-br-sm'
            : 'bg-hawkeye-surface-elevated text-hawkeye-text-primary rounded-bl-sm'
        }`}
      >
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {msg.content}
        </pre>
      </div>
    </motion.div>
  );
}

function ToolCallTrail({ calls }: { calls: ToolCallRecord[] }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex justify-start"
    >
      <div className="max-w-[85%] rounded-lg border border-hawkeye-border bg-hawkeye-surface px-3 py-2 text-xs text-hawkeye-text-secondary space-y-1">
        <div className="font-semibold text-hawkeye-text-muted uppercase tracking-wide">
          Agent ran {calls.length} tool{calls.length === 1 ? '' : 's'}
        </div>
        {calls.map((c, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className={c.ok ? 'text-success' : 'text-error'}>{c.ok ? '✓' : '✗'}</span>
            <span className="font-mono">{describeToolCall(c)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function LiveToolStream({
  entries,
}: {
  entries: { round: number; name: string; status: 'running' | 'ok' | 'error'; summary?: string }[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex justify-start"
    >
      <div className="max-w-[85%] rounded-lg border border-hawkeye-border bg-hawkeye-surface-elevated px-3 py-2 text-xs space-y-1">
        {entries.map((e, i) => (
          <div key={i} className="flex gap-2 items-center">
            {e.status === 'running' ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <span className={e.status === 'ok' ? 'text-success' : 'text-error'}>
                {e.status === 'ok' ? '✓' : '✗'}
              </span>
            )}
            <span className="font-mono">{e.name}</span>
            {e.summary && (
              <span className="text-hawkeye-text-muted truncate max-w-[200px]" title={e.summary}>
                — {e.summary}
              </span>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function AgentStatusBadge({ agent }: { agent: ReturnType<typeof useAgent> }) {
  const status = agent.status;
  if (!status) return <span className="text-hawkeye-text-muted">…</span>;

  if (!status.binaryInstalled) {
    return (
      <span className="text-warning" title="cua-driver not installed">
        ⚠ driver missing
      </span>
    );
  }
  if (!status.daemonRunning) {
    return (
      <button
        className="text-info underline cursor-pointer"
        onClick={() => agent.ensureRunning()}
      >
        start daemon
      </button>
    );
  }
  return <span className="text-success">● ready</span>;
}
