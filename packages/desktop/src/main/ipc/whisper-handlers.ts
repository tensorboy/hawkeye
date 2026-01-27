import { ipcMain, systemPreferences } from 'electron';
import type { WhisperService } from '../services/whisper-service';

export function registerWhisperHandlers(whisperService: WhisperService) {
  ipcMain.handle('whisper-transcribe', async (_event, audioBuffer: Buffer) => {
    return whisperService.transcribe(audioBuffer);
  });

  ipcMain.handle('whisper-status', () => {
    return whisperService.getStatus();
  });

  ipcMain.handle('whisper-check-mic', async () => {
    if (process.platform === 'darwin') {
      return systemPreferences.getMediaAccessStatus('microphone');
    }
    return 'granted';
  });

  ipcMain.handle('whisper-request-mic', async () => {
    if (process.platform === 'darwin') {
      return systemPreferences.askForMediaAccess('microphone');
    }
    return true;
  });
}
