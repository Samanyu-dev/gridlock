import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'GRIDLOCK — Fantasy Motorsport',
        short_name: 'GRIDLOCK',
        description: 'Build your grid. Own the weekend.',
        start_url: '/',
        display: 'standalone',
        background_color: '#08090b',
        theme_color: '#08090b',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        // The 3D engine chunk, car models, circuit data chunk, and circuit
        // fallback SVGs are only fetched by pages that actually mount a
        // <GLShowroom>/<CircuitStage> — precaching them for every visitor
        // would force a multi-MB background download on first load for
        // people who never open a 3D page. Still cached, just lazily (on
        // first real request) via the runtimeCaching rules below.
        globIgnores: ['**/gl3d-*.js', '**/circuitManifest-*.js', '**/models/**', '**/circuits/*.svg'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gridlock-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 300 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/gl3d-') || url.pathname.includes('/circuitManifest-')
              || url.pathname.startsWith('/models/') || (url.pathname.startsWith('/circuits/') && url.pathname.endsWith('.svg')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'gridlock-3d',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
