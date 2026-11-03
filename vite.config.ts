/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Offline support, set up like grammatik.deulern.com. A new version waits until every
    // tab is closed instead of reloading mid-session; there is no "update ready" prompt.
    // ponytail: add Grammatik's ReloadPrompt if fixes need to reach open tabs sooner.
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'script',
      manifest: false, // public/manifest.webmanifest is linked from index.html already
      workbox: {
        // Everything, all three verb levels included (~160 KB gzipped), so every
        // verb works offline. A release re-downloads only the files that changed.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Logic tests run in node; component tests opt into jsdom per file.
    environment: 'node',
  },
  build: {
    // The verb datasets are large by nature and deliberately split per level;
    // they are lazily fetched, so their size is not a startup cost.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Keep each CEFR dataset in its own chunk so a level is only
        // downloaded when the learner actually enables it.
        manualChunks(id) {
          if (id.includes('/data/verbs/')) {
            const match = /verbs\/(a1|a2|b1)\./.exec(id);
            if (match) return `verbs-${match[1]}`;
          }
          return undefined;
        },
      },
    },
  },
});
