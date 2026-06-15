/**
 * Onboarding Page - First-time setup flow
 * Allows users to choose between local and cloud AI modes
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useHawkeyeStore } from '../stores';
import type { A2UICard } from '@hawkeye/core';
import logoIcon from '../assets/icon.png';

const generateId = () => `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const recommendedModels = [
  { name: 'qwen3-vl:2b', size: '~1.9GB', recommended: true, desc: '' },
  { name: 'qwen2.5vl:3b', size: '~3.2GB', recommended: false, desc: '' },
  { name: 'llava:7b', size: '~4.1GB', recommended: false, desc: '' },
];

export function OnboardingPage() {
  const { t } = useTranslation();

  const {
    config, setConfig,
    tempConfig, setTempConfig, updateTempConfig,
    modelTestResult, setModelTestResult,
    onboardingLoading, setOnboardingLoading,
    selectedOnboardingModel, setSelectedOnboardingModel,
    onboardingError, setOnboardingError,
    onboardingMode, setOnboardingMode,
    installedModels,
    modelPullProgress,
    modelTesting, setModelTesting,
    setShowOnboarding,
    addCard,
  } = useHawkeyeStore();

  // Populate model descriptions with translations
  const models = recommendedModels.map((m) => ({
    ...m,
    desc: m.recommended ? t('settings.bestBalance') : m.name === 'qwen2.5vl:3b' ? '高质量' : '通用视觉',
  }));

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

  const handleChooseLocal = () => {
    setOnboardingMode('local');
    setOnboardingLoading(false);
    setOnboardingError(null);
  };

  const handleChooseCloud = () => {
    setOnboardingMode('cloud');
  };

  const handleOnboardingComplete = async (modelName?: string) => {
    try {
      const configUpdate = {
        ...tempConfig,
        onboardingCompleted: true,
        ...(modelName ? { aiProvider: 'llama-cpp' as const } : {}),
      };
      const newConfig = await window.hawkeye.saveConfig(configUpdate);
      setConfig(newConfig);
      setTempConfig(newConfig);
    } catch (err) {
      addErrorCard((err as Error).message);
    }
    setShowOnboarding(false);
    setOnboardingError(null);
  };

  const testModelConnection = async (): Promise<boolean> => {
    setModelTesting(true);
    setModelTestResult(null);
    try {
      await window.hawkeye.saveConfig(tempConfig);
      const response = await window.hawkeye.chat([
        { role: 'user', content: 'Say "OK" if you can read this.' },
      ]);
      if (response && response.length > 0) {
        setModelTestResult({ success: true });
        return true;
      } else {
        setModelTestResult({ success: false, error: 'Empty response from model' });
        return false;
      }
    } catch (err) {
      setModelTestResult({ success: false, error: (err as Error).message });
      return false;
    } finally {
      setModelTesting(false);
    }
  };

  return (
    <div className="container onboarding">
      <div className="onboarding-content">
        <div className="onboarding-header">
          <img src={logoIcon} alt="Shadow" className="onboarding-icon" />
          <h1>{t('onboarding.title', '欢迎使用 Shadow')}</h1>
          <p>
            {onboardingMode === 'choose'
              ? t('onboarding.chooseMode', '请选择 AI 运行方式')
              : t('onboarding.subtitle', '请选择一个 AI 模型来开始')}
          </p>
        </div>

        {/* Mode selection */}
        {onboardingMode === 'choose' && (
          <div className="onboarding-mode-choice">
            <div className="mode-card" onClick={handleChooseLocal}>
              <div className="mode-icon">💻</div>
              <div className="mode-content">
                <h3>{t('onboarding.localMode', '本地模式')}</h3>
                <p>{t('onboarding.localModeDesc', '下载 AI 模型到本地运行，完全离线，隐私安全')}</p>
                <ul className="mode-features">
                  <li>✓ {t('onboarding.localFeature1', '完全离线运行')}</li>
                  <li>✓ {t('onboarding.localFeature2', '数据不离开本机')}</li>
                  <li>✓ {t('onboarding.localFeature3', '需要下载模型 (~1-5GB)')}</li>
                </ul>
              </div>
              <span className="mode-badge recommended">{t('onboarding.recommended', '推荐')}</span>
            </div>

            <div className="mode-card" onClick={handleChooseCloud}>
              <div className="mode-icon">☁️</div>
              <div className="mode-content">
                <h3>{t('onboarding.cloudMode', '云端模式')}</h3>
                <p>{t('onboarding.cloudModeDesc', '使用云端 API，无需下载，即开即用')}</p>
                <ul className="mode-features">
                  <li>✓ {t('onboarding.cloudFeature1', '无需下载模型')}</li>
                  <li>✓ {t('onboarding.cloudFeature2', '更强大的模型能力')}</li>
                  <li>✓ {t('onboarding.cloudFeature3', '需要 API 密钥')}</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Cloud mode config */}
        {onboardingMode === 'cloud' && (
          <div className="onboarding-cloud-config">
            <div className="cloud-provider-options">
              <h3>{t('onboarding.selectProvider', '选择 AI 服务商')}</h3>
              <div className="provider-grid">
                <div
                  className={`provider-card ${tempConfig.aiProvider === 'openai' ? 'selected' : ''}`}
                  onClick={() => updateTempConfig({ aiProvider: 'openai' })}
                >
                  <span className="provider-name">OpenAI Compatible</span>
                  <span className="provider-desc">{t('onboarding.openaiDesc', '支持 OpenAI、Claude 等')}</span>
                </div>
                <div
                  className={`provider-card ${tempConfig.aiProvider === 'gemini' ? 'selected' : ''}`}
                  onClick={() => updateTempConfig({ aiProvider: 'gemini' })}
                >
                  <span className="provider-name">Google Gemini</span>
                  <span className="provider-desc">{t('onboarding.geminiDesc', '免费额度，功能强大')}</span>
                </div>
              </div>

              {tempConfig.aiProvider === 'openai' && (
                <div className="api-config">
                  <div className="form-group">
                    <label>{t('settings.apiKey.label', 'API 密钥')}</label>
                    <input
                      type="password"
                      value={tempConfig.openaiApiKey || ''}
                      onChange={(e) => updateTempConfig({ openaiApiKey: e.target.value })}
                      placeholder={t('settings.apiKey.placeholder', 'sk-...')}
                    />
                  </div>
                  <div className="form-group">
                    <label>Base URL ({t('settings.optional', '可选')})</label>
                    <input
                      type="text"
                      value={tempConfig.openaiBaseUrl || ''}
                      onChange={(e) => updateTempConfig({ openaiBaseUrl: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                </div>
              )}

              {tempConfig.aiProvider === 'gemini' && (
                <div className="api-config">
                  <div className="form-group">
                    <label>{t('settings.geminiApiKey', 'Gemini API 密钥')}</label>
                    <input
                      type="password"
                      value={tempConfig.geminiApiKey || ''}
                      onChange={(e) => updateTempConfig({ geminiApiKey: e.target.value })}
                      placeholder="AIza..."
                    />
                    <small>
                      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                        {t('settings.getApiKey', '获取 API 密钥')}
                      </a>
                    </small>
                  </div>
                </div>
              )}
            </div>

            <div className="onboarding-footer">
              {modelTestResult && (
                <div className={`model-test-result ${modelTestResult.success ? 'success' : 'error'}`}>
                  {modelTestResult.success ? (
                    <span>✅ {t('onboarding.testSuccess', '连接成功！')}</span>
                  ) : (
                    <span>❌ {t('onboarding.testFailed', '连接失败')}: {modelTestResult.error}</span>
                  )}
                </div>
              )}

              <button
                className="btn btn-primary"
                disabled={
                  modelTesting ||
                  (tempConfig.aiProvider === 'openai' && !tempConfig.openaiApiKey) ||
                  (tempConfig.aiProvider === 'gemini' && !tempConfig.geminiApiKey)
                }
                onClick={async () => {
                  const success = await testModelConnection();
                  if (success) {
                    try {
                      const newConfig = await window.hawkeye.saveConfig({
                        ...tempConfig,
                        onboardingCompleted: true,
                      });
                      setConfig(newConfig);
                      setShowOnboarding(false);
                    } catch (err) {
                      addErrorCard((err as Error).message);
                    }
                  }
                }}
              >
                {modelTesting ? (
                  <>{t('onboarding.testing', '测试连接中...')}</>
                ) : modelTestResult?.success ? (
                  <>{t('onboarding.continue', '继续')} →</>
                ) : (
                  <>{t('onboarding.testAndContinue', '测试连接并继续')} →</>
                )}
              </button>
              <button className="btn btn-text" onClick={() => setOnboardingMode('choose')}>
                ← {t('app.back', '返回')}
              </button>
            </div>
          </div>
        )}

        {/* Local mode - loading */}
        {onboardingMode === 'local' && onboardingLoading && (
          <div className="onboarding-loading">
            <div className="spinner"></div>
            <p>{t('onboarding.checkingModels', '正在检查可用模型...')}</p>
          </div>
        )}

        {/* Local mode - model selection */}
        {onboardingMode === 'local' && !onboardingLoading && !onboardingError && (
          <>
            {installedModels.length > 0 && (
              <div className="onboarding-section">
                <h3>{t('onboarding.installedModels', '已安装模型')}</h3>
                <div className="model-grid">
                  {installedModels.map((model) => (
                    <div
                      key={model.name}
                      className={`model-card ${selectedOnboardingModel === model.name ? 'selected' : ''}`}
                      onClick={() => setSelectedOnboardingModel(model.name)}
                    >
                      <div className="model-card-header">
                        <span className="model-name">{model.name}</span>
                        {selectedOnboardingModel === model.name && <span className="check-icon">✓</span>}
                      </div>
                      <div className="model-card-info">
                        <span className="model-size">{model.size}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="onboarding-section">
              <h3>
                {installedModels.length > 0
                  ? t('onboarding.selectOrDownload', '选择已安装的模型或下载新模型')
                  : t('onboarding.downloadFirst', '请先下载模型')}
              </h3>
              <div className="model-grid">
                {models.map((model) => {
                  const isInstalled = installedModels.some((m) => m.name === model.name);
                  const isDownloading =
                    modelPullProgress?.isDownloading && modelPullProgress.model === model.name;

                  return (
                    <div
                      key={model.name}
                      className={`model-card downloadable ${isInstalled ? 'installed' : ''} ${isDownloading ? 'downloading' : ''}`}
                    >
                      <div className="model-card-header">
                        <span className="model-name">{model.name}</span>
                        {model.recommended && (
                          <span className="recommended-badge">{t('onboarding.recommended', '推荐')}</span>
                        )}
                      </div>
                      <div className="model-card-info">
                        <span className="model-size">{model.size}</span>
                        <span className="model-desc">{model.desc}</span>
                      </div>
                      {isDownloading ? (
                        <div className="model-download-progress-inline">
                          <div className="progress-bar">
                            <div
                              className="progress-fill"
                              style={{ width: `${modelPullProgress?.progress || 0}%` }}
                            />
                          </div>
                          <span>{modelPullProgress?.progress || 0}%</span>
                        </div>
                      ) : isInstalled ? (
                        <button
                          className="btn btn-small btn-selected"
                          onClick={() => setSelectedOnboardingModel(model.name)}
                        >
                          ✓ {selectedOnboardingModel === model.name ? '已选择' : '选择'}
                        </button>
                      ) : (
                        <button
                          className="btn btn-small btn-download"
                          onClick={() => setSelectedOnboardingModel(model.name)}
                          disabled={modelPullProgress?.isDownloading}
                        >
                          ⬇️ {t('settings.download', '下载')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="onboarding-footer">
              {modelTestResult && (
                <div className={`model-test-result ${modelTestResult.success ? 'success' : 'error'}`}>
                  {modelTestResult.success ? (
                    <span>✅ {t('onboarding.testSuccess', '连接成功！')}</span>
                  ) : (
                    <span>❌ {t('onboarding.testFailed', '连接失败')}: {modelTestResult.error}</span>
                  )}
                </div>
              )}

              <button
                className="btn btn-primary"
                disabled={!selectedOnboardingModel || modelTesting}
                onClick={async () => {
                  const localConfig = {
                    ...tempConfig,
                    aiProvider: 'llama-cpp' as const,
                  };
                  setTempConfig(localConfig);

                  setModelTesting(true);
                  setModelTestResult(null);
                  try {
                    await window.hawkeye.saveConfig(localConfig);
                    const response = await window.hawkeye.chat([
                      { role: 'user', content: 'Say "OK" if you can read this.' },
                    ]);
                    if (response && response.length > 0) {
                      setModelTestResult({ success: true });
                      handleOnboardingComplete(selectedOnboardingModel);
                    } else {
                      setModelTestResult({ success: false, error: 'Empty response' });
                    }
                  } catch (err) {
                    setModelTestResult({ success: false, error: (err as Error).message });
                  } finally {
                    setModelTesting(false);
                  }
                }}
              >
                {modelTesting ? (
                  <>{t('onboarding.testing', '测试连接中...')}</>
                ) : modelTestResult?.success ? (
                  <>{t('onboarding.continue', '继续')} →</>
                ) : (
                  <>{t('onboarding.testAndContinue', '测试连接并继续')} →</>
                )}
              </button>
              <button className="btn btn-text" onClick={() => setOnboardingMode('choose')}>
                ← {t('app.back', '返回')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
