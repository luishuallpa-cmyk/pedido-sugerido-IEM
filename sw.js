/* IEM Ventas / Pedidos — SW v4.4 */
const SW_VERSION = '4.4';
const CACHE = 'iem-ventas-v' + SW_VERSION;
const PRECACHE = [
  './',
  './vendedores.html',
  './index.html',
  './vendedores.css',
  './app-vendedores.js',
  './config.js',
  './manifest.webmanifest',
  './logo-iem-ventas.png',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './favicon-64.png'
];

function sameOrigin(url) {
  try { return url.origin === self.location.origin; } catch (e) { return false; }
}
function isBypass(url) {
  var h = url.hostname || '';
  if (h.indexOf('supabase') !== -1) return true;
  if (h.indexOf('cdn') !== -1 || h.indexOf('unpkg') !== -1 || h.indexOf('googleapis') !== -1 || h.indexOf('gstatic') !== -1) return true;
  return false;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(PRECACHE.map(function (url) {
        return c.add(url).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (isBypass(url)) return;
  if (!sameOrigin(url)) return;

  var isShell = /\.(js|css)(\?|$)/.test(url.pathname) ||
    /index\.html$|vendedores\.html$/.test(url.pathname) ||
    url.pathname.endsWith('/');

  if (isShell) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || caches.match('./vendedores.html') || caches.match('./index.html');
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () { return cached; });
      return cached || net;
    })
  );
});
