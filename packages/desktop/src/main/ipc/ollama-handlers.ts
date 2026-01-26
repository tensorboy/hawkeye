import { ipcMain } from 'electron';
import type { OllamaService } from '../services/ollama-service';

export function registerOllamaHandlers(ollamaService: OllamaService) {
  ipcMain.handle('ollama-list-models', async () => {
    return ollamaService.listModels();
  });

  ipcMain.handle('ollama-pull-model', async (_event, modelName: string) => {
    return ollamaService.pullModel(modelName);
  });

  ipcMain.handle('ollama-check', async () => {
    return ollamaService.checkStatus();
  });

  ipcMain.handle('ollama-start', async () => {
    return ollamaService.startService();
  });

  ipcMain.handle('download-ollama', async () => {
    return ollamaService.downloadOllama();
  });
}
