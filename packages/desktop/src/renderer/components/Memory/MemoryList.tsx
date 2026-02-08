/**
 * MemoryList - Memory List with Search & Filter
 * Based on memU-ui patterns
 */

import React, { useState, useMemo, useCallback } from 'react';
import { MemoryCard, type MemoryCardData } from './MemoryCard';
import { MemoryViewerModal } from './MemoryViewerModal';

interface RelatedMemory {
  id: string;
  summary: string;
  similarity?: number;
}

interface MemoryListProps {
  memories: MemoryCardData[];
  onEdit?: (id: string, updates: Partial<MemoryCardData>) => void;
  onDelete?: (id: string) => void;
  onSearch?: (query: string) => Promise<MemoryCardData[]>;
  getRelated?: (id: string) => Promise<RelatedMemory[]>;
  isLoading?: boolean;
}

type SortBy = 'updatedAt' | 'createdAt' | 'importance' | 'accessCount';
type FilterType = 'all' | 'item' | 'category' | 'resource';

export const MemoryList: React.FC<MemoryListProps> = ({
  memories,
  onEdit,
  onDelete,
  onSearch,
  getRelated,
  isLoading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryCardData[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');
  const [sortDesc, setSortDesc] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewingMemory, setViewingMemory] = useState<MemoryCardData | null>(null);
  const [relatedMemories, setRelatedMemories] = useState<RelatedMemory[]>([]);

  // Handle search
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);

    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    if (onSearch) {
      setIsSearching(true);
      try {
        const results = await onSearch(query);
        setSearchResults(results);
      } finally {
        setIsSearching(false);
      }
    } else {
      // Local search fallback
      const lowerQuery = query.toLowerCase();
      const filtered = memories.filter((m) =>
        m.summary.toLowerCase().includes(lowerQuery)
      );
      setSearchResults(filtered);
    }
  }, [memories, onSearch]);

  // Filtered and sorted memories
  const displayMemories = useMemo(() => {
    let items = searchResults ?? memories;

    // Filter by type
    if (filterType !== 'all') {
      items = items.filter((m) => m.memoryType === filterType);
    }

    // Sort
    items = [...items].sort((a, b) => {
      let aVal: number, bVal: number;

      switch (sortBy) {
        case 'createdAt':
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        case 'importance':
          aVal = a.importance ?? 0;
          bVal = b.importance ?? 0;
          break;
        case 'accessCount':
          aVal = a.accessCount ?? 0;
          bVal = b.accessCount ?? 0;
          break;
        case 'updatedAt':
        default:
          aVal = a.updatedAt;
          bVal = b.updatedAt;
      }

      return sortDesc ? bVal - aVal : aVal - bVal;
    });

    return items;
  }, [memories, searchResults, filterType, sortBy, sortDesc]);

  // Handle card click
  const handleCardClick = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Handle view
  const handleView = async (id: string) => {
    const memory = memories.find((m) => m.id === id);
    if (memory) {
      setViewingMemory(memory);

      // Fetch related memories
      if (getRelated) {
        try {
          const related = await getRelated(id);
          setRelatedMemories(related);
        } catch {
          setRelatedMemories([]);
        }
      }
    }
  };

  // Handle navigate to related
  const handleNavigate = async (id: string) => {
    const memory = memories.find((m) => m.id === id);
    if (memory) {
      setViewingMemory(memory);
      if (getRelated) {
        try {
          const related = await getRelated(id);
          setRelatedMemories(related);
        } catch {
          setRelatedMemories([]);
        }
      }
    }
  };

  // Stats
  const stats = useMemo(() => {
    return {
      total: memories.length,
      items: memories.filter((m) => m.memoryType === 'item').length,
      categories: memories.filter((m) => m.memoryType === 'category').length,
      resources: memories.filter((m) => m.memoryType === 'resource').length,
    };
  }, [memories]);

  return (
    <div className="memory-list-container">
      {/* Header */}
      <div className="memory-list-header">
        <div className="memory-search-area">
          <input
            type="text"
            className="memory-search-input"
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {isSearching && <span className="memory-search-spinner" />}
        </div>

        <div className="memory-filters">
          <select
            className="memory-filter-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
          >
            <option value="all">All Types ({stats.total})</option>
            <option value="item">Items ({stats.items})</option>
            <option value="category">Categories ({stats.categories})</option>
            <option value="resource">Resources ({stats.resources})</option>
          </select>

          <select
            className="memory-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            <option value="updatedAt">Updated</option>
            <option value="createdAt">Created</option>
            <option value="importance">Importance</option>
            <option value="accessCount">Access Count</option>
          </select>

          <button
            className="memory-sort-direction"
            onClick={() => setSortDesc(!sortDesc)}
            title={sortDesc ? 'Descending' : 'Ascending'}
          >
            {sortDesc ? '↓' : '↑'}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="memory-stats-bar">
        <span className="memory-stat">
          Showing {displayMemories.length} of {memories.length} memories
        </span>
        {selectedIds.size > 0 && (
          <span className="memory-selected-count">
            {selectedIds.size} selected
          </span>
        )}
        {searchResults && (
          <button
            className="memory-clear-search"
            onClick={() => {
              setSearchQuery('');
              setSearchResults(null);
            }}
          >
            Clear search
          </button>
        )}
      </div>

      {/* Memory Grid */}
      <div className="memory-grid">
        {isLoading ? (
          <div className="memory-loading">
            <span className="memory-loading-spinner" />
            Loading memories...
          </div>
        ) : displayMemories.length === 0 ? (
          <div className="memory-empty">
            {searchQuery ? 'No memories match your search' : 'No memories yet'}
          </div>
        ) : (
          displayMemories.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              selected={selectedIds.has(memory.id)}
              onClick={handleCardClick}
              onView={handleView}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

      {/* Viewer Modal */}
      <MemoryViewerModal
        memory={viewingMemory}
        relatedMemories={relatedMemories}
        isOpen={viewingMemory !== null}
        onClose={() => {
          setViewingMemory(null);
          setRelatedMemories([]);
        }}
        onEdit={onEdit}
        onDelete={onDelete}
        onNavigate={handleNavigate}
      />

      <style>{`
        .memory-list-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-primary, #16161e);
        }

        .memory-list-header {
          display: flex;
          gap: 12px;
          padding: 16px;
          border-bottom: 1px solid var(--border-color, #333);
          flex-wrap: wrap;
        }

        .memory-search-area {
          flex: 1;
          min-width: 200px;
          position: relative;
        }

        .memory-search-input {
          width: 100%;
          padding: 8px 12px;
          background: var(--bg-secondary, #1a1a2e);
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          color: var(--text-primary, #e0e0e0);
          font-size: 14px;
        }

        .memory-search-input:focus {
          outline: none;
          border-color: var(--primary-color, #3b82f6);
        }

        .memory-search-input::placeholder {
          color: var(--text-secondary, #888);
        }

        .memory-search-spinner {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          border: 2px solid var(--border-color, #333);
          border-top-color: var(--primary-color, #3b82f6);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: translateY(-50%) rotate(360deg); }
        }

        .memory-filters {
          display: flex;
          gap: 8px;
        }

        .memory-filter-select,
        .memory-sort-select {
          padding: 8px 12px;
          background: var(--bg-secondary, #1a1a2e);
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          color: var(--text-primary, #e0e0e0);
          font-size: 13px;
          cursor: pointer;
        }

        .memory-filter-select:focus,
        .memory-sort-select:focus {
          outline: none;
          border-color: var(--primary-color, #3b82f6);
        }

        .memory-sort-direction {
          padding: 8px 12px;
          background: var(--bg-secondary, #1a1a2e);
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          color: var(--text-primary, #e0e0e0);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .memory-sort-direction:hover {
          background: var(--bg-hover, #252540);
        }

        .memory-stats-bar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 8px 16px;
          font-size: 12px;
          color: var(--text-secondary, #888);
          border-bottom: 1px solid var(--border-color, #333);
        }

        .memory-selected-count {
          color: var(--primary-color, #3b82f6);
        }

        .memory-clear-search {
          background: transparent;
          border: none;
          color: var(--primary-color, #3b82f6);
          font-size: 12px;
          cursor: pointer;
          padding: 0;
        }

        .memory-clear-search:hover {
          text-decoration: underline;
        }

        .memory-grid {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .memory-loading,
        .memory-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          color: var(--text-secondary, #888);
          font-size: 14px;
          gap: 12px;
        }

        .memory-loading-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid var(--border-color, #333);
          border-top-color: var(--primary-color, #3b82f6);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default MemoryList;
