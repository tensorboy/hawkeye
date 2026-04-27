import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node20',
  banner: {
    js: '#!/usr/bin/env node',
  },
  shims: false,
  clean: true,
  sourcemap: true,
  dts: false,
  splitting: false,
  // @hawkeye/core has heavy native deps (better-sqlite3, screenshot-desktop, etc.)
  // Keep it external so Node resolves it from node_modules at runtime.
  external: [
    '@hawkeye/core',
    'better-sqlite3',
    'sqlite-vec',
    'screenshot-desktop',
    'node-llama-cpp',
    /\.node$/,
  ],
});
