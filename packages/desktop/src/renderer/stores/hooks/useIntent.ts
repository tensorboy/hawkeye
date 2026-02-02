import { useEffect } from 'react';
import { useHawkeyeStore } from '../index';

export function useIntent() {
  const cards = useHawkeyeStore((s) => s.cards);
  const chatMessages = useHawkeyeStore((s) => s.chatMessages);
  const chatInput = useHawkeyeStore((s) => s.chatInput);
  const chatLoading = useHawkeyeStore((s) => s.chatLoading);
  const showChatDialog = useHawkeyeStore((s) => s.showChatDialog);

  const setCards = useHawkeyeStore((s) => s.setCards);
  const addCard = useHawkeyeStore((s) => s.addCard);
  const addChatMessage = useHawkeyeStore((s) => s.addChatMessage);
  const setChatInput = useHawkeyeStore((s) => s.setChatInput);
  const setChatLoading = useHawkeyeStore((s) => s.setChatLoading);
  const setShowChatDialog = useHawkeyeStore((s) => s.setShowChatDialog);

  useEffect(() => {
    // Guard: window.hawkeye only exists in Electron (via preload script)
    if (!window.hawkeye) {
      return;
    }

    // @ts-ignore
    const cleanupIntents = window.hawkeye.onIntents((intents) => {
      // Logic to convert intents to cards would go here or in a transformer
      // For now, assume cards are updated via another mechanism or directly
    });

    // @ts-ignore
    const cleanupPlan = window.hawkeye.onPlan((plan) => {
      // Handle plan updates
    });

    return () => {
      cleanupIntents();
      cleanupPlan();
    };
  }, []);

  const sendChat = async (message: string) => {
    if (!message.trim()) return;
    if (!window.hawkeye) {
      console.warn('[useIntent] sendChat: window.hawkeye not available');
      return;
    }

    setChatLoading(true);
    addChatMessage({
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    });
    setChatInput('');

    try {
      // @ts-ignore
      const response = await window.hawkeye.chat([{ role: 'user', content: message }]);
      addChatMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(error);
    } finally {
      setChatLoading(false);
    }
  };

  return {
    cards,
    chatMessages,
    chatInput,
    chatLoading,
    showChatDialog,
    setChatInput,
    setShowChatDialog,
    sendChat,
    setCards,
    addCard,
  };
}
