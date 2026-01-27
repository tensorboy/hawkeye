import type { StateCreator } from 'zustand';
import type { A2UICard } from '@hawkeye/core';
import type { HawkeyeStore, IntentSlice } from '../types';

export const createIntentSlice: StateCreator<HawkeyeStore, [], [], IntentSlice> = (set) => ({
  chatMessages: [],
  chatInput: '',
  cards: [],

  addChatMessage: (message) => set((state) => ({
    chatMessages: [...state.chatMessages, message]
  })),
  setChatInput: (input) => set({ chatInput: input }),
  clearChatMessages: () => set({ chatMessages: [] }),
  setCards: (cards) => set({ cards }),
  addCard: (card) => set((state) => ({ cards: [...state.cards, card] })),
  removeCard: (cardId) => set((state) => ({
    cards: state.cards.filter((c) => c.id !== cardId)
  })),
  updateCard: (cardId, updates) => set((state) => ({
    cards: state.cards.map((c) => c.id === cardId ? { ...c, ...updates } as A2UICard : c)
  })),
  clearCardsByType: (type) => set((state) => ({
    cards: state.cards.filter((c) => c.type !== type)
  })),
});
