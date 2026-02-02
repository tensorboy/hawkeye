import { ipcMain, BrowserWindow } from 'electron';
import type { AudioProcessorService } from '../services/audio-processor-service';

/**
 * Register IPC handlers for audio processing with AEC
 */
export function registerAudioProcessorHandlers(
  audioProcessor: AudioProcessorService,
  debugLog: (msg: string) => void
): void {
  // Start audio processing with AEC
  ipcMain.handle('audio-processor:start', async () => {
    try {
      await audioProcessor.start();
      return { success: true, status: audioProcessor.getStatus() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLog(`[IPC] audio-processor:start error: ${message}`);
      return { success: false, error: message };
    }
  });

  // Stop audio processing
  ipcMain.handle('audio-processor:stop', () => {
    audioProcessor.stop();
    return { success: true, status: audioProcessor.getStatus() };
  });

  // Get current status
  ipcMain.handle('audio-processor:status', () => {
    return audioProcessor.getStatus();
  });

  // Process manual audio (for fallback mode)
  ipcMain.handle('audio-processor:process', (_event, audioData: ArrayBuffer) => {
    try {
      const buffer = Buffer.from(audioData);
      audioProcessor.processManualAudio(buffer);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  debugLog('[IPC] Audio processor handlers registered');
}

/**
 * Cleanup handlers on app quit
 */
export function cleanupAudioProcessorHandlers(): void {
  ipcMain.removeHandler('audio-processor:start');
  ipcMain.removeHandler('audio-processor:stop');
  ipcMain.removeHandler('audio-processor:status');
  ipcMain.removeHandler('audio-processor:process');
}
