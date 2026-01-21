/**
 * ConfirmationCard - A2UI 确认卡片组件
 * 用于危险操作确认
 */

import React from 'react';
import type { A2UIConfirmationCard } from '@hawkeye/core';
import { CardIcon } from './CardIcon';
import { ActionButton } from './ActionButton';

interface ConfirmationCardProps {
  card: A2UIConfirmationCard;
  onAction: (actionId: string, data?: Record<string, unknown>) => void;
}

export const ConfirmationCard: React.FC<ConfirmationCardProps> = ({
  card,
  onAction,
}) => {
  const [inputValue, setInputValue] = React.useState('');
  const [isChecked, setIsChecked] = React.useState(false);

  const getWarningClass = () => {
    switch (card.warningLevel) {
      case 'info':
        return 'warning-info';
      case 'warning':
        return 'warning-warning';
      case 'danger':
        return 'warning-danger';
    }
  };

  const isConfirmEnabled = () => {
    if (!card.requiresInput) return true;

    if (card.requiresInput.type === 'checkbox') {
      return isChecked;
    }

    if (card.requiresInput.expectedValue) {
      return inputValue === card.requiresInput.expectedValue;
    }

    return inputValue.length > 0;
  };

  const handleConfirm = () => {
    if (card.requiresInput) {
      onAction('confirm', {
        inputValue: card.requiresInput.type === 'checkbox' ? isChecked : inputValue,
      });
    } else {
      onAction('confirm');
    }
  };

  return (
    <div className={`a2ui-card a2ui-confirmation-card ${getWarningClass()}`}>
      <div className="a2ui-card-header">
        <div className="a2ui-card-icon">
          <CardIcon icon={card.icon || 'warning'} />
        </div>
        <div className="a2ui-card-title-area">
          <h3 className="a2ui-card-title">{card.title}</h3>
        </div>
      </div>

      {card.description && (
        <p className="a2ui-card-description">{card.description}</p>
      )}

      {card.details.length > 0 && (
        <ul className="a2ui-confirmation-details">
          {card.details.map((detail, i) => (
            <li key={i}>{detail}</li>
          ))}
        </ul>
      )}

      {card.requiresInput && (
        <div className="a2ui-confirmation-input">
          {card.requiresInput.type === 'checkbox' ? (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => setIsChecked(e.target.checked)}
              />
              <span>{card.requiresInput.label}</span>
            </label>
          ) : (
            <div className="text-input-container">
              <label>{card.requiresInput.label}</label>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={card.requiresInput.placeholder}
              />
              {card.requiresInput.expectedValue && (
                <p className="input-hint">
                  Type "{card.requiresInput.expectedValue}" to confirm
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="a2ui-card-actions">
        {card.actions.map((action) => {
          const isConfirmAction = action.id === 'confirm';
          return (
            <ActionButton
              key={action.id}
              action={{
                ...action,
                disabled: isConfirmAction ? !isConfirmEnabled() : action.disabled,
              }}
              onClick={() => {
                if (isConfirmAction) {
                  handleConfirm();
                } else {
                  onAction(action.id);
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
