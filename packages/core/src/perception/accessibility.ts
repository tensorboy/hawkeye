/**
 * Accessibility API Service
 * macOS Accessibility API integration inspired by AXorcist
 *
 * Provides access to UI elements via AppleScript/JXA since native
 * modules are not available in standard Electron apps.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AXElement {
  role: string;
  title?: string;
  description?: string;
  value?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  focused?: boolean;
  enabled?: boolean;
  children?: AXElement[];
}

export interface AXWindow {
  title: string;
  role: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  focused: boolean;
  minimized: boolean;
  fullscreen: boolean;
}

export interface AXApplication {
  name: string;
  bundleId: string;
  pid: number;
  focused: boolean;
  windows: AXWindow[];
}

export interface FocusedElement {
  role: string;
  title?: string;
  value?: string;
  application: string;
  window?: string;
}

/**
 * Accessibility Service for macOS
 * Uses AppleScript/JXA for accessibility operations
 */
export class AccessibilityService {
  private platform: NodeJS.Platform;
  private debugLog: (msg: string) => void;

  constructor(debugLog?: (msg: string) => void) {
    this.platform = process.platform;
    this.debugLog = debugLog || (() => {});
  }

  /**
   * Check if accessibility permissions are granted
   */
  async checkPermissions(): Promise<boolean> {
    if (this.platform !== 'darwin') {
      return true; // Not applicable on non-macOS
    }

    try {
      const script = `
        use framework "Foundation"
        use framework "ApplicationServices"

        set trusted to current application's AXIsProcessTrusted() as boolean
        return trusted
      `;
      const { stdout } = await execAsync(`osascript -l AppleScript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Request accessibility permissions (opens System Preferences)
   */
  async requestPermissions(): Promise<void> {
    if (this.platform !== 'darwin') return;

    try {
      await execAsync(
        'open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"'
      );
    } catch (error) {
      this.debugLog(`Failed to open accessibility preferences: ${error}`);
    }
  }

  /**
   * Get the currently focused application
   */
  async getFocusedApplication(): Promise<AXApplication | null> {
    if (this.platform !== 'darwin') return null;

    try {
      const script = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp
          set appBundleId to bundle identifier of frontApp
          set appPid to unix id of frontApp

          set windowList to {}
          try
            repeat with w in windows of frontApp
              set windowTitle to name of w
              set windowPos to position of w
              set windowSize to size of w
              set windowFocused to focused of w
              set windowMinimized to false
              try
                set windowMinimized to value of attribute "AXMinimized" of w
              end try
              set end of windowList to {windowTitle, item 1 of windowPos, item 2 of windowPos, item 1 of windowSize, item 2 of windowSize, windowFocused, windowMinimized}
            end repeat
          end try

          return {appName, appBundleId, appPid, windowList}
        end tell
      `;

      const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      const parsed = this.parseAppleScriptResult(stdout.trim());

      if (parsed && parsed.length >= 4) {
        const windows: AXWindow[] = [];
        if (Array.isArray(parsed[3])) {
          for (const w of parsed[3]) {
            if (Array.isArray(w) && w.length >= 7) {
              windows.push({
                title: w[0] || '',
                role: 'AXWindow',
                position: { x: parseInt(w[1]) || 0, y: parseInt(w[2]) || 0 },
                size: { width: parseInt(w[3]) || 0, height: parseInt(w[4]) || 0 },
                focused: w[5] === 'true' || w[5] === true,
                minimized: w[6] === 'true' || w[6] === true,
                fullscreen: false,
              });
            }
          }
        }

        return {
          name: parsed[0] || '',
          bundleId: parsed[1] || '',
          pid: parseInt(parsed[2]) || 0,
          focused: true,
          windows,
        };
      }

      return null;
    } catch (error) {
      this.debugLog(`Failed to get focused application: ${error}`);
      return null;
    }
  }

  /**
   * Get the currently focused UI element
   */
  async getFocusedElement(): Promise<FocusedElement | null> {
    if (this.platform !== 'darwin') return null;

    try {
      const script = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp

          set focusedElem to null
          set elemRole to ""
          set elemTitle to ""
          set elemValue to ""
          set windowTitle to ""

          try
            set focusedElem to focused UI element of frontApp
            set elemRole to role of focusedElem
            try
              set elemTitle to title of focusedElem
            end try
            try
              set elemValue to value of focusedElem
            end try
          end try

          try
            set frontWindow to front window of frontApp
            set windowTitle to name of frontWindow
          end try

          return {elemRole, elemTitle, elemValue, appName, windowTitle}
        end tell
      `;

      const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      const parsed = this.parseAppleScriptResult(stdout.trim());

      if (parsed && parsed.length >= 5) {
        return {
          role: parsed[0] || 'unknown',
          title: parsed[1] || undefined,
          value: parsed[2] || undefined,
          application: parsed[3] || '',
          window: parsed[4] || undefined,
        };
      }

      return null;
    } catch (error) {
      this.debugLog(`Failed to get focused element: ${error}`);
      return null;
    }
  }

  /**
   * Get all running applications
   */
  async getRunningApplications(): Promise<AXApplication[]> {
    if (this.platform !== 'darwin') return [];

    try {
      const script = `
        tell application "System Events"
          set appList to {}
          repeat with proc in (every application process whose background only is false)
            set appName to name of proc
            set appBundleId to bundle identifier of proc
            set appPid to unix id of proc
            set appFocused to frontmost of proc
            set end of appList to {appName, appBundleId, appPid, appFocused}
          end repeat
          return appList
        end tell
      `;

      const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      const parsed = this.parseAppleScriptResult(stdout.trim());

      if (Array.isArray(parsed)) {
        return parsed.map((app: any) => {
          if (Array.isArray(app) && app.length >= 4) {
            return {
              name: app[0] || '',
              bundleId: app[1] || '',
              pid: parseInt(app[2]) || 0,
              focused: app[3] === 'true' || app[3] === true,
              windows: [],
            };
          }
          return null;
        }).filter(Boolean) as AXApplication[];
      }

      return [];
    } catch (error) {
      this.debugLog(`Failed to get running applications: ${error}`);
      return [];
    }
  }

  /**
   * Get UI element at specific screen coordinates
   */
  async getElementAtPosition(x: number, y: number): Promise<AXElement | null> {
    if (this.platform !== 'darwin') return null;

    try {
      // Use JXA for more precise element detection
      const script = `
        ObjC.import('ApplicationServices');

        const point = { x: ${x}, y: ${y} };
        const systemWideElement = $.AXUIElementCreateSystemWide();

        const elementRef = Ref();
        const result = $.AXUIElementCopyElementAtPosition(systemWideElement, point.x, point.y, elementRef);

        if (result === 0 && elementRef[0]) {
          const element = elementRef[0];

          const roleRef = Ref();
          $.AXUIElementCopyAttributeValue(element, 'AXRole', roleRef);
          const role = roleRef[0] ? ObjC.unwrap(roleRef[0]) : 'unknown';

          const titleRef = Ref();
          $.AXUIElementCopyAttributeValue(element, 'AXTitle', titleRef);
          const title = titleRef[0] ? ObjC.unwrap(titleRef[0]) : '';

          const descRef = Ref();
          $.AXUIElementCopyAttributeValue(element, 'AXDescription', descRef);
          const description = descRef[0] ? ObjC.unwrap(descRef[0]) : '';

          const posRef = Ref();
          $.AXUIElementCopyAttributeValue(element, 'AXPosition', posRef);
          let posX = 0, posY = 0;
          if (posRef[0]) {
            const pos = ObjC.unwrap(posRef[0]);
            posX = pos.x || 0;
            posY = pos.y || 0;
          }

          const sizeRef = Ref();
          $.AXUIElementCopyAttributeValue(element, 'AXSize', sizeRef);
          let width = 0, height = 0;
          if (sizeRef[0]) {
            const size = ObjC.unwrap(sizeRef[0]);
            width = size.width || 0;
            height = size.height || 0;
          }

          JSON.stringify({
            role: role,
            title: title,
            description: description,
            position: { x: posX, y: posY },
            size: { width: width, height: height }
          });
        } else {
          JSON.stringify(null);
        }
      `;

      const { stdout } = await execAsync(`osascript -l JavaScript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      const result = JSON.parse(stdout.trim());
      return result;
    } catch (error) {
      this.debugLog(`Failed to get element at position: ${error}`);
      return null;
    }
  }

  /**
   * Click on a UI element at coordinates
   */
  async clickElement(x: number, y: number): Promise<boolean> {
    if (this.platform !== 'darwin') return false;

    try {
      const script = `
        ObjC.import('ApplicationServices');

        const point = { x: ${x}, y: ${y} };
        const systemWideElement = $.AXUIElementCreateSystemWide();

        const elementRef = Ref();
        const result = $.AXUIElementCopyElementAtPosition(systemWideElement, point.x, point.y, elementRef);

        if (result === 0 && elementRef[0]) {
          const element = elementRef[0];
          const pressResult = $.AXUIElementPerformAction(element, 'AXPress');
          pressResult === 0;
        } else {
          false;
        }
      `;

      const { stdout } = await execAsync(`osascript -l JavaScript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      return stdout.trim() === 'true';
    } catch (error) {
      this.debugLog(`Failed to click element: ${error}`);
      return false;
    }
  }

  /**
   * Set value of a text field
   */
  async setElementValue(x: number, y: number, value: string): Promise<boolean> {
    if (this.platform !== 'darwin') return false;

    try {
      const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = `
        ObjC.import('ApplicationServices');

        const point = { x: ${x}, y: ${y} };
        const systemWideElement = $.AXUIElementCreateSystemWide();

        const elementRef = Ref();
        const result = $.AXUIElementCopyElementAtPosition(systemWideElement, point.x, point.y, elementRef);

        if (result === 0 && elementRef[0]) {
          const element = elementRef[0];
          const value = $("${escapedValue}");
          const setResult = $.AXUIElementSetAttributeValue(element, 'AXValue', value);
          setResult === 0;
        } else {
          false;
        }
      `;

      const { stdout } = await execAsync(`osascript -l JavaScript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      return stdout.trim() === 'true';
    } catch (error) {
      this.debugLog(`Failed to set element value: ${error}`);
      return false;
    }
  }

  /**
   * Focus an application by name
   */
  async focusApplication(name: string): Promise<boolean> {
    if (this.platform !== 'darwin') return false;

    try {
      const script = `
        tell application "${name.replace(/"/g, '\\"')}"
          activate
        end tell
      `;
      await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      return true;
    } catch (error) {
      this.debugLog(`Failed to focus application: ${error}`);
      return false;
    }
  }

  /**
   * Get menu bar items for an application
   */
  async getMenuBarItems(appName: string): Promise<string[]> {
    if (this.platform !== 'darwin') return [];

    try {
      const script = `
        tell application "System Events"
          tell process "${appName.replace(/"/g, '\\"')}"
            set menuNames to {}
            repeat with menuBarItem in menu bar items of menu bar 1
              set end of menuNames to name of menuBarItem
            end repeat
            return menuNames
          end tell
        end tell
      `;

      const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      const parsed = this.parseAppleScriptResult(stdout.trim());
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      this.debugLog(`Failed to get menu bar items: ${error}`);
      return [];
    }
  }

  /**
   * Click a menu item
   */
  async clickMenuItem(appName: string, menuPath: string[]): Promise<boolean> {
    if (this.platform !== 'darwin' || menuPath.length === 0) return false;

    try {
      let menuScript = `menu bar item "${menuPath[0].replace(/"/g, '\\"')}" of menu bar 1`;
      for (let i = 1; i < menuPath.length; i++) {
        menuScript = `menu item "${menuPath[i].replace(/"/g, '\\"')}" of menu 1 of ${menuScript}`;
      }

      const script = `
        tell application "System Events"
          tell process "${appName.replace(/"/g, '\\"')}"
            click ${menuScript}
          end tell
        end tell
      `;

      await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      return true;
    } catch (error) {
      this.debugLog(`Failed to click menu item: ${error}`);
      return false;
    }
  }

  /**
   * Parse AppleScript list result
   */
  private parseAppleScriptResult(output: string): any {
    // AppleScript returns lists in format: {item1, item2, ...}
    if (!output) return null;

    try {
      // Simple parser for AppleScript list format
      // Convert {a, b, {c, d}} to ['a', 'b', ['c', 'd']]
      const cleaned = output
        .replace(/^\{/, '[')
        .replace(/\}$/, ']')
        .replace(/\{/g, '[')
        .replace(/\}/g, ']')
        .replace(/missing value/g, 'null');

      // Handle unquoted strings
      const jsonLike = cleaned.replace(
        /([,\[\s])([^,\[\]\s"'][^,\[\]]*?)([,\]\s])/g,
        '$1"$2"$3'
      );

      return JSON.parse(jsonLike);
    } catch {
      // Return as-is if parsing fails
      return output;
    }
  }
}

export default AccessibilityService;
