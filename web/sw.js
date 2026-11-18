// Network-first for the app's own files, falling back to the cache when offline.
// Backend calls (POST, other origin) are never cached.

// One cache per app copy: the live app (scope /…/) and the test copy (scope /…/test/) share this origin.
const CACHE = `foodies-shell-${self.registration.scope}`;
const TEST_SCOPE = new URL('test/', self.registration.scope).href; // the live worker's scope also covers /test/
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
  // 'foodies-shell' was the single cache before the test copy existed.
  event.waitUntil(caches.delete('foodies-shell').then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin || request.url.startsWith(TEST_SCOPE)) return;
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
