import type { StateCreator } from 'zustand';
import type { HawkeyeStore, ConfigSlice } from '../types';

export const createConfigSlice: StateCreator<HawkeyeStore, [], [], ConfigSlice> = (set) => ({
  config: null,
  tempConfig: {},
  modelTestResult: null,

  setConfig: (config) => set({ config, tempConfig: config || {} }),
  setTempConfig: (config) => set({ tempConfig: config }),
  updateTempConfig: (updates) => set((state) => ({
    tempConfig: { ...state.tempConfig, ...updates }
  })),
  setModelTestResult: (result) => set({ modelTestResult: result }),
});
