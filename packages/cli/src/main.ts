/**
 * Hawkeye CLI entry point.
 *
 * Wires up commander and dispatches to the per-subcommand modules.
 */

import { Command } from 'commander';
import { setOutputMode } from './output.js';
import { printError } from './output.js';
import { registerInit } from './commands/init.js';
import { registerPerceive } from './commands/perceive.js';
import { registerPlan } from './commands/plan.js';
import { registerExecute } from './commands/execute.js';
import { registerRun } from './commands/run.js';
import { registerChat } from './commands/chat.js';
import { registerDaemon } from './commands/daemon.js';

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('hawkeye')
    .description('Hawkeye CLI — perception, planning, and execution from your shell')
    .version('0.1.0', '-v, --version', 'print the CLI version')
    .option('--json', 'emit machine-readable NDJSON output instead of pretty text')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts<{ json?: boolean }>();
      if (opts.json) setOutputMode('json');
    });

  registerInit(program);
  registerPerceive(program);
  registerPlan(program);
  registerExecute(program);
  registerRun(program);
  registerChat(program);
  registerDaemon(program);

  program.showHelpAfterError();

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  printError(err);
  process.exit(1);
});
