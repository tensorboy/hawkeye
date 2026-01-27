import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfig } from '../stores/hooks/useConfig';
import { useHawkeyeStore } from '../stores';

// Types for local model management
interface LocalModel {
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  modifiedAt: Date;
  quantization?: string;
}

interface RecommendedModel {
  id: string;
  name: string;
  description: string;
  type: 'text' | 'vision';
  size: string;
  quantization: string;
  fileName: string;
}

interface ModelDownloadProgress {
  modelId: string;
  fileName: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  status: 'downloading' | 'completed' | 'error' | 'cancelled';
  error?: string;
}

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

  // Local model management state
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [recommendedModels, setRecommendedModels] = useState<RecommendedModel[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showModelDownloader, setShowModelDownloader] = useState(false);

  // Load local models and recommended models
  useEffect(() => {
    const loadModels = async () => {
      try {
        const models = await window.hawkeye.modelList();
        setLocalModels(models);
        const recommended = await window.hawkeye.modelGetRecommended();
        setRecommendedModels(recommended);
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    };
    loadModels();

    // Listen for download progress
    const handleProgress = (progress: ModelDownloadProgress) => {
      setDownloadProgress(progress);
      if (progress.status === 'completed') {
        // Refresh model list
        loadModels();
        setTimeout(() => setDownloadProgress(null), 2000);
      } else if (progress.status === 'error' || progress.status === 'cancelled') {
        setTimeout(() => setDownloadProgress(null), 3000);
      }
    };

    // Register listener and get cleanup function
    const cleanup = window.hawkeye.onModelDownloadProgress(handleProgress);

    // Return cleanup function to remove listener on unmount
    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, []);

  // Handle model download
  const handleDownloadModel = async (model: RecommendedModel) => {
    try {
      await window.hawkeye.modelDownloadHF(model.id, model.fileName);
    } catch (error) {
      console.error('Failed to start download:', error);
    }
  };

  // Handle model deletion
  const handleDeleteModel = async (modelPath: string) => {
    if (!confirm(t('settings.confirmDeleteModel', 'Are you sure you want to delete this model?'))) {
      return;
    }
    try {
      await window.hawkeye.modelDelete(modelPath);
      const models = await window.hawkeye.modelList();
      setLocalModels(models);
    } catch (error) {
      console.error('Failed to delete model:', error);
    }
  };

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
                {t('settings.activeProvider', 'Active Provider')}
              </label>
              <select
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                value={tempConfig.aiProvider ?? config.aiProvider}
                onChange={(e) => updateTempConfig({ aiProvider: e.target.value as any })}
                disabled={tempConfig.localOnly ?? config.localOnly}
              >
                <option value="llama-cpp">{t('settings.localModel', 'Local Model (Built-in)')}</option>
                <option value="openai">{t('settings.openaiCompatible', 'OpenAI Compatible')}</option>
                <option value="gemini">{t('settings.googleGemini', 'Google Gemini')}</option>
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

            {/* Local Model (llama-cpp) */}
            {(tempConfig.aiProvider === 'llama-cpp' || (tempConfig.localOnly ?? config.localOnly)) && (
              <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🤖</span>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {t('settings.localModelConfig', 'Local Model Configuration')}
                    </h4>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                    {t('settings.offline', 'Offline')}
                  </span>
                </div>

                {/* Model Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">{t('settings.selectedModel', 'Selected Model')}</label>
                  {localModels.length > 0 ? (
                    <select
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                      value={tempConfig.llamaCppModelPath ?? config.llamaCppModelPath ?? ''}
                      onChange={(e) => updateTempConfig({ llamaCppModelPath: e.target.value })}
                    >
                      <option value="">{t('settings.selectModel', '-- Select a model --')}</option>
                      {localModels.map((model) => (
                        <option key={model.path} value={model.path}>
                          {model.name} ({model.sizeFormatted})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm text-gray-500 py-2">
                      {t('settings.noModelsDownloaded', 'No models downloaded. Download a model below.')}
                    </div>
                  )}
                </div>

                {/* Downloaded Models List */}
                {localModels.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500">{t('settings.downloadedModels', 'Downloaded Models')}</label>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {localModels.map((model) => (
                        <div
                          key={model.path}
                          className="flex items-center justify-between p-2 bg-white dark:bg-gray-700 rounded text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{model.name}</span>
                            {model.quantization && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                {model.quantization}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">{model.sizeFormatted}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteModel(model.path)}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"
                            title={t('settings.deleteModel', 'Delete model')}
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Download Progress */}
                {downloadProgress && downloadProgress.status === 'downloading' && (
                  <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{t('settings.downloading', 'Downloading')} {downloadProgress.fileName}</span>
                      <span>{downloadProgress.progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${downloadProgress.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {downloadProgress && downloadProgress.status === 'completed' && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm text-green-700 dark:text-green-400">
                    ✓ {t('settings.downloadComplete', 'Download completed!')}
                  </div>
                )}

                {downloadProgress && downloadProgress.status === 'error' && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-400">
                    ✕ {downloadProgress.error || t('settings.downloadFailed', 'Download failed')}
                  </div>
                )}

                {/* Download Models Button */}
                <button
                  onClick={() => setShowModelDownloader(!showModelDownloader)}
                  className="w-full py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  {showModelDownloader ? t('settings.hideRecommended', '▲ Hide Recommended Models') : t('settings.downloadModels', '▼ Download Recommended Models')}
                </button>

                {/* Recommended Models List */}
                <AnimatePresence>
                  {showModelDownloader && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 overflow-hidden"
                    >
                      {recommendedModels.map((model) => (
                        <div
                          key={model.id}
                          className="flex items-center justify-between p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{model.name}</span>
                              <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 rounded">
                                {model.type === 'vision' ? '👁️ Vision' : '📝 Text'}
                              </span>
                              <span className="text-xs text-gray-400">{model.size}</span>
                            </div>
                            <p className="text-xs text-gray-500">{model.description}</p>
                          </div>
                          <button
                            onClick={() => handleDownloadModel(model)}
                            disabled={downloadProgress?.status === 'downloading'}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
                          >
                            {t('settings.download', 'Download')}
                          </button>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Advanced Settings Toggle */}
                <button
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {showAdvancedSettings ? '▲ ' : '▼ '}{t('settings.advancedSettings', 'Advanced Settings')}
                </button>

                {/* Advanced Settings */}
                <AnimatePresence>
                  {showAdvancedSettings && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500">{t('settings.contextSize', 'Context Size')}</label>
                          <input
                            type="number"
                            className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                            placeholder="4096"
                            value={tempConfig.llamaCppContextSize ?? config.llamaCppContextSize ?? 4096}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val)) updateTempConfig({ llamaCppContextSize: val });
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500">{t('settings.gpuLayers', 'GPU Layers')}</label>
                          <input
                            type="number"
                            className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                            placeholder="-1 (all)"
                            value={tempConfig.llamaCppGpuLayers ?? config.llamaCppGpuLayers ?? -1}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val)) updateTempConfig({ llamaCppGpuLayers: val });
                            }}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500">{t('settings.gpuAcceleration', 'GPU Acceleration')}</label>
                        <select
                          className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                          value={tempConfig.llamaCppGpuAcceleration ?? config.llamaCppGpuAcceleration ?? 'auto'}
                          onChange={(e) => updateTempConfig({ llamaCppGpuAcceleration: e.target.value as any })}
                        >
                          <option value="auto">{t('settings.gpuAuto', 'Auto Detect')}</option>
                          <option value="metal">{t('settings.gpuMetal', 'Metal (macOS)')}</option>
                          <option value="cuda">{t('settings.gpuCuda', 'CUDA (NVIDIA)')}</option>
                          <option value="disabled">{t('settings.gpuDisabled', 'Disabled (CPU Only)')}</option>
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val > 0) updateTempConfig({ smartObserveInterval: val });
                        }}
                      />
                    </div>
                     <div className="space-y-1">
                      <label className="text-xs text-gray-500">Threshold (0-1)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md"
                        value={tempConfig.smartObserveThreshold ?? config.smartObserveThreshold}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= 0 && val <= 1) updateTempConfig({ smartObserveThreshold: val });
                        }}
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
