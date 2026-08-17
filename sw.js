/* IEM Pedidos Vendedor — SW: network-first en app para evitar JS viejo */
const CACHE = 'iem-vendedores-v2.7';
const PRECACHE = [
  './',
  './index.html',
  './config.js',
  './vendedores.css',
  './manifest.webmanifest',
  './logo-iem.png',
  './icon-192.png',
  './favicon-32.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE).catch(function () {});
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.hostname.indexOf('supabase') !== -1) return;
  if (url.hostname.indexOf('cdn') !== -1 || url.hostname.indexOf('jsdelivr') !== -1) return;

  var path = url.pathname;
  var isShell = /\\.(js|css)(\\?|$)/.test(path) || /index\\.html$/.test(path) || /vendedores\\.html$/.test(path) || path.endsWith('/');
  if (isShell && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok && url.origin === self.location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
