import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { HawkeyeStore } from './types';
import { createAppSlice } from './slices/app-slice';
import { createConfigSlice } from './slices/config-slice';
import { createIntentSlice } from './slices/intent-slice';
import { createExecutionSlice } from './slices/execution-slice';
import { createLifeTreeSlice } from './slices/life-tree-slice';

export const useHawkeyeStore = create<HawkeyeStore>()(
  subscribeWithSelector((...a) => ({
    ...createAppSlice(...a),
    ...createConfigSlice(...a),
    ...createIntentSlice(...a),
    ...createExecutionSlice(...a),
    ...createLifeTreeSlice(...a),
  }))
);

export * from './types';
