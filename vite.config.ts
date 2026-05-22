import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { fileURLToPath } from 'node:url';
import manifest from './manifest.json' with { type: 'json' };

const contentScriptEntry = fileURLToPath(
  new URL('./src/content/main.ts', import.meta.url)
);

export default defineConfig({
  plugins: [crx({ manifest })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@schemas': fileURLToPath(new URL('./src/schemas', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      // Add the content script as an addressable input. We bypass crxjs's
      // manifest-driven discovery for this one entry so the file ships at
      // a stable path (`content-script.js`) the service worker can hand
      // to chrome.scripting.registerContentScripts.
      input: {
        'pagewise-content-script': contentScriptEntry,
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'pagewise-content-script') {
            return 'content-script.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
});
