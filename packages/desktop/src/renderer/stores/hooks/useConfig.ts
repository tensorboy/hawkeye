import { useEffect, useCallback } from 'react';
import { useHawkeyeStore } from '../index';

export function useConfig() {
  const config = useHawkeyeStore((s) => s.config);
  const tempConfig = useHawkeyeStore((s) => s.tempConfig);
  const ollamaStatus = useHawkeyeStore((s) => s.ollamaStatus);
  const installedModels = useHawkeyeStore((s) => s.installedModels);
  const modelPullProgress = useHawkeyeStore((s) => s.modelPullProgress);
  const modelTestResult = useHawkeyeStore((s) => s.modelTestResult);
  const modelTesting = useHawkeyeStore((s) => s.modelTesting);

  const setConfig = useHawkeyeStore((s) => s.setConfig);
  const setTempConfig = useHawkeyeStore((s) => s.setTempConfig);
  const updateTempConfig = useHawkeyeStore((s) => s.updateTempConfig);
  const setOllamaStatus = useHawkeyeStore((s) => s.setOllamaStatus);
  const setInstalledModels = useHawkeyeStore((s) => s.setInstalledModels);
  const setModelPullProgress = useHawkeyeStore((s) => s.setModelPullProgress);
  const setModelTestResult = useHawkeyeStore((s) => s.setModelTestResult);
  const setModelTesting = useHawkeyeStore((s) => s.setModelTesting);

  const saveConfig = useCallback(async () => {
    // @ts-ignore
    const newConfig = await window.hawkeye.saveConfig(tempConfig);
    setConfig(newConfig);
  }, [tempConfig, setConfig]);

  useEffect(() => {
    // Initial load
    // @ts-ignore
    window.hawkeye.getConfig().then(setConfig);

    // Listeners
    // @ts-ignore
    const cleanupPull = window.hawkeye.onOllamaPullProgress((progress) => {
      setModelPullProgress(progress);
    });

    return () => {
      cleanupPull();
    };
  }, [setConfig, setModelPullProgress]);

  return {
    config,
    tempConfig,
    ollamaStatus,
    installedModels,
    modelPullProgress,
    modelTestResult,
    modelTesting,
    updateTempConfig,
    saveConfig,
    setOllamaStatus,
    setInstalledModels,
    setModelTesting,
    setModelTestResult,
  };
}
