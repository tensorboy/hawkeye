import type { Command } from 'commander';
import {
  createAIManager,
  type AIManagerConfig,
  type AIMessage,
} from '@hawkeye/core';
import { loadConfig } from '../config.js';
import { printError, printResult } from '../output.js';

export function registerChat(program: Command): void {
  program
    .command('chat <message>')
    .description('one-turn AI chat (no perception, no execution)')
    .action(async (message: string) => {
      try {
        const cliCfg = loadConfig();
        if (!cliCfg.ai.apiKey) {
          throw new Error(
            'No AI API key configured (set GEMINI_API_KEY / OPENAI_API_KEY).'
          );
        }

        const aiConfig: AIManagerConfig = {
          providers: [
            {
              type: cliCfg.ai.provider,
              apiKey: cliCfg.ai.apiKey,
              model: cliCfg.ai.model,
              baseUrl: cliCfg.ai.baseUrl,
            },
          ],
          preferredProvider: cliCfg.ai.provider,
          enableFailover: false,
        };

        const ai = createAIManager(aiConfig);
        await ai.initialize();

        const messages: AIMessage[] = [{ role: 'user', content: message }];
        const response = await ai.chat(messages);
        printResult('reply', response.text);

        await ai.terminate();
        process.exit(0);
      } catch (err) {
        printError(err);
        process.exit(1);
      }
    });
}
