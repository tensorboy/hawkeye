/**
 * ProgressCard - A2UI 进度卡片组件
 * 展示执行进度
 */

import React from 'react';
import type { A2UIProgressCard } from '@hawkeye/core';
import { CardIcon } from './CardIcon';
import { ActionButton } from './ActionButton';

interface ProgressCardProps {
  card: A2UIProgressCard;
  onAction: (actionId: string) => void;
}

export const ProgressCard: React.FC<ProgressCardProps> = ({ card, onAction }) => {
  const getStatusClass = () => {
    switch (card.status) {
      case 'running':
        return 'status-running';
      case 'paused':
        return 'status-paused';
      case 'completing':
        return 'status-completing';
    }
  };

  return (
    <div className={`a2ui-card a2ui-progress-card ${getStatusClass()}`}>
      <div className="a2ui-card-header">
        <div className="a2ui-card-icon">
          <CardIcon icon="lightning" />
        </div>
        <div className="a2ui-card-title-area">
          <h3 className="a2ui-card-title">{card.title}</h3>
          <span className="a2ui-progress-status">{card.status}</span>
        </div>
      </div>

      <div className="a2ui-progress-info">
        <p className="a2ui-progress-step">
          Step {card.currentStep}/{card.totalSteps}: {card.stepDescription}
        </p>
      </div>

      <div className="a2ui-progress-bar-container">
        <div
          className="a2ui-progress-bar-fill"
          style={{ width: `${card.progress}%` }}
        />
        <span className="a2ui-progress-text">{card.progress}%</span>
      </div>

      {card.actions.length > 0 && (
        <div className="a2ui-card-actions">
          {card.actions.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              onClick={() => onAction(action.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
