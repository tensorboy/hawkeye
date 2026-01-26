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

// Handle EPIPE on stdout/stderr to prevent crashes when terminal closes
// This is especially important when running in dev mode with electron-vite
process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EPIPE') throw err;
});
process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EPIPE') throw err;
});

console.log('BOOTSTRAP: Starting...');

// Set up global error handlers BEFORE anything else
process.on('uncaughtException', (error) => {
  // EPIPE errors are harmless - they occur when writing to a closed pipe
  // (e.g., terminal closed, console.log to closed stdout)
  // We should NOT crash the app or show a dialog for these
  if ((error as NodeJS.ErrnoException).code === 'EPIPE') {
    // Silently ignore EPIPE - it's expected when terminal closes
    return;
  }

  console.error('UNCAUGHT EXCEPTION:', error.message);
  console.error('Stack:', error.stack);
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
