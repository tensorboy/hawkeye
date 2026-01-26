import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as http from 'http';
import * as https from 'https';

const execAsync = promisify(exec);

export class OllamaService {
  constructor(private mainWindowGetter: () => BrowserWindow | null, private debugLog: (msg: string) => void) {}

  async listModels() {
    try {
      const { stdout } = await execAsync('ollama list', { timeout: 10000 });
      const lines = stdout.trim().split('\n').slice(1);
      return {
        success: true,
        models: lines.map(line => {
          const parts = line.split(/\s+/);
          return {
            name: parts[0],
            id: parts[1] || '',
            size: parts[2] || '',
            modified: parts.slice(3).join(' ') || '',
          };
        }).filter(m => m.name)
      };
    } catch (error) {
      return { success: false, error: (error as Error).message, models: [] };
    }
  }

  async checkStatus() {
    this.debugLog('[Ollama Check] Starting check...');
    let installed = false;
    try {
      const result = await execAsync('ollama --version', { timeout: 5000 });
      this.debugLog(`[Ollama Check] Version: ${result.stdout.trim()}`);
      installed = true;
    } catch (err) {
      this.debugLog(`[Ollama Check] Not installed: ${err}`);
      return { installed: false, running: false };
    }

    const running = await new Promise<boolean>((resolve) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: 11434, path: '/api/tags', method: 'GET', timeout: 5000 },
        (res) => {
          this.debugLog(`[Ollama Check] Service status: ${res.statusCode}`);
          resolve(res.statusCode === 200);
        }
      );
      req.on('error', (err) => {
        this.debugLog(`[Ollama Check] Service not responding: ${err.message}`);
        resolve(false);
      });
      req.on('timeout', () => {
        this.debugLog('[Ollama Check] Service timeout');
        req.destroy();
        resolve(false);
      });
      req.end();
    });

    return { installed, running };
  }

  async startService() {
    try {
      const proc = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
      proc.unref();
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async pullModel(modelName: string): Promise<{ success: boolean; model: string; error?: string }> {
    return new Promise((resolve) => {
      try {
        this.debugLog(`[Ollama] Starting pull: ${modelName}`);
        this.safeSend('ollama-pull-start', modelName);

        const isWin = process.platform === 'win32';
        const proc = spawn(isWin ? 'ollama' : 'ollama', ['pull', modelName], {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
          env: { ...process.env, PATH: process.env.PATH + (isWin ? '' : ':/usr/local/bin:/opt/homebrew/bin') },
        });

        let lastProgress = '';

        proc.stdout?.on('data', (data) => {
          const output = data.toString();
          const progressMatch = output.match(/(\d+)%/);
          const sizeMatch = output.match(/(\d+\.?\d*)\s*(GB|MB|KB|B)/i);

          if (progressMatch || output !== lastProgress) {
            lastProgress = output;
            this.safeSend('ollama-pull-progress', {
              model: modelName,
              output: output.trim(),
              progress: progressMatch ? parseInt(progressMatch[1]) : null,
              size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : null,
            });
          }
        });

        proc.stderr?.on('data', (data) => {
          this.safeSend('ollama-pull-progress', { model: modelName, output: data.toString().trim(), isError: true });
        });

        proc.on('close', (code) => {
          const errorMsg = code !== 0 ? `Failed (code: ${code})` : undefined;
          this.safeSend('ollama-pull-complete', { model: modelName, success: code === 0, error: errorMsg });
          resolve({ success: code === 0, model: modelName, error: errorMsg });
        });

        proc.on('error', (error) => {
          this.safeSend('ollama-pull-complete', { model: modelName, success: false, error: error.message });
          resolve({ success: false, model: modelName, error: error.message });
        });
      } catch (error) {
        const msg = (error as Error).message;
        this.safeSend('ollama-pull-complete', { model: modelName, success: false, error: msg });
        resolve({ success: false, model: modelName, error: msg });
      }
    });
  }

  async downloadOllama() {
    const platform = process.platform;
    let url = '', filename = '', type: 'dmg' | 'exe' | 'script' = 'script';

    if (platform === 'darwin') {
      url = 'https://ollama.com/download/Ollama-darwin.zip';
      filename = 'Ollama-darwin.zip';
      type = 'dmg';
    } else if (platform === 'win32') {
      url = 'https://ollama.com/download/OllamaSetup.exe';
      filename = 'OllamaSetup.exe';
      type = 'exe';
    } else {
      url = 'https://ollama.com/install.sh';
      filename = 'install.sh';
      type = 'script';
    }

    const downloadPath = path.join(os.tmpdir(), filename);
    this.safeSend('ollama-download-start', { url, filename });

    return new Promise((resolve) => {
      const downloadWithRedirect = (currentUrl: string, count = 0) => {
        if (count > 5) return resolve({ success: false, error: 'Too many redirects' });

        const protocol = currentUrl.startsWith('https') ? https : http;
        protocol.get(currentUrl, (res) => {
          if (res.statusCode && [301, 302, 307].includes(res.statusCode)) {
            return downloadWithRedirect(res.headers.location!, count + 1);
          }
          if (res.statusCode !== 200) return resolve({ success: false, error: `HTTP ${res.statusCode}` });

          const total = parseInt(res.headers['content-length'] || '0', 10);
          let downloaded = 0;
          const file = fs.createWriteStream(downloadPath);

          res.on('data', chunk => {
            downloaded += chunk.length;
            this.safeSend('ollama-download-progress', {
              progress: total ? Math.round(downloaded / total * 100) : 0,
              downloaded, total
            });
          });

          res.pipe(file);
          file.on('finish', async () => {
            file.close();
            this.safeSend('ollama-download-complete', { path: downloadPath, type });
            await this.installOllama(downloadPath, type);
            resolve({ success: true, path: downloadPath, type });
          });
          file.on('error', err => resolve({ success: false, error: err.message }));
        }).on('error', err => resolve({ success: false, error: err.message }));
      };
      downloadWithRedirect(url);
    });
  }

  private async installOllama(downloadPath: string, type: string) {
    try {
      if (type === 'dmg') {
        const extractPath = path.join(os.tmpdir(), 'Ollama-extract');
        await execAsync(`unzip -o "${downloadPath}" -d "${extractPath}"`);
        try {
          await execAsync(`cp -R "${extractPath}/Ollama.app" /Applications/`);
        } catch {
          await execAsync(`open "${extractPath}"`);
        }
        setTimeout(() => execAsync('open -a Ollama').catch(() => {}), 1000);
      } else if (type === 'exe') {
        execAsync(`start "" "${downloadPath}"`);
      } else {
        await fs.promises.chmod(downloadPath, 0o755);
        execAsync(`x-terminal-emulator -e "sudo ${downloadPath}"`).catch(() =>
          execAsync(`gnome-terminal -- sudo ${downloadPath}`).catch(() => {})
        );
      }
    } catch (e) {
      this.debugLog(`Install error: ${e}`);
    }
  }

  private safeSend(channel: string, ...args: any[]) {
    const win = this.mainWindowGetter();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }
}
