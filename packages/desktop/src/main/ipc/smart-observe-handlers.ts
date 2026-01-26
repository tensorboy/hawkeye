import { ipcMain, desktopCapturer } from 'electron';
import type { HawkeyeService } from '../services/hawkeye-service';
import type { ConfigService } from '../services/config-service';
import { nativeImage } from 'electron';

export function registerSmartObserveHandlers(
  hawkeyeService: HawkeyeService,
  configService: ConfigService,
  mainWindowGetter: () => Electron.BrowserWindow | null
) {
  let screenWatcherInterval: NodeJS.Timeout | null = null;
  let lastScreenHash: string | null = null;
  let isWatching = false;
  let isSmartObserveRunning = false;

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
    screenWatcherInterval = setInterval(smartObserveCheck, config.smartObserveInterval);

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
    return {
      watching: isWatching,
      interval: config.smartObserveInterval,
      threshold: config.smartObserveThreshold,
      enabled: config.smartObserve,
    };
  });

  ipcMain.handle('toggle-smart-observe', () => {
    if (isWatching) stopSmartObserve();
    else startSmartObserve();
    return { watching: isWatching };
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
