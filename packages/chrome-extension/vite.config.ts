import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';

// Copy manifest and assets after build
function copyExtensionFiles() {
  return {
    name: 'copy-extension-files',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const srcPopupDir = resolve(distDir, 'src', 'popup');
      const destPopupDir = resolve(distDir, 'popup');

      // Move HTML from dist/src/popup to dist/popup and fix paths
      if (existsSync(srcPopupDir)) {
        const htmlFile = resolve(srcPopupDir, 'index.html');
        if (existsSync(htmlFile)) {
          if (!existsSync(destPopupDir)) {
            mkdirSync(destPopupDir, { recursive: true });
          }
          // Read HTML and fix relative paths
          let htmlContent = readFileSync(htmlFile, 'utf-8');
          // Fix paths: ../../popup/ -> ./ (since we're moving to dist/popup/)
          htmlContent = htmlContent.replace(/\.\.\/\.\.\/popup\//g, './');
          writeFileSync(resolve(destPopupDir, 'index.html'), htmlContent);
        }
        // Remove dist/src folder
        rmSync(resolve(distDir, 'src'), { recursive: true, force: true });
      }

      // Copy manifest.json
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(distDir, 'manifest.json')
      );

      // Copy public folder contents (locales)
      const publicDir = resolve(__dirname, 'public');
      if (existsSync(publicDir)) {
        cpSync(publicDir, distDir, { recursive: true });
      }

      // Create icons folder placeholder
      const iconsDir = resolve(distDir, 'icons');
      if (!existsSync(iconsDir)) {
        mkdirSync(iconsDir, { recursive: true });
      }

      console.log('✓ Extension files copied to dist/');
    },
  };
}

export default defineConfig({
  plugins: [copyExtensionFiles()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return `${chunkInfo.name}/index.js`;
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          if (name.endsWith('.css')) {
            return 'popup/styles.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
