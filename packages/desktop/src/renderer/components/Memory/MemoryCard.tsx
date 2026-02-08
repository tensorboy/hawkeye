/**
 * MemoryCard - Memory Item Card Component
 * Based on memU-ui MemoryCard pattern
 */

import React from 'react';

export interface MemoryCardData {
  id: string;
  summary: string;
  memoryType: 'item' | 'category' | 'resource';
  categoryName?: string;
  importance?: number;
  createdAt: number;
  updatedAt: number;
  accessCount?: number;
  relatedIds?: string[];
  refId?: string;
}

interface MemoryCardProps {
  memory: MemoryCardData;
  selected?: boolean;
  onClick?: (id: string) => void;
  onView?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const typeIcons: Record<string, string> = {
  item: '📝',
  category: '📁',
  resource: '📎',
};

const typeColors: Record<string, string> = {
  item: '#3b82f6',
  category: '#10b981',
  resource: '#8b5cf6',
};

export const MemoryCard: React.FC<MemoryCardProps> = ({
  memory,
  selected = false,
  onClick,
  onView,
  onDelete,
}) => {
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleClick = () => {
    onClick?.(memory.id);
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    onView?.(memory.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(memory.id);
  };

  const truncateSummary = (text: string, maxLength = 120): string => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  return (
    <div
      className={`memory-card ${selected ? 'selected' : ''}`}
      onClick={handleClick}
      style={{
        '--type-color': typeColors[memory.memoryType] || typeColors.item,
      } as React.CSSProperties}
    >
      <div className="memory-card-header">
        <span className="memory-type-icon">
          {typeIcons[memory.memoryType] || typeIcons.item}
        </span>
        <span className="memory-type-badge">{memory.memoryType}</span>
        {memory.categoryName && (
          <span className="memory-category-badge">{memory.categoryName}</span>
        )}
        {memory.importance !== undefined && memory.importance > 0.7 && (
          <span className="memory-importance-badge">
            ⭐ {Math.round(memory.importance * 100)}%
          </span>
        )}
      </div>

      <div className="memory-card-content">
        <p className="memory-summary">{truncateSummary(memory.summary)}</p>
      </div>

      <div className="memory-card-footer">
        <div className="memory-meta">
          <span className="memory-date" title={new Date(memory.updatedAt).toLocaleString()}>
            {formatDate(memory.updatedAt)}
          </span>
          {memory.accessCount !== undefined && memory.accessCount > 0 && (
            <span className="memory-access-count">
              👁 {memory.accessCount}
            </span>
          )}
          {memory.relatedIds && memory.relatedIds.length > 0 && (
            <span className="memory-related-count">
              🔗 {memory.relatedIds.length}
            </span>
          )}
        </div>

        <div className="memory-actions">
          <button
            className="memory-action-btn view"
            onClick={handleView}
            title="View details"
          >
            👁
          </button>
          <button
            className="memory-action-btn delete"
            onClick={handleDelete}
            title="Delete"
          >
            🗑
          </button>
        </div>
      </div>

      <style>{`
        .memory-card {
          background: var(--bg-secondary, #1a1a2e);
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          border-left: 3px solid var(--type-color);
        }

        .memory-card:hover {
          background: var(--bg-hover, #252540);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .memory-card.selected {
          border-color: var(--primary-color, #3b82f6);
          background: var(--bg-selected, #1e3a5f);
        }

        .memory-card-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .memory-type-icon {
          font-size: 16px;
        }

        .memory-type-badge {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--type-color);
          color: white;
          text-transform: uppercase;
        }

        .memory-category-badge {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-secondary, #888);
        }

        .memory-importance-badge {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
          margin-left: auto;
        }

        .memory-card-content {
          margin-bottom: 8px;
        }

        .memory-summary {
          font-size: 13px;
          line-height: 1.5;
          color: var(--text-primary, #e0e0e0);
          margin: 0;
        }

        .memory-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .memory-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--text-secondary, #888);
        }

        .memory-date {
          opacity: 0.8;
        }

        .memory-access-count,
        .memory-related-count {
          opacity: 0.7;
        }

        .memory-actions {
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .memory-card:hover .memory-actions {
          opacity: 1;
        }

        .memory-action-btn {
          background: transparent;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.2s;
        }

        .memory-action-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .memory-action-btn.delete:hover {
          background: rgba(239, 68, 68, 0.2);
        }
      `}</style>
    </div>
  );
};

export default MemoryCard;
