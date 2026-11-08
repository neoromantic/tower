const cacheName = 'tower-__CT_VERSION__';
const assets = ['./', 'index.html', 'index.js', 'index.wasm', 'hero.png', 'app.js', 'app.css', 'manifest.webmanifest', 'art/icon-192.png', 'art/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets.map(asset => new Request(asset, {cache: 'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('tower-') && key !== cacheName).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    let key = event.request;
    if (event.request.mode === 'navigate' && url.pathname === new URL('./', self.registration.scope).pathname) key = new URL('./', self.registration.scope).href;
    const cached = await cache.match(key);
    if (cached) return cached;
    return fetch(event.request);
  }));
});
