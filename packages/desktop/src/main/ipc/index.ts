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
import { registerWhisperHandlers } from './whisper-handlers';
import { registerLifeTreeHandlers } from './life-tree-handlers';
import type { LifeTreeService } from '../services/life-tree-service';

export interface HandlerContext {
  configService: ConfigService;
  hawkeyeService: HawkeyeService;
  modelManagerService: ModelManagerService;
  envCheckService: EnvCheckService;
  whisperService: WhisperService;
  lifeTreeService?: LifeTreeService;
  mainWindowGetter: () => BrowserWindow | null;
}

export function registerAllHandlers(context: HandlerContext) {
  registerCoreHandlers(context.hawkeyeService);
  registerConfigHandlers(context.configService, context.hawkeyeService, LOCAL_ONLY_CONFIG);
  registerModelHandlers(context.modelManagerService);
  registerDebugHandlers(context.hawkeyeService);
  registerSmartObserveHandlers(context.hawkeyeService, context.configService, context.mainWindowGetter);
  registerWhisperHandlers(context.whisperService);
  if (context.lifeTreeService) {
    registerLifeTreeHandlers(context.lifeTreeService);
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
