/**
 * SuggestionCard - A2UI 建议卡片组件
 * 展示可执行的建议，支持一键执行
 */

import React from 'react';
import type { A2UISuggestionCard, A2UIAction } from '@hawkeye/core';
import { CardIcon } from './CardIcon';
import { ActionButton } from './ActionButton';

interface SuggestionCardProps {
  card: A2UISuggestionCard;
  onAction: (actionId: string) => void;
  onDismiss?: () => void;
  showConfidence?: boolean;
}

export const SuggestionCard: React.FC<SuggestionCardProps> = ({
  card,
  onAction,
  showConfidence = true,
}) => {
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low':
        return 'var(--color-success)';
      case 'medium':
        return 'var(--color-warning)';
      case 'high':
        return 'var(--color-danger)';
      default:
        return 'var(--color-text-secondary)';
    }
  };

  return (
    <div className="a2ui-card a2ui-suggestion-card">
      <div className="a2ui-card-header">
        <div className="a2ui-card-icon">
          <CardIcon icon={card.icon || 'magic'} />
        </div>
        <div className="a2ui-card-title-area">
          <h3 className="a2ui-card-title">{card.title}</h3>
          {showConfidence && card.confidence !== undefined && (
            <span className="a2ui-card-confidence">
              {Math.round(card.confidence * 100)}%
            </span>
          )}
        </div>
      </div>

      {card.description && (
        <p className="a2ui-card-description">{card.description}</p>
      )}

      {card.impact && (
        <div className="a2ui-card-impact">
          {card.impact.filesAffected !== undefined && (
            <span className="impact-item">
              <CardIcon icon="file" size={14} />
              {card.impact.filesAffected} files
            </span>
          )}
          <span
            className="impact-item"
            style={{ color: getRiskColor(card.impact.riskLevel) }}
          >
            {card.impact.riskLevel} risk
          </span>
          {card.impact.reversible && (
            <span className="impact-item reversible">
              <CardIcon icon="refresh" size={14} />
              Reversible
            </span>
          )}
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
