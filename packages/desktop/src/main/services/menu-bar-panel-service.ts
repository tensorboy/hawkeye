/**
 * Menu Bar Panel Service
 * macOS-style popover panel for quick actions and status overview
 * Inspired by CodexBar, RepoBar, Trimmy patterns
 *
 * Features:
 * - Quick action menu (observe, execute, search)
 * - Recent activity list
 * - Module status indicators
 * - Keyboard shortcuts
 */

import { BrowserWindow, screen, Tray, ipcMain } from 'electron';
import { EventEmitter } from 'events';
import * as path from 'path';

// ============ Types ============

export interface MenuBarPanelConfig {
  /** Panel width */
  width: number;
  /** Panel height */
  height: number;
  /** Auto-hide when clicking outside */
  autoHide: boolean;
  /** Show keyboard shortcuts in UI */
  showShortcuts: boolean;
  /** Maximum recent activities to show */
  maxRecentActivities: number;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;       // emoji or icon name
  shortcut?: string;  // e.g. "⌘⇧H"
  enabled: boolean;
  category: 'observe' | 'execute' | 'search' | 'settings' | 'ai';
}

export interface RecentActivity {
  id: string;
  type: 'observation' | 'execution' | 'ai_response' | 'error' | 'suggestion';
  title: string;
  detail: string;
  timestamp: number;
  status: 'success' | 'failure' | 'pending';
}

export interface ModuleStatus {
  name: string;
  status: 'active' | 'inactive' | 'error' | 'loading';
  detail?: string;
}

export interface PanelState {
  quickActions: QuickAction[];
  recentActivities: RecentActivity[];
  moduleStatuses: ModuleStatus[];
  isObserving: boolean;
  currentTask: string | null;
}

// ============ Defaults ============

const DEFAULT_CONFIG: MenuBarPanelConfig = {
  width: 320,
  height: 480,
  autoHide: true,
  showShortcuts: true,
  maxRecentActivities: 20,
};

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { id: 'observe', label: 'Observe Screen', icon: '👁', shortcut: '⌘⇧H', enabled: true, category: 'observe' },
  { id: 'smart-observe', label: 'Smart Observe', icon: '🧠', shortcut: '⌘⇧S', enabled: true, category: 'observe' },
  { id: 'ai-chat', label: 'Ask AI', icon: '💬', shortcut: '⌘⇧A', enabled: true, category: 'ai' },
  { id: 'search', label: 'Search History', icon: '🔍', shortcut: '⌘⇧F', enabled: true, category: 'search' },
  { id: 'settings', label: 'Settings', icon: '⚙️', enabled: true, category: 'settings' },
];

// ============ Service ============

export class MenuBarPanelService extends EventEmitter {
  private config: MenuBarPanelConfig;
  private panelWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private recentActivities: RecentActivity[] = [];
  private moduleStatuses: ModuleStatus[] = [];
  private quickActions: QuickAction[] = [...DEFAULT_QUICK_ACTIONS];
  private isObserving = false;
  private currentTask: string | null = null;
  private activityIdCounter = 0;

  constructor(config: Partial<MenuBarPanelConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize panel with tray reference
   */
  initialize(tray: Tray): void {
    this.tray = tray;
    this.setupIPCHandlers();
  }

  /**
   * Toggle panel visibility
   */
  toggle(): void {
    if (this.panelWindow && this.panelWindow.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show the panel
   */
  show(): void {
    if (!this.tray) return;

    if (!this.panelWindow) {
      this.createPanel();
    }

    if (!this.panelWindow) return;

    // Position panel below tray icon
    const trayBounds = this.tray.getBounds();
    const panelBounds = this.panelWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });

    let x = Math.round(trayBounds.x + trayBounds.width / 2 - panelBounds.width / 2);
    let y: number;

    if (process.platform === 'darwin') {
      // macOS: below menu bar
      y = trayBounds.y + trayBounds.height + 4;
    } else {
      // Windows/Linux: above taskbar
      y = trayBounds.y - panelBounds.height - 4;
    }

    // Keep within screen bounds
    x = Math.max(display.workArea.x, Math.min(x, display.workArea.x + display.workArea.width - panelBounds.width));

    this.panelWindow.setPosition(x, y, false);
    this.panelWindow.show();
    this.panelWindow.focus();

    // Send current state
    this.sendPanelState();

    this.emit('panelShown');
  }

  /**
   * Hide the panel
   */
  hide(): void {
    if (this.panelWindow) {
      this.panelWindow.hide();
      this.emit('panelHidden');
    }
  }

  /**
   * Add a recent activity entry
   */
  addActivity(activity: Omit<RecentActivity, 'id' | 'timestamp'>): void {
    const entry: RecentActivity = {
      ...activity,
      id: `activity_${++this.activityIdCounter}`,
      timestamp: Date.now(),
    };

    this.recentActivities.unshift(entry);
    if (this.recentActivities.length > this.config.maxRecentActivities) {
      this.recentActivities = this.recentActivities.slice(0, this.config.maxRecentActivities);
    }

    this.sendPanelState();
  }

  /**
   * Update module status
   */
  updateModuleStatus(name: string, status: ModuleStatus['status'], detail?: string): void {
    const existing = this.moduleStatuses.find(m => m.name === name);
    if (existing) {
      existing.status = status;
      existing.detail = detail;
    } else {
      this.moduleStatuses.push({ name, status, detail });
    }
    this.sendPanelState();
  }

  /**
   * Set observing state
   */
  setObserving(observing: boolean): void {
    this.isObserving = observing;
    this.sendPanelState();
  }

  /**
   * Set current task name
   */
  setCurrentTask(task: string | null): void {
    this.currentTask = task;
    this.sendPanelState();
  }

  /**
   * Update a quick action's enabled state
   */
  setActionEnabled(actionId: string, enabled: boolean): void {
    const action = this.quickActions.find(a => a.id === actionId);
    if (action) {
      action.enabled = enabled;
      this.sendPanelState();
    }
  }

  /**
   * Get current panel state
   */
  getPanelState(): PanelState {
    return {
      quickActions: [...this.quickActions],
      recentActivities: [...this.recentActivities],
      moduleStatuses: [...this.moduleStatuses],
      isObserving: this.isObserving,
      currentTask: this.currentTask,
    };
  }

  /**
   * Destroy the panel
   */
  destroy(): void {
    this.removeIPCHandlers();
    if (this.panelWindow) {
      this.panelWindow.destroy();
      this.panelWindow = null;
    }
    this.removeAllListeners();
  }

  // ============ Private Methods ============

  private createPanel(): void {
    this.panelWindow = new BrowserWindow({
      width: this.config.width,
      height: this.config.height,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      transparent: process.platform === 'darwin',
      vibrancy: process.platform === 'darwin' ? 'popover' : undefined,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../preload/index.js'),
      },
    });

    // Load the renderer content
    if (process.env.NODE_ENV === 'development') {
      this.panelWindow.loadURL('http://localhost:5173/#/menu-bar-panel');
    } else {
      this.panelWindow.loadFile(path.join(__dirname, '../../renderer/index.html'), {
        hash: '/menu-bar-panel',
      });
    }

    // Auto-hide when focus is lost
    if (this.config.autoHide) {
      this.panelWindow.on('blur', () => {
        this.hide();
      });
    }

    this.panelWindow.on('closed', () => {
      this.panelWindow = null;
    });
  }

  private sendPanelState(): void {
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      this.panelWindow.webContents.send('menu-bar-panel:state', this.getPanelState());
    }
  }

  private setupIPCHandlers(): void {
    ipcMain.handle('menu-bar-panel:get-state', () => this.getPanelState());
    ipcMain.handle('menu-bar-panel:execute-action', (_event, actionId: string) => {
      this.emit('actionExecuted', actionId);
      return { success: true };
    });
    ipcMain.handle('menu-bar-panel:clear-activities', () => {
      this.recentActivities = [];
      this.sendPanelState();
      return { success: true };
    });
  }

  private removeIPCHandlers(): void {
    ipcMain.removeHandler('menu-bar-panel:get-state');
    ipcMain.removeHandler('menu-bar-panel:execute-action');
    ipcMain.removeHandler('menu-bar-panel:clear-activities');
  }
}

// ============ Singleton ============

let panelInstance: MenuBarPanelService | null = null;

export function createMenuBarPanel(config?: Partial<MenuBarPanelConfig>): MenuBarPanelService {
  panelInstance = new MenuBarPanelService(config);
  return panelInstance;
}

export function getMenuBarPanel(): MenuBarPanelService | null {
  return panelInstance;
}

export default MenuBarPanelService;
