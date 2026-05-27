// MEINS! Service Worker
// Strategie: cache-first fuer App-Shell + statische Assets, network-first fuer
// HTML (damit Updates ankommen). PeerJS-CDN wird beim ersten Mal gecached.

const VERSION = 'meins-v4-2026-05-27c';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './assets/logo.svg',
  './assets/logo-maskable.svg',
  './src/main.js',
  './src/util.js',
  './src/store.js',
  './src/game.js',
  './src/multiplayer.js',
  './src/car-search.js',
  './src/brands.js',
  './src/sounds.js',
  './src/avatars.js',
  './src/theme.js',
  './src/photos.js',
  './src/collection.js',
  './src/photo-capture.js',
  './src/messages.js',
  './src/ui.js',
  './src/stats.js',
  './src/data/cars.js',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Fuer Cross-Origin (PeerJS-CDN) und Bild-Daten ggf. nicht cachen
  const sameOrigin = url.origin === self.location.origin;

  // HTML-Navigationen: network-first (damit Updates schnell ankommen)
  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        if (sameOrigin) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req) || await caches.match('./index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Sonst: cache-first, im Hintergrund aktualisieren (stale-while-revalidate)
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const networkPromise = fetch(req).then(res => {
      if (res && res.status === 200 && (sameOrigin || res.type === 'cors')) {
        const clone = res.clone();
        caches.open(VERSION).then(c => c.put(req, clone)).catch(() => {});
      }
      return res;
    }).catch(() => null);
    return cached || (await networkPromise) || Response.error();
  })());
});
