import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { HawkeyeStore } from './types';
import { createAppSlice } from './slices/app-slice';
import { createConfigSlice } from './slices/config-slice';
import { createIntentSlice } from './slices/intent-slice';

export const useHawkeyeStore = create<HawkeyeStore>()(
  subscribeWithSelector((...a) => ({
    ...createAppSlice(...a),
    ...createConfigSlice(...a),
    ...createIntentSlice(...a),
  }))
);

export * from './types';
