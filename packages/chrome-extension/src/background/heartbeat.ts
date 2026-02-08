/**
 * Heartbeat Manager — Port-based connection keep-alive
 *
 * Maintains a persistent connection between background service worker
 * and side panel using chrome.runtime.Port. Sends heartbeat pings at
 * regular intervals and detects disconnections for auto-reconnect.
 */

export interface HeartbeatConfig {
  /** Heartbeat interval in ms (default 25000 — under Chrome's 30s limit) */
  intervalMs: number;
  /** Timeout before considering connection dead (default 35000) */
  timeoutMs: number;
  /** Port name for connection */
  portName: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

type HeartbeatCallback = (status: ConnectionStatus) => void;
type MessageCallback = (message: unknown) => void;

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  intervalMs: 25_000,
  timeoutMs: 35_000,
  portName: 'hawkeye-sidepanel',
};

/**
 * Background-side heartbeat manager.
 * Listens for incoming port connections from the side panel.
 */
export class BackgroundHeartbeat {
  private config: HeartbeatConfig;
  private port: chrome.runtime.Port | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPongTime = 0;
  private status: ConnectionStatus = 'disconnected';
  private onStatusChange: HeartbeatCallback | null = null;
  private onMessage: MessageCallback | null = null;

  constructor(config?: Partial<HeartbeatConfig>) {
    this.config = { ...DEFAULT_HEARTBEAT_CONFIG, ...config };
  }

  /** Start listening for side panel connections */
  listen(): void {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== this.config.portName) return;

      this.handleConnect(port);
    });
  }

  /** Set callback for status changes */
  onStatus(callback: HeartbeatCallback): void {
    this.onStatusChange = callback;
  }

  /** Set callback for messages from side panel */
  onMessageReceived(callback: MessageCallback): void {
    this.onMessage = callback;
  }

  /** Send a message to the side panel */
  send(message: unknown): boolean {
    if (!this.port || this.status !== 'connected') return false;

    try {
      this.port.postMessage(message);
      return true;
    } catch {
      this.handleDisconnect();
      return false;
    }
  }

  /** Get current connection status */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** Check if connected */
  get isConnected(): boolean {
    return this.status === 'connected';
  }

  /** Destroy the heartbeat manager */
  destroy(): void {
    this.stopHeartbeat();
    if (this.port) {
      try { this.port.disconnect(); } catch { /* ignore */ }
      this.port = null;
    }
    this.setStatus('disconnected');
  }

  // === Internal ===

  private handleConnect(port: chrome.runtime.Port): void {
    // Disconnect existing port if any
    if (this.port) {
      try { this.port.disconnect(); } catch { /* ignore */ }
    }

    this.port = port;
    this.lastPongTime = Date.now();
    this.setStatus('connected');

    // Listen for messages
    port.onMessage.addListener((message) => {
      if (message && typeof message === 'object' && (message as Record<string, unknown>).type === 'heartbeat-pong') {
        this.lastPongTime = Date.now();
        return;
      }
      this.onMessage?.(message);
    });

    // Handle disconnect
    port.onDisconnect.addListener(() => {
      this.handleDisconnect();
    });

    // Start heartbeat
    this.startHeartbeat();
  }

  private handleDisconnect(): void {
    this.stopHeartbeat();
    this.port = null;
    this.setStatus('disconnected');
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      // Check if last pong is within timeout
      if (Date.now() - this.lastPongTime > this.config.timeoutMs) {
        this.handleDisconnect();
        return;
      }

      // Send ping
      try {
        this.port?.postMessage({ type: 'heartbeat-ping' });
      } catch {
        this.handleDisconnect();
      }
    }, this.config.intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.onStatusChange?.(status);
    }
  }
}

/**
 * Side panel-side heartbeat client.
 * Connects to the background service worker and responds to pings.
 */
export class SidePanelHeartbeat {
  private config: HeartbeatConfig;
  private port: chrome.runtime.Port | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onStatusChange: HeartbeatCallback | null = null;
  private onMessage: MessageCallback | null = null;

  constructor(config?: Partial<HeartbeatConfig>) {
    this.config = { ...DEFAULT_HEARTBEAT_CONFIG, ...config };
  }

  /** Connect to background service worker */
  connect(): void {
    if (this.status === 'connected' || this.status === 'connecting') return;

    this.setStatus('connecting');

    try {
      const port = chrome.runtime.connect({ name: this.config.portName });
      this.port = port;

      port.onMessage.addListener((message) => {
        if (message && typeof message === 'object' && (message as Record<string, unknown>).type === 'heartbeat-ping') {
          // Respond with pong
          try {
            port.postMessage({ type: 'heartbeat-pong' });
          } catch { /* ignore */ }
          return;
        }
        this.onMessage?.(message);
      });

      port.onDisconnect.addListener(() => {
        this.handleDisconnect();
      });

      // Only mark connected if port is still valid (onDisconnect may have fired synchronously)
      if (this.port === port) {
        this.setStatus('connected');
      }
    } catch {
      this.handleDisconnect();
    }
  }

  /** Disconnect from background */
  disconnect(): void {
    this.cancelReconnect();
    if (this.port) {
      try { this.port.disconnect(); } catch { /* ignore */ }
      this.port = null;
    }
    this.setStatus('disconnected');
  }

  /** Set callback for status changes */
  onStatus(callback: HeartbeatCallback): void {
    this.onStatusChange = callback;
  }

  /** Set callback for messages from background */
  onMessageReceived(callback: MessageCallback): void {
    this.onMessage = callback;
  }

  /** Send a message to background */
  send(message: unknown): boolean {
    if (!this.port || this.status !== 'connected') return false;

    try {
      this.port.postMessage(message);
      return true;
    } catch {
      this.handleDisconnect();
      return false;
    }
  }

  /** Get current status */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** Check if connected */
  get isConnected(): boolean {
    return this.status === 'connected';
  }

  /** Destroy and cleanup */
  destroy(): void {
    this.disconnect();
  }

  // === Internal ===

  private handleDisconnect(): void {
    this.port = null;
    this.setStatus('disconnected');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.cancelReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 3000); // Reconnect after 3 seconds
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.onStatusChange?.(status);
    }
  }
}
