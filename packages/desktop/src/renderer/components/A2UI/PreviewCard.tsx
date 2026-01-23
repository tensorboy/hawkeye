/**
 * PreviewCard - A2UI 预览卡片组件
 * 展示计划详情、文件预览、优缺点分析
 */

import React from 'react';
import type { A2UIPreviewCard } from '@hawkeye/core';
import { CardIcon } from './CardIcon';
import { ActionButton } from './ActionButton';

interface PreviewCardProps {
  card: A2UIPreviewCard;
  onAction: (actionId: string) => void;
  onDismiss?: () => void;
}

export const PreviewCard: React.FC<PreviewCardProps> = ({ card, onAction }) => {
  const renderSteps = () => {
    if (!card.content.steps) return null;

    return (
      <div className="a2ui-preview-steps">
        <h4 className="a2ui-preview-section-title">Steps</h4>
        <ol className="a2ui-steps-list">
          {card.content.steps.map((step) => (
            <li key={step.order} className="a2ui-step-item">
              <span className="step-number">{step.order}</span>
              <div className="step-content">
                <span className="step-desc">{step.description}</span>
                <div className="step-meta">
                  <span className="step-action">{step.actionType}</span>
                  <span className={`step-risk risk-${step.riskLevel}`}>
                    {step.riskLevel}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  };

  const renderAnalysis = () => {
    if (!card.analysis) return null;

    return (
      <div className="a2ui-preview-analysis">
        <div className="analysis-column pros">
          <h4 className="analysis-title">
            <CardIcon icon="success" size={16} />
            Pros
          </h4>
          <ul className="analysis-list">
            {card.analysis.pros.map((pro, i) => (
              <li key={i}>{pro}</li>
            ))}
          </ul>
        </div>
        <div className="analysis-column cons">
          <h4 className="analysis-title">
            <CardIcon icon="warning" size={16} />
            Cons
          </h4>
          <ul className="analysis-list">
            {card.analysis.cons.map((con, i) => (
              <li key={i}>{con}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  const renderFileContent = () => {
    if (!card.content.fileContent) return null;

    return (
      <div className="a2ui-preview-file">
        <pre className="file-content">{card.content.fileContent}</pre>
      </div>
    );
  };

  const renderListItems = () => {
    if (!card.content.items) return null;

    return (
      <div className="a2ui-preview-list">
        {card.content.items.map((item, i) => (
          <div key={i} className="list-item">
            {item.icon && <CardIcon icon={item.icon} size={16} />}
            <div className="list-item-text">
              <span className="list-item-main">{item.text}</span>
              {item.subtext && (
                <span className="list-item-sub">{item.subtext}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="a2ui-card a2ui-preview-card">
      <div className="a2ui-card-header">
        <div className="a2ui-card-icon">
          <CardIcon icon={card.icon || 'eye'} />
        </div>
        <div className="a2ui-card-title-area">
          <h3 className="a2ui-card-title">{card.title}</h3>
          <span className="a2ui-preview-type">{card.previewType}</span>
        </div>
      </div>

      {card.description && (
        <p className="a2ui-card-description">{card.description}</p>
      )}

      <div className="a2ui-preview-content">
        {card.previewType === 'plan' && renderSteps()}
        {card.previewType === 'file' && renderFileContent()}
        {card.previewType === 'list' && renderListItems()}
      </div>

      {renderAnalysis()}

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
