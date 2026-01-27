import { useEffect, useCallback } from 'react';
import { useHawkeyeStore } from '../index';

export function useConfig() {
  const config = useHawkeyeStore((s) => s.config);
  const tempConfig = useHawkeyeStore((s) => s.tempConfig);
  const modelTestResult = useHawkeyeStore((s) => s.modelTestResult);
  const modelTesting = useHawkeyeStore((s) => s.modelTesting);

  const setConfig = useHawkeyeStore((s) => s.setConfig);
  const setTempConfig = useHawkeyeStore((s) => s.setTempConfig);
  const updateTempConfig = useHawkeyeStore((s) => s.updateTempConfig);
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
  }, [setConfig]);

  return {
    config,
    tempConfig,
    modelTestResult,
    modelTesting,
    updateTempConfig,
    saveConfig,
    setModelTesting,
    setModelTestResult,
  };
}
