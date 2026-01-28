/**
 * SafetyAlertCard - A2UI 安全警告卡片组件
 * 展示安全威胁警告，包括诈骗、钓鱼等检测结果
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { A2UISafetyAlertCard, SafetyRiskLevel } from '@hawkeye/core';
import { CardIcon } from './CardIcon';

interface SafetyAlertCardProps {
  card: A2UISafetyAlertCard;
  onAction: (actionId: string) => void;
  onDismiss?: () => void;
}

/**
 * 风险等级配色
 */
const RISK_COLORS: Record<SafetyRiskLevel, { bg: string; border: string; text: string; icon: string }> = {
  safe: {
    bg: 'bg-success/10',
    border: 'border-success/30',
    text: 'text-success',
    icon: 'text-success',
  },
  low: {
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    text: 'text-warning',
    icon: 'text-warning',
  },
  medium: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-500',
    icon: 'text-orange-500',
  },
  high: {
    bg: 'bg-error/10',
    border: 'border-error/30',
    text: 'text-error',
    icon: 'text-error',
  },
  critical: {
    bg: 'bg-error/20',
    border: 'border-error/50',
    text: 'text-error',
    icon: 'text-error animate-pulse',
  },
};

/**
 * 风险等级名称
 */
const RISK_NAMES: Record<SafetyRiskLevel, string> = {
  safe: '安全',
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '严重威胁',
};

export const SafetyAlertCard: React.FC<SafetyAlertCardProps> = ({
  card,
  onAction,
  onDismiss,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showGrounding, setShowGrounding] = useState(false);
  const colors = RISK_COLORS[card.riskLevel];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className={`
        safety-alert-card
        rounded-xl p-4 mb-3
        ${colors.bg} ${colors.border}
        border-2
        shadow-lg
        backdrop-blur-sm
      `}
    >
      {/* 头部区域 */}
      <div className="flex items-start gap-3">
        {/* 图标 */}
        <div className={`flex-shrink-0 ${colors.icon}`}>
          {card.riskLevel === 'critical' ? (
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
              </svg>
            </motion.div>
          ) : (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
            </svg>
          )}
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          {/* 标题行 */}
          <div className="flex items-center justify-between gap-2">
            <h3 className={`font-bold text-lg ${colors.text}`}>
              {card.title}
            </h3>
            <span className={`
              px-2 py-0.5 rounded-full text-xs font-medium
              ${colors.bg} ${colors.text} border ${colors.border}
            `}>
              {RISK_NAMES[card.riskLevel]}
            </span>
          </div>

          {/* 描述 */}
          {card.description && (
            <p className="text-base-content/80 text-sm mt-1 leading-relaxed">
              {card.description}
            </p>
          )}

          {/* 威胁标签 */}
          {card.threats.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {card.threats.slice(0, 3).map((threat, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-base-300/50 text-base-content/70"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                  {threat.description.length > 30
                    ? threat.description.substring(0, 30) + '...'
                    : threat.description}
                </span>
              ))}
              {card.threats.length > 3 && (
                <span className="text-xs text-base-content/50">
                  +{card.threats.length - 3} 更多
                </span>
              )}
            </div>
          )}
        </div>

        {/* 关闭按钮 */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-base-300/50 transition-colors"
            title="关闭"
          >
            <svg className="w-4 h-4 text-base-content/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 详情展开区域 */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-3 border-t border-base-content/10">
              {/* 详细信息 */}
              {card.details.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium text-base-content/80 mb-2">
                    检测详情
                  </h4>
                  <ul className="space-y-1">
                    {card.details.map((detail, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-base-content/70">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${colors.text}`} />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 建议操作 */}
              {card.recommendations.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium text-base-content/80 mb-2">
                    建议操作
                  </h4>
                  <ul className="space-y-1">
                    {card.recommendations.map((rec, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-base-content/70">
                        <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grounding 信息展开区域 */}
      <AnimatePresence>
        {showGrounding && card.groundingInfo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-3 border-t border-base-content/10">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h4 className="text-sm font-medium text-base-content/80">
                  网络搜索验证
                </h4>
                {card.groundingInfo.knownThreatReported && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-error/20 text-error">
                    已确认威胁
                  </span>
                )}
              </div>

              {card.groundingInfo.reportSummary && (
                <p className="text-sm text-base-content/70 mb-2">
                  {card.groundingInfo.reportSummary}
                </p>
              )}

              {/* 搜索结果列表 */}
              {card.groundingInfo.results.length > 0 && (
                <div className="space-y-2">
                  {card.groundingInfo.results.slice(0, 3).map((result, index) => (
                    <div
                      key={index}
                      className="p-2 rounded-lg bg-base-200/50 text-sm"
                    >
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:underline line-clamp-1"
                      >
                        {result.title}
                      </a>
                      <p className="text-xs text-base-content/50 mt-0.5">
                        {result.source}
                      </p>
                      {result.content && (
                        <p className="text-xs text-base-content/70 mt-1 line-clamp-2">
                          {result.content}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 操作按钮区域 */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {/* 展开/收起详情 */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`
            px-3 py-1.5 rounded-lg text-sm font-medium
            ${showDetails ? 'bg-primary text-primary-content' : 'bg-base-300/50 text-base-content/70 hover:bg-base-300'}
            transition-colors
          `}
        >
          {showDetails ? '收起详情' : '查看详情'}
        </button>

        {/* Grounding 信息按钮 */}
        {card.groundingInfo && (
          <button
            onClick={() => setShowGrounding(!showGrounding)}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium
              flex items-center gap-1.5
              ${showGrounding ? 'bg-info text-info-content' : 'bg-base-300/50 text-base-content/70 hover:bg-base-300'}
              transition-colors
            `}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {showGrounding ? '收起来源' : '查看来源'}
            {card.groundingInfo.knownThreatReported && (
              <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
            )}
          </button>
        )}

        {/* 举报按钮 */}
        <button
          onClick={() => onAction('report_threat')}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-base-300/50 text-base-content/70 hover:bg-base-300 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
          </svg>
          举报
        </button>

        {/* 间隔 */}
        <div className="flex-1" />

        {/* 忽略按钮 */}
        <button
          onClick={() => onAction('dismiss')}
          className="px-3 py-1.5 rounded-lg text-sm text-base-content/50 hover:text-base-content/70 hover:bg-base-300/50 transition-colors"
        >
          忽略风险
        </button>
      </div>

      {/* 底部元数据 */}
      {card.metadata?.sourceUrl && (
        <div className="mt-3 pt-2 border-t border-base-content/5">
          <p className="text-xs text-base-content/40 truncate">
            来源: {card.metadata.sourceUrl}
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default SafetyAlertCard;
