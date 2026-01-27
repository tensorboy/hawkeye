import type { StateCreator } from 'zustand';
import type { HawkeyeStore, ExecutionSlice } from '../types';

export const createExecutionSlice: StateCreator<HawkeyeStore, [], [], ExecutionSlice> = (set) => ({
  currentPlan: null,
  currentExecution: null,

  setCurrentPlan: (plan) => set({ currentPlan: plan }),
  setCurrentExecution: (execution) => set({ currentExecution: execution }),
});
