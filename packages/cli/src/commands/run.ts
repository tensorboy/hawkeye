import type { Command } from 'commander';
import { createHawkeye, type UserIntent } from '@hawkeye/core';
import { buildHawkeyeConfig, loadConfig } from '../config.js';
import { printError, printEvent, printResult } from '../output.js';

function pickTopIntent(intents: UserIntent[]): UserIntent | null {
  if (intents.length === 0) return null;
  return [...intents].sort((a, b) => b.confidence - a.confidence)[0];
}

export function registerRun(program: Command): void {
  program
    .command('run <task>')
    .description('end-to-end: perceive → pick top intent → plan → execute')
    .action(async (taskDescription: string) => {
      let hawkeye: ReturnType<typeof createHawkeye> | null = null;
      try {
        const cliCfg = loadConfig();
        if (!cliCfg.ai.apiKey) {
          throw new Error('No AI API key configured (set GEMINI_API_KEY / OPENAI_API_KEY).');
        }

        hawkeye = createHawkeye(buildHawkeyeConfig(cliCfg));
        await hawkeye.initialize();

        printEvent('phase', { name: 'perceive', task: taskDescription });
        const intents = await hawkeye.perceiveAndRecognize();
        const top = pickTopIntent(intents);
        if (!top) {
          throw new Error('Perception returned no intents — nothing to plan.');
        }
        // Override the description with the user's actual ask so the plan matches it.
        const intent: UserIntent = { ...top, description: taskDescription };
        printEvent('intent:selected', intent);

        printEvent('phase', { name: 'plan' });
        const plan = await hawkeye.generatePlan(intent);
        printEvent('plan:generated', { id: plan.id, steps: plan.steps.length });

        printEvent('phase', { name: 'execute' });
        const execution = await hawkeye.executePlan(plan);
        printResult('execution', execution);

        await hawkeye.shutdown();
        process.exit(execution.status === 'completed' ? 0 : 1);
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
