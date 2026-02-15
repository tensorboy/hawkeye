import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useChat } from '../hooks/useChat';

export function ChatPanel() {
  const { messages, isLoading, error, aiReady, initialize, sendMessage, clearChat } = useChat();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-init AI on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    await sendMessage(text);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!aiReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <div className="text-4xl">🤖</div>
        <div className="text-hawkeye-text-secondary text-sm">
          No AI configured. Add a Gemini API key in Settings.
        </div>
        <button className="btn btn-primary btn-sm" onClick={initialize}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-hawkeye-text-muted text-sm mt-8">
            Ask Hawkeye anything...
          </div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={i}
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
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-hawkeye-surface-elevated rounded-xl px-3 py-2 text-sm">
              <span className="loading loading-dots loading-xs" />
            </div>
          </div>
        )}

        {error && (
          <div className="text-center text-error text-xs px-4">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-hawkeye-border p-2 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          className="form-input flex-1 text-sm"
          placeholder="Message..."
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
        {messages.length > 0 && (
          <button className="btn btn-sm" onClick={clearChat} title="Clear chat">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
