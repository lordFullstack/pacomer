// Pa' Comer POS — Service Worker (LOOP 10, app shell offline)
// Solo cachea el "cascaron" estatico de la app (HTML/CSS/JS/iconos).
// NUNCA cachea llamadas a Supabase (API/Auth) — los datos siempre deben
// venir en vivo o pasar por la cola de sincronizacion de js/13-offline-sync.js.
//
// IMPORTANTE: subir CACHE_NAME (p.ej. 'pacomer-shell-v3') cada vez que
// cambie la lista de archivos de APP_SHELL, para que el navegador note
// que este archivo cambio y dispare el ciclo de actualizacion.
var CACHE_NAME = 'pacomer-shell-v2';
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
  './js/14-auditoria.js',
  './js/15-dashboard.js',
  './js/16-init.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(APP_SHELL); })
  );
  // No se llama a self.skipWaiting() aca: el service worker nuevo se queda
  // "esperando" hasta que la pagina lo confirme (ver mensaje SKIP_WAITING
  // mas abajo, disparado por el boton "Actualizar" de js/16-init.js).
  // Asi, si alguien esta a mitad de una venta cuando se publica una version
  // nueva, no se le cambia el codigo por debajo silenciosamente.
});

self.addEventListener('message', function(event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
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

  // App shell del propio origen: red primero (para no quedar "atascado" en
  // una version vieja mientras hay internet), cache solo como respaldo sin
  // conexion. Cada respuesta buena tambien refresca el cache offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request).then(function(resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copy); });
        }
        return resp;
      }).catch(function() { return caches.match(event.request); })
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
