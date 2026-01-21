/**
 * ActionButton - A2UI 操作按钮组件
 */

import React from 'react';
import type { A2UIAction } from '@hawkeye/core';
import { CardIcon } from './CardIcon';

interface ActionButtonProps {
  action: A2UIAction;
  onClick: () => void;
}

export const ActionButton: React.FC<ActionButtonProps> = ({ action, onClick }) => {
  const getButtonClass = () => {
    const classes = ['a2ui-action-btn'];
    classes.push(`btn-${action.type}`);
    if (action.disabled) classes.push('disabled');
    if (action.loading) classes.push('loading');
    return classes.join(' ');
  };

  return (
    <button
      className={getButtonClass()}
      onClick={onClick}
      disabled={action.disabled || action.loading}
      title={action.tooltip}
    >
      {action.loading ? (
        <span className="btn-spinner" />
      ) : action.icon ? (
        <CardIcon icon={action.icon} size={14} />
      ) : null}
      <span className="btn-label">{action.label}</span>
      {action.shortcut && <span className="btn-shortcut">{action.shortcut}</span>}
    </button>
  );
};
