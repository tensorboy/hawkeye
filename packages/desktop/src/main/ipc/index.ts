import { BrowserWindow } from 'electron';
import { ConfigService, LOCAL_ONLY_CONFIG } from '../services/config-service';
import { HawkeyeService } from '../services/hawkeye-service';
import { ModelManagerService } from '../services/model-manager-service';
import { EnvCheckService } from '../services/env-check-service';
import { WhisperService } from '../services/whisper-service';
import { registerCoreHandlers } from './core-handlers';
import { registerConfigHandlers } from './config-handlers';
import { registerModelHandlers } from './model-handlers';
import { registerDebugHandlers } from './debug-handlers';
import { registerSmartObserveHandlers } from './smart-observe-handlers';
import { registerWhisperHandlers, setConfigServiceRef } from './whisper-handlers';
import { registerLifeTreeHandlers } from './life-tree-handlers';
import { registerActivitySummaryHandlers } from './activity-summary-handlers';
import { registerAudioProcessorHandlers } from './audio-processor-handlers';
import { registerGestureControlHandlers } from './gesture-control-handlers';
import { registerGlobalClickHandlers } from './global-click-handlers';
import { registerSherpaOnnxHandlers } from './sherpa-onnx-handlers';
import type { LifeTreeService } from '../services/life-tree-service';
import type { ActivitySummarizerService } from '../services/activity-summarizer-service';
import type { AudioProcessorService } from '../services/audio-processor-service';
import type { SherpaOnnxService } from '../services/sherpa-onnx-service';
import type { WakeWordService } from '../services/wake-word-service';
import type { TTSPlaybackService } from '../services/tts-playback-service';

export interface HandlerContext {
  configService: ConfigService;
  hawkeyeService: HawkeyeService;
  modelManagerService: ModelManagerService;
  envCheckService: EnvCheckService;
  whisperService: WhisperService;
  lifeTreeService?: LifeTreeService;
  activitySummarizerService?: ActivitySummarizerService;
  audioProcessorService?: AudioProcessorService;
  sherpaOnnxService?: SherpaOnnxService;
  wakeWordService?: WakeWordService;
  ttsPlaybackService?: TTSPlaybackService;
  mainWindowGetter: () => BrowserWindow | null;
  debugLog?: (msg: string) => void;
}

export function registerAllHandlers(context: HandlerContext) {
  registerCoreHandlers(context.hawkeyeService);
  registerConfigHandlers(context.configService, context.hawkeyeService, LOCAL_ONLY_CONFIG);
  registerModelHandlers(context.modelManagerService);
  registerDebugHandlers(context.hawkeyeService);
  registerSmartObserveHandlers(context.hawkeyeService, context.configService, context.mainWindowGetter);
  setConfigServiceRef(context.configService);
  registerWhisperHandlers(context.whisperService, context.hawkeyeService, context.debugLog);
  if (context.lifeTreeService) {
    registerLifeTreeHandlers(context.lifeTreeService);
  }
  if (context.activitySummarizerService) {
    registerActivitySummaryHandlers(context.activitySummarizerService);
  }
  if (context.audioProcessorService && context.debugLog) {
    registerAudioProcessorHandlers(context.audioProcessorService, context.debugLog);
  }

  // Register gesture control handlers
  registerGestureControlHandlers(context.mainWindowGetter, context.debugLog);

  // Register global click handlers for WebGazer calibration
  registerGlobalClickHandlers(context.mainWindowGetter, context.debugLog);

  // Register Sherpa-ONNX voice handlers (streaming ASR, wake word, TTS)
  if (context.sherpaOnnxService && context.wakeWordService && context.ttsPlaybackService) {
    registerSherpaOnnxHandlers(
      context.sherpaOnnxService,
      context.wakeWordService,
      context.ttsPlaybackService,
      context.debugLog
    );
  }

  // Register EnvCheck handlers inline for now or create a new file if it grows
  const { ipcMain } = require('electron');

  ipcMain.handle('env-check', async () => {
    return context.envCheckService.detectEnvironment();
  });

  ipcMain.handle('env-check-packages', async (_event, packages: string[]) => {
    return context.envCheckService.checkPackages(packages);
  });

  ipcMain.handle('env-install-packages', async (_event, packages: string[]) => {
    return context.envCheckService.installPackages(packages);
  });
}
