/**
 * Model IPC Handlers
 * 处理模型管理相关的 IPC 请求
 */

import { ipcMain } from 'electron';
import type { ModelManagerService } from '../services/model-manager-service';

export function registerModelHandlers(modelManagerService: ModelManagerService) {
  // 获取模型目录
  ipcMain.handle('model-get-directory', () => {
    return modelManagerService.getModelDirectory();
  });

  // 列出所有已下载的模型
  ipcMain.handle('model-list', async () => {
    return modelManagerService.listModels();
  });

  // 从 HuggingFace 下载模型
  ipcMain.handle('model-download-hf', async (_event, modelId: string, fileName?: string) => {
    return modelManagerService.downloadFromHuggingFace(modelId, fileName);
  });

  // 取消下载
  ipcMain.handle('model-cancel-download', (_event, modelId: string, fileName?: string) => {
    return modelManagerService.cancelDownload(modelId, fileName);
  });

  // 删除模型
  ipcMain.handle('model-delete', async (_event, modelPath: string) => {
    return modelManagerService.deleteModel(modelPath);
  });

  // 获取推荐模型列表
  ipcMain.handle('model-get-recommended', () => {
    return modelManagerService.getRecommendedModels();
  });

  // 检查模型是否存在
  ipcMain.handle('model-exists', async (_event, modelPath: string) => {
    return modelManagerService.modelExists(modelPath);
  });
}
