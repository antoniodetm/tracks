const CACHE_NAME = 'visor-rutas-v2'; // Incrementamos la versión para actualizar cachés viejas
const ASSETS = [
  './',
  './index.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/gpx.min.js'
];

// 1. Fase de Instalación: Se guarda el esqueleto básico de la App en la memoria del iPhone
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Fase de Activación: Se eliminan cachés de versiones anteriores de la app si existieran
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

// 3. Interceptación de Peticiones (El núcleo Offline)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      
      // Si el recurso ya se encuentra guardado en la memoria caché
      if (cachedResponse) {
        
        // Estrategia: Si la petición corresponde a imágenes de mapas (OpenTopoMap o Esri Satélite)
        if (event.request.url.includes('.tile.opentopomap.org') || event.request.url.includes('server.arcgisonline.com')) {
          // Intentamos descargar la versión más reciente en segundo plano por si ha cambiado algo
          fetch(event.request).then(networkResponse => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
            }
          }).catch(() => {}); // Si falla (estás en la montaña sin cobertura), se ignora el error silenciosamente
        }
        
        return cachedResponse; // Devolvemos inmediatamente la imagen que tenemos en memoria
      }

      // Si el recurso NO está en caché, lo solicitamos a internet de manera normal
      return fetch(event.request).then(networkResponse => {
        // Si no es una respuesta válida, la devolvemos tal cual
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        
        // Si es una petición válida y pertenece a uno de nuestros proveedores de mapas, la clonamos y la guardamos
        if (event.request.url.includes('.tile.opentopomap.org') || event.request.url.includes('server.arcgisonline.com')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        
        return networkResponse;
      }).catch(err => {
        // Si no hay internet y no estaba guardado previamente, devolverá un espacio vacío en el mapa
        return null;
      });
    })
  );
});