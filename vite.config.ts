import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'icons/icon-32-v2.png',
        'icons/icon-180-v2.png',
        'icons/icon-192-v2.png',
        'icons/icon-512-v2.png',
        'icons/icon-512-maskable-v2.png',
        'brand/og-image-v2.png',
      ],
      manifest: {
        name: 'AscendOS',
        short_name: 'AscendOS',
        description: 'Dein Betriebssystem für den Arbeitstag.',
        lang: 'de',
        display: 'standalone',
        start_url: '/',
        background_color: '#0F1012',
        theme_color: '#0F1012',
        icons: [
          { src: '/icons/icon-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Eigene Datei statt Wiederverwendung von icon-512 fuer beide
          // Zwecke: maskable braucht mehr Sicherheitsabstand, weil
          // Android das Icon auf verschiedene Formen zuschneidet.
          { src: '/icons/icon-512-maskable-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // ESM-sicher: __dirname existiert in "type": "module" nicht.
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
