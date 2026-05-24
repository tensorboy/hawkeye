/**
 * Hawkeye Desktop - Bootstrap
 * This file runs BEFORE the main process to catch early errors
 */

// CRITICAL: Remove ELECTRON_RUN_AS_NODE if set
// When this env var is set (e.g., by VSCode/Claude Code which runs as Electron),
// Electron runs as plain Node.js and require('electron') returns the path string
// instead of the Electron API. This must be deleted BEFORE any Electron imports.
if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE;
}

function isIgnorableIoError(error: NodeJS.ErrnoException | Error): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  const message = String(error?.message || '');
  return code === 'EPIPE' || code === 'EIO' || message.includes('write EIO');
}

// Handle terminal stream errors to prevent dev-process crashes
// This is especially important when running in dev mode with electron-vite
process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (!isIgnorableIoError(err)) throw err;
});
process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (!isIgnorableIoError(err)) throw err;
});

console.log('BOOTSTRAP: Starting...');

function persistCrashLog(kind: string, message: string, stack?: string) {
  try {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const file = path.join(os.tmpdir(), 'hawkeye_uncaught.log');
    const payload = [
      `\n[${new Date().toISOString()}] ${kind}`,
      `message: ${message}`,
      stack ? `stack: ${stack}` : 'stack: <none>',
      `pid: ${process.pid}`,
      ''
    ].join('\n');
    fs.appendFileSync(file, payload, 'utf8');
  } catch {
    // Ignore logging failures to avoid recursive crashes
  }
}

// Set up global error handlers BEFORE anything else
process.on('uncaughtException', (error) => {
  // EPIPE errors are harmless - they occur when writing to a closed pipe
  // (e.g., terminal closed, console.log to closed stdout)
  // We should NOT crash the app or show a dialog for these
  if (isIgnorableIoError(error)) {
    // Silently ignore terminal I/O errors (e.g. EPIPE / EIO)
    return;
  }

  console.error('UNCAUGHT EXCEPTION:', error.message);
  console.error('Stack:', error.stack);
  persistCrashLog('uncaughtException', error.message, error.stack);
  try {
    const { dialog } = require('electron');
    dialog.showErrorBox('Uncaught Exception', `${error.message}\n\nCheck console for details.`);
  } catch {
    // Dialog may not be available
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('UNHANDLED REJECTION:', reason);
  if (reason?.stack) {
    console.error('Stack:', reason.stack);
  }
  persistCrashLog('unhandledRejection', String(reason?.message || reason), reason?.stack);
});

// Now try to load the main module
try {
  require('./index');
  console.log('BOOTSTRAP: Main module loaded successfully');
} catch (error: any) {
  console.error('BOOTSTRAP: FAILED TO LOAD MAIN MODULE:', error.message);
  console.error('Stack:', error.stack);

  const { dialog, app } = require('electron');

  app.whenReady().then(() => {
    dialog.showErrorBox('Failed to start Hawkeye', `${error.message}\n\nCheck console for details.`);
    app.quit();
  });
}
