const CACHE_NAME = 'gps-orientado-v3';

// Lista de recursos externos que la app necesita descargar y recordar para funcionar offline
const ASSETS_CRITICOS = [
  './',
  './index.html',
  'https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.js',
  'https://cdnjs.cloudflare.com/ajax/libs/togeojson/0.16.0/togeojson.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/pmtiles@3.2.0/dist/pmtiles.js' // Indispensable para que los mapas locales funcionen offline
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_CRITICOS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) => {
      return Promise.all(
        claves.map((clave) => {
          if (clave !== CACHE_NAME) {
            return caches.delete(clave);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;

  evento.respondWith(
    caches.match(evento.request).then((respuestaCacheada) => {
      if (respuestaCacheada) {
        return respuestaCacheada;
      }
      return fetch(evento.request);
    })
  );
});