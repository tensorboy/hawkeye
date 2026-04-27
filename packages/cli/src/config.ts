/**
 * CLI configuration loader.
 *
 * Three-layer resolution (highest priority wins):
 *   1. CLI args (passed in by command handlers as `overrides`)
 *   2. Environment variables
 *   3. JSON file at $HAWKEYE_CONFIG or ~/.config/hawkeye/cli.json
 *   4. Built-in defaults
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { HawkeyeConfig } from '@hawkeye/core';

export interface CliConfig {
  ai: {
    provider: 'gemini' | 'openai';
    apiKey: string;
    model?: string;
    baseUrl?: string;
  };
  perception: {
    enableScreen: boolean;
    enableOCR: boolean;
  };
  storage: {
    dataDir: string;
  };
  observe: {
    intervalMs: number;
    changeThreshold: number;
  };
}

const BUILTIN_DEFAULTS: CliConfig = {
  ai: {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-2.5-flash',
    baseUrl: undefined,
  },
  perception: {
    enableScreen: true,
    enableOCR: true,
  },
  storage: {
    // Set lazily in resolveDefaults so we honor $HOME at call time.
    dataDir: '',
  },
  observe: {
    intervalMs: 3000,
    changeThreshold: 0.05,
  },
};

export function defaultConfigPath(): string {
  return path.join(os.homedir(), '.config', 'hawkeye', 'cli.json');
}

export function defaultDataDir(): string {
  return process.env.HAWKEYE_DATA_DIR || path.join(os.homedir(), '.hawkeye');
}

function resolveDefaults(): CliConfig {
  return {
    ...BUILTIN_DEFAULTS,
    storage: { dataDir: defaultDataDir() },
  };
}

function readJsonFileSafe(filePath: string): Partial<CliConfig> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as Partial<CliConfig>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse config at ${filePath}: ${msg}`);
  }
}

function envOverrides(): Partial<CliConfig> {
  const out: Partial<CliConfig> = {};

  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.OPENAI_API_KEY ||
    '';
  const provider: 'gemini' | 'openai' | undefined = process.env.OPENAI_API_KEY
    ? 'openai'
    : process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    ? 'gemini'
    : undefined;

  if (apiKey || provider) {
    out.ai = {
      provider: provider ?? 'gemini',
      apiKey,
    };
  }

  if (process.env.HAWKEYE_DATA_DIR) {
    out.storage = { dataDir: process.env.HAWKEYE_DATA_DIR };
  }

  return out;
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!patch) return base;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const v = patch[key];
    if (v === undefined) continue;
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof out[key] === 'object' &&
      out[key] !== null &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(
        out[key] as Record<string, unknown>,
        v as Record<string, unknown>
      );
    } else {
      out[key] = v;
    }
  }
  return out;
}

export function loadConfig(overrides?: Partial<CliConfig>): CliConfig {
  const fileTarget = process.env.HAWKEYE_CONFIG || defaultConfigPath();
  const fileLayer = readJsonFileSafe(fileTarget) || {};
  const envLayer = envOverrides();

  let merged: Record<string, unknown> = resolveDefaults() as unknown as Record<
    string,
    unknown
  >;
  merged = deepMerge(merged, fileLayer as Record<string, unknown>);
  merged = deepMerge(merged, envLayer as Record<string, unknown>);
  if (overrides) merged = deepMerge(merged, overrides as Record<string, unknown>);

  const result = merged as unknown as CliConfig;
  // Final safety: ensure dataDir is always populated.
  if (!result.storage.dataDir) result.storage.dataDir = defaultDataDir();
  return result;
}

const STARTER_CONFIG: CliConfig = {
  ai: {
    provider: 'gemini',
    apiKey: 'YOUR_API_KEY_HERE',
    model: 'gemini-2.5-flash',
  },
  perception: {
    enableScreen: true,
    enableOCR: true,
  },
  storage: {
    dataDir: path.join('~', '.hawkeye'),
  },
  observe: {
    intervalMs: 3000,
    changeThreshold: 0.05,
  },
};

/** Writes a starter config and returns the absolute path. Throws if the file already exists. */
export function writeDefaultConfig(force = false): string {
  const target = process.env.HAWKEYE_CONFIG || defaultConfigPath();
  if (fs.existsSync(target) && !force) {
    throw new Error(
      `Config already exists at ${target}. Re-run with --force to overwrite.`
    );
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(STARTER_CONFIG, null, 2) + '\n', 'utf8');
  return target;
}

/** Translates the simplified CliConfig into the full HawkeyeConfig that core expects. */
export function buildHawkeyeConfig(cli: CliConfig): HawkeyeConfig {
  return {
    ai: {
      providers: [
        {
          type: cli.ai.provider,
          apiKey: cli.ai.apiKey,
          model: cli.ai.model,
          baseUrl: cli.ai.baseUrl,
        },
      ],
      preferredProvider: cli.ai.provider,
      enableFailover: false,
    },
    // PerceptionEngineConfig has many more fields, but the engine constructor
    // accepts Partial<PerceptionEngineConfig> internally. Cast to keep TS happy.
    perception: {
      enableScreen: cli.perception.enableScreen,
      enableOCR: cli.perception.enableOCR,
    } as HawkeyeConfig['perception'],
    storage: {
      database: {
        dbPath: path.join(cli.storage.dataDir, 'hawkeye.db'),
      },
    },
    // Disable heavy modules by default for the CLI: they pull in native deps and
    // are not useful for one-shot perceive/plan/execute runs.
    enableBehaviorTracking: false,
    enableMemory: false,
    enableDashboard: false,
    enableWorkflow: false,
    enablePlugins: false,
    enableAutonomous: false,
    enableTaskQueue: false,
    autoStartSync: false,
  };
}
