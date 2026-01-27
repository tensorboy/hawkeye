/**
 * Settings Page - AI provider config, language, and system status
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { languages } from '../i18n';
import { useHawkeyeStore } from '../stores';
import type { A2UICard } from '@hawkeye/core';

const generateId = () => `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const modalVariants = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
};

const springTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

const smoothTransition = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1] as const,
};

export function SettingsPage() {
  const { t, i18n } = useTranslation();

  const {
    config, setConfig,
    tempConfig, updateTempConfig,
    status,
    showModelSelector, setShowModelSelector,
    setShowSettings,
    addCard,
  } = useHawkeyeStore();

  const addErrorCard = (message: string) => {
    const card: A2UICard = {
      id: generateId(),
      type: 'error',
      title: '发生错误',
      description: message,
      icon: 'error',
      retryable: false,
      timestamp: Date.now(),
      actions: [{ id: 'dismiss', label: '关闭', type: 'dismiss' }],
    };
    addCard(card);
  };

  const handleSaveConfig = async () => {
    try {
      const newConfig = await window.hawkeye.saveConfig(tempConfig);
      setConfig(newConfig);
      setShowSettings(false);
    } catch (err) {
      addErrorCard((err as Error).message);
    }
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    i18n.changeLanguage(e.target.value);
  };

  const getCurrentModelInfo = () => {
    if (config?.localOnly || config?.aiProvider === 'llama-cpp') {
      return {
        name: 'llama-cpp',
        type: 'local',
        icon: '💻',
        label: t('settings.local', '本地'),
      };
    } else if (config?.aiProvider === 'gemini') {
      return {
        name: config?.geminiModel || 'gemini-2.0-flash-exp',
        type: 'cloud',
        icon: '☁️',
        label: t('settings.cloud', '云端'),
      };
    } else if (config?.aiProvider === 'openai') {
      return {
        name: config?.openaiModel || 'gpt-4',
        type: 'cloud',
        icon: '☁️',
        label: t('settings.cloud', '云端'),
      };
    }
    return { name: '未配置', type: 'unknown', icon: '❓', label: '未知' };
  };

  const currentModel = getCurrentModelInfo();

  return (
    <div className="container settings">
      <header className="header">
        <h2>⚙️ {t('settings.title')}</h2>
      </header>

      <div className="content settings-content">
        {/* Current model banner */}
        <div className="current-model-banner">
          <div className="current-model-info">
            <span className="current-model-icon">{currentModel.icon}</span>
            <div className="current-model-details">
              <span className="current-model-label">{t('settings.currentModel', '当前模型')}</span>
              <span className="current-model-name">{currentModel.name}</span>
            </div>
          </div>
          <div className="current-model-actions">
            <span className={`current-model-badge ${currentModel.type}`}>
              {currentModel.label}
            </span>
            <button
              className="model-switch-btn"
              onClick={() => setShowModelSelector(true)}
              title={t('settings.switchModel', '切换模型')}
            >
              🔄
              <span className="switch-label">{t('settings.switchModel', '切换')}</span>
            </button>
          </div>

          {/* Model selector popup */}
          <AnimatePresence>
            {showModelSelector && (
              <motion.div
                className="model-selector-overlay"
                onClick={() => setShowModelSelector(false)}
                variants={overlayVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={smoothTransition}
              >
                <motion.div
                  className="model-selector-popup unified"
                  onClick={(e) => e.stopPropagation()}
                  variants={modalVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={springTransition}
                >
                  <div className="model-selector-header">
                    <h3>{t('settings.modelSwitcher', '模型切换器')}</h3>
                    <motion.button
                      className="close-btn"
                      onClick={() => setShowModelSelector(false)}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      ×
                    </motion.button>
                  </div>

                  {/* Local / Cloud tabs */}
                  <div className="provider-tabs">
                    <button
                      className={`provider-tab ${tempConfig.localOnly ? 'active' : ''}`}
                      onClick={() => updateTempConfig({ aiProvider: 'llama-cpp', localOnly: true })}
                    >
                      💻 {t('settings.local', '本地')}
                    </button>
                    <button
                      className={`provider-tab ${!tempConfig.localOnly ? 'active' : ''}`}
                      onClick={() => updateTempConfig({ localOnly: false })}
                    >
                      ☁️ {t('settings.cloud', '云端')}
                    </button>
                  </div>

                  {/* Provider config */}
                  <div className="provider-config">
                    {tempConfig.localOnly && (
                      <div className="config-section llama-cpp-config">
                        <div className="config-hint">
                          💡 {t('settings.llamaCppHint', 'LlamaCpp local inference mode')}
                        </div>
                      </div>
                    )}

                    {!tempConfig.localOnly && (
                      <div className="config-section cloud-config">
                        <div className="config-field">
                          <label>{t('settings.cloudProvider', '云服务商')}</label>
                          <div className="provider-selector">
                            <button
                              type="button"
                              className={`provider-btn ${tempConfig.aiProvider === 'gemini' ? 'active' : ''}`}
                              onClick={() => updateTempConfig({ aiProvider: 'gemini' })}
                            >
                              ✨ Gemini
                            </button>
                            <button
                              type="button"
                              className={`provider-btn ${tempConfig.aiProvider === 'openai' ? 'active' : ''}`}
                              onClick={() => updateTempConfig({ aiProvider: 'openai' })}
                            >
                              🤖 OpenAI 兼容
                            </button>
                          </div>
                        </div>

                        {/* Gemini config */}
                        {tempConfig.aiProvider === 'gemini' && (
                          <>
                            <div className="config-field">
                              <label>API Key</label>
                              <input
                                type="password"
                                value={tempConfig.geminiApiKey || ''}
                                onChange={(e) => updateTempConfig({ geminiApiKey: e.target.value })}
                                placeholder="AIza..."
                              />
                              <small>
                                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                                  🔗 {t('settings.getApiKey', '获取 API Key')}
                                </a>
                              </small>
                            </div>
                            <div className="config-field">
                              <label>API 地址 <small>(可选)</small></label>
                              <input
                                type="text"
                                value={tempConfig.geminiBaseUrl || ''}
                                onChange={(e) => updateTempConfig({ geminiBaseUrl: e.target.value })}
                                placeholder="https://generativelanguage.googleapis.com"
                              />
                            </div>
                            <div className="config-field">
                              <label>{t('settings.model', '模型')}</label>
                              <select
                                value={tempConfig.geminiModel || 'gemini-2.5-flash-preview-05-20'}
                                onChange={(e) => updateTempConfig({ geminiModel: e.target.value })}
                              >
                                <optgroup label="Gemini 2.5 (最新)">
                                  <option value="gemini-2.5-flash-preview-05-20">gemini-2.5-flash-preview (推荐)</option>
                                  <option value="gemini-2.5-pro-preview-05-06">gemini-2.5-pro-preview</option>
                                </optgroup>
                                <optgroup label="Gemini 2.0">
                                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                                  <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite</option>
                                  <option value="gemini-2.0-flash-thinking-exp">gemini-2.0-flash-thinking</option>
                                </optgroup>
                                <optgroup label="Gemini 1.5">
                                  <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                                  <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                                </optgroup>
                              </select>
                            </div>
                            <div className="config-hint">
                              💡 使用 Google 官方 Gemini API（原生格式）
                            </div>
                          </>
                        )}

                        {/* OpenAI config */}
                        {tempConfig.aiProvider === 'openai' && (
                          <>
                            <div className="config-field">
                              <label>API Key</label>
                              <input
                                type="password"
                                value={tempConfig.openaiApiKey || ''}
                                onChange={(e) => updateTempConfig({ openaiApiKey: e.target.value })}
                                placeholder="sk-..."
                              />
                            </div>
                            <div className="config-field">
                              <label>API 地址</label>
                              <input
                                type="text"
                                value={tempConfig.openaiBaseUrl || ''}
                                onChange={(e) => updateTempConfig({ openaiBaseUrl: e.target.value })}
                                placeholder="https://api.openai.com/v1"
                              />
                              <small>支持 OpenAI、Antigravity、各种代理等兼容 API</small>
                            </div>
                            <div className="config-field">
                              <label>{t('settings.model', '模型')}</label>
                              <select
                                value={tempConfig.openaiModel || 'gemini-3-flash-preview'}
                                onChange={(e) => updateTempConfig({ openaiModel: e.target.value })}
                              >
                                <optgroup label="Gemini 3 (最新 2025)">
                                  <option value="gemini-3-flash-preview">gemini-3-flash (推荐, $0.5/M)</option>
                                  <option value="gemini-3-pro-preview">gemini-3-pro ($2-4/M)</option>
                                  <option value="gemini-3-pro-high">gemini-3-pro-high</option>
                                </optgroup>
                                <optgroup label="Gemini 2.5">
                                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                                  <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                                  <option value="gemini-2.5-flash-thinking">gemini-2.5-flash-thinking</option>
                                </optgroup>
                                <optgroup label="Claude">
                                  <option value="claude-opus-4-5">claude-opus-4.5</option>
                                  <option value="claude-sonnet-4-5">claude-sonnet-4.5</option>
                                  <option value="claude-haiku-4-5">claude-haiku-4.5</option>
                                </optgroup>
                                <optgroup label="GPT">
                                  <option value="gpt-4o">gpt-4o</option>
                                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                                </optgroup>
                              </select>
                            </div>
                            <div className="config-hint">
                              💡 OpenAI 兼容格式，支持各种第三方 API
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="model-selector-footer">
                    <motion.button
                      className="btn btn-secondary"
                      onClick={() => setShowModelSelector(false)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {t('common.cancel', '取消')}
                    </motion.button>
                    <motion.button
                      className="btn btn-primary"
                      onClick={() => {
                        handleSaveConfig();
                        setShowModelSelector(false);
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      ✅ {t('settings.saveAndApply', '保存并应用')}
                    </motion.button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Language */}
        <div className="form-group">
          <label>{t('settings.language.label')}</label>
          <select value={i18n.language} onChange={handleLanguageChange}>
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName}
              </option>
            ))}
          </select>
        </div>

        {/* Auto update */}
        <div className="form-group checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={tempConfig.autoUpdate !== false}
              onChange={(e) => updateTempConfig({ autoUpdate: e.target.checked })}
            />
            <span>{t('settings.autoUpdate')}</span>
          </label>
          <small className="form-hint">{t('settings.autoUpdateDesc')}</small>
        </div>

        {/* Status */}
        {status && (
          <div className="status-info">
            {tempConfig.localOnly && (
              <p className="local-only-badge">🔒 {t('settings.localOnlyActive', '完全本地模式已启用')}</p>
            )}
            <p>AI: {status.aiReady ? `✅ ${status.aiProvider}` : '❌ 未就绪'}</p>
            <p>同步: {status.syncRunning ? `✅ 端口 ${status.syncPort}` : '❌ 未运行'}</p>
            <p>连接: {status.connectedClients} 个客户端</p>
          </div>
        )}
      </div>

      <div className="footer-actions">
        <button className="btn btn-primary" onClick={handleSaveConfig}>
          {t('settings.save')}
        </button>
        {config && (
          <button className="btn" onClick={() => setShowSettings(false)}>
            {t('settings.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
