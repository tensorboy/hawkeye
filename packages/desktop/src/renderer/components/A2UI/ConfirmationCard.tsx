/**
 * ConfirmationCard - A2UI 确认卡片组件
 * 用于危险操作确认
 */

import React from 'react';
import type { A2UIConfirmationCard, A2UIAction } from '@hawkeye/core';

type A2UIInputConfig = NonNullable<A2UIConfirmationCard['requiresInput']>;
import { CardIcon } from './CardIcon';
import { ActionButton } from './ActionButton';

interface ConfirmationCardProps {
  card: A2UIConfirmationCard;
  onAction: (actionId: string, data?: Record<string, unknown>) => void;
  onDismiss?: () => void;
}

// Helper to check if requiresInput is an object config
const isInputConfig = (input: unknown): input is A2UIInputConfig => {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
};

export const ConfirmationCard: React.FC<ConfirmationCardProps> = ({
  card,
  onAction,
}) => {
  const [inputValue, setInputValue] = React.useState('');
  const [isChecked, setIsChecked] = React.useState(false);

  const inputConfig = isInputConfig(card.requiresInput) ? card.requiresInput : null;

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
    if (!card.requiresInput || !inputConfig) return true;

    if (inputConfig.type === 'checkbox') {
      return isChecked;
    }

    if (inputConfig.expectedValue) {
      return inputValue === inputConfig.expectedValue;
    }

    return inputValue.length > 0;
  };

  const handleConfirm = () => {
    if (card.requiresInput && inputConfig) {
      onAction('confirm', {
        inputValue: inputConfig.type === 'checkbox' ? isChecked : inputValue,
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

      {card.details && card.details.length > 0 && (
        <ul className="a2ui-confirmation-details">
          {card.details.map((detail: string, i: number) => (
            <li key={i}>{detail}</li>
          ))}
        </ul>
      )}

      {inputConfig && (
        <div className="a2ui-confirmation-input">
          {inputConfig.type === 'checkbox' ? (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => setIsChecked(e.target.checked)}
              />
              <span>{inputConfig.label}</span>
            </label>
          ) : (
            <div className="text-input-container">
              <label>{inputConfig.label}</label>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={inputConfig.placeholder}
              />
              {inputConfig.expectedValue && (
                <p className="input-hint">
                  Type "{inputConfig.expectedValue}" to confirm
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="a2ui-card-actions">
        {(card.actions || []).map((action: A2UIAction) => {
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
