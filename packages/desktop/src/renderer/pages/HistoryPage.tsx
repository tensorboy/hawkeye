/**
 * HistoryPage - Execution history listing page
 * Displays all past execution records with status and details
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useHawkeyeStore } from '../stores';
import type { ExecutionHistoryItem } from '../stores/types';

const containerVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const itemVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

function formatDuration(ms: number | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✅';
    case 'failed': return '❌';
    case 'cancelled': return '⏹️';
    case 'running': return '🔄';
    default: return '⏳';
  }
}

function getStatusText(status: string, t: (key: string, fallback?: any) => string): string {
  switch (status) {
    case 'completed': return t('app.executionCompleted', '已完成');
    case 'failed': return t('app.executionFailed', '执行失败');
    case 'cancelled': return t('app.cancel', '已取消');
    case 'running': return t('app.running', '执行中');
    default: return status;
  }
}

export function HistoryPage() {
  const { t } = useTranslation();
  const { setShowHistory } = useHawkeyeStore();
  const [historyItems, setHistoryItems] = useState<ExecutionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const items = await window.hawkeye.getExecutionHistory(100);
      setHistoryItems(items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleBack = () => {
    setShowHistory(false);
  };

  return (
    <motion.div
      className="history-page"
      variants={containerVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Header */}
      <header className="history-header">
        <button
          className="btn-back"
          onClick={handleBack}
          title={t('app.back', '返回')}
        >
          ← {t('app.back', '返回')}
        </button>
        <h1>{t('app.historyTitle', '执行历史')}</h1>
        <button
          className="btn-icon"
          onClick={loadHistory}
          title={t('app.refresh', '刷新')}
        >
          🔄
        </button>
      </header>

      {/* Content */}
      <div className="history-content">
        {loading && (
          <div className="history-loading">
            <span className="loading-spinner">⏳</span>
            <span>{t('app.loading', '加载中...')}</span>
          </div>
        )}

        {error && (
          <div className="history-error">
            <span>❌</span>
            <span>{error}</span>
            <button className="btn btn-secondary" onClick={loadHistory}>
              {t('app.retry', '重试')}
            </button>
          </div>
        )}

        {!loading && !error && historyItems.length === 0 && (
          <div className="history-empty">
            <span className="empty-icon">📜</span>
            <h3>{t('app.historyEmpty', '暂无执行记录')}</h3>
            <p>{t('app.historyEmptyDesc', '执行任务后会在这里显示历史记录')}</p>
          </div>
        )}

        {!loading && !error && historyItems.length > 0 && (
          <div className="history-list">
            <AnimatePresence>
              {historyItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  className={`history-item status-${item.status}`}
                  variants={itemVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ delay: index * 0.05 }}
                >
                  <div className="history-item-icon">
                    {getStatusIcon(item.status)}
                  </div>
                  <div className="history-item-content">
                    <div className="history-item-title">
                      {item.plan?.title || t('app.unknownTask', '未知任务')}
                    </div>
                    <div className="history-item-meta">
                      <span className="history-item-status">
                        {getStatusText(item.status, t)}
                      </span>
                      {item.plan && (
                        <span className="history-item-steps">
                          {item.plan.steps.length} {t('app.steps', '步骤')}
                        </span>
                      )}
                      <span className="history-item-duration">
                        {formatDuration(item.completedAt ? item.completedAt - item.startedAt : undefined)}
                      </span>
                    </div>
                    {item.plan?.description && (
                      <div className="history-item-description">
                        {item.plan.description}
                      </div>
                    )}
                  </div>
                  <div className="history-item-time">
                    {formatTime(item.startedAt)}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Summary footer */}
      {!loading && historyItems.length > 0 && (
        <footer className="history-footer">
          <span>
            {t('app.historyCount', {
              count: historyItems.length,
              defaultValue: `共 ${historyItems.length} 条记录`
            })}
          </span>
          <span className="history-stats">
            ✅ {historyItems.filter(i => i.status === 'completed').length}
            &nbsp;&nbsp;
            ❌ {historyItems.filter(i => i.status === 'failed').length}
          </span>
        </footer>
      )}
    </motion.div>
  );
}
