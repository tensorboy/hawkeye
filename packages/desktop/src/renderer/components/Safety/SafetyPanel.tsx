/**
 * SafetyPanel - 安全助手面板组件
 * 展示安全警告列表和安全设置
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSafety } from '../../hooks/useSafety';
import { SafetyAlertCard } from '../A2UI/SafetyAlertCard';
import { RISK_LEVEL_DESCRIPTIONS } from '@hawkeye/core';

interface SafetyPanelProps {
  className?: string;
}

export const SafetyPanel: React.FC<SafetyPanelProps> = ({ className = '' }) => {
  const {
    alerts,
    stats,
    enabled,
    autoCheckUrls,
    autoCheckClipboard,
    showPanel,
    handleAlertAction,
    setEnabled,
    setAutoCheckUrls,
    setAutoCheckClipboard,
    setShowPanel,
    clearAlerts,
    checkUrl,
  } = useSafety();

  const [manualCheckUrl, setManualCheckUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [activeTab, setActiveTab] = useState<'alerts' | 'settings'>('alerts');

  // 手动检查 URL
  const handleManualCheck = async () => {
    if (!manualCheckUrl.trim()) return;

    setChecking(true);
    try {
      await checkUrl(manualCheckUrl.trim());
      setManualCheckUrl('');
    } finally {
      setChecking(false);
    }
  };

  if (!showPanel) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={`
        safety-panel
        fixed right-4 top-20 bottom-4 w-96
        bg-base-100 rounded-2xl shadow-2xl
        border border-base-300
        flex flex-col overflow-hidden
        z-50
        ${className}
      `}
    >
      {/* 头部 */}
      <div className="p-4 border-b border-base-300">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${enabled ? 'bg-success animate-pulse' : 'bg-base-content/30'}`} />
            <h2 className="text-lg font-bold">安全助手</h2>
          </div>
          <button
            onClick={() => setShowPanel(false)}
            className="btn btn-ghost btn-sm btn-circle"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 统计信息 */}
        <div className="flex gap-2">
          {stats.highRisk > 0 && (
            <span className="badge badge-error badge-sm gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {stats.highRisk} 高风险
            </span>
          )}
          {stats.mediumRisk > 0 && (
            <span className="badge badge-warning badge-sm gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {stats.mediumRisk} 中风险
            </span>
          )}
          {stats.lowRisk > 0 && (
            <span className="badge badge-info badge-sm gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {stats.lowRisk} 低风险
            </span>
          )}
          {stats.total === 0 && (
            <span className="badge badge-success badge-sm gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              暂无威胁
            </span>
          )}
        </div>

        {/* 选项卡 */}
        <div className="tabs tabs-boxed mt-3 bg-base-200">
          <button
            className={`tab flex-1 ${activeTab === 'alerts' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('alerts')}
          >
            警告 {stats.total > 0 && `(${stats.total})`}
          </button>
          <button
            className={`tab flex-1 ${activeTab === 'settings' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            设置
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'alerts' ? (
          <>
            {/* 手动检查输入 */}
            <div className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualCheckUrl}
                  onChange={(e) => setManualCheckUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualCheck()}
                  placeholder="输入 URL 检查安全性..."
                  className="input input-bordered input-sm flex-1"
                  disabled={!enabled || checking}
                />
                <button
                  onClick={handleManualCheck}
                  disabled={!enabled || checking || !manualCheckUrl.trim()}
                  className="btn btn-primary btn-sm"
                >
                  {checking ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* 警告列表 */}
            <AnimatePresence>
              {alerts.length > 0 ? (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <SafetyAlertCard
                      key={alert.id}
                      card={alert.card}
                      onAction={(actionId) => handleAlertAction(alert.id, actionId)}
                      onDismiss={() => handleAlertAction(alert.id, 'dismiss')}
                    />
                  ))}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12"
                >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <p className="text-base-content/60">目前没有检测到安全威胁</p>
                  <p className="text-sm text-base-content/40 mt-1">
                    安全助手正在保护您
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 清除按钮 */}
            {alerts.length > 0 && (
              <button
                onClick={clearAlerts}
                className="btn btn-ghost btn-sm w-full mt-4"
              >
                清除所有警告
              </button>
            )}
          </>
        ) : (
          /* 设置面板 */
          <div className="space-y-4">
            {/* 启用/禁用 */}
            <div className="form-control">
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="toggle toggle-primary"
                />
                <div>
                  <span className="label-text font-medium">启用安全保护</span>
                  <p className="text-xs text-base-content/50">自动检测诈骗、钓鱼等安全威胁</p>
                </div>
              </label>
            </div>

            {/* 自动检查 URL */}
            <div className="form-control">
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  checked={autoCheckUrls}
                  onChange={(e) => setAutoCheckUrls(e.target.checked)}
                  className="toggle toggle-secondary"
                  disabled={!enabled}
                />
                <div>
                  <span className="label-text font-medium">自动检查 URL</span>
                  <p className="text-xs text-base-content/50">自动检查屏幕上的链接</p>
                </div>
              </label>
            </div>

            {/* 自动检查剪贴板 */}
            <div className="form-control">
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  checked={autoCheckClipboard}
                  onChange={(e) => setAutoCheckClipboard(e.target.checked)}
                  className="toggle toggle-secondary"
                  disabled={!enabled}
                />
                <div>
                  <span className="label-text font-medium">检查剪贴板</span>
                  <p className="text-xs text-base-content/50">复制 URL 时自动检查</p>
                </div>
              </label>
            </div>

            {/* 威胁类型说明 */}
            <div className="mt-6">
              <h3 className="text-sm font-medium mb-3">检测的威胁类型</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error" />
                  <span>钓鱼攻击、虚假登录页面</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error" />
                  <span>诈骗网站、投资骗局</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-warning" />
                  <span>加密货币骗局</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-warning" />
                  <span>技术支持骗局</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-info" />
                  <span>可疑链接、短链接</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="p-3 border-t border-base-300 bg-base-200/50">
        <div className="flex items-center justify-between text-xs text-base-content/50">
          <span>
            {enabled ? '保护中' : '已禁用'} · 历史记录 {stats.historyCount} 条
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Hawkeye Safety
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default SafetyPanel;
