/**
 * Preload script - 暴露安全的 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('hawkeye', {
  // 观察屏幕
  observe: () => ipcRenderer.invoke('observe'),

  // 执行建议
  execute: (suggestionId: string) => ipcRenderer.invoke('execute', suggestionId),

  // 获取建议列表
  getSuggestions: () => ipcRenderer.invoke('getSuggestions'),

  // 配置 API Key
  setApiKey: (apiKey: string) => ipcRenderer.invoke('setApiKey', apiKey),

  // 获取配置
  getConfig: () => ipcRenderer.invoke('getConfig'),

  // 监听事件
  onSuggestions: (callback: (suggestions: unknown[]) => void) => {
    ipcRenderer.on('suggestions', (_event, suggestions) => callback(suggestions));
  },

  onLoading: (callback: (loading: boolean) => void) => {
    ipcRenderer.on('loading', (_event, loading) => callback(loading));
  },

  onError: (callback: (error: string) => void) => {
    ipcRenderer.on('error', (_event, error) => callback(error));
  },
});
