import type { Command } from 'commander';
import { createHawkeye } from '@hawkeye/core';
import { buildHawkeyeConfig, loadConfig } from '../config.js';
import { printError, printResult } from '../output.js';

export function registerPerceive(program: Command): void {
  program
    .command('perceive')
    .description('capture the current screen + context and recognize user intents')
    .action(async () => {
      let hawkeye: ReturnType<typeof createHawkeye> | null = null;
      try {
        const cliCfg = loadConfig();
        if (!cliCfg.ai.apiKey) {
          throw new Error(
            'No AI API key found. Set GEMINI_API_KEY (or OPENAI_API_KEY), or run `hawkeye init` and edit the config file.'
          );
        }

        hawkeye = createHawkeye(buildHawkeyeConfig(cliCfg));
        await hawkeye.initialize();
        const intents = await hawkeye.perceiveAndRecognize();
        printResult('intents', intents);
        await hawkeye.shutdown();
        process.exit(0);
      } catch (err) {
        printError(err);
        try {
          await hawkeye?.shutdown();
        } catch {
          /* ignore secondary errors during cleanup */
        }
        process.exit(1);
      }
    });
}
