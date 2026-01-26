import type { StateCreator } from 'zustand';
import type { HawkeyeStore, ConfigSlice } from '../types';

export const createConfigSlice: StateCreator<HawkeyeStore, [], [], ConfigSlice> = (set) => ({
  config: null,
  tempConfig: {},
  ollamaStatus: null,
  installedModels: [],
  modelPullProgress: null,
  modelTestResult: null,

  setConfig: (config) => set({ config, tempConfig: config || {} }),
  setTempConfig: (config) => set({ tempConfig: config }),
  updateTempConfig: (updates) => set((state) => ({
    tempConfig: { ...state.tempConfig, ...updates }
  })),
  setOllamaStatus: (status) => set({ ollamaStatus: status }),
  setInstalledModels: (models) => set({ installedModels: models }),
  setModelPullProgress: (progress) => set({ modelPullProgress: progress }),
  setModelTestResult: (result) => set({ modelTestResult: result }),
});
