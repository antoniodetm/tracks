const CACHE_NAME = 'visor-gira-v1';
const ASSETS = [
  './',
  './index.html',
  'https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.js',
  'https://cdnjs.cloudflare.com/ajax/libs/togeojson/0.16.0/togeojson.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => { if (k !== CACHE_NAME) return caches.delete(k); })))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const url = event.request.url;
      const esMapa = url.includes('opentopomap.org') || url.includes('arcgisonline.com');

      if (cachedResponse) {
        if (esMapa) {
          fetch(event.request).then(netRes => {
            if (netRes.status === 200) caches.open(CACHE_NAME).then(c => c.put(event.request, netRes));
          }).catch(() => {});
        }
        return cachedResponse;
      }

      return fetch(event.request).then(netRes => {
        if (!netRes || netRes.status !== 200) return netRes;
        if (esMapa) {
          const resClone = netRes.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, resClone));
        }
        return netRes;
      }).catch(() => null);
    })
  );
});