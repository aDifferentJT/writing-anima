import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import type { Plugin } from 'vite';

// Plugin to inline CSS into error.html
function inlineErrorStyles(): Plugin {
  return {
    name: 'inline-error-styles',
    apply: 'build',
    enforce: 'post',
    writeBundle(options) {
      const outDir = options.dir || 'dist';
      const errorHtmlPath = resolve(outDir, 'error.html');
      const assetsDir = resolve(outDir, 'assets');

      try {
        let html = readFileSync(errorHtmlPath, 'utf-8');

        // Find the index-*.css file
        const files = readdirSync(assetsDir);
        const indexCssFile = files.find(f => f.startsWith('index-') && f.endsWith('.css'));

        if (indexCssFile) {
          const cssPath = resolve(assetsDir, indexCssFile);
          const css = readFileSync(cssPath, 'utf-8');

          // Replace the link tag with an inline style tag
          html = html.replace(
            /<link rel="stylesheet" crossorigin href="\/assets\/[^"]*">/,
            `<style>${css}</style>`
          );

          writeFileSync(errorHtmlPath, html, 'utf-8');
        }
      } catch {
        // Silently fail if files don't exist
      }
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), inlineErrorStyles()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        animas: resolve(__dirname, 'animas.html'),
        settings: resolve(__dirname, 'settings.html'),
        project: resolve(__dirname, 'project.html'),
        project_settings: resolve(__dirname, 'project_settings.html'),
        error: resolve(__dirname, 'error.html'),
      },
    },
  },
});
