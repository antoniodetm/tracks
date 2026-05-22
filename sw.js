const CACHE_NAME = 'gps-orientado-v2';

// Archivos críticos que la app necesita clonar para correr 100% offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  'https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.js',
  'https://cdnjs.cloudflare.com/ajax/libs/togeojson/0.16.0/togeojson.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/pmtiles@3.2.0/dist/pmtiles.js'
];

// Instalación: Guarda los archivos en la caché del navegador
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpia cachés antiguas si las hubiera
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia: Cache First (Busca en caché primero, si no hay, va a la red)
// Ideal para apps offline ya que prioriza la velocidad y la falta de cobertura.
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones que no sean GET (como subidas de archivos locales)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});