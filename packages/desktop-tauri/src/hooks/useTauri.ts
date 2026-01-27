import { invoke } from '@tauri-apps/api/core';

// Types matching Rust backend
export interface ScreenshotResult {
  success: boolean;
  dataUrl?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface OcrResult {
  success: boolean;
  text?: string;
  confidence?: number;
  durationMs?: number;  // Maps from Rust's duration_ms
  backend?: string;
  error?: string;
}

export interface WindowInfo {
  appName: string;
  title: string;
  bundleId?: string;
}

export interface AppConfig {
  aiProvider: string;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiBaseUrl?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  syncPort: number;
  autoStartSync: boolean;
  autoUpdate: boolean;
  localOnly: boolean;
  onboardingCompleted?: boolean;
}

// Status result from Rust
export interface HawkeyeStatus {
  initialized: boolean;
  aiReady: boolean;
  aiProvider?: string;
  syncRunning: boolean;
  syncPort?: number;
  connectedClients: number;
}

// Tauri command wrappers
export async function getStatus(): Promise<HawkeyeStatus> {
  return invoke('get_status');
}

export async function captureScreen(): Promise<ScreenshotResult> {
  return invoke('capture_screen');
}

export async function runOcr(imageBase64: string): Promise<OcrResult> {
  return invoke('run_ocr', { imageBase64 });
}

export async function getActiveWindow(): Promise<WindowInfo> {
  return invoke('get_active_window');
}

export async function getClipboard(): Promise<string> {
  return invoke('get_clipboard');
}

export async function loadConfig(): Promise<AppConfig> {
  return invoke('load_config');
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke('save_config', { config });
}

export async function openUrl(url: string): Promise<void> {
  return invoke('open_url', { url });
}
