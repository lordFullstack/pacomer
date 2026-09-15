// Pa' Comer POS — Service Worker (LOOP 10, app shell offline)
// Solo cachea el "cascaron" estatico de la app (HTML/CSS/JS/iconos).
// NUNCA cachea llamadas a Supabase (API/Auth) — los datos siempre deben
// venir en vivo o pasar por la cola de sincronizacion de js/13-offline-sync.js.
var CACHE_NAME = 'pacomer-shell-v1';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/00-estado.js',
  './js/01-persistencia-legacy.js',
  './js/02-utils-navegacion.js',
  './js/03-mesas.js',
  './js/04-quick-service.js',
  './js/05-clientes.js',
  './js/06-proveedores.js',
  './js/07-caja.js',
  './js/08-respaldo.js',
  './js/09-stats-roles.js',
  './js/10-ticket.js',
  './js/11-configuracion.js',
  './js/12-auth.js',
  './js/13-offline-sync.js',
  './js/14-init.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(APP_SHELL); }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.filter(function(n) { return n !== CACHE_NAME; }).map(function(n) { return caches.delete(n); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Nunca interceptar Supabase (datos en vivo, nunca cache) ni metodos distintos de GET.
  if (event.request.method !== 'GET' || url.hostname.indexOf('supabase.co') > -1) return;

  // App shell del propio origen: cache-first con actualizacion en segundo plano.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        var fetchPromise = fetch(event.request).then(function(resp) {
          if (resp && resp.ok) {
            var copy = resp.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copy); });
          }
          return resp;
        }).catch(function() { return cached; });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Recursos externos (fuentes, CDN de Supabase JS): cache-first simple.
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copy); });
        }
        return resp;
      }).catch(function() { return cached; });
    })
  );
});
