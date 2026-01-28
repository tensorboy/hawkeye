/**
 * SafetyButton - 安全助手快捷按钮
 * 显示在应用界面，用于快速打开安全面板
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSafety } from '../../hooks/useSafety';

interface SafetyButtonProps {
  className?: string;
}

export const SafetyButton: React.FC<SafetyButtonProps> = ({ className = '' }) => {
  const { stats, enabled, showPanel, setShowPanel } = useSafety();

  const hasHighRisk = stats.highRisk > 0;
  const hasMediumRisk = stats.mediumRisk > 0;
  const hasAlerts = stats.total > 0;

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => setShowPanel(!showPanel)}
      className={`
        relative p-2 rounded-xl
        ${showPanel
          ? 'bg-primary text-primary-content'
          : hasHighRisk
            ? 'bg-error/20 text-error hover:bg-error/30'
            : hasMediumRisk
              ? 'bg-warning/20 text-warning hover:bg-warning/30'
              : 'bg-base-200 text-base-content/70 hover:bg-base-300'
        }
        transition-colors
        ${className}
      `}
      title={enabled ? '安全助手' : '安全助手 (已禁用)'}
    >
      {/* 盾牌图标 */}
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>

      {/* 警告徽章 */}
      <AnimatePresence>
        {hasAlerts && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className={`
              absolute -top-1 -right-1
              min-w-[18px] h-[18px] px-1
              flex items-center justify-center
              rounded-full text-xs font-bold
              ${hasHighRisk
                ? 'bg-error text-error-content'
                : hasMediumRisk
                  ? 'bg-warning text-warning-content'
                  : 'bg-info text-info-content'
              }
            `}
          >
            {stats.total}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 高风险脉冲动画 */}
      {hasHighRisk && (
        <motion.div
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="absolute inset-0 rounded-xl bg-error"
        />
      )}
    </motion.button>
  );
};

export default SafetyButton;
