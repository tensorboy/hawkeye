import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface PythonEnvironment {
  path: string;
  version: string;
  pipVersion?: string;
  packages: Map<string, string>; // name -> version
}

export class EnvCheckService {
  private pythonEnv: PythonEnvironment | null = null;
  private debugLog: (msg: string) => void;

  constructor(debugLogFn: (msg: string) => void = console.log) {
    this.debugLog = debugLogFn;
  }

  /**
   * Get the detected Python environment
   */
  getPythonEnv(): PythonEnvironment | null {
    return this.pythonEnv;
  }

  /**
   * Detect Python environment (Python 3)
   */
  async detectEnvironment(): Promise<PythonEnvironment | null> {
    this.debugLog('[EnvCheck] Starting Python detection...');

    // Candidates to check
    const candidates = process.platform === 'win32'
      ? ['python', 'py -3', 'python3']
      : ['python3', '/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3', 'python'];

    for (const cmd of candidates) {
      try {
        const { stdout } = await execAsync(`${cmd} --version`);
        const versionMatch = stdout.match(/Python (\d+)\.(\d+)/);

        if (versionMatch) {
          const major = parseInt(versionMatch[1]);
          if (major >= 3) {
            this.debugLog(`[EnvCheck] Found Python: ${cmd} (${stdout.trim()})`);

            // Check pip
            let pipVersion: string | undefined;
            try {
              const pipResult = await execAsync(`${cmd} -m pip --version`);
              const pipMatch = pipResult.stdout.match(/pip ([\d.]+)/);
              if (pipMatch) pipVersion = pipMatch[1];
            } catch (e) {
              this.debugLog(`[EnvCheck] Pip check failed for ${cmd}: ${e}`);
            }

            this.pythonEnv = {
              path: cmd,
              version: stdout.trim(),
              pipVersion,
              packages: new Map()
            };

            // Load installed packages
            await this.refreshPackageList();
            return this.pythonEnv;
          }
        }
      } catch (e) {
        // Ignore and continue
      }
    }

    this.debugLog('[EnvCheck] No suitable Python 3 environment found.');
    return null;
  }

  /**
   * Refresh the list of installed pip packages
   */
  async refreshPackageList(): Promise<void> {
    if (!this.pythonEnv) return;

    try {
      const { stdout } = await execAsync(`${this.pythonEnv.path} -m pip list --format=json`);
      const packages = JSON.parse(stdout) as Array<{ name: string; version: string }>;

      this.pythonEnv.packages.clear();
      for (const pkg of packages) {
        this.pythonEnv.packages.set(pkg.name.toLowerCase(), pkg.version);
      }
      this.debugLog(`[EnvCheck] Loaded ${this.pythonEnv.packages.size} pip packages`);
    } catch (e) {
      this.debugLog(`[EnvCheck] Failed to list pip packages: ${e}`);
    }
  }

  /**
   * Check if specific packages are installed
   */
  checkPackages(requiredPackages: string[]): { missing: string[], installed: string[] } {
    if (!this.pythonEnv) return { missing: requiredPackages, installed: [] };

    const missing: string[] = [];
    const installed: string[] = [];

    for (const pkg of requiredPackages) {
      if (this.pythonEnv.packages.has(pkg.toLowerCase())) {
        installed.push(pkg);
      } else {
        missing.push(pkg);
      }
    }

    return { missing, installed };
  }

  /**
   * Install missing packages
   */
  async installPackages(packages: string[]): Promise<boolean> {
    if (!this.pythonEnv || packages.length === 0) return false;

    this.debugLog(`[EnvCheck] Installing packages: ${packages.join(', ')}`);
    const packagesStr = packages.join(' ');

    try {
      await execAsync(`${this.pythonEnv.path} -m pip install --user ${packagesStr}`);
      await this.refreshPackageList();
      return true;
    } catch (e) {
      this.debugLog(`[EnvCheck] Installation failed: ${e}`);
      return false;
    }
  }
}
