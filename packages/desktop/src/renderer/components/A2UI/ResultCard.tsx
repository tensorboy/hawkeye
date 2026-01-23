/**
 * ResultCard - A2UI 结果卡片组件
 * 展示执行结果
 */

import React from 'react';
import type { A2UIResultCard } from '@hawkeye/core';
import { CardIcon } from './CardIcon';
import { ActionButton } from './ActionButton';

interface ResultCardProps {
  card: A2UIResultCard;
  onAction: (actionId: string) => void;
  onDismiss?: () => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ card, onAction }) => {
  const getStatusClass = () => {
    switch (card.status) {
      case 'success':
        return 'status-success';
      case 'partial':
        return 'status-warning';
      case 'failed':
        return 'status-error';
      case 'cancelled':
        return 'status-cancelled';
    }
  };

  const getStatusIcon = () => {
    switch (card.status) {
      case 'success':
        return 'success';
      case 'partial':
        return 'warning';
      case 'failed':
        return 'error';
      case 'cancelled':
        return 'info';
    }
  };

  return (
    <div className={`a2ui-card a2ui-result-card ${getStatusClass()}`}>
      <div className="a2ui-card-header">
        <div className="a2ui-card-icon">
          <CardIcon icon={getStatusIcon()} />
        </div>
        <div className="a2ui-card-title-area">
          <h3 className="a2ui-card-title">{card.title}</h3>
        </div>
      </div>

      {card.description && (
        <p className="a2ui-card-description">{card.description}</p>
      )}

      <div className="a2ui-result-summary">
        <div className="summary-item">
          <span className="summary-value">{card.summary.completedSteps}</span>
          <span className="summary-label">/ {card.summary.totalSteps} steps</span>
        </div>
        <div className="summary-item">
          <span className="summary-value">{card.summary.duration}s</span>
          <span className="summary-label">duration</span>
        </div>
        {card.summary.failedSteps > 0 && (
          <div className="summary-item error">
            <span className="summary-value">{card.summary.failedSteps}</span>
            <span className="summary-label">failed</span>
          </div>
        )}
      </div>

      {card.error && (
        <div className="a2ui-result-error">
          <CardIcon icon="error" size={16} />
          <span>{card.error.message}</span>
        </div>
      )}

      {card.impact && (
        <div className="a2ui-result-impact">
          {card.impact.filesCreated.length > 0 && (
            <div className="impact-group">
              <span className="impact-label">Created:</span>
              <span className="impact-count">{card.impact.filesCreated.length} files</span>
            </div>
          )}
          {card.impact.filesModified.length > 0 && (
            <div className="impact-group">
              <span className="impact-label">Modified:</span>
              <span className="impact-count">{card.impact.filesModified.length} files</span>
            </div>
          )}
          {card.impact.filesDeleted.length > 0 && (
            <div className="impact-group">
              <span className="impact-label">Deleted:</span>
              <span className="impact-count">{card.impact.filesDeleted.length} files</span>
            </div>
          )}
        </div>
      )}

      {card.rollback?.available && (
        <div className="a2ui-result-rollback">
          <CardIcon icon="refresh" size={14} />
          <span>This action can be undone</span>
        </div>
      )}

      <div className="a2ui-card-actions">
        {card.actions.map((action) => (
          <ActionButton
            key={action.id}
            action={action}
            onClick={() => onAction(action.id)}
          />
        ))}
      </div>
    </div>
  );
};
