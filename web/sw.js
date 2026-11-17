// Network-first for the app's own files, falling back to the cache when offline.
// Backend calls (POST, other origin) are never cached.

const CACHE = 'foodies-shell';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './api.js',
  './geo.js',
  './ui.js',
  './state.js',
  './list.js',
  './place.js',
  './dishes.js',
  './add.js',
  './photos.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './fonts/nunito-latin.woff2',
  './fonts/fredoka-latin.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })),
  );
});
