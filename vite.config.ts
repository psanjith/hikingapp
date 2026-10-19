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
        // (.mjs covers MapLibre's background worker script.)
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest}'],
        // MapLibre makes our main JS bundle large. Raise Workbox's 2 MB
        // per-file cap so the map library is never silently left uncached.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Take control of the page on first install, so the map tiles viewed
        // during the very first visit are already cached for offline use.
        clientsClaim: true,
        // Temporary (Stage 1): cache online map data from OpenFreeMap as it's
        // viewed. Stage 2 replaces this with a region file stored on-device.
        runtimeCaching: [
          {
            // The style file points at the current weekly tile build, so
            // refresh it in the background rather than pinning an old one.
            urlPattern: ({ url }) =>
              url.origin === 'https://tiles.openfreemap.org' && url.pathname.startsWith('/styles/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'openfreemap-styles',
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Tiles, fonts and icons have versioned URLs, so a cached copy is
            // always correct: serve from cache first, network only if missing.
            urlPattern: ({ url }) => url.origin === 'https://tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'openfreemap',
              expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
