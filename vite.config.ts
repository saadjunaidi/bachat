import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script', // separate registerSW.js file, so the strict CSP needs no inline scripts
      includeAssets: ['icons/*.png', 'icons/icon.svg', 'privacy.html', 'robots.txt'],
      manifest: {
        name: 'Bachat Money Planner',
        short_name: 'Bachat',
        description: 'See where your money goes and plan your savings goals. Your statements never leave your device.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F2F5F1',
        theme_color: '#0C7A58',
        lang: 'en-IN',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/privacy\.html$/]
      }
    })
  ],
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 1200 },
  test: { environment: 'node' }
} as any);
