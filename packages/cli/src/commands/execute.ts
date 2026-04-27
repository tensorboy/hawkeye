import * as fs from 'node:fs';
import type { Command } from 'commander';
import { createHawkeye, type ExecutionPlan } from '@hawkeye/core';
import { buildHawkeyeConfig, loadConfig } from '../config.js';
import { printError, printEvent, printResult } from '../output.js';

function readPlan(source: string): ExecutionPlan {
  const raw = fs.readFileSync(source, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Plan file must be a JSON object matching ExecutionPlan.');
  }
  return parsed as ExecutionPlan;
}

export function registerExecute(program: Command): void {
  program
    .command('execute <planFile>')
    .description('execute a previously generated plan, streaming step results')
    .action(async (planFile: string) => {
      let hawkeye: ReturnType<typeof createHawkeye> | null = null;
      try {
        const plan = readPlan(planFile);
        const cliCfg = loadConfig();
        if (!cliCfg.ai.apiKey) {
          throw new Error('No AI API key configured (set GEMINI_API_KEY / OPENAI_API_KEY).');
        }

        hawkeye = createHawkeye(buildHawkeyeConfig(cliCfg));
        await hawkeye.initialize();

        // Stream step events as they happen so JSON consumers see NDJSON.
        hawkeye.on('execution:step:start', (data: unknown) =>
          printEvent('step:start', data)
        );
        hawkeye.on('execution:step:complete', (data: unknown) =>
          printEvent('step:complete', data)
        );
        hawkeye.on('execution:step:error', (data: unknown) =>
          printEvent('step:error', data)
        );

        const execution = await hawkeye.executePlan(plan);
        printResult('execution', execution);
        await hawkeye.shutdown();
        process.exit(0);
      } catch (err) {
        printError(err);
        try {
          await hawkeye?.shutdown();
        } catch {
          /* ignore */
        }
        process.exit(1);
      }
    });
}
