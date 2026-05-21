// Nombre de la versión de la caché. Cámbialo si actualizas la app para forzar el refresco.
const CACHE_NAME = 'gps-orientado-v1';

// Archivos estáticos indispensables para que la app funcione offline
const ASSETS_CRITICOS = [
  './',
  './index.html',
  'https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.js',
  'https://cdnjs.cloudflare.com/ajax/libs/togeojson/0.16.0/togeojson.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// 1. Evento de Instalación: Guarda en caché los archivos críticos inmediamente
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Cacheando recursos críticos');
        return cache.addAll(ASSETS_CRITICOS);
      })
      .then(() => self.skipWaiting()) // Fuerza al SW entrante a activarse de inmediato
  );
});

// 2. Evento de Activación: Limpia cachés antiguas para evitar conflictos de versiones
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((clavesModulos) => {
      return Promise.all(
        clavesModulos.map((clave) => {
          if (clave !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché antigua:', clave);
            return caches.delete(clave);
          }
        })
      );
    }).then(() => self.clients.claim()) // Toma el control de las pestañas abiertas inmediatamente
  );
});

// 3. Evento Fetch: Intercepta las peticiones para servir desde la caché si no hay red
self.addEventListener('fetch', (evento) => {
  // Ignorar peticiones que no sean GET (como subidas de datos si las hubiera)
  if (evento.request.method !== 'GET') return;

  evento.respondWith(
    caches.match(evento.request).then((respuestaCacheada) => {
      // Si el archivo está en la caché, lo devuelve (¡ahorro de datos y batería!)
      if (respuestaCacheada) {
        return respuestaCacheada;
      }

      // Si no está en caché, lo busca en internet
      return fetch(evento.request)
        .then((respuestaRed) => {
          // Si la respuesta es válida, clonamos y guardamos dinámicamente (útil para tiles de mapas que se repitan)
          if (respuestaRed && respuestaRed.status === 200 && respuestaRed.type === 'basic') {
            const respuestaA-Cachear = respuestaRed.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(evento.request, respuestaA-Cachear);
            });
          }
          return respuestaRed;
        })
        .catch(() => {
          // Si falla la red y tampoco está en caché (ej. una zona del mapa nueva sin cobertura)
          console.log('[Service Worker] Recurso no disponible offline:', evento.request.url);
        });
    })
  );
});