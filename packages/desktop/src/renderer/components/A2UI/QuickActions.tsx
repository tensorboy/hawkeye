/**
 * QuickActions - A2UI 快捷操作栏组件
 * 显示常用快捷操作按钮，提供一键触发功能
 */

import React from 'react';

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  tooltip?: string;
  disabled?: boolean;
}

interface QuickActionsProps {
  actions: QuickAction[];
  onAction: (actionId: string) => void;
  compact?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  actions,
  onAction,
  compact = false,
}) => {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className={`a2ui-quick-actions ${compact ? 'compact' : ''}`}>
      {actions.map((action) => (
        <button
          key={action.id}
          className="quick-action-btn"
          onClick={() => onAction(action.id)}
          disabled={action.disabled}
          title={action.tooltip || action.label}
        >
          <span className="quick-action-icon">{action.icon}</span>
          {!compact && <span className="quick-action-label">{action.label}</span>}
        </button>
      ))}
    </div>
  );
};

// 预定义的常用快捷操作（设置按钮已移至右上角）
export const defaultQuickActions: QuickAction[] = [
  {
    id: 'refresh',
    label: '刷新建议',
    icon: '🔄',
    tooltip: '重新分析当前环境',
  },
  {
    id: 'clipboard',
    label: '剪贴板',
    icon: '📋',
    tooltip: '分析剪贴板内容',
  },
  {
    id: 'history',
    label: '历史记录',
    icon: '📜',
    tooltip: '查看操作历史',
  },
];
