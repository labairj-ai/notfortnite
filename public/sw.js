const CACHE = 'notfortnite-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('notfortnite-') && k !== CACHE).map(k => caches.delete(k)))),
    self.clients.claim(),
  ]));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Documents use fresh manifests online; immutable build assets can use cache.
    if (event.request.mode !== 'navigate') {
      const cached = await cache.match(event.request);
      if (cached) return cached;
    }
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      throw error;
    }
  })());
});
