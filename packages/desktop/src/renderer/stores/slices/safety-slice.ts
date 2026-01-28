/**
 * Safety Slice - 安全助手状态管理
 * 管理安全警告、检测历史和用户操作
 */

import type { StateCreator } from 'zustand';
import type {
  A2UISafetyAlertCard,
  SafetyAnalysisResult,
  SafetyCheckInput,
  SafetyRiskLevel,
} from '@hawkeye/core';
import type { HawkeyeStore, SafetySlice } from '../types';

export interface SafetyAlert {
  id: string;
  card: A2UISafetyAlertCard;
  result: SafetyAnalysisResult;
  input: SafetyCheckInput;
  userAction?: 'dismissed' | 'reported' | 'blocked' | 'proceeded';
  timestamp: number;
}

export const createSafetySlice: StateCreator<HawkeyeStore, [], [], SafetySlice> = (set, get) => ({
  // State
  safetyAlerts: [],
  safetyHistory: [],
  safetyEnabled: true,
  autoCheckUrls: true,
  autoCheckClipboard: false,
  showSafetyPanel: false,
  lastCheckResult: null,

  // Actions
  setSafetyEnabled: (enabled) => set({ safetyEnabled: enabled }),
  setAutoCheckUrls: (enabled) => set({ autoCheckUrls: enabled }),
  setAutoCheckClipboard: (enabled) => set({ autoCheckClipboard: enabled }),
  setShowSafetyPanel: (show) => set({ showSafetyPanel: show }),

  addSafetyAlert: (alert) =>
    set((state) => ({
      safetyAlerts: [alert, ...state.safetyAlerts].slice(0, 50), // Keep max 50 alerts
      safetyHistory: [alert, ...state.safetyHistory].slice(0, 200), // Keep max 200 in history
      lastCheckResult: alert.result,
    })),

  removeSafetyAlert: (alertId) =>
    set((state) => ({
      safetyAlerts: state.safetyAlerts.filter((a) => a.id !== alertId),
    })),

  clearSafetyAlerts: () => set({ safetyAlerts: [] }),

  updateAlertAction: (alertId, action) =>
    set((state) => ({
      safetyAlerts: state.safetyAlerts.map((a) =>
        a.id === alertId ? { ...a, userAction: action } : a
      ),
      safetyHistory: state.safetyHistory.map((a) =>
        a.id === alertId ? { ...a, userAction: action } : a
      ),
    })),

  getAlertsByRiskLevel: (riskLevel: SafetyRiskLevel) => {
    const state = get();
    return state.safetyAlerts.filter((a) => a.result.riskLevel === riskLevel);
  },

  getRecentAlerts: (count: number) => {
    const state = get();
    return state.safetyAlerts.slice(0, count);
  },

  getHighRiskAlerts: () => {
    const state = get();
    return state.safetyAlerts.filter(
      (a) => a.result.riskLevel === 'high' || a.result.riskLevel === 'critical'
    );
  },

  clearHistory: () => set({ safetyHistory: [] }),

  setLastCheckResult: (result) => set({ lastCheckResult: result }),
});
