import { ipcMain, app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { ConfigService, AppConfig } from '../services/config-service';
import type { HawkeyeService } from '../services/hawkeye-service';

export function registerConfigHandlers(
  configService: ConfigService,
  hawkeyeService: HawkeyeService,
  localOnlyConfig: any
) {
  ipcMain.handle('get-config', () => {
    const config = configService.getConfig();
    return {
      ...config,
      hasGemini: !!config.geminiApiKey,
    };
  });

  ipcMain.handle('save-config', async (_event, newConfig: Partial<AppConfig>) => {
    const updatedConfig = configService.saveConfig(newConfig);

    // Re-initialize Hawkeye in background
    setImmediate(async () => {
      try {
        await hawkeyeService.shutdown();
        await hawkeyeService.initialize(updatedConfig);
        console.log('[Config] Hawkeye re-initialized');
      } catch (err) {
        console.error('[Config] Hawkeye re-init failed:', err);
      }
    });

    return updatedConfig;
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, version: result?.updateInfo?.version };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
