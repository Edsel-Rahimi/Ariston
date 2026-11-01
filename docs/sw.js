/* ── D11/U4-3 — Ariston PWA service worker ──────────────────────────────────
   Installable standalone app + offline shell on GitHub Pages.

   Strategy:
   · app shell (html/css/js/icons/manifest) → precached, then stale-while-revalidate
   · navigations → network-first, offline falls back to the cached index.html
   · live data (worker API, raw.githubusercontent) → network-first with a
     cached fallback, so an offline client still shows the last snapshot.
   · everything else passes through untouched; non-GET is never intercepted.
   Fail-safe by design: every step swallows its own errors — the site works
   exactly as before when the worker is unavailable. Bump VER on each deploy. */

var VER = 'ariston-u4-3';
var SHELL = [
  './', './index.html', './assets/style.css', './assets/app.js',
  './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png',
];
var STATIC_RE = /\.(css|js|mjs|png|jpe?g|webp|svg|ico|woff2?|webmanifest)$/i;
var RUNTIME_MAX = 80;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VER).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
    }));
  }).catch(function () {}));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === VER ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }).catch(function () {}));
});

function trim(cache) {
  cache.keys().then(function (reqs) {
    if (reqs.length <= RUNTIME_MAX) return;
    return cache.delete(reqs[0]).then(function () { return trim(cache); });
  }).catch(function () {});
}

function cacheFirst(req) {
  return caches.open(VER).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) { c.put(req, res.clone()).then(function () { trim(c); }).catch(function () {}); }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

function networkFirst(req, fallbackUrl) {
  return caches.open(VER).then(function (c) {
    return fetch(req).then(function (res) {
      if (res && res.ok) { c.put(req, res.clone()).then(function () { trim(c); }).catch(function () {}); }
      return res;
    }).catch(function () {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fallbackUrl ? c.match(fallbackUrl) : Response.error();
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;
  var url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, './index.html'));
    return;
  }
  if (url.origin === self.location.origin && STATIC_RE.test(url.pathname)) {
    e.respondWith(cacheFirst(req));
    return;
  }
  /* live data + everything else: network first, cache as the offline fallback */
  e.respondWith(networkFirst(req));
});
