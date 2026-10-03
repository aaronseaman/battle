// Service worker: precaches the whole app shell so the game runs fully offline.
// Bump CACHE whenever any shipped code file changes.
// Art (assets/art/**) is cached at runtime the first time it loads; the art
// manifest is network-first, and its "version" busts sprite URLs (?v=N), so new
// artwork shows up on the next launch without bumping CACHE.

const CACHE = 'reef-rumble-v1.1.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './src/main.js',
  './src/config.js',
  './src/input.js',
  './src/audio.js',
  './src/storage.js',
  './src/ui/ui.js',
  './src/render/renderer.js',
  './src/render/sprites.js',
  './src/core/game.js',
  './src/core/util.js',
  './src/core/path.js',
  './src/core/grid.js',
  './src/core/events.js',
  './src/core/entities.js',
  './src/core/combat.js',
  './src/core/enemies.js',
  './src/core/bosses.js',
  './src/core/towers.js',
  './src/core/projectiles.js',
  './src/core/player.js',
  './src/core/waves.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network-first (falling back to cache) for the art manifest; cache-first for
// everything else of ours; foreign requests go straight to the network.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/assets/art/manifest.json')) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || Response.error())),
    );
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: !url.pathname.includes('/assets/art/') }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
