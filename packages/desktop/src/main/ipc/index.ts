import { BrowserWindow } from 'electron';
import { ConfigService, LOCAL_ONLY_CONFIG } from '../services/config-service';
import { HawkeyeService } from '../services/hawkeye-service';
import { OllamaService } from '../services/ollama-service';
import { EnvCheckService } from '../services/env-check-service';
import { registerCoreHandlers } from './core-handlers';
import { registerConfigHandlers } from './config-handlers';
import { registerOllamaHandlers } from './ollama-handlers';
import { registerDebugHandlers } from './debug-handlers';
import { registerSmartObserveHandlers } from './smart-observe-handlers';

export interface HandlerContext {
  configService: ConfigService;
  hawkeyeService: HawkeyeService;
  ollamaService: OllamaService;
  envCheckService: EnvCheckService;
  mainWindowGetter: () => BrowserWindow | null;
}

export function registerAllHandlers(context: HandlerContext) {
  registerCoreHandlers(context.hawkeyeService);
  registerConfigHandlers(context.configService, context.hawkeyeService, LOCAL_ONLY_CONFIG);
  registerOllamaHandlers(context.ollamaService);
  registerDebugHandlers(context.hawkeyeService);
  registerSmartObserveHandlers(context.hawkeyeService, context.configService, context.mainWindowGetter);

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
