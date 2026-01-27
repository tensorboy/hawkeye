import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  external: [
    // Native Node.js modules that cannot be bundled
    'better-sqlite3',
    'sqlite-vec',
    'screenshot-desktop',
    '@reflink/reflink',
    'node-llama-cpp',
    // Platform-specific native bindings
    /\.node$/,
  ],
  noExternal: [],
});
