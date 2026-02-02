import { ipcMain, systemPreferences, app } from 'electron';
import type { WhisperService } from '../services/whisper-service';
import type { HawkeyeService } from '../services/hawkeye-service';
import type { ConfigService } from '../services/config-service';

let configServiceRef: ConfigService | null = null;

export function setConfigServiceRef(configService: ConfigService) {
  configServiceRef = configService;
}

export function registerWhisperHandlers(
  whisperService: WhisperService,
  hawkeyeService?: HawkeyeService,
  debugLog?: (msg: string) => void
) {
  const log = debugLog || console.log;

  ipcMain.handle('whisper-transcribe', async (_event, audioBuffer: Buffer) => {
    log(`[Whisper] 收到转录请求，音频大小: ${audioBuffer.length} bytes`);
    try {
      const result = await whisperService.transcribe(audioBuffer);
      log(`[Whisper] 转录结果: "${result?.substring(0, 100) || '(空)'}"`);

      // Add speech segment to debug timeline if result is not empty
      if (result && result.trim() && hawkeyeService) {
        const hawkeye = hawkeyeService.getInstance();
        if (hawkeye) {
          const collector = hawkeye.getEventCollector();
          collector.addSpeechSegment({
            text: result,
            language: whisperService.getStatus().language,
            confidence: 0.9, // Whisper doesn't provide confidence, use default
            duration: 0, // We don't track duration
          });
          log(`[Whisper] 已添加到 Debug Timeline`);
        }
      }

      return result;
    } catch (error) {
      log(`[Whisper] 转录错误: ${error}`);
      throw error;
    }
  });

  ipcMain.handle('whisper-status', () => {
    return whisperService.getStatus();
  });

  ipcMain.handle('whisper-check-mic', async () => {
    if (process.platform === 'darwin') {
      return systemPreferences.getMediaAccessStatus('microphone');
    }
    return 'granted';
  });

  ipcMain.handle('whisper-request-mic', async () => {
    if (process.platform === 'darwin') {
      return systemPreferences.askForMediaAccess('microphone');
    }
    return true;
  });

  // Reset whisper model (delete existing and prepare for re-download)
  ipcMain.handle('whisper-reset-model', async () => {
    log('[Whisper] Reset model requested');
    try {
      await whisperService.resetModel();
      // Clear config
      if (configServiceRef) {
        configServiceRef.saveConfig({
          whisperModelPath: '',
          whisperEnabled: false,
        });
      }
      return { success: true };
    } catch (error) {
      log(`[Whisper] Reset error: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Download whisper model
  ipcMain.handle('whisper-download-model', async () => {
    log('[Whisper] Download model requested');
    try {
      const modelPath = await whisperService.downloadModel();
      // Update config
      if (configServiceRef) {
        configServiceRef.saveConfig({
          whisperModelPath: modelPath,
          whisperEnabled: true,
        });
      }
      // Initialize whisper with new model
      await whisperService.initialize({
        modelPath,
        language: configServiceRef?.getConfig().whisperLanguage || 'auto',
      });
      return { success: true, modelPath };
    } catch (error) {
      log(`[Whisper] Download error: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Get model info
  ipcMain.handle('whisper-model-info', () => {
    const status = whisperService.getStatus();
    return {
      modelPath: status.modelPath,
      modelExists: whisperService.modelExists(),
      expectedModelPath: whisperService.getDefaultModelPath(),
      initialized: status.initialized,
      isDownloading: status.isDownloading,
      downloadProgress: status.downloadProgress,
    };
  });
}
