/**
 * Life Tree IPC Handlers
 *
 * Exposes Life Tree functionality to the renderer process.
 */

import { ipcMain } from 'electron';
import type { LifeTreeService } from '../services/life-tree-service';

export function registerLifeTreeHandlers(lifeTreeService: LifeTreeService) {
  // Get the current tree
  ipcMain.handle('life-tree:get', async () => {
    return lifeTreeService.getTree();
  });

  // Rebuild tree from database
  ipcMain.handle('life-tree:rebuild', async () => {
    return lifeTreeService.rebuildTree();
  });

  // Propose an experiment for a node
  ipcMain.handle('life-tree:propose-experiment', async (_event, nodeId: string, phase?: string) => {
    return lifeTreeService.proposeExperiment(nodeId, phase as any);
  });

  // Start an experiment
  ipcMain.handle('life-tree:start-experiment', async (_event, nodeId: string, proposal: any, phase: string) => {
    return lifeTreeService.startExperiment(nodeId, proposal, phase as any);
  });

  // Conclude an experiment
  ipcMain.handle('life-tree:conclude-experiment', async (_event, experimentNodeId: string, status: string) => {
    return lifeTreeService.concludeExperiment(experimentNodeId, status as any);
  });

  // Get unlocked phase
  ipcMain.handle('life-tree:get-unlocked-phase', async () => {
    return lifeTreeService.getUnlockedPhase();
  });

  // Get all experiments
  ipcMain.handle('life-tree:get-experiments', async () => {
    return lifeTreeService.getAllExperiments();
  });
}
