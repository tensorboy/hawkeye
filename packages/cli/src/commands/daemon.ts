import type { Command } from 'commander';
import { createHawkeye } from '@hawkeye/core';
import { buildHawkeyeConfig, loadConfig } from '../config.js';
import { printError, printEvent, printInfo } from '../output.js';

/**
 * Long-running observe loop.
 *
 * The Hawkeye core engine emits events like `intents:detected`, `perceiving`,
 * and `execution:*` via its EventEmitter. We subscribe to a handful of them
 * and re-emit each as NDJSON on stdout. SIGINT triggers a clean shutdown.
 *
 * If event subscriptions yield nothing within an interval, we still poll
 * `perceiveAndRecognize` so the daemon is useful even before any signal fires.
 */
export function registerDaemon(program: Command): void {
  program
    .command('daemon')
    .description('long-running observe + intent loop, emitting NDJSON events to stdout')
    .option('--interval <ms>', 'polling interval in milliseconds', '3000')
    .action(async (opts: { interval: string }) => {
      const intervalMs = Number.parseInt(opts.interval, 10) || 3000;
      let hawkeye: ReturnType<typeof createHawkeye> | null = null;
      let timer: NodeJS.Timeout | null = null;
      let stopping = false;

      const shutdown = async (signal: string): Promise<void> => {
        if (stopping) return;
        stopping = true;
        printInfo(`Received ${signal}, shutting down...`);
        if (timer) clearInterval(timer);
        try {
          await hawkeye?.shutdown();
        } catch (err) {
          printError(err);
        }
        process.exit(0);
      };

      process.on('SIGINT', () => {
        void shutdown('SIGINT');
      });
      process.on('SIGTERM', () => {
        void shutdown('SIGTERM');
      });

      try {
        const cliCfg = loadConfig({
          observe: {
            intervalMs,
            changeThreshold: 0.05,
          },
        });
        if (!cliCfg.ai.apiKey) {
          throw new Error('No AI API key configured (set GEMINI_API_KEY / OPENAI_API_KEY).');
        }

        hawkeye = createHawkeye(buildHawkeyeConfig(cliCfg));

        // Best-effort event subscriptions. We pick the events that actually
        // exist on the Hawkeye class (verified in packages/core/src/hawkeye.ts).
        const events = [
          'ready',
          'perceiving',
          'intents:detected',
          'plan:generated',
          'execution:step:start',
          'execution:step:complete',
          'execution:step:error',
          'execution:completed',
          'autonomous:suggestions',
          'autonomous:intent',
          'error',
        ];
        for (const evt of events) {
          hawkeye.on(evt, (data: unknown) => printEvent(evt, data));
        }

        await hawkeye.initialize();
        printEvent('daemon:started', { intervalMs });

        // Poll the perception loop on the interval — events fire as a side
        // effect and `intents:detected` is emitted from inside.
        timer = setInterval(() => {
          if (stopping || !hawkeye) return;
          hawkeye.perceiveAndRecognize().catch((err) => {
            printEvent('poll:error', { message: (err as Error).message });
          });
        }, intervalMs);

        // Block forever (until SIGINT/SIGTERM).
        await new Promise<void>(() => {
          /* never resolves */
        });
      } catch (err) {
        printError(err);
        if (timer) clearInterval(timer);
        try {
          await hawkeye?.shutdown();
        } catch {
          /* ignore */
        }
        process.exit(1);
      }
    });
}
