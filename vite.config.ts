import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/**
 * `SINGLE_FILE=1` builds for `scripts/build-single-file.mjs`: no code splitting, so the whole
 * app (heic2any's lazy chunk included) lands in one entry file that the script can inline.
 * The normal deploy build keeps the split, so an iPhone-free visitor never downloads the
 * 1.3 MB HEIC decoder.
 */
const singleFile = process.env.SINGLE_FILE === '1';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: singleFile
    ? {
        rollupOptions: { output: { inlineDynamicImports: true } },
        // Keep the worker a separate file: the script turns it into a blob: URL itself.
        assetsInlineLimit: 0,
      }
    : {},
});
