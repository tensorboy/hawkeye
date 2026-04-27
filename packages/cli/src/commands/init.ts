import * as fs from 'node:fs';
import type { Command } from 'commander';
import {
  defaultConfigPath,
  defaultDataDir,
  writeDefaultConfig,
} from '../config.js';
import { printError, printResult, printSuccess, printInfo } from '../output.js';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('write a starter config to ~/.config/hawkeye/cli.json and create the data dir')
    .option('-f, --force', 'overwrite an existing config')
    .action(async (opts: { force?: boolean }) => {
      try {
        const dataDir = defaultDataDir();
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
          printSuccess(`Created data directory: ${dataDir}`);
        } else {
          printInfo(`Data directory already exists: ${dataDir}`);
        }

        const target = process.env.HAWKEYE_CONFIG || defaultConfigPath();
        const exists = fs.existsSync(target);
        if (exists && !opts.force) {
          printError(
            new Error(
              `Config already exists at ${target}. Re-run with --force to overwrite.`
            )
          );
          process.exit(1);
          return;
        }

        const path = writeDefaultConfig(opts.force === true);
        printSuccess(`Wrote starter config: ${path}`);
        printResult('next-steps', {
          edit: path,
          envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY'],
          tryNext: 'hawkeye perceive --help',
        });
      } catch (err) {
        printError(err);
        process.exit(1);
      }
    });
}
