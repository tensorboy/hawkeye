/**
 * Global Click IPC Handlers
 * Handles global mouse click capture for WebGazer calibration
 */

import { ipcMain, BrowserWindow } from 'electron';
import { GlobalClickService, GlobalClickEvent } from '../services/global-click-service';

// Module-level state
let globalClickService: GlobalClickService | null = null;
let mainWindowGetter: (() => BrowserWindow | null) | null = null;
let debugLog: ((msg: string) => void) | null = null;

export function registerGlobalClickHandlers(
  windowGetter: () => BrowserWindow | null,
  logFn?: (msg: string) => void
) {
  mainWindowGetter = windowGetter;
  debugLog = logFn || console.log;

  // Initialize global click service
  globalClickService = new GlobalClickService(debugLog);

  // Set main window reference
  const mainWindow = mainWindowGetter();
  if (mainWindow) {
    globalClickService.setMainWindow(mainWindow);
  }

  // Set up click callback to send events to renderer
  globalClickService.onGlobalClick((event: GlobalClickEvent) => {
    const win = mainWindowGetter?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send('global-click:event', event);
    }
  });

  // Start global click tracking
  ipcMain.handle('global-click:start', () => {
    if (!globalClickService) {
      return { success: false, error: 'Service not initialized' };
    }

    // Update main window reference
    const win = mainWindowGetter?.();
    if (win) {
      globalClickService.setMainWindow(win);
    }

    const success = globalClickService.start();
    return { success };
  });

  // Stop global click tracking
  ipcMain.handle('global-click:stop', () => {
    if (!globalClickService) {
      return { success: false, error: 'Service not initialized' };
    }

    globalClickService.stop();
    return { success: true };
  });

  // Get global click status
  ipcMain.handle('global-click:status', () => {
    return {
      running: globalClickService?.getIsRunning() ?? false,
    };
  });

  debugLog?.('[GlobalClick] Handlers registered');
}

/**
 * Update main window reference (call when window changes)
 */
export function updateGlobalClickMainWindow(window: BrowserWindow | null) {
  if (globalClickService) {
    globalClickService.setMainWindow(window);
  }
}

/**
 * Cleanup global click service
 */
export function cleanupGlobalClickService() {
  if (globalClickService) {
    globalClickService.destroy();
    globalClickService = null;
  }
}
