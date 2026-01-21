/**
 * CardList - A2UI 卡片列表容器组件
 * 负责渲染和管理多个卡片，支持动画和滚动
 */

import React, { useRef, useEffect } from 'react';
import type { A2UICard } from '@hawkeye/core';
import { SuggestionCard } from './SuggestionCard';
import { PreviewCard } from './PreviewCard';
import { ResultCard } from './ResultCard';
import { ProgressCard } from './ProgressCard';
import { ConfirmationCard } from './ConfirmationCard';

interface CardListProps {
  cards: A2UICard[];
  onAction: (cardId: string, actionId: string, data?: unknown) => void;
  onDismiss: (cardId: string) => void;
  autoScroll?: boolean;
  maxVisible?: number;
  emptyMessage?: string;
}

export const CardList: React.FC<CardListProps> = ({
  cards,
  onAction,
  onDismiss,
  autoScroll = true,
  maxVisible,
  emptyMessage = '暂无建议，Hawkeye 正在观察您的工作环境...',
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const prevCardsLengthRef = useRef(cards.length);

  // 自动滚动到最新卡片
  useEffect(() => {
    if (autoScroll && listRef.current && cards.length > prevCardsLengthRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
    prevCardsLengthRef.current = cards.length;
  }, [cards.length, autoScroll]);

  // 过滤和限制显示的卡片
  const visibleCards = maxVisible ? cards.slice(-maxVisible) : cards;

  // 渲染单个卡片
  const renderCard = (card: A2UICard) => {
    const handleAction = (actionId: string, data?: unknown) => {
      onAction(card.id, actionId, data);
    };

    const handleDismiss = () => {
      onDismiss(card.id);
    };

    switch (card.type) {
      case 'suggestion':
        return (
          <SuggestionCard
            key={card.id}
            card={card}
            onAction={handleAction}
            onDismiss={handleDismiss}
          />
        );

      case 'preview':
        return (
          <PreviewCard
            key={card.id}
            card={card}
            onAction={handleAction}
            onDismiss={handleDismiss}
          />
        );

      case 'result':
        return (
          <ResultCard
            key={card.id}
            card={card}
            onAction={handleAction}
            onDismiss={handleDismiss}
          />
        );

      case 'progress':
        return (
          <ProgressCard
            key={card.id}
            card={card}
            onAction={handleAction}
          />
        );

      case 'confirmation':
        return (
          <ConfirmationCard
            key={card.id}
            card={card}
            onAction={handleAction}
            onDismiss={handleDismiss}
          />
        );

      case 'info':
        return (
          <div key={card.id} className="a2ui-card card-info">
            <div className="card-header">
              <span className="card-icon">ℹ️</span>
              <h3 className="card-title">{card.title}</h3>
              <button className="card-dismiss" onClick={handleDismiss}>×</button>
            </div>
            {card.description && (
              <p className="card-description">{card.description}</p>
            )}
          </div>
        );

      case 'error':
        return (
          <div key={card.id} className="a2ui-card card-error">
            <div className="card-header">
              <span className="card-icon">❌</span>
              <h3 className="card-title">{card.title}</h3>
              <button className="card-dismiss" onClick={handleDismiss}>×</button>
            </div>
            {card.description && (
              <p className="card-description">{card.description}</p>
            )}
            {card.actions.length > 0 && (
              <div className="card-actions">
                {card.actions.map((action) => (
                  <button
                    key={action.id}
                    className={`a2ui-action-btn btn-${action.type}`}
                    onClick={() => handleAction(action.id)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      case 'choice':
        return (
          <div key={card.id} className="a2ui-card card-choice">
            <div className="card-header">
              <span className="card-icon">🤔</span>
              <h3 className="card-title">{card.title}</h3>
            </div>
            {card.description && (
              <p className="card-description">{card.description}</p>
            )}
            <div className="card-choices">
              {card.actions.map((action) => (
                <button
                  key={action.id}
                  className={`a2ui-choice-btn btn-${action.type}`}
                  onClick={() => handleAction(action.id)}
                  title={action.tooltip}
                >
                  {action.icon && <span className="choice-icon">{action.icon}</span>}
                  <span className="choice-label">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="a2ui-card-list" ref={listRef}>
      {visibleCards.length === 0 ? (
        <div className="a2ui-empty-state">
          <div className="empty-icon">🦅</div>
          <p className="empty-message">{emptyMessage}</p>
          <div className="empty-hint">
            <span className="pulse-dot" />
            正在感知中...
          </div>
        </div>
      ) : (
        visibleCards.map(renderCard)
      )}
    </div>
  );
};
