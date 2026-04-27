import * as fs from 'node:fs';
import type { Command } from 'commander';
import { createHawkeye, type UserIntent } from '@hawkeye/core';
import { buildHawkeyeConfig, loadConfig } from '../config.js';
import { printError, printResult } from '../output.js';

async function readIntent(source: string): Promise<UserIntent> {
  const raw = source === '-' ? await readStdin() : fs.readFileSync(source, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Intent file must contain a JSON object matching UserIntent.');
  }
  return parsed as UserIntent;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

export function registerPlan(program: Command): void {
  program
    .command('plan <intentFile>')
    .description('generate an execution plan for a stored UserIntent (use "-" to read stdin)')
    .action(async (intentFile: string) => {
      let hawkeye: ReturnType<typeof createHawkeye> | null = null;
      try {
        const intent = await readIntent(intentFile);
        const cliCfg = loadConfig();
        if (!cliCfg.ai.apiKey) {
          throw new Error('No AI API key configured (set GEMINI_API_KEY / OPENAI_API_KEY).');
        }
        hawkeye = createHawkeye(buildHawkeyeConfig(cliCfg));
        await hawkeye.initialize();
        const plan = await hawkeye.generatePlan(intent);
        printResult('plan', plan);
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
