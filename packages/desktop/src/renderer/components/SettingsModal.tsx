import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfig } from '../stores/hooks/useConfig';
import { useHawkeyeStore } from '../stores';

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

export const SettingsModal: React.FC = () => {
  const { t } = useTranslation();
  const { config, tempConfig, updateTempConfig, saveConfig } = useConfig();
  const setShowSettings = useHawkeyeStore((s) => s.setShowSettings);

  const handleSave = async () => {
    await saveConfig();
    setShowSettings(false);
  };

  const handleClose = () => {
    // Reset temp config to current config
    if (config) {
      // We might need a reset action, but for now just close
      // ideally we should revert changes if cancelled
    }
    setShowSettings(false);
  };

  if (!config) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        variants={overlayVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={handleClose}
      />
      <motion.div
        className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        variants={modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <span className="text-2xl">⚙️</span>
            {t('settings.title', 'Settings')}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500"
          >
            ✕
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* General */}
          <section className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
              {t('settings.general', 'General')}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.autoUpdate', 'Auto Update')}
                  </label>
                  <p className="text-xs text-gray-500">Automatically check and download updates</p>
                </div>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={tempConfig.autoUpdate ?? config.autoUpdate}
                  onChange={(e) => updateTempConfig({ autoUpdate: e.target.checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.localOnly', 'Local Only Mode')}
                  </label>
                  <p className="text-xs text-gray-500">Disable all cloud services</p>
                </div>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={tempConfig.localOnly ?? config.localOnly}
                  onChange={(e) => updateTempConfig({ localOnly: e.target.checked })}
                />
              </div>
            </div>
          </section>

          {/* AI Providers */}
          <section className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
              AI Providers
            </h3>

            {/* Provider Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Active Provider
              </label>
              <select
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                value={tempConfig.aiProvider ?? config.aiProvider}
                onChange={(e) => updateTempConfig({ aiProvider: e.target.value as any })}
                disabled={tempConfig.localOnly ?? config.localOnly}
              >
                <option value="ollama">Ollama (Local)</option>
                <option value="openai">OpenAI Compatible</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>

            {/* OpenAI / Antigravity */}
            {(tempConfig.aiProvider === 'openai' || !tempConfig.aiProvider) && (
              <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">OpenAI Configuration</h4>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">Base URL</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                    placeholder="https://api.openai.com/v1"
                    value={tempConfig.openaiBaseUrl ?? config.openaiBaseUrl}
                    onChange={(e) => updateTempConfig({ openaiBaseUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">API Key</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                    placeholder="sk-..."
                    value={tempConfig.openaiApiKey ?? config.openaiApiKey}
                    onChange={(e) => updateTempConfig({ openaiApiKey: e.target.value })}
                  />
                </div>
                 <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">Model</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                    placeholder="gpt-4-turbo"
                    value={tempConfig.openaiModel ?? config.openaiModel}
                    onChange={(e) => updateTempConfig({ openaiModel: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* Ollama */}
            {tempConfig.aiProvider === 'ollama' && (
              <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ollama Configuration</h4>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">Host</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                    placeholder="http://localhost:11434"
                    value={tempConfig.ollamaHost ?? config.ollamaHost}
                    onChange={(e) => updateTempConfig({ ollamaHost: e.target.value })}
                  />
                </div>
                 <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">Model</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                    placeholder="qwen2.5vl:7b"
                    value={tempConfig.ollamaModel ?? config.ollamaModel}
                    onChange={(e) => updateTempConfig({ ollamaModel: e.target.value })}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Skills & Integrations */}
          <section className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
              Skills & Integrations
            </h3>

            {/* Web Search */}
            <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                 <span className="text-xl">🌐</span>
                 <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Web Search (Tavily)</h4>
              </div>
              <p className="text-xs text-gray-500">Enable real-time internet access for the agent.</p>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500">Tavily API Key</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                  placeholder="tvly-..."
                  value={tempConfig.tavilyApiKey ?? config.tavilyApiKey ?? ''}
                  onChange={(e) => updateTempConfig({ tavilyApiKey: e.target.value })}
                />
                <p className="text-xs text-gray-400">
                  Get your free key at <a href="https://tavily.com" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">tavily.com</a>
                </p>
              </div>
            </div>

            {/* Smart Observe */}
             <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <span className="text-xl">👁️</span>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Smart Observe</h4>
                 </div>
                 <input
                  type="checkbox"
                  className="toggle"
                  checked={tempConfig.smartObserve ?? config.smartObserve}
                  onChange={(e) => updateTempConfig({ smartObserve: e.target.checked })}
                />
              </div>
              <p className="text-xs text-gray-500">Automatically detect screen changes and update context.</p>

              {(tempConfig.smartObserve ?? config.smartObserve) && (
                 <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500">Interval (ms)</label>
                      <input
                        type="number"
                        className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                        value={tempConfig.smartObserveInterval ?? config.smartObserveInterval}
                        onChange={(e) => updateTempConfig({ smartObserveInterval: parseInt(e.target.value) })}
                      />
                    </div>
                     <div className="space-y-1">
                      <label className="text-xs text-gray-500">Threshold (0-1)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                        value={tempConfig.smartObserveThreshold ?? config.smartObserveThreshold}
                        onChange={(e) => updateTempConfig({ smartObserveThreshold: parseFloat(e.target.value) })}
                      />
                    </div>
                 </div>
              )}
            </div>

          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            {t('common.save', 'Save Changes')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
