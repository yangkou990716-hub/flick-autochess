// 離線快取：改版時把 VERSION +1
const VERSION = 'fa-v36';
const FILES = ['./', 'index.html', 'style.css', 'style-art.css', 'src/ui/icons.js', 'manifest.json', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'data/config.js', 'data/units.js', 'data/traits.js', 'data/items.js', 'data/enemies.js', 'data/run.js', 'data/league.js',
  'src/core/battle.js', 'src/core/ai.js', 'src/core/run.js', 'src/core/league.js', 'vendor/zzfx.js', 'src/ui/sound.js', 'vendor/tabler-icons.js', 'src/ui/sprites.js', 'src/ui/sprites_new.js', 'src/ui/sprites_r8.js', 'src/ui/render.js', 'src/main.js', 'src/ui/settings.js', 'src/ui/title.js', 'src/ui/mobile.js',
  'vendor/firebase-app-compat.js', 'vendor/firebase-database-compat.js', 'data/netconfig.js', 'src/online.js', 'src/netmock.js', 'src/league.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))); self.clients.claim(); });
// 網路優先（拿得到新版就用新版），離線時用快取
// 只管同源的檔案：Firebase 等外部請求（長輪詢網址每次不同）不進快取，避免快取越長越大；只快取成功的回應
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  // 存快取時去掉網址參數（?netmock、?lgtake 不分開存）
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request.url.split('?')[0], cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
