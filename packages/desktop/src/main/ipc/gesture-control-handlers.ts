/**
 * Gesture Control IPC Handlers
 * Handles gesture events from the renderer and executes system actions
 */

import { ipcMain, BrowserWindow, screen, desktopCapturer } from 'electron';

// Gesture action types
export type GestureAction =
  | 'screenshot'
  | 'toggle_recording'
  | 'pause'
  | 'confirm'
  | 'cancel'
  | 'scroll_up'
  | 'scroll_down'
  | 'click'
  | 'quick_menu'
  | 'cursor_move';

export interface GestureEvent {
  action: GestureAction;
  gesture: string;
  confidence: number;
  position?: { x: number; y: number };
  handedness?: 'Left' | 'Right';
}

export interface GestureControlConfig {
  enabled: boolean;
  cursorSensitivity: number; // 1.0 = normal, 2.0 = 2x speed
  clickHoldTime: number; // ms to hold for click
  scrollSpeed: number; // pixels per scroll event
  screenBounds?: { width: number; height: number };
}

// Module-level state
let gestureControlConfig: GestureControlConfig = {
  enabled: true,
  cursorSensitivity: 1.5,
  clickHoldTime: 300,
  scrollSpeed: 100,
};

let mainWindowGetter: (() => BrowserWindow | null) | null = null;
let debugLog: ((msg: string) => void) | null = null;

// Robot module for system control (will be loaded dynamically)
let robot: any = null;

// Try to load robotjs
function loadRobotModule(): boolean {
  // Try @jitsi/robotjs
  try {
    robot = require('@jitsi/robotjs');
    debugLog?.('[GestureControl] Loaded @jitsi/robotjs');
    return true;
  } catch (e) {
    debugLog?.('[GestureControl] @jitsi/robotjs not available, mouse control disabled');
  }

  return false;
}

// Get screen dimensions
function getScreenBounds(): { width: number; height: number } {
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    width: primaryDisplay.workAreaSize.width,
    height: primaryDisplay.workAreaSize.height,
  };
}

// Convert normalized position (0-1) to screen coordinates
function toScreenCoordinates(position: { x: number; y: number }): { x: number; y: number } {
  const bounds = gestureControlConfig.screenBounds || getScreenBounds();
  return {
    x: Math.round(position.x * bounds.width),
    y: Math.round(position.y * bounds.height),
  };
}

// Handle cursor movement
function handleCursorMove(position: { x: number; y: number }) {
  if (!robot) return;

  const screenPos = toScreenCoordinates(position);
  robot.moveMouse(screenPos.x, screenPos.y);
}

// Handle click
function handleClick() {
  if (!robot) return;

  robot.mouseClick();
  debugLog?.('[GestureControl] Click executed');
}

// Handle scroll
function handleScroll(direction: 'up' | 'down') {
  if (!robot) return;

  // robotjs scrollMouse: positive = down, negative = up
  robot.scrollMouse(0, direction === 'up' ? 3 : -3);
  debugLog?.(`[GestureControl] Scroll ${direction}`);
}

// Take screenshot
async function handleScreenshot(): Promise<string | null> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });

    if (sources.length > 0) {
      const screenshot = sources[0].thumbnail.toDataURL();
      debugLog?.('[GestureControl] Screenshot captured');

      // Notify renderer
      const mainWindow = mainWindowGetter?.();
      if (mainWindow) {
        mainWindow.webContents.send('gesture-control:screenshot', {
          dataUrl: screenshot,
          timestamp: Date.now(),
        });
      }

      return screenshot;
    }
  } catch (error) {
    debugLog?.(`[GestureControl] Screenshot failed: ${error}`);
  }
  return null;
}

// Toggle recording (notify renderer to handle)
function handleToggleRecording() {
  const mainWindow = mainWindowGetter?.();
  if (mainWindow) {
    mainWindow.webContents.send('gesture-control:toggle-recording');
  }
  debugLog?.('[GestureControl] Toggle recording requested');
}

// Pause (notify renderer to handle)
function handlePause() {
  const mainWindow = mainWindowGetter?.();
  if (mainWindow) {
    mainWindow.webContents.send('gesture-control:pause');
  }
  debugLog?.('[GestureControl] Pause requested');
}

// Quick menu (notify renderer to show gesture menu)
function handleQuickMenu() {
  const mainWindow = mainWindowGetter?.();
  if (mainWindow) {
    mainWindow.webContents.send('gesture-control:quick-menu');
  }
  debugLog?.('[GestureControl] Quick menu requested');
}

// Main gesture event handler
async function handleGestureEvent(event: GestureEvent): Promise<{ success: boolean; error?: string }> {
  if (!gestureControlConfig.enabled) {
    return { success: false, error: 'Gesture control disabled' };
  }

  try {
    switch (event.action) {
      case 'cursor_move':
        if (event.position) {
          handleCursorMove(event.position);
        }
        break;

      case 'click':
        handleClick();
        break;

      case 'scroll_up':
        handleScroll('up');
        break;

      case 'scroll_down':
        handleScroll('down');
        break;

      case 'screenshot':
        await handleScreenshot();
        break;

      case 'toggle_recording':
        handleToggleRecording();
        break;

      case 'pause':
        handlePause();
        break;

      case 'quick_menu':
        handleQuickMenu();
        break;

      case 'confirm':
      case 'cancel':
        // These are UI actions, handled by renderer
        const mainWindow = mainWindowGetter?.();
        if (mainWindow) {
          mainWindow.webContents.send(`gesture-control:${event.action}`);
        }
        break;
    }

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    debugLog?.(`[GestureControl] Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

export function registerGestureControlHandlers(
  windowGetter: () => BrowserWindow | null,
  logFn?: (msg: string) => void
) {
  mainWindowGetter = windowGetter;
  debugLog = logFn || console.log;

  // Initialize screen bounds
  gestureControlConfig.screenBounds = getScreenBounds();

  // Try to load robot module
  const robotLoaded = loadRobotModule();
  debugLog?.(`[GestureControl] Robot module loaded: ${robotLoaded}`);

  // Handle gesture events from renderer
  ipcMain.handle('gesture-control', async (_event, gestureEvent: GestureEvent) => {
    return handleGestureEvent(gestureEvent);
  });

  // Get gesture control status
  ipcMain.handle('gesture-control:status', () => {
    return {
      enabled: gestureControlConfig.enabled,
      robotAvailable: robot !== null,
      screenBounds: gestureControlConfig.screenBounds,
    };
  });

  // Update gesture control config
  ipcMain.handle('gesture-control:update-config', (_event, config: Partial<GestureControlConfig>) => {
    gestureControlConfig = { ...gestureControlConfig, ...config };
    return gestureControlConfig;
  });

  // Enable/disable gesture control
  ipcMain.handle('gesture-control:set-enabled', (_event, enabled: boolean) => {
    gestureControlConfig.enabled = enabled;
    debugLog?.(`[GestureControl] ${enabled ? 'Enabled' : 'Disabled'}`);
    return { enabled };
  });

  // Manual screenshot trigger
  ipcMain.handle('gesture-control:screenshot', async () => {
    return handleScreenshot();
  });

  debugLog?.('[GestureControl] Handlers registered');
}
