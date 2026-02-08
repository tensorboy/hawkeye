/**
 * MemoryViewerModal - Memory Detail Viewer Modal
 * Based on memU-ui MemoryViewerModal pattern
 */

import React, { useState, useEffect } from 'react';
import type { MemoryCardData } from './MemoryCard';

interface RelatedMemory {
  id: string;
  summary: string;
  similarity?: number;
}

interface MemoryViewerModalProps {
  memory: MemoryCardData | null;
  relatedMemories?: RelatedMemory[];
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (id: string, updates: Partial<MemoryCardData>) => void;
  onDelete?: (id: string) => void;
  onNavigate?: (id: string) => void;
}

export const MemoryViewerModal: React.FC<MemoryViewerModalProps> = ({
  memory,
  relatedMemories = [],
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onNavigate,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'related' | 'history'>('details');

  useEffect(() => {
    if (memory) {
      setEditedSummary(memory.summary);
    }
    setIsEditing(false);
  }, [memory]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditing) {
          setIsEditing(false);
          setEditedSummary(memory?.summary || '');
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, isEditing, memory, onClose]);

  if (!isOpen || !memory) {
    return null;
  }

  const handleSave = () => {
    if (memory && onEdit) {
      onEdit(memory.id, { summary: editedSummary });
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (memory && onDelete) {
      if (confirm('Are you sure you want to delete this memory?')) {
        onDelete(memory.id);
        onClose();
      }
    }
  };

  const formatFullDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="memory-modal-overlay" onClick={onClose}>
      <div className="memory-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="memory-modal-header">
          <div className="memory-modal-title-area">
            <span className="memory-modal-type-icon">
              {memory.memoryType === 'item' ? '📝' : memory.memoryType === 'category' ? '📁' : '📎'}
            </span>
            <h2 className="memory-modal-title">
              Memory {memory.refId || memory.id.slice(0, 8)}
            </h2>
            {memory.categoryName && (
              <span className="memory-modal-category">{memory.categoryName}</span>
            )}
          </div>
          <button className="memory-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="memory-modal-tabs">
          <button
            className={`memory-tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          <button
            className={`memory-tab ${activeTab === 'related' ? 'active' : ''}`}
            onClick={() => setActiveTab('related')}
          >
            Related ({relatedMemories.length})
          </button>
          <button
            className={`memory-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
        </div>

        {/* Content */}
        <div className="memory-modal-content">
          {activeTab === 'details' && (
            <div className="memory-details-tab">
              {/* Summary */}
              <div className="memory-section">
                <div className="memory-section-header">
                  <h3>Summary</h3>
                  {!isEditing && onEdit && (
                    <button
                      className="memory-edit-btn"
                      onClick={() => setIsEditing(true)}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <div className="memory-edit-area">
                    <textarea
                      value={editedSummary}
                      onChange={(e) => setEditedSummary(e.target.value)}
                      rows={4}
                      autoFocus
                    />
                    <div className="memory-edit-actions">
                      <button className="memory-save-btn" onClick={handleSave}>
                        Save
                      </button>
                      <button
                        className="memory-cancel-btn"
                        onClick={() => {
                          setIsEditing(false);
                          setEditedSummary(memory.summary);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="memory-summary-text">{memory.summary}</p>
                )}
              </div>

              {/* Metadata */}
              <div className="memory-section">
                <h3>Metadata</h3>
                <div className="memory-metadata-grid">
                  <div className="metadata-item">
                    <span className="metadata-label">Type</span>
                    <span className="metadata-value">{memory.memoryType}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Created</span>
                    <span className="metadata-value">{formatFullDate(memory.createdAt)}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Updated</span>
                    <span className="metadata-value">{formatFullDate(memory.updatedAt)}</span>
                  </div>
                  {memory.importance !== undefined && (
                    <div className="metadata-item">
                      <span className="metadata-label">Importance</span>
                      <span className="metadata-value">
                        {Math.round(memory.importance * 100)}%
                      </span>
                    </div>
                  )}
                  {memory.accessCount !== undefined && (
                    <div className="metadata-item">
                      <span className="metadata-label">Access Count</span>
                      <span className="metadata-value">{memory.accessCount}</span>
                    </div>
                  )}
                  <div className="metadata-item">
                    <span className="metadata-label">ID</span>
                    <span className="metadata-value metadata-id">{memory.id}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'related' && (
            <div className="memory-related-tab">
              {relatedMemories.length === 0 ? (
                <div className="memory-empty-state">
                  No related memories found
                </div>
              ) : (
                <div className="memory-related-list">
                  {relatedMemories.map((related) => (
                    <div
                      key={related.id}
                      className="memory-related-item"
                      onClick={() => onNavigate?.(related.id)}
                    >
                      <div className="related-content">
                        <p className="related-summary">{related.summary}</p>
                        {related.similarity !== undefined && (
                          <span className="related-similarity">
                            {Math.round(related.similarity * 100)}% similar
                          </span>
                        )}
                      </div>
                      <span className="related-arrow">→</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="memory-history-tab">
              <div className="memory-empty-state">
                History tracking coming soon
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="memory-modal-footer">
          {onDelete && (
            <button className="memory-delete-btn" onClick={handleDelete}>
              Delete Memory
            </button>
          )}
          <button className="memory-close-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <style>{`
          .memory-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(4px);
          }

          .memory-modal {
            background: var(--bg-primary, #16161e);
            border: 1px solid var(--border-color, #333);
            border-radius: 12px;
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          }

          .memory-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid var(--border-color, #333);
          }

          .memory-modal-title-area {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .memory-modal-type-icon {
            font-size: 24px;
          }

          .memory-modal-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary, #e0e0e0);
            margin: 0;
          }

          .memory-modal-category {
            font-size: 12px;
            padding: 2px 8px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.1);
            color: var(--text-secondary, #888);
          }

          .memory-modal-close {
            background: transparent;
            border: none;
            color: var(--text-secondary, #888);
            font-size: 20px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: all 0.2s;
          }

          .memory-modal-close:hover {
            background: rgba(255, 255, 255, 0.1);
            color: var(--text-primary, #e0e0e0);
          }

          .memory-modal-tabs {
            display: flex;
            border-bottom: 1px solid var(--border-color, #333);
          }

          .memory-tab {
            flex: 1;
            padding: 12px;
            background: transparent;
            border: none;
            color: var(--text-secondary, #888);
            font-size: 14px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
          }

          .memory-tab:hover {
            color: var(--text-primary, #e0e0e0);
            background: rgba(255, 255, 255, 0.05);
          }

          .memory-tab.active {
            color: var(--primary-color, #3b82f6);
            border-bottom-color: var(--primary-color, #3b82f6);
          }

          .memory-modal-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
          }

          .memory-section {
            margin-bottom: 24px;
          }

          .memory-section:last-child {
            margin-bottom: 0;
          }

          .memory-section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }

          .memory-section h3 {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-secondary, #888);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0;
          }

          .memory-edit-btn {
            font-size: 12px;
            padding: 4px 12px;
            background: transparent;
            border: 1px solid var(--border-color, #333);
            color: var(--text-secondary, #888);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .memory-edit-btn:hover {
            border-color: var(--primary-color, #3b82f6);
            color: var(--primary-color, #3b82f6);
          }

          .memory-summary-text {
            font-size: 15px;
            line-height: 1.6;
            color: var(--text-primary, #e0e0e0);
            margin: 0;
            white-space: pre-wrap;
          }

          .memory-edit-area textarea {
            width: 100%;
            padding: 12px;
            background: var(--bg-secondary, #1a1a2e);
            border: 1px solid var(--border-color, #333);
            border-radius: 8px;
            color: var(--text-primary, #e0e0e0);
            font-size: 14px;
            line-height: 1.5;
            resize: vertical;
          }

          .memory-edit-area textarea:focus {
            outline: none;
            border-color: var(--primary-color, #3b82f6);
          }

          .memory-edit-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
          }

          .memory-save-btn {
            padding: 8px 16px;
            background: var(--primary-color, #3b82f6);
            border: none;
            border-radius: 6px;
            color: white;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.2s;
          }

          .memory-save-btn:hover {
            background: var(--primary-hover, #2563eb);
          }

          .memory-cancel-btn {
            padding: 8px 16px;
            background: transparent;
            border: 1px solid var(--border-color, #333);
            border-radius: 6px;
            color: var(--text-secondary, #888);
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .memory-cancel-btn:hover {
            border-color: var(--text-secondary, #888);
          }

          .memory-metadata-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }

          .metadata-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .metadata-label {
            font-size: 11px;
            color: var(--text-secondary, #888);
            text-transform: uppercase;
          }

          .metadata-value {
            font-size: 14px;
            color: var(--text-primary, #e0e0e0);
          }

          .metadata-id {
            font-family: monospace;
            font-size: 12px;
            word-break: break-all;
          }

          .memory-related-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .memory-related-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--bg-secondary, #1a1a2e);
            border: 1px solid var(--border-color, #333);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .memory-related-item:hover {
            background: var(--bg-hover, #252540);
            border-color: var(--primary-color, #3b82f6);
          }

          .related-content {
            flex: 1;
          }

          .related-summary {
            font-size: 13px;
            color: var(--text-primary, #e0e0e0);
            margin: 0 0 4px 0;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .related-similarity {
            font-size: 11px;
            color: var(--text-secondary, #888);
          }

          .related-arrow {
            font-size: 16px;
            color: var(--text-secondary, #888);
            margin-left: 12px;
          }

          .memory-empty-state {
            text-align: center;
            padding: 40px;
            color: var(--text-secondary, #888);
            font-size: 14px;
          }

          .memory-modal-footer {
            display: flex;
            justify-content: space-between;
            padding: 16px 20px;
            border-top: 1px solid var(--border-color, #333);
          }

          .memory-delete-btn {
            padding: 8px 16px;
            background: transparent;
            border: 1px solid #ef4444;
            color: #ef4444;
            border-radius: 6px;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .memory-delete-btn:hover {
            background: rgba(239, 68, 68, 0.1);
          }

          .memory-close-btn {
            padding: 8px 16px;
            background: var(--bg-secondary, #1a1a2e);
            border: 1px solid var(--border-color, #333);
            color: var(--text-primary, #e0e0e0);
            border-radius: 6px;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .memory-close-btn:hover {
            background: var(--bg-hover, #252540);
          }
        `}</style>
      </div>
    </div>
  );
};

export default MemoryViewerModal;
