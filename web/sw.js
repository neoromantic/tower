const cacheName = 'tower-__CT_VERSION__';
self.addEventListener('install', event => {
  event.waitUntil(fetch('offline.json', {cache: 'reload'}).then(response => response.json()).then(assets =>
    caches.open(cacheName).then(cache => cache.addAll(['./', 'offline.json', ...assets].map(asset => new Request(asset, {cache: 'reload'}))))));
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
