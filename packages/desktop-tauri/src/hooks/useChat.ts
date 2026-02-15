import { useState, useCallback, useRef } from 'react';
import { chat as chatInvoke, initAi, type ChatMessage, type ChatResponse } from './useTauri';

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  aiReady: boolean;
}

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    aiReady: false,
  });

  // Ref keeps messages in sync to avoid stale closures in sendMessage
  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;

  const initialize = useCallback(async () => {
    try {
      const ready = await initAi();
      setState((s) => ({ ...s, aiReady: ready }));
      return ready;
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
      return false;
    }
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: ChatMessage = { role: 'user', content };
    const allMessages = [...messagesRef.current, userMsg];

    setState((s) => ({
      ...s,
      messages: [...s.messages, userMsg],
      isLoading: true,
      error: null,
    }));

    try {
      const response: ChatResponse = await chatInvoke(allMessages);

      const assistantMsg: ChatMessage = { role: 'assistant', content: response.text };

      setState((s) => ({
        ...s,
        messages: [...s.messages, assistantMsg],
        isLoading: false,
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: String(e),
      }));
    }
  }, []);

  const clearChat = useCallback(() => {
    setState((s) => ({ ...s, messages: [], error: null }));
  }, []);

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    aiReady: state.aiReady,
    initialize,
    sendMessage,
    clearChat,
  };
}
