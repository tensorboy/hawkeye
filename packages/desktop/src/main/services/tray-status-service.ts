/**
 * Tray Status Service
 * Dynamic tray icon and tooltip management inspired by CodeLooper
 */

import { Tray, nativeImage, NativeImage, Menu, app, BrowserWindow } from 'electron';
import * as path from 'path';
import { EventEmitter } from 'events';
import { getMenuBarPanel } from './menu-bar-panel-service';

export type TrayStatus = 'idle' | 'observing' | 'analyzing' | 'executing' | 'error' | 'updating';

export interface TrayStatusConfig {
  showProgress?: boolean;
  currentTask?: string;
  errorMessage?: string;
  updateVersion?: string;
}

/**
 * Manages dynamic tray icon status
 */
export class TrayStatusService extends EventEmitter {
  private tray: Tray | null = null;
  private currentStatus: TrayStatus = 'idle';
  private statusConfig: TrayStatusConfig = {};
  private icons: Map<TrayStatus, NativeImage> = new Map();
  private animationInterval: NodeJS.Timeout | null = null;
  private animationFrame = 0;
  private mainWindowGetter: () => BrowserWindow | null;
  private debugLog: (msg: string) => void;

  constructor(
    mainWindowGetter: () => BrowserWindow | null,
    debugLog: (msg: string) => void
  ) {
    super();
    this.mainWindowGetter = mainWindowGetter;
    this.debugLog = debugLog;
    this.createIcons();
  }

  /**
   * Create status icons
   */
  private createIcons(): void {
    // Status colors (will be converted to appropriate icons)
    const statusColors: Record<TrayStatus, string> = {
      idle: '#888888',      // Gray
      observing: '#4CAF50', // Green
      analyzing: '#2196F3', // Blue
      executing: '#FF9800', // Orange
      error: '#F44336',     // Red
      updating: '#9C27B0',  // Purple
    };

    for (const [status, color] of Object.entries(statusColors)) {
      this.icons.set(status as TrayStatus, this.createColoredIcon(color));
    }
  }

  /**
   * Create a simple colored circle icon
   */
  private createColoredIcon(color: string): NativeImage {
    // Create a simple 18x18 icon with the specified color
    // Using a data URL for a colored circle
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
        <circle cx="9" cy="9" r="7" fill="${color}" stroke="#333" stroke-width="1"/>
        <circle cx="9" cy="9" r="4" fill="white" opacity="0.3"/>
      </svg>
    `;
    const base64 = Buffer.from(svg).toString('base64');
    const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${base64}`);

    // On macOS, set as template image for proper dark/light mode support
    if (process.platform === 'darwin') {
      icon.setTemplateImage(false); // We want colored icons
    }

    return icon;
  }

  /**
   * Initialize the tray
   */
  initialize(existingTray?: Tray): Tray {
    if (existingTray) {
      this.tray = existingTray;
    } else {
      const icon = this.icons.get('idle') || nativeImage.createEmpty();
      this.tray = new Tray(icon);
    }

    this.updateTray();
    return this.tray;
  }

  /**
   * Get the tray instance
   */
  getTray(): Tray | null {
    return this.tray;
  }

  /**
   * Set tray status
   */
  setStatus(status: TrayStatus, config?: TrayStatusConfig): void {
    const previousStatus = this.currentStatus;
    this.currentStatus = status;
    this.statusConfig = config || {};

    this.debugLog(`Tray status: ${previousStatus} -> ${status}`);

    // Stop any existing animation
    this.stopAnimation();

    // Start animation for certain statuses
    if (status === 'analyzing' || status === 'executing') {
      this.startAnimation();
    }

    this.updateTray();
    this.emit('statusChanged', { status, config });

    // Forward status to menu bar panel
    const panel = getMenuBarPanel();
    if (panel) {
      panel.updateModuleStatus('tray', status === 'error' ? 'error' : 'active', config?.currentTask);
      panel.setObserving(status === 'observing');
      panel.setCurrentTask(config?.currentTask || null);
    }
  }

  /**
   * Get current status
   */
  getStatus(): TrayStatus {
    return this.currentStatus;
  }

  /**
   * Update tray icon and tooltip
   */
  private updateTray(): void {
    if (!this.tray) return;

    // Update icon
    const icon = this.icons.get(this.currentStatus);
    if (icon) {
      this.tray.setImage(icon);
    }

    // Update tooltip
    const tooltip = this.getTooltip();
    this.tray.setToolTip(tooltip);

    // Update context menu based on status
    this.updateContextMenu();
  }

  /**
   * Get tooltip text based on current status
   */
  private getTooltip(): string {
    const baseText = 'Hawkeye';
    const statusText: Record<TrayStatus, string> = {
      idle: 'Ready',
      observing: 'Observing screen...',
      analyzing: 'Analyzing...',
      executing: 'Executing action...',
      error: 'Error occurred',
      updating: 'Update available',
    };

    let tooltip = `${baseText} - ${statusText[this.currentStatus]}`;

    if (this.statusConfig.currentTask) {
      tooltip += `\n${this.statusConfig.currentTask}`;
    }

    if (this.currentStatus === 'error' && this.statusConfig.errorMessage) {
      tooltip += `\n${this.statusConfig.errorMessage}`;
    }

    if (this.currentStatus === 'updating' && this.statusConfig.updateVersion) {
      tooltip += `\nv${this.statusConfig.updateVersion} ready`;
    }

    return tooltip;
  }

  /**
   * Update context menu based on status
   */
  private updateContextMenu(): void {
    if (!this.tray) return;

    const mainWindow = this.mainWindowGetter();
    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    // Status indicator (disabled, just for display)
    const statusLabels: Record<TrayStatus, string> = {
      idle: '● Ready',
      observing: '◉ Observing...',
      analyzing: '◎ Analyzing...',
      executing: '◐ Executing...',
      error: '✗ Error',
      updating: '↓ Update Ready',
    };

    menuItems.push({
      label: statusLabels[this.currentStatus],
      enabled: false,
    });

    // Current task if any
    if (this.statusConfig.currentTask) {
      menuItems.push({
        label: `  ${this.statusConfig.currentTask.substring(0, 30)}...`,
        enabled: false,
      });
    }

    menuItems.push({ type: 'separator' });

    // Actions based on status
    if (this.currentStatus === 'analyzing' || this.currentStatus === 'executing') {
      menuItems.push({
        label: 'Cancel',
        click: () => this.emit('cancelRequested'),
      });
      menuItems.push({ type: 'separator' });
    }

    // Quick Panel toggle
    menuItems.push({
      label: 'Quick Panel',
      accelerator: 'CmdOrCtrl+Shift+P',
      click: () => {
        const panel = getMenuBarPanel();
        if (panel) {
          panel.toggle();
        }
      },
    });

    menuItems.push({ type: 'separator' });

    // Standard menu items
    menuItems.push({
      label: 'Observe Screen',
      accelerator: 'CmdOrCtrl+Shift+H',
      enabled: this.currentStatus === 'idle' || this.currentStatus === 'error',
      click: () => this.emit('observeRequested'),
    });

    menuItems.push({
      label: 'Show Window',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    });

    menuItems.push({ type: 'separator' });

    menuItems.push({
      label: 'Settings',
      click: () => {
        mainWindow?.webContents.send('show-settings');
        mainWindow?.show();
      },
    });

    menuItems.push({ type: 'separator' });

    if (this.currentStatus === 'updating') {
      menuItems.push({
        label: `Install Update (v${this.statusConfig.updateVersion})`,
        click: () => this.emit('installUpdateRequested'),
      });
      menuItems.push({ type: 'separator' });
    }

    menuItems.push({
      label: 'Quit Hawkeye',
      click: () => app.quit(),
    });

    const contextMenu = Menu.buildFromTemplate(menuItems);
    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Start pulsing animation for active states
   */
  private startAnimation(): void {
    this.stopAnimation();

    const baseColor = this.currentStatus === 'analyzing' ? '#2196F3' : '#FF9800';
    const frames = 4;

    this.animationInterval = setInterval(() => {
      this.animationFrame = (this.animationFrame + 1) % frames;
      const opacity = 0.5 + (Math.sin(this.animationFrame * Math.PI / 2) * 0.5);

      // Create animated icon
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="7" fill="${baseColor}" opacity="${opacity}" stroke="#333" stroke-width="1"/>
          <circle cx="9" cy="9" r="4" fill="white" opacity="0.3"/>
        </svg>
      `;
      const base64 = Buffer.from(svg).toString('base64');
      const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${base64}`);

      this.tray?.setImage(icon);
    }, 250);
  }

  /**
   * Stop animation
   */
  private stopAnimation(): void {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
    this.animationFrame = 0;
  }

  /**
   * Show a brief notification icon flash
   */
  flashStatus(status: TrayStatus, durationMs: number = 1000): void {
    const originalStatus = this.currentStatus;
    const originalConfig = { ...this.statusConfig };

    const icon = this.icons.get(status);
    if (icon && this.tray) {
      this.tray.setImage(icon);

      setTimeout(() => {
        if (this.currentStatus === originalStatus) {
          this.updateTray();
        }
      }, durationMs);
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopAnimation();
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
    this.removeAllListeners();
  }
}

export default TrayStatusService;
