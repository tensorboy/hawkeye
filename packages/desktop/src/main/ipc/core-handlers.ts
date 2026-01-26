import { ipcMain } from 'electron';
import type { HawkeyeService } from '../services/hawkeye-service';

export function registerCoreHandlers(hawkeyeService: HawkeyeService) {
  ipcMain.handle('observe', async () => {
    return hawkeyeService.perceiveAndRecognize();
  });

  ipcMain.handle('generate-plan', async (_event, intentId: string) => {
    return hawkeyeService.generatePlan(intentId);
  });

  ipcMain.handle('execute-plan', async () => {
    const hawkeye = hawkeyeService.getInstance();
    if (!hawkeye) throw new Error('Not initialized');
    const plan = hawkeye.getCurrentPlan();
    if (!plan) throw new Error('Plan not found');
    return hawkeye.executePlan(plan);
  });

  ipcMain.handle('pause-execution', async (_event, planId: string) => {
    return hawkeyeService.getInstance()?.pauseExecution(planId) ?? false;
  });

  ipcMain.handle('resume-execution', async (_event, planId: string) => {
    return hawkeyeService.getInstance()?.resumeExecution(planId);
  });

  ipcMain.handle('cancel-execution', async (_event, planId: string) => {
    return hawkeyeService.getInstance()?.cancelExecution(planId) ?? false;
  });

  ipcMain.handle('intent-feedback', async (_event, intentId: string, feedback: 'accept' | 'reject' | 'irrelevant') => {
    await hawkeyeService.getInstance()?.provideIntentFeedback(intentId, feedback);
  });

  ipcMain.handle('get-intents', () => {
    return hawkeyeService.getInstance()?.getCurrentIntents() || [];
  });

  ipcMain.handle('get-plan', () => {
    return hawkeyeService.getInstance()?.getCurrentPlan();
  });

  ipcMain.handle('get-status', () => {
    return hawkeyeService.getStatus();
  });

  ipcMain.handle('switch-ai-provider', async (_event, provider: 'ollama' | 'gemini' | 'openai') => {
    return hawkeyeService.getInstance()?.switchAIProvider(provider) ?? false;
  });

  ipcMain.handle('get-available-providers', () => {
    return hawkeyeService.getInstance()?.getAvailableProviders() || [];
  });

  ipcMain.handle('chat', async (_event, messages: any) => {
    const hawkeye = hawkeyeService.getInstance();
    if (!hawkeye) throw new Error('Not initialized');
    return hawkeye.chat(messages);
  });

  ipcMain.handle('get-stats', () => {
    return hawkeyeService.getInstance()?.getDatabaseStats();
  });

  ipcMain.handle('cleanup', async (_event, days: number) => {
    return hawkeyeService.getInstance()?.cleanupOldData(days) ?? 0;
  });

  ipcMain.handle('get-execution-history', (_event, limit: number = 20) => {
    return hawkeyeService.getInstance()?.getExecutionHistory(limit) ?? [];
  });

  ipcMain.handle('get-last-context', async () => {
    const hawkeye = hawkeyeService.getInstance();
    if (!hawkeye) return { success: false, error: 'Not initialized' };

    // Workaround for type checking if needed
    const context = (hawkeye as any).getLastContext();
    if (!context) return { success: false, error: 'No context' };

    return {
      success: true,
      screenshot: context.screenshot,
      ocrText: context.ocrText,
      timestamp: context.timestamp,
    };
  });
}
