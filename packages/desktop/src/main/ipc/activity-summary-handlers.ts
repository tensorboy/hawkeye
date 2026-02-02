/**
 * Activity Summary IPC Handlers
 *
 * Exposes Activity Summary functionality to the renderer process.
 */

import { ipcMain } from 'electron';
import type { ActivitySummarizerService } from '../services/activity-summarizer-service';

export function registerActivitySummaryHandlers(summarizerService: ActivitySummarizerService) {
  // Get recent summaries
  ipcMain.handle('activity-summary:get-recent', async (_event, limit?: number) => {
    return summarizerService.getRecentSummaries(limit);
  });

  // Get summaries in a time range
  ipcMain.handle('activity-summary:get-range', async (_event, startTime: number, endTime: number) => {
    return summarizerService.getSummariesInRange(startTime, endTime);
  });

  // Generate a summary now
  ipcMain.handle('activity-summary:generate-now', async () => {
    return summarizerService.generateNow();
  });

  // Get pending Life Tree updates
  ipcMain.handle('activity-summary:get-pending-updates', async () => {
    return summarizerService.getPendingLifeTreeUpdates();
  });

  // Mark a summary as having updated the Life Tree
  ipcMain.handle('activity-summary:mark-updated', async (_event, summaryId: string) => {
    summarizerService.markLifeTreeUpdated(summaryId);
    return { success: true };
  });

  // Check if the summarizer is running
  ipcMain.handle('activity-summary:is-running', async () => {
    return summarizerService.isRunning();
  });

  // Start the summarizer
  ipcMain.handle('activity-summary:start', async () => {
    summarizerService.start();
    return { success: true };
  });

  // Stop the summarizer
  ipcMain.handle('activity-summary:stop', async () => {
    summarizerService.stop();
    return { success: true };
  });

  // Get the current config
  ipcMain.handle('activity-summary:get-config', async () => {
    return summarizerService.getConfig();
  });

  // Update the config
  ipcMain.handle('activity-summary:update-config', async (_event, config: any) => {
    summarizerService.updateConfig(config);
    return { success: true };
  });
}
