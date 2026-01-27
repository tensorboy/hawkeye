import { ipcMain, desktopCapturer } from 'electron';
import type { HawkeyeService } from '../services/hawkeye-service';
import type { ConfigService } from '../services/config-service';
import { nativeImage } from 'electron';
import {
  AdaptiveRefreshService,
  createAdaptiveRefreshService,
  getAdaptiveRefreshService,
  type ActivityLevel,
} from '../services/adaptive-refresh-service';

export function registerSmartObserveHandlers(
  hawkeyeService: HawkeyeService,
  configService: ConfigService,
  mainWindowGetter: () => Electron.BrowserWindow | null
) {
  let screenWatcherInterval: NodeJS.Timeout | null = null;
  let lastScreenHash: string | null = null;
  let isWatching = false;
  let isSmartObserveRunning = false;

  // 初始化自适应刷新服务 (参考 steipete/VibeMeter)
  const adaptiveRefresh = createAdaptiveRefreshService({
    enabled: true,
    minInterval: 1000,   // 高活跃: 1秒
    maxInterval: 10000,  // 空闲: 10秒
    defaultInterval: configService.getConfig().smartObserveInterval,
  });

  // 监听间隔变化，动态调整
  adaptiveRefresh.setOnIntervalChange((newInterval, level) => {
    if (isWatching && screenWatcherInterval) {
      debugLog(`Adaptive refresh: interval=${newInterval}ms, level=${level}`);
      // 重新设置定时器
      clearInterval(screenWatcherInterval);
      screenWatcherInterval = setInterval(smartObserveCheck, newInterval);

      // 通知前端
      const mainWindow = mainWindowGetter();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('smart-observe-interval-changed', {
          interval: newInterval,
          level,
          activityScore: adaptiveRefresh.getActivityScore(),
        });
      }
    }
  });

  function debugLog(msg: string) {
    console.log(`[SmartObserve] ${msg}`);
  }

  function computeImageHash(imageData: Buffer): string {
    try {
      const image = nativeImage.createFromBuffer(imageData);
      if (image.isEmpty()) return '';
      const resized = image.resize({ width: 16, height: 16, quality: 'good' });
      const bitmap = resized.toBitmap();
      let hash = 0n;
      const step = Math.max(1, Math.floor(bitmap.length / 64));
      for (let i = 0; i < 64 && i * step < bitmap.length; i++) {
        const idx = i * step;
        const gray = Math.floor((bitmap[idx] + bitmap[idx + 1] + bitmap[idx + 2]) / 3);
        if (gray > 127) hash |= (1n << BigInt(i));
      }
      return hash.toString(16);
    } catch (error) {
      return '';
    }
  }

  function hammingDistance(hash1: string, hash2: string): number {
    if (!hash1 || !hash2) return 64;
    const h1 = BigInt('0x' + hash1);
    const h2 = BigInt('0x' + hash2);
    let xor = h1 ^ h2;
    let count = 0;
    while (xor > 0n) {
      count += Number(xor & 1n);
      xor >>= 1n;
    }
    return count;
  }

  async function smartObserveCheck() {
    if (isSmartObserveRunning) return;
    const hawkeye = hawkeyeService.getInstance();
    if (!hawkeye?.isInitialized || !isWatching) return;

    isSmartObserveRunning = true;
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 320, height: 180 },
      });
      if (sources.length === 0) return;

      const thumbnail = sources[0].thumbnail;
      const currentHash = computeImageHash(thumbnail.toPNG());
      if (!currentHash) return;

      if (!lastScreenHash) {
        lastScreenHash = currentHash;
        return;
      }

      const distance = hammingDistance(lastScreenHash, currentHash);
      const changeRatio = distance / 64;
      const config = configService.getConfig();

      const mainWindow = mainWindowGetter();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('screenshot-preview', {
          dataUrl: thumbnail.toDataURL(),
          timestamp: Date.now()
        });
      }

      if (changeRatio >= config.smartObserveThreshold) {
        debugLog(`Change detected: ${(changeRatio * 100).toFixed(1)}%`);
        lastScreenHash = currentHash;

        // 记录屏幕变化活动，触发自适应刷新
        adaptiveRefresh.recordActivity('screen_change', changeRatio);

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('smart-observe-change-detected');
        }

        // Trigger analysis without auto-popup
        await hawkeyeService.perceiveAndRecognize();
      } else {
        lastScreenHash = currentHash;
      }
    } catch (error) {
      debugLog(`Error: ${error}`);
    } finally {
      isSmartObserveRunning = false;
    }
  }

  function startSmartObserve() {
    if (isWatching) return;
    const config = configService.getConfig();
    if (!config.smartObserve) return;

    isWatching = true;
    lastScreenHash = null;

    // 启动自适应刷新服务
    adaptiveRefresh.start();

    // 使用自适应刷新当前间隔（初始为默认间隔）
    const initialInterval = adaptiveRefresh.getCurrentInterval();
    screenWatcherInterval = setInterval(smartObserveCheck, initialInterval);
    debugLog(`Started with adaptive interval: ${initialInterval}ms`);

    const mainWindow = mainWindowGetter();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('smart-observe-status', { watching: true });
    }
  }

  function stopSmartObserve() {
    if (screenWatcherInterval) {
      clearInterval(screenWatcherInterval);
      screenWatcherInterval = null;
    }

    // 停止自适应刷新服务
    adaptiveRefresh.stop();

    isWatching = false;
    isSmartObserveRunning = false;
    lastScreenHash = null;

    const mainWindow = mainWindowGetter();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('smart-observe-status', { watching: false });
    }
  }

  // Export start/stop for main process usage
  (global as any).startSmartObserve = startSmartObserve;
  (global as any).stopSmartObserve = stopSmartObserve;

  // IPC handlers
  ipcMain.handle('start-smart-observe', () => {
    startSmartObserve();
    return { success: true, watching: isWatching };
  });

  ipcMain.handle('stop-smart-observe', () => {
    stopSmartObserve();
    return { success: true, watching: false };
  });

  ipcMain.handle('get-smart-observe-status', () => {
    const config = configService.getConfig();
    const adaptiveStatus = adaptiveRefresh.getStatus();
    return {
      watching: isWatching,
      interval: config.smartObserveInterval,
      threshold: config.smartObserveThreshold,
      enabled: config.smartObserve,
      // 自适应刷新状态
      adaptive: {
        enabled: adaptiveStatus.enabled,
        currentInterval: adaptiveStatus.currentInterval,
        activityLevel: adaptiveStatus.activityLevel,
        activityScore: adaptiveStatus.activityScore,
        recentActivityCount: adaptiveStatus.recentActivityCount,
      },
    };
  });

  ipcMain.handle('toggle-smart-observe', () => {
    if (isWatching) stopSmartObserve();
    else startSmartObserve();
    return { watching: isWatching };
  });

  // 自适应刷新状态 IPC
  ipcMain.handle('get-adaptive-refresh-status', () => {
    return adaptiveRefresh.getStatus();
  });

  // 记录用户交互活动（提升活跃度）
  ipcMain.handle('record-user-activity', (_event, type: string) => {
    const validTypes = ['user_interaction', 'window_switch', 'clipboard_change', 'ai_request', 'plan_execution'];
    if (validTypes.includes(type)) {
      adaptiveRefresh.recordActivity(type as any);
      return { success: true, status: adaptiveRefresh.getStatus() };
    }
    return { success: false, error: 'Invalid activity type' };
  });

  ipcMain.handle('get-screenshot', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 800, height: 600 },
      });
      if (sources.length === 0) return { success: false, error: 'No source' };
      return { success: true, dataUrl: sources[0].thumbnail.toDataURL() };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });
}
