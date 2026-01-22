/**
 * DynamicQuickActions - 动态快捷操作组件
 *
 * 基于 AutoSuggestEngine 生成的建议动态显示快捷操作
 * 支持:
 * - 自动建议展示
 * - 置信度显示
 * - 一键执行
 * - 反馈学习
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { SuggestedAction, SuggestionType } from '@hawkeye/core';

/**
 * 建议操作的显示配置
 */
interface SuggestionDisplay {
  icon: string;
  color: string;
  priority: number;
}

/**
 * 建议类型到显示配置的映射
 */
const SUGGESTION_TYPE_CONFIG: Record<SuggestionType, SuggestionDisplay> = {
  predicted: { icon: '🎯', color: '#3B82F6', priority: 1 },
  repetitive: { icon: '🔄', color: '#8B5CF6', priority: 2 },
  contextual: { icon: '💡', color: '#F59E0B', priority: 3 },
  scheduled: { icon: '⏰', color: '#10B981', priority: 4 },
  error_fix: { icon: '🔧', color: '#EF4444', priority: 0 },
  optimization: { icon: '⚡', color: '#6366F1', priority: 5 },
};

interface DynamicQuickActionsProps {
  /** 建议的操作列表 */
  suggestions: SuggestedAction[];
  /** 执行建议回调 */
  onExecute: (suggestionId: string) => void;
  /** 忽略建议回调 */
  onDismiss: (suggestionId: string) => void;
  /** 最大显示数量 */
  maxItems?: number;
  /** 最小置信度阈值 */
  minConfidence?: number;
  /** 是否显示置信度 */
  showConfidence?: boolean;
  /** 是否紧凑模式 */
  compact?: boolean;
  /** 是否显示动画 */
  animated?: boolean;
  /** 加载状态 */
  loading?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 格式化置信度显示
 */
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * 获取置信度颜色
 */
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return '#10B981'; // green
  if (confidence >= 0.6) return '#F59E0B'; // yellow
  if (confidence >= 0.4) return '#6B7280'; // gray
  return '#EF4444'; // red
}

/**
 * 截断文本
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * DynamicQuickActions 组件
 */
export const DynamicQuickActions: React.FC<DynamicQuickActionsProps> = ({
  suggestions,
  onExecute,
  onDismiss,
  maxItems = 5,
  minConfidence = 0.3,
  showConfidence = true,
  compact = false,
  animated = true,
  loading = false,
  className = '',
}) => {
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 过滤和排序建议
  const filteredSuggestions = React.useMemo(() => {
    return suggestions
      .filter((s) => s.confidence >= minConfidence && !dismissedIds.has(s.id))
      .sort((a, b) => {
        // 先按类型优先级
        const priorityA = SUGGESTION_TYPE_CONFIG[a.type]?.priority ?? 99;
        const priorityB = SUGGESTION_TYPE_CONFIG[b.type]?.priority ?? 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        // 再按置信度
        return b.confidence - a.confidence;
      })
      .slice(0, maxItems);
  }, [suggestions, minConfidence, maxItems, dismissedIds]);

  // 处理执行
  const handleExecute = useCallback(
    async (suggestion: SuggestedAction) => {
      if (executingId) return;

      setExecutingId(suggestion.id);

      try {
        await onExecute(suggestion.id);
      } catch (error) {
        console.error('Failed to execute suggestion:', error);
      } finally {
        setExecutingId(null);
      }
    },
    [executingId, onExecute]
  );

  // 处理忽略
  const handleDismiss = useCallback(
    (e: React.MouseEvent, suggestionId: string) => {
      e.stopPropagation();
      setDismissedIds((prev) => new Set([...prev, suggestionId]));
      onDismiss(suggestionId);
    },
    [onDismiss]
  );

  // 清除已忽略的记录 (当 suggestions 变化时)
  useEffect(() => {
    const currentIds = new Set(suggestions.map((s) => s.id));
    setDismissedIds((prev) => {
      const newSet = new Set<string>();
      prev.forEach((id) => {
        if (currentIds.has(id)) {
          newSet.add(id);
        }
      });
      return newSet;
    });
  }, [suggestions]);

  // 空状态
  if (filteredSuggestions.length === 0 && !loading) {
    return (
      <div className={`dynamic-quick-actions empty ${className}`}>
        <div className="empty-state">
          <span className="empty-icon">💤</span>
          <span className="empty-text">暂无建议</span>
        </div>
      </div>
    );
  }

  // 加载状态
  if (loading) {
    return (
      <div className={`dynamic-quick-actions loading ${className}`}>
        <div className="loading-state">
          <span className="loading-spinner">⏳</span>
          <span className="loading-text">分析中...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`dynamic-quick-actions ${compact ? 'compact' : ''} ${animated ? 'animated' : ''} ${className}`}
    >
      <div className="suggestions-list">
        {filteredSuggestions.map((suggestion, index) => {
          const typeConfig = SUGGESTION_TYPE_CONFIG[suggestion.type];
          const isExecuting = executingId === suggestion.id;
          const isHovered = hoveredId === suggestion.id;

          return (
            <div
              key={suggestion.id}
              className={`suggestion-item ${isExecuting ? 'executing' : ''} ${isHovered ? 'hovered' : ''}`}
              style={{
                animationDelay: animated ? `${index * 50}ms` : undefined,
                borderLeftColor: typeConfig?.color || '#6B7280',
              }}
              onClick={() => handleExecute(suggestion)}
              onMouseEnter={() => setHoveredId(suggestion.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* 类型图标 */}
              <span className="suggestion-type-icon" title={suggestion.type}>
                {typeConfig?.icon || '📌'}
              </span>

              {/* 内容区 */}
              <div className="suggestion-content">
                <span className="suggestion-reason">
                  {compact
                    ? truncateText(suggestion.reason, 30)
                    : suggestion.reason}
                </span>

                {/* 置信度 */}
                {showConfidence && !compact && (
                  <span
                    className="suggestion-confidence"
                    style={{ color: getConfidenceColor(suggestion.confidence) }}
                  >
                    {formatConfidence(suggestion.confidence)}
                  </span>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="suggestion-actions">
                {isExecuting ? (
                  <span className="executing-indicator">⏳</span>
                ) : (
                  <>
                    <button
                      className="action-btn execute"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExecute(suggestion);
                      }}
                      title="执行"
                    >
                      ▶️
                    </button>
                    <button
                      className="action-btn dismiss"
                      onClick={(e) => handleDismiss(e, suggestion.id)}
                      title="忽略"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部状态栏 */}
      {!compact && (
        <div className="suggestions-footer">
          <span className="suggestions-count">
            {filteredSuggestions.length} / {suggestions.length} 建议
          </span>
          {dismissedIds.size > 0 && (
            <button
              className="reset-dismissed"
              onClick={() => setDismissedIds(new Set())}
            >
              重置已忽略 ({dismissedIds.size})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * DynamicQuickActions 样式
 */
export const DynamicQuickActionsStyles = `
.dynamic-quick-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--bg-secondary, #1e1e1e);
  border-radius: 8px;
  font-size: 13px;
}

.dynamic-quick-actions.compact {
  padding: 8px;
  gap: 4px;
}

.dynamic-quick-actions .empty-state,
.dynamic-quick-actions .loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  color: var(--text-secondary, #888);
}

.dynamic-quick-actions .loading-spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-primary, #252525);
  border-radius: 6px;
  border-left: 3px solid #6B7280;
  cursor: pointer;
  transition: all 0.2s ease;
}

.suggestion-item:hover,
.suggestion-item.hovered {
  background: var(--bg-hover, #2a2a2a);
  transform: translateX(2px);
}

.suggestion-item.executing {
  opacity: 0.7;
  pointer-events: none;
}

.animated .suggestion-item {
  animation: slideIn 0.3s ease forwards;
  opacity: 0;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.suggestion-type-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.suggestion-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.suggestion-reason {
  color: var(--text-primary, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.suggestion-confidence {
  font-size: 11px;
  font-weight: 500;
}

.suggestion-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.suggestion-item:hover .suggestion-actions {
  opacity: 1;
}

.action-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: background 0.2s ease;
}

.action-btn:hover {
  background: var(--bg-hover, #3a3a3a);
}

.action-btn.execute:hover {
  background: rgba(16, 185, 129, 0.2);
}

.action-btn.dismiss:hover {
  background: rgba(239, 68, 68, 0.2);
}

.executing-indicator {
  font-size: 14px;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.suggestions-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--border-color, #333);
  font-size: 11px;
  color: var(--text-secondary, #888);
}

.reset-dismissed {
  background: none;
  border: none;
  color: var(--text-link, #3B82F6);
  cursor: pointer;
  font-size: 11px;
}

.reset-dismissed:hover {
  text-decoration: underline;
}

/* Compact mode adjustments */
.dynamic-quick-actions.compact .suggestion-item {
  padding: 6px 8px;
}

.dynamic-quick-actions.compact .suggestion-type-icon {
  font-size: 14px;
}

.dynamic-quick-actions.compact .suggestion-reason {
  font-size: 12px;
}

.dynamic-quick-actions.compact .suggestion-actions {
  opacity: 1;
}

.dynamic-quick-actions.compact .action-btn {
  width: 20px;
  height: 20px;
  font-size: 10px;
}
`;

export default DynamicQuickActions;
