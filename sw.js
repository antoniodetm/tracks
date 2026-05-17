const CACHE_NAME = 'visor-rutas-v1';
const ASSETS = [
  './',
  './index.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/gpx.min.js'
];

// Instalar el Service Worker y guardar la estructura básica en caché
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activar el SW y limpiar cachés antiguas si las hubiera
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptar las peticiones de internet
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Si el archivo ya está en la caché (como la estructura de la web o un mapa ya visto), lo devuelve
      if (cachedResponse) {
        // Estrategia "Cache first, network fallback": Si es una imagen de mapa (.png), la servimos y además la actualizamos de fondo
        if (event.request.url.includes('.tile.opentopomap.org')) {
          fetch(event.request).then(networkResponse => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
            }
          }).catch(() => {}); // Ignorar errores de red en la montaña
        }
        return cachedResponse;
      }

      // Si no está en caché, va a internet. Si es una imagen de mapa, la guarda en caché para la próxima vez
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && !event.request.url.includes('.tile.opentopomap.org')) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(err => {
        // Si falla internet y no está en caché, no podemos hacer nada (mostrará recuadro gris en el mapa)
        return null;
      });
    })
  );
});