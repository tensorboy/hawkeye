import { ipcMain } from 'electron';
import type { HawkeyeService } from '../services/hawkeye-service';

export function registerDebugHandlers(hawkeyeService: HawkeyeService) {
  ipcMain.handle('debug-get-events', (_event, filter) => {
    const hawkeye = hawkeyeService.getInstance();
    if (!hawkeye) return [];
    const collector = hawkeye.getEventCollector();
    if (filter) return collector.getFiltered(filter);
    return collector.getAll();
  });

  ipcMain.handle('debug-get-recent', (_event, count) => {
    return hawkeyeService.getInstance()?.getEventCollector().getRecent(count) || [];
  });

  ipcMain.handle('debug-get-since', (_event, timestamp) => {
    return hawkeyeService.getInstance()?.getEventCollector().getSince(timestamp) || [];
  });

  ipcMain.handle('debug-clear-events', () => {
    const h = hawkeyeService.getInstance();
    if (!h) return false;
    h.getEventCollector().clear();
    return true;
  });

  ipcMain.handle('debug-pause', () => {
    const h = hawkeyeService.getInstance();
    if (!h) return false;
    h.getEventCollector().pause();
    return true;
  });

  ipcMain.handle('debug-resume', () => {
    const h = hawkeyeService.getInstance();
    if (!h) return false;
    h.getEventCollector().resume();
    return true;
  });

  ipcMain.handle('debug-get-status', () => {
    const h = hawkeyeService.getInstance();
    if (!h) return { paused: false, count: 0, totalCount: 0 };
    const c = h.getEventCollector();
    return {
      paused: c.isPaused(),
      count: c.getCount(),
      totalCount: c.getTotalCount(),
      config: c.getConfig(),
    };
  });

  ipcMain.handle('debug-export', () => {
    return hawkeyeService.getInstance()?.getEventCollector().exportJSON();
  });

  ipcMain.handle('debug-update-config', (_event, config) => {
    const h = hawkeyeService.getInstance();
    if (!h) return false;
    h.getEventCollector().updateConfig(config);
    return true;
  });
}
