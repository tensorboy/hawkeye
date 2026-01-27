/**
 * MenuBarPanel - macOS-style popover panel for quick actions and status
 * Rendered inside the menu bar panel BrowserWindow
 */

import React, { useState, useEffect, useCallback } from 'react';

// ============ Types (mirror menu-bar-panel-service.ts) ============

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  enabled: boolean;
  category: 'observe' | 'execute' | 'search' | 'settings' | 'ai';
}

interface RecentActivity {
  id: string;
  type: 'observation' | 'execution' | 'ai_response' | 'error' | 'suggestion';
  title: string;
  detail: string;
  timestamp: number;
  status: 'success' | 'failure' | 'pending';
}

interface ModuleStatus {
  name: string;
  status: 'active' | 'inactive' | 'error' | 'loading';
  detail?: string;
}

interface PanelState {
  quickActions: QuickAction[];
  recentActivities: RecentActivity[];
  moduleStatuses: ModuleStatus[];
  isObserving: boolean;
  currentTask: string | null;
}

// ============ Helpers ============

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const STATUS_DOT: Record<ModuleStatus['status'], string> = {
  active: '#34d399',
  inactive: '#6b7280',
  error: '#f87171',
  loading: '#fbbf24',
};

const ACTIVITY_ICON: Record<RecentActivity['type'], string> = {
  observation: '\u{1F441}',   // eye
  execution: '\u26A1',        // zap
  ai_response: '\u{1F4AC}',  // speech bubble
  error: '\u274C',            // cross
  suggestion: '\u{1F4A1}',   // bulb
};

// ============ Sub-components ============

const StatusBadge: React.FC<{ observing: boolean; task: string | null }> = ({ observing, task }) => (
  <div style={styles.statusBadge}>
    <span
      style={{
        ...styles.statusDot,
        backgroundColor: observing ? '#34d399' : '#6b7280',
        boxShadow: observing ? '0 0 6px #34d399' : 'none',
      }}
    />
    <span style={styles.statusText}>
      {task ? task : observing ? 'Observing' : 'Idle'}
    </span>
  </div>
);

const QuickActionButton: React.FC<{
  action: QuickAction;
  onClick: (id: string) => void;
}> = ({ action, onClick }) => (
  <button
    style={{
      ...styles.actionBtn,
      opacity: action.enabled ? 1 : 0.4,
      cursor: action.enabled ? 'pointer' : 'not-allowed',
    }}
    disabled={!action.enabled}
    onClick={() => onClick(action.id)}
    title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
  >
    <span style={styles.actionIcon}>{action.icon}</span>
    <span style={styles.actionLabel}>{action.label}</span>
    {action.shortcut && <span style={styles.actionShortcut}>{action.shortcut}</span>}
  </button>
);

const ActivityItem: React.FC<{ activity: RecentActivity }> = ({ activity }) => (
  <div style={styles.activityItem}>
    <span style={styles.activityIcon}>
      {ACTIVITY_ICON[activity.type] || '\u2022'}
    </span>
    <div style={styles.activityContent}>
      <div style={styles.activityTitle}>{activity.title}</div>
      <div style={styles.activityDetail}>{activity.detail}</div>
    </div>
    <div style={styles.activityMeta}>
      <span
        style={{
          ...styles.activityStatus,
          color:
            activity.status === 'success'
              ? '#34d399'
              : activity.status === 'failure'
                ? '#f87171'
                : '#fbbf24',
        }}
      >
        {activity.status === 'success' ? '\u2713' : activity.status === 'failure' ? '\u2717' : '\u2022\u2022\u2022'}
      </span>
      <span style={styles.activityTime}>{timeAgo(activity.timestamp)}</span>
    </div>
  </div>
);

const ModuleStatusRow: React.FC<{ module: ModuleStatus }> = ({ module }) => (
  <div style={styles.moduleRow}>
    <span
      style={{ ...styles.moduleDot, backgroundColor: STATUS_DOT[module.status] }}
    />
    <span style={styles.moduleName}>{module.name}</span>
    {module.detail && <span style={styles.moduleDetail}>{module.detail}</span>}
  </div>
);

// ============ Main Component ============

export const MenuBarPanel: React.FC = () => {
  const [state, setState] = useState<PanelState | null>(null);
  const [activeTab, setActiveTab] = useState<'actions' | 'activity' | 'status'>('actions');

  // Load initial state and listen for updates
  useEffect(() => {
    // Fetch initial state
    (window as any).hawkeye?.menuBarPanel?.getState().then((s: PanelState) => {
      if (s) setState(s);
    });

    // Listen for state pushes from main process
    const cleanup = (window as any).hawkeye?.menuBarPanel?.onStateUpdate((s: PanelState) => {
      setState(s);
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  const handleAction = useCallback((actionId: string) => {
    (window as any).hawkeye?.menuBarPanel?.executeAction(actionId);
  }, []);

  const handleClearActivities = useCallback(() => {
    (window as any).hawkeye?.menuBarPanel?.clearActivities();
  }, []);

  if (!state) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Hawkeye</span>
        <StatusBadge observing={state.isObserving} task={state.currentTask} />
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['actions', 'activity', 'status'] as const).map((tab) => (
          <button
            key={tab}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'actions' ? 'Actions' : tab === 'activity' ? 'Activity' : 'Status'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {activeTab === 'actions' && (
          <div style={styles.actionsList}>
            {state.quickActions.map((action) => (
              <QuickActionButton
                key={action.id}
                action={action}
                onClick={handleAction}
              />
            ))}
          </div>
        )}

        {activeTab === 'activity' && (
          <div style={styles.activityList}>
            {state.recentActivities.length === 0 ? (
              <div style={styles.emptyState}>No recent activity</div>
            ) : (
              <>
                {state.recentActivities.map((a) => (
                  <ActivityItem key={a.id} activity={a} />
                ))}
                <button style={styles.clearBtn} onClick={handleClearActivities}>
                  Clear All
                </button>
              </>
            )}
          </div>
        )}

        {activeTab === 'status' && (
          <div style={styles.statusList}>
            {state.moduleStatuses.length === 0 ? (
              <div style={styles.emptyState}>No modules loaded</div>
            ) : (
              state.moduleStatuses.map((m) => (
                <ModuleStatusRow key={m.name} module={m} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span style={styles.footerText}>Hawkeye AI Agent</span>
      </div>
    </div>
  );
};

// ============ Styles (inline for frameless panel) ============

const styles: Record<string, React.CSSProperties & Record<string, unknown>> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 13,
    color: '#e5e7eb',
    backgroundColor: 'rgba(24, 24, 27, 0.95)',
    borderRadius: 12,
    overflow: 'hidden',
    userSelect: 'none',
    WebkitAppRegion: 'no-drag',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#9ca3af',
  },
  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: '-0.01em',
  },
  // Status badge
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 10px',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    fontSize: 11,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusText: {
    color: '#9ca3af',
  },
  // Tabs
  tabs: {
    display: 'flex',
    gap: 2,
    padding: '6px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  tab: {
    flex: 1,
    padding: '5px 0',
    border: 'none',
    background: 'none',
    color: '#6b7280',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'all 0.15s',
  },
  tabActive: {
    color: '#e5e7eb',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  // Content
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  // Actions
  actionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '0 8px',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    border: 'none',
    background: 'none',
    color: '#e5e7eb',
    fontSize: 13,
    borderRadius: 8,
    transition: 'background 0.15s',
    textAlign: 'left' as const,
    width: '100%',
  },
  actionIcon: {
    fontSize: 16,
    width: 22,
    textAlign: 'center' as const,
  },
  actionLabel: {
    flex: 1,
  },
  actionShortcut: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: 'SF Mono, Menlo, monospace',
  },
  // Activity
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    padding: '0 8px',
  },
  activityItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 6,
  },
  activityIcon: {
    fontSize: 14,
    width: 20,
    textAlign: 'center' as const,
    paddingTop: 1,
    flexShrink: 0,
  },
  activityContent: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  activityDetail: {
    fontSize: 11,
    color: '#6b7280',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  activityMeta: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  activityStatus: {
    fontSize: 12,
    fontWeight: 600,
  },
  activityTime: {
    fontSize: 10,
    color: '#4b5563',
  },
  clearBtn: {
    display: 'block',
    margin: '8px auto 0',
    padding: '4px 14px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    background: 'none',
    color: '#6b7280',
    fontSize: 11,
    cursor: 'pointer',
  },
  // Status
  statusList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '0 12px',
  },
  moduleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 4px',
  },
  moduleDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  moduleName: {
    fontSize: 12,
    fontWeight: 500,
    flex: 1,
  },
  moduleDetail: {
    fontSize: 11,
    color: '#6b7280',
  },
  // Empty
  emptyState: {
    textAlign: 'center' as const,
    color: '#4b5563',
    padding: '24px 0',
    fontSize: 12,
  },
  // Footer
  footer: {
    padding: '8px 16px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    textAlign: 'center' as const,
  },
  footerText: {
    fontSize: 10,
    color: '#4b5563',
  },
};

export default MenuBarPanel;
