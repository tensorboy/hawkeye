import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['@hawkeye/core'],
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
