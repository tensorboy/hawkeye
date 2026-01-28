/**
 * useSafety Hook - 安全助手 React Hook
 * 提供便捷的安全检查和警告管理功能
 */

import { useCallback, useMemo } from 'react';
import { useHawkeyeStore, type SafetyAlert } from '../stores';
import {
  SafetyAnalyzer,
  createSafetyAnalyzer,
  type SafetyCheckInput,
  type SafetyAnalyzerConfig,
} from '@hawkeye/core';

// 单例分析器
let analyzerInstance: SafetyAnalyzer | null = null;

function getAnalyzer(config?: Partial<SafetyAnalyzerConfig>): SafetyAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = createSafetyAnalyzer(config);
  }
  return analyzerInstance;
}

export function useSafety() {
  // Store state
  const {
    safetyAlerts,
    safetyHistory,
    safetyEnabled,
    autoCheckUrls,
    autoCheckClipboard,
    showSafetyPanel,
    lastCheckResult,
    setSafetyEnabled,
    setAutoCheckUrls,
    setAutoCheckClipboard,
    setShowSafetyPanel,
    addSafetyAlert,
    removeSafetyAlert,
    clearSafetyAlerts,
    updateAlertAction,
    getHighRiskAlerts,
    clearHistory,
    setLastCheckResult,
  } = useHawkeyeStore();

  // 获取配置
  const config = useHawkeyeStore((state) => state.config);

  // 执行安全检查
  const checkSafety = useCallback(
    async (input: SafetyCheckInput): Promise<SafetyAlert | null> => {
      if (!safetyEnabled) {
        return null;
      }

      try {
        const analyzer = getAnalyzer({
          tavilyApiKey: config?.tavilyApiKey,
          enableWebGrounding: !!config?.tavilyApiKey,
        });

        const result = await analyzer.analyze(input);
        setLastCheckResult(result);

        // 如果检测到威胁，创建警告
        if (!result.isSafe) {
          const card = analyzer.createAlertCard(result, input);
          const alert: SafetyAlert = {
            id: card.id,
            card,
            result,
            input,
            timestamp: Date.now(),
          };

          addSafetyAlert(alert);
          return alert;
        }

        return null;
      } catch (error) {
        console.error('Safety check failed:', error);
        return null;
      }
    },
    [safetyEnabled, config?.tavilyApiKey, addSafetyAlert, setLastCheckResult]
  );

  // 快速检查 URL
  const checkUrl = useCallback(
    async (url: string) => {
      return checkSafety({ url });
    },
    [checkSafety]
  );

  // 快速检查文本
  const checkText = useCallback(
    async (text: string) => {
      return checkSafety({ text });
    },
    [checkSafety]
  );

  // 快速检查邮件
  const checkEmail = useCallback(
    async (from: string, subject: string, body: string) => {
      return checkSafety({ email: { from, subject, body } });
    },
    [checkSafety]
  );

  // 处理警告操作
  const handleAlertAction = useCallback(
    (alertId: string, actionId: string) => {
      switch (actionId) {
        case 'dismiss':
          updateAlertAction(alertId, 'dismissed');
          removeSafetyAlert(alertId);
          break;
        case 'report_threat':
          updateAlertAction(alertId, 'reported');
          // TODO: 实现举报逻辑
          break;
        case 'block':
          updateAlertAction(alertId, 'blocked');
          removeSafetyAlert(alertId);
          break;
        case 'proceed':
          updateAlertAction(alertId, 'proceeded');
          removeSafetyAlert(alertId);
          break;
        default:
          break;
      }
    },
    [updateAlertAction, removeSafetyAlert]
  );

  // 计算统计信息
  const stats = useMemo(() => {
    const highRisk = safetyAlerts.filter(
      (a) => a.result.riskLevel === 'high' || a.result.riskLevel === 'critical'
    ).length;
    const mediumRisk = safetyAlerts.filter(
      (a) => a.result.riskLevel === 'medium'
    ).length;
    const lowRisk = safetyAlerts.filter(
      (a) => a.result.riskLevel === 'low'
    ).length;

    return {
      total: safetyAlerts.length,
      highRisk,
      mediumRisk,
      lowRisk,
      historyCount: safetyHistory.length,
    };
  }, [safetyAlerts, safetyHistory]);

  return {
    // State
    alerts: safetyAlerts,
    history: safetyHistory,
    enabled: safetyEnabled,
    autoCheckUrls,
    autoCheckClipboard,
    showPanel: showSafetyPanel,
    lastResult: lastCheckResult,
    stats,

    // Actions
    checkSafety,
    checkUrl,
    checkText,
    checkEmail,
    handleAlertAction,
    setEnabled: setSafetyEnabled,
    setAutoCheckUrls,
    setAutoCheckClipboard,
    setShowPanel: setShowSafetyPanel,
    clearAlerts: clearSafetyAlerts,
    clearHistory,
    getHighRiskAlerts,
  };
}

export default useSafety;
