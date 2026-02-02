import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          bootstrap: 'src/main/bootstrap.ts',
          index: 'src/main/index.ts',
        },
        external: ['@hawkeye/core', 'node-llama-cpp', 'smart-whisper'],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['@hawkeye/core'],
      },
    },
  },
  renderer: {
    plugins: [react()],
  },
});
