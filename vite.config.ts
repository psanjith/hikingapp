import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// The app is served from https://psanjith.github.io/hikingapp/, so every asset
// URL needs the /hikingapp/ prefix. Using it in dev too keeps paths identical.
const BASE = '/hikingapp/';

export default defineConfig({
  base: BASE,
  build: {
    // MapLibre alone is ~1 MB. That's fine here: the service worker caches it
    // once at install, and after that it loads from the phone, not the network.
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    // Phones only allow GPS on HTTPS pages, so the dev server uses a
    // self-signed certificate. This is what lets you test on an iPhone over Wi-Fi.
    basicSsl(),
    VitePWA({
      // 'prompt' rather than 'autoUpdate': we never want the app to reload
      // itself mid-hike. The user gets a "tap to update" banner instead.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Hiking App',
        short_name: 'Hike',
        description: 'Free, beginner-friendly hiking maps that work with no signal.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f1ea',
        theme_color: '#2f6b3a',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the whole app shell so it opens with zero connectivity.
        // .mjs: MapLibre's worker. .pbf/.json: map fonts and icon sprites.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest,pbf,json}'],
        // MapLibre makes our main JS bundle large. Raise Workbox's 2 MB
        // per-file cap so the map library is never silently left uncached.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Take control of the page on first install, so everything needed
        // offline is cached from the very first visit.
        clientsClaim: true,
        // Map regions live in OPFS, not the service worker cache; their
        // byte-range requests go straight to the network or the device.
        globIgnores: ['dev-maps/**'],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
