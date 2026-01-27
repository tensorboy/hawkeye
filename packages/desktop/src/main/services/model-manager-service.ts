/**
 * Model Manager Service
 * 管理本地 GGUF 模型文件，支持从 HuggingFace 下载
 */

import { BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface LocalModel {
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  modifiedAt: Date;
  quantization?: string;
}

export interface ModelDownloadProgress {
  modelId: string;
  fileName: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed?: string;
  eta?: string;
  status: 'downloading' | 'completed' | 'error' | 'cancelled';
  error?: string;
}

export interface RecommendedModel {
  id: string;
  name: string;
  description: string;
  type: 'text' | 'vision';
  size: string;
  quantization: string;
  fileName: string;
}

export const RECOMMENDED_MODELS: RecommendedModel[] = [
  {
    id: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
    name: 'Qwen 2.5 7B',
    description: '阿里云通义千问，中英双语，性能优秀',
    type: 'text',
    size: '4.7GB',
    quantization: 'Q4_K_M',
    fileName: 'qwen2.5-7b-instruct-q4_k_m.gguf',
  },
  {
    id: 'lmstudio-community/Llama-3.2-3B-Instruct-GGUF',
    name: 'Llama 3.2 3B',
    description: 'Meta Llama 3.2，轻量快速',
    type: 'text',
    size: '2.0GB',
    quantization: 'Q4_K_M',
    fileName: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'microsoft/Phi-3-mini-4k-instruct-gguf',
    name: 'Phi-3 Mini',
    description: '微软 Phi-3，小巧高效',
    type: 'text',
    size: '2.4GB',
    quantization: 'q4',
    fileName: 'Phi-3-mini-4k-instruct-q4.gguf',
  },
  {
    id: 'cjpais/llava-1.6-mistral-7b-gguf',
    name: 'LLaVA 1.6 7B',
    description: '视觉语言模型，支持图像理解',
    type: 'vision',
    size: '4.5GB',
    quantization: 'Q4_K_M',
    fileName: 'llava-v1.6-mistral-7b-Q4_K_M.gguf',
  },
];

export class ModelManagerService {
  private modelDir: string;
  private downloadAbortControllers: Map<string, AbortController> = new Map();

  constructor(
    private mainWindowGetter: () => BrowserWindow | null,
    private debugLog: (msg: string) => void
  ) {
    // 模型存储目录: ~/Library/Application Support/Hawkeye/models
    this.modelDir = path.join(
      app.getPath('userData'),
      'models'
    );
    this.ensureModelDir();
  }

  /**
   * 确保模型目录存在
   */
  private ensureModelDir(): void {
    if (!fs.existsSync(this.modelDir)) {
      fs.mkdirSync(this.modelDir, { recursive: true });
      this.debugLog(`[ModelManager] Created model directory: ${this.modelDir}`);
    }
  }

  /**
   * 获取模型目录路径
   */
  getModelDirectory(): string {
    return this.modelDir;
  }

  /**
   * 列出所有已下载的模型
   */
  async listModels(): Promise<LocalModel[]> {
    try {
      const files = await fs.promises.readdir(this.modelDir);
      const models: LocalModel[] = [];

      for (const file of files) {
        if (file.endsWith('.gguf')) {
          const filePath = path.join(this.modelDir, file);
          const stats = await fs.promises.stat(filePath);

          models.push({
            name: file.replace('.gguf', ''),
            path: filePath,
            size: stats.size,
            sizeFormatted: this.formatSize(stats.size),
            modifiedAt: stats.mtime,
            quantization: this.extractQuantization(file),
          });
        }
      }

      // 按修改时间排序，最新的在前
      models.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

      return models;
    } catch (error) {
      this.debugLog(`[ModelManager] Error listing models: ${error}`);
      return [];
    }
  }

  /**
   * 从 HuggingFace 下载模型
   * 使用 node-llama-cpp 的 resolveModelFile 功能
   */
  async downloadFromHuggingFace(
    modelId: string,
    fileName?: string
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const downloadId = `${modelId}:${fileName || 'default'}`;

    try {
      this.debugLog(`[ModelManager] Starting download: ${modelId}`);

      // 创建 AbortController 用于取消
      const abortController = new AbortController();
      this.downloadAbortControllers.set(downloadId, abortController);

      // 发送开始事件
      this.sendProgress({
        modelId,
        fileName: fileName || modelId.split('/').pop() || 'model.gguf',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        status: 'downloading',
      });

      // 动态导入 node-llama-cpp
      const { resolveModelFile, createModelDownloader } = await import('node-llama-cpp');

      // 构建 HuggingFace 模型 URL
      const modelUrl = fileName
        ? `hf:${modelId}/${fileName}`
        : `hf:${modelId}`;

      this.debugLog(`[ModelManager] Resolving model: ${modelUrl}`);

      // 使用 createModelDownloader 下载模型
      const downloader = await createModelDownloader({
        modelUri: modelUrl,
        dirPath: this.modelDir,
        onProgress: (downloadProgress) => {
          const progress = downloadProgress.totalSize > 0
            ? Math.round((downloadProgress.downloadedSize / downloadProgress.totalSize) * 100)
            : 0;

          this.sendProgress({
            modelId,
            fileName: fileName || modelId.split('/').pop() || 'model.gguf',
            progress,
            downloadedBytes: downloadProgress.downloadedSize,
            totalBytes: downloadProgress.totalSize,
            status: 'downloading',
          });
        },
      });

      // 等待下载完成
      const resolvedPath = await downloader.download({
        signal: abortController.signal,
      });

      // 下载完成
      this.downloadAbortControllers.delete(downloadId);

      this.sendProgress({
        modelId,
        fileName: path.basename(resolvedPath),
        progress: 100,
        downloadedBytes: 0,
        totalBytes: 0,
        status: 'completed',
      });

      this.debugLog(`[ModelManager] Download completed: ${resolvedPath}`);

      return { success: true, path: resolvedPath };
    } catch (error) {
      this.downloadAbortControllers.delete(downloadId);

      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('aborted') || errorMessage.includes('cancelled')) {
        this.sendProgress({
          modelId,
          fileName: fileName || 'unknown',
          progress: 0,
          downloadedBytes: 0,
          totalBytes: 0,
          status: 'cancelled',
        });

        return { success: false, error: '下载已取消' };
      }

      this.sendProgress({
        modelId,
        fileName: fileName || 'unknown',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        status: 'error',
        error: errorMessage,
      });

      this.debugLog(`[ModelManager] Download error: ${errorMessage}`);

      return { success: false, error: errorMessage };
    }
  }

  /**
   * 取消下载
   */
  cancelDownload(modelId: string, fileName?: string): boolean {
    const downloadId = `${modelId}:${fileName || 'default'}`;
    const controller = this.downloadAbortControllers.get(downloadId);

    if (controller) {
      controller.abort();
      this.downloadAbortControllers.delete(downloadId);
      this.debugLog(`[ModelManager] Download cancelled: ${downloadId}`);
      return true;
    }

    return false;
  }

  /**
   * 删除模型
   */
  async deleteModel(modelPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 安全检查：只允许删除模型目录下的文件
      const normalizedPath = path.normalize(modelPath);
      const modelDirWithSep = this.modelDir.endsWith(path.sep)
        ? this.modelDir
        : this.modelDir + path.sep;
      if (!normalizedPath.startsWith(modelDirWithSep)) {
        return { success: false, error: '无效的模型路径' };
      }

      if (!normalizedPath.endsWith('.gguf')) {
        return { success: false, error: '只能删除 GGUF 模型文件' };
      }

      await fs.promises.unlink(normalizedPath);
      this.debugLog(`[ModelManager] Model deleted: ${normalizedPath}`);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.debugLog(`[ModelManager] Delete error: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取推荐模型列表
   */
  getRecommendedModels(): RecommendedModel[] {
    return RECOMMENDED_MODELS;
  }

  /**
   * 检查模型是否存在
   */
  async modelExists(modelPath: string): Promise<boolean> {
    try {
      await fs.promises.access(modelPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  // ============ 私有方法 ============

  /**
   * 格式化文件大小
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let size = bytes;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * 从文件名提取量化级别
   */
  private extractQuantization(fileName: string): string | undefined {
    const match = fileName.match(/(q\d+_k_[ms]|q\d+_[01]|q\d+)/i);
    return match ? match[1].toUpperCase() : undefined;
  }

  /**
   * 发送下载进度到渲染进程
   */
  private sendProgress(progress: ModelDownloadProgress): void {
    const win = this.mainWindowGetter();
    if (win && !win.isDestroyed()) {
      win.webContents.send('model-download-progress', progress);
    }
  }
}
