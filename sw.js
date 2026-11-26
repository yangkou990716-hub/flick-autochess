// 離線快取：改版時把 VERSION +1
const VERSION = 'fa-v20';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icons/icon-180.png', 'icons/icon-512.png',
  'data/config.js', 'data/units.js', 'data/traits.js', 'data/items.js', 'data/enemies.js', 'data/run.js', 'data/league.js',
  'src/core/battle.js', 'src/core/ai.js', 'src/core/run.js', 'src/core/league.js', 'src/ui/sound.js', 'src/ui/sprites.js', 'src/ui/render.js', 'src/main.js',
  'vendor/firebase-app-compat.js', 'vendor/firebase-database-compat.js', 'data/netconfig.js', 'src/online.js', 'src/netmock.js', 'src/league.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))); self.clients.claim(); });
// 網路優先（拿得到新版就用新版），離線時用快取
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
