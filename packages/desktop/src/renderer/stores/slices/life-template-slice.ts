import type { StateCreator } from 'zustand';
import type { HawkeyeStore, LifeTemplateSlice } from '../types';

export const createLifeTemplateSlice: StateCreator<HawkeyeStore, [], [], LifeTemplateSlice> = (set, get) => ({
  lifeTemplate: null,
  lifeTemplateLoading: false,
  lifeTemplateError: null,
  showLifeTemplate: false,
  activeLifeTemplateTab: 'overview',

  setShowLifeTemplate: (show) => set({ showLifeTemplate: show }),
  setActiveLifeTemplateTab: (tab) => set({ activeLifeTemplateTab: tab }),

  fetchLifeTemplate: async () => {
    set({ lifeTemplateLoading: true, lifeTemplateError: null });
    try {
      const template = await (window as any).hawkeye.lifeTemplate?.getTemplate?.();
      set({ lifeTemplate: template, lifeTemplateLoading: false });
    } catch (err: any) {
      set({
        lifeTemplateError: err.message ?? 'Failed to fetch life template',
        lifeTemplateLoading: false,
      });
    }
  },

  updateLifeTemplate: async (updates) => {
    const current = get().lifeTemplate;
    if (!current) return;

    set({ lifeTemplateLoading: true, lifeTemplateError: null });
    try {
      const updated = await (window as any).hawkeye.lifeTemplate?.updateTemplate?.(current.id, updates);
      set({ lifeTemplate: updated, lifeTemplateLoading: false });
    } catch (err: any) {
      set({
        lifeTemplateError: err.message ?? 'Failed to update life template',
        lifeTemplateLoading: false,
      });
    }
  },

  createLifeTemplate: async (name) => {
    set({ lifeTemplateLoading: true, lifeTemplateError: null });
    try {
      const template = await (window as any).hawkeye.lifeTemplate?.createTemplate?.({ name });
      set({ lifeTemplate: template, lifeTemplateLoading: false });
    } catch (err: any) {
      set({
        lifeTemplateError: err.message ?? 'Failed to create life template',
        lifeTemplateLoading: false,
      });
    }
  },

  updateWheelCategory: async (categoryId, score, notes) => {
    const current = get().lifeTemplate;
    if (!current) return;

    try {
      const updated = await (window as any).hawkeye.lifeTemplate?.updateWheelCategory?.(
        current.id,
        categoryId,
        score,
        notes
      );
      set({ lifeTemplate: updated });
    } catch (err: any) {
      console.error('Failed to update wheel category:', err);
    }
  },

  addIkigaiItem: async (quadrant, item) => {
    const current = get().lifeTemplate;
    if (!current) return;

    try {
      const updated = await (window as any).hawkeye.lifeTemplate?.addIkigaiItem?.(
        current.id,
        quadrant,
        item
      );
      set({ lifeTemplate: updated });
    } catch (err: any) {
      console.error('Failed to add ikigai item:', err);
    }
  },
});
