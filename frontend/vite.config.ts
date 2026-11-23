import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// /api goes to the Django API: the "api" container in docker compose (API_PROXY),
// and Cloud Run through the Firebase Hosting rewrite in the cloud (firebase.json).
//
// PWA (D61): the web app manifest (install, icons, Android share target) and a Workbox service worker that keeps
// only the app's own built files on the phone, so the app opens offline and the saved list shows. API replies
// are never cached by it: they hold private data, and the offline list already lives in localStorage
// (foodies.cache). Built files only; the Vite dev server runs without a service worker.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // a new deploy takes over on the next open; no prompt
      injectRegister: 'script', // registerSW.js as a file, not an inline script
      includeAssets: ['icons/apple-touch-icon.png'], // the manifest's own icons are added automatically
      manifest: {
        id: '/',
        name: 'Foodies Directory',
        short_name: 'Foodies',
        description: 'Our list of places to eat, near me first.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#fffdf7',
        theme_color: '#fffdf7',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Android: "Foodies" in the Share menu opens /?title=…&text=…&url=… (readShare in App.tsx).
        share_target: { action: '/', method: 'GET', enctype: 'application/x-www-form-urlencoded', params: { title: 'title', text: 'text', url: 'url' } },
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//], // the API and its admin always come from the network
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { proxy: { '/api': process.env.API_PROXY ?? 'http://localhost:8000' } },
});
